import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const OPENAI_API_KEY = "TU_API_KEY_DE_OPENAI"; // ⚠️ poné tu key aquí

app.post("/ask", async (req, res) => {
  try {
    const { context, question } = req.body;
    const prompt = `
Sos una inteligencia que responde preguntas en base a un documento.
Documento:
${context}

Pregunta: ${question}
Respuesta breve, profesional y clara:`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
        temperature: 0.7
      })
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "No se obtuvo respuesta.";

    res.json({ reply });
  } catch (error) {
    console.error(error);
    res.status(500).json({ reply: "Error al contactar ChatGPT." });
  }
});

app.listen(3000, () => console.log("Servidor activo en http://localhost:3000"));
