// === Funciones de IA vía Cloudflare Worker (Gemini/OpenRouter) ===
// Opcional y separado del chat de preguntas de siempre (que sigue usando
// /ask con Groq sin ningún cambio). Si no configurás la URL del Worker en
// el menú, esta sección queda oculta y MedusaLee funciona exactamente
// igual que antes. Nunca se manda ninguna clave desde acá: el Worker es
// quien las guarda como secretos.

const workerUrlInput = document.getElementById("workerUrlInput");
const workerConnStatus = document.getElementById("workerConnStatus");
const iaFuncionesPanel = document.getElementById("iaFuncionesPanel");
const iaFuncionesTarea = document.getElementById("iaFuncionesTarea");
const iaFuncionesPreguntaRow = document.getElementById("iaFuncionesPreguntaRow");
const iaFuncionesPregunta = document.getElementById("iaFuncionesPregunta");
const iaFuncionesGenerarBtn = document.getElementById("iaFuncionesGenerarBtn");
const iaFuncionesEstado = document.getElementById("iaFuncionesEstado");
const iaFuncionesResultado = document.getElementById("iaFuncionesResultado");
const iaFuncionesProveedor = document.getElementById("iaFuncionesProveedor");
const iaFuncionesTexto = document.getElementById("iaFuncionesTexto");
const iaFuncionesEscucharBtn = document.getElementById("iaFuncionesEscucharBtn");
const iaFuncionesPausarBtn = document.getElementById("iaFuncionesPausarBtn");
const iaFuncionesDetenerBtn = document.getElementById("iaFuncionesDetenerBtn");
const iaFuncionesCopiarBtn = document.getElementById("iaFuncionesCopiarBtn");

let WORKER_URL = localStorage.getItem("medusaWorkerUrl") || "";
if (workerUrlInput) workerUrlInput.value = WORKER_URL;

// El panel solo se muestra si HAY worker configurado y HAY documento
// cargado -- no antes. No molesta a nadie que no configuró el Worker.
function actualizarVisibilidadPanelIA() {
  if (!iaFuncionesPanel) return;
  iaFuncionesPanel.hidden = !(WORKER_URL && typeof documentoCargado !== "undefined" && documentoCargado);
}

// Igual que verificarBackend() en app.js: el Worker puede tardar un
// segundo la primera vez, pero a diferencia de Render no "duerme" (no es
// necesario avisar sobre eso acá).
async function verificarWorker() {
  if (!workerConnStatus) return;
  if (!WORKER_URL) { workerConnStatus.textContent = "⚪ Worker de IA: no configurado"; return; }
  workerConnStatus.textContent = "🟡 Worker de IA: conectando...";
  try {
    const res = await fetch(`${WORKER_URL}/health`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) { workerConnStatus.textContent = `🔴 Worker de IA: respondió con error (${res.status})`; return; }
    const data = await res.json();
    if (!data.geminiConfigurado && !data.openrouterConfigurado) {
      workerConnStatus.textContent = "🟡 Worker de IA: conectado, pero sin ningún proveedor configurado todavía.";
      return;
    }
    workerConnStatus.textContent = "🟢 Worker de IA: conectado";
  } catch {
    workerConnStatus.textContent = "🔴 Worker de IA: no responde (revisá la URL).";
  }
}

if (workerUrlInput) {
  workerUrlInput.addEventListener("change", () => {
    WORKER_URL = workerUrlInput.value.trim().replace(/\/+$/, "");
    localStorage.setItem("medusaWorkerUrl", WORKER_URL);
    actualizarVisibilidadPanelIA();
    verificarWorker();
  });
}
if (WORKER_URL) verificarWorker();

document.addEventListener("medusa:documento-listo", actualizarVisibilidadPanelIA);

// Solo "qa" y "chat" necesitan que el usuario escriba algo -- las demás
// 8 funciones trabajan con el documento completo, sin pregunta.
const TAREAS_QUE_NECESITAN_PREGUNTA = new Set(["qa", "chat"]);
if (iaFuncionesTarea) {
  iaFuncionesTarea.addEventListener("change", () => {
    if (iaFuncionesPreguntaRow) iaFuncionesPreguntaRow.hidden = !TAREAS_QUE_NECESITAN_PREGUNTA.has(iaFuncionesTarea.value);
  });
}

// Traduce los codigos de error del Worker a mensajes simples, sin exponer
// nunca un status HTTP, un stack trace ni el nombre de una variable
// interna (pedido explícito: nada de "HTTP 500", "TypeError", "API key
// missing", etc. en pantalla).
function mensajeAmigableIA(codigo) {
  const mensajes = {
    SIN_API_KEY: "Esta función no está disponible en este momento.",
    SIN_MODELO: "Esta función no está disponible en este momento.",
    CLAVE_INVALIDA: "No se pudo generar la respuesta en este momento. Probá nuevamente dentro de unos minutos.",
    TIMEOUT_O_CONEXION: "La respuesta tardó demasiado. Probá nuevamente.",
    PROVIDER_ERROR: "No se pudo generar la respuesta en este momento. Probá nuevamente dentro de unos minutos.",
    RESPUESTA_VACIA: "No se generó ninguna respuesta. Probá nuevamente.",
    TAREA_INVALIDA: "Esa función no está disponible.",
    CONTENIDO_BLOQUEADO: "No se pudo generar una respuesta para este contenido.",
    REQUEST_ERROR: "No se pudo procesar la solicitud. Revisá el documento cargado e intentá de nuevo."
  };
  return mensajes[codigo] || "No se pudo generar la respuesta en este momento. Probá nuevamente dentro de unos minutos.";
}

