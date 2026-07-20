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
