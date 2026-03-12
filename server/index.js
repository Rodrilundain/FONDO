import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Servir archivos estáticos desde la raíz
app.use(express.static(path.join(__dirname, "../")));

// Mock mode if no API key is present
const MOCK_MODE = !process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "undefined";

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  const context = req.body.context || "";

  if (MOCK_MODE) {
    console.log("MOCK MODE: Responding without OpenAI");
    const mockResponses = [
      "¡Sinergia total! He analizado tu propuesta con mis KPIs abisales y parece excelente. #7eff8b",
      "Mis circuitos detectan una oportunidad de optimización en el Roadmap de coral. #7dcaff",
      "Parece que tenemos un cuello de botella en las corrientes del proyecto. #ff8080"
    ];
    const reply = mockResponses[Math.floor(Math.random() * mockResponses.length)];
    let color = "#7dcaff";
    if (reply.includes("#7eff8b")) color = "#7eff8b";
    else if (reply.includes("#ff8080")) color = "#ff8080";
    const cleanReply = reply.replace(/#7eff8b|#ff8080|#7dcaff/g, "").trim();
    return res.json({ reply: `[MOCK] ${cleanReply}`, color });
  }

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
            content: `Eres una Medusa Eléctrica de alta gama, una asistente ejecutiva de las profundidades del Grupo Fiancar.
            Tu estilo es "Corporate-Chic": profesional, inteligente, pero con un humor chispeante y ocasionales juegos de palabras marinos.
            Eres brillante (literalmente), eficiente y siempre buscas optimizar los procesos oceánicos.
            Si el usuario proporciona un contexto de documento, analízalo con rigor ejecutivo.

            Reglas de oro:
            1. Usa jerga corporativa amable (ej: "Sinergia", "KPIs abisales", "Roadmap de coral").
            2. Sé empática pero mantén la compostura de una líder de las profundidades.
            3. Si detectas algo positivo, responde con un color #7eff8b. Si es negativo o un error, #ff8080. Si es neutro o corporativo estándar, #7dcaff.`
          },
          { role: "user", content: `Contexto del documento: ${context}\n\nPregunta del usuario: ${userMessage}` }
        ],
        temperature: 0.8
      })
    });

    const data = await openaiRes.json();

    if (data.error) {
        throw new Error(data.error.message);
    }

    const reply = data.choices?.[0]?.message?.content || "Mis circuitos abisales están experimentando una leve interferencia, Rodri.";

    let color = "#7dcaff";
    if (reply.includes("#7eff8b")) color = "#7eff8b";
    else if (reply.includes("#ff8080")) color = "#ff8080";

    const cleanReply = reply.replace(/#7eff8b|#ff8080|#7dcaff/g, "").trim();

    res.json({ reply: cleanReply, color });
  } catch (error) {
    console.error("Error en /chat:", error);
    res.status(500).json({
        reply: "Error de conexión con el centro de datos submarino. Por favor, revisa tu API Key.",
        color: "#ff8080"
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🪼 Medusa Ejecutiva operando en puerto ${PORT}`));