const NOMBRE_PROVEEDOR = { gemini: "Gemini", openrouter: "OpenRouter" };

let generandoIA = false;
if (iaFuncionesGenerarBtn) {
  iaFuncionesGenerarBtn.addEventListener("click", async () => {
    if (generandoIA) return; // evita solicitudes duplicadas por doble clic
    if (typeof documentoCargado === "undefined" || !documentoCargado) {
      iaFuncionesEstado.textContent = "⚠️ Cargá un documento primero.";
      return;
    }
    if (!WORKER_URL) {
      iaFuncionesEstado.textContent = "⚠️ Configurá la URL del Worker de IA en el menú.";
      return;
    }

    const task = iaFuncionesTarea.value;
    const question = iaFuncionesPregunta ? iaFuncionesPregunta.value.trim() : "";
    if (TAREAS_QUE_NECESITAN_PREGUNTA.has(task) && !question) {
      iaFuncionesEstado.textContent = "⚠️ Escribí tu pregunta primero.";
      return;
    }

    generandoIA = true;
    iaFuncionesGenerarBtn.disabled = true;
    iaFuncionesGenerarBtn.textContent = "⏳ Generando...";
    iaFuncionesResultado.hidden = true;
    iaFuncionesEstado.innerHTML = '<span class="spinner" aria-hidden="true"></span>Generando...';

    const controlador = new AbortController();
    const timeoutId = setTimeout(() => controlador.abort(), 35000);

    try {
      const cuerpo = {
        task,
        content: documentoCargado,
        options: question ? { question } : {}
      };
      if (task === "summary" && typeof documentoBloques !== "undefined" && documentoBloques.length) {
        cuerpo.bloques = documentoBloques;
      }

      const res = await fetch(`${WORKER_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
        signal: controlador.signal
      });
      clearTimeout(timeoutId);

      let data = null;
      try { data = await res.json(); } catch { /* respuesta no era JSON */ }

      if (!data || !data.success) {
        iaFuncionesEstado.textContent = `❌ ${mensajeAmigableIA(data?.error?.code)}`;
        return;
      }

      iaFuncionesEstado.textContent = "";
      const nombreProveedor = NOMBRE_PROVEEDOR[data.provider] || data.provider || "IA";
      iaFuncionesProveedor.textContent = `Generado con ${nombreProveedor}${data.model ? ` (${data.model})` : ""}.`;
      // textContent, nunca innerHTML: la respuesta del modelo jamás se
      // interpreta como HTML, así que no puede inyectar marcado.
      iaFuncionesTexto.textContent = data.content;
      iaFuncionesResultado.hidden = false;
    } catch (err) {
      clearTimeout(timeoutId);
      iaFuncionesEstado.textContent = err.name === "AbortError"
        ? "❌ La respuesta tardó demasiado. Probá nuevamente."
        : "❌ No se pudo conectar con el Worker de IA. Probá nuevamente dentro de unos minutos.";
    } finally {
      generandoIA = false;
      iaFuncionesGenerarBtn.disabled = false;
      iaFuncionesGenerarBtn.textContent = "✨ Generar";
    }
  });
}

if (iaFuncionesEscucharBtn) {
  iaFuncionesEscucharBtn.addEventListener("click", () => {
    const texto = iaFuncionesTexto.textContent;
    if (!texto) return;
    // Reutiliza la lógica de voz existente (voz.js): elige IA o
    // dispositivo según la configuración, y ya evita que se superpongan
    // dos audios (detenerTodoAhora() al empezar).
    hablar(texto);
  });
}

if (iaFuncionesPausarBtn) {
  iaFuncionesPausarBtn.addEventListener("click", () => {
    // audioIAActivo (voz IA, ElevenLabs) o speechSynthesis (voz del
    // dispositivo): cualquiera de los dos puede estar sonando según la
    // configuración de voz activa en ese momento.
    if (typeof audioIAActivo !== "undefined" && audioIAActivo) {
      if (!audioIAActivo.paused) { audioIAActivo.pause(); iaFuncionesPausarBtn.textContent = "⏵ Reanudar"; }
      else { audioIAActivo.play().catch(() => {}); iaFuncionesPausarBtn.textContent = "⏸️ Pausar"; }
      return;
    }
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      iaFuncionesPausarBtn.textContent = "⏵ Reanudar";
    } else if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      iaFuncionesPausarBtn.textContent = "⏸️ Pausar";
    }
  });
}

if (iaFuncionesDetenerBtn) {
  iaFuncionesDetenerBtn.addEventListener("click", () => {
    detenerTodoAhora();
    if (iaFuncionesPausarBtn) iaFuncionesPausarBtn.textContent = "⏸️ Pausar";
  });
}

if (iaFuncionesCopiarBtn) {
  iaFuncionesCopiarBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(iaFuncionesTexto.textContent);
      iaFuncionesCopiarBtn.textContent = "✅ Copiado";
    } catch {
      iaFuncionesCopiarBtn.textContent = "⚠️ No se pudo copiar";
    }
    setTimeout(() => { iaFuncionesCopiarBtn.textContent = "📋 Copiar"; }, 1800);
  });
}
