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
    protegido = protegido.replace(patron, m => m.replace(/\./g, "\u0000"));
  }
  return protegido;
}
function restaurarPuntuacion(texto) {
  return texto.replace(/\u0000/g, ".");
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

// === Preparación de texto para la voz de IA (ElevenLabs) ===
// dividirTextoParaHabla (arriba) solo evita cortar oraciones a la mitad;
// esto además LIMPIA el texto para que se escuche natural: saca marcado
// que no debe pronunciarse, convierte viñetas/URLs/emails en frases
// habladas, y adapta números y siglas. No cambia el significado del
// texto, solo cómo se dice en voz alta.
//
// El diccionario de pronunciación es un punto de partida razonable, NO
// validado de oído contra la API real de ElevenLabs (sin acceso a
// internet en este entorno no se pudo escuchar el resultado) — conviene
// ajustarlo después de probarlo con la voz configurada.
const DICCIONARIO_PRONUNCIACION = {
  "MedusaLee": "Medusa Li",
  "Groq": "Grok",
  "GitHub": "Guitjab",
  "JavaScript": "Yavascript",
  "Node.js": "Node yeis",
  "Apps Script": "Aps Scrip",
  "API": "A, P, I",
  "PDF": "P, D, F",
  "DOCX": "documento de Word",
  "Uruguay": "Uruguay"
};

// Se puede agregar o pisar entradas en tiempo de ejecución sin tocar el
// diccionario base (por ejemplo desde la consola, para probar variantes).
function agregarPronunciacion(termino, comoSeDice) {
  DICCIONARIO_PRONUNCIACION[termino] = comoSeDice;
}

const MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function humanizarFecha(dia, mes, anio) {
  const d = parseInt(dia, 10), m = parseInt(mes, 10);
  if (m < 1 || m > 12) return null;
  const anioCompleto = anio.length === 2 ? `20${anio}` : anio;
  return `${d} de ${MESES_ES[m - 1]} de ${anioCompleto}`;
}

function prepararTextoParaTTS(textoOriginal, opciones = {}) {
  if (!textoOriginal) return "";
  let texto = textoOriginal;

  // 1) Markdown que no debe pronunciarse: encabezados, negrita, cursiva,
  // código, tachado — se conserva el texto, se saca el marcado.
  texto = texto
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/[*_#~]{2,}/g, "");

  // 2) Emojis puramente decorativos: se sacan (no aportan nada al decirlos).
  texto = texto.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]/gu, "");

  // 3) Viñetas y numeración de listas al principio de línea -> se quita el
  // símbolo, la frase queda como texto corrido natural.
  texto = texto.replace(/^\s*([-*•▪◦]|\d+[.)])\s+/gm, "");

  // 4) URLs largas -> no se leen letra por letra.
  texto = texto.replace(/https?:\/\/[^\s]+/gi, "enlace disponible");

  // 5) Emails -> pronunciación entendible ("nombre arroba dominio punto com").
  texto = texto.replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, (_, usuario, dominio) => {
    return `${usuario} arroba ${dominio.replace(/\./g, " punto ")}`;
  });

  // 6) Fechas DD/MM/YYYY o DD.MM.YYYY -> "19 de julio de 2026".
  texto = texto.replace(/\b(\d{1,2})[./](\d{1,2})[./](\d{2,4})\b/g, (m, d, mo, y) => humanizarFecha(d, mo, y) || m);

  // 7) Porcentajes y moneda.
  texto = texto
    .replace(/(\d+(?:[.,]\d+)?)\s*%/g, "$1 por ciento")
    .replace(/(?:U\$S|USD)\s?(\d+(?:[.,]\d+)?)/gi, "$1 dólares")
    .replace(/\$\s?(\d+(?:[.,]\d+)?)/g, "$1 pesos");

  // 8) Diccionario de pronunciación (términos técnicos y nombres propios).
  for (const [termino, comoSeDice] of Object.entries(DICCIONARIO_PRONUNCIACION)) {
    const re = new RegExp(`\\b${termino.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    texto = texto.replace(re, comoSeDice);
  }

  // 9) Pausas moderadas entre párrafos (double newline) — una elipsis
  // genera una pausa breve y natural sin necesitar SSML.
  texto = texto.replace(/\n{2,}/g, "... ").replace(/\n/g, " ");

  // 10) Se conservan "?" y "!" (aportan entonación); se limpian espacios
  // repetidos y puntuación duplicada (por ejemplo "párrafo.... Segundo",
  // cuando el párrafo ya terminaba en punto antes de agregar la pausa).
  texto = texto.replace(/\.{2,}/g, "...").replace(/[ \t]{2,}/g, " ").trim();

  return texto;
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
    try {
      audioIAActivo.pause();
      // Los audios de bloques de documento (motor de IA) están guardados
      // en cacheAudioIA para poder repetirlos sin volver a gastar cuota —
      // NO se revoca ese URL acá (marcados con dataset.cacheado). Los
      // audios "sueltos" (respuesta del chat, muestra) sí se liberan.
      if (audioIAActivo.dataset?.cacheado !== "1") URL.revokeObjectURL(audioIAActivo.src);
    } catch {}
    audioIAActivo = null;
  }
}
if (detenerVozBtn) {
  detenerVozBtn.addEventListener("click", () => {
    detenerTodoAhora();
    lecturaEnCurso = false;
    lecturaPausada = false;
    lecturaIAActiva = false;
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
  lecturaRestringidaASeccion = false;
  limpiarCacheAudioIA(); // libera los ObjectURL cacheados del documento anterior
  actualizarSubtitulo("");
  if (progresoLecturaEl) progresoLecturaEl.textContent = "";
  sincronizarBotonPausa();
  // Documento nuevo: la vista/índice/progreso guardado del anterior ya no
  // corresponden a nada.
  vistaDocumentoFragmentos = [];
  vistaDocumentoRenderizada = false;
  seccionesToc = [];
  if (documentoVistaPanel) documentoVistaPanel.hidden = true;
  if (verDocumentoBtn) verDocumentoBtn.setAttribute("aria-expanded", "false");
  if (continuarLecturaBtn) continuarLecturaBtn.hidden = true;
  if (descargarAudioBtn) descargarAudioBtn.hidden = true;
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
  const partes = [`Fragmento ${actual} de ${total} — ${pct}% completado`];
  const pagina = paginaDelFragmentoActual();
  if (pagina) partes.push(`Página ${pagina}`);
  const tiempoRestante = estimarTiempoRestante(fragmentosLectura, fragmentoActualIndex, lecturaIAActiva ? 1 : vozVelocidad);
  if (tiempoRestante) partes.push(tiempoRestante);
  progresoLecturaEl.textContent = partes.join(" — ");
  actualizarResaltadoVista();
  guardarProgresoLectura();
  actualizarBotonDescargaAudio();
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

// === Segundo motor: lectura de documento completo con voz IA (opcional) ===
// A diferencia de la voz del navegador (fragmento por fragmento,
// secuencial y gratis), acá se arma una cola: se pide el audio del bloque
// actual y, mientras suena, se empieza a pedir el del siguiente en
// paralelo — así no hay silencios largos entre bloques. Los audios ya
// generados quedan en caché (por índice de bloque) mientras dure esta
// sesión de lectura: volver atrás no vuelve a gastar cuota. Es opt-in
// (checkbox "Leer el documento completo con voz IA") porque consume
// cuota de ElevenLabs a diferencia de la lectura con voz del navegador.
const lecturaDocumentoIAToggle = document.getElementById("lecturaDocumentoIA");
const vocesIADisponiblesEl = document.getElementById("vocesIADisponibles");

let vozLecturaIA = (localStorage.getItem("medusaLecturaDocumentoIA") ?? "0") === "1";
if (lecturaDocumentoIAToggle) {
  lecturaDocumentoIAToggle.checked = vozLecturaIA;
  lecturaDocumentoIAToggle.addEventListener("change", e => {
    vozLecturaIA = e.target.checked;
    localStorage.setItem("medusaLecturaDocumentoIA", vozLecturaIA ? "1" : "0");
  });
}

let bloquesIA = [];
let lecturaIAActiva = false;
let cacheAudioIA = new Map(); // índice de bloque -> { url }
let prefetchEnCursoIA = new Map(); // índice de bloque -> Promise

function limpiarCacheAudioIA() {
  for (const { url } of cacheAudioIA.values()) {
    try { URL.revokeObjectURL(url); } catch {}
  }
  cacheAudioIA.clear();
  prefetchEnCursoIA.clear();
  bloquesIA = [];
  lecturaIAActiva = false;
}

async function obtenerAudioBloqueIA(indice) {
  if (cacheAudioIA.has(indice)) return cacheAudioIA.get(indice);
  if (prefetchEnCursoIA.has(indice)) return prefetchEnCursoIA.get(indice);
  const promesa = (async () => {
    const texto = prepararTextoParaTTS(bloquesIA[indice]);
    const res = await fetch(`${BACKEND_URL}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: texto, tipo: generoParaElevenLabs(), contexto: "documento",
        turnstileToken: window.MedusaSeguridad?.tokenTurnstileActual() || undefined
      })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw Object.assign(new Error(data.error || "Error al generar audio"), { codigo: data.codigo });
    }
    const blob = await res.blob();
    const entrada = { url: URL.createObjectURL(blob) };
    cacheAudioIA.set(indice, entrada);
    return entrada;
  })();
  prefetchEnCursoIA.set(indice, promesa);
  try {
    return await promesa;
  } finally {
    prefetchEnCursoIA.delete(indice);
  }
}

