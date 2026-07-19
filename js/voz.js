// === Voz: modos, selección inteligente, lectura dinámica y voz de IA ===
// Responsabilidad: todo lo relacionado con hablar — modos de voz por
// objetivo, síntesis del navegador (gratis), voz de IA opcional vía
// backend (ElevenLabs), lectura fragmento por fragmento con progreso, y
// los controles de reproducción del documento cargado.

const vozActivaToggle = document.getElementById("vozActiva");
const vozModoSelect = document.getElementById("vozModo");
const vozModoDescEl = document.getElementById("vozModoDesc");
const personalizadaPanel = document.getElementById("personalizadaPanel");
const vozPersonalizadaSelect = document.getElementById("vozPersonalizadaSelect");
const vozVolumenPersonalizadaSlider = document.getElementById("vozVolumenPersonalizada");
const volumenPersonalizadaValor = document.getElementById("volumenPersonalizadaValor");
const vozVelocidadSlider = document.getElementById("vozVelocidad");
const velocidadValor = document.getElementById("velocidadValor");
const vozTonoSlider = document.getElementById("vozTono");
const tonoValor = document.getElementById("tonoValor");
const vozIAToggle = document.getElementById("vozIA");
const escucharMuestraBtn = document.getElementById("escucharMuestraBtn");
const probarVozBtn = document.getElementById("probarVozBtn");
const leerFragmentoBtn = document.getElementById("leerFragmentoBtn");
const vozEstado = document.getElementById("vozEstado");
const playBtn = document.getElementById("playBtn");
const pausaReanudarBtn = document.getElementById("pausaReanudarBtn");
const detenerVozBtn = document.getElementById("detenerVoz");
const reiniciarVozBtn = document.getElementById("reiniciarVoz");
const fragmentoAnteriorBtn = document.getElementById("fragmentoAnteriorBtn");
const fragmentoSiguienteBtn = document.getElementById("fragmentoSiguienteBtn");
const estadoLecturaEl = document.getElementById("estadoLectura");
const progresoLecturaEl = document.getElementById("progresoLectura");
const subtitulosVozEl = document.getElementById("subtitulosVoz");

// === Modos de voz por objetivo ===
// Cada modo define pitch/velocidad/volumen de base. La velocidad final
// además se multiplica por el slider "Velocidad" (control manual que ya
// existía), y el pitch puede overridearse con el slider "Tono manual" —
// así los controles manuales siguen funcionando arriba de cualquier modo,
// como ya funcionaban antes.
const MODOS_VOZ = {
  asistente: {
    nombre: "🧭 Asistente",
    pitch: 0.92, rate: 0.95, volume: 1,
    desc: "Voz serena, segura y clara — estilo asistente tecnológico moderno."
  },
  docente: {
    nombre: "📘 Docente",
    pitch: 1, rate: 0.88, volume: 1,
    desc: "Clara y pausada, pensada para explicaciones y contenido de estudio."
  },
  concentracion: {
    nombre: "🎯 Concentración",
    pitch: 0.98, rate: 0.92, volume: 0.95,
    desc: "Neutra y estable, para escuchar documentos largos sin cansancio."
  },
  resumen: {
    nombre: "⚡ Resumen rápido",
    pitch: 1, rate: 1.10, volume: 1,
    desc: "Clara y un poco más rápida, para repasar información en menos tiempo."
  },
  robotica: {
    nombre: "🤖 Robótica",
    pitch: 0.75, rate: 0.88, volume: 1,
    desc: "Sintética y firme: conserva identidad tecnológica sin volverse difícil de entender."
  },
  personalizada: {
    nombre: "🎛️ Personalizada",
    pitch: 1, rate: 1, volume: 1,
    desc: "Elegís vos la voz del dispositivo, el tono, la velocidad, el volumen y si usar voz IA."
  }
};

// Migración desde el selector anterior ("robotica"/"hombre"/"mujer"): se
// mapean a los modos nuevos más parecidos, sin perder la preferencia que
// el usuario ya tenía guardada.
const MIGRACION_TIPO_A_MODO = { robotica: "robotica", hombre: "asistente", mujer: "personalizada" };

function valorInicialVozModo() {
  const guardado = localStorage.getItem("medusaVozModo");
  if (guardado && MODOS_VOZ[guardado]) return guardado;
  const tipoViejo = localStorage.getItem("medusaVozTipo");
  if (tipoViejo && MIGRACION_TIPO_A_MODO[tipoViejo]) return MIGRACION_TIPO_A_MODO[tipoViejo];
  return vozModoSelect.value || "asistente";
}

