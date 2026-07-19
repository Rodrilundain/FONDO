// === Voz: selección de voz del navegador, síntesis y voz de IA (ElevenLabs) ===
// Responsabilidad: todo lo relacionado con hablar (voz robótica gratuita del
// navegador y voz de IA opcional vía backend), y los controles de
// reproducción del documento cargado.

const vozActivaToggle = document.getElementById("vozActiva");
const vozTipoSelect = document.getElementById("vozTipo");
const vozVelocidadSlider = document.getElementById("vozVelocidad");
const velocidadValor = document.getElementById("velocidadValor");
const vozTonoSlider = document.getElementById("vozTono");
const tonoValor = document.getElementById("tonoValor");
const vozIAToggle = document.getElementById("vozIA");
const probarVozBtn = document.getElementById("probarVozBtn");
const leerFragmentoBtn = document.getElementById("leerFragmentoBtn");
const vozEstado = document.getElementById("vozEstado");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resumeBtn = document.getElementById("resumeBtn");
const detenerVozBtn = document.getElementById("detenerVoz");
const reiniciarVozBtn = document.getElementById("reiniciarVoz");
const estadoLecturaEl = document.getElementById("estadoLectura");

// === Preferencias de voz: se recuerdan entre visitas (no son datos sensibles) ===
let vozActiva = (localStorage.getItem("medusaVozActiva") ?? (vozActivaToggle.checked ? "1" : "0")) === "1";
let vozTipo = localStorage.getItem("medusaVozTipo") || vozTipoSelect.value; // "robotica" | "hombre" | "mujer"
let vozVelocidad = parseFloat(localStorage.getItem("medusaVozVelocidad")) || parseFloat(vozVelocidadSlider.value);
let vozTonoManual = localStorage.getItem("medusaVozTono") ? parseFloat(localStorage.getItem("medusaVozTono")) : null;
let vozIA = (localStorage.getItem("medusaVozIA") ?? (vozIAToggle.checked ? "1" : "0")) === "1";

vozActivaToggle.checked = vozActiva;
vozTipoSelect.value = vozTipo;
vozVelocidadSlider.value = vozVelocidad;
velocidadValor.textContent = vozVelocidad.toFixed(1) + "x";
vozIAToggle.checked = vozIA;
if (vozTonoManual !== null) {
  vozTonoSlider.value = vozTonoManual;
  tonoValor.textContent = vozTonoManual.toFixed(2);
}

