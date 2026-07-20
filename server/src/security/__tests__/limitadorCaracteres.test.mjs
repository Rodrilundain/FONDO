import { test } from "node:test";
import assert from "node:assert/strict";
import { crearLimitadorDeCaracteres } from "../limitadorCaracteres.js";

function req(body) { return { body }; }
function resFalso() {
  const r = { statusCode: null, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

test("sin maxCaracteresPorMinuto configurado, no hace nada (comportamiento anterior intacto)", () => {
  const mw = crearLimitadorDeCaracteres({ maxCaracteresPorMinuto: 0, obtenerClave: () => "x", obtenerTexto: (r) => r.body.texto });
  let siguio = false;
  mw(req({ texto: "x".repeat(1_000_000) }), resFalso(), () => { siguio = true; });
  assert.equal(siguio, true);
});

test("permite pedidos mientras no se supere el acumulado del minuto", () => {
  const mw = crearLimitadorDeCaracteres({ maxCaracteresPorMinuto: 1000, obtenerClave: () => "misma-clave", obtenerTexto: (r) => r.body.texto });
  for (let i = 0; i < 5; i++) {
    let siguio = false;
    const res = resFalso();
    mw(req({ texto: "a".repeat(100) }), res, () => { siguio = true; });
    assert.equal(siguio, true, `pedido ${i + 1} de 500 caracteres acumulados, debería pasar`);
    assert.equal(res.statusCode, null);
  }
});

test("rechaza con 429 cuando el acumulado del minuto superaría el máximo", () => {
  const mw = crearLimitadorDeCaracteres({ maxCaracteresPorMinuto: 500, obtenerClave: () => "misma-clave-2", obtenerTexto: (r) => r.body.texto });
  for (let i = 0; i < 5; i++) mw(req({ texto: "a".repeat(100) }), resFalso(), () => {}); // consume los 500
  const res = resFalso();
  let siguio = false;
  mw(req({ texto: "a" }), res, () => { siguio = true; });
  assert.equal(siguio, false);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.codigo, "limite_caracteres");
});

test("claves distintas no comparten el acumulado", () => {
  const mw = crearLimitadorDeCaracteres({ maxCaracteresPorMinuto: 100, obtenerClave: (r) => r.body.clave, obtenerTexto: (r) => r.body.texto });
  let siguioA = false, siguioB = false;
  mw(req({ clave: "A", texto: "a".repeat(90) }), resFalso(), () => { siguioA = true; });
  mw(req({ clave: "B", texto: "a".repeat(90) }), resFalso(), () => { siguioB = true; });
  assert.equal(siguioA, true);
  assert.equal(siguioB, true, "una clave distinta no debería verse afectada por el consumo de la otra");
});

test("reiniciarParaTests limpia el estado", () => {
  const mw = crearLimitadorDeCaracteres({ maxCaracteresPorMinuto: 10, obtenerClave: () => "k", obtenerTexto: (r) => r.body.texto });
  mw(req({ texto: "a".repeat(10) }), resFalso(), () => {});
  const bloqueado = resFalso();
  mw(req({ texto: "a" }), bloqueado, () => {});
  assert.equal(bloqueado.statusCode, 429);

  mw.reiniciarParaTests();
  const res = resFalso();
  let siguio = false;
  mw(req({ texto: "a" }), res, () => { siguio = true; });
  assert.equal(siguio, true, "después de reiniciar, el contador debería estar en cero");
});
