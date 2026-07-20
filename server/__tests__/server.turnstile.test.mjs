// Archivo separado (no server.integration.test.mjs) a propósito: TTS/ASK
// leen TURNSTILE_ENABLED/TURNSTILE_SECRET_KEY una sola vez al importar
// server.js, así que necesitan estar seteadas ANTES del import -- y
// node:test corre cada archivo *.test.mjs en su propio proceso, así que
// esto no pisa la configuración usada por los demás tests.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.ALLOWED_ORIGIN = "";
process.env.TURNSTILE_ENABLED = "true";
process.env.TURNSTILE_SECRET_KEY = "secreto-de-prueba";

const app = (await import("../server.js")).default;

let server, baseUrl;
const fetchOriginal = global.fetch;

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

test("Turnstile activo: pedido sin turnstileToken se rechaza con 403, sin llamar a Groq", async () => {
  let seLlamoAGroq = false;
  global.fetch = async (url, opts) => {
    if (String(url).includes("groq.com")) { seLlamoAGroq = true; return { ok: true, json: async () => ({}) }; }
    if (String(url).includes("siteverify")) return { json: async () => ({ success: false, "error-codes": ["missing-input-response"] }) };
    return fetchOriginal(url, opts);
  };
  const res = await fetchOriginal(`${baseUrl}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({ context: "doc", question: "hola" })
  });
  assert.equal(res.status, 403);
  assert.equal(seLlamoAGroq, false);
});

test("Turnstile activo: pedido con token válido pasa la verificación y llega a Groq", async () => {
  let seLlamoAGroq = false;
  global.fetch = async (url, opts) => {
    if (String(url).includes("siteverify")) return { json: async () => ({ success: true, "error-codes": [] }) };
    if (String(url).includes("groq.com")) {
      seLlamoAGroq = true;
      return { ok: true, json: async () => ({ choices: [{ message: { content: "Respuesta." } }] }) };
    }
    return fetchOriginal(url, opts);
  };
  const res = await fetchOriginal(`${baseUrl}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({ context: "doc", question: "hola", turnstileToken: "token-valido" })
  });
  assert.equal(res.status, 200);
  assert.equal(seLlamoAGroq, true);
});
