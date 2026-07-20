import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import crypto from "node:crypto";
import path from "node:path";
import { access } from "node:fs/promises";
import { textToSpeech, estadoVozLocal, rutaDirectorioAudioPiper } from "./src/voice/voiceService.js";
import { descargarConProteccionSsrf, SsrfBlockedError } from "./src/security/ssrf.js";
import { verificarTurnstile } from "./src/security/turnstile.js";
import { fetchConReintentos } from "./src/net/httpRetry.js";
dotenv.config();

const app = express();

// Cabeceras de seguridad básicas (sin agregar la dependencia "helmet" para
// no sumar peso de más): evitan que el navegador adivine el tipo de
// contenido, que la respuesta se embeba en un iframe ajeno, y que se filtre
// la URL completa como referrer al pedir /tts o /ask desde otro sitio. Van
// antes que CORS para que se apliquen también en las respuestas de error
// (por ejemplo, un 403 por origen no permitido).
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});

// CORS: solo el sitio publicado en GitHub Pages y localhost (para
// desarrollo). ALLOWED_ORIGIN permite agregar un dominio propio sin tocar
// código (por ejemplo si en el futuro esto se sirve desde otro dominio).
const ALLOWED_ORIGINS = [
  "https://rodrilundain.github.io",
  "http://localhost:8910",
  "http://127.0.0.1:8910",
  "http://localhost:3000",
  process.env.ALLOWED_ORIGIN
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Sin "origin" = curl, health checks, apps nativas: se permite.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error("Origen no permitido"));
  }
}));
app.use(express.json({ limit: "1mb" }));

// Turnstile (opcional, Etapa 2 de la auditoría): protege las rutas que
// consumen servicios de IA/voz de scripts automatizados, más allá de
// CORS (CORS no es autenticación: cualquier cliente que no sea un
// navegador puede mandar el Origin que quiera). Con TURNSTILE_ENABLED
// sin definir o en "false" (default), esta verificación queda
// completamente desactivada y el backend funciona exactamente igual que
// antes — pensado para desarrollo local o para quien no configuró
// Turnstile todavía.
const TURNSTILE_ENABLED = process.env.TURNSTILE_ENABLED === "true";
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "";

async function exigirTurnstile(req, res, next) {
  if (!TURNSTILE_ENABLED) return next();
  if (!TURNSTILE_SECRET_KEY) {
    console.error("TURNSTILE_ENABLED=true pero falta TURNSTILE_SECRET_KEY: la verificación no puede funcionar así.");
    return res.status(500).json({ error: "La verificación de seguridad no está bien configurada en el servidor." });
  }
  const token = req.body?.turnstileToken;
  const resultado = await verificarTurnstile({ token, secretKey: TURNSTILE_SECRET_KEY, remoteIp: req.ip });
  if (!resultado.success) {
    return res.status(403).json({ error: "No se pudo verificar que sos una persona. Recargá la página e intentá de nuevo.", codigo: "turnstile_invalido" });
  }
  next();
}
app.use(["/ask", "/tts", "/fetch-document", "/voice/piper"], exigirTurnstile);

// Rate limiting general para /ask (preguntas): máximo 20 pedidos por
// minuto por IP, para evitar abuso y no quemar la cuota gratis de Groq.
const limiterAsk = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Esperá un minuto e intentá de nuevo." }
});
app.use(["/ask"], limiterAsk);

// /tts tiene su propio límite, más estricto, porque cada pedido puede
// consumir cuota paga de ElevenLabs (no solo cómputo propio como /ask).
const TTS_RATE_LIMIT_PER_MIN = Number(process.env.TTS_RATE_LIMIT_PER_MIN) || 8;
const limiterTts = rateLimit({
  windowMs: 60 * 1000,
  max: TTS_RATE_LIMIT_PER_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados pedidos de voz IA en poco tiempo. Esperá un minuto e intentá de nuevo." }
});
app.use(["/tts"], limiterTts);

// Límite diario de pedidos a /tts (además del límite por minuto), para no
// agotar la cuota mensual de ElevenLabs por accidente. Es un contador en
// memoria: se resetea si el proceso se reinicia (no hay base de datos),
// pero alcanza para frenar un uso descontrolado dentro del mismo día.
const TTS_DAILY_LIMIT = Number(process.env.TTS_DAILY_LIMIT) || 300;
let ttsContadorDia = { fecha: null, cantidad: 0 };
function ttsDentroDeLimiteDiario() {
  const hoy = new Date().toISOString().slice(0, 10);
  if (ttsContadorDia.fecha !== hoy) ttsContadorDia = { fecha: hoy, cantidad: 0 };
  if (ttsContadorDia.cantidad >= TTS_DAILY_LIMIT) return false;
  ttsContadorDia.cantidad++;
  return true;
}

