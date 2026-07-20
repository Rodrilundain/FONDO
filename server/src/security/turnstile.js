// Verificacion server-side de Cloudflare Turnstile para el backend
// Express, mismo contrato oficial que worker/src/turnstile.js (Worker de
// Cloudflare): POST a challenges.cloudflare.com/turnstile/v0/siteverify
// con secret+response[+remoteip], respuesta {success, "error-codes",
// challenge_ts, hostname, action, cdata} -- contrato verificado contra la
// documentacion oficial de Cloudflare Turnstile (server-side-validation).
// Opcional: solo se exige si TURNSTILE_ENABLED=true y hay
// TURNSTILE_SECRET_KEY configurada (ver server.js).
//
// Auditoria v2: se agrega validacion de hostname y action esperados
// (Cloudflare devuelve ambos en la respuesta y su propia documentacion
// recomienda revisarlos), y un chequeo opcional de "score" -- documentado
// como no-op honesto: Turnstile estandar NO devuelve un campo "score" (a
// diferencia de reCAPTCHA v3); no se pudo verificar contra una cuenta
// Enterprise real si ese tier lo expone, asi que TURNSTILE_MIN_SCORE solo
// tiene efecto si el campo "score" llega en la respuesta -- si no llega
// (el caso normal), la validacion de score simplemente no se aplica, sin
// fingir haberla hecho.
//
// El token es de un solo uso por diseño de Cloudflare (una segunda
// verificacion con el mismo token devuelve error "timeout-or-duplicate"):
// no hace falta ningun mecanismo propio para eso, siteverify ya lo
// garantiza del lado de Cloudflare.

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verificarTurnstile({
  token, secretKey, remoteIp,
  expectedHostname, expectedAction, minScore,
  fetchImpl = fetch, timeoutMs = 8000
}) {
  if (!token || typeof token !== "string") {
    return { success: false, motivo: "falta_token" };
  }
  const body = new URLSearchParams({ secret: secretKey, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  let res;
  try {
    res = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    return { success: false, motivo: err?.name === "TimeoutError" || err?.name === "AbortError" ? "timeout" : "error_de_red" };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { success: false, motivo: "respuesta_invalida" };
  }

  if (!data.success) {
    return { success: false, motivo: "token_invalido", erroresCloudflare: data["error-codes"] || [] };
  }
  if (expectedHostname && data.hostname !== expectedHostname) {
    return { success: false, motivo: "hostname_inesperado" };
  }
  if (expectedAction && data.action !== expectedAction) {
    return { success: false, motivo: "accion_inesperada" };
  }
  if (minScore !== undefined && minScore !== null && typeof data.score === "number" && data.score < minScore) {
    return { success: false, motivo: "score_insuficiente" };
  }
  return { success: true, hostname: data.hostname, action: data.action };
}
