// Turnstile (opcional, Etapa 2 de la auditoría) + ID de sesión para el
// límite de pedidos del Worker de IA. Todo lo de acá es del lado del
// navegador: la "site key" de Turnstile está pensada para ser pública
// (a diferencia de la clave secreta, que solo vive en el backend/Worker
// y nunca llega al frontend). Sin una site key configurada, nada de esto
// hace nada -- MedusaLee sigue funcionando exactamente igual que antes.

const TURNSTILE_SITE_KEY_STORAGE = "medusaTurnstileSiteKey";
const SESSION_ID_STORAGE = "medusaSessionId";

let turnstileToken = "";
let turnstileWidgetId = null;
let promesaScriptTurnstile = null;

function obtenerTurnstileSiteKey() {
  return localStorage.getItem(TURNSTILE_SITE_KEY_STORAGE) || "";
}

function guardarTurnstileSiteKey(valor) {
  const limpio = (valor || "").trim();
  if (limpio) localStorage.setItem(TURNSTILE_SITE_KEY_STORAGE, limpio);
  else localStorage.removeItem(TURNSTILE_SITE_KEY_STORAGE);
}

// ID aleatorio, generado una sola vez por navegador y persistido en
// localStorage. NO es una credencial ni prueba quién sos: solo ayuda a
// que el límite de pedidos del Worker reparta el cupo por
// persona/dispositivo en vez de por IP compartida (oficina, CGNAT, red
// móvil). Alguien decidido puede borrarlo y generar uno nuevo -- por eso
// esto es una capa de reparto más justa, no una protección de seguridad
// por sí sola (esa la da Turnstile + el binding de rate limiting).
function idDeSesion() {
  let id = localStorage.getItem(SESSION_ID_STORAGE);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    localStorage.setItem(SESSION_ID_STORAGE, id);
  }
  return id;
}

function tokenTurnstileActual() {
  return turnstileToken;
}

function cargarScriptTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (promesaScriptTurnstile) return promesaScriptTurnstile;
  promesaScriptTurnstile = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar Turnstile."));
    document.head.appendChild(script);
  });
  return promesaScriptTurnstile;
}

// Renderiza (o vuelve a renderizar, si cambió la site key) el widget
// dentro de #turnstileContenedor. Si no hay site key configurada, el
// contenedor queda oculto y no se carga ningún script de terceros --
// nada de Turnstile toca la red hasta que el usuario lo configura.
async function inicializarTurnstile() {
  const siteKey = obtenerTurnstileSiteKey();
  const contenedor = document.getElementById("turnstileContenedor");
  if (!contenedor) return;
  if (!siteKey) {
    contenedor.hidden = true;
    turnstileToken = "";
    return;
  }
  try {
    await cargarScriptTurnstile();
  } catch (err) {
    console.warn("Turnstile no se pudo cargar:", err.message);
    return;
  }
  contenedor.hidden = false;
  if (turnstileWidgetId !== null) {
    try { window.turnstile.remove(turnstileWidgetId); } catch (_) { /* ya no existía */ }
  }
  turnstileToken = "";
  turnstileWidgetId = window.turnstile.render(contenedor, {
    sitekey: siteKey,
    callback: (token) => { turnstileToken = token; },
    "expired-callback": () => { turnstileToken = ""; },
    "error-callback": () => { turnstileToken = ""; }
  });
}

window.MedusaSeguridad = {
  obtenerTurnstileSiteKey,
  guardarTurnstileSiteKey,
  idDeSesion,
  tokenTurnstileActual,
  inicializarTurnstile
};
