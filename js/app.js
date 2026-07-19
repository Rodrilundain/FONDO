// === App: menú, configuración del backend y arranque general ===
// Responsabilidad: abrir/cerrar el menú, la URL del backend de preguntas,
// mantener el chat visible por encima del teclado en iOS, y la opción de
// restaurar la configuración predeterminada.

const menu = document.getElementById("menu");
const menuBtn = document.getElementById("menuBtn");
const menuBackdrop = document.getElementById("menuBackdrop");
const backendUrlInput = document.getElementById("backendUrlInput");
const backendStatus = document.getElementById("backendStatus");
const backendConnStatus = document.getElementById("backendConnStatus");
const heroLinkRowEl = document.getElementById("heroLinkRow");
const heroLinkBtnEl = document.getElementById("heroLinkBtn");
const restaurarConfigBtn = document.getElementById("restaurarConfigBtn");
const restaurarVozBtn = document.getElementById("restaurarVozBtn");
const chatEl = document.getElementById("chat");

function toggleMenu(forceOpen) {
  const abrir = forceOpen !== undefined ? forceOpen : !menu.classList.contains("open");
  menu.classList.toggle("open", abrir);
  if (menuBackdrop) menuBackdrop.classList.toggle("open", abrir);
  menuBtn.setAttribute("aria-expanded", String(abrir));
}
menuBtn.addEventListener("click", e => {
  e.stopPropagation();
  toggleMenu();
});
// Cerrar el menú al tocar afuera, para que no quede tapando el chat.
document.addEventListener("click", e => {
  if (menu.classList.contains("open") && !menu.contains(e.target) && e.target !== menuBtn) {
    toggleMenu(false);
  }
});
menu.addEventListener("click", e => e.stopPropagation());
// Cerrar menú y colapsar "pegar enlace" con Escape.
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (menu.classList.contains("open")) toggleMenu(false);
  if (heroLinkRowEl && !heroLinkRowEl.hidden) {
    heroLinkRowEl.hidden = true;
    heroLinkBtnEl.setAttribute("aria-expanded", "false");
  }
});

// === Backend de preguntas ===
// URL por defecto: si desplegás tu propio backend con otro nombre en
// Render, cambiala acá. El usuario puede pisarla sin tocar código desde
// "⚙️ Configuración avanzada" en el menú (queda guardada en el navegador).
const DEFAULT_BACKEND_URL = "https://medusa-backend-n56j.onrender.com";

// Error común: pegar acá el link del documento en vez de la URL del
// servidor de Render. Avisamos si el link tiene pinta de documento.
function checkBackendUrl(url) {
  if (!url) { backendStatus.textContent = ""; return; }
  const pareceDocumento = /docs\.google\.com|drive\.google\.com|dropbox\.com|\/document\/|\/file\/d\//i.test(url);
  backendStatus.textContent = pareceDocumento
    ? "⚠️ Eso parece un link a un documento, no la URL de tu backend de Render."
    : "";
}

let BACKEND_URL = localStorage.getItem("medusaBackendUrl") || DEFAULT_BACKEND_URL;
backendUrlInput.value = BACKEND_URL;
checkBackendUrl(BACKEND_URL);

// Indicador de conexión: conectando / conectado / desconectado / error.
// El plan gratis de Render duerme el servicio, así que "no responde" no
// es necesariamente un error real — se lo explica así al usuario.
async function verificarBackend() {
  if (!BACKEND_URL) {
    backendConnStatus.textContent = "⚪ Backend: no configurado";
    return;
  }
  backendConnStatus.textContent = "🟡 Backend: conectando...";
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(6000) });
    backendConnStatus.textContent = res.ok
      ? "🟢 Backend: conectado"
      : `🔴 Backend: respondió con error (${res.status})`;
  } catch (_) {
    backendConnStatus.textContent = "🔴 Backend: no responde (puede estar dormido — probá igual, la primera pregunta lo despierta).";
  }
}
verificarBackend();

backendUrlInput.addEventListener("change", () => {
  BACKEND_URL = backendUrlInput.value.trim().replace(/\/+$/, "");
  localStorage.setItem("medusaBackendUrl", BACKEND_URL);
  checkBackendUrl(BACKEND_URL);
  verificarBackend();
});

// === Teclado en iOS/Safari: el chat es "position: absolute; bottom: 0",
// pero Safari no reduce el layout viewport cuando aparece el teclado (solo
// el visual viewport), así que el chat quedaba tapado por el teclado al
// escribir una pregunta. Se corrige levantando el chat la altura que el
// teclado le "come" al visualViewport. ===
if (window.visualViewport && chatEl) {
  const ajustarPorTeclado = () => {
    const gap = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
    chatEl.style.bottom = gap > 40 ? `${gap}px` : "0px";
  };
  window.visualViewport.addEventListener("resize", ajustarPorTeclado);
  window.visualViewport.addEventListener("scroll", ajustarPorTeclado);
}

// === Restaurar configuración predeterminada ===
// Borra solo las preferencias no sensibles guardadas por MedusaLee (nunca
// documentos, conversaciones ni claves API, que no se guardan en
// localStorage) y recarga la página con los valores de fábrica.
const CLAVES_PREFERENCIAS_VOZ = [
  "medusaVozActiva", "medusaVozModo", "medusaVozTipo", "medusaVozVelocidad", "medusaVozTono",
  "medusaVozVolumenPersonalizada", "medusaVozPersonalizadaURI", "medusaVozIA", "medusaObjetivo"
];
const CLAVES_PREFERENCIAS = [
  "medusaBackendUrl", "medusaColor", "medusaAutoColor", "medusaAnimActiva",
  ...CLAVES_PREFERENCIAS_VOZ
];
if (restaurarConfigBtn) {
  restaurarConfigBtn.addEventListener("click", () => {
    if (!confirm("¿Restaurar la configuración a los valores predeterminados? Esto no borra documentos ni conversaciones, porque esos no se guardan.")) return;
    for (const clave of CLAVES_PREFERENCIAS) localStorage.removeItem(clave);
    location.reload();
  });
}
if (restaurarVozBtn) {
  restaurarVozBtn.addEventListener("click", () => {
    if (!confirm("¿Restaurar solo la configuración de voz (modo, tono, velocidad, volumen, voz IA) a los valores predeterminados?")) return;
    for (const clave of CLAVES_PREFERENCIAS_VOZ) localStorage.removeItem(clave);
    location.reload();
  });
}
