// Archivo separado para tener un contador de rate limit limpio (una
// instancia de servidor propia, sin pedidos previos de otros tests que
// contaminen la ventana de 60s de express-rate-limit).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.ALLOWED_ORIGIN = "";
process.env.TURNSTILE_ENABLED = "";

const app = (await import("../server.js")).default;

let server, baseUrl;

before(() => new Promise((resolve) => {
  server = app.listen(0, "127.0.0.1", () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

after(() => new Promise((resolve) => server.close(() => resolve())));

test("/ask: límite de 20 pedidos por minuto -- el 21° se rechaza con 429", async () => {
  const hacerPedido = () => fetch(`${baseUrl}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    // Cuerpo inválido a propósito: más rápido, y de todos modos el
    // rate limiter corre ANTES de la validación de la ruta.
    body: JSON.stringify({})
  });

  const estados = [];
  for (let i = 0; i < 21; i++) {
    const res = await hacerPedido();
    estados.push(res.status);
  }

  assert.deepEqual(
    estados.slice(0, 20),
    Array(20).fill(400),
    "los primeros 20 pedidos deberían pasar el límite de solicitudes y fallar solo por validación (400)"
  );
  assert.equal(estados[20], 429, "el pedido 21 dentro del mismo minuto debería rechazarse por el límite de solicitudes");
});
