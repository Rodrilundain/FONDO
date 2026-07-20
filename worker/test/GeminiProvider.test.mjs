import { test } from "node:test";
import assert from "node:assert/strict";
import { llamarGemini } from "../src/services/ai/GeminiProvider.js";

const RESPUESTA_OK = {
  candidates: [{ content: { parts: [{ text: "hola" }] } }],
  usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 }
};

test("llamarGemini: la clave va en el header x-goog-api-key, nunca en la URL", async () => {
  let urlUsada, headersUsados;
  global.fetch = async (url, opts) => {
    urlUsada = url;
    headersUsados = opts.headers;
    return { ok: true, json: async () => RESPUESTA_OK };
  };

  await llamarGemini({
    apiKey: "clave-secreta-123",
    model: "gemini-2.5-flash-lite",
    systemInstruction: "instruccion",
    content: "contenido",
    timeoutMs: 5000
  });

  assert.equal(urlUsada.includes("clave-secreta-123"), false, "la URL no debe contener la clave");
  assert.equal(urlUsada.includes("key="), false, "la URL no debe tener el parametro ?key=");
  assert.equal(headersUsados["x-goog-api-key"], "clave-secreta-123");
});

test("llamarGemini: sin apiKey devuelve SIN_API_KEY sin llamar a fetch", async () => {
  let seLlamoFetch = false;
  global.fetch = async () => { seLlamoFetch = true; return { ok: true, json: async () => RESPUESTA_OK }; };

  const resultado = await llamarGemini({
    apiKey: "",
    model: "gemini-2.5-flash-lite",
    systemInstruction: "x",
    content: "y",
    timeoutMs: 5000
  });

  assert.equal(resultado.success, false);
  assert.equal(resultado.error.code, "SIN_API_KEY");
  assert.equal(seLlamoFetch, false);
});

test("llamarGemini: 429 se reintenta internamente (Punto 5 de la auditoría v2) y se recupera", async () => {
  let llamadas = 0;
  global.fetch = async () => {
    llamadas++;
    if (llamadas === 1) return { ok: false, status: 429, json: async () => ({ error: { message: "rate limited" } }) };
    return { ok: true, json: async () => RESPUESTA_OK };
  };
  const resultado = await llamarGemini({
    apiKey: "clave", model: "gemini-2.5-flash-lite", systemInstruction: "x", content: "y",
    timeoutMs: 5000, maxRetries: 1, retryDelayMs: 0
  });
  assert.equal(resultado.success, true);
  assert.equal(llamadas, 2);
});

test("llamarGemini: 500 se reintenta internamente y se recupera", async () => {
  let llamadas = 0;
  global.fetch = async () => {
    llamadas++;
    if (llamadas === 1) return { ok: false, status: 500, json: async () => ({ error: { message: "server error" } }) };
    return { ok: true, json: async () => RESPUESTA_OK };
  };
  const resultado = await llamarGemini({
    apiKey: "clave", model: "gemini-2.5-flash-lite", systemInstruction: "x", content: "y",
    timeoutMs: 5000, maxRetries: 1, retryDelayMs: 0
  });
  assert.equal(resultado.success, true);
  assert.equal(llamadas, 2);
});

test("llamarGemini: 400 (no recuperable) NUNCA se reintenta, aunque maxRetries > 0", async () => {
  let llamadas = 0;
  global.fetch = async () => {
    llamadas++;
    return { ok: false, status: 400, json: async () => ({ error: { message: "bad request" } }) };
  };
  const resultado = await llamarGemini({
    apiKey: "clave", model: "gemini-2.5-flash-lite", systemInstruction: "x", content: "y",
    timeoutMs: 5000, maxRetries: 3, retryDelayMs: 0
  });
  assert.equal(resultado.success, false);
  assert.equal(llamadas, 1, "un 400 no deberia reintentarse nunca");
});

test("llamarGemini: se alcanza el máximo de reintentos y se devuelve el error final como recuperable", async () => {
  let llamadas = 0;
  global.fetch = async () => { llamadas++; return { ok: false, status: 503, json: async () => ({ error: { message: "siempre caido" } }) }; };
  const resultado = await llamarGemini({
    apiKey: "clave", model: "gemini-2.5-flash-lite", systemInstruction: "x", content: "y",
    timeoutMs: 5000, maxRetries: 2, retryDelayMs: 0
  });
  assert.equal(resultado.success, false);
  assert.equal(resultado.recuperable, true);
  assert.equal(llamadas, 3, "1 intento inicial + 2 reintentos");
});
