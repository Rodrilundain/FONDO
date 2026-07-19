import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSummaryForLongDocument } from "../src/services/ai/AIService.js";

function config(overrides = {}) {
  return {
    primaryProvider: "gemini",
    fallbackEnabled: true,
    requestTimeoutMs: 5000,
    chunking: { chunkSize: 300, chunkOverlap: 0, maxDocumentCharacters: 400000 },
    gemini: { apiKey: "clave-de-prueba", model: "gemini-2.5-flash-lite" },
    openrouter: { apiKey: "clave-de-prueba", model: "modelo-de-prueba" },
    ...overrides
  };
}

test("documento corto: no divide, un solo llamado al proveedor", async () => {
  let llamadas = 0;
  global.fetch = async () => {
    llamadas++;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "Resumen corto." } ] } }] }) };
  };
  const r = await generateSummaryForLongDocument({ content: "Documento corto.", options: {}, config: config() });
  assert.equal(r.success, true);
  assert.equal(llamadas, 1);
});

test("documento largo: se divide, se resume cada fragmento, y se consolida al final", async () => {
  const oracion = "Esta es una oracion de prueba con contenido variado sobre distintos temas. ";
  const documentoLargo = oracion.repeat(30); // bastante mas que chunkSize=300
  let llamadas = 0;
  const textosRecibidos = [];
  global.fetch = async (url, opts) => {
    llamadas++;
    const body = JSON.parse(opts.body);
    const textoEnviado = body.contents[0].parts[0].text;
    textosRecibidos.push(textoEnviado.slice(0, 60));
    return {
      ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: `Resumen parcial ${llamadas}.` } ] } }] })
    };
  };
  const r = await generateSummaryForLongDocument({ content: documentoLargo, options: {}, config: config() });
  assert.equal(r.success, true);
  assert.ok(llamadas > 2, "deberia haber varias llamadas (una por fragmento + una de consolidacion)");
  assert.equal(r.content, `Resumen parcial ${llamadas}.`); // la ULTIMA llamada es la de consolidacion
});

test("documento largo con paginas: la consolidacion incluye las referencias de pagina en el texto enviado", async () => {
  const bloques = [
    { pagina: 1, texto: "Contenido de la primera pagina, con suficiente longitud para ocupar un fragmento propio de este documento de prueba." },
    { pagina: 2, texto: "Contenido de la segunda pagina, tambien con longitud suficiente para su propio fragmento en este documento de prueba." },
  ];
  const documentoLargo = bloques.map(b => b.texto).join("\n");
  let llamada = 0;
  let cuerpoConsolidacion = null;
  global.fetch = async (url, opts) => {
    llamada++;
    const body = JSON.parse(opts.body);
    if (llamada === 3) cuerpoConsolidacion = body.contents[0].parts[0].text; // 2 fragmentos + 1 consolidacion
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: `Resumen ${llamada}.` } ] } }] }) };
  };
  const r = await generateSummaryForLongDocument({
    content: documentoLargo, options: {}, config: config({ chunking: { chunkSize: 50, chunkOverlap: 0, maxDocumentCharacters: 400000 } }), bloques
  });
  assert.equal(r.success, true);
  assert.match(cuerpoConsolidacion, /Página 1/);
  assert.match(cuerpoConsolidacion, /Página 2/);
});

test("si un fragmento falla, se corta y se devuelve el error real (no se inventa un resumen)", async () => {
  const oracion = "Esta es una oracion de prueba con contenido variado sobre distintos temas. ";
  const documentoLargo = oracion.repeat(30);
  let llamada = 0;
  global.fetch = async () => {
    llamada++;
    if (llamada === 2) return { ok: false, status: 503, json: async () => ({ error: { message: "Gemini caido" } }) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "ok" } ] } }] }) };
  };
  const r = await generateSummaryForLongDocument({ content: documentoLargo, options: {}, config: config({ fallbackEnabled: false }) });
  assert.equal(r.success, false);
  assert.match(r.error.message, /Gemini caido/);
});
