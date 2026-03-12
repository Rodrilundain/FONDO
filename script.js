const BACKEND_URL = "/chat";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: true });
const colorPicker = document.getElementById("color");
const autoColor = document.getElementById("autoColor");
const menu = document.getElementById("menu");
const menuBtn = document.getElementById("menuBtn");
const closeMenu = document.getElementById("closeMenu");
const docUrlInput = document.getElementById("docUrl");
const status = document.getElementById("status");
const messages = document.getElementById("messages");
const question = document.getElementById("question");
const sendBtn = document.getElementById("sendBtn");

// === Control de Menú ===
menuBtn.addEventListener("click", () => menu.classList.add("open"));
closeMenu.addEventListener("click", () => menu.classList.remove("open"));

// === Color control ===
let mainColor = colorPicker.value;
let autoHue = 200;
let autoMode = false;
colorPicker.addEventListener("input", e => mainColor = e.target.value);
autoColor.addEventListener("change", e => autoMode = e.target.checked);

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

// === Partículas (Marine Snow) ===
class Particle {
  constructor() {
    this.init();
  }
  init() {
    this.x = Math.random() * canvas.width / devicePixelRatio;
    this.y = Math.random() * canvas.height / devicePixelRatio;
    this.size = Math.random() * 1.5 + 0.5;
    this.speedY = Math.random() * 0.3 + 0.1;
    this.speedX = (Math.random() - 0.5) * 0.2;
    this.opacity = Math.random() * 0.5 + 0.1;
  }
  update() {
    this.y += this.speedY;
    this.x += this.speedX;
    if (this.y > canvas.height / devicePixelRatio) this.y = -10;
  }
  draw() {
    ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}
const marineSnow = Array.from({ length: 100 }, () => new Particle());

// === Documento remoto ===
let documentoCargado = "";
docUrlInput.addEventListener("change", async () => {
  const url = docUrlInput.value.trim();
  if (!url) return;
  status.textContent = "Cargando documento...";
  try {
    const proxy = "https://api.allorigins.win/get?url=" + encodeURIComponent(url);
    const res = await fetch(proxy);
    const data = await res.json();
    const html = data.contents;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    documentoCargado = doc.body.innerText.replace(/\s+/g, " ").trim();
    status.textContent = "✅ Documento cargado correctamente.";
  } catch (err) {
    console.error(err);
    status.textContent = "⚠️ Error al leer el documento.";
  }
});

// === Chat ===
function handleSend() {
  const query = question.value.trim();
  if (!query) return;
  addMessage(query, "user");
  question.value = "";
  medusaRespond(query);
}
question.addEventListener("keypress", e => { if (e.key === "Enter") handleSend(); });
sendBtn.addEventListener("click", handleSend);

function addMessage(text, sender) {
  const div = document.createElement("div");
  div.className = `msg ${sender}`;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

async function medusaRespond(query) {
  const botMsg = addMessage("💭 Pensando...", "bot");
  pulse = 6;
  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: query,
        context: documentoCargado.slice(0, 8000)
      })
    });
    const data = await res.json();
    botMsg.textContent = data.reply || "⚡ No obtuve respuesta.";
    if (data.color) {
        mainColor = data.color;
        colorPicker.value = mainColor;
    }
    pulse = 12;
  } catch (err) {
    console.error(err);
    botMsg.textContent = "⚠️ Error al conectar con el servidor.";
  }
}

// === Animación Medusa ===
function resizeCanvas() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  marineSnow.forEach(p => p.init());
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

const pointer = { x: innerWidth / 2, y: innerHeight / 2 };
const core = { x: pointer.x, y: pointer.y, vx: 0, vy: 0, radius: 35 };
let lastMove = Date.now();

window.addEventListener("mousemove", e => {
  pointer.x = e.clientX; pointer.y = e.clientY;
  lastMove = Date.now();
});

