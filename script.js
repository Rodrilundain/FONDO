const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: true });

let mainColor = "#7dcaff";
let autoHue = 200;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return "#" + f(0) + f(8) + f(4);
}

function resizeCanvas() {
  canvas.width  = window.innerWidth  * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

const pointer = { x: innerWidth / 2, y: innerHeight / 2 };
const core    = { x: pointer.x, y: pointer.y, vx: 0, vy: 0, radius: 30 };
let lastMove  = Date.now();

function updatePointer(x, y) {
  pointer.x = x; pointer.y = y;
  lastMove = Date.now();
}

window.addEventListener("mousemove", e => updatePointer(e.clientX, e.clientY));
window.addEventListener("touchmove", e => {
  e.preventDefault();
  const t = e.touches[0];
  updatePointer(t.clientX, t.clientY);
}, { passive: false });

class Tentacle {
  constructor(angle) {
    this.angle    = angle;
    this.length   = 100 + Math.random() * 80;
    this.noise    = Math.random() * 100;
    this.phase    = Math.random() * Math.PI * 2;
    const segs    = Math.floor(this.length / 10);
    this.segments = Array.from({ length: segs }, () => ({ x: core.x, y: core.y }));
  }

  update(t) {
    const base = this.angle + Math.sin(t * 0.001 + this.phase) * 0.3;
    const dirX = Math.cos(base) * 180;
    const dirY = Math.sin(base) * 180;
    let px = core.x, py = core.y;

    for (let i = 0; i < this.segments.length; i++) {
      const seg  = this.segments[i];
      const pct  = i / this.segments.length;
      const wave = Math.sin(t * 0.004 + this.noise + i * 0.3) * 60 * (1 - pct);
      const sway = base + Math.PI / 2;
      const tx   = core.x + dirX * pct + wave * Math.cos(sway);
      const ty   = core.y + dirY * pct + wave * Math.sin(sway);
      const dx   = tx - px, dy = ty - py;
      const dist = Math.hypot(dx, dy) || 1;
      seg.x = px + dx * (10 / dist);
      seg.y = py + dy * (10 / dist);
      px = seg.x; py = seg.y;
    }
  }

  draw(flicker) {
    const { r, g, b } = hexToRgb(mainColor);
    const last = this.segments.at(-1);
    const grad = ctx.createLinearGradient(core.x, core.y, last.x, last.y);
    grad.addColorStop(0, `rgba(${r},${g},${b},${0.8 + flicker * 0.2})`);
    grad.addColorStop(1, `rgba(${r * 0.4},${g * 0.4},${b * 0.4},${0.3 + flicker * 0.2})`);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.moveTo(core.x, core.y);
    for (const p of this.segments) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = grad;
    ctx.lineWidth   = 2 + flicker * 2;
    ctx.shadowBlur  = 25 + flicker * 45;
    ctx.shadowColor = `rgba(${r},${g},${b},0.7)`;
    ctx.stroke();
    ctx.restore();
  }
}

const tentacles = Array.from({ length: 65 }, (_, i) => new Tentacle((i / 65) * Math.PI * 2));

function animate(t) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  autoHue = (autoHue + 0.15) % 360;
  mainColor = hslToHex(autoHue, 90, 65);

  const idle    = Math.min((Date.now() - lastMove) / 2000, 1);
  const flicker = Math.random() * 0.6;

  const targetX = pointer.x + Math.sin(t * 0.001) * 100 * idle;
  const targetY = pointer.y + Math.cos(t * 0.0013) * 80 * idle;

  core.vx += (targetX - core.x) * 0.01;
  core.vy += (targetY - core.y) * 0.01;
  core.vx *= 0.95; core.vy *= 0.95;
  core.x  += core.vx; core.y += core.vy;

  const { r, g, b } = hexToRgb(mainColor);

  ctx.save();
  const glow = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, 150);
  glow.addColorStop(0,   `rgba(${r},${g},${b},${0.9 + flicker * 0.2})`);
  glow.addColorStop(0.3, `rgba(${r * 0.7},${g * 0.7},${b * 0.7},${0.3 + flicker * 0.2})`);
  glow.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
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
    tacle.draw(flicker);
  }

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
