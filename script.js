const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: true });
const messages = document.getElementById("messages");
const userInput = document.getElementById("userInput");

let mainColor = "#7dcaff";
let pulse = 0;
const BACKEND_URL = "https://TU-BACKEND.onrender.com/chat"; // <-- tu servidor aquí

// ---- Animación Medusa ----
function hexToRgb(hex) {
  const bigint = parseInt(hex.slice(1), 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}
function resizeCanvas() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

const pointer = { x: innerWidth / 2, y: innerHeight / 2 };
const core = { x: pointer.x, y: pointer.y, vx: 0, vy: 0, radius: 30 };
window.addEventListener("mousemove", e => updatePointer(e.clientX, e.clientY));
function updatePointer(x, y){ pointer.x = x; pointer.y = y; }

class Tentacle {
  constructor(core, angle){
    this.core = core; this.angle = angle;
    this.length = 100 + Math.random()*80;
    this.segments = Array.from({length: Math.floor(this.length/10)},()=>({x:core.x,y:core.y}));
    this.noise = Math.random()*100; this.phase = Math.random()*Math.PI*2;
  }
  update(t){
    const base = this.angle + Math.sin(t*0.001+this.phase)*0.3;
    const dirX = Math.cos(base)*180, dirY=Math.sin(base)*180;
    let prevX=this.core.x, prevY=this.core.y;
    const segLen=10;
    for(const seg of this.segments){
      const pct=this.segments.indexOf(seg)/this.segments.length;
      const wave=Math.sin(t*0.004+this.noise+pct*3)*60*(1-pct);
      const sway=base+Math.PI/2;
      const targetX=this.core.x+dirX*pct+wave*Math.cos(sway);
      const targetY=this.core.y+dirY*pct+wave*Math.sin(sway);
      const dx=targetX-prevX, dy=targetY-prevY;
      const dist=Math.hypot(dx,dy)||1;
      const ratio=segLen/dist;
      seg.x=prevX+dx*ratio; seg.y=prevY+dy*ratio;
      prevX=seg.x; prevY=seg.y;
    }
  }
  draw(ctx,flicker){
    const {r,g,b}=hexToRgb(mainColor);
    const grad=ctx.createLinearGradient(this.core.x,this.core.y,this.segments.at(-1).x,this.segments.at(-1).y);
    grad.addColorStop(0,`rgba(${r},${g},${b},${0.9})`);
    grad.addColorStop(1,`rgba(${r*0.4},${g*0.4},${b*0.4},${0.3})`);
    ctx.save(); ctx.globalCompositeOperation="lighter";
    ctx.beginPath(); ctx.moveTo(this.core.x,this.core.y);
    for(const p of this.segments) ctx.lineTo(p.x,p.y);
    ctx.strokeStyle=grad; ctx.lineWidth=2+flicker*2;
    ctx.shadowBlur=25+flicker*45; ctx.shadowColor=`rgba(${r},${g},${b},0.7)`;
    ctx.stroke(); ctx.restore();
  }
}
const tentacles=Array.from({length:60},(_,i)=>new Tentacle(core,(i/60)*Math.PI*2));

function animate(t){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const flicker=Math.random()*0.6;
  const ax=(pointer.x-core.x)*0.01, ay=(pointer.y-core.y)*0.01;
  core.vx+=ax; core.vy+=ay; core.vx*=0.95; core.vy*=0.95;
  core.x+=core.vx; core.y+=core.vy;
  const {r,g,b}=hexToRgb(mainColor);
  const intensity=1+Math.sin(pulse)*0.5;
  ctx.save();
  const glow=ctx.createRadialGradient(core.x,core.y,0,core.x,core.y,150);
  glow.addColorStop(0,`rgba(${r},${g},${b},${0.9*intensity})`);
  glow.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=glow; ctx.beginPath();
  ctx.arc(core.x,core.y,core.radius*(3.5+flicker*0.8),0,Math.PI*2); ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.fillStyle=`rgba(${r},${g},${b},${0.9*intensity})`;
  ctx.arc(core.x,core.y,core.radius*(1.1+flicker*0.1),0,Math.PI*2); ctx.fill();
  tentacles.forEach(t=>{t.update(t);t.draw(ctx,flicker);});
  pulse*=0.95; requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// ---- Chat GPT ----
userInput.addEventListener("keydown", e => {
  if(e.key==="Enter" && userInput.value.trim()){
    const text=userInput.value.trim();
    addMessage(text,"user");
    userInput.value="";
    askMedusa(text);
  }
});

function addMessage(text,sender){
  const msg=document.createElement("div");
  msg.classList.add("msg",sender);
  msg.textContent=text;
  messages.appendChild(msg);
  messages.scrollTop=messages.scrollHeight;
}

async function askMedusa(userText){
  addMessage("💭 La medusa piensa...", "bot");
  pulse = 6;
  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ message: userText })
    });
    const data = await response.json();
    const reply = data.reply || "No entendí bien, Rodri 🪼";
    document.querySelector(".msg.bot:last-child").textContent = reply;
    mainColor = data.color || "#7dcaff";
  } catch (err){
    console.error(err);
    document.querySelector(".msg.bot:last-child").textContent =
      "⚡ Error al conectar con el servidor. Verificá la URL.";
    mainColor = "#ff8080";
  }
}
