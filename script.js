// Interactive Tentacle / Medusa que sigue el mouse
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: true });

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * devicePixelRatio);
  canvas.height = Math.floor(rect.height * devicePixelRatio);
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Mouse / touch state
const pointer = { x: canvas.width/2, y: canvas.height/2, isDown:false };

// core (la "cabeza" de la medusa)
const core = { x: canvas.width/2 / devicePixelRatio, y: canvas.height/2 / devicePixelRatio, radius: 18 };

canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  pointer.x = (e.clientX - r.left);
  pointer.y = (e.clientY - r.top);
});
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  const t = e.touches[0];
  pointer.x = (t.clientX - r.left);
  pointer.y = (t.clientY - r.top);
}, { passive: false });

canvas.addEventListener('mousedown', () => pointer.isDown = true);
canvas.addEventListener('mouseup', () => pointer.isDown = false);
canvas.addEventListener('touchstart', () => pointer.isDown = true, { passive: true });
canvas.addEventListener('touchend', () => pointer.isDown = false);

// Tentacle class
class Tentacle {
  constructor(core, angle, options = {}) {
    this.core = core;
    this.angle = angle;
    this.length = options.length || 28;         // número de segmentos
    this.segmentLength = options.segmentLength || 10;
    this.segments = [];
    this.noise = Math.random() * 100;
    this.phase = Math.random() * Math.PI * 2;

    for (let i = 0; i < this.length; i++) {
      this.segments.push({
        x: core.x,
        y: core.y,
        offset: i * 0.25 + Math.random() * 0.6
      });
    }
  }

  update(targetX, targetY, t) {
    // El primer objetivo está cerca del core pero ligeramente hacia el ángulo base.
    const baseAngle = this.angle;
    // target blend: mezcla entre mouse y base direction
    const dirX = Math.cos(baseAngle) * 50;
    const dirY = Math.sin(baseAngle) * 50;

    const aimX = targetX * 0.9 + (this.core.x + dirX) * 0.1;
    const aimY = targetY * 0.9 + (this.core.y + dirY) * 0.1;

    // actualizar primer segmento hacia aim con algo de ruido/sinusoide
    let prevX = this.core.x;
    let prevY = this.core.y;
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];

      // objetivo para este segmento: una interpolación hacia aim, con ondas
      const pct = i / this.segments.length;
      const wave = Math.sin((t * 0.003 + this.noise + i * 0.15) + this.phase) * (8 + 20 * (1 - pct));
      const targetSegX = aimX + Math.cos(baseAngle + Math.PI/2) * wave * (0.6 + pct * 1.2);
      const targetSegY = aimY + Math.sin(baseAngle + Math.PI/2) * wave * (0.6 + pct * 1.2);

      // follow previous segment smoothly
      const dx = targetSegX - seg.x;
      const dy = targetSegY - seg.y;
      const dist = Math.hypot(dx, dy) || 1;
      const desired = this.segmentLength;
      const ratio = desired / dist;

      // move the segment towards the target but keep distance stable
      seg.x = targetSegX - dx * (1 - 0.12) * 0.9;
      seg.y = targetSegY - dy * (1 - 0.12) * 0.9;

      // further enforce linkage with prev segment for smooth chain
      const linkDx = seg.x - prevX;
      const linkDy = seg.y - prevY;
      const linkDist = Math.hypot(linkDx, linkDy) || 1;
      const linkRatio = (this.segmentLength / linkDist);
      seg.x = prevX + linkDx * linkRatio;
      seg.y = prevY + linkDy * linkRatio;

      prevX = seg.x;
      prevY = seg.y;
    }
  }

  draw(ctx) {
    // stroke path with gradient-like style
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // primary stroke
    ctx.beginPath();
    for (let i = 0; i < this.segments.length; i++) {
      const p = this.segments[i];
      if (i === 0) ctx.moveTo(this.core.x, this.core.y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = 'rgba(80,170,255,0.18)';
    ctx.stroke();

    // main line
    ctx.beginPath();
    for (let i = 0; i < this.segments.length; i++) {
      const p = this.segments[i];
      if (i === 0) ctx.moveTo(this.core.x, this.core.y);
      ctx.lineTo(p.x, p.y);
    }
    // gradient along the first segment using alpha per segment
    for (let i = 0; i < 2; i++) {
      ctx.strokeStyle = `rgba(120,200,255,${0.18 + i*0.2})`;
      ctx.lineWidth = 1.6 - i*0.6;
      ctx.stroke();
    }

    ctx.restore();
  }
}

// Generar varios tentáculos con ángulos en abanico
const tentacles = [];
const total = 25;
for (let i = 0; i < total; i++) {
  const angle = -Math.PI/2 + (i - (total-1)/2) * (Math.PI / (total*1.4));
  tentacles.push(new Tentacle(core, angle, { length: 30, segmentLength: 10 }));
}

// anim loop
let last = performance.now();
function animate(t) {
  const now = t || performance.now();
  const dt = now - last;
  last = now;

  // clear
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // update core position — suavizado hacia pointer
  const r = 0.08;
  core.x += (pointer.x - core.x) * r;
  core.y += (pointer.y - core.y) * r;

  // optional pulsation
  const pulse = 1 + Math.sin(now * 0.005) * 0.06;

  // draw core glow
  ctx.save();
  ctx.beginPath();
  const g = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, 60);
  g.addColorStop(0, 'rgba(130,210,255,0.95)');
  g.addColorStop(0.25, 'rgba(80,170,255,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.arc(core.x, core.y, core.radius * pulse * 3.4, 0, Math.PI*2);
  ctx.fill();

  // draw core circle
  ctx.beginPath();
  ctx.fillStyle = 'rgba(120,200,255,0.98)';
  ctx.arc(core.x, core.y, core.radius * pulse, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  // update & draw tentacles
  for (const tacle of tentacles) {
    tacle.update(core.x + (pointer.x - core.x) * 0.6, core.y + (pointer.y - core.y) * 0.6, now);
    tacle.draw(ctx);
  }

  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