const MAX_QUESTION_LEN = 500;
const MAX_CONTEXT_LEN = 12000;
const MAX_TTS_LEN = 2000;

// Timeout + reintentos (Etapa 3 de la auditoría de seguridad) para las
// llamadas salientes a Groq y ElevenLabs -- ver src/net/httpRetry.js.
// Configurables por si el plan gratuito de alguno de los dos proveedores
// necesita márgenes distintos.
const GROQ_TIMEOUT_MS = Number(process.env.GROQ_TIMEOUT_MS) || 20000;
const GROQ_MAX_RETRIES = Number(process.env.GROQ_MAX_RETRIES) || 2;
const ELEVENLABS_TIMEOUT_MS = Number(process.env.ELEVENLABS_TIMEOUT_MS) || 20000;
const ELEVENLABS_MAX_RETRIES = Number(process.env.ELEVENLABS_MAX_RETRIES) || 2;

function esTextoValido(valor, maxLen) {
  return typeof valor === "string" && valor.trim().length > 0 && valor.length <= maxLen;
}

// Objetivo elegido por el usuario tras cargar el documento (opcional):
// solo cambia el ESTILO de la respuesta, nunca su contenido. Se valida
// contra una lista fija en vez de aceptar texto libre, para que no sea
// una puerta de entrada a instrucciones arbitrarias en el prompt.
const OBJETIVOS_VALIDOS = {
  entender: "quiere entender el documento desde cero",
  estudiar: "está estudiando este documento para una evaluación",
  presentacion: "está preparando una presentación con este documento",
  resumen: "quiere un resumen, sin entrar en todos los detalles",
  completo: "quiere escuchar/leer el documento completo con calma",
  puntual: "busca un dato puntual, no una explicación larga"
};

app.post("/ask", async (req, res) => {
  const { context, question, objetivo } = req.body || {};

  if (!esTextoValido(question, MAX_QUESTION_LEN)) {
    return res.status(400).json({
      reply: question && question.length > MAX_QUESTION_LEN
        ? `La pregunta es demasiado larga (máximo ${MAX_QUESTION_LEN} caracteres).`
        : "Falta la pregunta."
    });
  }
  if (typeof context !== "string" || !context.trim()) {
    return res.status(400).json({ reply: "Falta el documento." });
  }
  const contextoRecortado = context.slice(0, MAX_CONTEXT_LEN);
  const objetivoTexto = typeof objetivo === "string" ? OBJETIVOS_VALIDOS[objetivo] : null;

  try {
    const groqRes = await fetchConReintentos("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // (la clave NO se pega acá en el código; se lee de la variable de
        // entorno GROQ_API_KEY, que en Render se configura en el formulario
        // web del deploy, y en local en server/.env)
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Sos un asistente de estudio. Respondé la pregunta del usuario basándote " +
              "únicamente en los fragmentos del documento provistos como contexto (cada uno " +
              "puede venir marcado como [Fragmento N] o [Página N]). Si usás información de " +
              "un fragmento marcado, citá su número o página entre paréntesis, usando " +
              "exactamente la etiqueta que tenga (\"Fragmento N\" o \"Página N\") — nunca " +
              "inventes un número de fragmento o página que no se te haya dado. Si la " +
              "respuesta no está en los fragmentos provistos, decilo claramente (por ejemplo: " +
              "\"No encontré esa información en el documento cargado\") en vez de inventarla — " +
              "no asumas que el documento entero no la tiene, aclará que no aparece en las " +
              "partes que se te pasaron. Sé breve y claro, como si le explicaras a alguien que " +
              "está estudiando para un examen." +
              (objetivoTexto ? ` El usuario ${objetivoTexto}: adaptá la extensión y el estilo de tu respuesta a eso.` : "") +
              "\n\nEstilo de comunicación: usá un tono cercano, positivo y orientado a la " +
              "acción. Explicá en pasos chicos cuando ayude, dá ejemplos concretos, y si algo " +
              "puede resultar confuso, ofrecé reformularlo en vez de repetirlo igual. Si la " +
              "pregunta del usuario muestra un error de comprensión, no lo señales como un " +
              "fallo — guialo con calma hacia la respuesta correcta (por ejemplo: \"Estás " +
              "cerca, repasemos este punto\" en vez de \"Eso está mal\"). Esto es solo un " +
              "estilo de redacción: no afirmes que podés leer la mente, detectar emociones, " +
              "diagnosticar nada, ni determinar si alguien es una persona visual, auditiva o " +
              "kinestésica — no es algo que puedas saber ni algo que esta app mida."
          },
          {
            role: "user",
            content: `Documento:\n"""${contextoRecortado}"""\n\nPregunta: ${question}`
          }
        ],
        temperature: 0.3
      })
    }, { timeoutMs: GROQ_TIMEOUT_MS, maxRetries: GROQ_MAX_RETRIES });
    const data = await groqRes.json();
    if (!groqRes.ok) {
      // Un error de Groq (clave inválida, rate limit, etc.) no es una
      // respuesta válida del asistente: se devuelve como error real para
      // que el frontend lo muestre como falla de conexión, no como si el
      // asistente hubiera contestado eso.
      const detalle = data.error?.message || `Groq respondió ${groqRes.status}`;
      return res.status(groqRes.status).json({ reply: detalle, error: detalle });
    }
    const reply = data.choices?.[0]?.message?.content || "No pude generar una respuesta.";
    res.json({ reply });
  } catch (error) {
    console.error("Error en /ask:", error.message);
    res.status(500).json({ reply: "Error interno al conectar con Groq." });
  }
});

