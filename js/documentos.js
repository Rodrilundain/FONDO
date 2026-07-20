// === Documentos: cargar, validar y extraer texto de PDF/DOCX/TXT/MD ===
// Responsabilidad: todo lo relacionado con obtener el documento (archivo
// local, arrastrado o URL), validarlo con mensajes claros, y extraer su
// texto. No sabe nada de voz ni de chat, salvo para avisar errores hablados
// y mostrar/ocultar los paneles de reproducción y chat.

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const proxiesPublicosDeshabilitadosInput = document.getElementById("proxiesPublicosDeshabilitadosInput");
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
const sharedDocConfirmPanel = document.getElementById("sharedDocConfirmPanel");
const sharedDocConfirmDominio = document.getElementById("sharedDocConfirmDominio");
const sharedDocConfirmTipo = document.getElementById("sharedDocConfirmTipo");
const sharedDocConfirmUrl = document.getElementById("sharedDocConfirmUrl");
const sharedDocConfirmCargar = document.getElementById("sharedDocConfirmCargar");
const sharedDocConfirmCancelar = document.getElementById("sharedDocConfirmCancelar");

let documentoCargado = "";
let documentoBloques = []; // {pagina, texto} para PDF, {tipo, texto} para DOCX, [{texto}] para TXT/MD
let documentoPareceEscaneado = false;
let cargaEnCurso = false; // evita que dos cargas (archivo/URL) se pisen entre sí

// Formato/tamaño permitido, mostrado también en la pantalla inicial.
const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Timeout para descargas de documentos (backend propio, descarga directa
// e intento del navegador, y proxies/lectores externos) -- Punto 5 de la
// auditoría v2 de seguridad: sin esto, un servicio externo colgado podía
// dejar la carga girando indefinidamente en vez de fallar con un mensaje
// claro y pasar al siguiente intento (backend -> directo -> proxies).
const FETCH_DOCUMENTO_TIMEOUT_MS = 20000;
const EXTENSIONES_PERMITIDAS = [".pdf", ".docx", ".txt", ".md"];

// === Privacidad: proxies públicos (Etapa 5 de la auditoría de seguridad) ===
// Los proxies externos (r.jina.ai, corsproxy.io, allorigins.win) están
// desactivados por defecto en el sentido de que NUNCA se usan solos: si
// el backend propio (que sí valida SSRF) no puede descargar un enlace,
// se le pregunta al usuario si quiere probar con esos servicios,
// nombrándolos, antes de mandarles la URL. Esta casilla es para
// desactivarlos por completo (ni siquiera preguntar).
let proxiesPublicosDeshabilitados = localStorage.getItem("medusaProxiesPublicosDeshabilitados") === "1";
if (proxiesPublicosDeshabilitadosInput) {
  proxiesPublicosDeshabilitadosInput.checked = proxiesPublicosDeshabilitados;
  proxiesPublicosDeshabilitadosInput.addEventListener("change", e => {
    proxiesPublicosDeshabilitados = e.target.checked;
    localStorage.setItem("medusaProxiesPublicosDeshabilitados", proxiesPublicosDeshabilitados ? "1" : "0");
  });
}

// La heurística de qué URLs no deben mandarse a un tercero (token, firma,
// credenciales, host local, URL excesivamente larga...) vive en
// js/security/privacidadEnlaces.js -- separada de este archivo para poder
// probarla sin DOM (ver js/security/__tests__/privacidadEnlaces.test.mjs)
// y porque es lógica de seguridad/validación, no de manejo de documentos.
// No se destructuran los nombres (const { dominioDeUrl, ... } = ...):
// documentos.js y privacidadEnlaces.js son dos <script> clásicos que
// comparten un mismo scope global, y esos mismos nombres ya existen ahí
// como declaraciones `function` -- una `const` con el mismo nombre en
// OTRO script del mismo scope global es un SyntaxError en el navegador
// ("Identifier ... has already been declared"), aunque cada script se
// vea aislado al leerlo por separado. Confirmado con Playwright real.
const PrivacidadEnlaces = window.MedusaPrivacidadEnlaces;

// Pregunta una sola vez, nombrando los servicios concretos, antes de usar
// CUALQUIER proxy externo para este enlace. Nunca pregunta (ni usa
// proxies) si el enlace parece sensible, o si el usuario los desactivó
// por completo en "Configuración avanzada".
function puedeUsarProxiesPublicos(url) {
  return PrivacidadEnlaces.decidirUsoDeProxies({
    url,
    proxiesDeshabilitados: proxiesPublicosDeshabilitados,
    confirmarConUsuario: () => confirm(
      "MedusaLee no pudo descargar este enlace de forma directa/segura.\n\n" +
      "¿Querés que se pruebe con un servicio externo (r.jina.ai, corsproxy.io o allorigins.win)? " +
      "Esto comparte la URL del documento con ese tercero.\n\n" +
      "Enlace: " + url
    )
  });
}

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
    const res = await fetch("https://r.jina.ai/" + url, { signal: AbortSignal.timeout(FETCH_DOCUMENTO_TIMEOUT_MS) });
    if (!res.ok) throw new Error("r.jina.ai respondió " + res.status);
    return stripJinaMetadata((await res.text()).trim());
  },
  async url => {
    const res = await fetch("https://corsproxy.io/?url=" + encodeURIComponent(url), { signal: AbortSignal.timeout(FETCH_DOCUMENTO_TIMEOUT_MS) });
    if (!res.ok) throw new Error("corsproxy.io respondió " + res.status);
    return htmlToText(await res.text());
  },
  async url => {
    const res = await fetch("https://api.allorigins.win/get?url=" + encodeURIComponent(url), { signal: AbortSignal.timeout(FETCH_DOCUMENTO_TIMEOUT_MS) });
    if (!res.ok) throw new Error("allorigins respondió " + res.status);
    const data = await res.json();
    if (!data || !data.contents) throw new Error("allorigins devolvió contents vacío");
    return htmlToText(data.contents);
  }
];

