// fetch con timeout + reintentos controlados (Etapa 3 de la auditoría de
// seguridad / Punto 5 de la auditoría v2), para las llamadas a Groq y
// ElevenLabs. Solo reintenta errores recuperables: timeout/caída de
// conexión, o HTTP 429/500/502/503/504. Nunca reintenta 400, clave
// inválida, contenido bloqueado, ni nada que dependa de arreglar la
// solicitud en sí -- reintentar eso solo gastaría cuota del proveedor sin
// cambiar el resultado.

const CODIGOS_HTTP_RECUPERABLES = new Set([429, 500, 502, 503, 504]);

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Backoff exponencial con "full jitter" (la estrategia recomendada por
// AWS en su blog de arquitectura: espera un valor al azar entre 0 y el
// tope exponencial, no un valor fijo) -- evita que varios reintentos
// disparados al mismo tiempo (ej. una caída momentánea del proveedor que
// afecta a todos los pedidos en vuelo) se sincronicen y vuelvan a
// golpear todos juntos. `intento` es 0-based (intento 0 = el primer
// reintento, después del pedido inicial). Con `baseMs` en 0 (usado por
// los tests para no esperar de verdad) siempre da 0, sin importar el
// azar.
export function calcularEsperaBackoff(intento, { baseMs = 300, maxMs = 8000 } = {}) {
  if (!baseMs) return 0;
  const tope = Math.min(baseMs * 2 ** intento, maxMs);
  return Math.random() * tope;
}

// `options` NO debe traer su propio `signal`: este helper arma uno nuevo
// (AbortSignal.timeout) en cada intento, porque una señal de timeout ya
// disparada no sirve para un segundo intento.
export async function fetchConReintentos(url, options = {}, {
  timeoutMs = 15000,
  maxRetries = 2,
  retryDelayMs = 300,
  maxRetryDelayMs = 8000,
  fetchImpl = fetch
} = {}) {
  for (let intento = 0; intento <= maxRetries; intento++) {
    const esUltimoIntento = intento === maxRetries;
    try {
      const res = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok || !CODIGOS_HTTP_RECUPERABLES.has(res.status) || esUltimoIntento) {
        return res;
      }
      // status recuperable (429/5xx) y todavía quedan intentos: reintentar.
    } catch (err) {
      // AbortError (timeout) o TypeError (conexión caída/rechazada): recuperable.
      if (esUltimoIntento) throw err;
    }
    await esperar(calcularEsperaBackoff(intento, { baseMs: retryDelayMs, maxMs: maxRetryDelayMs }));
  }
}