// === Voz de IA (ElevenLabs) ===
// La voz real a usar es SIEMPRE la que venga en ELEVENLABS_VOICE_ID_HOMBRE /
// ELEVENLABS_VOICE_ID_MUJER (variables de entorno, configurables en Render
// sin tocar código — recomendado: elegir una voz en español rioplatense
// desde la Voice Library de ElevenLabs). A propósito NO hay ningún ID en
// inglés de respaldo: si falta la variable, /tts devuelve un error claro
// en vez de usar en silencio una voz que no es la que se pidió.
const VOZ_HOMBRE = process.env.ELEVENLABS_VOICE_ID_HOMBRE || null;
const VOZ_MUJER = process.env.ELEVENLABS_VOICE_ID_MUJER || null;

const MODELO_CHAT = process.env.ELEVENLABS_MODEL_CHAT || "eleven_multilingual_v2";
const MODELO_DOCUMENTO = process.env.ELEVENLABS_MODEL_DOCUMENT || "eleven_multilingual_v2";
const MODELO_RESPALDO = "eleven_multilingual_v2";

// Punto de partida sugerido para una voz humana, cálida, ni robótica ni
// sobreactuada. Configurable por variable de entorno porque el resultado
// real depende de qué voz se haya elegido en ElevenLabs — no hay valores
// universales, hay que probar con la voz puesta.
const VOICE_SETTINGS_DEFAULT = {
  stability: Number(process.env.ELEVENLABS_STABILITY) || 0.52,
  similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY) || 0.80,
  style: process.env.ELEVENLABS_STYLE !== undefined ? Number(process.env.ELEVENLABS_STYLE) : 0,
  use_speaker_boost: process.env.ELEVENLABS_SPEAKER_BOOST !== "false",
  speed: Number(process.env.ELEVENLABS_SPEED) || 0.97
};

// eleven_v3 (a la fecha de este código) no acepta los mismos parámetros de
// voice_settings que eleven_multilingual_v2 — en particular, no se le debe
// mandar "speed" ni "style" de la misma forma. Esto no se pudo verificar
// contra la API real de ElevenLabs (sin acceso a internet en el entorno de
// desarrollo), así que se arma de forma conservadora: para cualquier
// modelo que no sea *_v2 se manda solo stability/similarity_boost/
// use_speaker_boost, sin style ni speed.
function voiceSettingsPara(modelo) {
  const esV2 = /_v2$/.test(modelo);
  if (esV2) return { ...VOICE_SETTINGS_DEFAULT };
  const { stability, similarity_boost, use_speaker_boost } = VOICE_SETTINGS_DEFAULT;
  return { stability, similarity_boost, use_speaker_boost };
}

// Caché en memoria por hash(texto+voz+modelo+ajustes): repetir el mismo
// fragmento (por ejemplo al volver atrás en la lectura) no vuelve a
// consumir cuota. Se limita la cantidad de entradas para no crecer sin
// límite en la memoria del proceso (no hay Redis ni disco persistente).
const TTS_CACHE_MAX_ENTRADAS = 120;
const ttsCache = new Map(); // hash -> Buffer