vozIAToggle.addEventListener("change", e => {
  vozIA = e.target.checked;
  localStorage.setItem("medusaVozIA", vozIA ? "1" : "0");
});
vozActivaToggle.addEventListener("change", e => {
  vozActiva = e.target.checked;
  localStorage.setItem("medusaVozActiva", vozActiva ? "1" : "0");
  if (!vozActiva) window.speechSynthesis.cancel();
});
vozTipoSelect.addEventListener("change", e => {
  vozTipo = e.target.value;
  localStorage.setItem("medusaVozTipo", vozTipo);
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

function marcarEstadoLectura(texto) {
  if (estadoLecturaEl) estadoLecturaEl.textContent = texto;
}

detenerVozBtn.addEventListener("click", () => {
  window.speechSynthesis.cancel();
  marcarEstadoLectura("⏹️ Lectura detenida.");
});

playBtn.addEventListener("click", () => {
  if (!documentoCargado) {
    marcarEstadoLectura("⚠️ Cargá un documento o archivo primero.");
    return;
  }
  marcarEstadoLectura("▶️ Reproduciendo...");
  speakRobotic(documentoCargado);
});
if (reiniciarVozBtn) {
  reiniciarVozBtn.addEventListener("click", () => {
    if (!documentoCargado) return;
    window.speechSynthesis.cancel();
    marcarEstadoLectura("↻ Lectura reiniciada desde el principio.");
    speakRobotic(documentoCargado);
  });
}
pauseBtn.addEventListener("click", () => {
  if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
    window.speechSynthesis.pause();
    marcarEstadoLectura("⏸️ Pausado.");
  }
});
resumeBtn.addEventListener("click", () => {
  if (window.speechSynthesis.paused) {
    // El Web Speech API no permite "continuar desde donde se pausó" con
    // precisión de palabra: speechSynthesis.resume() retoma la síntesis
    // pendiente, pero si el navegador la había descartado (algunos lo
    // hacen tras mucho tiempo pausado) reinicia el fragmento actual. Es
    // una limitación del navegador, no de MedusaLee.
    window.speechSynthesis.resume();
    marcarEstadoLectura("⏵ Reanudado.");
  }
});

function chunkText(text, maxLen = 220) {
  return splitSentences(text, maxLen);
}

// Los navegadores no exponen un acento "uruguayo" puntual: elegimos la
// variante de español rioplatense/latina más cercana disponible
// (es-UY, es-AR, es-419, es-MX...) y afinamos el tono según el género
// elegido. Si el sistema no tiene ninguna voz en español, se usa la
// que haya por defecto — y se lo avisamos al usuario en vez de decir que
// es una voz uruguaya cuando en realidad no la tiene instalada.
const NOMBRES_VOZ_MUJER = /female|mujer|women|paulina|helena|sabina|monica|lucia|camila|valentina|elena|catalina|isabela|carmen|sofia|maria/i;
const NOMBRES_VOZ_HOMBRE = /male|hombre|men\b|jorge|diego|juan|carlos|pablo|enrique|miguel|alvaro|alonso|andres|fernando|ricardo|sergio|mateo|tomas|rodrigo|gonzalo|felipe|tono/i;

function pickVoice(tipo) {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const esVoices = voices.filter(v => /^es/i.test(v.lang));
  const rioplatenses = esVoices.filter(v => /es-(UY|AR|419)/i.test(v.lang));
  const latam = esVoices.filter(v => /es-(MX|US|CO|CL|PE)/i.test(v.lang));
  const pool = rioplatenses.length ? rioplatenses : (latam.length ? latam : (esVoices.length ? esVoices : voices));

  if (tipo === "mujer") {
    return pool.find(v => NOMBRES_VOZ_MUJER.test(v.name))
      || pool.find(v => !NOMBRES_VOZ_HOMBRE.test(v.name))
      || pool[0];
  }
  if (tipo === "hombre") {
    return pool.find(v => NOMBRES_VOZ_HOMBRE.test(v.name))
      || pool.find(v => !NOMBRES_VOZ_MUJER.test(v.name))
      || pool[0];
  }
  return pool[0]; // robotica: el efecto lo da el pitch, la voz de base da igual
}

function pitchFor(tipo) {
  if (vozTonoManual !== null) return vozTonoManual;
  // Cada tipo tiene su propia identidad, bien separada entre sí para
  // que no se confundan:
  // - "robotica" (estilo TARS): grave pero NO extremo, monótona.
  // - "hombre" (estilo JARVIS): tono masculino natural, sin sonar
  //   robótico ni extremadamente grave — a propósito bien distinto de
  //   "robotica" para que no suenen parecidas. Rango 0.8-0.95: valores más
  //   bajos deforman la voz en Safari/iPhone.
  // - "mujer": tono femenino natural.
  if (tipo === "robotica") return 0.55;
  if (tipo === "hombre") return 0.85;
  if (tipo === "mujer") return 1.3;
  return 1;
}

function rateMultiplierFor(tipo) {
  // TARS habla pausado y monótono; JARVIS habla a ~92% del ritmo
  // normal: tranquilo pero ágil, nunca apurado.
  if (tipo === "robotica") return 0.9;
  if (tipo === "hombre") return 0.92;
  return 1;
}

// Estilo "asistente" (voz hombre/JARVIS): ante una advertencia baja el
// tono, reduce el ritmo y agrega una pausa breve antes del mensaje, para
// sonar firme; ante un logro se mantiene igual, sin sonar exagerado.
const TEXTO_ADVERTENCIA = /\b(advertencia|atenci[oó]n|cuidado|alerta|error|problema|falla|inconsistencia|riesgo)\b/i;

function ajustarPorContexto(chunk, pitch, rate, tipo) {
  if (tipo !== "hombre" || !TEXTO_ADVERTENCIA.test(chunk)) {
    return { texto: chunk, pitch, rate };
  }
  return { texto: `... ${chunk}`, pitch: pitch * 0.9, rate: rate * 0.85 };
}

// Si el navegador solo tiene una voz en español, "hombre" y "mujer" usan
// la misma voz base (solo cambia el pitch, que algunos navegadores como
// Safari aplican muy poco) — avisamos para que el usuario sepa que no es
// un bug, sino una limitación de las voces instaladas en el dispositivo.
function avisarSiUnaSolaVoz() {
  const voices = window.speechSynthesis.getVoices();
  const esVoices = voices.filter(v => /^es/i.test(v.lang));
  const nota = document.getElementById("vozUnicaNota");
  if (!nota) return;
  nota.style.display = esVoices.length > 1 ? "none" : "block";
}
if ("speechSynthesis" in window) {
  avisarSiUnaSolaVoz();
  window.speechSynthesis.onvoiceschanged = avisarSiUnaSolaVoz;
}

function speakRobotic(text, { interrupt = true } = {}) {
  if (!vozActiva || !text || !("speechSynthesis" in window)) return;
  if (interrupt) window.speechSynthesis.cancel();
  const voice = pickVoice(vozTipo);
  const pitch = pitchFor(vozTipo);
  const rate = vozVelocidad * rateMultiplierFor(vozTipo);
  const chunks = chunkText(text);
  for (const chunk of chunks) {
    const ajuste = ajustarPorContexto(chunk, pitch, rate, vozTipo);
    const utterance = new SpeechSynthesisUtterance(ajuste.texto);
    utterance.lang = (voice && voice.lang) || "es-UY";
    utterance.pitch = ajuste.pitch;
    utterance.rate = ajuste.rate;
    utterance.volume = 1;
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }
}

// Mensaje visible de qué sistema de voz se usó (o se intentó usar), para
// que quede claro si sonó la IA o el respaldo del navegador.
function actualizarEstadoVoz(mensaje) {
  if (vozEstado) vozEstado.textContent = mensaje;
}

// Voz de IA (ElevenLabs) vía el backend, solo para las respuestas
// cortas del chat — la lectura del documento completo se queda con la
// voz del navegador (gratis, sin límite de caracteres). "Robotrónica"
// tampoco usa IA a propósito: se supone que suene sintética. El audio
// se reproduce a velocidad 1: el ritmo ya lo aplica ElevenLabs del lado
// del servidor (voice_settings.speed), así que no se reduce dos veces.
// ElevenLabs es opcional: si falla, no está configurado, o se agota la
// cuota, se cae automáticamente a la voz del navegador sin romper nada.
async function speakConIA(text) {
  if (!vozActiva || !text) return false;
  if (vozTipo === "robotica" || !vozIA) {
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
      body: JSON.stringify({ text, tipo: vozTipo })
    });
    if (!res.ok) {
      let detalle = "";
      try { detalle = (await res.json()).error || ""; } catch {}
      actualizarEstadoVoz(
        /ELEVENLABS_API_KEY/i.test(detalle)
          ? "⚠️ ElevenLabs no está configurado"
          : "❌ Error al generar la voz"
      );
      return false;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.addEventListener("ended", () => URL.revokeObjectURL(url));
    await audio.play();
    actualizarEstadoVoz("🧠 Voz IA activa");
    return true;
  } catch (err) {
    console.warn("Voz IA (ElevenLabs) falló, uso la voz del navegador:", err);
    actualizarEstadoVoz("❌ Error al generar la voz");
    return false;
  }
}

async function hablar(text) {
  const ok = await speakConIA(text);
  if (!ok) speakRobotic(text);
}

// "Probar voz": reproduce siempre la misma frase de referencia, con la
// misma prioridad IA → navegador que usa el chat.
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
