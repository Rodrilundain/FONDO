// === Cache en memoria para solicitudes identicas (Etapa 10) ===
// Ahorra pedidos repetidos al proveedor de IA (mismo documento + misma
// tarea + mismas opciones) durante la vida de un mismo isolate del
// Worker. Misma limitacion que el limitador de solicitudes
// (src/security.js): no es un cache global entre isolates/regiones, es
// una capa adicional basica, no una garantia. Solo se cachean
// respuestas exitosas -- un error nunca se cachea, para no repetir un
// fallo transitorio a un usuario distinto.

const CACHE_MAX_ENTRADAS = 100;
const cache = new Map();

export async function hashPedido(task, content, options) {
  const texto = `${task}::${JSON.stringify(options || {})}::${content}`;
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function obtenerDeCache(hash) {
  return cache.has(hash) ? cache.get(hash) : null;
}

export function guardarEnCache(hash, resultado) {
  if (cache.size >= CACHE_MAX_ENTRADAS) {
    const primeraClave = cache.keys().next().value;
    cache.delete(primeraClave);
  }
  cache.set(hash, resultado);
}

// Para tests.
export function reiniciarCache() {
  cache.clear();
}