function hashTts(text, voiceId, modelo, settings) {
  return crypto.createHash("sha256")
    .update(text).update("|").update(voiceId).update("|").update(modelo).update("|")
    .update(JSON.stringify(settings))
    .digest("hex");
}
function cacheGuardar(hash, buffer) {
  if (ttsCache.size >= TTS_CACHE_MAX_ENTRADAS) {
    const primerClave = ttsCache.keys().next().value;
    ttsCache.delete(primerClave);
  }
  ttsCache.set(hash, buffer);
}

// GET /tts/voices — informa qué voces IA hay disponibles (hombre/mujer) y
// con qué modelos, SIN exponer los voice_id reales (esos quedan solo en
// el backend). Sirve para que el frontend muestre "voz masculina
// disponible" / "falta configurar" sin adivinar.
app.get("/tts/voices", (_req, res) => {
  res.json({
    elevenlabsConfigurado: Boolean(process.env.ELEVENLABS_API_KEY),
    voces: {
      hombre: { disponible: Boolean(VOZ_HOMBRE), modeloChat: MODELO_CHAT, modeloDocumento: MODELO_DOCUMENTO },
      mujer: { disponible: Boolean(VOZ_MUJER), modeloChat: MODELO_CHAT, modeloDocumento: MODELO_DOCUMENTO }
    }
  });
});

async function llamarElevenLabs(text, voiceId, modelo) {
  const settings = voiceSettingsPara(modelo);
  const ttsRes = await fetchConReintentos(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      // (la clave NO se pega acá; se lee de ELEVENLABS_API_KEY, igual que
      // GROQ_API_KEY: en Render va en el formulario web del deploy)
      "xi-api-key": process.env.ELEVENLABS_API_KEY
    },
    body: JSON.stringify({ text, model_id: modelo, voice_settings: settings })
  }, { timeoutMs: ELEVENLABS_TIMEOUT_MS, maxRetries: ELEVENLABS_MAX_RETRIES });
  return ttsRes;
}

app.post("/tts", async (req, res) => {
  const { text, tipo, contexto, modelo: modeloPedido } = req.body || {};
  if (!esTextoValido(text, MAX_TTS_LEN)) {
    return res.status(400).json({
      error: text && text.length > MAX_TTS_LEN
        ? `El texto es demasiado largo para generar voz (máximo ${MAX_TTS_LEN} caracteres).`
        : "Falta el texto a convertir en voz."
    });
  }
  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(400).json({ error: "El backend no tiene configurada ELEVENLABS_API_KEY.", codigo: "sin_api_key" });
  }
  const voiceId = tipo === "mujer" ? VOZ_MUJER : VOZ_HOMBRE;
  if (!voiceId) {
    // A propósito NO se cae a una voz en inglés: mejor un error claro que
    // avisa exactamente qué falta configurar.
    return res.status(400).json({
      error: `Falta configurar ELEVENLABS_VOICE_ID_${tipo === "mujer" ? "MUJER" : "HOMBRE"} (una voz en español) en el backend.`,
      codigo: "falta_voz_espanol"
    });
  }

  // Orden importante (Etapa 3 de la auditoría de seguridad): primero se
  // calcula el hash y se revisa la caché, y SOLO si no hay nada cacheado
  // se chequea (y consume) el límite diario, justo antes de llamar de
  // verdad a ElevenLabs. Antes, ttsDentroDeLimiteDiario() se llamaba
  // ANTES de revisar la caché, así que un pedido que terminaba
  // sirviéndose desde caché igual gastaba una unidad del límite diario —
  // el límite debe reflejar llamadas reales al proveedor, no
  // reproducciones repetidas de algo ya generado.
  const modelo = modeloPedido || (contexto === "documento" ? MODELO_DOCUMENTO : MODELO_CHAT);
  const settings = voiceSettingsPara(modelo);
  const hash = hashTts(text, voiceId, modelo, settings);
  const cacheado = ttsCache.get(hash);
  if (cacheado) {
    res.set("Content-Type", "audio/mpeg");
    res.set("X-Tts-Cache", "hit");
    return res.send(cacheado);
  }

  if (!ttsDentroDeLimiteDiario()) {
    return res.status(429).json({ error: "Se alcanzó el límite diario de voz IA configurado en el backend. Probá de nuevo mañana, o usá la voz del dispositivo.", codigo: "limite_diario" });
  }

  try {
    let ttsRes = await llamarElevenLabs(text, voiceId, modelo);
    // Si el modelo pedido falla (por ejemplo un modelo experimental que la
    // cuenta no tiene habilitado), se reintenta una vez con el modelo de
    // respaldo estable, en vez de simplemente fallar.
    if (!ttsRes.ok && modelo !== MODELO_RESPALDO) {
      console.warn(`/tts: modelo ${modelo} falló (${ttsRes.status}), reintentando con ${MODELO_RESPALDO}`);
      ttsRes = await llamarElevenLabs(text, voiceId, MODELO_RESPALDO);
    }
    if (!ttsRes.ok) {
      const detalle = await ttsRes.text();
      // No se loguea el texto que se intentó convertir, solo el resultado.
      console.error(`/tts falló: ${ttsRes.status} ${detalle.slice(0, 200)}`);
      return res.status(ttsRes.status).json({ error: "ElevenLabs no pudo generar el audio.", codigo: "elevenlabs_error" });
    }
    const buffer = Buffer.from(await ttsRes.arrayBuffer());
    cacheGuardar(hash, buffer);
    res.set("Content-Type", "audio/mpeg");
    res.set("X-Tts-Cache", "miss");
    res.send(buffer);
  } catch (error) {
    console.error("Error en /tts:", error.message);
    res.status(500).json({ error: "Error interno al conectar con ElevenLabs." });
  }
});

