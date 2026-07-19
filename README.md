# MedusaLee

Escuchá, entendé y consultá tus documentos.

MedusaLee es una app web (una medusa animada de fondo) que lee tus
documentos en voz alta, analiza su contenido y responde preguntas sobre lo
que dice — pensada como ayuda para estudiar.

🔗 **Demo:** https://rodrilundain.github.io/MedusaLee/

## Funcionalidades

- Carga de documentos arrastrando el archivo, tocando para elegirlo, o
  pegando una URL (con detección automática de links de Google Drive).
- Extracción de texto de PDF, DOCX, TXT y Markdown, con validaciones
  claras (formato, tamaño máximo, archivo vacío, PDF sin texto, PDF
  protegido, URL inválida).
- Lectura del documento completo en voz alta con controles de
  ▶️ reproducir, ⏸️ pausar, ⏵ reanudar, ↻ reiniciar y 🔇 detener, más una
  barra de velocidad (0.5x–2x) — usa la voz del navegador (gratis, sin
  límite de caracteres). La lectura nunca arranca sola: siempre la inicia
  el usuario.
- Tres estilos de voz: 🤖 robotrónica (estilo TARS), 👨 hombre (estilo
  JARVIS) y 👩 mujer, con tono y velocidad ajustables a mano.
- Chat para hacer preguntas sobre el documento cargado (requiere el
  backend, ver abajo): preguntas sugeridas con un toque, copiar
  respuestas, limpiar la conversación, envío con Enter (Shift+Enter para
  salto de línea), y bloqueo de doble envío.
- Las respuestas del chat pueden leerse con una **voz de IA real**
  (ElevenLabs) en vez de la del navegador — opcional, con respaldo
  automático a la voz del navegador si falla o no está configurada.
- Selección de fragmentos relevantes para documentos largos (RAG simple,
  sin base vectorial), con referencias visibles de qué fragmentos se
  usaron para cada respuesta.
- Preferencias (voz, velocidad, tono, color, animación) se guardan en el
  navegador entre visitas, con opción de restaurarlas a los valores por
  defecto.

## Arquitectura

Sitio estático sin build, publicado con GitHub Pages en cada push a
`main` (ver `.github/workflows/deploy-pages.yml`), más un backend chico en
Node/Express para las preguntas y la voz de IA, desplegado en Render.

```
index.html         Estructura de la página
css/style.css       Estilos
js/animacion.js     Canvas: la medusa animada, color manual/automático
js/voz.js           Voz del navegador + voz de IA (ElevenLabs), reproducción
js/documentos.js    Carga, validación y extracción de texto de documentos
js/chat.js          Preguntas al backend, RAG simple, UI del chat
js/app.js           Menú, configuración del backend, arranque general
server/server.js    Backend Express: /ask (Groq), /tts (ElevenLabs), /health
render.yaml         Blueprint de despliegue en Render
```

Los módulos JS son scripts clásicos (no ES modules) que comparten el mismo
scope global del navegador — sin bundler ni framework, a propósito, para
mantener el proyecto simple.

## Tecnologías utilizadas

