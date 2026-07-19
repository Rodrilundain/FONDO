# MedusaLee

App interactiva (una medusa animada) que lee tus documentos y archivos en
voz alta, con distintas voces configurables, y responde preguntas sobre el
contenido cargado — pensada como ayuda para estudiar.

🔗 **Demo:** https://rodrilundain.github.io/MedusaLee/

## Funcionalidades

- Carga de documentos por URL (PDF, Word, txt, o páginas web — con
  detección automática de links de Google Drive) o subiendo un archivo
  local.
- Lectura del documento completo en voz alta con controles de
  ▶️ reproducir, ⏸️ pausar, ⏵ reanudar y 🔇 detener, más una barra de
  velocidad (0.5x–2x) — usa la voz del navegador (gratis, sin límite).
- Tres estilos de voz: 🤖 robotrónica (estilo TARS), 👨 hombre (estilo
  JARVIS) y 👩 mujer.
- Chat para hacer preguntas sobre el documento cargado (requiere el
  backend, ver abajo). Las respuestas del chat pueden leerse con una
  **voz de IA real** (ElevenLabs) en vez de la del navegador — ver
  abajo.

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

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Rodrilundain/MedusaLee)

1. Elegí "Deploy to Render" y conectá tu cuenta de GitHub.
2. Cuando te pida la variable `GROQ_API_KEY`, **pegá tu clave acá** (la
   conseguís gratis en https://console.groq.com/keys, con tu cuenta de
   Google/GitHub, sin tarjeta). `ELEVENLABS_API_KEY` es opcional (ver
   abajo) — podés dejarla vacía y agregarla después.
3. Cuando termine el deploy, copiá la URL que te da Render (algo como
   `https://medusa-backend.onrender.com`).
4. En la app, abrí el menú (☰) y pegala en el campo "🔌 Backend de
   preguntas".

### Voz de IA real para el chat (ElevenLabs, opcional)

Las respuestas del chat pueden leerse con una voz generada por IA en vez
de la del navegador — ahí es donde realmente se nota personalidad, tono
y calidez. La lectura del documento completo sigue usando la voz del
navegador a propósito (ElevenLabs tiene un límite de caracteres gratis
por mes, y un documento entero lo consumiría en un par de lecturas).

1. Creá una cuenta gratis en https://elevenlabs.io/ y conseguí tu API
   key en https://elevenlabs.io/app/settings/api-keys.
2. En el servicio de Render (Environment → Add Environment Variable),
   agregá `ELEVENLABS_API_KEY` con esa clave. Si ya desplegaste el
   backend, hacelo ahí directamente — no hace falta rehacer el deploy.
3. (Opcional) Las voces por defecto son premade de ElevenLabs, en inglés
   pero con buen soporte multilingüe. Para usar una voz con acento en
   español, buscá una en https://elevenlabs.io/app/voice-library, copiá
   su `voice_id`, y agregalo como `ELEVENLABS_VOICE_ID_HOMBRE` y/o
   `ELEVENLABS_VOICE_ID_MUJER` en las variables de entorno de Render.
4. En la app, abrí el menú y dejá tildado "🧠 Voz IA (ElevenLabs) en las
   respuestas del chat" (viene activado por defecto). Sin la API key
   configurada, el chat sigue funcionando igual, solo que las respuestas
   se leen con la voz del navegador.

### Correrlo local

```bash
cd server
cp .env.example .env
```

Abrí `server/.env` y reemplazá donde dice **"pega tu clave acá"** por tus
claves reales (`GROQ_API_KEY` obligatoria, `ELEVENLABS_API_KEY`
opcional). Después:

```bash
npm install
npm start
```
