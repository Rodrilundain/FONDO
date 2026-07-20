// === Privacidad de enlaces (Punto 4 de la auditoría v2 de seguridad) ===
// Funciones puras (sin DOM) que deciden si una URL puede mandarse a un
// proxy externo (r.jina.ai, corsproxy.io, allorigins.win), y cómo
// resumirla para mostrarla antes de pedir confirmación. Separado de
// documentos.js para poder probarlas sin necesitar un navegador real
// (ver __tests__/privacidadEnlaces.test.mjs), y porque es lógica de
// seguridad/validación, no de manejo de archivos.
//
// Script clásico (sin import/export) para no romper el orden de carga de
// <script> del resto del frontend -- se expone en window.MedusaPrivacidadEnlaces.
// También exporta por module.exports cuando existe (Node/tests), sin que
// eso afecte al navegador (ahí "module" no existe).

const NOMBRES_PARAMETROS_SENSIBLES = /token|signature|sig|auth|credential|secret|password|apikey|api[-_]?key|access[-_]?key|session|jwt|expires/i;

// Hosts locales/privados en forma literal (sin resolver DNS -- eso ya lo
// hace el backend en /fetch-document; esto es "mejor esfuerzo" del lado
// del navegador, antes de decidir si vale la pena preguntar por un proxy).
const LOCAL_O_PRIVADO = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0)|\.local\.?$|^\[?::1\]?$|^\[?f[cd][0-9a-f]{2}:|^\[?fe80:/i;

const MAX_LARGO_URL = 2000;

// Heurística "mejor esfuerzo" para no mandar a un tercero una URL que
// parece llevar un token, una firma o un enlace temporal (por ejemplo, un
// link prefirmado de S3/GCS -- X-Amz-Signature, X-Goog-Signature --, un
// enlace de descarga con expiración, o un JWT pegado en la URL), ni una
// URL con credenciales embebidas o que apunte a una red local/privada. No
// es exhaustiva, pero cubre los casos más comunes sin bloquear enlaces
// normales. Se revisan tanto los parámetros de consulta (?a=b) como el
// fragmento (#...), porque algunos flujos (OAuth implícito) devuelven el
// token ahí en vez de en la query string.
function urlPareceSensible(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  // Credenciales embebidas (usuario:contraseña@host): nunca se mandan a
  // un tercero, sin importar el resto de la URL.
  if (u.username || u.password) return true;
  for (const clave of u.searchParams.keys()) {
    // "key" suelto (ej. ?key=..., típico de APIs de mapas/geocoding) se
    // chequea con límite de palabra exacta, aparte de apikey/api_key,
    // para no bloquear por accidente algo como "keyword".
    if (NOMBRES_PARAMETROS_SENSIBLES.test(clave) || /^key$/i.test(clave)) return true;
  }
  if (u.hash) {
    const paramsFragmento = new URLSearchParams(u.hash.replace(/^#/, ""));
    for (const clave of paramsFragmento.keys()) {
      if (NOMBRES_PARAMETROS_SENSIBLES.test(clave) || /^key$/i.test(clave)) return true;
    }
  }
  // JWT "sueltos" en la URL (tres tramos base64url separados por punto).
  if (/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/.test(url)) return true;
  // Hosts locales/privados: no tiene sentido (ni es seguro) pedirle a un
  // servicio externo que intente bajar algo de una red interna.
  if (LOCAL_O_PRIVADO.test(u.hostname)) return true;
  // URLs excesivamente largas: suelen llevar tokens/firmas largas aunque
  // no matcheen los nombres de parámetro de arriba.
  if (url.length > MAX_LARGO_URL) return true;
  return false;
}

function dominioDeUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "(enlace no válido)";
  }
}

// Estimación por extensión, igual que documentos.js -- separado acá para
// no duplicar la lista de extensiones conocidas.
function tipoEstimadoDeUrl(url) {
  let sinQueryNiHash;
  try {
    sinQueryNiHash = new URL(url).pathname.toLowerCase();
  } catch {
    return "desconocido";
  }
  if (sinQueryNiHash.endsWith(".pdf")) return "PDF";
  if (sinQueryNiHash.endsWith(".docx")) return "Word (DOCX)";
  if (sinQueryNiHash.endsWith(".txt")) return "texto plano";
  if (sinQueryNiHash.endsWith(".md")) return "Markdown";
  return "desconocido (se intentará detectar al cargarlo)";
}

// Recorta una URL larga para mostrarla sin desbordar la pantalla, sin
// esconder el dominio (la parte más importante para reconocer de dónde
// viene el enlace).
function resumirUrl(url, maxLargo = 90) {
  if (url.length <= maxLargo) return url;
  const mitad = Math.floor((maxLargo - 1) / 2);
  return url.slice(0, mitad) + "…" + url.slice(url.length - mitad);
}

// Decide si se puede usar un proxy externo para esta URL, sin tocar el
// DOM: recibe si el usuario los desactivó por completo, y una función
// `confirmarConUsuario` (normalmente window.confirm) que solo se llama si
// hace falta preguntar -- así se puede probar sin un navegador real ni
// diálogos reales.
function decidirUsoDeProxies({ url, proxiesDeshabilitados, confirmarConUsuario }) {
  if (proxiesDeshabilitados) return false;
  if (urlPareceSensible(url)) return false;
  return !!confirmarConUsuario(url);
}

const api = { urlPareceSensible, dominioDeUrl, tipoEstimadoDeUrl, resumirUrl, decidirUsoDeProxies, LOCAL_O_PRIVADO };

if (typeof window !== "undefined") window.MedusaPrivacidadEnlaces = api;
if (typeof module !== "undefined" && module.exports) module.exports = api;
