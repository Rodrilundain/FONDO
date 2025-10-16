// Importar Three.js y cargador GLTF
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

// --- Configuración base ---
const canvas = document.getElementById("bg");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 6);

// --- Luces ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7);
scene.add(ambientLight, directionalLight);

// --- Modelo del cráneo ---
let skull;
const loader = new GLTFLoader();
loader.load(
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/BrainStem/glTF/BrainStem.gltf",
  (gltf) => {
    skull = gltf.scene;
    skull.scale.set(0.8, 0.8, 0.8);
    scene.add(skull);
  },
  undefined,
  (error) => console.error("Error al cargar modelo:", error)
);

// --- Letras ---
const matrixChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*";
const chars = matrixChars.split("");

const dropsCount = 150;
const drops = [];
for (let i = 0; i < dropsCount; i++) {
  drops.push({
    x: (Math.random() - 0.5) * 6,
    y: Math.random() * 6 + 2,
    z: (Math.random() - 0.5) * 2,
    char: chars[Math.floor(Math.random() * chars.length)],
    speed: 0.02 + Math.random() * 0.03,
    sliding: false,
    theta: 0,
    phi: 0,
  });
}

// --- Canvas de letras ---
const letterCanvas = document.createElement("canvas");
letterCanvas.id = "letterCanvas";
letterCanvas.width = window.innerWidth;
letterCanvas.height = window.innerHeight;
document.body.appendChild(letterCanvas);
const ctx = letterCanvas.getContext("2d");

// --- Movimiento de cámara con mouse ---
let mouseX = 0;
let mouseY = 0;
window.addEventListener("mousemove", (e) => {
  mouseX = (e.clientX / window.innerWidth - 0.5) * Math.PI;
  mouseY = (e.clientY / window.innerHeight - 0.5) * Math.PI / 2;
});

// --- Animación ---
function animate() {
  requestAnimationFrame(animate);

  if (skull) {
    skull.rotation.y += (mouseX - skull.rotation.y) * 0.07;
    skull.rotation.x += (mouseY - skull.rotation.x) * 0.07;
  }

  ctx.clearRect(0, 0, letterCanvas.width, letterCanvas.height);

  drops.forEach((d) => {
    if (!d.sliding) {
      d.y -= d.speed;
      const dist = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
      if (dist < 1.6) {
        d.sliding = true;
        d.theta = Math.atan2(d.z, d.x);
        d.phi = Math.acos(d.y / 1.5);
        d.slideSpeed = 0.015 + Math.random() * 0.01;
      }
    } else {
      d.theta += d.slideSpeed;
      d.x = 1.6 * Math.cos(d.theta) * Math.sin(d.phi);
      d.y = 1.6 * Math.cos(d.phi);
      d.z = 1.6 * Math.sin(d.theta) * Math.sin(d.phi);
      if (d.theta > Math.PI * 2) {
        d.x = (Math.random() - 0.5) * 6;
        d.y = Math.random() * 6 + 2;
        d.z = (Math.random() - 0.5) * 2;
        d.char = chars[Math.floor(Math.random() * chars.length)];
        d.sliding = false;
      }
    }

    const pos = new THREE.Vector3(d.x, d.y, d.z);
    pos.project(camera);
    const px = (pos.x * 0.5 + 0.5) * window.innerWidth;
    const py = (-pos.y * 0.5 + 0.5) * window.innerHeight;

    ctx.fillStyle = "#0F0";
    ctx.font = "18px monospace";
    ctx.fillText(d.char, px, py);
  });

  renderer.render(scene, camera);
}
animate();

// --- Ajuste responsive ---
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  letterCanvas.width = window.innerWidth;
  letterCanvas.height = window.innerHeight;
});
