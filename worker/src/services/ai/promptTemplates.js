// === Plantillas de prompt, una por tarea (nunca un unico prompt gigante) ===
// Cada tarea tiene su propia instruccion especifica. Todas comparten las
// mismas reglas base (espanol, basarse solo en el documento, no inventar,
// distinguir hechos de interpretacion, conservar nombres/cifras/fechas).

const REGLAS_BASE =
  "Reglas: responde siempre en espanol; basate unicamente en el " +
  "contenido provisto como documento; si algo no aparece en el " +
  "documento decilo explicitamente en vez de inventarlo o suponerlo; " +
  "distingui con claridad los hechos que dice el documento de cualquier " +
  "interpretacion o resumen tuyo; conserva nombres propios, cifras y " +
  "fechas exactamente como aparecen en el texto original.";

function nivelDetalle(options) {
  const detail = options?.detail;
  if (detail === "short" || detail === "breve") return "breve (unos pocos parrafos)";
  if (detail === "long" || detail === "extenso") return "extenso y detallado";
  return "medio (ni muy breve ni exhaustivo)";
}

// Cada entrada: instruccion(options) => string. `content` (el documento o
// fragmento) se agrega aparte, nunca mezclado dentro de la instruccion,
// para que quede claro para el modelo que es el material a analizar y no
// parte de la orden.
export const PROMPT_TEMPLATES = {
  summary: {
    nombre: "Resumen del documento",
    instruccion: options =>
      `Resumi el documento con un nivel de detalle ${nivelDetalle(options)}. ` +
      `Organizalo en parrafos claros, sin viñetas salvo que ayuden a la claridad. ${REGLAS_BASE}`
  },
  explain_simple: {
    nombre: "Explicacion en lenguaje sencillo",
    instruccion: () =>
      `Explica el documento en lenguaje sencillo, como si se lo explicaras a alguien sin ` +
      `conocimientos previos del tema, evitando jerga innecesaria (si aparece jerga tecnica ` +
      `del propio documento, definila brevemente). ${REGLAS_BASE}`
  },
  qa: {
    nombre: "Pregunta sobre el documento",
    instruccion: options =>
      `Responde la pregunta del usuario basandote unicamente en el documento provisto. ` +
      `Si la respuesta no se encuentra en el documento, indica claramente que no puede ` +
      `confirmarse con la informacion disponible, en vez de inventarla. ${REGLAS_BASE}` +
      (options?.question ? `\n\nPregunta del usuario: ${options.question}` : "")
  },
  chat: {
    nombre: "Conversacion sobre el documento",
    instruccion: options =>
      `Continua la conversacion con el usuario, respondiendo unicamente en base al ` +
      `documento provisto (y al historial de la conversacion si se incluye). No uses ` +
      `conocimiento externo al documento para completar datos que falten. ${REGLAS_BASE}` +
      (options?.question ? `\n\nUltimo mensaje del usuario: ${options.question}` : "")
  },
  study_questions: {
    nombre: "Preguntas de estudio",
    instruccion: options => {
      const cantidad = Number(options?.count) > 0 ? Number(options.count) : 8;
      return `Genera ${cantidad} preguntas de estudio (respuesta abierta, no de opcion ` +
        `multiple) sobre el documento, pensadas para que alguien verifique si entendio los ` +
        `puntos importantes. Numeralas. ${REGLAS_BASE}`;
    }
  },
  multiple_choice: {
    nombre: "Preguntas de opcion multiple",
    instruccion: options => {
      const cantidad = Number(options?.count) > 0 ? Number(options.count) : 5;
      return `Genera ${cantidad} preguntas de opcion multiple sobre el documento, cada una ` +
        `con 4 opciones (A, B, C, D), una sola correcta, e indicando cual es la correcta al ` +
        `final de cada pregunta. Las opciones incorrectas deben ser plausibles, no absurdas. ${REGLAS_BASE}`;
    }
  },
  key_concepts: {
    nombre: "Conceptos importantes",
    instruccion: () =>
      `Identifica y lista los conceptos mas importantes del documento, con una explicacion ` +
      `breve (1-2 lineas) de cada uno. Ordenalos por relevancia. ${REGLAS_BASE}`
  },
  study_guide: {
    nombre: "Guia de estudio",
    instruccion: () =>
      `Crea una guia de estudio del documento: titulos y subtitulos organizando los temas, ` +
      `los puntos clave de cada seccion, y un resumen final de "lo mas importante para ` +
      `recordar". ${REGLAS_BASE}`
  },
  extract_data: {
    nombre: "Extraccion de datos relevantes",
    instruccion: () =>
      `Extrae del documento, en listas separadas: fechas mencionadas (con el contexto de ` +
      `cada una), nombres propios de personas u organizaciones mencionados, y cualquier otro ` +
      `dato numerico relevante (cifras, porcentajes, cantidades). Si alguna categoria no ` +
      `tiene datos en el documento, decilo en vez de omitirla en silencio. ${REGLAS_BASE}`
  },
  section_explanation: {
    nombre: "Explicacion por secciones",
    instruccion: () =>
      `Recorre el documento seccion por seccion (usando los titulos que tenga, o dividiendolo ` +
      `en partes logicas si no los tiene) y explica brevemente que dice cada una. ${REGLAS_BASE}`
  },
  // Uso interno (AIService.generateSummaryForLongDocument): el "documento"
  // que recibe esta tarea no es el original, sino una lista de resumenes
  // parciales ya generados fragmento por fragmento -- se lo aclara al
  // modelo para que no crea que le falta el texto completo.
  summary_consolidate: {
    nombre: "Consolidacion de resumenes parciales",
    instruccion: options =>
      `El contenido que sigue no es el documento original: es una lista de resumenes ` +
      `parciales de distintas partes de un mismo documento largo, cada uno posiblemente ` +
      `marcado con su pagina o seccion de origen entre corchetes. Consolidalos en un unico ` +
      `resumen coherente y sin repeticiones, con un nivel de detalle ${nivelDetalle(options)}, ` +
      `conservando las referencias de pagina o seccion cuando ayuden a ubicar la informacion. ${REGLAS_BASE}`
  }
};

export function tareaValida(task) {
  return Object.prototype.hasOwnProperty.call(PROMPT_TEMPLATES, task);
}

export function construirInstruccion(task, options) {
  return PROMPT_TEMPLATES[task].instruccion(options || {});
}
