// Sesión anónima firmada (Etapa 3 / Punto 3 de la auditoría v2): un
// identificador que el propio backend emite y firma con HMAC, para que
// el rate limit no dependa solo de la IP (varias personas detrás de la
// misma IP compartida -- oficina, CGNAT, red móvil -- no deberían
// competir por el mismo cupo). No es una sesión de usuario ni prueba
// identidad: solo demuestra "este token lo emitió este backend", así un
// cliente no puede simplemente inventar valores para fabricar cupos
// nuevos sin pasar antes por /session (que tiene su propio límite por IP).
//
// Sin cookies ni CORS credentials: se manda como header (X-Medusa-Session)
// de ida y vuelta, igual que el patrón que ya usa el Worker de Cloudflare
// (X-Medusa-Session-Id) -- consistente con el resto de la app.

import crypto from "node:crypto";

export function firmarValorSesion(valor, secreto) {
  return crypto.createHmac("sha256", secreto).update(valor).digest("hex");
}

export function generarSesionFirmada(secreto) {
  const valor = crypto.randomBytes(16).toString("hex");
  return `${valor}.${firmarValorSesion(valor, secreto)}`;
}

// Valida en tiempo constante (crypto.timingSafeEqual) para no filtrar
// info por temporización. Devuelve el valor (sin la firma) si es válido,
// o null si no lo es -- nunca lanza.
export function verificarSesionFirmada(token, secreto) {
  if (typeof token !== "string" || !token) return null;
  const idx = token.lastIndexOf(".");
  if (idx <= 0 || idx === token.length - 1) return null;
  const valor = token.slice(0, idx);
  const firma = token.slice(idx + 1);
  const esperada = firmarValorSesion(valor, secreto);
  const bufFirma = Buffer.from(firma, "hex");
  const bufEsperada = Buffer.from(esperada, "hex");
  if (bufFirma.length !== bufEsperada.length) return null;
  return crypto.timingSafeEqual(bufFirma, bufEsperada) ? valor : null;
}