// === Preferencias de voz: se recuerdan entre visitas (no son datos sensibles) ===
let vozActiva = (localStorage.getItem("medusaVozActiva") ?? (vozActivaToggle.checked ? "1" : "0")) === "1";
let vozModo = valorInicialVozModo();
let vozVelocidad = parseFloat(localStorage.getItem("medusaVozVelocidad")) || parseFloat(vozVelocidadSlider.value);
let vozTonoManual = localStorage.getItem("medusaVozTono") ? parseFloat(localStorage.getItem("medusaVozTono")) : null;
let vozVolumenPersonalizada = parseFloat(localStorage.getItem("medusaVozVolumenPersonalizada")) || 1;
let vozPersonalizadaURI = localStorage.getItem("medusaVozPersonalizadaURI") || null;
let vozIA = (localStorage.getItem("medusaVozIA") ?? (vozIAToggle.checked ? "1" : "0")) === "1";

vozActivaToggle.checked = vozActiva;
vozModoSelect.value = vozModo;
vozVelocidadSlider.value = vozVelocidad;
velocidadValor.textContent = vozVelocidad.toFixed(1) + "x";
vozIAToggle.checked = vozIA;
vozVolumenPersonalizadaSlider.value = vozVolumenPersonalizada;
volumenPersonalizadaValor.textContent = vozVolumenPersonalizada.toFixed(1);
if (vozTonoManual !== null) {
  vozTonoSlider.value = vozTonoManual;
  tonoValor.textContent = vozTonoManual.toFixed(2);
}

function actualizarDescModo() {
  const modo = MODOS_VOZ[vozModo] || MODOS_VOZ.asistente;
  if (vozModoDescEl) vozModoDescEl.textContent = modo.desc;
  if (personalizadaPanel) personalizadaPanel.hidden = vozModo !== "personalizada";
}
actualizarDescModo();

vozModoSelect.addEventListener("change", e => {
  vozModo = e.target.value;
  localStorage.setItem("medusaVozModo", vozModo);
  actualizarDescModo();
});
vozIAToggle.addEventListener("change", e => {
  vozIA = e.target.checked;
  localStorage.setItem("medusaVozIA", vozIA ? "1" : "0");
});
vozActivaToggle.addEventListener("change", e => {
  vozActiva = e.target.checked;
  localStorage.setItem("medusaVozActiva", vozActiva ? "1" : "0");
  if (!vozActiva) detenerTodoAhora();
});
vozVelocidadSlider.addEventListener("input", e => {
  vozVelocidad = parseFloat(e.target.value);
  velocidadValor.textContent = vozVelocidad.toFixed(1) + "x";
  localStorage.setItem("medusaVozVelocidad", String(vozVelocidad));
});
vozTonoSlider.addEventListener("input", e => {
  const valor = parseFloat(e.target.value);
  if (valor <= 0) {
    vozTonoManual = null;
    tonoValor.textContent = "automático";
    localStorage.removeItem("medusaVozTono");
  } else {
    vozTonoManual = valor;
    tonoValor.textContent = valor.toFixed(2);
    localStorage.setItem("medusaVozTono", String(valor));
  }
});
vozVolumenPersonalizadaSlider.addEventListener("input", e => {
  vozVolumenPersonalizada = parseFloat(e.target.value);
  volumenPersonalizadaValor.textContent = vozVolumenPersonalizada.toFixed(1);
  localStorage.setItem("medusaVozVolumenPersonalizada", String(vozVolumenPersonalizada));
});

function marcarEstadoLectura(texto) {
  if (estadoLecturaEl) estadoLecturaEl.textContent = texto;
}

// === Selección inteligente de voz ===
// Orden de prioridad: es-UY > es-AR > es-419 > otras voces en español >
// voz predeterminada del dispositivo. No se afirma que una voz sea
// "uruguaya" cuando el navegador no ofrece realmente una es-UY: solo se
// usa la más parecida disponible.
const NOMBRES_VOZ_MUJER = /female|mujer|women|paulina|helena|sabina|monica|lucia|camila|valentina|elena|catalina|isabela|carmen|sofia|maria/i;
const NOMBRES_VOZ_HOMBRE = /male|hombre|men\b|jorge|diego|juan|carlos|pablo|enrique|miguel|alvaro|alonso|andres|fernando|ricardo|sergio|mateo|tomas|rodrigo|gonzalo|felipe|tono/i;

