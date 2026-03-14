import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const client = new Anthropic();

app.post("/ask", async (req, res) => {
  const { context, question } = req.body;

  const systemPrompt = context
    ? `Sos una medusa eléctrica brillante y simpática llamada Medusa. Hablás con humor e inteligencia, usás jerga amigable y respondés siempre en español.
Tenés acceso al siguiente documento cargado por el usuario. Usalo para responder sus preguntas cuando sea relevante.

---DOCUMENTO---
${context.slice(0, 8000)}
---FIN DOCUMENTO---`
    : `Sos una medusa eléctrica brillante y simpática llamada Medusa. Hablás con humor e inteligencia, usás jerga amigable y respondés siempre en español. Si el usuario no cargó ningún libro o documento podés chatear libremente y sugerirle que cargue un libro desde el menú.`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: question }]
    });

    const reply = message.content[0].text;

    const color =
      /feliz|bien|excelente|perfecto|genial|increíble|maravilloso/i.test(reply)
        ? "#7eff8b"
        : /error|mal|triste|problema|falla|imposible/i.test(reply)
        ? "#ff8080"
        : "#7dcaff";

    res.json({ reply, color });
  } catch (error) {
    console.error("Error Claude API:", error.message);
    res.status(500).json({
      reply: "⚠️ Error al conectar con mi cerebro de medusa. Intentá de nuevo.",
      color: "#ff8080"
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🪼 Servidor Medusa (Claude) en http://localhost:${PORT}`)
);