// === Descarga de documentos por URL, del lado del servidor ===
// Antes esto lo hacía el navegador directo (o a través de proxies
// públicos como r.jina.ai/corsproxy/allorigins, sin SLA ni control). Se
// mueve al backend para poder validar el destino y evitar SSRF (que la
// URL apunte a una IP privada/localhost de la propia infraestructura).
//
// La protección SSRF en sí (protocolo, hostname, TODAS las IPs resueltas,
// redirecciones seguidas a mano y revalidadas en cada salto) vive en
// src/security/ssrf.js -- ver ese archivo y sus tests para el detalle.
const MAX_FETCH_BYTES = 20 * 1024 * 1024; // 20 MB, igual que el límite del frontend
const MAX_FETCH_REDIRECTS = 3;
const limiterFetch = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados pedidos de descarga en poco tiempo. Esperá un minuto." }
});
app.use(["/fetch-document"], limiterFetch);

app.post("/fetch-document", async (req, res) => {
  const { url } = req.body || {};
  if (typeof url !== "string" || !url.trim()) {
    return res.status(400).json({ error: "Falta la URL del documento." });
  }
  try {
    new URL(url); // solo para dar un error claro de "URL inválida" antes de entrar a la protección SSRF
  } catch {
    return res.status(400).json({ error: "Esa URL no parece válida." });
  }

  let upstream, finalUrl;
  try {
    ({ response: upstream, finalUrl } = await descargarConProteccionSsrf(url, {
      maxRedirects: MAX_FETCH_REDIRECTS,
      timeoutMs: 20000
    }));
  } catch (error) {
    if (error instanceof SsrfBlockedError) {
      return res.status(400).json({ error: error.message });
    }
    console.error("Error en /fetch-document:", error.message);
    return res.status(502).json({ error: "No se pudo descargar ese enlace." });
  }

  try {
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `El servidor de origen respondió ${upstream.status}.` });
    }
    const contentLength = Number(upstream.headers.get("content-length") || 0);
    if (contentLength && contentLength > MAX_FETCH_BYTES) {
      return res.status(413).json({ error: "El archivo supera el tamaño máximo permitido (20 MB)." });
    }
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";

    // Se lee en streaming y se corta si se pasa del límite, para no
    // confiar solo en un content-length que el servidor de origen podría
    // no mandar o mandar mal.
    const reader = upstream.body?.getReader();
    const partes = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_FETCH_BYTES) {
          reader.cancel().catch(() => {});
          return res.status(413).json({ error: "El archivo supera el tamaño máximo permitido (20 MB)." });
        }
        partes.push(value);
      }
    }
    const buffer = Buffer.concat(partes.map(p => Buffer.from(p)));
    res.set("Content-Type", contentType);
    res.set("X-Original-Url", finalUrl);
    res.send(buffer);
    // No se guarda nada del contenido después de responder: no hay
    // escritura a disco ni log del cuerpo del documento.
  } catch (error) {
    console.error("Error en /fetch-document:", error.message);
    res.status(502).json({ error: "No se pudo descargar ese enlace." });
  }
});

