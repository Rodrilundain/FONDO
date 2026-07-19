import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import crypto from "node:crypto";
import dns from "node:dns/promises";
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
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
    });
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
  const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      // (la clave NO se pega acá; se lee de ELEVENLABS_API_KEY, igual que
      // GROQ_API_KEY: en Render va en el formulario web del deploy)
      "xi-api-key": process.env.ELEVENLABS_API_KEY
    },
    body: JSON.stringify({ text, model_id: modelo, voice_settings: settings })
  });
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
  if (!ttsDentroDeLimiteDiario()) {
    return res.status(429).json({ error: "Se alcanzó el límite diario de voz IA configurado en el backend. Probá de nuevo mañana, o usá la voz del dispositivo.", codigo: "limite_diario" });
  }

  const modelo = modeloPedido || (contexto === "documento" ? MODELO_DOCUMENTO : MODELO_CHAT);
  const settings = voiceSettingsPara(modelo);
  const hash = hashTts(text, voiceId, modelo, settings);
  const cacheado = ttsCache.get(hash);
  if (cacheado) {
    res.set("Content-Type", "audio/mpeg");
    res.set("X-Tts-Cache", "hit");
    return res.send(cacheado);
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
// Límite conocido: se resuelve el DNS UNA vez para decidir si se permite,
// pero el fetch posterior no fuerza esa misma IP (Node/undici no expone
// fácil esa opción). Esto no protege contra un ataque de "DNS rebinding"
// bien armado (un dominio que resuelve distinto entre el chequeo y el
// pedido real). Para el caso de uso (compartir un link de un documento
// propio) alcanza para bloquear los intentos obvios; no se lo puede
// llamar una protección SSRF completa.
const MAX_FETCH_BYTES = 20 * 1024 * 1024; // 20 MB, igual que el límite del frontend
const limiterFetch = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados pedidos de descarga en poco tiempo. Esperá un minuto." }
});
app.use(["/fetch-document"], limiterFetch);

function ipEsPrivadaOReservada(ip) {
  if (ip.includes(":")) {
    // IPv6: loopback, link-local y ULA (fc00::/7).
    const low = ip.toLowerCase();
    return low === "::1" || low.startsWith("fe80:") || low.startsWith("fc") || low.startsWith("fd");
  }
  const partes = ip.split(".").map(Number);
  if (partes.length !== 4 || partes.some(n => Number.isNaN(n))) return true; // formato raro: mejor bloquear
  const [a, b] = partes;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // privada
  if (a === 172 && b >= 16 && b <= 31) return true; // privada
  if (a === 192 && b === 168) return true; // privada
  if (a === 169 && b === 254) return true; // link-local
  if (a === 0) return true; // "esta red"
  if (a >= 224) return true; // multicast/reservado
  return false;
}

app.post("/fetch-document", async (req, res) => {
  const { url } = req.body || {};
  if (typeof url !== "string" || !url.trim()) {
    return res.status(400).json({ error: "Falta la URL del documento." });
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: "Esa URL no parece válida." });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return res.status(400).json({ error: "Solo se admiten enlaces http:// o https://." });
  }
  if (/^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(parsed.hostname)) {
    return res.status(400).json({ error: "Esa dirección no está permitida." });
  }
  try {
    const { address } = await dns.lookup(parsed.hostname);
    if (ipEsPrivadaOReservada(address)) {
      return res.status(400).json({ error: "Esa dirección no está permitida." });
    }
  } catch {
    return res.status(400).json({ error: "No se pudo resolver ese dominio." });
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": "MedusaLee-fetch-document/1.0" }
    });
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
    res.set("X-Original-Url", parsed.toString());
    res.send(buffer);
    // No se guarda nada del contenido después de responder: no hay
    // escritura a disco ni log del cuerpo del documento.
  } catch (error) {
    console.error("Error en /fetch-document:", error.message);
    res.status(502).json({ error: "No se pudo descargar ese enlace." });
  }
});

// Estado del servidor: para que el frontend sepa si está despierto y qué
// claves tiene configuradas, sin exponer las claves en sí.
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    groqConfigurado: Boolean(process.env.GROQ_API_KEY),
    elevenlabsConfigurado: Boolean(process.env.ELEVENLABS_API_KEY),
    vozHombreConfigurada: Boolean(VOZ_HOMBRE),
    vozMujerConfigurada: Boolean(VOZ_MUJER)
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🪼 Backend de MedusaLee en puerto ${PORT}`));