function prioridadRegional(voice) {
  if (/^es-UY/i.test(voice.lang)) return 0;
  if (/^es-AR/i.test(voice.lang)) return 1;
  if (/^es-419/i.test(voice.lang)) return 2;
  if (/^es/i.test(voice.lang)) return 3;
  return 4;
}

function vocesOrdenadas() {
  const voices = window.speechSynthesis.getVoices();
  return [...voices].sort((a, b) => prioridadRegional(a) - prioridadRegional(b));
}

// Intenta diferenciar género por nombre; si no puede, no afirma nada.
function generoProbable(voice) {
  if (NOMBRES_VOZ_MUJER.test(voice.name)) return "femenina";
  if (NOMBRES_VOZ_HOMBRE.test(voice.name)) return "masculina";
  return null;
}

// Mejor voz disponible en general (para los modos preestablecidos, sin
// preferencia de género — la diferenciación por género queda para
// "Personalizada", donde el usuario elige la voz a mano).
function mejorVozDisponible() {
  const ordenadas = vocesOrdenadas();
  return ordenadas.length ? ordenadas[0] : null;
}

function pickVoice(tipo) {
  const ordenadas = vocesOrdenadas();
  if (!ordenadas.length) return null;
  const esVoices = ordenadas.filter(v => /^es/i.test(v.lang));
  const pool = esVoices.length ? esVoices : ordenadas;
  if (tipo === "mujer") {
    return pool.find(v => NOMBRES_VOZ_MUJER.test(v.name)) || pool.find(v => !NOMBRES_VOZ_HOMBRE.test(v.name)) || pool[0];
  }
  if (tipo === "hombre") {
    return pool.find(v => NOMBRES_VOZ_HOMBRE.test(v.name)) || pool.find(v => !NOMBRES_VOZ_MUJER.test(v.name)) || pool[0];
  }
  return pool[0];
}

function vozPersonalizadaSeleccionada() {
  const voices = window.speechSynthesis.getVoices();
  if (vozPersonalizadaURI) {
    const encontrada = voices.find(v => (v.voiceURI || v.name) === vozPersonalizadaURI);
    if (encontrada) return encontrada;
  }
  return mejorVozDisponible();
}

function poblarSelectorDeVoces() {
  if (!vozPersonalizadaSelect) return;
  const voices = vocesOrdenadas();
  const valorPrevio = vozPersonalizadaSelect.value || vozPersonalizadaURI;
  vozPersonalizadaSelect.innerHTML = "";
  for (const v of voices) {
    const opt = document.createElement("option");
    opt.value = v.voiceURI || v.name;
    const genero = generoProbable(v);
    opt.textContent = `${v.name} (${v.lang})${genero ? " — probablemente " + genero : ""}`;
    vozPersonalizadaSelect.appendChild(opt);
  }
  if (valorPrevio && voices.some(v => (v.voiceURI || v.name) === valorPrevio)) {
    vozPersonalizadaSelect.value = valorPrevio;
  }
}
if (vozPersonalizadaSelect) {
  vozPersonalizadaSelect.addEventListener("change", e => {
    vozPersonalizadaURI = e.target.value;
    localStorage.setItem("medusaVozPersonalizadaURI", vozPersonalizadaURI);
  });
}

// Si el navegador solo tiene una voz en español, todos los modos usan la
// misma voz base (solo cambia pitch/velocidad, que algunos navegadores
// como Safari aplican de forma limitada) — se avisa para que quede claro
// que no es un error, sino una limitación de las voces instaladas.
function avisarSiUnaSolaVoz() {
  const esVoices = window.speechSynthesis.getVoices().filter(v => /^es/i.test(v.lang));
  const nota = document.getElementById("vozUnicaNota");
  if (nota) nota.style.display = esVoices.length > 1 ? "none" : "block";
}
function alCambiarVoces() {
  avisarSiUnaSolaVoz();
  poblarSelectorDeVoces();
}
if ("speechSynthesis" in window) {
  alCambiarVoces();
  window.speechSynthesis.onvoiceschanged = alCambiarVoces;
}

// === Configuración efectiva según el modo actual ===
function configModoActual() {
  const modo = MODOS_VOZ[vozModo] || MODOS_VOZ.asistente;
  if (vozModo === "personalizada") {
    return {
      pitch: vozTonoManual !== null ? vozTonoManual : 1,
      rate: 1,
      volume: vozVolumenPersonalizada
    };
  }
  return {
    pitch: vozTonoManual !== null ? vozTonoManual : modo.pitch,
    rate: modo.rate,
    volume: modo.volume
  };
}

