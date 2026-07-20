import { test } from "node:test";
import assert from "node:assert/strict";
import { crearCacheTts } from "../ttsCache.js";

test("obtener: sin nada guardado, devuelve null", () => {
  const cache = crearCacheTts();
  assert.equal(cache.obtener("hash-x"), null);
});

test("guardar + obtener: roundtrip normal", () => {
  const cache = crearCacheTts();
  const buffer = Buffer.from("audio falso");
  cache.guardar("hash-1", buffer);
  assert.deepEqual(cache.obtener("hash-1"), buffer);
});

test("guardar: ignora silenciosamente un buffer vacío o algo que no es Buffer", () => {
  const cache = crearCacheTts();
  cache.guardar("hash-vacio", Buffer.alloc(0));
  cache.guardar("hash-no-buffer", "no soy un buffer");
  assert.equal(cache.obtener("hash-vacio"), null);
  assert.equal(cache.obtener("hash-no-buffer"), null);
  assert.deepEqual(cache.tamanio(), { entradas: 0, bytes: 0 });
});

test("límite de entradas: al superarlo, se libera la más vieja (FIFO)", () => {
  const cache = crearCacheTts({ maxEntradas: 2, maxBytesTotal: 1e9 });
  cache.guardar("a", Buffer.from("1"));
  cache.guardar("b", Buffer.from("2"));
  cache.guardar("c", Buffer.from("3")); // debería tirar "a"
  assert.equal(cache.obtener("a"), null);
  assert.notEqual(cache.obtener("b"), null);
  assert.notEqual(cache.obtener("c"), null);
  assert.equal(cache.tamanio().entradas, 2);
});

test("límite de bytes totales: libera entradas viejas hasta entrar en el presupuesto", () => {
  const cache = crearCacheTts({ maxEntradas: 1000, maxBytesTotal: 10 });
  cache.guardar("a", Buffer.alloc(6)); // 6 bytes
  cache.guardar("b", Buffer.alloc(6)); // otros 6: 12 > 10, tira "a" (queda solo "b", 6 bytes)
  assert.equal(cache.obtener("a"), null);
  assert.notEqual(cache.obtener("b"), null);
  assert.equal(cache.tamanio().bytes, 6);
});

test("una entrada más grande que maxBytesTotal directamente no se cachea (no vacía toda la caché)", () => {
  const cache = crearCacheTts({ maxEntradas: 1000, maxBytesTotal: 10 });
  cache.guardar("a", Buffer.alloc(5));
  cache.guardar("gigante", Buffer.alloc(20)); // no entra sola: se descarta
  assert.notEqual(cache.obtener("a"), null, "la entrada previa no debería haberse perdido por una entrada gigante que no entra");
  assert.equal(cache.obtener("gigante"), null);
});

test("guardar la misma clave dos veces reemplaza el contenido y no duplica bytes", () => {
  const cache = crearCacheTts();
  cache.guardar("x", Buffer.alloc(10));
  cache.guardar("x", Buffer.alloc(20));
  assert.equal(cache.tamanio().entradas, 1);
  assert.equal(cache.tamanio().bytes, 20);
});

test("expiración (TTL): una entrada vieja deja de servirse y se libera", async () => {
  const cache = crearCacheTts({ ttlMs: 10 });
  cache.guardar("expira", Buffer.from("audio"));
  assert.notEqual(cache.obtener("expira"), null);
  await new Promise(r => setTimeout(r, 30));
  assert.equal(cache.obtener("expira"), null, "después del TTL debería tratarse como si no estuviera cacheado");
  assert.equal(cache.tamanio().entradas, 0, "la entrada expirada debería liberar también su lugar/bytes");
});

test("ttlMs: 0 desactiva la expiración por tiempo", async () => {
  const cache = crearCacheTts({ ttlMs: 0 });
  cache.guardar("persistente", Buffer.from("audio"));
  await new Promise(r => setTimeout(r, 20));
  assert.notEqual(cache.obtener("persistente"), null);
});

test("reiniciarParaTests: limpia todo (entradas y bytes)", () => {
  const cache = crearCacheTts();
  cache.guardar("a", Buffer.alloc(10));
  cache.reiniciarParaTests();
  assert.equal(cache.obtener("a"), null);
  assert.deepEqual(cache.tamanio(), { entradas: 0, bytes: 0 });
});
