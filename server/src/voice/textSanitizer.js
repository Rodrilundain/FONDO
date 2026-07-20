// === Validación y limpieza de texto antes de mandarlo a síntesis de voz ===
// El texto nunca se usa para construir un comando de consola (siempre se
// manda por stdin a un proceso separado, ver piperProvider.js), así que
// esta limpieza no es por seguridad de inyección de comandos — es para
// evitar caracteres que puedan confundir al motor de síntesis o quedar
// mal en el .wav resultante (caracteres de control, espacios repetidos).

// Caracteres de control (excepto tab/salto de línea, que se normalizan
// aparte) — pueden venir de un copy/paste con basura invisible.
const CARACTERES_CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function validarTexto(texto) {
  return typeof texto === "string" && texto.trim().length > 0;
}

// Tildes, ñ, ¿/¡ y el resto de la puntuación en español se dejan intactos
// a propósito: Piper los procesa bien (fonemiza con espeak-ng).
export function limpiarTextoParaSintesis(texto) {
  return texto
    .replace(CARACTERES_CONTROL_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Divide en bloques de hasta maxCaracteres sin cortar palabras ni
// oraciones a la mitad — misma lógica (partir por oraciones) que ya usa
// el resto de MedusaLee en el frontend (js/voz.js, js/chat.js), reescrita
// acá porque el backend es un proceso Node aparte y no comparte módulos
// con el navegador.
export function dividirEnBloques(texto, maxCaracteres = 500) {
  if (texto.length <= maxCaracteres) return [texto];
  const oraciones = texto.match(/[^.!?]+[.!?]*/g) || [texto];
  const bloques = [];
  let actual = "";
  for (const oracion of oraciones) {
    if (actual && (actual + oracion).length > maxCaracteres) {
      bloques.push(actual.trim());
      actual = oracion;
    } else {
      actual += oracion;
    }
  }
  if (actual.trim()) bloques.push(actual.trim());
  return bloques.length ? bloques : [texto];
}
