import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchConReintentos, calcularEsperaBackoff } from "../src/net/httpRetry.js";

function respuesta(status, ok) {
  return { status, ok: ok ?? (status >= 200 && status < 300) };
}

test("fetchConReintentos: respuesta exitosa, un solo intento", async () => {
  let llamadas = 0;
  const fetchImpl = async () => { llamadas++; return respuesta(200); };
  const res = await fetchConReintentos("https://x.test", {}, { fetchImpl, retryDelayMs: 0 });
  assert.equal(res.status, 200);
  assert.equal(llamadas, 1);
});

test("fetchConReintentos: 400 (no recuperable) nunca se reintenta", async () => {
  let llamadas = 0;
  const fetchImpl = async () => { llamadas++; return respuesta(400); };
  const res = await fetchConReintentos("https://x.test", {}, { fetchImpl, maxRetries: 3, retryDelayMs: 0 });
  assert.equal(res.status, 400);
  assert.equal(llamadas, 1);
});

test("fetchConReintentos: 401 tampoco se reintenta", async () => {
  let llamadas = 0;
  const fetchImpl = async () => { llamadas++; return respuesta(401); };
  await fetchConReintentos("https://x.test", {}, { fetchImpl, maxRetries: 3, retryDelayMs: 0 });
  assert.equal(llamadas, 1);
});

test("fetchConReintentos: 429 se reintenta y luego se recupera", async () => {
  let llamadas = 0;
  const fetchImpl = async () => {
    llamadas++;
    return llamadas === 1 ? respuesta(429) : respuesta(200);
  };
  const res = await fetchConReintentos("https://x.test", {}, { fetchImpl, maxRetries: 2, retryDelayMs: 0 });
  assert.equal(res.status, 200);
  assert.equal(llamadas, 2);
});

test("fetchConReintentos: 500 se reintenta y luego se recupera", async () => {
  let llamadas = 0;
  const fetchImpl = async () => {
    llamadas++;
    return llamadas === 1 ? respuesta(500) : respuesta(200);
  };
  const res = await fetchConReintentos("https://x.test", {}, { fetchImpl, maxRetries: 2, retryDelayMs: 0 });
  assert.equal(res.status, 200);
  assert.equal(llamadas, 2);
});

test("fetchConReintentos: timeout/error de red se reintenta", async () => {
  let llamadas = 0;
  const fetchImpl = async () => {
    llamadas++;
    if (llamadas < 2) throw new Error("network down");
    return respuesta(200);
  };
  const res = await fetchConReintentos("https://x.test", {}, { fetchImpl, maxRetries: 2, retryDelayMs: 0 });
  assert.equal(res.status, 200);
  assert.equal(llamadas, 2);
});

test("fetchConReintentos: se alcanza el máximo de reintentos y se propaga el error", async () => {
  let llamadas = 0;
  const fetchImpl = async () => { llamadas++; throw new Error("siempre caido"); };
  await assert.rejects(
    () => fetchConReintentos("https://x.test", {}, { fetchImpl, maxRetries: 2, retryDelayMs: 0 }),
    /siempre caido/
  );
  assert.equal(llamadas, 3, "1 intento inicial + 2 reintentos");
});

test("fetchConReintentos: cada intento cancela correctamente con su propio AbortSignal", async () => {
  const signals = [];
  const fetchImpl = async (url, opts) => {
    signals.push(opts.signal);
    return signals.length === 1 ? respuesta(503) : respuesta(200);
  };
  await fetchConReintentos("https://x.test", {}, { fetchImpl, maxRetries: 1, retryDelayMs: 0 });
  assert.equal(signals.length, 2);
  assert.notEqual(signals[0], signals[1]);
});

test("calcularEsperaBackoff: crece exponencialmente (2^intento * base), con jitter real", () => {
  const azarOriginal = Math.random;
  try {
    Math.random = () => 1;
    assert.equal(calcularEsperaBackoff(0, { baseMs: 100, maxMs: 100000 }), 100);
    assert.equal(calcularEsperaBackoff(1, { baseMs: 100, maxMs: 100000 }), 200);
    assert.equal(calcularEsperaBackoff(2, { baseMs: 100, maxMs: 100000 }), 400);

    Math.random = () => 0;
    assert.equal(calcularEsperaBackoff(2, { baseMs: 100, maxMs: 100000 }), 0);

    Math.random = () => 1;
    assert.equal(calcularEsperaBackoff(10, { baseMs: 100, maxMs: 1000 }), 1000, "nunca supera maxMs");
  } finally {
    Math.random = azarOriginal;
  }
});

test("calcularEsperaBackoff: con baseMs en 0 siempre da 0", () => {
  assert.equal(calcularEsperaBackoff(0, { baseMs: 0 }), 0);
  assert.equal(calcularEsperaBackoff(5, { baseMs: 0 }), 0);
});
