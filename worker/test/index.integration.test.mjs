import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { reiniciarCache } from "../src/cache.js";
import { reiniciarLimitador } from "../src/security.js";

function env(overrides = {}) {
  return {
    ALLOWED_ORIGIN: "https://tu-usuario.github.io",
    GEMINI_API_KEY: "clave-de-prueba",
    GEMINI_MODEL: "gemini-2.5-flash-lite",
    ...overrides
  };
}

function ctxFalso() {
  return { waitUntil: () => {} };
}

function mockFetchExitoso(textoRespuesta) {
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: textoRespuesta } ] } }] })
  });
}

test("index.js: pedido identico dos veces -> la segunda viene de cache (no llama a fetch de nuevo)", async () => {
  reiniciarCache();
  reiniciarLimitador();
  let llamadasAFetch = 0;
  global.fetch = async () => {
    llamadasAFetch++;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "Respuesta generada." } ] } }] }) };
  };

  const hacerPedido = () => worker.fetch(new Request("https://worker.test/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://tu-usuario.github.io" },
    body: JSON.stringify({ task: "summary", content: "Documento de prueba para cache." })
  }), env(), ctxFalso());

  const r1 = await hacerPedido();
  const data1 = await r1.json();
  assert.equal(data1.success, true);
  assert.equal(llamadasAFetch, 1);

  const r2 = await hacerPedido();
  const data2 = await r2.json();
  assert.equal(data2.success, true);
  assert.equal(data2.content, data1.content);
  assert.equal(llamadasAFetch, 1, "la segunda solicitud identica NO deberia haber llamado a fetch de nuevo");
});

test("index.js: pedidos con contenido distinto NO comparten cache", async () => {
  reiniciarCache();
  reiniciarLimitador();
  let llamadasAFetch = 0;
  global.fetch = async () => {
    llamadasAFetch++;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: `Respuesta ${llamadasAFetch}` } ] } }] }) };
  };

  const pedido = (texto) => worker.fetch(new Request("https://worker.test/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://tu-usuario.github.io" },
    body: JSON.stringify({ task: "summary", content: texto })
  }), env(), ctxFalso());

  await pedido("Documento uno.");
  await pedido("Documento dos, completamente distinto.");
  assert.equal(llamadasAFetch, 2);
});

test("index.js: /health responde sin exponer las claves", async () => {
  const res = await worker.fetch(new Request("https://worker.test/health"), env(), ctxFalso());
  const data = await res.json();
  assert.equal(data.status, "ok");
  assert.equal(data.geminiConfigurado, true);
  assert.equal(JSON.stringify(data).includes("clave-de-prueba"), false, "la clave real nunca deberia aparecer en la respuesta");
});

test("index.js: origen no autorizado se rechaza con 403 y sin headers CORS", async () => {
  const res = await worker.fetch(new Request("https://worker.test/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://sitio-no-autorizado.com" },
    body: JSON.stringify({ task: "summary", content: "hola" })
  }), env(), ctxFalso());
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
});

test("index.js: Content-Type invalido se rechaza con 415", async () => {
  const res = await worker.fetch(new Request("https://worker.test/api/generate", {
    method: "POST",
    headers: { "Content-Type": "text/plain", "Origin": "https://tu-usuario.github.io" },
    body: "no es json"
  }), env(), ctxFalso());
  assert.equal(res.status, 415);
});

test("index.js: ruta desconocida da 404", async () => {
  const res = await worker.fetch(new Request("https://worker.test/ruta-inventada"), env(), ctxFalso());
  assert.equal(res.status, 404);
});
