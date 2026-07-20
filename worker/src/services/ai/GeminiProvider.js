// === Proveedor Gemini ===
// Endpoint REST v1beta, verificado en vivo durante el desarrollo (URL y
// forma del JSON de error confirmadas con curl real contra
// generativelanguage.googleapis.com). NO se pudo confirmar el nombre
// exacto del modelo vigente contra la documentacion oficial en este
// entorno (ver providerConfig.js) -- la API valida la clave antes que el
// modelo, asi que una clave invalida no permite distinguir "modelo
// inexistente" de "clave invalida".
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

function errorProveedor(code, message, recuperable = false) {
  return { success: false, content: null, usage: null, error: { code, message }, recuperable };
}

export async function llamarGemini({ apiKey, model, systemInstruction, content, timeoutMs }) {
  if (!apiKey) return errorProveedor("SIN_API_KEY", "Gemini no esta configurado (falta GEMINI_API_KEY).", false);
  if (!model) return errorProveedor("SIN_MODELO", "Gemini no tiene un modelo configurado (GEMINI_MODEL).", false);

  const url = `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: `Documento:\n"""${content}"""` }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] }
  };

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    // AbortError (timeout) o TypeError (red caida): ambos son fallas
    // recuperables, tiene sentido reintentar con el proveedor de respaldo.
    return errorProveedor("TIMEOUT_O_CONEXION", "No se pudo conectar con Gemini a tiempo.", true);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const mensaje = data?.error?.message || `Gemini respondio con estado ${res.status}`;
    const esClaveInvalida = res.status === 400 && /api key/i.test(mensaje);
    const recuperable = res.status === 429 || res.status === 500 || res.status === 503 || res.status === 504;
    return errorProveedor(
      esClaveInvalida ? "CLAVE_INVALIDA" : "PROVIDER_ERROR",
      mensaje,
      recuperable
    );
  }

  const data = await res.json();
  const bloqueado = data?.promptFeedback?.blockReason;
  if (bloqueado) {
    return errorProveedor("CONTENIDO_BLOQUEADO", `Gemini bloqueo la respuesta (${bloqueado}).`, false);
  }
  const texto = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  if (!texto) return errorProveedor("RESPUESTA_VACIA", "Gemini no devolvio contenido.", true);

  return {
    success: true,
    content: texto,
    usage: {
      inputTokens: data?.usageMetadata?.promptTokenCount ?? null,
      outputTokens: data?.usageMetadata?.candidatesTokenCount ?? null
    }
  };
}
