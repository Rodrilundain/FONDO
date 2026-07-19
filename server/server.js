import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.post("/ask", async (req, res) => {
  const { context, question } = req.body || {};
  if (!question || !context) {
    return res.status(400).json({ reply: "Falta el documento o la pregunta." });
  }
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
              "únicamente en el documento provisto como contexto. Si la respuesta no está " +
              "en el documento, decilo claramente en vez de inventarla. Sé breve y claro, " +
              "como si le explicaras a alguien que está estudiando para un examen."
          },
          {
            role: "user",
            content: `Documento:\n"""${context}"""\n\nPregunta: ${question}`
          }
        ],
        temperature: 0.3
      })
    });
    const data = await groqRes.json();
    const reply = data.choices?.[0]?.message?.content || data.error?.message || "No pude generar una respuesta.";
    res.json({ reply });
  } catch (error) {
    console.error(error);
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
  if (!text) {
    return res.status(400).json({ error: "Falta el texto a convertir en voz." });
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
    console.error(error);
    res.status(500).json({ error: "Error interno al conectar con ElevenLabs." });
  }
});

app.get("/", (_req, res) => res.send("MedusaLee backend OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🪼 Backend de MedusaLee en puerto ${PORT}`));