// Heurística "mejor esfuerzo": si el mismo texto inicial (primeros ~80
// caracteres) se repite en la mayoría de las páginas, es probable que sea
// un encabezado o pie de página fijo — se recorta de cada página. No es
// perfecto (puede fallar con diseños poco convencionales), pero mejora la
// lectura evitando repetir el mismo título en cada fragmento.
function quitarEncabezadosPiesRepetidos(paginas) {
  if (paginas.length < 3) return paginas;
  // Se compara por las primeras N palabras (no por un prefijo de caracteres
  // fijo): un título de encabezado suele ser corto y el contenido que le
  // sigue cambia de página a página, así que comparar 80 caracteres exactos
  // casi nunca coincide. Con 6 palabras alcanza para títulos típicos
  // ("Manual de Usuario - Capítulo 1") sin matchear texto que por casualidad
  // empiece igual.
  const PALABRAS_ENCABEZADO = 6;
  const candidatos = paginas.map(p => {
    const palabras = p.texto.split(/\s+/).filter(Boolean).slice(0, PALABRAS_ENCABEZADO);
    return palabras.length >= 3 ? palabras.join(" ") : null;
  });
  const conteo = {};
  for (const c of candidatos) if (c) conteo[c] = (conteo[c] || 0) + 1;
  const umbral = Math.max(2, Math.ceil(paginas.length * 0.6));
  return paginas.map((p, i) => {
    const c = candidatos[i];
    if (c && conteo[c] >= umbral && p.texto.startsWith(c)) {
      return { pagina: p.pagina, texto: p.texto.slice(c.length).trim() };
    }
    return p;
  });
}

// Devuelve { texto, bloques, pareceEscaneado }. `bloques` mantiene la
// página de origen de cada fragmento, para poder citar "Página N" en el
// chat y mostrar la página actual durante la lectura. `texto` es la
// concatenación plana, para no romper el código existente que todavía
// espera un string (RAG simple, lectura por voz del navegador, etc).
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
  let paginas = [];
  let totalCaracteresSinEspacios = 0;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const texto = content.items.map(item => item.str).join(" ").replace(/\s+/g, " ").trim();
    totalCaracteresSinEspacios += texto.replace(/\s/g, "").length;
    paginas.push({ pagina: i, texto });
  }
  paginas = quitarEncabezadosPiesRepetidos(paginas);
  const texto = paginas.map(p => p.texto).join("\n");
  // Heurística simple (no infalible): muy pocos caracteres por página sugiere
  // que el PDF es una imagen escaneada sin capa de texto seleccionable.
  const pareceEscaneado = pdf.numPages > 0 && (totalCaracteresSinEspacios / pdf.numPages) < 15;
  return { texto, bloques: paginas, pareceEscaneado };
}

