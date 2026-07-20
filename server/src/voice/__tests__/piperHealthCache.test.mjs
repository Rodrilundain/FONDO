import { test } from "node:test";
import assert from "node:assert/strict";
import { crearCachePiperHealth } from "../piperHealthCache.js";

test("primera llamada corre la prueba de verdad", async () => {
  const cache = crearCachePiperHealth({ ttlMs: 60000 });
  let llamadas = 0;
  const resultado = await cache.obtener(async () => { llamadas++; });
  assert.equal(resultado, true);
  assert.equal(llamadas, 1);
});

test("llamadas siguientes dentro del TTL usan el resultado cacheado, sin volver a probar", async () => {
  const cache = crearCachePiperHealth({ ttlMs: 60000 });
  let llamadas = 0;
  await cache.obtener(async () => { llamadas++; });
  await cache.obtener(async () => { llamadas++; });
  await cache.obtener(async () => { llamadas++; });
  assert.equal(llamadas, 1, "solo la primera llamada debería haber corrido la prueba real");
});

test("un fallo también se cachea (no se reintenta en cada /health)", async () => {
  const cache = crearCachePiperHealth({ ttlMs: 60000 });
  let llamadas = 0;
  const r1 = await cache.obtener(async () => { llamadas++; throw new Error("piper roto"); });
  const r2 = await cache.obtener(async () => { llamadas++; throw new Error("piper roto"); });
  assert.equal(r1, false);
  assert.equal(r2, false);
  assert.equal(llamadas, 1, "el fallo cacheado no debería disparar una segunda prueba real");
});

test("ttlMs: 0 desactiva el cacheo -- cada llamada prueba de nuevo", async () => {
  const cache = crearCachePiperHealth({ ttlMs: 0 });
  let llamadas = 0;
  await cache.obtener(async () => { llamadas++; });
  await cache.obtener(async () => { llamadas++; });
  assert.equal(llamadas, 2);
});

test("pasado el TTL, se vuelve a probar de verdad", async () => {
  const cache = crearCachePiperHealth({ ttlMs: 20 });
  let llamadas = 0;
  await cache.obtener(async () => { llamadas++; });
  await new Promise(r => setTimeout(r, 40));
  await cache.obtener(async () => { llamadas++; });
  assert.equal(llamadas, 2);
});

test("reiniciarParaTests limpia el estado cacheado", async () => {
  const cache = crearCachePiperHealth({ ttlMs: 60000 });
  let llamadas = 0;
  await cache.obtener(async () => { llamadas++; });
  cache.reiniciarParaTests();
  await cache.obtener(async () => { llamadas++; });
  assert.equal(llamadas, 2);
});
