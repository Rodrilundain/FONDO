// === Chat: preguntas sobre el documento cargado ===
// Responsabilidad: enviar preguntas al backend (con reintento si Render
// está dormido), elegir qué fragmentos del documento mandar como contexto
// (RAG simple, sin base vectorial) y mostrar la conversación.

const messages = document.getElementById("messages");
const question = document.getElementById("question");
const sendBtn = document.getElementById("sendBtn");
const clearChatBtn = document.getElementById("clearChatBtn");
const suggestedContainer = document.getElementById("suggestedQuestions");

// Compartido con voz.js (chunkText): partir un texto en oraciones dentro de
// un largo máximo, sin duplicar la misma lógica en los dos archivos.
function splitSentences(text, maxLen) {
  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
  const chunks = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length > maxLen) {
      if (current) chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

// === Chat: envío con Enter, salto de línea con Shift+Enter ===
function sendQuestion() {
  if (chatEnviando) return;
  const query = question.value.trim();
  if (!query) return;
  toggleMenu(false);
  if (suggestedContainer) suggestedContainer.hidden = true;
  addMessage(query, "user");
  question.value = "";
  question.style.height = "auto";
  medusaRespond(query);
}
question.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendQuestion();
  }
});
// El textarea crece hasta la altura máxima definida en CSS, para que
// escribir una pregunta larga con Shift+Enter no la esconda.
question.addEventListener("input", () => {
  question.style.height = "auto";
  question.style.height = question.scrollHeight + "px";
});
sendBtn.addEventListener("click", sendQuestion);

if (clearChatBtn) {
  clearChatBtn.addEventListener("click", () => {
    messages.innerHTML = "";
    if (documentoCargado) mostrarPreguntasSugeridas();
  });
}

function addMessage(text, sender, { pensando = false } = {}) {
  const div = document.createElement("div");
  div.className = `msg ${sender}` + (pensando ? " pensando" : "");
  const textoEl = document.createElement("div");
  textoEl.className = "msg-texto";
  textoEl.textContent = text;
  div.appendChild(textoEl);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function actualizarMensajeBot(div, texto, fragmentosUsados) {
  div.classList.remove("pensando");
  div.querySelector(".msg-texto").textContent = texto;

  if (fragmentosUsados && fragmentosUsados.length) {
    const refs = document.createElement("div");
    refs.className = "msg-fragmentos";
    refs.textContent = "📎 " + fragmentosUsados.join(", ");
    div.appendChild(refs);
  }

  const copiarBtn = document.createElement("button");
  copiarBtn.type = "button";
  copiarBtn.className = "msg-copiar";
  copiarBtn.textContent = "📋 Copiar";
  copiarBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(texto);
      copiarBtn.textContent = "✅ Copiado";
    } catch {
      copiarBtn.textContent = "⚠️ No se pudo copiar";
    }
    setTimeout(() => { copiarBtn.textContent = "📋 Copiar"; }, 1800);
  });
  div.appendChild(copiarBtn);
  messages.scrollTop = messages.scrollHeight;
}

// === Preguntas sugeridas: aparecen al cargar un documento ===
const PREGUNTAS_SUGERIDAS = [
  "Resumime este documento.",
  "Explicámelo en criollo.",
  "¿Cuáles son los puntos principales?",
  "¿Qué conceptos debería estudiar?",
  "Generame preguntas para practicar.",
  "¿En qué parte del documento se habla de este tema?"
];
function mostrarPreguntasSugeridas() {
  if (!suggestedContainer) return;
  suggestedContainer.innerHTML = "";
  for (const pregunta of PREGUNTAS_SUGERIDAS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = pregunta;
    btn.addEventListener("click", () => {
      question.value = pregunta;
      sendQuestion();
    });
    suggestedContainer.appendChild(btn);
  }
  suggestedContainer.hidden = false;
}
document.addEventListener("medusa:documento-listo", mostrarPreguntasSugeridas);

// === RAG simple para documentos largos ===
// Antes se mandaban solo los primeros 8000 caracteres del documento
// como contexto, perdiendo todo lo que viniera después. Ahora, si el
// documento es largo, se parte en fragmentos y se eligen los más
// relacionados con la pregunta por coincidencia de palabras clave (sin
// base vectorial: alcanza para documentos de estudio típicos).
const STOPWORDS_ES_BASE = [
  "de","la","que","el","en","y","a","los","del","se","las","por","un","para",
  "con","no","una","su","al","lo","como","más","pero","sus","le","ya","o",
  "este","sí","porque","esta","entre","cuando","muy","sin","sobre","también",
  "me","hasta","hay","donde","quien","desde","todo","nos","durante","todos",
  "uno","les","ni","contra","otros","ese","eso","ante","ellos","esto","mí",
  "antes","algunos","qué","unos","yo","otro","otras","otra","él","tanto",
  "esa","estos","mucho","quienes","nada","muchos","cual","poco","ella",
  "estar","estas","algunas","algo","nosotros","es","son","fue","ser","está"
];