// Convierte a HTML (no a texto plano) para poder distinguir títulos,
// párrafos e ítems de lista antes de aplanarlos — así el chat puede citar
// "en el título X" y una futura tabla de contenidos puede listar los
// títulos reales del documento.
async function extractDocxText(arrayBuffer) {
  if (!window.mammoth) throw new Error("No se pudo cargar el lector de Word.");
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const doc = new DOMParser().parseFromString(result.value, "text/html");
  const bloques = [];
  doc.body.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li").forEach(el => {
    const texto = el.textContent.replace(/\s+/g, " ").trim();
    if (!texto) return;
    const tipo = /^H[1-6]$/.test(el.tagName) ? "titulo" : (el.tagName === "LI" ? "item" : "parrafo");
    bloques.push({ tipo, texto });
  });
  const texto = bloques.map(b => b.texto).join("\n");
  return { texto, bloques, pareceEscaneado: false };
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
  const texto = new TextDecoder("utf-8").decode(buffer).replace(/\s+/g, " ").trim();
  return { texto, bloques: texto ? [{ texto }] : [], pareceEscaneado: false };
}

// Convierte un link de Google Drive (vista/compartir) en un link de
// descarga directa, para poder bajar los bytes reales del archivo.
function driveDirectDownload(url) {
  if (!/drive\.google\.com/.test(url)) return url;
  const m = url.match(/\/file\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
  return m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : url;
}

// Proxies EXTERNOS de respaldo para descargar el archivo binario si el
// backend propio no está disponible NI el intento directo (que no es un
// proxy de terceros, es pedirle al propio navegador que baje la URL tal
// cual). Solo se usan con confirmación explícita del usuario -- ver
// puedeUsarProxiesPublicos() más arriba.
const BINARY_PROXIES_EXTERNOS = [
  url => "https://corsproxy.io/?url=" + encodeURIComponent(url),
  url => "https://api.allorigins.win/raw?url=" + encodeURIComponent(url)
];

// Descarga por el backend propio (/fetch-document), que valida protocolo,
// dominio y tamaño, y bloquea IPs privadas (protección SSRF) — más seguro
// que pedirle al navegador que baje bytes arbitrarios de un proxy público.
// `BACKEND_URL` la define app.js; como esta función solo se ejecuta en
// respuesta a una carga de documento (nunca durante el parseo inicial del
// script), para entonces app.js ya terminó de inicializarla.
async function descargarViaBackend(url) {
  if (!BACKEND_URL) throw new Error("Backend no configurado");
  const res = await fetch(`${BACKEND_URL}/fetch-document`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, turnstileToken: window.MedusaSeguridad?.tokenTurnstileActual() || undefined }),
    signal: AbortSignal.timeout(FETCH_DOCUMENTO_TIMEOUT_MS)
  });
  if (!res.ok) {
    let msg = "el backend respondió " + res.status;
    try { const data = await res.json(); if (data?.error) msg = data.error; } catch { /* respuesta no era JSON */ }
    throw new Error(msg);
  }
  const buffer = await res.arrayBuffer();
  return { buffer, contentType: res.headers.get("content-type") || "" };
}