function vozParaModoActual() {
  return vozModo === "personalizada" ? vozPersonalizadaSeleccionada() : mejorVozDisponible();
}

// La voz de IA (ElevenLabs) no tiene un modo "personalizada": el backend
// solo distingue hombre/mujer. Si el usuario eligió a mano una voz que
// parece femenina en "Personalizada", se le pide esa; en cualquier otro
// caso (los 5 modos preestablecidos no son inherentemente masculinos ni
// femeninos) se usa la voz "hombre" configurada en el backend.
function generoParaElevenLabs() {
  if (vozModo === "personalizada") {
    const voice = vozPersonalizadaSeleccionada();
    if (voice && generoProbable(voice) === "femenina") return "mujer";
  }
  return "hombre";
}

// === División correcta del texto ===
// Protege del corte de oraciones a números decimales, fechas,
// abreviaturas comunes, URLs y emails: se les "esconde" el punto antes de
// partir por puntuación, y se restaura después.
const PATRONES_PROTEGER_PUNTO = [
  // Fechas ANTES que decimales: en "19.07.2026" el patrón de decimales
  // ("\d+\.\d+") mataba solo el primer punto (protegía "19.07" como si
  // fuera un número) y dejaba el segundo punto (entre "07" y "2026") sin
  // proteger, cortando la fecha a la mitad.
  /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g, // fechas
  /\d+\.\d+/g, // decimales
  /\b(Sr|Sra|Srta|Dr|Dra|Ing|Lic|Prof|etc|p\.ej|art|núm|pág|vol|cap|Av|EE\.UU)\./gi, // abreviaturas comunes
  /https?:\/\/[^\s]+/gi, // URLs
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g // emails
];
function protegerPuntuacion(texto) {
  let protegido = texto;
  for (const patron of PATRONES_PROTEGER_PUNTO) {
    protegido = protegido.replace(patron, m => m.replace(/\./g, " "));
  }
  return protegido;
}
function restaurarPuntuacion(texto) {
  return texto.replace(/ /g, ".");
}

const LARGO_FRAGMENTO_MINIMO = 20; // evita fragmentos de una sola palabra

function dividirTextoParaHabla(text, maxLen) {
  const protegido = protegerPuntuacion(text);
  const sentences = protegido.match(/[^.!?\n]+[.!?]*\n?/g) || [protegido];
  const chunks = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length > maxLen && current) {
      chunks.push(restaurarPuntuacion(current.trim()));
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(restaurarPuntuacion(current.trim()));

  // Fusiona fragmentos demasiado cortos con el siguiente, para no leer
  // "palabras sueltas" como si fueran una oración completa.
  const fusionados = [];
  for (const c of chunks) {
    if (fusionados.length && fusionados[fusionados.length - 1].length < LARGO_FRAGMENTO_MINIMO) {
      fusionados[fusionados.length - 1] += " " + c;
    } else {
      fusionados.push(c);
    }
  }
  return fusionados;
}

function chunkText(text, maxLen = 220) {
  return dividirTextoParaHabla(text, maxLen);
}

// === Lectura dinámica: analiza cada fragmento y ajusta pitch/velocidad/
// pausas según el tipo de contenido, en vez de leer todo con el mismo
// ritmo. Los ajustes son multiplicadores sobre el pitch/velocidad del
// modo actual, no lo reemplazan. ===
const RE_TITULO = /^#{1,6}\s+.+|^[A-ZÁÉÍÓÚÑ0-9][^.!?]{0,79}$/;
const RE_LISTA = /^\s*([-*•]|\d+[.)])\s+/;
const RE_PREGUNTA = /\?\s*$/;
const RE_ADVERTENCIA = /\b(advertencia|atenci[oó]n|cuidado|alerta|error|problema|falla|inconsistencia|riesgo)\b/i;
const RE_EJEMPLO = /\bpor ejemplo\b|\bej\.:?/i;
const RE_DEFINICION = /^[^:]{2,40}:\s+\S/; // "Concepto: explicación"

