// === Validacion de entradas ===
// Todo lo que llega del navegador se valida aca antes de tocar cualquier
// proveedor de IA. Nunca se usa el texto del usuario para construir un
// comando ni una URL fuera de los parametros ya tipados de fetch().

export function validarTexto(texto, maxCaracteres) {
  if (typeof texto !== "string") return { valido: false, motivo: "El texto debe ser una cadena." };
  const limpio = texto.trim();
  if (!limpio) return { valido: false, motivo: "El texto no puede estar vacio." };
  if (limpio.length > maxCaracteres) {
    return { valido: false, motivo: `El texto supera el máximo permitido (${maxCaracteres.toLocaleString("es")} caracteres).` };
  }
  return { valido: true };
}

const TAREAS_PERMITIDAS = new Set([
  "summary", "explain_simple", "qa", "chat", "study_questions",
  "multiple_choice", "key_concepts", "study_guide", "extract_data", "section_explanation"
]);

export function validarTarea(task) {
  return typeof task === "string" && TAREAS_PERMITIDAS.has(task);
}

// `bloques` es opcional (viene de la extraccion de PDF/DOCX que ya hace
// el frontend). Se valida su forma minima para no propagar basura.
export function validarBloques(bloques) {
  if (bloques === undefined || bloques === null) return { valido: true };
  if (!Array.isArray(bloques)) return { valido: false, motivo: "bloques debe ser un array." };
  if (bloques.length > 5000) return { valido: false, motivo: "Demasiados bloques en el documento." };
  const formaValida = bloques.every(b => b && typeof b.texto === "string");
  return formaValida ? { valido: true } : { valido: false, motivo: "Cada bloque debe tener un campo \"texto\" de tipo texto." };
}

export function validarOptions(options) {
  if (options === undefined || options === null) return { valido: true, options: {} };
  if (typeof options !== "object" || Array.isArray(options)) {
    return { valido: false, motivo: "options debe ser un objeto." };
  }
  const limpio = {};
  if (typeof options.language === "string") limpio.language = options.language.slice(0, 10);
  if (typeof options.detail === "string") limpio.detail = options.detail.slice(0, 20);
  if (typeof options.question === "string") limpio.question = options.question.slice(0, 2000);
  if (Number.isFinite(Number(options.count))) limpio.count = Math.max(1, Math.min(30, Number(options.count)));
  return { valido: true, options: limpio };
}
