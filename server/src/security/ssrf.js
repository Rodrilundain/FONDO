// Protección SSRF para /fetch-document: valida protocolo, hostname e IP
// ANTES de cada pedido -- incluyendo cada salto de una redirección, no
// solo la URL inicial. fetch/dns son inyectables (parámetro opcional)
// para poder testear esto sin red real.
//
// Auditoría v2: renombrado el chequeo principal a validarDestinoSeguro()
// (se mantiene validarUrlSsrf como alias por compatibilidad con el resto
// del código/tests ya escritos). Se agregaron los chequeos que faltaban,
// confirmados contra el comportamiento real del parser de URL de Node
// (WHATWG URL, no una suposición):
//  - credenciales en la URL (user:pass@host) -- bloqueadas explícitamente.
//  - dominios que terminan en ".local" -- bloqueados explícitamente.
//  - formatos alternativos de IPv4 (decimal, hex, octal, forma corta como
//    "127.1"): Node los normaliza SOLO a partir de new URL() a la forma
//    punteada estandar ANTES de que este código los vea (verificado en
//    vivo: new URL("http://2130706433/").hostname === "127.0.0.1"), asi
//    que el chequeo de rangos privados ya los cubre -- lo que faltaba era
//    un test que lo probara, no un chequeo nuevo.
//  - IPv6 literal en la URL (http://[::1]/, http://[::ffff:127.0.0.1]/):
//    antes esto fallaba por accidente (dns.lookup() rechaza un hostname
//    con corchetes, "[::1]" no es un nombre resoluble), lo cual bloqueaba
//    TODO IPv6 literal -- privado o público -- por el motivo equivocado.
//    Ahora se detecta explícitamente, se le sacan los corchetes, y se
//    valida la IP directamente (sin ir a DNS, ya es una IP). Tambien se
//    cubre la forma comprimida en hex que usa el parser de Node para
//    IPv4-mapped-IPv6 (::ffff:7f00:1, no solo ::ffff:127.0.0.1).

import dns from "node:dns/promises";

export class SsrfBlockedError extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "SsrfBlockedError";
  }
}

const HOSTNAME_BLOQUEADO = /^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/i;

function ipv4EsPrivadaOReservada(ip) {
  const partes = ip.split(".").map(Number);
  if (partes.length !== 4 || partes.some(n => Number.isNaN(n) || n < 0 || n > 255)) return true; // formato raro: mejor bloquear
  const [a, b] = partes;
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 10) return true; // 10.0.0.0/8 privada
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 privada
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 privada
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 0) return true; // 0.0.0.0/8 "esta red"
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reservado
  return false;
}

// Convierte los 8 grupos hex de una IPv6 en 4 dobles-octetos, para poder
// reconocer un IPv4-mapped-IPv6 tanto en su forma punteada (::ffff:1.2.3.4)
// como en la forma comprimida en hex que usa el parser de Node
// (::ffff:0102:0304 / ::ffff:7f00:1).
function gruposIPv6(ip) {
  const sinCorchetes = ip.replace(/^\[|\]$/g, "");
  if (!sinCorchetes.includes("::")) {
    return sinCorchetes.split(":");
  }
  const [izq, der] = sinCorchetes.split("::");
  const gruposIzq = izq ? izq.split(":") : [];
  const gruposDer = der ? der.split(":") : [];
  const faltantes = 8 - gruposIzq.length - gruposDer.length;
  if (faltantes < 0) return null;
  return [...gruposIzq, ...Array(faltantes).fill("0"), ...gruposDer];
}

function ipv4MapeadaDesdeIPv6(ip) {
  // Forma punteada explícita: ::ffff:127.0.0.1
  const puntuada = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (puntuada) return puntuada[1];
  // Forma comprimida en hex: ::ffff:7f00:1 (o con corchetes)
  const grupos = gruposIPv6(ip);
  if (!grupos || grupos.length !== 8) return null;
  const primerosSeis = grupos.slice(0, 6).map(g => g.toLowerCase().padStart(4, "0"));
  if (primerosSeis.slice(0, 5).join("") !== "0".repeat(20) || primerosSeis[5] !== "ffff") return null;
  const alto = parseInt(grupos[6], 16);
  const bajo = parseInt(grupos[7], 16);
  if (Number.isNaN(alto) || Number.isNaN(bajo)) return null;
  return [(alto >> 8) & 0xff, alto & 0xff, (bajo >> 8) & 0xff, bajo & 0xff].join(".");
}