async function reproducirBloqueIA(indice) {
  const miToken = lecturaToken;
  if (indice >= bloquesIA.length) {
    lecturaIAActiva = false;
    lecturaEnCurso = false;
    marcarEstadoLectura("🟢 Listo (lectura completa).");
    actualizarSubtitulo("");
    return;
  }
  fragmentoActualIndex = indice; // reutiliza el índice que ya usa la UI de progreso
  fragmentosLectura = bloquesIA; // para que actualizarProgreso() cuente sobre los bloques de IA
  actualizarProgreso();
  actualizarSubtitulo(bloquesIA[indice].slice(0, 300));
  marcarEstadoLectura("⏳ Preparando audio...");

  let entrada;
  try {
    entrada = await obtenerAudioBloqueIA(indice);
  } catch (err) {
    if (miToken !== lecturaToken) return;
    const mensajes = {
      limite_diario: "❌ Se alcanzó el límite diario de voz IA. Sigo con la voz del dispositivo.",
      falta_voz_espanol: "⚠️ Falta configurar una voz en español. Sigo con la voz del dispositivo.",
      sin_api_key: "⚠️ ElevenLabs no está configurado. Sigo con la voz del dispositivo."
    };
    marcarEstadoLectura(mensajes[err.codigo] || "❌ La voz IA no está disponible. Sigo con la voz del dispositivo.");
    // Respaldo automático: el resto del documento se sigue leyendo con la
    // voz gratuita del navegador, sin cortar la experiencia.
    lecturaIAActiva = false;
    prepararLectura(bloquesIA.slice(indice).join(" "));
    lecturaEnCurso = true;
    hablarFragmentoActual();
    return;
  }
  if (miToken !== lecturaToken) return;
  actualizarBotonDescargaAudio(); // recién ahora el audio de este bloque quedó cacheado

  // Mientras suena este bloque, se pide el siguiente en paralelo (si
  // existe), para que ya esté listo cuando termine y no haya silencio.
  if (indice + 1 < bloquesIA.length) obtenerAudioBloqueIA(indice + 1).catch(() => {});

  const audio = new Audio(entrada.url);
  audio.dataset.cacheado = "1"; // no revocar su URL al pausar/detener: vive en cacheAudioIA
  audioIAActivo = audio;
  marcarEstadoLectura("▶️ Reproduciendo (voz IA)...");
  audio.addEventListener("ended", () => {
    if (audioIAActivo === audio) audioIAActivo = null;
    if (miToken !== lecturaToken || !lecturaIAActiva || lecturaPausada) return;
    reproducirBloqueIA(indice + 1);
  });
  try {
    await audio.play();
  } catch {
    /* el navegador puede bloquear el autoplay sin una interacción reciente */
  }
}

