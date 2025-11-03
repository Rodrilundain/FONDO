const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: true });
const messages = document.getElementById("messages");
const userInput = document.getElementById("userInput");

let mainColor = "#7dcaff";
let pulse = 0;

// Configuración
const SOURCE_URL = "https://novedadesfiancarcom.wordpress.com/estandarizacion-de-los-procesos/";
const BACKEND_URL = "https://TU-BACKEND.onrender.com/chat"; // Reemplazá por tu backend real (Render/Railway)

function hexToRgb(hex) {
  const bigint = parseInt(hex.slice(1), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
}

// === Canvas ===
function resizeCanvas() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
const core = { x: pointer.x, y: pointer.y, vx: 0, vy: 0, radius: 30 };
let lastMove = Date.now();

window.addEventListener("mousemove", e => updatePointer(e.clientX, e.clientY));
window.addEventListener("touchmove", e => {
  e.preventDefault();
  const t = e.touches[0];
  updatePointer(t.clientX, t.clientY);
}, { passive: false });

function updatePointer(x, y) {
  pointer.x = x;
  pointer.y = y;
  lastMove = Date.now();
}

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
    ctx.beginPath(); ctx.moveTo(this.core.x, this.core.y);
    for (const p of this.segments) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = grad; ctx.lineWidth = 2 + flicker * 2;
    ctx.shadowBlur = 25 + flicker * 45;
    ctx.shadowColor = `rgba(${r},${g},${b},0.7)`;
    ctx.stroke(); ctx.restore();
  }
}

const tentacles = Array.from({ length: 65 }, (_, i) => new Tentacle(core, (i / 65) * Math.PI * 2));

function animate(t) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const timeSinceMove = Date.now() - lastMove;
  const flicker = Math.random() * 0.6;
  const targetX = pointer.x + Math.sin(t * 0.001) * 100 * Math.min(timeSinceMove / 2000, 1);
  const targetY = pointer.y + Math.cos(t * 0.0013) * 80 * Math.min(timeSinceMove / 2000, 1);
  const ax = (targetX - core.x) * 0.01;
  const ay = (targetY - core.y) * 0.01;
  core.vx += ax; core.vy += ay;
  core.vx *= 0.95; core.vy *= 0.95;
  core.x += core.vx; core.y += core.vy;

  const { r, g, b } = hexToRgb(mainColor);
  const intensity = 1 + Math.sin(pulse) * 0.5;

  ctx.save();
  const gGlow = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, 150);
  gGlow.addColorStop(0, `rgba(${r},${g},${b},${0.9 * intensity})`);
  gGlow.addColorStop(0.3, `rgba(${r * 0.7},${g * 0.7},${b * 0.7},${0.3 * intensity})`);
  gGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gGlow;
  ctx.beginPath(); ctx.arc(core.x, core.y, core.radius * (3.5 + flicker * 0.8), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.fillStyle = `rgba(${r},${g},${b},${0.9 * intensity})`;
  ctx.arc(core.x, core.y, core.radius * (1.1 + flicker * 0.1), 0, Math.PI * 2);
  ctx.fill();

  tentacles.forEach(tacle => { tacle.update(t); tacle.draw(ctx, flicker); });
  pulse *= 0.95;
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// === Chat ===
userInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && userInput.value.trim()) {
    const text = userInput.value.trim();
    addMessage(text, "user");
    userInput.value = "";
    getMedusaResponse(text);
  }
});

function addMessage(text, sender) {
  const msg = document.createElement("div");
  msg.classList.add("msg", sender);
  msg.textContent = text;
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
}

async function getMedusaResponse(query) {
  pulse = 6;
  addMessage("💭 Analizando información de procesos...", "bot");

  try {
    cconst proxyUrl = "https://api.allorigins.win/raw?url=" + encodeURIComponent(SOURCE_URL);
const res = await fetch(proxyUrl);

    const html = await res.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const text = doc.body.innerText.replace(/\s+/g, " ").trim();

    const lower = query.toLowerCase();
    const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 40);
    const found = sentences.filter(s => s.toLowerCase().includes(lower));

    if (found.length > 0) {
      const reply = found.slice(0, 3).join(". ") + ".";
      document.querySelector(".msg.bot:last-child").textContent = reply;
      mainColor = "#7eff8b"; // verde claro si encuentra info
      pulse = 6;
    } else {
      document.querySelector(".msg.bot:last-child").textContent = "🔎 No encontré información exacta, consultando al sistema central...";
      mainColor = "#ffd166";
      pulse = 6;

      // Fallback a ChatGPT
      const gptRes = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query })
      });

      const data = await gptRes.json();
      document.querySelector(".msg.bot:last-child").textContent = data.reply || "⚡ No obtuve respuesta del servidor.";
      mainColor = data.color || "#7dcaff";
      pulse = 6;
    }
  } catch (err) {
    console.error("Error:", err);
    document.querySelector(".msg.bot:last-child").textContent = "⚡ Error accediendo a los datos. Revisá tu conexión.";
    mainColor = "#ff8080";
  }
}
