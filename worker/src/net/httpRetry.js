// fetch con timeout + reintentos controlados, con backoff exponencial y
// jitter (Punto 5 de la auditoría v2 de seguridad) -- para las llamadas
// del Worker a Gemini y OpenRouter. Solo reintenta errores recuperables:
// timeout/caída de conexión, o HTTP 429/500/502/503/504. Nunca reintenta
// 400, clave inválida, contenido bloqueado, ni nada que dependa de
// arreglar la solicitud en sí. Mismo diseño que server/src/net/httpRetry.js
// (no se comparte el archivo entre server/ y worker/ porque son paquetes
// npm independientes, sin un módulo común entre ambos).

const CODIGOS_HTTP_RECUPERABLES = new Set([429, 500, 502, 503, 504]);

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Backoff exponencial con "full jitter": espera un valor al azar entre 0
// y el tope exponencial (2^intento * base, con un techo), en vez de un
// valor fijo -- evita que reintentos de varios pedidos en vuelo se
// sincronicen y vuelvan a golpear todos juntos al proveedor caído.
export function calcularEsperaBackoff(intento, { baseMs = 250, maxMs = 4000 } = {}) {
  if (!baseMs) return 0;
  const tope = Math.min(baseMs * 2 ** intento, maxMs);
  return Math.random() * tope;
}

export async function fetchConReintentos(url, options = {}, {
  timeoutMs = 15000,
  maxRetries = 1,
  retryDelayMs = 250,
  maxRetryDelayMs = 4000,
  fetchImpl = fetch
} = {}) {
  for (let intento = 0; intento <= maxRetries; intento++) {
    const esUltimoIntento = intento === maxRetries;
    try {
      const res = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok || !CODIGOS_HTTP_RECUPERABLES.has(res.status) || esUltimoIntento) {
        return res;
      }
    } catch (err) {
      if (esUltimoIntento) throw err;
    }
    await esperar(calcularEsperaBackoff(intento, { baseMs: retryDelayMs, maxMs: maxRetryDelayMs }));
  }
}
