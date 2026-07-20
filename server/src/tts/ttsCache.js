// Caché en memoria de audio de /tts (Etapa 3 de la auditoría de
// seguridad / Punto 6 de la auditoría v2): repetir el mismo fragmento
// (por ejemplo al volver atrás en la lectura) no vuelve a consumir cuota
// de ElevenLabs ni cuenta contra el límite diario. Dos límites
// independientes evitan que crezca sin control en la memoria del
// proceso (no hay Redis ni disco persistente, así que esto se pierde si
// el proceso se reinicia -- documentado, no un intento de persistencia
// real): cantidad de entradas Y bytes totales guardados. Además, cada
// entrada expira (TTL) para no servir audio potencialmente desactualizado
// para siempre solo porque nunca se llegó al tope de entradas/bytes.

export function crearCacheTts({
  maxEntradas = 120,
  maxBytesTotal = 50 * 1024 * 1024, // 50MB
  ttlMs = 24 * 60 * 60 * 1000 // 24h
} = {}) {
  const entradas = new Map(); // hash -> { buffer, creadoEn }
  let bytesTotales = 0;

  function eliminar(hash) {
    const entrada = entradas.get(hash);
    if (!entrada) return;
    bytesTotales -= entrada.buffer.length;
    entradas.delete(hash);
  }

  function haExpirado(entrada) {
    return ttlMs > 0 && Date.now() - entrada.creadoEn > ttlMs;
  }

  function obtener(hash) {
    const entrada = entradas.get(hash);
    if (!entrada) return null;
    if (haExpirado(entrada)) {
      eliminar(hash);
      return null;
    }
    return entrada.buffer;
  }

  // Nunca se guarda nada acá si no es un Buffer con contenido real: el
  // llamador es responsable de no invocar esto para errores o audio
  // vacío/inválido (ver server.js, Punto 6 -- "no cachear errores, no
  // cachear audio vacío/inválido").
  function guardar(hash, buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return;
    if (entradas.has(hash)) eliminar(hash); // reemplazo: no duplicar bytes

    // Al tope de entradas O de bytes: se van liberando las MÁS VIEJAS
    // (orden de inserción de un Map, equivalente a FIFO) hasta que entre
    // la nueva -- salvo que la nueva entrada sola ya supere el máximo de
    // bytes, en cuyo caso directamente no se cachea (mejor no cachear
    // ese caso puntual que vaciar toda la caché por una sola entrada
    // gigante).
    if (buffer.length > maxBytesTotal) return;
    while (entradas.size >= maxEntradas || bytesTotales + buffer.length > maxBytesTotal) {
      const masVieja = entradas.keys().next().value;
      if (masVieja === undefined) break;
      eliminar(masVieja);
    }

    entradas.set(hash, { buffer, creadoEn: Date.now() });
    bytesTotales += buffer.length;
  }

  function tamanio() {
    return { entradas: entradas.size, bytes: bytesTotales };
  }

  function reiniciarParaTests() {
    entradas.clear();
    bytesTotales = 0;
  }

  return { obtener, guardar, tamanio, reiniciarParaTests };
}
