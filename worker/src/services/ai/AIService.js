// === AIService: interfaz unica de la que depende el resto del Worker ===
// El Worker nunca llama a GeminiProvider/OpenRouterProvider directamente
// -- siempre pasa por generate(), que decide que proveedor usar y
// devuelve siempre la misma forma de respuesta.

import { tareaValida, construirInstruccion } from "./promptTemplates.js";
import { llamarGemini } from "./GeminiProvider.js";
import { llamarOpenRouter } from "./OpenRouterProvider.js";
import { necesitaDivision, dividirEnFragmentos } from "../../chunking.js";

const PROVIDERS = {
  gemini: (args) => llamarGemini(args),
  openrouter: (args) => llamarOpenRouter(args)
};

function otroProveedor(nombre) {
  return nombre === "gemini" ? "openrouter" : "gemini";
}

function argumentosPara(nombreProveedor, { instruccion, content, config, allowedOrigin }) {
  const cfg = config[nombreProveedor];
  return {
    apiKey: cfg.apiKey,
    model: cfg.model,
    systemInstruction: instruccion,
    content,
    timeoutMs: config.requestTimeoutMs,
    allowedOrigin
  };
}

function respuestaExito(provider, model, resultado) {
  return {
    success: true,
    provider,
    model,
    content: resultado.content,
    usage: resultado.usage,
    error: null
  };
}

function respuestaError(provider, error) {
  return {
    success: false,
    provider,
    model: null,
    content: null,
    usage: null,
    error: { code: error?.code || "PROVIDER_ERROR", message: error?.message || "Error desconocido del proveedor." }
  };
}

// task: una clave de PROMPT_TEMPLATES ("summary", "qa", etc).
// content: el documento o fragmento de documento a analizar.
// options: { language, detail, question, count, ... } segun la tarea.
// config: el resultado de cargarAIConfig(env).
// allowedOrigin: el origen de la solicitud (para el header opcional de OpenRouter).
export async function generate({ task, content, options, config, allowedOrigin }) {
  if (!tareaValida(task)) {
    return respuestaError(config.primaryProvider, { code: "TAREA_INVALIDA", message: `Tarea desconocida: "${task}".` });
  }

  const instruccion = construirInstruccion(task, options);
  const primario = config.primaryProvider;

  const intento1 = await PROVIDERS[primario](argumentosPara(primario, { instruccion, content, config, allowedOrigin }));
  if (intento1.success) return respuestaExito(primario, config[primario].model, intento1);

  // Solo se reintenta con el respaldo ante fallas recuperables (servicio
  // caido, timeout, limite temporal, error de conexion, modelo
  // temporalmente inaccesible) -- nunca ante un problema de
  // configuracion propia (SIN_API_KEY/SIN_MODELO/CLAVE_INVALIDA) ni de
  // validacion, que ya se filtraron antes de llegar aca.
  if (config.fallbackEnabled && intento1.recuperable) {
    const respaldo = otroProveedor(primario);
    const intento2 = await PROVIDERS[respaldo](argumentosPara(respaldo, { instruccion, content, config, allowedOrigin }));
    if (intento2.success) return respuestaExito(respaldo, config[respaldo].model, intento2);
    return respuestaError(respaldo, intento2.error);
  }

  return respuestaError(primario, intento1.error);
}

// Para documentos largos (por ahora, solo la tarea "summary"): en vez de
// mandar todo el texto en un unico pedido, se divide en fragmentos, se
// resume cada uno por separado (mas breve, para no gastar de mas), y se
// hace una pasada final que consolida esos resumenes parciales en uno
// solo. Las demas tareas (preguntas, conceptos, etc.) siguen recibiendo
// el contenido ya recortado por el frontend (RAG existente en
// js/chat.js), que no se duplica aca.
export async function generateSummaryForLongDocument({ content, options, config, allowedOrigin, bloques }) {
  if (!necesitaDivision(content, config.chunking.chunkSize)) {
    return generate({ task: "summary", content, options, config, allowedOrigin });
  }

  const fragmentos = dividirEnFragmentos(content, {
    chunkSize: config.chunking.chunkSize,
    chunkOverlap: config.chunking.chunkOverlap,
    bloques
  });
  if (!fragmentos.length) {
    return respuestaError(config.primaryProvider, { code: "DOCUMENTO_VACIO", message: "No hay contenido para resumir." });
  }

  const resumenesParciales = [];
  for (const fragmento of fragmentos) {
    const resultado = await generate({
      task: "summary",
      content: fragmento.texto,
      options: { ...options, detail: "short" },
      config,
      allowedOrigin
    });
    if (!resultado.success) return resultado; // se corta y se informa el error real, sin inventar un resumen parcial
    resumenesParciales.push(fragmento.referencia ? `[${fragmento.referencia}] ${resultado.content}` : resultado.content);
  }

  const textoConsolidacion = resumenesParciales.join("\n\n");
  return generate({
    task: "summary_consolidate",
    content: textoConsolidacion,
    options: { ...options, detail: options?.detail || "medium" },
    config,
    allowedOrigin
  });
}
