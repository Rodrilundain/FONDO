// === Seguridad: origen permitido, CORS y limite basico de solicitudes ===

export function origenPermitido(origin, allowedOrigins) {
  if (!origin) return false; // exige el header Origin a proposito
  return allowedOrigins.includes(origin);
}

export function encabezadosCORS(origin, allowedOrigins) {
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

export function listaOrigenesPermitidos(env) {
  // ALLOWED_ORIGIN puede traer uno o varios separados por coma, igual que
  // el backend de Render (server/server.js), para no introducir un
  // formato de configuracion distinto entre los dos backends.
  return (env.ALLOWED_ORIGIN || "")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean);
}

export function ipDelPedido(request) {
  // CF-Connecting-IP es el header que Cloudflare agrega el mismo con la
  // IP real del cliente -- no viene del cliente, no se puede falsificar
  // desde el navegador.
  return request.headers.get("CF-Connecting-IP") || "desconocida";
}

// Limite basico en memoria, por isolate del Worker. LIMITACION CONOCIDA
// (documentada tambien en el README del Worker): Cloudflare puede correr
// varias instancias/isolates de un mismo Worker en paralelo o reciclarlos
// entre pedidos (cold starts), asi que este contador NO es un limite
// global exacto -- es una capa basica adicional, no la unica proteccion
// contra abuso. Para un limite robusto de verdad, Cloudflare ofrece un
// binding nativo de Rate Limiting y Durable Objects/KV; no se
// implementaron aca porque no se pudo verificar su sintaxis exacta contra
// la documentacion oficial en este entorno (Cloudflare esta bloqueado por
// la red de este entorno de desarrollo).
const contadorPorIP = new Map();

export function dentroDelLimite(ip, maxPorMinuto) {
  const ahora = Date.now();
  const ventanaMs = 60 * 1000;
  const registro = contadorPorIP.get(ip);
  if (!registro || ahora - registro.inicio > ventanaMs) {
    contadorPorIP.set(ip, { inicio: ahora, cantidad: 1 });
    return true;
  }
  registro.cantidad++;
  return registro.cantidad <= maxPorMinuto;
}

// Se llama de tanto en tanto (ver index.js) para que el Map no crezca sin
// limite durante la vida de un mismo isolate.
export function limpiarContadoresViejos() {
  const ahora = Date.now();
  for (const [ip, registro] of contadorPorIP) {
    if (ahora - registro.inicio > 5 * 60 * 1000) contadorPorIP.delete(ip);
  }
}

// Para tests: permite resetear el estado del limitador entre casos.
export function reiniciarLimitador() {
  contadorPorIP.clear();
}