function irABloqueIA(indice) {
  if (indice < 0 || indice >= bloquesIA.length) return;
  detenerTodoAhora();
  lecturaIAActiva = true;
  lecturaEnCurso = true;
  lecturaPausada = false;
  sincronizarBotonPausa();
  reproducirBloqueIA(indice);
}

// Actualiza el aviso de qué voces IA hay configuradas en el backend
// (hombre/mujer), sin exponer los voice_id — solo si están disponibles.
async function actualizarVocesIADisponibles() {
  if (!vocesIADisponiblesEl || !BACKEND_URL) return;
  try {
    const res = await fetch(`${BACKEND_URL}/tts/voices`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) { vocesIADisponiblesEl.textContent = ""; return; }
    const data = await res.json();
    if (!data.elevenlabsConfigurado) {
      vocesIADisponiblesEl.textContent = "⚪ ElevenLabs no está configurado en el backend.";
      return;
    }
    const partes = [];
    partes.push(data.voces?.hombre?.disponible ? "👨 voz masculina lista" : "👨 falta configurar voz masculina");
    partes.push(data.voces?.mujer?.disponible ? "👩 voz femenina lista" : "👩 falta configurar voz femenina");
    vocesIADisponiblesEl.textContent = partes.join(" · ");
  } catch {
    vocesIADisponiblesEl.textContent = "";
  }
}
document.addEventListener("medusa:backend-verificado", actualizarVocesIADisponibles);