function analizarFragmento(fragmentoOriginal) {
  let texto = fragmentoOriginal.trim();
  let tipo = "normal";
  let pitchMult = 1, rateMult = 1, pausaAntesMs = 60, pausaDespuesMs = 120;

  // El orden importa: "Advertencia: ..." también matchea el patrón de
  // definición ("concepto: explicación"), así que advertencia se revisa
  // antes para que gane la clasificación más específica.
  if (RE_LISTA.test(texto)) {
    tipo = "lista";
    texto = texto.replace(RE_LISTA, ""); // no leer el guión/número/viñeta
    pausaAntesMs = 80; pausaDespuesMs = 220;
  } else if (RE_TITULO.test(texto) && texto.length < 80) {
    tipo = "titulo";
    texto = texto.replace(/^#{1,6}\s+/, "").replace(/[*_#]+/g, "");
    pausaAntesMs = 300; pausaDespuesMs = 280; rateMult = 1.0;
  } else if (RE_ADVERTENCIA.test(texto)) {
    tipo = "advertencia";
    pitchMult = 0.9; rateMult = 0.85; pausaAntesMs = 180;
    texto = `... ${texto}`;
  } else if (RE_PREGUNTA.test(texto)) {
    tipo = "pregunta";
    pitchMult = 1.05; pausaDespuesMs = 260;
  } else if (RE_DEFINICION.test(texto)) {
    tipo = "definicion";
    rateMult = 0.95; pausaDespuesMs = 200;
  } else if (RE_EJEMPLO.test(texto)) {
    tipo = "ejemplo";
    pausaAntesMs = 160; pausaDespuesMs = 180;
  }

  return { texto, tipo, pitchMult, rateMult, pausaAntesMs, pausaDespuesMs };
}

// === Guard global: evita audios superpuestos ===
// Antes de reproducir cualquier cosa nueva (muestra, lectura, respuesta
// del chat) se cancela lo que estuviera sonando, se libera cualquier URL
// de audio de IA creada con URL.createObjectURL, y se invalida cualquier
// callback de lectura pendiente (por token), para que nunca se solapen
// dos voces ni se siga leyendo después de "Detener".
let audioIAActivo = null;
let lecturaToken = 0;

function detenerTodoAhora() {
  lecturaToken++; // invalida cualquier onend/avance pendiente de la lectura
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  if (audioIAActivo) {
    try { audioIAActivo.pause(); URL.revokeObjectURL(audioIAActivo.src); } catch {}
    audioIAActivo = null;
  }
}
if (detenerVozBtn) {
  detenerVozBtn.addEventListener("click", () => {
    detenerTodoAhora();
    lecturaEnCurso = false;
    lecturaPausada = false;
    marcarEstadoLectura("⏹️ Detenido.");
    actualizarSubtitulo("");
    sincronizarBotonPausa();
  });
}

// Se llama desde documentos.js justo antes de reemplazar el documento
// cargado: si había una lectura activa del documento anterior, se
// cancela y se resetea el progreso — si no, seguiría leyendo fragmentos
// de un texto que ya no está.
function detenerLecturaPorNuevoDocumento() {
  detenerTodoAhora();
  lecturaEnCurso = false;
  lecturaPausada = false;
  fragmentosLectura = [];
  fragmentoActualIndex = 0;
  actualizarSubtitulo("");
  if (progresoLecturaEl) progresoLecturaEl.textContent = "";
  sincronizarBotonPausa();
}

// === Lectura fragmento por fragmento, con progreso y navegación ===
let fragmentosLectura = [];
let fragmentoActualIndex = 0;
let lecturaEnCurso = false;
let lecturaPausada = false;

function actualizarSubtitulo(texto) {
  if (!subtitulosVozEl) return;
  subtitulosVozEl.hidden = !texto;
  subtitulosVozEl.textContent = texto;
}

function actualizarProgreso() {
  if (!progresoLecturaEl) return;
  const total = fragmentosLectura.length;
  if (!total) { progresoLecturaEl.textContent = ""; return; }
  const actual = Math.min(fragmentoActualIndex + 1, total);
  const pct = Math.round((actual / total) * 100);
  progresoLecturaEl.textContent = `Fragmento ${actual} de ${total} — ${pct}% completado`;
}

function prepararLectura(texto) {
  fragmentosLectura = dividirTextoParaHabla(texto, 240);
  fragmentoActualIndex = 0;
}

function hablarFragmentoActual() {
  const miToken = lecturaToken;
  if (!vozActiva || fragmentoActualIndex >= fragmentosLectura.length) {
    lecturaEnCurso = false;
    marcarEstadoLectura(fragmentosLectura.length ? "🟢 Listo (lectura completa)." : "🟢 Listo.");
    actualizarSubtitulo("");
    return;
  }
  const analisis = analizarFragmento(fragmentosLectura[fragmentoActualIndex]);
  const cfg = configModoActual();
  const voice = vozParaModoActual();

  actualizarProgreso();
  actualizarSubtitulo(analisis.texto);
  marcarEstadoLectura("▶️ Reproduciendo...");

  setTimeout(() => {
    if (miToken !== lecturaToken) return;
    const utterance = new SpeechSynthesisUtterance(analisis.texto);
    utterance.lang = (voice && voice.lang) || "es-UY";
    utterance.pitch = Math.min(2, Math.max(0, cfg.pitch * analisis.pitchMult));
    utterance.rate = Math.min(2, Math.max(0.3, cfg.rate * vozVelocidad * analisis.rateMult));
    utterance.volume = cfg.volume;
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      if (miToken !== lecturaToken) return;
      setTimeout(() => {
        if (miToken !== lecturaToken) return;
        fragmentoActualIndex++;
        hablarFragmentoActual();
      }, analisis.pausaDespuesMs);
    };
    utterance.onerror = e => {
      if (miToken !== lecturaToken) return;
      // "canceled"/"interrupted" son cancelaciones propias (Detener, Siguiente,
      // nuevo documento, etc.) — se ignoran. Cualquier otro código (por
      // ejemplo "synthesis-failed" o "voice-unavailable", cuando el
      // dispositivo no tiene voces instaladas) es un error real: se corta
      // la lectura y se avisa, en vez de quedar "Reproduciendo..." para
      // siempre sin sonar nada.
      if (e.error === "canceled" || e.error === "interrupted") return;
      lecturaEnCurso = false;
      marcarEstadoLectura("❌ Error al reproducir la voz. Puede que tu dispositivo no tenga voces instaladas.");
    };
    window.speechSynthesis.speak(utterance);
  }, analisis.pausaAntesMs);
}