async function fetchBinary(url, puedeUsarProxiesUnaVez) {
  if (BACKEND_URL) {
    try {
      return await descargarViaBackend(url);
    } catch (err) {
      console.warn("Descarga vía backend falló, probando descarga directa:", err);
    }
  }
  // Intento directo primero: no es un proxy de terceros, es pedirle al
  // propio navegador que baje la URL tal cual (funciona si el servidor de
  // origen permite CORS).
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_DOCUMENTO_TIMEOUT_MS) });
    if (!res.ok) throw new Error("respondió " + res.status);
    const buffer = await res.arrayBuffer();
    return { buffer, contentType: res.headers.get("content-type") || "" };
  } catch (err) {
    console.warn("Descarga directa falló, evaluando proxies externos:", err);
  }

  if (!puedeUsarProxiesUnaVez()) {
    throw new Error("No se pudo descargar el archivo (el backend no está disponible y no se usaron proxies externos).");
  }
  let lastError;
  for (const buildUrl of BINARY_PROXIES_EXTERNOS) {
    try {
      const res = await fetch(buildUrl(url), { signal: AbortSignal.timeout(FETCH_DOCUMENTO_TIMEOUT_MS) });
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

// Devuelve siempre { texto, bloques, pareceEscaneado }, sin importar si el
// documento vino de un archivo binario (PDF/DOCX/TXT) o de una página web
// leída como texto plano (en ese caso, un único bloque sin página/tipo).
async function fetchDocumentText(originalUrl) {
  const url = driveDirectDownload(originalUrl);
  const tipoPorExtension = detectFileTypeByExtension(url);

  // Se pregunta UNA sola vez por carga si se pueden usar proxies externos
  // (Etapa 5 de la auditoría de seguridad), no una vez por cada intento
  // de descarga -- para no ser repetitivo con el mismo enlace.
  let permitirProxies = null;
  const puedeUsarProxiesUnaVez = () => {
    if (permitirProxies === null) permitirProxies = puedeUsarProxiesPublicos(originalUrl);
    return permitirProxies;
  };

  // Si tiene extensión conocida (.pdf/.docx/.txt) o es un link de Drive
  // reescrito, primero probamos descargarlo como archivo binario.
  if (tipoPorExtension || url !== originalUrl) {
    try {
      const { buffer, contentType } = await fetchBinary(url, puedeUsarProxiesUnaVez);
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

  // Fallback: tratarlo como una página web genérica -- DOC_READERS son
  // todos proxies externos (no hay forma "directa" de leer una página
  // como texto sin CORS), así que acá también hace falta permiso.
  if (!puedeUsarProxiesUnaVez()) {
    throw new Error("No se pudo descargar el archivo (el backend no está disponible y no se usaron proxies externos).");
  }
  let lastError;
  for (const reader of DOC_READERS) {
    try {
      const texto = (await reader(originalUrl) || "").replace(/\s+/g, " ").trim();
      if (texto) return { texto, bloques: [{ texto }], pareceEscaneado: false };
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

function marcarListoParaLeer(nombreOEtiqueta, notaExtra) {
  status.textContent = `✅ ${nombreOEtiqueta} Presioná ▶️ Reproducir para comenzar la lectura.` + (notaExtra ? ` ${notaExtra}` : "");
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
    const { texto, bloques, pareceEscaneado } = await fetchDocumentText(url);
    if (!texto) throw new Error(pareceEscaneado ? "pdf-vacio" : "vacio");
    documentoCargado = texto;
    documentoBloques = bloques || [];
    documentoPareceEscaneado = !!pareceEscaneado;
    marcarListoParaLeer(
      "Documento cargado correctamente.",
      pareceEscaneado ? "⚠️ Parece un PDF escaneado (imagen): el texto extraído puede ser incompleto." : ""
    );
  } catch (err) {
    console.error(err);
    documentoCargado = "";
    documentoBloques = [];
    documentoPareceEscaneado = false;
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
    const { texto, bloques, pareceEscaneado } = await extractTextFromArrayBuffer(await file.arrayBuffer(), tipo);
    if (!texto) throw new Error(pareceEscaneado ? "pdf-vacio" : (tipo === "pdf" ? "pdf-vacio" : "vacio"));
    documentoCargado = texto;
    documentoBloques = bloques || [];
    documentoPareceEscaneado = !!pareceEscaneado;
    marcarListoParaLeer(
      `"${file.name}" cargado correctamente.`,
      pareceEscaneado ? "⚠️ Parece un PDF escaneado (imagen): el texto extraído puede ser incompleto." : ""
    );
  } catch (err) {
    console.error(err);
    documentoCargado = "";
    documentoBloques = [];
    documentoPareceEscaneado = false;
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

// Carga automática cuando el documento llega compartido por URL (?doc= o
// ?url=) -- Punto 4 de la auditoría v2 de seguridad: un enlace recibido
// así ya NO se descarga solo con abrir la página, ni se pide autorización
// con un simple diálogo confirm() del navegador. Se muestra un panel con
// el dominio, el tipo estimado y la URL resumida, y hace falta tocar
// "Cargar documento" a propósito -- para que abrir un link compartido
// nunca dispare una descarga (y potencialmente el envío de esa URL a un
// proxy externo) sin que la persona lo haya decidido conscientemente.
function mostrarConfirmacionEnlaceCompartido(sharedUrl) {
  heroLinkRow.hidden = false;
  heroLinkBtn.setAttribute("aria-expanded", "true");
  docUrlInput.value = sharedUrl;

  sharedDocConfirmDominio.textContent = PrivacidadEnlaces.dominioDeUrl(sharedUrl);
  sharedDocConfirmTipo.textContent = PrivacidadEnlaces.tipoEstimadoDeUrl(sharedUrl);
  sharedDocConfirmUrl.textContent = PrivacidadEnlaces.resumirUrl(sharedUrl);
  sharedDocConfirmPanel.hidden = false;

  const ocultarPanel = () => { sharedDocConfirmPanel.hidden = true; };
  sharedDocConfirmCargar.addEventListener("click", () => {
    ocultarPanel();
    loadDocumentFromUrl(sharedUrl);
  }, { once: true });
  sharedDocConfirmCancelar.addEventListener("click", () => {
    ocultarPanel();
    status.textContent = "El enlace quedó pegado en el campo de arriba. Presioná Enter ahí cuando quieras cargarlo.";
  }, { once: true });
}

(function autoLoadSharedDoc() {
  const params = new URLSearchParams(window.location.search);
  const sharedUrl = params.get("doc") || params.get("url");
  if (!sharedUrl) return;
  mostrarConfirmacionEnlaceCompartido(sharedUrl);
})();