// === Experiencia de lectura: pagina actual, tiempo restante, resaltado
// del texto en un panel "Ver documento", continuar donde quedaste, tabla
// de contenidos y descarga de audio ===
// Todo esto es aditivo: no cambia la forma de fragmentosLectura/bloquesIA
// (siguen siendo arrays de strings, ya probados), para no arriesgar una
// regresion en la lectura en si. En vez de eso, se calculan offsets
// aproximados dentro de documentoCargado para ubicar la pagina y el
// fragmento correspondiente en la vista del documento.

const continuarLecturaBtn = document.getElementById("continuarLecturaBtn");
const verDocumentoBtn = document.getElementById("verDocumentoBtn");
const documentoVistaPanel = document.getElementById("documentoVistaPanel");
const documentoVistaTexto = document.getElementById("documentoVistaTexto");
const documentoVistaToc = document.getElementById("documentoVistaToc");
const documentoVistaTocLista = document.getElementById("documentoVistaTocLista");
const descargarAudioBtn = document.getElementById("descargarAudioBtn");

const CLAVE_PROGRESO_LECTURA = "medusaProgresoLectura";
const MAX_FRAGMENTOS_VISTA = 400; // limite razonable: evita crear miles de nodos DOM en documentos enormes

// true mientras se esta leyendo solo una seccion (ver leerSeccion): en ese
// caso los offsets de fragmentosLectura no corresponden a documentoCargado
// completo, asi que se evita mostrar pagina/guardar progreso con ellos.
let lecturaRestringidaASeccion = false;

// Hash simple (no criptografico, solo para detectar "es el mismo
// documento que la vez pasada").
function hashSimpleTexto(texto) {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
  return `${texto.length}-${h.toString(36)}`;
}

// Limites de pagina dentro de documentoCargado, a partir de
// documentoBloques (solo lo trae PDF, como {pagina, texto}). null si el
// documento no tiene informacion de pagina (DOCX/TXT/URL generica).
function construirLimitesPaginas() {
  if (typeof documentoBloques === "undefined" || !documentoBloques.length || documentoBloques[0].pagina === undefined) return null;
  const limites = [];
  let offset = 0;
  for (const b of documentoBloques) {
    offset += b.texto.length + 1; // +1 por el separador "\n" que documentos.js usa al unir
    limites.push({ finOffset: offset, pagina: b.pagina });
  }
  return limites;
}

