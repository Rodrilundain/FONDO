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
    "Access-Control-Allow-Headers": "Content-Type, X-Medusa-Session-Id",
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

// Identificador para el limite de solicitudes: si el frontend manda un ID
// de sesion propio (generado en el navegador, ver js/config.js), se usa
// ese en vez de la IP -- evita que varias personas detras de la misma IP
// compartida (oficina, CGNAT, red movil) se limiten entre si. Este ID NO
// es una credencial ni prueba identidad real: es solo una clave para
// repartir el limite de forma mas justa. Si no viene o no tiene forma de
// UUID, se cae a la IP como antes.
const ID_SESION_VALIDO = /^[0-9a-f-]{8,64}$/i;
export function claveLimite(request) {
  const idSesion = request.headers.get("X-Medusa-Session-Id");
  if (idSesion && ID_SESION_VALIDO.test(idSesion)) return `session:${idSesion}`;
  return `ip:${ipDelPedido(request)}`;
}

// Limite basico en memoria, por isolate del Worker -- respaldo para
// cuando no hay binding de Rate Limiting configurado (desarrollo local,
// tests) o si el binding falla. LIMITACION CONOCIDA: Cloudflare puede
// correr varias instancias/isolates de un mismo Worker en paralelo o
// reciclarlos entre pedidos (cold starts), asi que este contador NO es un
// limite global exacto.
const contadorPorClave = new Map();

export function dentroDelLimite(clave, maxPorMinuto) {
  const ahora = Date.now();
  const ventanaMs = 60 * 1000;
  const registro = contadorPorClave.get(clave);
  if (!registro || ahora - registro.inicio > ventanaMs) {
    contadorPorClave.set(clave, { inicio: ahora, cantidad: 1 });
    return true;
  }
  registro.cantidad++;
  return registro.cantidad <= maxPorMinuto;
}

// Limite "de verdad": usa el binding nativo de Rate Limiting de Cloudflare
// (ver wrangler.toml, [[ratelimits]]) cuando esta disponible -- eso si es
// un limite global entre isolates/regiones. Si el binding no esta
// configurado (por ejemplo en `wrangler dev` local sin el binding, o en
// los tests) o si falla en tiempo de ejecucion, cae al limitador en
// memoria de arriba en vez de dejar pasar todo sin control.
export async function verificarLimite({ key, maxPorMinuto, binding }) {
  if (binding) {
    try {
      const { success } = await binding.limit({ key });
      return success;
    } catch (err) {
      console.error(JSON.stringify({ evento: "rate_limit_binding_error", mensaje: err?.message }));
      // sigue de largo al respaldo en memoria en vez de fallar abierto
    }
  }
  return dentroDelLimite(key, maxPorMinuto);
}

// Se llama de tanto en tanto (ver index.js) para que el Map no crezca sin
// limite durante la vida de un mismo isolate.
export function limpiarContadoresViejos() {
  const ahora = Date.now();
  for (const [clave, registro] of contadorPorClave) {
    if (ahora - registro.inicio > 5 * 60 * 1000) contadorPorClave.delete(clave);
  }
}

// Para tests: permite resetear el estado del limitador entre casos.
export function reiniciarLimitador() {
  contadorPorClave.clear();
}
