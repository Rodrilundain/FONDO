// Prueba específica del Punto 6 de la auditoría v2: deduplicación de
// solicitudes concurrentes idénticas a /tts (mapa de promesas en curso).
// Archivo separado (proceso propio) porque ELEVENLABS_API_KEY/etc. se
// leen una sola vez al importar server.js.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.ALLOWED_ORIGIN = "";
process.env.TURNSTILE_ENABLED = "";
process.env.ELEVENLABS_API_KEY = "clave-de-prueba";
process.env.ELEVENLABS_VOICE_ID_HOMBRE = "voz-de-prueba";
process.env.TTS_DAILY_LIMIT = "1000"; // alto a propósito: este archivo prueba deduplicación, no el límite diario (ver server.tts-cache-counter.test.mjs)
process.env.TTS_RATE_LIMIT_PER_MIN = "1000"; // alto a propósito: varios pedidos por test, no es lo que se está probando acá
process.env.ELEVENLABS_MAX_RETRIES = "0"; // ver server.src.net httpRetry.test.mjs para el backoff en sí; acá interesa aislar el conteo de llamadas

const app = (await import("../server.js")).default;

let server, baseUrl;
const fetchOriginal = global.fetch;
let llamadasAElevenLabs = 0;

function audioFalsoValido() {
  return new TextEncoder().encode("audio-falso-mp3-".repeat(10)).buffer; // > TTS_MIN_BYTES_VALIDOS
}

before(() => new Promise((resolve) => {
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

test("ELEVENLABS_MAX_RETRIES=\"0\" se respeta de verdad (bug real encontrado: 0 es falsy, Number(x) || N lo pisaba con el default)", async () => {
  llamadasAElevenLabs = 0;
  global.fetch = async (url, opts) => {
    if (!String(url).includes("elevenlabs.io")) return fetchOriginal(url, opts);
    llamadasAElevenLabs++;
    return { ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0), text: async () => "Service unavailable" };
  };
  const res = await pedirTts("Texto único para probar ELEVENLABS_MAX_RETRIES=0.");
  assert.equal(res.status, 503);
  assert.equal(llamadasAElevenLabs, 1, "con ELEVENLABS_MAX_RETRIES=\"0\" no debería haber NINGÚN reintento interno de httpRetry.js");
});

test("dos pedidos idénticos simultáneos generan una sola llamada real a ElevenLabs", async () => {
  llamadasAElevenLabs = 0;
  global.fetch = async (url, opts) => {
    if (!String(url).includes("elevenlabs.io")) return fetchOriginal(url, opts);
    llamadasAElevenLabs++;
    // Demora artificial: asegura que ambos pedidos estén "en vuelo" al
    // mismo tiempo antes de que cualquiera de los dos termine.
    await new Promise(r => setTimeout(r, 80));
    return { ok: true, status: 200, arrayBuffer: async () => audioFalsoValido(), text: async () => "" };
  };

  const [r1, r2] = await Promise.all([
    pedirTts("Texto idéntico para deduplicar."),
    pedirTts("Texto idéntico para deduplicar.")
  ]);

  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(llamadasAElevenLabs, 1, "dos pedidos idénticos simultáneos no deberían generar dos llamadas reales");

  const cacheHeaders = [r1.headers.get("x-tts-cache"), r2.headers.get("x-tts-cache")];
  assert.ok(cacheHeaders.includes("miss"), "al menos uno debería ser la generación real (miss)");

  const dedupeHeaders = [r1.headers.get("x-tts-dedupe"), r2.headers.get("x-tts-dedupe")];
  assert.ok(dedupeHeaders.includes("si"), "el pedido que se enganchó a la promesa en curso debería marcarse");
});

test("pedidos con distinto texto en simultáneo SÍ generan llamadas reales separadas", async () => {
  llamadasAElevenLabs = 0;
  global.fetch = async (url, opts) => {
    if (!String(url).includes("elevenlabs.io")) return fetchOriginal(url, opts);
    llamadasAElevenLabs++;
    await new Promise(r => setTimeout(r, 30));
    return { ok: true, status: 200, arrayBuffer: async () => audioFalsoValido(), text: async () => "" };
  };

  const [r1, r2] = await Promise.all([
    pedirTts("Un texto distinto A."),
    pedirTts("Un texto distinto B, no relacionado.")
  ]);

  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(llamadasAElevenLabs, 2, "textos distintos no deberían deduplicarse entre sí");
});

test("si la generación real falla, todos los pedidos enganchados reciben el error (no se cachea nada)", async () => {
  llamadasAElevenLabs = 0;
  global.fetch = async (url, opts) => {
    if (!String(url).includes("elevenlabs.io")) return fetchOriginal(url, opts);
    llamadasAElevenLabs++;
    await new Promise(r => setTimeout(r, 50));
    return { ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0), text: async () => "Service unavailable" };
  };

  const [r1, r2] = await Promise.all([
    pedirTts("Texto que va a fallar en ElevenLabs."),
    pedirTts("Texto que va a fallar en ElevenLabs.")
  ]);

  assert.equal(r1.status, 503);
  assert.equal(r2.status, 503);
  // ELEVENLABS_MODEL_CHAT no está configurada en este test, así que el
  // modelo pedido y el de respaldo son el mismo string -- no hay un
  // segundo intento con "otro" modelo. Lo que sí se prueba acá es que
  // los DOS pedidos concurrentes comparten un único disparo real
  // (deduplicación), no dos.
  assert.equal(llamadasAElevenLabs, 1, "dos pedidos idénticos en simultáneo, incluso si el resultado es un error, deberían compartir un único disparo real");

  // Un tercer pedido idéntico, ya con la generación anterior terminada
  // (y fallada), debería intentar de nuevo -- no debería haber quedado
  // nada cacheado de un error.
  const r3 = await pedirTts("Texto que va a fallar en ElevenLabs.");
  assert.equal(r3.status, 503);
  assert.equal(llamadasAElevenLabs, 2, "un error nunca debería quedar cacheado: el pedido siguiente vuelve a intentar de verdad");
});

test("audio devuelto demasiado chico (inválido) no se cachea ni se sirve como si fuera bueno", async () => {
  llamadasAElevenLabs = 0;
  global.fetch = async (url, opts) => {
    if (!String(url).includes("elevenlabs.io")) return fetchOriginal(url, opts);
    llamadasAElevenLabs++;
    return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode("x").buffer, text: async () => "" };
  };

  const r1 = await pedirTts("Texto con audio invalido de la respuesta.");
  assert.equal(r1.status, 502);

  const r2 = await pedirTts("Texto con audio invalido de la respuesta.");
  assert.equal(r2.status, 502);
  assert.equal(llamadasAElevenLabs, 2, "sin caché de un audio inválido, el segundo pedido (secuencial, no concurrente) vuelve a intentar de verdad");
});
