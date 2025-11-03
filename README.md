import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  try {
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Sos una medusa eléctrica brillante y simpática, hablás con humor e inteligencia, y usás jerga empresarial amable."
          },
          { role: "user", content: userMessage }
        ],
        temperature: 0.9
      })
    });
    const data = await openaiRes.json();
    const reply = data.choices?.[0]?.message?.content || "No entendí bien, Rodri.";
    // color emocional básico
    const color = /feliz|bien|excelente/i.test(reply) ? "#7eff8b" :
                  /error|mal|triste/i.test(reply) ? "#ff8080" : "#7dcaff";
    res.json({ reply, color });
  } catch (error) {
    console.error(error);
    res.status(500).json({ reply: "Error interno al conectar con OpenAI", color: "#ff8080" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🪼 Servidor Medusa GPT en puerto ${PORT}`));
