// Prueba específica (Etapa 3, ítem 6 de la auditoría) para el bug del
// orden del contador diario de ElevenLabs: antes, ttsDentroDeLimiteDiario()
// (que incrementa el contador como efecto secundario) se llamaba ANTES de
// revisar la caché, así que un pedido que terminaba sirviéndose desde
// caché igual consumía una unidad del límite diario. Archivo separado
// (proceso propio) porque TTS_DAILY_LIMIT/ELEVENLABS_API_KEY/etc. se leen
// una sola vez al importar server.js.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.ALLOWED_ORIGIN = "";
process.env.TURNSTILE_ENABLED = "";
process.env.ELEVENLABS_API_KEY = "clave-de-prueba";
process.env.ELEVENLABS_VOICE_ID_HOMBRE = "voz-de-prueba";
process.env.TTS_DAILY_LIMIT = "1"; // a propósito: solo 1 llamada real permitida por día

const app = (await import("../server.js")).default;

let server, baseUrl;
const fetchOriginal = global.fetch;
let llamadasAElevenLabs = 0;

before(() => new Promise((resolve) => {
  global.fetch = async (url, opts) => {
    if (!String(url).includes("elevenlabs.io")) return fetchOriginal(url, opts);
    llamadasAElevenLabs++;
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => new TextEncoder().encode("audio-falso-mp3").buffer,
      text: async () => ""
    };
  };
  server = app.listen(0, "127.0.0.1", () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

after(() => new Promise((resolve) => {
  global.fetch = fetchOriginal;
  server.close(() => resolve());
}));

function pedirTts(texto) {
  return fetchOriginal(`${baseUrl}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({ text: texto, tipo: "hombre" })
  });
}

test("primer pedido: no hay caché, llama de verdad a ElevenLabs y consume el límite diario (1/1)", async () => {
  const res = await pedirTts("Hola, este es un texto de prueba.");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-tts-cache"), "miss");
  assert.equal(llamadasAElevenLabs, 1);
});

test("mismo texto de nuevo: sirve desde caché con 200, SIN volver a llamar a ElevenLabs ni chocar con el límite ya consumido", async () => {
  const res = await pedirTts("Hola, este es un texto de prueba.");
  assert.equal(res.status, 200, "un hit de caché no debería devolver 429 aunque el límite diario ya esté en el tope");
  assert.equal(res.headers.get("x-tts-cache"), "hit");
  assert.equal(llamadasAElevenLabs, 1, "no debería haber una segunda llamada real a ElevenLabs");
});

test("texto distinto (no cacheado): ahora sí choca con el límite diario ya consumido por el primer pedido real", async () => {
  const res = await pedirTts("Un texto completamente distinto, nunca pedido antes.");
  assert.equal(res.status, 429);
  const data = await res.json();
  assert.equal(data.codigo, "limite_diario");
  assert.equal(llamadasAElevenLabs, 1, "el límite debe frenarlo antes de intentar una segunda llamada real");
});
