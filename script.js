const canvas = document.getElementById('matrix');
const ctx = canvas.getContext('2d');

// Set canvas size to full screen
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Characters to be used in the rain
const matrixChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*';
const chars = matrixChars.split('');

// Set up columns
const fontSize = 16;
const columns = canvas.width / fontSize;
const drops = Array(Math.floor(columns)).fill(0);

const skullImage = new Image();
skullImage.src = 'https://example.com/skull.png'; // Replace with your skull image URL
let jawAngle = 0;
let jawDirection = 1;

// Draw the rain effect
function draw() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (skullImage.complete) {
        const skullX = (canvas.width - skullImage.width) / 2;
        const skullY = (canvas.height - skullImage.height) / 2;

        // Draw the skull
        ctx.drawImage(skullImage, skullX, skullY);

        // Draw the jaw movement
        ctx.save();
        ctx.translate(skullX + skullImage.width / 2, skullY + skullImage.height / 1.5);
        ctx.rotate((Math.PI / 180) * jawAngle);
        ctx.translate(-(skullX + skullImage.width / 2), -(skullY + skullImage.height / 1.5));
        ctx.restore();
    }

    ctx.fillStyle = '#0F0';
    ctx.font = `${fontSize}px monospace`;

    drops.forEach((y, x) => {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, x * fontSize, y * fontSize);

        if (y * fontSize > canvas.height && Math.random() > 0.975) {
            drops[x] = 0;
        }
        drops[x]++;
    });

    // Animate the jaw
    jawAngle += jawDirection;
    if (jawAngle > 10 || jawAngle < -10) {
        jawDirection *= -1;
    }
}

setInterval(draw, 50);

// Resize the canvas when the window is resized
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    drops.length = Math.floor(canvas.width / fontSize);
    drops.fill(0);
});