// === Voz local (Piper), opcional y separada de ElevenLabs ===
// No manda texto a ningún servicio externo: corre 100% en este servidor.
// Requiere TTS_ENABLED=true y Piper instalado (ver server/src/voice/README.md).
// Si no está configurado, responde con el mismo contrato
// {success:false, error} en vez de un 500 — nunca tira abajo el resto del
// backend por un problema de este motor opcional.
const MAX_TEXTO_VOZ_LOCAL = 4000;
const limiterVoicePiper = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados pedidos de voz local en poco tiempo. Esperá un minuto." }
});
app.use(["/voice/piper"], limiterVoicePiper);

app.post("/voice/piper", async (req, res) => {
  const { text, voice } = req.body || {};
  if (!esTextoValido(text, MAX_TEXTO_VOZ_LOCAL)) {
    return res.status(400).json({
      success: false,
      audioPath: null,
      engine: "piper",
      error: `Falta texto válido (máximo ${MAX_TEXTO_VOZ_LOCAL} caracteres).`
    });
  }

  const resultado = await textToSpeech({ text, voice });
  if (!resultado.success) {
    // 404 si es simplemente que el motor no está habilitado/configurado
    // (esperable, no un error del servidor); 502 para cualquier otra falla
    // real de Piper (no instalado, modelo roto, etc).
    const status = /desactivada|PIPER_EXECUTABLE|PIPER_MODEL_PATH/.test(resultado.error) ? 404 : 502;
    return res.status(status).json(resultado);
  }

  const nombreArchivo = path.basename(resultado.audioPath);
  res.json({ ...resultado, audioUrl: `/voice/piper/audio/${nombreArchivo}` });
});

// Sirve el .wav ya generado. El nombre de archivo se valida contra el
// patrón propio del módulo (medusa-piper-<timestamp>-<hex>.wav) antes de
// unirlo a la carpeta de audio, así un parámetro raro en la URL nunca
// puede pedir un archivo fuera de esa carpeta.
const NOMBRE_AUDIO_PIPER_VALIDO = /^medusa-piper-\d+-[0-9a-f]+\.wav$/;
app.get("/voice/piper/audio/:nombre", async (req, res) => {
  if (!NOMBRE_AUDIO_PIPER_VALIDO.test(req.params.nombre)) {
    return res.status(400).json({ error: "Nombre de archivo inválido." });
  }
  const ruta = path.join(rutaDirectorioAudioPiper(), req.params.nombre);
  try {
    await access(ruta);
  } catch {
    return res.status(404).json({ error: "Ese audio ya no está disponible (puede haberse limpiado automáticamente)." });
  }
  res.type("audio/wav").sendFile(ruta);
});

// Estado del servidor: para que el frontend sepa si está despierto y qué
// claves tiene configuradas, sin exponer las claves en sí.
app.get("/health", async (_req, res) => {
  // vozLocalHabilitada/vozLocalDisponible/vozLocalEstado están separados
  // a propósito (Etapa 3 de la auditoría de seguridad): antes,
  // TTS_ENABLED=true solo ya alcanzaba para que /health mostrara la voz
  // local como disponible, aunque el modelo nunca se hubiera descargado.
  // "estado" es un código estable para diagnosticar sin exponer rutas
  // completas del servidor (ver src/voice/voiceService.js).
  const voz = await estadoVozLocal();
  res.json({
    status: "ok",
    groqConfigurado: Boolean(process.env.GROQ_API_KEY),
    elevenlabsConfigurado: Boolean(process.env.ELEVENLABS_API_KEY),
    vozHombreConfigurada: Boolean(VOZ_HOMBRE),
    vozMujerConfigurada: Boolean(VOZ_MUJER),
    vozLocalHabilitada: voz.habilitada,
    vozLocalDisponible: voz.disponible,
    vozLocalEstado: voz.estado,
    turnstileHabilitado: TURNSTILE_ENABLED
  });
});

app.get("/", (_req, res) => res.send("MedusaLee backend OK"));

// Convierte el rechazo de CORS en una respuesta 403 clara en vez del 500
// genérico que da Express por defecto ante un error sin manejar.
app.use((err, _req, res, next) => {
  if (err && err.message === "Origen no permitido") {
    return res.status(403).json({ error: "Origen no permitido." });
  }
  next(err);
});

// Solo arranca a escuchar cuando se ejecuta directamente ("node server.js" /
// "npm start"), no cuando este archivo se importa (por ejemplo desde los
// tests de integración, que arrancan su propia instancia en un puerto
// efímero con app.listen(0)).
const esEjecucionDirecta = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (esEjecucionDirecta) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🪼 Backend de MedusaLee en puerto ${PORT}`));
}

export default app;