// Quita tildes y hace un plural→singular muy simple ("documentos" ~
// "documento"), para que "económico"/"economico" o "fragmento"/"fragmentos"
// cuenten como la misma palabra al puntuar fragmentos.
function normalizarPalabra(w) {
  let n = w.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.length > 5 && n.endsWith("es")) n = n.slice(0, -2);
  else if (n.length > 4 && n.endsWith("s")) n = n.slice(0, -1);
  return n;
}

const STOPWORDS_ES = new Set(STOPWORDS_ES_BASE.map(normalizarPalabra));

function tokenizar(texto) {
  return (texto.toLowerCase().match(/[a-záéíóúñü]+/gi) || [])
    .map(normalizarPalabra)
    .filter(w => w.length > 2 && !STOPWORDS_ES.has(w));
}

// Fragmenta preservando la página de origen cuando el PDF la aportó
// (documentoBloques con {pagina, texto}); si una página es más larga que
// maxLen se subdivide, pero todas sus partes conservan el mismo número de
// página, para poder citar "Página N" en vez de solo "Fragmento N".
function fragmentarConPaginas(bloques, maxLen) {
  const fragmentos = [];
  for (const b of bloques) {
    if (!b.texto) continue;
    if (b.texto.length <= maxLen) {
      fragmentos.push({ texto: b.texto, pagina: b.pagina });
    } else {
      for (const trozo of splitSentences(b.texto, maxLen)) {
        fragmentos.push({ texto: trozo, pagina: b.pagina });
      }
    }
  }
  return fragmentos;
}

function fragmentarDocumento(texto, maxLen = 900) {
  // documentoBloques con página (PDF) permite citar "Página N"; para DOCX
  // (bloques con tipo, sin página) o texto plano, se cae al fragmentado
  // simple por oraciones, sin referencia de página.
  if (typeof documentoBloques !== "undefined" && documentoBloques.length && documentoBloques[0].pagina !== undefined) {
    return fragmentarConPaginas(documentoBloques, maxLen);
  }
  return splitSentences(texto, maxLen).map(t => ({ texto: t }));
}

// BM25 (Okapi): a diferencia de una simple suma de coincidencias, pondera
// más los términos raros en el documento (más informativos) que los que
// aparecen en casi todos los fragmentos, y normaliza por longitud del
// fragmento para no favorecer siempre a los más largos. Sin base
// vectorial ni embeddings, como pide el diseño original: solo conteo de
// palabras, pero con una fórmula más precisa que la anterior.
function calcularBM25(tokensPorFragmento, terminosPregunta) {
  const N = tokensPorFragmento.length;
  const avgdl = N ? tokensPorFragmento.reduce((s, t) => s + t.length, 0) / N : 0;
  const k1 = 1.5, b = 0.75;
  const terminosUnicos = [...new Set(terminosPregunta)];
  const df = {};
  for (const t of terminosUnicos) {
    df[t] = tokensPorFragmento.reduce((c, tokens) => c + (tokens.includes(t) ? 1 : 0), 0);
  }
  const idf = {};
  for (const t of terminosUnicos) {
    idf[t] = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5));
  }
  return tokensPorFragmento.map(tokens => {
    const conteo = {};
    for (const w of tokens) conteo[w] = (conteo[w] || 0) + 1;
    let score = 0;
    for (const t of terminosPregunta) {
      const f = conteo[t] || 0;
      if (!f) continue;
      score += idf[t] * (f * (k1 + 1)) / (f + k1 * (1 - b + b * (tokens.length / (avgdl || 1))));
    }
    return score;
  });
}

function elegirFragmentosRelevantes(fragmentos, pregunta, maxFragmentos = 6, maxCaracteres = 7000) {
  const terminosPregunta = tokenizar(pregunta);
  const vistos = new Set(); // fragmentos duplicados exactos (headers/pies repetidos): se descartan
  const candidatos = [];
  const tokensPorFragmento = [];
  fragmentos.forEach((f, i) => {
    const clave = f.texto.trim().toLowerCase();
    if (vistos.has(clave)) return;
    vistos.add(clave);
    candidatos.push({ i, frag: f.texto, pagina: f.pagina });
    tokensPorFragmento.push(tokenizar(f.texto));
  });

  const scores = terminosPregunta.length
    ? calcularBM25(tokensPorFragmento, terminosPregunta)
    : candidatos.map(() => 0);
  const puntuados = candidatos.map((c, idx) => ({ ...c, score: scores[idx] }));

  const conCoincidencias = puntuados.filter(p => p.score > 0).sort((a, b) => b.score - a.score);
  const topScored = (conCoincidencias.length ? conCoincidencias : puntuados).slice(0, maxFragmentos);

  // Fragmentos vecinos: dan contexto a los que matchearon, aunque ellos
  // mismos no tengan coincidencias de palabras clave.
  const indicesElegidos = new Set(topScored.map(p => p.i));
  if (conCoincidencias.length) {
    for (const p of topScored) {
      if (p.i > 0) indicesElegidos.add(p.i - 1);
      if (p.i < fragmentos.length - 1) indicesElegidos.add(p.i + 1);
    }
  }

  const elegidos = [...indicesElegidos]
    .sort((a, b) => a - b) // orden original: más fácil de seguir para el modelo
    .filter(i => fragmentos[i])
    .map(i => ({ i, frag: fragmentos[i].texto, pagina: fragmentos[i].pagina }));

  const seleccion = [];
  let total = 0;
  for (const p of elegidos) {
    if (total + p.frag.length > maxCaracteres && seleccion.length) continue;
    seleccion.push(p);
    total += p.frag.length;
  }
  return seleccion;
}

