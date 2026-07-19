// === Documentos: cargar, validar y extraer texto de PDF/DOCX/TXT/MD ===
// Responsabilidad: todo lo relacionado con obtener el documento (archivo
// local, arrastrado o URL), validarlo con mensajes claros, y extraer su
// texto. No sabe nada de voz ni de chat, salvo para avisar errores hablados
// y mostrar/ocultar los paneles de reproducción y chat.

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const docUrlInput = document.getElementById("docUrl");
const docFileInput = document.getElementById("docFile");
const status = document.getElementById("status");
const chat = document.getElementById("chat");
const heroUploadBtn = document.getElementById("heroUploadBtn");
const heroLinkBtn = document.getElementById("heroLinkBtn");
const heroLinkRow = document.getElementById("heroLinkRow");
const playbackControls = document.getElementById("playbackControls");
const dropzone = document.getElementById("dropzone");
const heroPanel = document.getElementById("heroPanel");

let documentoCargado = "";
let cargaEnCurso = false; // evita que dos cargas (archivo/URL) se pisen entre sí

// Formato/tamaño permitido, mostrado también en la pantalla inicial.
const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const EXTENSIONES_PERMITIDAS = [".pdf", ".docx", ".txt", ".md"];

function fijarBotonesDeCarga(deshabilitados) {
  heroUploadBtn.disabled = deshabilitados;
  heroLinkBtn.disabled = deshabilitados;
  docUrlInput.disabled = deshabilitados;
  if (dropzone) dropzone.setAttribute("aria-disabled", String(deshabilitados));
}

// === Panel principal: subir archivo / pegar enlace ===
heroUploadBtn.addEventListener("click", () => docFileInput.click());
heroLinkBtn.addEventListener("click", () => {
  const mostrar = heroLinkRow.hidden;
  heroLinkRow.hidden = !mostrar;
  heroLinkBtn.setAttribute("aria-expanded", String(mostrar));
  if (mostrar) docUrlInput.focus();
});