function irAFragmento(index) {
  if (index < 0 || index >= fragmentosLectura.length) return;
  detenerTodoAhora();
  fragmentoActualIndex = index;
  lecturaEnCurso = true;
  lecturaPausada = false;
  sincronizarBotonPausa();
  hablarFragmentoActual();
}

// === Controles de reproducción ===
playBtn.addEventListener("click", () => {
  if (!documentoCargado) {
    marcarEstadoLectura("⚠️ Cargá un documento o archivo primero.");
    return;
  }
  detenerTodoAhora();
  marcarEstadoLectura("⏳ Procesando...");
  prepararLectura(documentoCargado);
  lecturaEnCurso = true;
  lecturaPausada = false;
  sincronizarBotonPausa();
  hablarFragmentoActual();
});
if (reiniciarVozBtn) {
  reiniciarVozBtn.addEventListener("click", () => {
    if (!documentoCargado) return;
    if (!fragmentosLectura.length) prepararLectura(documentoCargado);
    marcarEstadoLectura("↻ Reiniciando desde el principio...");
    irAFragmento(0);
  });
}
// Mantiene el texto del botón sincronizado con lecturaPausada sin
// importar desde dónde haya cambiado (Reproducir/Reiniciar/Siguiente
// también resetean lecturaPausada a false).
function sincronizarBotonPausa() {
  if (!pausaReanudarBtn) return;
  if (lecturaPausada) {
    pausaReanudarBtn.textContent = "⏵ Reanudar";
    pausaReanudarBtn.setAttribute("aria-label", "Reanudar lectura");
    pausaReanudarBtn.setAttribute("aria-pressed", "true");
  } else {
    pausaReanudarBtn.textContent = "⏸️ Pausar";
    pausaReanudarBtn.setAttribute("aria-label", "Pausar lectura");
    pausaReanudarBtn.setAttribute("aria-pressed", "false");
  }
}

// Un solo botón que alterna pausar/reanudar (antes eran dos botones
// separados): además de ser más simple de usar, deja lugar para que
// "Detener" siempre esté visible en el panel, sin quedar como el botón
// "sobrante" que se cortaba en pantallas chicas.
pausaReanudarBtn.addEventListener("click", () => {
  if (lecturaPausada) {
    // El Web Speech API no permite "continuar desde donde se pausó" con
    // precisión de palabra: speechSynthesis.resume() retoma la síntesis
    // pendiente, pero si el navegador la había descartado (algunos lo
    // hacen tras mucho tiempo pausado) reinicia el fragmento actual. Es
    // una limitación del navegador, no de MedusaLee.
    window.speechSynthesis.resume();
    lecturaPausada = false;
    marcarEstadoLectura("⏵ Reanudado.");
  } else if (lecturaEnCurso && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
    window.speechSynthesis.pause();
    lecturaPausada = true;
    marcarEstadoLectura("⏸️ Pausado.");
  }
  sincronizarBotonPausa();
});
if (fragmentoSiguienteBtn) {
  fragmentoSiguienteBtn.addEventListener("click", () => irAFragmento(fragmentoActualIndex + 1));
}
if (fragmentoAnteriorBtn) {
  fragmentoAnteriorBtn.addEventListener("click", () => irAFragmento(fragmentoActualIndex - 1));
}