function paginaParaOffset(offset, limites) {
  for (const l of limites) if (offset < l.finOffset) return l.pagina;
  return limites.length ? limites[limites.length - 1].pagina : null;
}

// Offset aproximado (dentro del array de fragmentos activo) del fragmento
// que se esta leyendo ahora mismo.
function offsetFragmentoActual() {
  if (!fragmentosLectura.length) return null;
  let offset = 0;
  for (let i = 0; i < fragmentoActualIndex && i < fragmentosLectura.length; i++) offset += fragmentosLectura[i].length + 1;
  return offset;
}

function paginaDelFragmentoActual() {
  if (lecturaRestringidaASeccion) return null;
  const limites = construirLimitesPaginas();
  if (!limites) return null;
  const offset = offsetFragmentoActual();
  if (offset === null) return null;
  return paginaParaOffset(offset, limites);
}

// Estimacion aproximada de cuanto falta, a partir de un ritmo de habla
// tipico (unos 13 caracteres por segundo a velocidad 1x). No puede ser
// exacta: depende de pausas entre fragmentos, del motor de voz real, y de
// las pausas que agrega analizarFragmento().
const CARACTERES_POR_SEGUNDO_BASE = 13;
function estimarTiempoRestante(fragmentos, indiceActual, factorVelocidad) {
  let caracteresRestantes = 0;
  for (let i = indiceActual; i < fragmentos.length; i++) caracteresRestantes += fragmentos[i].length;
  const segundos = caracteresRestantes / (CARACTERES_POR_SEGUNDO_BASE * Math.max(0.3, factorVelocidad || 1));
  if (!isFinite(segundos) || segundos <= 0) return "";
  if (segundos < 60) return "~1 min restante";
  const minutos = Math.round(segundos / 60);
  return `~${minutos} min restante${minutos === 1 ? "" : "s"}`;
}

// --- Vista del documento completo (panel "Ver documento") ---
let vistaDocumentoFragmentos = []; // [{texto, pagina, inicioOffset}]
let vistaDocumentoRenderizada = false;

function construirVistaDocumento() {
  vistaDocumentoFragmentos = [];
  vistaDocumentoRenderizada = false;
  if (!documentoCargado) return;
  const limites = construirLimitesPaginas();
  const trozos = dividirTextoParaHabla(documentoCargado, 240);
  let offset = 0;
  vistaDocumentoFragmentos = trozos.map(texto => {
    const inicioOffset = offset;
    offset += texto.length + 1;
    return { texto, pagina: limites ? paginaParaOffset(inicioOffset, limites) : null, inicioOffset };
  });
}

function renderizarVistaDocumento() {
  if (!documentoVistaTexto || vistaDocumentoRenderizada) return;
  documentoVistaTexto.innerHTML = "";
  const limite = Math.min(vistaDocumentoFragmentos.length, MAX_FRAGMENTOS_VISTA);
  for (let i = 0; i < limite; i++) {
    const span = document.createElement("span");
    span.className = "frag";
    span.dataset.indice = String(i);
    span.textContent = vistaDocumentoFragmentos[i].texto + " ";
    documentoVistaTexto.appendChild(span);
  }
  if (vistaDocumentoFragmentos.length > MAX_FRAGMENTOS_VISTA) {
    const aviso = document.createElement("div");
    aviso.className = "frag-truncado";
    aviso.textContent = `(vista recortada: se muestran los primeros ${MAX_FRAGMENTOS_VISTA} fragmentos de ${vistaDocumentoFragmentos.length} -- la lectura en voz alta si llega hasta el final)`;
    documentoVistaTexto.appendChild(aviso);
  }
  vistaDocumentoRenderizada = true;
}

