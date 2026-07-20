// Archivo separado: RENDER=true tiene que estar seteado ANTES de importar
// server.js (se lee una sola vez, al arrancar) para activar "trust proxy"
// (Etapa 3 / Punto 3 de la auditoría v2). node:test corre cada archivo
// *.test.mjs en su propio proceso, así que esto no afecta a los demás tests.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.ALLOWED_ORIGIN = "";
process.env.TURNSTILE_ENABLED = "";
process.env.RENDER = "true";

const app = (await import("../server.js")).default;

let server, baseUrl;

before(() => new Promise((resolve) => {
  server = app.listen(0, "127.0.0.1", () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

after(() => new Promise((resolve) => server.close(() => resolve())));

function pedidoAsk(xForwardedFor) {
  return fetch(`${baseUrl}/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      "X-Forwarded-For": xForwardedFor
    },
    body: JSON.stringify({})
  });
}

test("con RENDER=true (trust proxy activo), dos X-Forwarded-For distintos consumen cupos de /ask independientes", async () => {
  const estados1 = [];
  for (let i = 0; i < 20; i++) {
    const res = await pedidoAsk("203.0.113.10");
    estados1.push(res.status);
  }
  assert.deepEqual(estados1, Array(20).fill(400), "los 20 pedidos de la IP .10 deberían fallar solo por validación (400)");

  const res21 = await pedidoAsk("203.0.113.10");
  assert.equal(res21.status, 429, "el pedido 21 de la misma IP reenviada debería chocar con el límite");

  const resOtraIp = await pedidoAsk("203.0.113.20");
  assert.equal(resOtraIp.status, 400, "una IP reenviada distinta no debería estar afectada por el consumo de la anterior -- prueba que trust proxy realmente está leyendo X-Forwarded-For");
});
