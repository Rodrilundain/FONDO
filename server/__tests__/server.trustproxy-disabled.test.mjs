// Contraparte de server.trustproxy-enabled.test.mjs: SIN RENDER ni
// TRUST_PROXY seteados (el default), X-Forwarded-For debe ser IGNORADO --
// confirma que el comportamiento "antes" del fix realmente juntaba a todo
// el mundo en el mismo cupo pese a mandar IPs reenviadas distintas.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.ALLOWED_ORIGIN = "";
process.env.TURNSTILE_ENABLED = "";
delete process.env.RENDER;
delete process.env.TRUST_PROXY;

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

test("sin trust proxy, X-Forwarded-For se ignora: distintas IPs reenviadas comparten el mismo cupo (el de la conexión real, 127.0.0.1)", async () => {
  for (let i = 0; i < 20; i++) {
    const res = await pedidoAsk("203.0.113.10");
    assert.equal(res.status, 400, `pedido ${i + 1} debería pasar el límite y fallar solo por validación`);
  }
  const resOtraIpReenviada = await pedidoAsk("203.0.113.99");
  assert.equal(resOtraIpReenviada.status, 429, "una IP reenviada 'distinta' no debería salvarte del límite: sin trust proxy, todos comparten la IP real de la conexión (127.0.0.1)");
});