function actualizarResaltadoVista() {
  if (!documentoVistaTexto || !vistaDocumentoRenderizada || !vistaDocumentoFragmentos.length) return;
  const anterior = documentoVistaTexto.querySelector(".frag-actual");
  if (anterior) anterior.classList.remove("frag-actual");
  if (lecturaRestringidaASeccion) return; // los offsets de la vista no corresponden a esta lectura parcial
  const offsetActual = offsetFragmentoActual();
  if (offsetActual === null) return;
  let elegido = null;
  for (const f of vistaDocumentoFragmentos) {
    if (f.inicioOffset <= offsetActual) elegido = f; else break;
  }
  if (!elegido) return;
  const indiceVista = vistaDocumentoFragmentos.indexOf(elegido);
  if (indiceVista >= MAX_FRAGMENTOS_VISTA) return;
  const span = documentoVistaTexto.querySelector(`[data-indice="${indiceVista}"]`);
  if (span) {
    span.classList.add("frag-actual");
    if (!documentoVistaPanel.hidden) {
      span.scrollIntoView({ block: "center", behavior: (typeof prefiereMenosMovimiento !== "undefined" && prefiereMenosMovimiento) ? "auto" : "smooth" });
    }
  }
}

// --- Tabla de contenidos (solo DOCX: documentoBloques trae tipo:"titulo") ---
let seccionesToc = []; // [{titulo, inicioOffset, finOffset}]
function construirToc() {
  seccionesToc = [];
  if (typeof documentoBloques === "undefined" || !documentoBloques.length || documentoBloques[0].tipo === undefined) return;
  let offset = 0;
  const titulos = [];
  for (const b of documentoBloques) {
    if (b.tipo === "titulo" && b.texto.trim()) titulos.push({ titulo: b.texto, inicioOffset: offset });
    offset += b.texto.length + 1;
  }
  for (let i = 0; i < titulos.length; i++) {
    titulos[i].finOffset = i + 1 < titulos.length ? titulos[i + 1].inicioOffset : documentoCargado.length;
  }
  seccionesToc = titulos;
}

function renderizarToc() {
  if (!documentoVistaToc || !documentoVistaTocLista) return;
  if (!seccionesToc.length) { documentoVistaToc.hidden = true; return; }
  documentoVistaTocLista.innerHTML = "";
  seccionesToc.forEach(seccion => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = seccion.titulo;
    btn.addEventListener("click", () => leerSeccion(seccion));
    documentoVistaTocLista.appendChild(btn);
  });
  documentoVistaToc.hidden = false;
}

// "Leer solo esta seccion": arranca la lectura (con el motor que este
// activo) usando solo el texto entre el titulo elegido y el proximo
// titulo (o el final del documento).
function leerSeccion(seccion) {
  const textoSeccion = documentoCargado.slice(seccion.inicioOffset, seccion.finOffset).trim();
  if (!textoSeccion) return;
  toggleMenu(false);
  if (documentoVistaPanel) documentoVistaPanel.hidden = true;
  if (verDocumentoBtn) verDocumentoBtn.setAttribute("aria-expanded", "false");

  const usarIA = vozLecturaIA && vozIA && vozModo !== "robotica";
  if (usarIA) {
    detenerTodoAhora();
    lecturaRestringidaASeccion = true;
    limpiarCacheAudioIA();
    bloquesIA = dividirTextoParaHabla(textoSeccion, 500);
    marcarEstadoLectura(`Leyendo solo la seccion "${seccion.titulo}"...`);
    irABloqueIA(0);
    return;
  }
  detenerTodoAhora();
  lecturaRestringidaASeccion = true;
  prepararLectura(textoSeccion);
  lecturaEnCurso = true;
  lecturaPausada = false;
  sincronizarBotonPausa();
  marcarEstadoLectura(`Leyendo solo la seccion "${seccion.titulo}"...`);
  hablarFragmentoActual();
}

