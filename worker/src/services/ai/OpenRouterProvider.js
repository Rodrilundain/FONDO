// === Proveedor OpenRouter (respaldo) ===
// Usa el formato de "chat completions" compatible con OpenAI, que es el
// contrato publico y estable de OpenRouter. ADVERTENCIA: no pude
// verificar esto en vivo -- openrouter.ai esta bloqueado por la red de
// este entorno de desarrollo (confirmado con curl: "CONNECT tunnel
// failed, response 403"). Esta implementacion se basa en la
// documentacion publica conocida de OpenRouter (API OpenAI-compatible en
// /api/v1/chat/completions), no en una prueba real contra el servicio.
// Probalo con una clave real antes de confiar en que funciona.
import { fetchConReintentos } from "../../net/httpRetry.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function errorProveedor(code, message, recuperable = false) {
  return { success: false, content: null, usage: null, error: { code, message }, recuperable };
}

// maxRetries/retryDelayMs vienen de config.maxRetries (env AI_MAX_RETRIES,
// Punto 5 de la auditoría v2 -- antes esa variable existia pero no se
// usaba en ningun lado, asi que no tenia ningun efecto real).
export async function llamarOpenRouter({ apiKey, model, systemInstruction, content, timeoutMs, allowedOrigin, maxRetries = 1, retryDelayMs = 250 }) {
  if (!apiKey) return errorProveedor("SIN_API_KEY", "OpenRouter no esta configurado (falta OPENROUTER_API_KEY).", false);
  if (!model) return errorProveedor("SIN_MODELO", "El proveedor de respaldo (OpenRouter) no tiene un modelo configurado (OPENROUTER_MODEL).", false);

  let res;
  try {
    res = await fetchConReintentos(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        // Encabezados que OpenRouter documenta como opcionales para
        // identificar la app en su dashboard; no son secretos.
        ...(allowedOrigin ? { "HTTP-Referer": allowedOrigin } : {}),
        "X-Title": "MedusaLee"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: `Documento:\n"""${content}"""` }
        ]
      })
    }, { timeoutMs, maxRetries, retryDelayMs });
  } catch (err) {
    return errorProveedor("TIMEOUT_O_CONEXION", "No se pudo conectar con OpenRouter a tiempo.", true);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const mensaje = data?.error?.message || `OpenRouter respondio con estado ${res.status}`;
    const recuperable = res.status === 429 || res.status >= 500;
    return errorProveedor(res.status === 401 ? "CLAVE_INVALIDA" : "PROVIDER_ERROR", mensaje, recuperable);
  }

  const data = await res.json();
  const texto = data?.choices?.[0]?.message?.content || "";
  if (!texto) return errorProveedor("RESPUESTA_VACIA", "OpenRouter no devolvio contenido.", true);

  return {
    success: true,
    content: texto,
    usage: {
      inputTokens: data?.usage?.prompt_tokens ?? null,
      outputTokens: data?.usage?.completion_tokens ?? null
    }
  };
}