- HTML, CSS y JavaScript puro (sin framework de frontend).
- [pdf.js](https://mozilla.github.io/pdf.js/) para extraer texto de PDF.
- [mammoth.js](https://github.com/mwilliamson/mammoth.js) para extraer
  texto de DOCX.
- Web Speech API (`SpeechSynthesisUtterance`) para la voz gratuita del
  navegador.
- Node.js + Express en el backend, con `cors`, `express-rate-limit` y
  `dotenv`.
- [Groq](https://groq.com/) (Llama 3.3 70B) para responder preguntas —
  gratis, sin tarjeta de crédito.
- [ElevenLabs](https://elevenlabs.io/) (opcional) para la voz de IA.

## Formatos compatibles

PDF, DOCX, TXT y Markdown (`.md`), hasta 20 MB por archivo. También se
puede pegar la URL de una página web genérica (se extrae el texto visible)
o de Google Drive (se descarga el archivo real).

## Instalación local

No hace falta build: cualquier servidor estático alcanza para el
frontend.

```bash
python3 -m http.server 8910
# abrí http://localhost:8910/index.html
```

Para el chat y la voz de IA hace falta además correr el backend (ver
abajo) y pegar su URL en el menú (☰ → ⚙️ Configuración avanzada).

## Configuración del backend

El backend vive en `server/`. Necesita como mínimo `GROQ_API_KEY` para
responder preguntas; sin ella, el resto de la app funciona igual (lectura
y animación), pero el chat queda deshabilitado.

```bash
cd server
cp .env.example .env
```

Abrí `server/.env` y reemplazá donde dice **"pega tu clave acá"** por tus
claves reales. Después:

```bash
npm install
npm start
```

### Variables de entorno

| Variable | Obligatoria | Qué hace |
|---|---|---|
| `GROQ_API_KEY` | Sí | Responder preguntas sobre el documento. |
| `ELEVENLABS_API_KEY` | No | Habilita la voz de IA en las respuestas del chat. |
| `ELEVENLABS_VOICE_ID_HOMBRE` | No | `voice_id` en español para la voz "Hombre". Sin esto, se usa un respaldo en inglés. |
| `ELEVENLABS_VOICE_ID_MUJER` | No | Igual, para la voz "Mujer". |
| `ALLOWED_ORIGIN` | No | Dominio propio adicional permitido por CORS, si servís el frontend desde otro lado además de GitHub Pages/localhost. |
| `PORT` | No | Puerto local (por defecto 3000; Render lo define solo). |

Ninguna clave se pega en el código ni en `render.yaml`: siempre se
configuran como variable de entorno (en Render, en el formulario web del
servicio; en local, en `server/.env`, que no se commitea).

### Configuración de Groq

1. Cuenta gratis en https://console.groq.com/keys (con Google/GitHub, sin
   tarjeta).
2. Generá una API key y pegala como `GROQ_API_KEY`.

### Configuración de ElevenLabs

1. Cuenta gratis en https://elevenlabs.io/ y una API key en
   https://elevenlabs.io/app/settings/api-keys → `ELEVENLABS_API_KEY`.
2. (Opcional pero recomendado) Elegí una voz en español en
   https://elevenlabs.io/app/voice-library, copiá su `voice_id`, y
   agregalo como `ELEVENLABS_VOICE_ID_HOMBRE` y/o
   `ELEVENLABS_VOICE_ID_MUJER`. Sin esto, se usa una voz de respaldo en
   inglés (funciona, pero sin acento en español).
3. Es 100% opcional: si no está configurada, el chat responde igual, con
   texto y con la voz gratuita del navegador.

## Despliegue en Render (backend)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Rodrilundain/MedusaLee)

1. "Deploy to Render" → conectá tu cuenta de GitHub.
2. Completá `GROQ_API_KEY` en el formulario (obligatoria).
   `ELEVENLABS_API_KEY` y las `ELEVENLABS_VOICE_ID_*` son opcionales,
   podés dejarlas vacías y completarlas después sin rehacer el deploy.
3. Copiá la URL que te da Render (algo como
   `https://medusa-backend-xxxx.onrender.com`).
4. En la app, abrí el menú (☰ → ⚙️ Configuración avanzada) y pegala en
   "Backend de preguntas".

El plan gratis de Render duerme el servicio tras un rato sin uso: la
primera pregunta después de eso puede tardar hasta un minuto en
responder. La app avisa esto y reintenta sola.

## Despliegue en GitHub Pages (frontend)

Automático: cada push a `main` dispara
`.github/workflows/deploy-pages.yml`, que publica el contenido del
repositorio tal cual (sin build) en GitHub Pages. No hace falta
configuración adicional más allá de tener Pages habilitado en el
repositorio, apuntando a "GitHub Actions" como origen.

## Limitaciones conocidas

- **Voz del navegador**: la calidad y el catálogo de voces en español
  dependen del sistema operativo, no de MedusaLee. En Safari/iPhone en
  particular, el `pitch` se aplica de forma limitada — si "Hombre" y
  "Mujer" suenan parecidos, probablemente el dispositivo solo tenga una
  voz en español instalada (la app lo detecta y avisa).
- **Reanudar lectura**: el Web Speech API no garantiza retomar
  exactamente donde se pausó tras una pausa larga; algunos navegadores
  reinician el fragmento actual. No es una limitación de MedusaLee, sino
  del navegador.
- **ElevenLabs**: tiene un límite de caracteres gratis por mes, por eso
  la lectura del documento completo usa siempre la voz del navegador —
  la voz de IA se reserva para las respuestas del chat y el botón "Leer
  fragmento con voz IA".
- **Lectores de URL genéricas**: para páginas web (no PDF/DOCX/TXT
  directos) se usan proxies públicos de terceros (r.jina.ai,
  corsproxy.io, allorigins.win) con reintento en cadena; no tienen SLA, así
  que ocasionalmente pueden fallar o tardar.
- **Backend gratuito**: Render en el plan gratis se "duerme"; ver arriba.
- **Sin CDN con integridad verificada**: pdf.js y mammoth.js se cargan
  desde CDNs públicos (cdnjs, unpkg) sin hash de integridad (SRI) fijado,
  para no atarse a una versión exacta del build de cada CDN.

## Privacidad

Los documentos se procesan primero en el navegador (extracción de texto
local). Al hacer una pregunta, se envían fragmentos del texto al backend
propio y de ahí a Groq (y a ElevenLabs si se usa voz de IA) para generar
la respuesta — esos fragmentos **sí salen** del dispositivo en ese
momento. No se recomienda cargar documentos confidenciales si no querés
que ese contenido se envíe a esos servicios. MedusaLee no guarda
documentos ni conversaciones en ningún servidor; en el navegador, solo
persisten preferencias no sensibles (ver más abajo).

### Qué se guarda en el navegador (`localStorage`)

Tipo de voz, velocidad, tono manual, color, animación activada/desactivada,
uso de voz IA, y la URL del backend configurada. Nada de esto son datos
sensibles. **Nunca** se guardan documentos, conversaciones ni claves API
en el navegador. Podés borrar todo esto desde el menú (☰ → ↺ Restaurar
configuración).

## Pruebas realizadas

Sin framework de tests automatizados todavía (queda como mejora
pendiente). Esta ronda se probó manualmente así:

| Caso | Método | Resultado |
|---|---|---|
| TXT válido | Playwright, archivo real | Carga y extrae texto correctamente |
| Markdown válido | Mismo extractor que TXT | Revisado por código |
| PDF válido | pdf.js bloqueado por la red del entorno de pruebas | **No se pudo verificar con un PDF real en este entorno** — sí se verificó que el manejo de errores (biblioteca no disponible) cae al mensaje amigable correcto |
| PDF sin texto / protegido | Revisión de código (detección de errores de contraseña de pdf.js) | Revisado por código, no ejecutado con un PDF real |
| DOCX válido | mammoth.js bloqueado por la red del entorno de pruebas | **No se pudo verificar con un DOCX real en este entorno** |
| Archivo vacío | Playwright, archivo real de 0 bytes | Mensaje "El archivo está vacío" |
| Archivo demasiado grande | Playwright, archivo de 21 MB | Mensaje de tamaño máximo, no intenta procesarlo |
| Formato no admitido | Playwright, archivo `.xyz` | Rechazado antes de leerlo |
| Re-seleccionar el mismo archivo | Playwright | Vuelve a cargar (antes no lo hacía) |
| URL inválida | Playwright | Mensaje claro sin intentar la descarga |
| Backend activo | Playwright + mock de `/health` y `/ask` | Indicador "conectado", respuesta mostrada |
| Backend caído/dormido | Revisión de código (reintento con espera creciente) | Revisado por código |
| Respuesta de Groq correcta | Playwright + mock de `/ask` | Respuesta mostrada y referencias de fragmentos correctas |
| Error de Groq (401) | Playwright + mock de `/ask` devolviendo error | Se muestra como error real, no como respuesta inventada |
| Documento corto (sin RAG) | Playwright, texto corto | Se manda entero como contexto |
| Documento largo (con RAG) | Playwright, texto repetido >8000 caracteres | Fragmentos elegidos y referenciados correctamente |
| Doble clic en enviar | Playwright, dos clics rápidos | Solo se manda una pregunta |
| Copiar respuesta / limpiar conversación | Playwright + permiso de portapapeles | Copia el texto correcto; limpiar borra los mensajes |
| Enter envía / Shift+Enter salto de línea | Playwright, teclado real | Funciona como se espera |
| Scroll táctil en menú y chat | Playwright, evento `touchmove` simulado dentro/fuera de esos paneles | Ya no se bloquea dentro de los paneles (bug corregido) |
| Arrastrar y soltar archivo | Playwright, evento `drop` simulado | Carga el archivo correctamente |
| Persistencia de preferencias | Playwright, cambiar valores + recargar página | Se mantienen tras recargar |
| Restaurar configuración | Playwright, botón + recarga | Vuelve a los valores por defecto |
| Responsive (390×844, 430×932, 768×1024, 1366×768, 1920×1080) | Playwright, capturas de pantalla | Sin scroll horizontal; se corrigió una superposición real entre el chat y el panel principal |
| Cabeceras de seguridad y CORS del backend | `curl` contra un servidor Express real corrido localmente | Cabeceras presentes incluso en respuestas 403; origen no permitido sigue rechazado |
| Navegación por teclado | Revisión de código (botones reales, `tabindex`, manejo de Enter/Espacio/Escape) | Revisado por código, no probado con lector de pantalla real |

No se fabricó ningún resultado: donde no se pudo ejecutar la prueba real
(PDF/DOCX por bloqueo de red del entorno de desarrollo; lector de
pantalla real; Safari/iPhone real), queda aclarado arriba en vez de darlo
por probado.

## Próximas mejoras

- Tests automatizados (hoy la matriz de arriba es manual).
- Verificar en un iPhone/Safari real.
- Reemplazar los proxies públicos de lectura de URLs genéricas por un
  endpoint propio en el backend, para no depender de servicios de
  terceros sin SLA.
- Progressive Web App (ícono, instalable, funcionamiento básico offline).