if (verDocumentoBtn) {
  verDocumentoBtn.addEventListener("click", () => {
    const abrir = documentoVistaPanel.hidden;
    if (abrir) {
      if (!vistaDocumentoFragmentos.length) construirVistaDocumento();
      if (!seccionesToc.length) construirToc();
      renderizarVistaDocumento();
      renderizarToc();
      actualizarResaltadoVista();
    }
    documentoVistaPanel.hidden = !abrir;
    verDocumentoBtn.setAttribute("aria-expanded", String(abrir));
  });
}

// --- Guardado automatico de progreso + "Continuar donde quedaste" ---
function guardarProgresoLectura() {
  if (lecturaRestringidaASeccion || !documentoCargado || !fragmentosLectura.length) return;
  try {
    localStorage.setItem(CLAVE_PROGRESO_LECTURA, JSON.stringify({
      hash: hashSimpleTexto(documentoCargado),
      indice: fragmentoActualIndex,
      motor: lecturaIAActiva ? "ia" : "navegador",
      timestamp: Date.now()
    }));
  } catch {
    // localStorage lleno o bloqueado (por ejemplo, modo privado): no es
    // critico para seguir leyendo, se ignora.
  }
}

function progresoGuardadoParaDocumentoActual() {
  if (!documentoCargado) return null;
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE_PROGRESO_LECTURA) || "null");
    if (!datos || datos.hash !== hashSimpleTexto(documentoCargado)) return null;
    return datos;
  } catch {
    return null;
  }
}

function ofrecerContinuarLectura() {
  if (!continuarLecturaBtn) return;
  const progreso = progresoGuardadoParaDocumentoActual();
  if (!progreso || !(progreso.indice > 0)) { continuarLecturaBtn.hidden = true; return; }
  continuarLecturaBtn.textContent = `Continuar donde quedaste (fragmento ${progreso.indice + 1})`;
  continuarLecturaBtn.hidden = false;
  continuarLecturaBtn.onclick = () => {
    continuarLecturaBtn.hidden = true;
    lecturaRestringidaASeccion = false;
    if (progreso.motor === "ia" && vozLecturaIA && vozIA && vozModo !== "robotica") {
      limpiarCacheAudioIA();
      bloquesIA = dividirTextoParaHabla(documentoCargado, 500);
      irABloqueIA(Math.max(0, Math.min(progreso.indice, bloquesIA.length - 1)));
      return;
    }
    prepararLectura(documentoCargado);
    lecturaEnCurso = true;
    lecturaPausada = false;
    sincronizarBotonPausa();
    irAFragmento(Math.max(0, Math.min(progreso.indice, fragmentosLectura.length - 1)));
  };
}
document.addEventListener("medusa:documento-listo", ofrecerContinuarLectura);

// --- Descarga del audio IA cacheado del fragmento actual ---
function actualizarBotonDescargaAudio() {
  if (!descargarAudioBtn) return;
  if (!lecturaIAActiva) { descargarAudioBtn.hidden = true; return; }
  const entrada = cacheAudioIA.get(fragmentoActualIndex);
  if (!entrada) { descargarAudioBtn.hidden = true; return; }
  descargarAudioBtn.href = entrada.url;
  descargarAudioBtn.download = `medusalee-fragmento-${fragmentoActualIndex + 1}.mp3`;
  descargarAudioBtn.hidden = false;
}


