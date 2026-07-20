// Verificacion server-side de Cloudflare Turnstile para el backend
// Express, mismo contrato oficial que worker/src/turnstile.js (Worker de
// Cloudflare): POST a challenges.cloudflare.com/turnstile/v0/siteverify
// con secret+response[+remoteip], respuesta {success, "error-codes"}.
// Opcional: solo se exige si TURNSTILE_ENABLED=true y hay
// TURNSTILE_SECRET_KEY configurada (ver server.js).

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
