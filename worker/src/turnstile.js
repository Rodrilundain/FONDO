// Verificacion server-side de Cloudflare Turnstile, contra el contrato
// oficial documentado en developers.cloudflare.com/turnstile
// (POST https://challenges.cloudflare.com/turnstile/v0/siteverify, body
// secret+response[+remoteip], respuesta {success, "error-codes"}).
// Es opcional: solo se exige si TURNSTILE_ENABLED="true" y hay
// TURNSTILE_SECRET_KEY configurado (ver providerConfig.js / wrangler.toml).

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verificarTurnstile({ token, secretKey, remoteIp, fetchImpl = fetch, timeoutMs = 8000 }) {
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
  } catch {
    return { success: false, motivo: "error_de_red" };
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
  return { success: true };
}