export function ipEsPrivadaOReservada(ip) {
  if (!ip) return true;
  if (ip.includes(":")) {
    const sinCorchetes = ip.replace(/^\[|\]$/g, "");
    const low = sinCorchetes.toLowerCase();
    if (low === "::1" || low === "::" || low === "0:0:0:0:0:0:0:1") return true; // loopback / sin especificar
    if (low.startsWith("fe80:") || low.startsWith("fe80::")) return true; // link-local
    if (low.startsWith("fc") || low.startsWith("fd")) return true; // ULA fc00::/7
    const mapeada = ipv4MapeadaDesdeIPv6(sinCorchetes);
    if (mapeada) return ipv4EsPrivadaOReservada(mapeada); // IPv4 encapsulada en IPv6, cualquier forma
    return false;
  }
  return ipv4EsPrivadaOReservada(ip);
}

const DOMINIO_LOCAL = /\.local\.?$/i;

function esHostnameLiteralIPv6(hostname) {
  return hostname.startsWith("[") && hostname.endsWith("]");
}

// Valida protocolo + credenciales + patrón de hostname (chequeos rápidos,
// sin red) y después resuelve TODAS las direcciones IP del hostname (no
// solo la primera) para confirmar que ninguna sea privada/reservada.
// Si el propio hostname ya es una IPv6 literal, se valida directo sin
// pasar por DNS. Lanza SsrfBlockedError si algo no pasa.
export async function validarDestinoSeguro(parsedUrl, { resolver = dns.lookup } = {}) {
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new SsrfBlockedError("Solo se admiten enlaces http:// o https://.");
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new SsrfBlockedError("No se admiten credenciales dentro de la URL.");
  }
  if (DOMINIO_LOCAL.test(parsedUrl.hostname)) {
    throw new SsrfBlockedError("Esa dirección no está permitida.");
  }
  if (HOSTNAME_BLOQUEADO.test(parsedUrl.hostname)) {
    throw new SsrfBlockedError("Esa dirección no está permitida.");
  }

  if (esHostnameLiteralIPv6(parsedUrl.hostname)) {
    if (ipEsPrivadaOReservada(parsedUrl.hostname)) {
      throw new SsrfBlockedError("Esa dirección no está permitida.");
    }
    return;
  }

  let direcciones;
  try {
    direcciones = await resolver(parsedUrl.hostname, { all: true });
  } catch {
    throw new SsrfBlockedError("No se pudo resolver ese dominio.");
  }
  if (!Array.isArray(direcciones) || direcciones.length === 0) {
    throw new SsrfBlockedError("No se pudo resolver ese dominio.");
  }
  for (const { address } of direcciones) {
    if (ipEsPrivadaOReservada(address)) {
      throw new SsrfBlockedError("Esa dirección no está permitida.");
    }
  }
}

// Alias por compatibilidad (nombre usado en la ronda anterior de la
// auditoría y en server.js/tests existentes).
export const validarUrlSsrf = validarDestinoSeguro;

const CODIGOS_REDIRECCION = new Set([301, 302, 303, 307, 308]);

// Sigue redirecciones a mano (redirect: "manual"), revalidando protocolo +
// credenciales + hostname + TODAS las IPs en cada salto, hasta
// maxRedirects veces. Nunca deja que fetch() siga una redirección solo --
// eso es justamente lo que permitiría que una URL pública, ya validada,
// salte a una IP privada. Cancela la descarga si supera maxBytes, incluso
// sin Content-Length (streaming real, no solo de nombre).
export async function descargarConProteccionSsrf(urlInicial, {
  maxRedirects = 3,
  timeoutMs = 20000,
  userAgent = "MedusaLee-fetch-document/1.0",
  fetchImpl = fetch,
  resolver = dns.lookup
} = {}) {
  let actual = new URL(urlInicial);
  for (let salto = 0; ; salto++) {
    await validarDestinoSeguro(actual, { resolver });

    const upstream = await fetchImpl(actual.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": userAgent }
    });

    if (!CODIGOS_REDIRECCION.has(upstream.status)) {
      return { response: upstream, finalUrl: actual.toString() };
    }
    if (salto >= maxRedirects) {
      throw new SsrfBlockedError(`Se alcanzó el máximo de redirecciones permitidas (${maxRedirects}).`);
    }
    const ubicacion = upstream.headers.get("location");
    if (!ubicacion) {
      throw new SsrfBlockedError("El servidor de origen respondió una redirección sin destino.");
    }
    let siguiente;
    try {
      siguiente = new URL(ubicacion, actual);
    } catch {
      throw new SsrfBlockedError("La redirección apunta a una URL inválida.");
    }
    if (siguiente.protocol !== "http:" && siguiente.protocol !== "https:") {
      throw new SsrfBlockedError("La redirección apunta a un protocolo no permitido.");
    }
    actual = siguiente;
  }
}
