// fetch con timeout + reintentos controlados (Etapa 3 de la auditoría de
// seguridad), para las llamadas a Groq y ElevenLabs. Solo reintenta
// errores recuperables: timeout/caída de conexión, o HTTP 429/500/502/
// 503/504. Nunca reintenta 400, clave inválida, contenido bloqueado, ni
// nada que dependa de arreglar la solicitud en sí -- reintentar eso solo
// gastaría cuota del proveedor sin cambiar el resultado.

const CODIGOS_HTTP_RECUPERABLES = new Set([429, 500, 502, 503, 504]);

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// `options` NO debe traer su propio `signal`: este helper arma uno nuevo
// (AbortSignal.timeout) en cada intento, porque una señal de timeout ya
// disparada no sirve para un segundo intento.
export async function fetchConReintentos(url, options = {}, {
  timeoutMs = 15000,
  maxRetries = 2,
  retryDelayMs = 300,
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
      // AbortError (timeout) o TypeError (conexión caída): recuperable.
      if (esUltimoIntento) throw err;
    }
    await esperar(retryDelayMs * (intento + 1));
  }
}
