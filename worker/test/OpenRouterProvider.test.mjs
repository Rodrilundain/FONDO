import { test } from "node:test";
import assert from "node:assert/strict";
import { llamarOpenRouter } from "../src/services/ai/OpenRouterProvider.js";

const RESPUESTA_OK = {
  choices: [{ message: { content: "hola" } }],
  usage: { prompt_tokens: 1, completion_tokens: 1 }
};

test("llamarOpenRouter: la clave va en el header Authorization", async () => {
  let headersUsados;
  global.fetch = async (url, opts) => {
    headersUsados = opts.headers;
    return { ok: true, json: async () => RESPUESTA_OK };
  };
  await llamarOpenRouter({ apiKey: "clave-secreta", model: "modelo-x", systemInstruction: "x", content: "y", timeoutMs: 5000 });
  assert.equal(headersUsados.Authorization, "Bearer clave-secreta");
});

test("llamarOpenRouter: sin apiKey devuelve SIN_API_KEY sin llamar a fetch", async () => {
  let seLlamoFetch = false;
  global.fetch = async () => { seLlamoFetch = true; return { ok: true, json: async () => RESPUESTA_OK }; };
  const resultado = await llamarOpenRouter({ apiKey: "", model: "modelo-x", systemInstruction: "x", content: "y", timeoutMs: 5000 });
  assert.equal(resultado.success, false);
  assert.equal(resultado.error.code, "SIN_API_KEY");
  assert.equal(seLlamoFetch, false);
});

test("llamarOpenRouter: sin modelo devuelve SIN_MODELO sin llamar a fetch", async () => {
  let seLlamoFetch = false;
  global.fetch = async () => { seLlamoFetch = true; return { ok: true, json: async () => RESPUESTA_OK }; };
  const resultado = await llamarOpenRouter({ apiKey: "clave", model: "", systemInstruction: "x", content: "y", timeoutMs: 5000 });
  assert.equal(resultado.success, false);
  assert.equal(resultado.error.code, "SIN_MODELO");
  assert.equal(seLlamoFetch, false);
});

test("llamarOpenRouter: 429 se reintenta internamente (Punto 5 de la auditoría v2) y se recupera", async () => {
  let llamadas = 0;
  global.fetch = async () => {
    llamadas++;
    if (llamadas === 1) return { ok: false, status: 429, json: async () => ({ error: { message: "rate limited" } }) };
    return { ok: true, json: async () => RESPUESTA_OK };
  };
  const resultado = await llamarOpenRouter({
    apiKey: "clave", model: "modelo-x", systemInstruction: "x", content: "y",
    timeoutMs: 5000, maxRetries: 1, retryDelayMs: 0
  });
  assert.equal(resultado.success, true);
  assert.equal(llamadas, 2);
});

test("llamarOpenRouter: 401 (clave inválida, no recuperable) NUNCA se reintenta", async () => {
  let llamadas = 0;
  global.fetch = async () => { llamadas++; return { ok: false, status: 401, json: async () => ({ error: { message: "invalid key" } }) }; };
  const resultado = await llamarOpenRouter({
    apiKey: "clave-mala", model: "modelo-x", systemInstruction: "x", content: "y",
    timeoutMs: 5000, maxRetries: 3, retryDelayMs: 0
  });
  assert.equal(resultado.success, false);
  assert.equal(resultado.error.code, "CLAVE_INVALIDA");
  assert.equal(llamadas, 1);
});

test("llamarOpenRouter: error de conexión (fetch rechaza) se reintenta y se recupera", async () => {
  let llamadas = 0;
  global.fetch = async () => {
    llamadas++;
    if (llamadas === 1) throw new Error("network down");
    return { ok: true, json: async () => RESPUESTA_OK };
  };
  const resultado = await llamarOpenRouter({
    apiKey: "clave", model: "modelo-x", systemInstruction: "x", content: "y",
    timeoutMs: 5000, maxRetries: 1, retryDelayMs: 0
  });
  assert.equal(resultado.success, true);
  assert.equal(llamadas, 2);
});

test("llamarOpenRouter: se alcanza el máximo de reintentos y se devuelve el error final como recuperable", async () => {
  let llamadas = 0;
  global.fetch = async () => { llamadas++; return { ok: false, status: 503, json: async () => ({ error: { message: "siempre caido" } }) }; };
  const resultado = await llamarOpenRouter({
    apiKey: "clave", model: "modelo-x", systemInstruction: "x", content: "y",
    timeoutMs: 5000, maxRetries: 2, retryDelayMs: 0
  });
  assert.equal(resultado.success, false);
  assert.equal(resultado.recuperable, true);
  assert.equal(llamadas, 3);
});
