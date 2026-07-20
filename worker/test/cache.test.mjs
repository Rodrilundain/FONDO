import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPedido, obtenerDeCache, guardarEnCache, reiniciarCache } from "../src/cache.js";

test("hashPedido: mismo task+content+options da el mismo hash", async () => {
  const h1 = await hashPedido("summary", "documento de prueba", { detail: "medium" });
  const h2 = await hashPedido("summary", "documento de prueba", { detail: "medium" });
  assert.equal(h1, h2);
  assert.equal(typeof h1, "string");
  assert.ok(h1.length > 0);
});

test("hashPedido: distinto contenido da distinto hash", async () => {
  const h1 = await hashPedido("summary", "documento A", {});
  const h2 = await hashPedido("summary", "documento B", {});
  assert.notEqual(h1, h2);
});

test("hashPedido: distinta tarea da distinto hash aunque el contenido sea igual", async () => {
  const h1 = await hashPedido("summary", "mismo texto", {});
  const h2 = await hashPedido("explain_simple", "mismo texto", {});
  assert.notEqual(h1, h2);
});

test("obtenerDeCache/guardarEnCache: guarda y recupera", () => {
  reiniciarCache();
  assert.equal(obtenerDeCache("hash-x"), null);
  guardarEnCache("hash-x", { success: true, content: "resultado" });
  assert.deepEqual(obtenerDeCache("hash-x"), { success: true, content: "resultado" });
});

test("guardarEnCache: expulsa la entrada mas vieja al superar el limite", () => {
  reiniciarCache();
  for (let i = 0; i < 105; i++) guardarEnCache(`hash-${i}`, { n: i });
  assert.equal(obtenerDeCache("hash-0"), null, "la primera entrada deberia haberse expulsado");
  assert.notEqual(obtenerDeCache("hash-104"), null, "la ultima entrada deberia seguir estando");
});
