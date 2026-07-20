// Cachea el resultado de una prueba real de síntesis de Piper para
// /health (Punto 7 de la auditoría v2): sin esto, cada pedido a /health
// correría Piper de verdad (un proceso del sistema operativo aparte),
// caro e innecesario si nada cambió hace poco. Cachea TANTO el éxito
// como el fallo -- así un Piper roto tampoco se vuelve a probar en cada
// /health, hasta que venza el TTL.

export function crearCachePiperHealth({ ttlMs = 5 * 60 * 1000 } = {}) {
  let cache = null; // { resultado: boolean, timestamp: number }

  async function obtener(probar) {
    const ahora = Date.now();
    if (cache && ahora - cache.timestamp < ttlMs) return cache.resultado;
    let resultado;
    try {
      await probar();
      resultado = true;
    } catch {
      resultado = false;
    }
    cache = { resultado, timestamp: ahora };
    return resultado;
  }

  function reiniciarParaTests() {
    cache = null;
  }

  return { obtener, reiniciarParaTests };
}
