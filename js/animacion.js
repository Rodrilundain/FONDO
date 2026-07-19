// === Animación de fondo: medusa de canvas ===
// Responsabilidad: dibujar y animar la medusa, manejar el color (manual o
// automático) y respetar rendimiento/accesibilidad (pestaña oculta,
// prefers-reduced-motion, menos tentáculos en pantallas chicas).

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: true });
const colorPicker = document.getElementById("color");
const autoColorToggle = document.getElementById("autoColor");
const animActivaToggle = document.getElementById("animActiva");

function resizeCanvas() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  actualizarCantidadTentaculos();
}
window.addEventListener("resize", resizeCanvas);
// En celulares, cambiar de orientación dispara "resize" pero algunos
// navegadores lo hacen con retraso: escuchamos también "orientationchange"
// para que el canvas y la cantidad de tentáculos se ajusten sin esperar.
window.addEventListener("orientationchange", () => setTimeout(resizeCanvas, 200));

const pointer = { x: innerWidth / 2, y: innerHeight / 2 };
const core = { x: pointer.x, y: pointer.y, vx: 0, vy: 0, radius: 30 };
let lastMove = Date.now();

window.addEventListener("mousemove", e => updatePointer(e.clientX, e.clientY));
// El listener de touchmove NO debe bloquear el scroll de paneles con
// contenido propio (menú, chat): solo se evita el scroll de la página
// cuando el toque ocurre fuera de esos paneles (antes bloqueaba TODO el
// scroll táctil, incluido el del menú y el chat, en cualquier celular).
window.addEventListener("touchmove", e => {
  const dentroDePanelConScroll = e.target.closest(".menu, .messages, .chat, .hero-panel");
  if (!dentroDePanelConScroll) e.preventDefault();
  const t = e.touches[0];
  updatePointer(t.clientX, t.clientY);
}, { passive: false });

function updatePointer(x, y) {
  pointer.x = x;
  pointer.y = y;
  lastMove = Date.now();
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * color);
  };
  return "#" + [f(0), f(8), f(4)]
    .map(x => x.toString(16).padStart(2, "0")).join("");
}
function hexToRgb(hex) {
  const bigint = parseInt(hex.slice(1), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
}

// === Preferencias: color, auto-color y animación se recuerdan entre visitas ===
let mainColor = localStorage.getItem("medusaColor") || colorPicker.value;
let autoHue = 200;
let autoMode = localStorage.getItem("medusaAutoColor") === "1";
colorPicker.value = mainColor;
autoColorToggle.checked = autoMode;

colorPicker.addEventListener("input", e => {
  mainColor = e.target.value;
  localStorage.setItem("medusaColor", mainColor);
});
autoColorToggle.addEventListener("change", e => {
  autoMode = e.target.checked;
  localStorage.setItem("medusaAutoColor", autoMode ? "1" : "0");
});

class Tentacle {
  constructor(core, angle) {
    this.core = core; this.angle = angle;
    this.length = 100 + Math.random() * 80;
    this.segments = [];
    this.noise = Math.random() * 100;
    this.phase = Math.random() * Math.PI * 2;
    const segCount = Math.floor(this.length / 10);
    for (let i = 0; i < segCount; i++) this.segments.push({ x: core.x, y: core.y });
  }
  update(t) {
    const baseAngle = this.angle + Math.sin(t * 0.001 + this.phase) * 0.3;
    const dirX = Math.cos(baseAngle) * 180;
    const dirY = Math.sin(baseAngle) * 180;
    let prevX = this.core.x, prevY = this.core.y;
    const segLen = 10;
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      const pct = i / this.segments.length;
      const wave = Math.sin(t * 0.004 + this.noise + i * 0.3) * 60 * (1 - pct);
      const swayAngle = baseAngle + Math.PI / 2;
      const targetX = this.core.x + dirX * pct + wave * Math.cos(swayAngle);
      const targetY = this.core.y + dirY * pct + wave * Math.sin(swayAngle);
      const dx = targetX - prevX, dy = targetY - prevY;
      const dist = Math.hypot(dx, dy) || 1;
      const ratio = segLen / dist;
      seg.x = prevX + dx * ratio;
      seg.y = prevY + dy * ratio;
      prevX = seg.x; prevY = seg.y;
    }
  }
  draw(ctx, flicker) {
    const { r, g, b } = hexToRgb(mainColor);
    const grad = ctx.createLinearGradient(this.core.x, this.core.y, this.segments.at(-1).x, this.segments.at(-1).y);
    grad.addColorStop(0, `rgba(${r},${g},${b},${0.8 + flicker * 0.2})`);
    grad.addColorStop(1, `rgba(${r * 0.4},${g * 0.4},${b * 0.4},${0.3 + flicker * 0.2})`);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.moveTo(this.core.x, this.core.y);
    for (const p of this.segments) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2 + flicker * 2;
    ctx.shadowBlur = 25 + flicker * 45;
    ctx.shadowColor = `rgba(${r},${g},${b},0.7)`;
    ctx.stroke();
    ctx.restore();
  }
}

