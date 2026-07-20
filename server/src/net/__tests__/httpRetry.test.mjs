import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchConReintentos, calcularEsperaBackoff } from "../httpRetry.js";

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

test("fetchConReintentos: 400 (no recuperable) NUNCA se reintenta", async () => {
  let llamadas = 0;
  const fetchImpl = async () => { llamadas++; return respuesta(400); };
  const res = await fetchConReintentos("https://x.test", {}, { fetchImpl, maxRetries: 3, retryDelayMs: 0 });
  assert.equal(res.status, 400);
  assert.equal(llamadas, 1, "un 400 no deberia reintentarse nunca");
});

test("fetchConReintentos: 401/403 tampoco se reintentan", async () => {
  for (const status of [401, 403]) {
    let llamadas = 0;
    const fetchImpl = async () => { llamadas++; return respuesta(status); };
    await fetchConReintentos("https://x.test", {}, { fetchImpl, maxRetries: 3, retryDelayMs: 0 });
    assert.equal(llamadas, 1, `status ${status} no deberia reintentarse`);
  }
});

test("fetchConReintentos: 429 se reintenta hasta maxRetries y despues devuelve la ultima respuesta", async () => {
  let llamadas = 0;
  const fetchImpl = async () => { llamadas++; return respuesta(429); };
  const res = await fetchConReintentos("https://x.test", {}, { fetchImpl, maxRetries: 2, retryDelayMs: 0 });
  assert.equal(res.status, 429);
  assert.equal(llamadas, 3, "1 intento inicial + 2 reintentos = 3 llamadas");
});

test("fetchConReintentos: 500/502/503/504 se consideran recuperables", async () => {
  for (const status of [500, 502, 503, 504]) {
    let llamadas = 0;
    const fetchImpl = async () => {
      llamadas++;
      return llamadas === 1 ? respuesta(status) : respuesta(200);
    };
    const res = await fetchConReintentos("https://x.test", {}, { fetchImpl, maxRetries: 2, retryDelayMs: 0 });
    assert.equal(res.status, 200, `status ${status} deberia haberse recuperado en el segundo intento`);
    assert.equal(llamadas, 2);
  }
});

test("fetchConReintentos: se recupera en el segundo intento tras un 503", async () => {
  let llamadas = 0;
  const fetchImpl = async () => {
    llamadas++;
    return llamadas === 1 ? respuesta(503) : respuesta(200);
  };
  const res = await fetchConReintentos("https://x.test", {}, { fetchImpl, maxRetries: 2, retryDelayMs: 0 });
  assert.equal(res.status, 200);
  assert.equal(llamadas, 2);
});

test("fetchConReintentos: timeout/error de red (fetch tira excepcion) se reintenta", async () => {
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

test("fetchConReintentos: si TODOS los intentos tiran error de red, propaga el error (no devuelve undefined)", async () => {
  const fetchImpl = async () => { throw new Error("siempre caido"); };
  await assert.rejects(
    () => fetchConReintentos("https://x.test", {}, { fetchImpl, maxRetries: 2, retryDelayMs: 0 }),
    /siempre caido/
  );
});

test("fetchConReintentos: cada intento arma su propio AbortSignal (no reutiliza uno ya disparado)", async () => {
  const signals = [];
  const fetchImpl = async (url, opts) => {
    signals.push(opts.signal);
    return signals.length === 1 ? respuesta(503) : respuesta(200);
  };
  await fetchConReintentos("https://x.test", {}, { fetchImpl, maxRetries: 1, retryDelayMs: 0 });
  assert.equal(signals.length, 2);
  assert.notEqual(signals[0], signals[1]);
});

test("fetchConReintentos: se recupera tras un error de conexión rechazada (ECONNREFUSED) distinto de un timeout", async () => {
  let llamadas = 0;
  const fetchImpl = async () => {
    llamadas++;
    if (llamadas < 2) {
      const err = new Error("connect ECONNREFUSED 127.0.0.1:1");
      err.code = "ECONNREFUSED";
      throw err;
    }
    return respuesta(200);
  };
  const res = await fetchConReintentos("https://x.test", {}, { fetchImpl, maxRetries: 2, retryDelayMs: 0 });
  assert.equal(res.status, 200);
  assert.equal(llamadas, 2);
});

test("calcularEsperaBackoff: con baseMs en 0 siempre da 0, sin importar el intento ni el azar", () => {
  const azarOriginal = Math.random;
  Math.random = () => 1;
  try {
    assert.equal(calcularEsperaBackoff(0, { baseMs: 0 }), 0);
    assert.equal(calcularEsperaBackoff(5, { baseMs: 0 }), 0);
  } finally {
    Math.random = azarOriginal;
  }
});

test("calcularEsperaBackoff: crece exponencialmente con el número de intento (2^intento * base), no linealmente", () => {
  const azarOriginal = Math.random;
  Math.random = () => 1; // fija el azar al máximo para poder comparar el techo exacto
  try {
    assert.equal(calcularEsperaBackoff(0, { baseMs: 100, maxMs: 100000 }), 100);
    assert.equal(calcularEsperaBackoff(1, { baseMs: 100, maxMs: 100000 }), 200);
    assert.equal(calcularEsperaBackoff(2, { baseMs: 100, maxMs: 100000 }), 400);
    assert.equal(calcularEsperaBackoff(3, { baseMs: 100, maxMs: 100000 }), 800);
  } finally {
    Math.random = azarOriginal;
  }
});

test("calcularEsperaBackoff: nunca supera maxMs, incluso con intentos altos", () => {
  const azarOriginal = Math.random;
  Math.random = () => 1;
  try {
    assert.equal(calcularEsperaBackoff(10, { baseMs: 100, maxMs: 1000 }), 1000);
  } finally {
    Math.random = azarOriginal;
  }
});

test("calcularEsperaBackoff: aplica jitter real (con azar en 0, da 0; con azar en 1, da el techo) -- no es un valor fijo", () => {
  const azarOriginal = Math.random;
  try {
    Math.random = () => 0;
    assert.equal(calcularEsperaBackoff(2, { baseMs: 100, maxMs: 100000 }), 0);
    Math.random = () => 0.5;
    assert.equal(calcularEsperaBackoff(2, { baseMs: 100, maxMs: 100000 }), 200);
  } finally {
    Math.random = azarOriginal;
  }
});
