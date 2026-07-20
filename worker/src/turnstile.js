// Verificacion server-side de Cloudflare Turnstile, contra el contrato
// oficial documentado en developers.cloudflare.com/turnstile
// (POST https://challenges.cloudflare.com/turnstile/v0/siteverify, body
// secret+response[+remoteip], respuesta {success, "error-codes",
// challenge_ts, hostname, action, cdata}).
// Es opcional: solo se exige si TURNSTILE_ENABLED="true" y hay
// TURNSTILE_SECRET_KEY configurado (ver providerConfig.js / wrangler.toml).
//
// Auditoria v2: valida hostname/action esperados (Cloudflare los devuelve
// y recomienda revisarlos). TURNSTILE_MIN_SCORE es un no-op documentado
// si la respuesta no trae "score" -- Turnstile estandar no expone ese
// campo (a diferencia de reCAPTCHA v3); no se pudo confirmar si algun
// tier Enterprise lo agrega, asi que no se finge haberlo validado cuando
// el campo no esta presente. El token es de un solo uso por diseño de
// Cloudflare, no hace falta un mecanismo propio para eso.

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