class Tentacle {
  constructor(core, angle) {
    this.core = core; this.angle = angle;
    this.length = 120 + Math.random() * 100;
    this.segments = [];
    this.noise = Math.random() * 100;
    this.phase = Math.random() * Math.PI * 2;
    const segCount = 15;
    for (let i = 0; i < segCount; i++) this.segments.push({ x: core.x, y: core.y });
  }
  update(t, flicker) {
    const baseAngle = this.angle + Math.sin(t * 0.001 + this.phase) * 0.2;
    const dirX = Math.cos(baseAngle) * (this.length + flicker * 20);
    const dirY = Math.sin(baseAngle) * (this.length + flicker * 20);
    let prevX = this.core.x, prevY = this.core.y;
    const segLen = this.length / this.segments.length;

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      const pct = i / this.segments.length;
      // Ondulación orgánica
      const wave = Math.sin(t * 0.003 + this.noise + i * 0.5) * (40 + pulse * 5) * pct;
      const swayAngle = baseAngle + Math.PI / 2;

      const targetX = this.core.x + (dirX * pct) + wave * Math.cos(swayAngle);
      const targetY = this.core.y + (dirY * pct) + wave * Math.sin(swayAngle);

      const dx = targetX - prevX, dy = targetY - prevY;
      const dist = Math.hypot(dx, dy) || 1;
      seg.x = prevX + (dx / dist) * segLen;
      seg.y = prevY + (dy / dist) * segLen;
      prevX = seg.x; prevY = seg.y;
    }
  }
  draw(ctx, flicker) {
    const { r, g, b } = hexToRgb(mainColor);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.moveTo(this.core.x, this.core.y);
    for (const p of this.segments) ctx.lineTo(p.x, p.y);

    const grad = ctx.createLinearGradient(this.core.x, this.core.y, this.segments.at(-1).x, this.segments.at(-1).y);
    grad.addColorStop(0, `rgba(${r},${g},${b},${0.8 + flicker * 0.2})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

    ctx.strokeStyle = grad;
    ctx.lineWidth = 4 * (1 + flicker) * (1 + pulse/10);
    ctx.lineCap = "round";
    ctx.shadowBlur = 15 + flicker * 30 + pulse * 2;
    ctx.shadowColor = `rgba(${r},${g},${b},0.8)`;
    ctx.stroke();
    ctx.restore();
  }
}

const tentacles = Array.from({ length: 40 }, (_, i) => new Tentacle(core, (i / 40) * Math.PI * 2));
let pulse = 0;

function animate(t) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Marine Snow
  marineSnow.forEach(p => { p.update(); p.draw(); });

  if (autoMode) {
    autoHue = (autoHue + 0.3) % 360;
    mainColor = hslToHex(autoHue, 100, 65);
    colorPicker.value = mainColor;
  }

  const timeSinceMove = Date.now() - lastMove;
  const flicker = Math.sin(t * 0.005) * 0.2 + 0.4 + (Math.random() * 0.1);
  pulse = Math.max(pulse - 0.15, 0);

  // Suavizado de movimiento core
  const targetX = pointer.x + Math.sin(t * 0.0008) * 60 * Math.min(timeSinceMove / 2000, 1);
  const targetY = pointer.y + Math.cos(t * 0.001) * 40 * Math.min(timeSinceMove / 2000, 1);
  core.vx += (targetX - core.x) * 0.02;
  core.vy += (targetY - core.y) * 0.02;
  core.vx *= 0.92; core.vy *= 0.92;
  core.x += core.vx; core.y += core.vy;

  const { r, g, b } = hexToRgb(mainColor);

  // Glow ambiental
  const gGlow = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, 200 + pulse * 10);
  gGlow.addColorStop(0, `rgba(${r},${g},${b},${0.4 + flicker * 0.2})`);
  gGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gGlow;
  ctx.beginPath(); ctx.arc(core.x, core.y, 200 + pulse * 10, 0, Math.PI * 2); ctx.fill();

  // Tentáculos
  for (const tacle of tentacles) {
    tacle.update(t, flicker);
    tacle.draw(ctx, flicker);
  }

  // Núcleo
  ctx.beginPath();
  const coreGrad = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, core.radius);
  coreGrad.addColorStop(0, "#fff");
  coreGrad.addColorStop(0.5, `rgba(${r},${g},${b},0.9)`);
  coreGrad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = coreGrad;
  ctx.arc(core.x, core.y, core.radius * (1 + flicker * 0.2 + pulse * 0.1), 0, Math.PI * 2);
  ctx.fill();

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