// Mensaje visible de qué sistema de voz se usó (o se intentó usar), para
// que quede claro si sonó la IA o el respaldo del navegador.
function actualizarEstadoVoz(mensaje) {
  if (vozEstado) vozEstado.textContent = mensaje;
}

// Lee un texto corto (respuesta del chat, muestra) con la voz del
// navegador, respetando el modo actual, SIN el motor de fragmentos (no
// hace falta progreso/navegación para un mensaje corto).
function speakRobotic(text, { interrupt = true } = {}) {
  if (!vozActiva || !text || !("speechSynthesis" in window)) return;
  if (interrupt) detenerTodoAhora();
  const cfg = configModoActual();
  const voice = vozParaModoActual();
  const chunks = chunkText(text);
  const miToken = lecturaToken;
  for (const chunk of chunks) {
    const analisis = analizarFragmento(chunk);
    const utterance = new SpeechSynthesisUtterance(analisis.texto);
    utterance.lang = (voice && voice.lang) || "es-UY";
    utterance.pitch = Math.min(2, Math.max(0, cfg.pitch * analisis.pitchMult));
    utterance.rate = Math.min(2, Math.max(0.3, cfg.rate * vozVelocidad * analisis.rateMult));
    utterance.volume = cfg.volume;
    if (voice) utterance.voice = voice;
    utterance.onerror = e => {
      if (miToken !== lecturaToken) return;
      if (e.error === "canceled" || e.error === "interrupted") return;
      marcarEstadoLectura("❌ Error al reproducir la voz. Puede que tu dispositivo no tenga voces instaladas.");
    };
    if (miToken === lecturaToken) window.speechSynthesis.speak(utterance);
  }
}