// Menos tentáculos en pantallas chicas: menos CPU/batería en celulares.
// Se recalcula en resize/orientationchange para que rotar el celular no deje
// la cantidad "congelada" en el valor del tamaño anterior.
let tentacles = [];
function actualizarCantidadTentaculos() {
  const totalTentaculos = window.innerWidth < 640 ? 28 : 65;
  if (tentacles.length === totalTentaculos) return;
  tentacles = Array.from({ length: totalTentaculos }, (_, i) => new Tentacle(core, (i / totalTentaculos) * Math.PI * 2));
}
actualizarCantidadTentaculos();
let pulse = 0;

// === Control de la animación: pausa en pestaña oculta, respeta
// prefers-reduced-motion, y se puede desactivar a mano desde el menú.
const prefiereMenosMovimiento = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const animGuardada = localStorage.getItem("medusaAnimActiva");
let animActiva = (animGuardada === null ? animActivaToggle.checked : animGuardada === "1") && !prefiereMenosMovimiento;
let pestañaVisible = !document.hidden;
animActivaToggle.checked = animActiva;
if (prefiereMenosMovimiento) animActivaToggle.checked = false;

animActivaToggle.addEventListener("change", e => {
  animActiva = e.target.checked;
  localStorage.setItem("medusaAnimActiva", animActiva ? "1" : "0");
  if (animActiva && pestañaVisible) requestAnimationFrame(animate);
});
document.addEventListener("visibilitychange", () => {
  pestañaVisible = !document.hidden;
  if (pestañaVisible && animActiva) requestAnimationFrame(animate);
});

function animate(t) {
  if (!animActiva || !pestañaVisible) return; // no seguir pidiendo frames de más
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (autoMode) {
    autoHue = (autoHue + 0.5) % 360;
    mainColor = hslToHex(autoHue, 100, 65);
    colorPicker.value = mainColor;
  }

  const timeSinceMove = Date.now() - lastMove;
  const flicker = Math.random() * 0.6 + pulse * 0.3;
  pulse = Math.max(pulse - 0.05, 0);

  const targetX = pointer.x + Math.sin(t * 0.001) * 100 * Math.min(timeSinceMove / 2000, 1);
  const targetY = pointer.y + Math.cos(t * 0.0013) * 80 * Math.min(timeSinceMove / 2000, 1);

  const ax = (targetX - core.x) * 0.01;
  const ay = (targetY - core.y) * 0.01;
  core.vx += ax; core.vy += ay;
  core.vx *= 0.95; core.vy *= 0.95;
  core.x += core.vx; core.y += core.vy;

  const { r, g, b } = hexToRgb(mainColor);

  ctx.save();
  const gGlow = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, 150);
  gGlow.addColorStop(0, `rgba(${r},${g},${b},${0.9 + flicker * 0.2})`);
  gGlow.addColorStop(0.3, `rgba(${r * 0.7},${g * 0.7},${b * 0.7},${0.3 + flicker * 0.2})`);
  gGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gGlow;
  ctx.beginPath();
  ctx.arc(core.x, core.y, core.radius * (3.5 + flicker * 0.8), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.fillStyle = `rgba(${r},${g},${b},${0.9 + flicker * 0.2})`;
  ctx.arc(core.x, core.y, core.radius * (1.1 + flicker * 0.1), 0, Math.PI * 2);
  ctx.fill();

  for (const tacle of tentacles) {
    tacle.update(t);
    tacle.draw(ctx, flicker);
  }

  requestAnimationFrame(animate);
}

resizeCanvas();
if (animActiva) requestAnimationFrame(animate);
