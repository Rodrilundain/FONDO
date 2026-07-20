// === Configuracion de proveedores de IA ===
// Se lee de `env` (secretos/variables del Worker de Cloudflare), nunca de
// codigo fuente ni de nada que llegue del navegador.
//
// GEMINI_MODEL tiene un valor por defecto documentado, pero OJO: no pude
// verificarlo contra la documentacion oficial de Gemini en este entorno
// (ai.google.dev devolvio 403 a un fetch automatizado durante el
// desarrollo). Vino de busquedas web de julio 2026, no de una lectura
// directa de la pagina oficial. Confirmalo vos mismo en
// https://ai.google.dev/gemini-api/docs/models antes de confiar en el
// default, o simplemente configura GEMINI_MODEL con el que confirmes.
//
// OPENROUTER_MODEL NO tiene default (pedido explicito): si esta vacio,
// el proveedor de respaldo se informa como no configurado en vez de
// adivinar un modelo gratuito que podria haber dejado de existir.
const GEMINI_MODEL_POR_DEFECTO_NO_VERIFICADO = "gemini-2.5-flash-lite";

function numeroODefecto(valor, porDefecto) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

function booleanoODefecto(valor, porDefecto) {
  if (valor === undefined || valor === "") return porDefecto;
  return String(valor) === "true";
}

export function cargarAIConfig(env) {
  return {
    aiEnabled: booleanoODefecto(env.AI_ENABLED, true),
    primaryProvider: (env.AI_PRIMARY_PROVIDER || "gemini").toLowerCase(),
    fallbackEnabled: booleanoODefecto(env.AI_FALLBACK_ENABLED, true),
    requestTimeoutMs: numeroODefecto(env.AI_REQUEST_TIMEOUT_MS, 30000),
    maxRetries: numeroODefecto(env.AI_MAX_RETRIES, 1),
    maxInputCharacters: numeroODefecto(env.AI_MAX_INPUT_CHARACTERS, 50000),
    chunking: {
      chunkSize: numeroODefecto(env.CHUNK_SIZE, 6000),
      chunkOverlap: numeroODefecto(env.CHUNK_OVERLAP, 400),
      maxDocumentCharacters: numeroODefecto(env.MAX_DOCUMENT_CHARACTERS, 400000),
    },
    gemini: {
      apiKey: env.GEMINI_API_KEY || "",
      model: env.GEMINI_MODEL || GEMINI_MODEL_POR_DEFECTO_NO_VERIFICADO,
      modelEsDefaultSinVerificar: !env.GEMINI_MODEL,
    },
    openrouter: {
      apiKey: env.OPENROUTER_API_KEY || "",
      model: env.OPENROUTER_MODEL || "", // sin default a proposito
    },
    turnstile: {
      enabled: booleanoODefecto(env.TURNSTILE_ENABLED, false),
      secretKey: env.TURNSTILE_SECRET_KEY || "",
    },
    rateLimit: {
      maxPorMinuto: numeroODefecto(env.AI_RATE_LIMIT_POR_MINUTO, 20),
    },
  };
}