// Voz de IA (ElevenLabs) vía el backend, solo para las respuestas
// cortas del chat — la lectura del documento completo se queda con la
// voz del navegador (gratis, sin límite de caracteres). "Robótica"
// tampoco usa IA a propósito: se supone que suene sintética. El audio
// se reproduce a velocidad 1: el ritmo ya lo aplica ElevenLabs del lado
// del servidor (voice_settings.speed), así que no se reduce dos veces.
// ElevenLabs es opcional: si falla, no está configurado, o se agota la
// cuota, se cae automáticamente a la voz del navegador sin romper nada.
async function speakConIA(text) {
  if (!vozActiva || !text) return false;
  if (vozModo === "robotica" || !vozIA) {
    actualizarEstadoVoz("🔈 Usando voz del dispositivo");
    return false;
  }
  if (!BACKEND_URL) {
    actualizarEstadoVoz("⚠️ ElevenLabs no está configurado");
    return false;
  }
  try {
    const res = await fetch(`${BACKEND_URL}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, tipo: generoParaElevenLabs() })
    });
    if (!res.ok) {
      let detalle = "";
      try { detalle = (await res.json()).error || ""; } catch {}
      actualizarEstadoVoz(
        /ELEVENLABS_API_KEY/i.test(detalle)
          ? "⚠️ ElevenLabs no está configurado"
          : "❌ La voz IA no está disponible. Voy a continuar con la voz del dispositivo."
      );
      return false;
    }
    detenerTodoAhora(); // por si quedó algo sonando justo antes de que llegue la respuesta
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioIAActivo = audio;
    audio.addEventListener("ended", () => {
      URL.revokeObjectURL(url);
      if (audioIAActivo === audio) audioIAActivo = null;
    });
    await audio.play();
    actualizarEstadoVoz("🧠 Voz IA activa");
    return true;
  } catch (err) {
    console.warn("Voz IA (ElevenLabs) falló, uso la voz del navegador:", err);
    actualizarEstadoVoz("❌ La voz IA no está disponible. Voy a continuar con la voz del dispositivo.");
    return false;
  }
}

async function hablar(text) {
  const ok = await speakConIA(text);
  if (!ok) speakRobotic(text);
}

// "Escuchar muestra": reproduce la frase de referencia con la
// configuración del modo seleccionado (voz del navegador, no IA — los
// modos ajustan pitch/velocidad/volumen, que son parámetros del habla del
// dispositivo). Cancela cualquier muestra o lectura anterior antes de
// empezar, para que nunca se superpongan dos muestras.
const TEXTO_MUESTRA = "Hola, soy MedusaLee. Voy a ayudarte a escuchar, entender y consultar tus documentos.";
if (escucharMuestraBtn) {
  escucharMuestraBtn.addEventListener("click", () => {
    if (!vozActiva) { marcarEstadoLectura("⚠️ Activá la voz para escuchar una muestra."); return; }
    speakRobotic(TEXTO_MUESTRA);
  });
}

// "Probar voz IA (chat)": reproduce siempre la misma frase de referencia,
// con la misma prioridad IA → navegador que usa el chat.
const TEXTO_PRUEBA_VOZ = "Buenos días, Rodri. Todos los sistemas se encuentran operativos. Revisé la información y preparé un resumen claro para que podamos continuar.";
if (probarVozBtn) {
  probarVozBtn.addEventListener("click", () => hablar(TEXTO_PRUEBA_VOZ));
}

// "Leer fragmento con voz IA": SOLO el texto seleccionado, o si no hay
// selección, un fragmento corto del documento cargado — nunca lee el
// documento completo (eso sigue siendo exclusivo de ▶️ Reproducir, con
// la voz gratis del navegador).
const LARGO_FRAGMENTO_CORTO = 600;
if (leerFragmentoBtn) {
  leerFragmentoBtn.addEventListener("click", () => {
    const seleccion = window.getSelection().toString().trim();
    const fragmento = seleccion || (documentoCargado || "").slice(0, LARGO_FRAGMENTO_CORTO);
    if (!fragmento) {
      actualizarEstadoVoz("⚠️ Seleccioná texto o cargá un documento primero.");
      return;
    }
    hablar(fragmento);
  });
}

// === Objetivo del documento: adapta el modo de voz (y el estilo de las
// respuestas del chat, vía objetivoActual) a lo que el usuario quiere
// lograr. Es solo una personalización del estilo de comunicación — no
// analiza a la persona ni garantiza resultados (ver nota en el panel). ===
const objetivoPanelEl = document.getElementById("objetivoPanel");
const objetivoOpcionesEl = document.getElementById("objetivoOpciones");
const cambiarObjetivoBtn = document.getElementById("cambiarObjetivoBtn");

const OBJETIVOS = [
  { id: "entender", texto: "Entenderlo desde cero", modo: "docente" },
  { id: "estudiar", texto: "Estudiar para una evaluación", modo: "docente" },
  { id: "presentacion", texto: "Preparar una presentación", modo: "asistente" },
  { id: "resumen", texto: "Obtener un resumen", modo: "resumen" },
  { id: "completo", texto: "Escucharlo completo", modo: "concentracion" },
  { id: "puntual", texto: "Encontrar información puntual", modo: "asistente" }
];

let objetivoActual = localStorage.getItem("medusaObjetivo") || null;

function renderObjetivoOpciones() {
  if (!objetivoOpcionesEl) return;
  objetivoOpcionesEl.innerHTML = "";
  for (const o of OBJETIVOS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = o.texto;
    if (o.id === objetivoActual) btn.classList.add("elegido");
    btn.addEventListener("click", () => elegirObjetivo(o));
    objetivoOpcionesEl.appendChild(btn);
  }
}

function elegirObjetivo(o) {
  objetivoActual = o.id;
  localStorage.setItem("medusaObjetivo", objetivoActual);
  vozModo = o.modo;
  vozModoSelect.value = vozModo;
  localStorage.setItem("medusaVozModo", vozModo);
  actualizarDescModo();
  renderObjetivoOpciones();
  if (objetivoPanelEl) objetivoPanelEl.hidden = true;
  marcarEstadoLectura(`🟢 Listo. Ajusté el modo de voz a "${MODOS_VOZ[vozModo].nombre}" para ese objetivo.`);
}

document.addEventListener("medusa:documento-listo", () => {
  if (!objetivoPanelEl) return;
  objetivoPanelEl.hidden = false;
  renderObjetivoOpciones();
});
if (cambiarObjetivoBtn) {
  cambiarObjetivoBtn.addEventListener("click", () => {
    if (!documentoCargado) { marcarEstadoLectura("⚠️ Cargá un documento primero."); return; }
    if (objetivoPanelEl) { objetivoPanelEl.hidden = false; renderObjetivoOpciones(); toggleMenu(false); }
  });
}
