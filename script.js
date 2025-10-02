<!-- Incluye Three.js y el OrbitControls (si quieres navegación) -->
<script src="https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.155.0/examples/js/controls/OrbitControls.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.155.0/examples/js/loaders/GLTFLoader.js"></script>
<canvas id="bg"></canvas>
<script>
// --- Parámetros principales ---
const matrixChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*';
const chars = matrixChars.split('');

// --- Three.js scene setup ---
const canvas = document.getElementById('bg');
const renderer = new THREE.WebGLRenderer({canvas, alpha:true});
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.set(0,0,6);

// Luz
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(10,10,10);
scene.add(dirLight);

// --- Cargar modelo cráneo (usa un modelo de glTF, aquí solo ejemplo de esfera) ---
let skull;
const skullGeometry = new THREE.SphereGeometry(1.5, 32, 32); // Reemplaza por modelo real
const skullMaterial = new THREE.MeshStandardMaterial({color: 0xffffff, metalness:0.2, roughness:0.7});
skull = new THREE.Mesh(skullGeometry, skullMaterial);
scene.add(skull);

// --- Lluvia de letras como partículas ---
const dropsCount = 120;
const drops = [];
for(let i=0; i<dropsCount; i++){
    drops.push({
        x: (Math.random()-0.5)*6,
        y: Math.random()*6+2,
        z: (Math.random()-0.5)*2,
        char: chars[Math.floor(Math.random()*chars.length)],
        speed: 0.02+Math.random()*0.03,
        sliding: false,
        theta: 0,
        phi: 0
    });
}

// --- Canvas 2D para letras ---
const letterCanvas = document.createElement('canvas');
letterCanvas.width = window.innerWidth;
letterCanvas.height = window.innerHeight;
const ctx = letterCanvas.getContext('2d');
document.body.appendChild(letterCanvas);
letterCanvas.style.position = 'absolute';
letterCanvas.style.top = 0;
letterCanvas.style.left = 0;
letterCanvas.style.pointerEvents = 'none';

// --- Mouse movimiento para rotar cráneo ---
let mouseX = 0;
let mouseY = 0;
window.addEventListener('mousemove', e=>{
    mouseX = (e.clientX/window.innerWidth - 0.5) * Math.PI;
    mouseY = (e.clientY/window.innerHeight - 0.5) * Math.PI/2;
});

// --- Animación principal ---
function animate(){
    requestAnimationFrame(animate);

    // Rotar cráneo hacia mouse
    skull.rotation.y += (mouseX-skull.rotation.y)*0.07;
    skull.rotation.x += (mouseY-skull.rotation.x)*0.07;

    // Limpiar canvas 2D
    ctx.clearRect(0,0,letterCanvas.width,letterCanvas.height);

    // Letras en caída y colisión con cráneo
    drops.forEach(d=>{
        // Si está "cayendo"
        if(!d.sliding){
            d.y -= d.speed;
            // Detectar colisión con cráneo (esfera de radio 1.5 centrada en 0,0,0)
            const dist = Math.sqrt(d.x*d.x + d.y*d.y + d.z*d.z);
            if(dist < 1.52){
                d.sliding = true;
                // Calcular ángulo en la esfera donde chocó
                d.theta = Math.atan2(d.z, d.x);
                d.phi = Math.acos(d.y/1.5);
                d.slideSpeed = 0.015 + Math.random()*0.01;
            }
        } else {
            // Desliza a lo largo de la "latitud" de la esfera
            d.theta += d.slideSpeed;
            // Convertir a coordenadas cartesianas
            d.x = 1.52*Math.cos(d.theta)*Math.sin(d.phi);
            d.y = 1.52*Math.cos(d.phi);
            d.z = 1.52*Math.sin(d.theta)*Math.sin(d.phi);
            // Si terminó de "deslizar", reinicia
            if(d.theta > Math.PI*2){
                d.x = (Math.random()-0.5)*6;
                d.y = Math.random()*6+2;
                d.z = (Math.random()-0.5)*2;
                d.char = chars[Math.floor(Math.random()*chars.length)];
                d.sliding = false;
            }
        }
        // Proyectar 3D a 2D
        const pos = new THREE.Vector3(d.x,d.y,d.z);
        pos.project(camera);
        const px = (pos.x*0.5+0.5)*window.innerWidth;
        const py = (-pos.y*0.5+0.5)*window.innerHeight;
        ctx.fillStyle = '#0F0';
        ctx.font = '18px monospace';
        ctx.fillText(d.char, px, py);
    });

    renderer.render(scene, camera);
}
animate();

// --- Resize handler ---
window.addEventListener('resize', ()=>{
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    letterCanvas.width = window.innerWidth;
    letterCanvas.height = window.innerHeight;
});

</script>
