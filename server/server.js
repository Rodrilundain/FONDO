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

app.get("/", (_req, res) => res.send("Medusa Inteligente backend OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🪼 Backend de Medusa en puerto ${PORT}`));
