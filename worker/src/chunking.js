// === Division de documentos largos ===
// No corta palabras: divide por oraciones. Si se pasan `bloques` (la
// misma forma {pagina,texto} o {tipo,texto} que ya extrae el frontend de
// MedusaLee para PDF/DOCX), se respetan sus limites como cortes
// preferidos y se guarda una referencia de pagina/seccion por fragmento,
// para poder citarla despues.

export function estimarTamano(texto) {
  return {
    caracteres: texto.length,
    palabrasAprox: (texto.match(/\S+/g) || []).length
  };
}

export function necesitaDivision(texto, chunkSize) {
  return texto.length > chunkSize;
}

function dividirPorOraciones(texto, maxLen) {
  if (texto.length <= maxLen) return [texto];
  const oraciones = texto.match(/[^.!?]+[.!?]*/g) || [texto];
  const fragmentos = [];
  let actual = "";
  for (const oracion of oraciones) {
    if (actual && (actual + oracion).length > maxLen) {
      fragmentos.push(actual.trim());
      actual = oracion;
    } else {
      actual += oracion;
    }
  }
  if (actual.trim()) fragmentos.push(actual.trim());
  return fragmentos.length ? fragmentos : [texto];
}

// Une los ultimos `overlap` caracteres de cada fragmento con el
// siguiente, para no perder contexto justo en el borde de un corte. Una
// superposicion pequena (no una oracion entera) es suficiente para esto
// y mantiene los fragmentos livianos.
function aplicarOverlap(fragmentos, overlap) {
  if (!overlap || fragmentos.length < 2) return fragmentos;
  const resultado = [fragmentos[0]];
  for (let i = 1; i < fragmentos.length; i++) {
    const cola = fragmentos[i - 1].slice(-overlap).trim();
    resultado.push(cola ? `(...) ${cola} ${fragmentos[i]}` : fragmentos[i]);
  }
  return resultado;
}

function referenciaParaBloque(bloque) {
  if (bloque.pagina !== undefined) return `Página ${bloque.pagina}`;
  if (bloque.tipo === "titulo") return bloque.texto.slice(0, 80).trim();
  return null;
}

// Devuelve [{ texto, referencia }], nunca mezclando contenido de bloques
// distintos dentro del mismo fragmento base (el overlap solo repite un
// pedacito de texto entre fragmentos consecutivos, no junta documentos ni
// bloques no relacionados).
export function dividirEnFragmentos(texto, { chunkSize = 6000, chunkOverlap = 400, bloques } = {}) {
  const tieneBloquesUtiles = Array.isArray(bloques) && bloques.length > 0 &&
    (bloques[0].pagina !== undefined || bloques[0].tipo !== undefined);

  let fragmentosBase = [];
  let referencias = null;

  if (tieneBloquesUtiles) {
    referencias = [];
    for (const bloque of bloques) {
      if (!bloque.texto || !bloque.texto.trim()) continue;
      const referencia = referenciaParaBloque(bloque);
      for (const trozo of dividirPorOraciones(bloque.texto, chunkSize)) {
        fragmentosBase.push(trozo);
        referencias.push(referencia);
      }
    }
  } else if (texto && texto.trim()) {
    fragmentosBase = dividirPorOraciones(texto, chunkSize);
  }

  if (!fragmentosBase.length) return [];

  const conOverlap = aplicarOverlap(fragmentosBase, chunkOverlap);
  return conOverlap.map((textoFragmento, i) => ({
    texto: textoFragmento,
    referencia: referencias ? referencias[i] : null
  }));
}