// Documentos cortos van enteros, sin fragmentar (no hace falta RAG).
const LIMITE_SIN_FRAGMENTAR = 8000;

function construirContextoParaPregunta(documento, pregunta) {
  if (documento.length <= LIMITE_SIN_FRAGMENTAR) {
    return { contexto: documento, fragmentosUsados: null };
  }
  const fragmentos = fragmentarDocumento(documento);
  const elegidos = elegirFragmentosRelevantes(fragmentos, pregunta);
  const etiqueta = f => f.pagina ? `Página ${f.pagina}` : `Fragmento ${f.i + 1}`;
  const contexto = elegidos.map(f => `[${etiqueta(f)}] ${f.frag}`).join("\n\n");
  return { contexto, fragmentosUsados: elegidos.map(etiqueta) };
}

// === Reintento automático si Render está dormido ===
// El plan gratis de Render duerme el servicio tras un rato sin uso; la
// primera solicitud puede tardar hasta ~60s en responder. En vez de
// fallar directo, se reintenta con espera creciente avisando qué pasa.
async function fetchConReintento(url, opciones, avisar) {
  const esperas = [0, 4000, 8000, 15000];
  let ultimoError;
  for (let i = 0; i < esperas.length; i++) {
    if (esperas[i] > 0) {
      avisar?.(`🌙 El servidor está despertando (intento ${i + 1}/${esperas.length})... puede tardar hasta un minuto la primera vez.`);
      await new Promise(r => setTimeout(r, esperas[i]));
    }
    try {
      return await fetch(url, { ...opciones, signal: AbortSignal.timeout(20000) });
    } catch (err) {
      ultimoError = err;
    }
  }
  throw ultimoError || new Error("No se pudo conectar con el backend.");
}

let chatEnviando = false; // evita mandar la misma pregunta varias veces (doble clic incluido)

async function medusaRespond(query) {
  if (!documentoCargado) {
    addMessage("Para responder, antes necesito que cargues un documento.", "bot");
    return;
  }
  if (!BACKEND_URL) {
    addMessage("Todavía no configuraste el backend de preguntas. Podés hacerlo en el menú (☰ → Backend de preguntas).", "bot");
    return;
  }
  chatEnviando = true;
  sendBtn.disabled = true;
  question.disabled = true;
  const msgBot = addMessage("💭 Pensando...", "bot", { pensando: true });
  try {
    const { contexto, fragmentosUsados } = construirContextoParaPregunta(documentoCargado, query);
    const res = await fetchConReintento(`${BACKEND_URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context: contexto,
        question: query,
        objetivo: typeof objetivoActual !== "undefined" ? objetivoActual : null,
        turnstileToken: window.MedusaSeguridad?.tokenTurnstileActual() || undefined
      })
    }, texto => { msgBot.querySelector(".msg-texto").textContent = texto; });

    let data = null;
    try { data = await res.json(); } catch (_) { /* respuesta no era JSON */ }

    if (!res.ok) {
      throw new Error(data?.reply || data?.error || `El backend respondió ${res.status}`);
    }
    const reply = data?.reply || "No encontré esa información en el documento cargado.";
    actualizarMensajeBot(msgBot, reply, fragmentosUsados);
    hablar(reply);
    pulse = 6;
  } catch (err) {
    console.error(err);
    // "Failed to fetch" suele ser: la URL del backend está mal, el
    // servicio no existe, o Render todavía no terminó de despertar
    // (el plan gratis tarda ~30-60s la primera vez tras estar inactivo).
    const detalle = err?.message || "error desconocido";
    const errorMsg = `No pude conectar con el servidor de preguntas (${detalle}). Revisá la URL en el menú, o esperá unos segundos si estaba dormido, e intentá de nuevo.`;
    actualizarMensajeBot(msgBot, errorMsg, null);
    speakRobotic("Error al conectar con el backend.");
  } finally {
    chatEnviando = false;
    sendBtn.disabled = false;
    question.disabled = false;
  }
}
