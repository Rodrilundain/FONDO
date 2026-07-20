// Protección SSRF para /fetch-document: valida protocolo, hostname e IP
// ANTES de cada pedido -- incluyendo cada salto de una redirección, no
// solo la URL inicial. fetch/dns son inyectables (parámetro opcional)
// para poder testear esto sin red real.

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

export function ipEsPrivadaOReservada(ip) {
  if (!ip) return true;
  if (ip.includes(":")) {
    const low = ip.toLowerCase();
    if (low === "::1" || low === "::") return true; // loopback / sin especificar
    if (low.startsWith("fe80:")) return true; // link-local
    if (low.startsWith("fc") || low.startsWith("fd")) return true; // ULA fc00::/7
    const mapeada = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeada) return ipv4EsPrivadaOReservada(mapeada[1]); // IPv4 encapsulada en IPv6
    return false;
  }
  return ipv4EsPrivadaOReservada(ip);
}

// Valida protocolo + patrón de hostname (chequeo rápido, sin red) y después
// resuelve TODAS las direcciones IP del hostname (no solo la primera) para
// confirmar que ninguna sea privada/reservada. Lanza SsrfBlockedError si
// algo no pasa.
export async function validarUrlSsrf(parsedUrl, { resolver = dns.lookup } = {}) {
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new SsrfBlockedError("Solo se admiten enlaces http:// o https://.");
  }
  if (HOSTNAME_BLOQUEADO.test(parsedUrl.hostname)) {
    throw new SsrfBlockedError("Esa dirección no está permitida.");
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

const CODIGOS_REDIRECCION = new Set([301, 302, 303, 307, 308]);

// Sigue redirecciones a mano (redirect: "manual"), revalidando protocolo +
// hostname + TODAS las IPs en cada salto, hasta maxRedirects veces. Nunca
// deja que fetch() siga una redirección solo -- eso es justamente lo que
// permitiría que una URL pública, ya validada, salte a una IP privada.
export async function descargarConProteccionSsrf(urlInicial, {
  maxRedirects = 3,
  timeoutMs = 20000,
  userAgent = "MedusaLee-fetch-document/1.0",
  fetchImpl = fetch,
  resolver = dns.lookup
} = {}) {
  let actual = new URL(urlInicial);
  for (let salto = 0; ; salto++) {
    await validarUrlSsrf(actual, { resolver });

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
    try {
      actual = new URL(ubicacion, actual);
    } catch {
      throw new SsrfBlockedError("La redirección apunta a una URL inválida.");
    }
  }
}
