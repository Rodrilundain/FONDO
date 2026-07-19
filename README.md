# Medusa Inteligente – Grupo Fiancar

App interactiva (una medusa animada) que lee documentos y archivos en voz
alta, con distintas voces configurables, y responde preguntas sobre el
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
`server/` que llama a la API de OpenAI. Necesita tu propia
`OPENAI_API_KEY` — sin eso, el chat queda deshabilitado (el resto de la
app funciona igual).

### Deploy en 1 click (Render, gratis)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Rodrilundain/FONDO)

1. Elegí "Deploy to Render" y conectá tu cuenta de GitHub.
2. Cuando te lo pida, pegá tu `OPENAI_API_KEY` (se consigue en
   https://platform.openai.com/api-keys).
3. Cuando termine el deploy, copiá la URL que te da Render (algo como
   `https://medusa-backend.onrender.com`).
4. En la app, abrí el menú (☰) y pegala en el campo "🔌 Backend de
   preguntas".

### Correrlo local

```bash
cd server
cp .env.example .env   # y completá OPENAI_API_KEY
npm install
npm start
```