// === Controles de reproducción ===
// playBtn: si el checkbox "Leer documento completo con voz IA" está
// activo (y hay voz IA configurada), usa el motor de IA con cola y
// prefetch; si no, usa la voz gratuita del navegador (comportamiento de
// siempre, sin cambios).
playBtn.addEventListener("click", async () => {
  if (!documentoCargado) {
    marcarEstadoLectura("⚠️ Cargá un documento o archivo primero.");
    return;
  }
  detenerTodoAhora();
  lecturaRestringidaASeccion = false;
  if (continuarLecturaBtn) continuarLecturaBtn.hidden = true;

  const usarIA = vozLecturaIA && vozIA && vozModo !== "robotica";
  if (usarIA) {
    const cantidadCaracteres = documentoCargado.length;
    const confirmado = confirm(
      `Vas a leer un documento de aproximadamente ${cantidadCaracteres.toLocaleString("es-UY")} caracteres con voz IA (ElevenLabs). Esto consume tu cuota. ¿Continuar?\n\n(Cancelar usa la voz gratuita del dispositivo en su lugar.)`
    );
    if (confirmado) {
      marcarEstadoLectura("⏳ Procesando...");
      limpiarCacheAudioIA();
      bloquesIA = dividirTextoParaHabla(documentoCargado, 500);
      irABloqueIA(0);
      return;
    }
  }

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
    marcarEstadoLectura("↻ Reiniciando desde el principio...");
    lecturaRestringidaASeccion = false;
    if (lecturaIAActiva) { irABloqueIA(0); return; }
    if (!fragmentosLectura.length) prepararLectura(documentoCargado);
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
  if (lecturaIAActiva) {
    // Motor de IA: se pausa/reanuda el elemento <audio> que está sonando.
    if (lecturaPausada) {
      audioIAActivo?.play().catch(() => {});
      lecturaPausada = false;
      marcarEstadoLectura("⏵ Reanudado (voz IA).");
    } else if (audioIAActivo && !audioIAActivo.paused) {
      audioIAActivo.pause();
      lecturaPausada = true;
      marcarEstadoLectura("⏸️ Pausado.");
    }
  } else if (lecturaPausada) {
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
  fragmentoSiguienteBtn.addEventListener("click", () => {
    if (lecturaIAActiva) irABloqueIA(fragmentoActualIndex + 1);
    else irAFragmento(fragmentoActualIndex + 1);
  });
}
if (fragmentoAnteriorBtn) {
  fragmentoAnteriorBtn.addEventListener("click", () => {
    if (lecturaIAActiva) irABloqueIA(fragmentoActualIndex - 1);
    else irAFragmento(fragmentoActualIndex - 1);
  });
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
    const textoLimpio = prepararTextoParaTTS(text);
    const res = await fetch(`${BACKEND_URL}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: textoLimpio, tipo: generoParaElevenLabs(), contexto: "chat",
        turnstileToken: window.MedusaSeguridad?.tokenTurnstileActual() || undefined
      })
    });
    if (!res.ok) {
      let codigo = "";
      try { codigo = (await res.json()).codigo || ""; } catch {}
      // El backend distingue con un "codigo" exacto por qué falló, en vez
      // de tener que adivinar leyendo el texto del mensaje de error.
      const mensajes = {
        sin_api_key: "⚠️ ElevenLabs no está configurado",
        falta_voz_espanol: "⚠️ Falta configurar una voz en español. Usando la voz del dispositivo.",
        limite_diario: "❌ Se alcanzó el límite diario de voz IA. Usando la voz del dispositivo."
      };
      actualizarEstadoVoz(mensajes[codigo] || "❌ La voz IA no está disponible. Voy a continuar con la voz del dispositivo.");
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

// Una única frase de prueba, usada tanto para "Escuchar muestra" (voz del
// dispositivo, para comparar modos) como para "Probar voz IA" — así se
// puede comparar de verdad una voz contra otra con el mismo texto.
const TEXTO_PRUEBA_VOZ = "Buenos días, Rodri. Revisé el documento y preparé los puntos más importantes. Cuando quieras, podemos analizarlos uno por uno.";

// "Escuchar muestra": reproduce la frase de referencia con la
// configuración del modo seleccionado (voz del navegador, no IA — los
// modos ajustan pitch/velocidad/volumen, que son parámetros del habla del
// dispositivo). Cancela cualquier muestra o lectura anterior antes de
// empezar, para que nunca se superpongan dos muestras.
if (escucharMuestraBtn) {
  escucharMuestraBtn.addEventListener("click", () => {
    if (!vozActiva) { marcarEstadoLectura("⚠️ Activá la voz para escuchar una muestra."); return; }
    speakRobotic(TEXTO_PRUEBA_VOZ);
  });
}

// "Probar voz IA (chat)": reproduce siempre la misma frase de referencia,
// con la misma prioridad IA → navegador que usa el chat.
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
