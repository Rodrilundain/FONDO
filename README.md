# MedusaLee

App interactiva (una medusa animada) que lee tus documentos y archivos en
voz alta, con distintas voces configurables, y responde preguntas sobre el
contenido cargado — pensada como ayuda para estudiar.

🔗 **Demo:** https://rodrilundain.github.io/FONDO/

## Funcionalidades

- Carga de documentos por URL (o compartidos vía `?doc=`/`?url=` en el
  link) o subiendo un archivo local (`.txt`, `.md`, `.pdf`).
- Lectura en voz alta con controles de ▶️ reproducir, ⏸️ pausar,
  ⏵ reanudar y 🔇 detener, más una barra de velocidad (0.5x–2x).
- Tres estilos de voz: 🤖 robotrónica, 👨 hombre y 👩 mujer (usa la mejor
  voz en español que tenga disponible el navegador).
- Chat para hacer preguntas sobre el documento cargado (requiere el
  backend, ver abajo).

## Frontend

Es un sitio estático (`index.html`), sin build. Se publica solo con
GitHub Pages en cada push a `main` (ver
`.github/workflows/deploy-pages.yml`).

## Backend (preguntas y respuestas)

Las preguntas sobre el documento las responde un servidor Node chico en
`server/` que llama a la API de [Groq](https://groq.com/) — es **gratis**,
no pide tarjeta de crédito, y usa Llama 3.3 70B. Necesita tu propia
`GROQ_API_KEY` — sin eso, el chat queda deshabilitado (el resto de la
app funciona igual).

### Deploy en 1 click (Render, gratis)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Rodrilundain/FONDO)

1. Elegí "Deploy to Render" y conectá tu cuenta de GitHub.
2. Cuando te pida la variable `GROQ_API_KEY`, **pegá tu clave acá** (la
   conseguís gratis en https://console.groq.com/keys, con tu cuenta de
   Google/GitHub, sin tarjeta).
3. Cuando termine el deploy, copiá la URL que te da Render (algo como
   `https://medusa-backend.onrender.com`).
4. En la app, abrí el menú (☰) y pegala en el campo "🔌 Backend de
   preguntas".

### Correrlo local

```bash
cd server
cp .env.example .env
```

Abrí `server/.env` y reemplazá donde dice **"pega tu clave acá"** por tu
`GROQ_API_KEY` real. Después:

```bash
npm install
npm start
```