// === Arrastrar y soltar (funciona con mouse; en celular se usa el botón
// "Subir archivo", ya que no existe drag-and-drop táctil nativo, pero la
// zona también responde al toque abriendo el selector de archivos) ===
if (dropzone) {
  dropzone.addEventListener("click", () => docFileInput.click());
  dropzone.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); docFileInput.click(); }
  });
  ["dragenter", "dragover"].forEach(evento => {
    dropzone.addEventListener(evento, e => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach(evento => {
    dropzone.addEventListener(evento, e => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });
  dropzone.addEventListener("drop", e => {
    const file = e.dataTransfer?.files?.[0];
    if (file) procesarArchivo(file);
  });
}

function htmlToText(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return doc.body.innerText.replace(/\s+/g, " ").trim();
}

// AllOrigins es gratuito pero poco confiable (sin SLA, rate-limit agresivo,
// suele devolver contents:null). Probamos primero lectores más estables y
// caemos a AllOrigins solo como último recurso.
// r.jina.ai antepone metadata ("Title: ...", "URL Source: ...",
// "Markdown Content:") antes del texto real de la página. Sin esto,
// la lectura en voz alta empezaba diciendo la URL en vez del documento.
function stripJinaMetadata(text) {
  const marker = "Markdown Content:";
  const idx = text.indexOf(marker);
  return idx === -1 ? text : text.slice(idx + marker.length).trim();
}

const DOC_READERS = [
  async url => {
    const res = await fetch("https://r.jina.ai/" + url);
    if (!res.ok) throw new Error("r.jina.ai respondió " + res.status);
    return stripJinaMetadata((await res.text()).trim());
  },
  async url => {
    const res = await fetch("https://corsproxy.io/?url=" + encodeURIComponent(url));
    if (!res.ok) throw new Error("corsproxy.io respondió " + res.status);
    return htmlToText(await res.text());
  },
  async url => {
    const res = await fetch("https://api.allorigins.win/get?url=" + encodeURIComponent(url));
    if (!res.ok) throw new Error("allorigins respondió " + res.status);
    const data = await res.json();
    if (!data || !data.contents) throw new Error("allorigins devolvió contents vacío");
    return htmlToText(data.contents);
  }
];

async function extractPdfText(arrayBuffer) {
  if (!window.pdfjsLib) throw new Error("No se pudo cargar el lector de PDF.");
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  } catch (err) {
    if (/password/i.test(err?.name || "") || /password/i.test(err?.message || "")) {
      throw new Error("Este PDF está protegido con contraseña.");
    }
    throw new Error("El PDF parece estar dañado o no se pudo leer.");
  }
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(" ") + "\n";
  }
  return text;
}

async function extractDocxText(arrayBuffer) {
  if (!window.mammoth) throw new Error("No se pudo cargar el lector de Word.");
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

// Detecta pdf/docx/txt por extensión (nombre de archivo local o URL).
function detectFileTypeByExtension(nameOrUrl) {
  const clean = nameOrUrl.split(/[?#]/)[0].toLowerCase();
  if (clean.endsWith(".pdf")) return "pdf";
  if (clean.endsWith(".docx")) return "docx";
  if (clean.endsWith(".txt") || clean.endsWith(".md")) return "text";
  return null;
}

// Cuando la URL no tiene extensión reconocible (ej: un link de Drive
// reescrito), se detecta por el content-type o por los primeros bytes
// del archivo (%PDF... para PDF, PK.. porque un .docx es un zip).
function detectFileTypeByContent(contentType, buffer) {
  if (contentType) {
    if (contentType.includes("pdf")) return "pdf";
    if (contentType.includes("wordprocessingml")) return "docx";
    if (contentType.includes("text/plain")) return "text";
  }
  const head = new Uint8Array(buffer.slice(0, 4));
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return "pdf";
  if (head[0] === 0x50 && head[1] === 0x4b) return "docx";
  return null;
}

async function extractTextFromArrayBuffer(buffer, tipo) {
  if (tipo === "pdf") return extractPdfText(buffer);
  if (tipo === "docx") return extractDocxText(buffer);
  return new TextDecoder("utf-8").decode(buffer);
}

// Convierte un link de Google Drive (vista/compartir) en un link de
// descarga directa, para poder bajar los bytes reales del archivo.
function driveDirectDownload(url) {
  if (!/drive\.google\.com/.test(url)) return url;
  const m = url.match(/\/file\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
  return m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : url;
}

// Proxies para descargar el archivo binario: primero intento directo
// (funciona si el servidor permite CORS), y si falla, dos proxies
// públicos de respaldo.
const BINARY_PROXIES = [
  url => url,
  url => "https://corsproxy.io/?url=" + encodeURIComponent(url),
  url => "https://api.allorigins.win/raw?url=" + encodeURIComponent(url)
];

async function fetchBinary(url) {
  let lastError;
  for (const buildUrl of BINARY_PROXIES) {
    try {
      const res = await fetch(buildUrl(url));
      if (!res.ok) throw new Error("respondió " + res.status);
      const buffer = await res.arrayBuffer();
      return { buffer, contentType: res.headers.get("content-type") || "" };
    } catch (err) {
      lastError = err;
      console.warn("Descarga binaria falló, probando el siguiente proxy:", err);
    }
  }
  throw lastError || new Error("No se pudo descargar el archivo.");
}

async function fetchDocumentText(originalUrl) {
  const url = driveDirectDownload(originalUrl);
  const tipoPorExtension = detectFileTypeByExtension(url);

  // Si tiene extensión conocida (.pdf/.docx/.txt) o es un link de Drive
  // reescrito, primero probamos descargarlo como archivo binario.
  if (tipoPorExtension || url !== originalUrl) {
    try {
      const { buffer, contentType } = await fetchBinary(url);
      if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
        throw new Error(`Este archivo supera el tamaño máximo permitido (${MAX_FILE_SIZE_MB} MB).`);
      }
      const tipo = tipoPorExtension || detectFileTypeByContent(contentType, buffer);
      if (tipo) return await extractTextFromArrayBuffer(buffer, tipo);
    } catch (err) {
      if (/tamaño máximo/.test(err.message)) throw err;
      console.warn("Descarga como archivo falló, probando como página web:", err);
    }
  }

  // Fallback: tratarlo como una página web genérica.
  let lastError;
  for (const reader of DOC_READERS) {
    try {
      const text = await reader(originalUrl);
      if (text) return text;
    } catch (err) {
      lastError = err;
      console.warn("Lector de documento falló, probando el siguiente:", err);
    }
  }
  throw lastError || new Error("El enlace no parece apuntar a un documento compatible.");
}

// Valida el formato de la URL antes de intentar nada, para no lanzar un
// pedido de red por una URL claramente inválida.
function urlEsValida(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Traduce errores técnicos a mensajes simples y tranquilos, sin
// tecnicismos crudos: se explica qué pasó y qué puede hacer el usuario,
// sin dramatizar (estilo de comunicación cercano, no un mensaje de
// fallo seco).
function mensajeAmigablePara(err, contexto) {
  const msg = err?.message || "";
  if (/tamaño máximo/i.test(msg)) return `⚠️ ${msg} Probá con una versión más liviana del archivo.`;
  if (/contraseña/i.test(msg)) return "⚠️ Este documento tiene contraseña y no puedo abrirlo. Probá exportarlo sin protección e intentá de nuevo.";
  if (/dañado|no se pudo leer/i.test(msg)) return "⚠️ Este archivo parece estar dañado. Probá abrirlo y volver a guardarlo, o usar otra copia.";
  if (/no parece apuntar/i.test(msg)) return "⚠️ El enlace no parece apuntar a un documento compatible. Revisá que sea un PDF, Word, TXT o Markdown válido.";
  if (contexto === "pdf-vacio") return "⚠️ No pude encontrar texto dentro de este PDF — puede ser una imagen escaneada. Probá con un PDF que tenga texto seleccionable.";
  if (contexto === "vacio") return "⚠️ Este archivo parece estar vacío. Revisá que tenga contenido e intentá de nuevo.";
  return contexto === "url"
    ? "⚠️ No pude cargar ese enlace. Revisá que sea público y apunte a un documento compatible, e intentá de nuevo."
    : "⚠️ No pude procesar el archivo. Revisá que sea un PDF, Word, TXT o Markdown válido.";
}

function marcarListoParaLeer(nombreOEtiqueta) {
  status.textContent = `✅ ${nombreOEtiqueta} Presioná ▶️ Reproducir para comenzar la lectura.`;
  chat.style.display = "flex";
  playbackControls.hidden = false;
  heroPanel.classList.add("documento-cargado");
  document.dispatchEvent(new CustomEvent("medusa:documento-listo"));
  toggleMenu(false);
}

async function loadDocumentFromUrl(url) {
  url = (url || "").trim();
  if (!url) return;
  if (cargaEnCurso) { status.textContent = "⏳ Ya hay una carga en curso, esperá a que termine."; return; }
  if (!urlEsValida(url)) {
    status.textContent = "⚠️ Ese enlace no parece válido. Revisá que empiece con http:// o https:// e intentá de nuevo.";
    return;
  }
  cargaEnCurso = true;
  fijarBotonesDeCarga(true);
  detenerLecturaPorNuevoDocumento();
  status.innerHTML = '<span class="spinner" aria-hidden="true"></span>Cargando documento...';
  try {
    const texto = (await fetchDocumentText(url)).replace(/\s+/g, " ").trim();
    if (!texto) throw new Error("vacio");
    documentoCargado = texto;
    marcarListoParaLeer("Documento cargado correctamente.");
  } catch (err) {
    console.error(err);
    documentoCargado = "";
    status.textContent = mensajeAmigablePara(err, "url");
    speakRobotic("Error al leer el documento.");
  } finally {
    cargaEnCurso = false;
    fijarBotonesDeCarga(false);
  }
}

docUrlInput.addEventListener("change", () => loadDocumentFromUrl(docUrlInput.value));

async function procesarArchivo(file) {
  if (!file) return;
  if (cargaEnCurso) { status.textContent = "⏳ Ya hay una carga en curso, esperá a que termine."; return; }

  const nombreValido = EXTENSIONES_PERMITIDAS.some(ext => file.name.toLowerCase().endsWith(ext));
  if (!nombreValido) {
    status.textContent = `⚠️ Ese formato todavía no está soportado. Probá con ${EXTENSIONES_PERMITIDAS.join(", ")}.`;
    return;
  }
  if (file.size === 0) {
    status.textContent = mensajeAmigablePara(null, "vacio");
    return;
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    status.textContent = `⚠️ Este archivo supera el tamaño máximo permitido (${MAX_FILE_SIZE_MB} MB). Probá con una versión más liviana.`;
    return;
  }

  cargaEnCurso = true;
  fijarBotonesDeCarga(true);
  detenerLecturaPorNuevoDocumento();
  status.innerHTML = '<span class="spinner" aria-hidden="true"></span>Extrayendo texto...';
  try {
    const tipo = detectFileTypeByExtension(file.name) || "text";
    const texto = (await extractTextFromArrayBuffer(await file.arrayBuffer(), tipo)).replace(/\s+/g, " ").trim();
    if (!texto) throw new Error(tipo === "pdf" ? "pdf-vacio" : "vacio");
    documentoCargado = texto;
    marcarListoParaLeer(`"${file.name}" cargado correctamente.`);
  } catch (err) {
    console.error(err);
    documentoCargado = "";
    const contexto = err?.message === "pdf-vacio" ? "pdf-vacio" : (err?.message === "vacio" ? "vacio" : "archivo");
    status.textContent = mensajeAmigablePara(err, contexto);
    speakRobotic("Error al leer el archivo.");
  } finally {
    cargaEnCurso = false;
    fijarBotonesDeCarga(false);
    // Se limpia el valor para que, si el usuario vuelve a elegir el MISMO
    // archivo (por ejemplo tras corregirlo), el evento "change" se dispare
    // de nuevo — si no, el navegador no vuelve a avisar porque el valor no
    // cambió.
    docFileInput.value = "";
  }
}

docFileInput.addEventListener("change", () => procesarArchivo(docFileInput.files[0]));

// Carga automática cuando el documento llega compartido por URL (?doc= o ?url=)
(function autoLoadSharedDoc() {
  const params = new URLSearchParams(window.location.search);
  const sharedUrl = params.get("doc") || params.get("url");
  if (sharedUrl) {
    heroLinkRow.hidden = false;
    heroLinkBtn.setAttribute("aria-expanded", "true");
    docUrlInput.value = sharedUrl;
    loadDocumentFromUrl(sharedUrl);
  }
})();
