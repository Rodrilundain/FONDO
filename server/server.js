import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
dotenv.config();

const app = express();

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

// Rate limiting: máximo 20 pedidos por minuto por IP entre /ask y /tts,
// para evitar abuso y no quemar la cuota gratis de Groq/ElevenLabs.
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Esperá un minuto e intentá de nuevo." }
});
app.use(["/ask", "/tts"], limiter);

const MAX_QUESTION_LEN = 500;
const MAX_CONTEXT_LEN = 12000;
const MAX_TTS_LEN = 2000;

function esTextoValido(valor, maxLen) {
  return typeof valor === "string" && valor.trim().length > 0 && valor.length <= maxLen;
}

app.post("/ask", async (req, res) => {
  const { context, question } = req.body || {};

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
              "puede venir marcado como [Fragmento N]). Si usás información de un fragmento " +
              "marcado, podés citar su número entre paréntesis. Si la respuesta no está en " +
              "los fragmentos provistos, decilo claramente en vez de inventarla — no asumas " +
              "que el documento entero no la tiene, aclará que no aparece en las partes que " +
              "se te pasaron. Sé breve y claro, como si le explicaras a alguien que está " +
              "estudiando para un examen."
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

// Voces de ElevenLabs por defecto (premade, en inglés pero con buen soporte
// multilingüe). Se pueden reemplazar por cualquier voice_id de la Voice
// Library de ElevenLabs (por ejemplo una con acento en español) seteando
// ELEVENLABS_VOICE_ID_HOMBRE / ELEVENLABS_VOICE_ID_MUJER como variables de
// entorno, sin tocar código.
const VOZ_HOMBRE = process.env.ELEVENLABS_VOICE_ID_HOMBRE || "pNInz6obpgDQGcFmaJgB"; // Adam
const VOZ_MUJER = process.env.ELEVENLABS_VOICE_ID_MUJER || "21m00Tcm4TlvDq8ikWAM"; // Rachel

app.post("/tts", async (req, res) => {
  const { text, tipo } = req.body || {};
  if (!esTextoValido(text, MAX_TTS_LEN)) {
    return res.status(400).json({
      error: text && text.length > MAX_TTS_LEN
        ? `El texto es demasiado largo para generar voz (máximo ${MAX_TTS_LEN} caracteres).`
        : "Falta el texto a convertir en voz."
    });
  }
  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(400).json({ error: "El backend no tiene configurada ELEVENLABS_API_KEY." });
  }
  const voiceId = tipo === "mujer" ? VOZ_MUJER : VOZ_HOMBRE;
  try {
    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
        // (la clave NO se pega acá; se lee de ELEVENLABS_API_KEY, igual que
        // GROQ_API_KEY: en Render va en el formulario web del deploy)
        "xi-api-key": process.env.ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true
        }
      })
    });
    if (!ttsRes.ok) {
      const detalle = await ttsRes.text();
      return res.status(ttsRes.status).json({ error: detalle || "ElevenLabs no pudo generar el audio." });
    }
    res.set("Content-Type", "audio/mpeg");
    res.send(Buffer.from(await ttsRes.arrayBuffer()));
  } catch (error) {
    console.error("Error en /tts:", error.message);
    res.status(500).json({ error: "Error interno al conectar con ElevenLabs." });
  }
});

// Estado del servidor: para que el frontend sepa si está despierto y qué
// claves tiene configuradas, sin exponer las claves en sí.
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    groqConfigurado: Boolean(process.env.GROQ_API_KEY),
    elevenlabsConfigurado: Boolean(process.env.ELEVENLABS_API_KEY)
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
