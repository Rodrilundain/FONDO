// === Worker de Cloudflare: backend seguro de IA para MedusaLee ===
// Punto de entrada unico. No contiene claves ni logica de negocio propia
// mas alla de: validar el pedido, aplicar seguridad basica, y delegar en
// AIService. Las claves viven en `env` (secretos configurados con
// `wrangler secret put`), nunca en este archivo ni en el repositorio.

import { cargarAIConfig } from "./services/ai/providerConfig.js";
import { generate, generateSummaryForLongDocument } from "./services/ai/AIService.js";
import { validarTexto, validarTarea, validarBloques, validarOptions } from "./validation.js";
import {
  origenPermitido, encabezadosCORS, listaOrigenesPermitidos,
  ipDelPedido, dentroDelLimite, limpiarContadoresViejos
} from "./security.js";

const RATE_LIMIT_POR_MINUTO = 20;

function jsonResponse(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders }
  });
}

// Nunca se expone el mensaje de error real de un fallo inesperado (podria
// contener detalles internos) -- solo se loguea del lado del Worker
// (Cloudflare logs), nunca en la respuesta al cliente.
function errorSeguro(status, mensajePublico, extraHeaders) {
  return jsonResponse({ success: false, provider: null, model: null, content: null, usage: null, error: { code: "REQUEST_ERROR", message: mensajePublico } }, status, extraHeaders);
}

async function manejarGenerate(request, env, corsHeaders) {
  let payload;
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return errorSeguro(415, "El pedido debe ser JSON (Content-Type: application/json).", corsHeaders);
  }
  try {
    payload = await request.json();
  } catch {
    return errorSeguro(400, "El cuerpo del pedido no es JSON valido.", corsHeaders);
  }

  const config = cargarAIConfig(env);
  if (!config.aiEnabled) {
    return errorSeguro(503, "El asistente de IA esta desactivado en este momento.", corsHeaders);
  }

  if (!validarTarea(payload.task)) {
    return errorSeguro(400, "La tarea solicitada no es valida.", corsHeaders);
  }
  const textoValidado = validarTexto(payload.content, config.maxInputCharacters);
  if (!textoValidado.valido) {
    return errorSeguro(400, textoValidado.motivo, corsHeaders);
  }
  const bloquesValidados = validarBloques(payload.bloques);
  if (!bloquesValidados.valido) {
    return errorSeguro(400, bloquesValidados.motivo, corsHeaders);
  }
  const optionsValidadas = validarOptions(payload.options);
  if (!optionsValidadas.valido) {
    return errorSeguro(400, optionsValidadas.motivo, corsHeaders);
  }

  const origin = request.headers.get("Origin") || "";
  const argumentosComunes = {
    content: payload.content.trim(),
    options: optionsValidadas.options,
    config,
    allowedOrigin: origin
  };

  try {
    const resultado = payload.task === "summary"
      ? await generateSummaryForLongDocument({ ...argumentosComunes, bloques: payload.bloques })
      : await generate({ ...argumentosComunes, task: payload.task });

    // Log tecnico minimo: nunca el documento completo ni la respuesta,
    // solo metadatos utiles para diagnosticar (tarea, proveedor usado,
    // exito/error, longitud del texto de entrada).
    console.log(JSON.stringify({
      evento: "generate",
      task: payload.task,
      provider: resultado.provider,
      success: resultado.success,
      errorCode: resultado.error?.code || null,
      largoEntrada: payload.content.length
    }));

    return jsonResponse(resultado, resultado.success ? 200 : 502, corsHeaders);
  } catch (err) {
    console.error(JSON.stringify({ evento: "generate_error_inesperado", task: payload.task, mensaje: err?.message }));
    return errorSeguro(500, "No se pudo generar la respuesta en este momento. Probá nuevamente en unos minutos.", corsHeaders);
  }
}

function manejarHealth(env, corsHeaders) {
  const config = cargarAIConfig(env);
  return jsonResponse({
    status: "ok",
    aiEnabled: config.aiEnabled,
    primaryProvider: config.primaryProvider,
    fallbackEnabled: config.fallbackEnabled,
    geminiConfigurado: Boolean(config.gemini.apiKey),
    openrouterConfigurado: Boolean(config.openrouter.apiKey && config.openrouter.model)
  }, 200, corsHeaders);
}

export default {
  async fetch(request, env, ctx) {
    const allowedOrigins = listaOrigenesPermitidos(env);
    const origin = request.headers.get("Origin") || "";
    const corsHeaders = encabezadosCORS(origin, allowedOrigins);

    // Preflight CORS: se responde incluso sin validar origen todavia (el
    // navegador lo pide antes de mandar el pedido real), pero solo con
    // headers de CORS si el origen esta permitido -- si no, el propio
    // navegador bloquea la solicitud real por la ausencia de esos headers.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return manejarHealth(env, corsHeaders);
    }

    if (request.method !== "POST" || url.pathname !== "/api/generate") {
      return errorSeguro(404, "Ruta no encontrada.", corsHeaders);
    }

    if (!origenPermitido(origin, allowedOrigins)) {
      return errorSeguro(403, "Origen no autorizado.", {});
    }

    const ip = ipDelPedido(request);
    if (!dentroDelLimite(ip, RATE_LIMIT_POR_MINUTO)) {
      return errorSeguro(429, "Demasiadas solicitudes. Esperá un minuto e intentá de nuevo.", corsHeaders);
    }
    // Limpieza ocasional y barata: no bloquea la respuesta al cliente.
    if (Math.random() < 0.05) ctx.waitUntil(Promise.resolve(limpiarContadoresViejos()));

    return manejarGenerate(request, env, corsHeaders);
  }
};
