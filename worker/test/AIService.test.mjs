import { test } from "node:test";
import assert from "node:assert/strict";
import { generate } from "../src/services/ai/AIService.js";

function config(overrides = {}) {
  return {
    primaryProvider: "gemini",
    fallbackEnabled: true,
    requestTimeoutMs: 5000,
    maxRetries: 1,
    gemini: { apiKey: "clave-gemini-de-prueba", model: "gemini-2.5-flash-lite" },
    openrouter: { apiKey: "clave-openrouter-de-prueba", model: "modelo-de-prueba" },
    ...overrides
  };
}

function mockFetch(respuestas) {
  let llamada = 0;
  global.fetch = async (url) => {
    const r = respuestas[llamada++];
    if (!r) throw new Error("mockFetch: no hay mas respuestas configuradas");
    if (r.throw) throw r.throw;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body
    };
  };
}

test("Gemini responde bien: se usa Gemini, sin llamar a OpenRouter", async () => {
  mockFetch([
    { status: 200, body: { candidates: [{ content: { parts: [{ text: "Resumen generado por Gemini." }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } } }
  ]);
  const r = await generate({ task: "summary", content: "documento de prueba", options: {}, config: config() });
  assert.equal(r.success, true);
  assert.equal(r.provider, "gemini");
  assert.equal(r.content, "Resumen generado por Gemini.");
  assert.equal(r.error, null);
});

test("Gemini falla con error recuperable (503) -> cae a OpenRouter y responde bien", async () => {
  mockFetch([
    // Gemini reintenta internamente (config().maxRetries = 1) antes de
    // rendirse: hacen falta DOS 503 (intento inicial + 1 reintento) para
    // que Gemini termine de fallar y AIService recién ahí pase a OpenRouter.
    { status: 503, body: { error: { message: "Service unavailable" } } },
    { status: 503, body: { error: { message: "Service unavailable" } } },
    { status: 200, body: { choices: [{ message: { content: "Resumen generado por OpenRouter." } }], usage: { prompt_tokens: 8, completion_tokens: 4 } } }
  ]);
  const r = await generate({ task: "summary", content: "documento de prueba", options: {}, config: config() });
  assert.equal(r.success, true);
  assert.equal(r.provider, "openrouter");
  assert.equal(r.content, "Resumen generado por OpenRouter.");
});

test("Gemini y OpenRouter fallan -> error normalizado del ultimo intento", async () => {
  mockFetch([
    // Cada proveedor reintenta una vez (config().maxRetries = 1) antes de
    // rendirse: 2 respuestas por proveedor.
    { status: 503, body: { error: { message: "Gemini caido" } } },
    { status: 503, body: { error: { message: "Gemini caido" } } },
    { status: 500, body: { error: { message: "OpenRouter tambien caido" } } },
    { status: 500, body: { error: { message: "OpenRouter tambien caido" } } }
  ]);
  const r = await generate({ task: "summary", content: "documento", options: {}, config: config() });
  assert.equal(r.success, false);
  assert.equal(r.provider, "openrouter");
  assert.equal(r.content, null);
  assert.match(r.error.message, /OpenRouter tambien caido/);
});

test("Gemini sin API key (error NO recuperable) -> NO cae a OpenRouter", async () => {
  let llamadas = 0;
  global.fetch = async () => { llamadas++; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "no deberia llegar aca" } }] }) }; };
  const r = await generate({
    task: "summary", content: "documento", options: {},
    config: config({ gemini: { apiKey: "", model: "gemini-2.5-flash-lite" } })
  });
  assert.equal(r.success, false);
  assert.equal(r.provider, "gemini");
  assert.equal(r.error.code, "SIN_API_KEY");
  assert.equal(llamadas, 0, "no deberia haber llamado a fetch (ni a Gemini, que no tiene clave, ni a OpenRouter)");
});

test("fallbackEnabled=false -> aunque Gemini falle con error recuperable, no se intenta OpenRouter", async () => {
  // Dos 503 (intento inicial + 1 reintento de config().maxRetries) para
  // que Gemini termine de fallar de verdad, sin que la cola de mocks se
  // quede corta y enmascare el motivo real del fallo.
  mockFetch([
    { status: 503, body: { error: { message: "Gemini caido" } } },
    { status: 503, body: { error: { message: "Gemini caido" } } }
  ]);
  const r = await generate({ task: "summary", content: "documento", options: {}, config: config({ fallbackEnabled: false }) });
  assert.equal(r.success, false);
  assert.equal(r.provider, "gemini");
});

test("tarea invalida se rechaza sin llamar a ningun proveedor", async () => {
  let llamadas = 0;
  global.fetch = async () => { llamadas++; return { ok: true, status: 200, json: async () => ({}) }; };
  const r = await generate({ task: "tarea-que-no-existe", content: "documento", options: {}, config: config() });
  assert.equal(r.success, false);
  assert.equal(r.error.code, "TAREA_INVALIDA");
  assert.equal(llamadas, 0);
});

test("error de conexion (fetch rechaza) en Gemini -> recuperable, cae a OpenRouter", async () => {
  let llamada = 0;
  global.fetch = async () => {
    llamada++;
    if (llamada === 1) throw new Error("network error simulado");
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "OK desde OpenRouter tras fallo de red." } }] }) };
  };
  const r = await generate({ task: "qa", content: "documento", options: { question: "algo" }, config: config() });
  assert.equal(r.success, true);
  assert.equal(r.provider, "openrouter");
});

test("pregunta (task qa) incluye la pregunta del usuario en la instruccion enviada", async () => {
  let cuerpoEnviado = null;
  global.fetch = async (url, opts) => {
    cuerpoEnviado = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "respuesta" } ] } }] }) };
  };
  await generate({ task: "qa", content: "documento", options: { question: "Cuanto cuesta el producto?" }, config: config() });
  const textoInstruccion = cuerpoEnviado.systemInstruction.parts[0].text;
  assert.match(textoInstruccion, /Cuanto cuesta el producto\?/);
});
