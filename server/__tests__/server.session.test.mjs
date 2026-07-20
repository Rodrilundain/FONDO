// Archivo separado (no server.integration.test.mjs / server.ratelimit.test.mjs)
// a propósito: necesita su propia instancia de servidor con contadores de
// rate limit limpios, y algunos tests fijan ASK_MAX_CHARACTERS_POR_MINUTO /
// TTS_MAX_CHARACTERS_POR_MINUTO antes del import (Etapa 3 / Punto 3 de la
// auditoría v2 -- sesión anónima firmada + límite de caracteres).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.ALLOWED_ORIGIN = "";
process.env.TURNSTILE_ENABLED = "";
process.env.ASK_MAX_CHARACTERS_POR_MINUTO = "500";
process.env.TTS_MAX_CHARACTERS_POR_MINUTO = "300";

const app = (await import("../server.js")).default;

let server, baseUrl;

before(() => new Promise((resolve) => {
  server = app.listen(0, "127.0.0.1", () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

after(() => new Promise((resolve) => server.close(() => resolve())));

function pedidoAsk(headers = {}, body = {}) {
  return fetch(`${baseUrl}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000", ...headers },
    body: JSON.stringify(body)
  });
}

test("GET /session devuelve un token con forma <valor>.<firma>", async () => {
  const res = await fetch(`${baseUrl}/session`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(typeof data.session, "string");
  const partes = data.session.split(".");
  assert.equal(partes.length, 2);
  assert.ok(partes[0].length > 0 && partes[1].length > 0);
});

test("dos sesiones firmadas distintas, misma IP, tienen cupos de /ask independientes", async () => {
  const sesionA = (await (await fetch(`${baseUrl}/session`)).json()).session;
  const sesionB = (await (await fetch(`${baseUrl}/session`)).json()).session;
  assert.notEqual(sesionA, sesionB);

  const estadosA = [];
  for (let i = 0; i < 20; i++) {
    const res = await pedidoAsk({ "X-Medusa-Session": sesionA }, {});
    estadosA.push(res.status);
  }
  assert.deepEqual(estadosA, Array(20).fill(400), "los 20 pedidos de la sesión A deberían fallar solo por validación (400)");

  const res21A = await pedidoAsk({ "X-Medusa-Session": sesionA }, {});
  assert.equal(res21A.status, 429, "el pedido 21 de la sesión A debería chocar con su propio límite");

  const resB = await pedidoAsk({ "X-Medusa-Session": sesionB }, {});
  assert.equal(resB.status, 400, "la sesión B, aunque comparte IP con A, no debería estar afectada por el consumo de A");
});

test("un header X-Medusa-Session inventado (no emitido por /session) no rompe nada: cae a la IP sola", async () => {
  const res = await pedidoAsk({ "X-Medusa-Session": "valor-cualquiera.firma-inventada" }, {});
  assert.ok([400, 429].includes(res.status), "debería comportarse como si no hubiera header (400 por validación, o 429 si ya se consumió el cupo de la IP)");
});

test("las respuestas de /ask incluyen los headers estándar de RateLimit-*", async () => {
  const sesion = (await (await fetch(`${baseUrl}/session`)).json()).session;
  const res = await pedidoAsk({ "X-Medusa-Session": sesion }, {});
  assert.ok(res.headers.get("ratelimit-limit"), "debería incluir RateLimit-Limit");
  assert.ok(res.headers.get("ratelimit-remaining") !== null, "debería incluir RateLimit-Remaining");
});

test("/ask: un pedido con contexto+pregunta que supera el límite de caracteres por minuto se rechaza con 429 (sin llegar a Groq)", async () => {
  const sesion = (await (await fetch(`${baseUrl}/session`)).json()).session;
  const res = await pedidoAsk({ "X-Medusa-Session": sesion }, { context: "x".repeat(400), question: "y".repeat(200) });
  assert.equal(res.status, 429);
  const data = await res.json();
  assert.equal(data.codigo, "limite_caracteres");
});

test("/tts: un texto que supera el límite de caracteres por minuto se rechaza con 429 (sin llegar a ElevenLabs)", async () => {
  const sesion = (await (await fetch(`${baseUrl}/session`)).json()).session;
  const res = await fetch(`${baseUrl}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000", "X-Medusa-Session": sesion },
    body: JSON.stringify({ text: "z".repeat(400) })
  });
  assert.equal(res.status, 429);
  const data = await res.json();
  assert.equal(data.codigo, "limite_caracteres");
});
