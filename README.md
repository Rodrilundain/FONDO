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
- Lectura del documento completo en voz alta, fragmento por fragmento,
  con controles de ▶️ reproducir, ⏸️/⏵ pausar-reanudar, ⏮️/⏭️
  anterior/siguiente fragmento, ↻ reiniciar y 🔇 detener (parada
  inmediata que siempre funciona, aunque haya algo sonando) — usa la voz
  del navegador (gratis, sin límite de caracteres). La lectura nunca
  arranca sola: siempre la inicia el usuario.
- **Seis modos de voz** pensados por objetivo, no solo por género:
  🧭 Asistente, 📘 Docente, 🎯 Concentración, ⚡ Resumen rápido,
  🤖 Robótica y 🎛️ Personalizada (elegís vos la voz del dispositivo, el
  tono, la velocidad, el volumen y si usar voz IA). Botón "🔈 Escuchar
  muestra" para probar cada modo antes de elegirlo.
- **Lectura dinámica**: antes de leer, cada fragmento se analiza (título,
  definición, lista, pregunta, advertencia, ejemplo) y se ajustan pausas,
  tono y ritmo acordes — no todo se lee con la misma cadencia. La
  división en fragmentos evita cortar decimales, fechas, abreviaturas,
  URLs y emails a la mitad.
- Progreso de lectura visible ("Fragmento 8 de 24 — 33% completado —
  Página 3 — ~2 min restantes", con página y tiempo restante cuando hay
  información suficiente para estimarlos) y subtítulos en pantalla con el
  texto que se está diciendo en ese momento.
- Botón "📄 Ver documento": muestra el texto completo con el fragmento que
  se está leyendo resaltado (se actualiza y hace scroll automático a
  medida que avanza la lectura), y una tabla de contenidos cuando el
  documento tiene títulos (DOCX) con la opción de tocar un título para
  "leer solo esa sección".
- El progreso de lectura se guarda automáticamente: si volvés a cargar el
  mismo documento, aparece un botón "Continuar donde quedaste".
- Botón "⬇️ Descargar audio" para guardar el .mp3 del fragmento actual
  cuando se está leyendo con voz IA (no disponible con la voz gratuita
  del navegador, que no genera un archivo).
- Tras cargar un documento, un panel pregunta "¿Qué querés lograr con
  este documento?" (entenderlo, estudiar, presentar, resumen, escucharlo
  completo, o buscar algo puntual) y ajusta el modo de voz y el estilo de
  las respuestas del chat en consecuencia — se puede cambiar cuando
  quieras, y no analiza a la persona ni garantiza resultados, solo adapta
  el estilo de comunicación.
- Chat para hacer preguntas sobre el documento cargado (requiere el
  backend, ver abajo): preguntas sugeridas con un toque, copiar
  respuestas, limpiar la conversación, envío con Enter (Shift+Enter para
  salto de línea), bloqueo de doble envío, y un estilo de redacción
  cercano y orientado a la acción (sin fingir capacidades que no tiene:
  no lee la mente ni detecta emociones).
- **Dos motores de lectura, claramente diferenciados**: la voz gratuita
  del navegador (sin límite, siempre disponible) y, opcionalmente, una
  **voz de IA real** (ElevenLabs) — tanto para las respuestas del chat
  como para leer el documento completo (casillero "📖 Leer el documento
  completo con voz IA", con aviso de cuánto texto se va a mandar antes de
  confirmar, porque consume cuota). Si ElevenLabs falla, no está
  configurada, o se agota la cuota, **nunca se usa en silencio una voz en
  inglés**: se avisa con un mensaje claro y se sigue leyendo con la voz
  del dispositivo.
- **Lectura progresiva del documento con voz IA**: se genera y reproduce
  el primer bloque sin esperar a que todo el documento esté listo,
  mientras el bloque siguiente se prepara en paralelo (sin silencios
  largos entre bloques); los audios ya generados quedan en caché durante
  la sesión, así volver a un bloque anterior no vuelve a gastar cuota.
- Texto preparado antes de mandarlo a la voz de IA
  (`prepararTextoParaTTS`): se quitan símbolos que sonarían raro leídos en
  voz alta (`**`, `#`, viñetas, guiones), las URLs largas se convierten en
  "enlace disponible", los emails se vuelven pronunciables, las fechas se
  humanizan ("19 de julio de 2026"), y hay un diccionario de pronunciación
  configurable para siglas/nombres propios (MedusaLee, Groq, GitHub,
  JavaScript, Node.js, Apps Script, API, PDF, DOCX, Uruguay).
- **Extracción de documentos con estructura**: los PDF conservan la
  página de origen de cada fragmento (para que el chat pueda citar
  "Página 3" en vez de solo "Fragmento 8"), con una heurística que quita
  encabezados/pies de página repetidos y detecta si el PDF parece
  escaneado (imagen sin texto seleccionable). Los DOCX conservan títulos,
  párrafos e ítems de lista como bloques separados, en vez de un texto
  plano sin estructura.
- Selección de fragmentos relevantes para documentos largos (RAG simple
  con **BM25**, sin base vectorial ni embeddings), con normalización de
  tildes/plurales, inclusión de fragmentos vecinos para dar contexto, y
  referencias visibles de qué fragmentos o páginas se usaron para cada
  respuesta. El backend solo responde con lo que está en esos fragmentos
  y dice explícitamente cuando la respuesta no aparece ahí, en vez de
  inventarla.
- Preferencias (modo de voz, voz elegida, tono, velocidad, volumen,
  objetivo, color, animación) se guardan en el navegador entre visitas,
  con botones para restaurar todo o solo la configuración de voz.

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
js/aiWorker.js      Funciones de IA adicionales vía el Worker de
                    Cloudflare (opcional, ver worker/)
js/app.js           Menú, configuración del backend, arranque general
server/server.js    Backend Express: /ask (Groq), /tts y /tts/voices
                    (ElevenLabs), /fetch-document (proxy de URLs),
                    /voice/piper (voz local, ver abajo), /health
server/src/voice/   Módulo de voz local con Piper (motor gratis, sin
                    cuota, corre en el propio servidor) — ver su README
server/models/piper/ Dónde poner el modelo de voz de Piper descargado
render.yaml         Blueprint de despliegue en Render
worker/             Cloudflare Worker opcional: backend de IA con Gemini
                    (principal) y OpenRouter (respaldo) — en paralelo al
                    backend de Render, no lo reemplaza. Ver worker/README.md
```

Los módulos JS son scripts clásicos (no ES modules) que comparten el mismo
scope global del navegador — sin bundler ni framework, a propósito, para
mantener el proyecto simple. El Worker de `worker/` es un proyecto Node
aparte (con su propio `package.json`), pensado para desplegarse en
Cloudflare, no en Render ni en GitHub Pages.

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
- [Piper](https://github.com/OHF-Voice/piper1-gpl) (opcional, GPL-3.0)
  para una voz de IA que corre local, en el propio servidor, sin costo ni
  cuota — ver `server/src/voice/README.md`.
- [Gemini](https://ai.google.dev/) y [OpenRouter](https://openrouter.ai/)
  (ambos opcionales) para funciones de IA adicionales vía un Cloudflare
  Worker propio — ver `worker/README.md`.

## Funciones de IA adicionales (Gemini/OpenRouter, opcional)

Aparte del chat de preguntas de siempre (que sigue usando Groq sin ningún
cambio), MedusaLee puede conectarse a un [Cloudflare Worker propio](worker/README.md)
que ofrece 10 funciones más sobre el documento cargado: resumir,
explicar en lenguaje sencillo, preguntas de estudio, preguntas de opción
múltiple, conceptos importantes, guía de estudio, extracción de fechas y
datos, explicación por secciones, y conversación libre sobre el
documento. El Worker llama a Gemini como proveedor principal y a
OpenRouter como respaldo automático si Gemini falla — nunca expone
ninguna clave al navegador.

Es 100% opcional: sin configurar la URL del Worker en el menú (☰ → ⚙️
Configuración avanzada → "Worker de IA"), esta sección queda oculta y
MedusaLee funciona exactamente igual que siempre. Instrucciones
completas de despliegue del Worker (con qué se verificó de verdad y qué
no se pudo verificar en este entorno) en
[`worker/README.md`](worker/README.md).

## Voz local con Piper (motor opcional, gratis, sin cuota)

Además de la voz del navegador y ElevenLabs, MedusaLee tiene un tercer
motor de voz opcional: [Piper](https://github.com/OHF-Voice/piper1-gpl),
que corre 100% en el servidor (no manda texto a ningún servicio externo,
a diferencia de ElevenLabs) usando un modelo de voz descargado una sola
vez. Vive en `server/src/voice/` como un módulo separado, con su propia
interfaz (`VoiceService`) pensada para poder sumar otros motores más
adelante (OpenVoice, MeloTTS quedan como extensión futura, sin
dependencias instaladas todavía).

Está desactivado por defecto (`TTS_ENABLED=false`): sin configurarlo,
MedusaLee sigue funcionando exactamente igual que antes.

Documentación completa (instalación, licencias, voces en español
disponibles, comandos de prueba) en
[`server/src/voice/README.md`](server/src/voice/README.md). Resumen
rápido:

```bash
pip install piper-tts                                    # instala Piper
python -m piper.download_voices                          # lista voces disponibles
python -m piper.download_voices es_AR-daniela-high \
  --download-dir server/models/piper                     # descarga una voz
node server/test-voice.mjs "Hola, Rodrigo."               # prueba solo la voz
```

**Nota sobre Render**: el deploy gratuito actual (`runtime: node`) no
instala Python ni descarga modelos de voz — Piper es para correr
MedusaLee localmente o en un servidor propio con Python disponible, no
para este backend desplegado en Render tal como está configurado hoy.

## Modos de voz

Valores iniciales de cada modo (`pitch`/`velocidad`/`volumen` del Web
Speech API; la velocidad se multiplica además por el slider manual
"Velocidad", y el tono se puede overridear con el slider "Tono manual"):

| Modo | Pitch | Velocidad | Volumen |
|---|---|---|---|
| 🧭 Asistente | 0.92 | 0.95 | 1 |
| 📘 Docente | 1 | 0.88 | 1 |
| 🎯 Concentración | 0.98 | 0.92 | 0.95 |
| ⚡ Resumen rápido | 1 | 1.10 | 1 |
| 🤖 Robótica | 0.75 | 0.88 | 1 |
| 🎛️ Personalizada | a elección | a elección | a elección |

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
| `ELEVENLABS_API_KEY` | No | Habilita la voz de IA (chat y lectura de documento completo). |
| `ELEVENLABS_VOICE_ID_HOMBRE` | No | `voice_id` en español para la voz "Hombre". **Sin esto, `/tts` devuelve un error claro (`falta_voz_espanol`) en vez de usar una voz en inglés en silencio.** |
| `ELEVENLABS_VOICE_ID_MUJER` | No | Igual, para la voz "Mujer". |
| `ELEVENLABS_MODEL_CHAT` | No | Modelo para respuestas cortas del chat. Por defecto `eleven_multilingual_v2`. |
| `ELEVENLABS_MODEL_DOCUMENT` | No | Modelo para la lectura de documentos completos (texto más largo y estable). Por defecto `eleven_multilingual_v2`. |
| `ELEVENLABS_STABILITY` | No | `voice_settings.stability` (0–1). Por defecto `0.52`. |
| `ELEVENLABS_SIMILARITY` | No | `voice_settings.similarity_boost` (0–1). Por defecto `0.80`. |
| `ELEVENLABS_STYLE` | No | `voice_settings.style` (0–1, solo aplica a `eleven_multilingual_v2`). Por defecto `0`. |
| `ELEVENLABS_SPEED` | No | `voice_settings.speed` (solo aplica a `eleven_multilingual_v2`). Por defecto `0.97`. |
| `ELEVENLABS_SPEAKER_BOOST` | No | `voice_settings.use_speaker_boost`. Por defecto `true`; poner `"false"` para desactivarlo. |
| `TTS_RATE_LIMIT_PER_MIN` | No | Límite de pedidos a `/tts` por minuto y por IP. Por defecto `8`. |
| `TTS_DAILY_LIMIT` | No | Límite de pedidos a `/tts` por día, para todo el backend (protege la cuota gratis de ElevenLabs). Por defecto `300`. |
| `ALLOWED_ORIGIN` | No | Dominio propio adicional permitido por CORS, si servís el frontend desde otro lado además de GitHub Pages/localhost. |
| `PORT` | No | Puerto local (por defecto 3000; Render lo define solo). |

Ninguna clave se pega en el código ni en `render.yaml`: siempre se
configuran como variable de entorno (en Render, en el formulario web del
servicio; en local, en `server/.env`, que no se commitea). El frontend
nunca recibe ni ve las claves de ElevenLabs/Groq: siempre pasa por el
backend propio.

Los valores de `ELEVENLABS_STABILITY`/`SIMILARITY`/`STYLE`/`SPEED` de
arriba son un punto de partida sugerido, no un ajuste universal — la
combinación que suena mejor depende de la voz específica que elijas en
ElevenLabs. Conviene probar 2 o 3 combinaciones distintas con la voz ya
configurada y quedarse con la que suene más natural (podés cambiarlos sin
tocar código, solo variables de entorno).

### Configuración de Groq

1. Cuenta gratis en https://console.groq.com/keys (con Google/GitHub, sin
   tarjeta).
2. Generá una API key y pegala como `GROQ_API_KEY`.

### Configuración de ElevenLabs

1. Cuenta gratis en https://elevenlabs.io/ y una API key en
   https://elevenlabs.io/app/settings/api-keys → `ELEVENLABS_API_KEY`.
2. Elegí una voz en español (idealmente rioplatense neutro, masculina,
   cálida, sin ser excesivamente grave ni teatral — el objetivo es que
   suene natural y cercana, no una imitación de ningún actor/personaje
   real) en https://elevenlabs.io/app/voice-library, copiá su `voice_id`,
   y agregalo como `ELEVENLABS_VOICE_ID_HOMBRE` y/o
   `ELEVENLABS_VOICE_ID_MUJER`. **Este paso ya no es opcional para tener
   voz de IA en español**: sin ninguna de las dos configuradas, `/tts`
   devuelve un error claro (nunca usa en silencio una voz en inglés) y la
   app avisa que se sigue con la voz del navegador.
3. Es 100% opcional en el sentido de que si no la configurás, el chat
   responde igual, con texto y con la voz gratuita del navegador.
4. La combinación de `ELEVENLABS_STABILITY`/`SIMILARITY`/`STYLE`/`SPEED`
   que suena mejor depende de la voz elegida — probá algunas variantes
   escuchando el botón "🔈 Probar voz IA" (frase de prueba fija, para
   poder comparar) antes de quedarte con una configuración definitiva.

## Despliegue en Render (backend)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Rodrilundain/MedusaLee)

1. "Deploy to Render" → conectá tu cuenta de GitHub.
2. Completá `GROQ_API_KEY` en el formulario (obligatoria).
   `ELEVENLABS_API_KEY`, las `ELEVENLABS_VOICE_ID_*` y el resto de las
   variables de ElevenLabs son opcionales, podés dejarlas vacías y
   completarlas después sin rehacer el deploy (Render permite editar
   variables de entorno desde el panel del servicio, sin volver a hacer
   "Deploy to Render").
   **Importante si el servicio ya existía antes de este cambio**: revisá
   en el panel de Render → tu servicio → *Settings* → *Root Directory*
   que diga `server` — si el servicio se creó manualmente (no vía este
   botón), ese campo puede haber quedado vacío y el deploy falla con
   `Couldn't find a package.json file`. Esto solo se corrige a mano desde
   el dashboard de Render, no desde el código.
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

- **Página actual y tiempo restante son aproximados**: se calculan a
  partir de la posición del fragmento dentro del texto, no de una medición
  real del motor de voz — pueden desviarse un poco cerca de los límites de
  página, y el tiempo restante asume un ritmo de habla típico (no el ritmo
  real de tu dispositivo o de ElevenLabs). "Leer solo esta sección" no
  guarda progreso para "Continuar donde quedaste" (los índices de esa
  lectura parcial no corresponden al documento completo).
- **Voz del navegador**: la calidad y el catálogo de voces en español
  dependen del sistema operativo, no de MedusaLee. En Safari/iPhone en
  particular, el `pitch` se aplica de forma limitada — si "Hombre" y
  "Mujer" suenan parecidos, probablemente el dispositivo solo tenga una
  voz en español instalada (la app lo detecta y avisa).
- **Reanudar lectura**: el Web Speech API no garantiza retomar
  exactamente donde se pausó tras una pausa larga; algunos navegadores
  reinician el fragmento actual. No es una limitación de MedusaLee, sino
  del navegador.
- **ElevenLabs**: tiene un límite de caracteres gratis por mes; por eso
  leer el documento completo con voz IA es opt-in (casillero aparte, con
  aviso de cuánto texto se va a mandar antes de confirmar) y no la opción
  por defecto — la voz del navegador sigue siendo la de uso libre e
  ilimitado.
- **Lectores de URL genéricas**: para páginas web (no PDF/DOCX/TXT
  directos), o si la descarga por el backend propio (`/fetch-document`)
  falla, se cae a proxies públicos de terceros (r.jina.ai, corsproxy.io,
  allorigins.win) con reintento en cadena; no tienen SLA, así que
  ocasionalmente pueden fallar o tardar.
- **Protección SSRF del backend no es completa**: `/fetch-document`
  bloquea IPs privadas/locales resolviendo el DNS antes de descargar,
  pero no "fija" esa IP para el pedido real — en teoría, un ataque de DNS
  rebinding (el dominio cambia de IP entre la resolución y la descarga)
  podría eludir el chequeo. Es una limitación conocida, no algo oculto.
- **Voz local Piper — catálogo de voces no verificable desde este
  entorno de desarrollo**: el catálogo real de voces (`rhasspy/piper-voices`)
  vive únicamente en Hugging Face, bloqueado por la política de red del
  entorno donde se implementó esta integración. No se pudo confirmar en
  vivo si `es_AR-daniela` existe ni escuchar ninguna voz en español real;
  `server/src/voice/README.md` explica cómo verificarlo vos mismo en
  segundos. Lo que sí se probó de punta a punta ahí es el mecanismo (Piper
  instalado, texto por stdin, generación de un `.wav` válido), con el
  modelo de prueba que trae el propio proyecto Piper para sus tests (que
  genera silencio, no habla).
- **Voz local Piper — sin verificar en Windows**: el código usa `spawn`
  con rutas y argumentos (nunca un string de shell armado a mano), pero
  el comportamiento específico en Windows (rutas con espacios,
  reproducción vía PowerShell) no se pudo ejecutar en este entorno de
  desarrollo (solo Linux disponible).
- **Detección de PDF escaneado sin OCR automático todavía**: MedusaLee
  detecta con una heurística (pocos caracteres de texto por página) si un
  PDF parece ser una imagen escaneada y avisa al usuario, pero **no
  incluye reconocimiento óptico de caracteres (OCR)** en esta versión —
  queda como mejora pendiente, no implementada.
- **Backend gratuito**: Render en el plan gratis se "duerme"; ver arriba.
- **Sin CDN con integridad verificada**: pdf.js y mammoth.js se cargan
  desde CDNs públicos (cdnjs, unpkg) sin hash de integridad (SRI) fijado,
  para no atarse a una versión exacta del build de cada CDN.
- **Catálogo de voces variable por dispositivo**: no todos los
  navegadores/sistemas ofrecen las mismas voces en español, y algunos
  (notablemente Safari/iOS) aplican `pitch` de forma limitada. Los modos
  ajustan pitch/velocidad/volumen, pero no pueden garantizar que sonarán
  igual en todos los dispositivos — eso depende de las voces que tenga
  instaladas cada uno.
- **Sin voces instaladas**: si el dispositivo no tiene ningún motor de
  síntesis de voz disponible (poco común, pero pasa por ejemplo en
  algunos entornos de servidor/CI sin voces del sistema), la lectura
  muestra un estado de error claro en vez de quedarse "reproduciendo"
  sin sonar nada.
- **Reanudar/Siguiente/Anterior fragmento** dependen de que el navegador
  pueda cancelar y arrancar síntesis de voz rápido; en la práctica esto
  funciona bien, pero no hay garantía de continuidad perfecta si el
  dispositivo está muy exigido en ese momento (limitación del Web Speech
  API, no de MedusaLee).

## Privacidad

Los documentos se procesan primero en el navegador (extracción de texto
local). Exactamente esto sale del dispositivo, y a dónde:

- **Al hacer una pregunta**: los fragmentos de texto elegidos como
  contexto (no todo el documento si es largo, ver "RAG" arriba) viajan al
  backend propio y de ahí a **Groq**, junto con tu pregunta, para generar
  la respuesta.
- **Si usás voz de IA** (chat o lectura de documento completo): el texto a
  leer (ya limpiado por `prepararTextoParaTTS`, sin el resto del
  documento) viaja al backend propio y de ahí a **ElevenLabs**, que
  devuelve el audio.
- **Si cargás un documento pegando una URL** (no un archivo local): la URL
  se manda al backend propio, que la descarga él mismo (`/fetch-document`)
  en vez del navegador — así el proveedor de la URL nunca ve la IP del
  usuario, solo la del servidor. Ese endpoint valida que sea `http`/`https`,
  bloquea IPs privadas/locales (protección contra SSRF) y limita el
  tamaño descargado; no guarda el contenido descargado más allá de
  procesar esa solicitud. Si el backend no puede resolver la URL (poco
  común), se cae a proxies públicos de terceros como respaldo (ver
  "Limitaciones conocidas").
- **Si usás alguna de las "Funciones de IA" del panel opcional** (resumen,
  preguntas de estudio, conceptos clave, etc.): el documento (o, para
  documentos muy largos, sus fragmentos) viaja al Cloudflare Worker
  propio y de ahí a **Gemini** (y a **OpenRouter** si Gemini falla), para
  generar la respuesta. Es una función aparte del chat de siempre, y solo
  se activa si vos mismo configurás la URL del Worker en el menú.

En ningún caso se recomienda cargar documentos confidenciales si no
querés que ese contenido (o fragmentos de él) se envíe a Groq, ElevenLabs
y/o (si usás las funciones de IA opcionales) Gemini/OpenRouter. MedusaLee
no guarda documentos ni conversaciones en ningún
servidor — ni el propio ni los de terceros: se procesan al vuelo para
responder esa solicitud puntual. El backend tampoco registra en sus logs
el texto completo de preguntas ni de lecturas, para minimizar qué queda
guardado incluso temporalmente. En el navegador, solo persisten
preferencias no sensibles (ver más abajo).

### Qué se guarda en el navegador (`localStorage`)

Modo de voz, voz elegida en "Personalizada", tono manual, velocidad,
volumen (Personalizada), uso de voz IA, si se activó la lectura del
documento completo con voz IA, objetivo elegido para el documento, color,
animación activada/desactivada, y la URL del backend configurada. Nada de
esto son datos sensibles. **Nunca** se guardan
documentos, conversaciones ni claves API en el navegador. Podés borrar
todo esto desde el menú (☰ → ↺ Restaurar configuración), o solo lo
relacionado a la voz (☰ → ↺ Restaurar configuración de voz). La posición
de lectura (fragmento actual) se recuerda solo mientras la pestaña sigue
abierta — no se guarda en localStorage porque no tendría sentido sin el
documento, que tampoco se guarda.

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
| Responsive (390×844, 430×932, 768×1024, 1280×720, 1366×768, 1920×1080) | Playwright, capturas de pantalla | Sin scroll horizontal; se corrigieron dos superposiciones reales entre el chat y el panel principal (una por el panel de objetivo, otra por un bug de `[hidden]` — ver abajo) |
| Cabeceras de seguridad y CORS del backend | `curl` contra un servidor Express real corrido localmente | Cabeceras presentes incluso en respuestas 403; origen no permitido sigue rechazado |
| Navegación por teclado | Revisión de código (botones reales, `tabindex`, manejo de Enter/Espacio/Escape) | Revisado por código, no probado con lector de pantalla real |
| Cada modo de voz (valores pitch/velocidad/volumen) | Playwright, lectura directa de `MODOS_VOZ` en el navegador | Coinciden exactamente con los valores pedidos |
| Cambio de modo durante una lectura | Playwright | El modo nuevo se aplica desde el próximo fragmento hablado |
| Botón "Escuchar muestra" sin superponer audio | Playwright, dos clics seguidos, se verificó que cada clic invalida la reproducción anterior (token de lectura) | Sin superposición |
| Pausar/Reanudar (botón único) | Playwright | Alterna correctamente el texto/estado del botón |
| Detener inmediato | Playwright | Siempre visible y funcional, incluso durante una lectura activa |
| División de texto: no corta decimales/fechas/abreviaturas/URLs/emails | Playwright, texto de prueba con los 5 casos y `maxLen` chico a propósito para forzar el corte | Ningún fragmento corta un patrón protegido a la mitad (se encontraron y corrigieron 2 bugs reales: fechas mal protegidas por el patrón de decimales, y una colisión de nombres entre `chat.js` y `voz.js` que hacía que se usara la versión sin protección) |
| Clasificación de fragmentos (título/lista/pregunta/advertencia/definición/ejemplo) | Playwright, `analizarFragmento()` con un texto de cada tipo | Correcto tras corregir un bug real (una advertencia con dos puntos se clasificaba como definición) |
| Documento corto / largo, con y sin RAG | Playwright | Igual que antes, sin regresiones |
| Pregunta cuya respuesta existe / no existe | Revisión del prompt del backend (pide decir "No encontré esa información..." en vez de inventar) | Revisado por código |
| Voz IA disponible / caída | Playwright + mock de `/tts` devolviendo error | Cae a la voz del navegador y avisa "La voz IA no está disponible..." |
| Una sola voz disponible en el dispositivo / varias voces en español | Este entorno de pruebas no tiene NINGUNA voz de síntesis instalada (`speechSynthesis.getVoices()` devuelve 0) | **No se pudo probar el caso de 1 vs. varias voces reales** — sí se verificó que la lógica de prioridad regional (es-UY>es-AR>es-419>otras es>default) funciona sobre una lista simulada, y que un error real de síntesis ahora se muestra como error en vez de quedar colgado "Reproduciendo..." (bug real encontrado y corregido) |
| Safari de iPhone / Chrome Android | No disponibles en este entorno de desarrollo | **No probado en dispositivos reales** |
| Doble clic en reproducir | Playwright | El guard de `detenerTodoAhora()` cancela lo anterior antes de reproducir de nuevo |
| Cambio de documento con lectura activa | Playwright, revisión de código (`detenerLecturaPorNuevoDocumento`) | Se cancela la lectura y se resetea el progreso al cargar un documento nuevo |
| Bug real: `[hidden]` no ocultaba `#playbackControls`, `#heroLinkRow` ni `#suggestedQuestions` | Playwright, capturas de la pantalla inicial | Confirmado y corregido (regla CSS defensiva `[hidden] { display: none !important; }`) — estos elementos se veían en pantalla desde el principio, antes de cargar cualquier documento |
| `/tts` sin `ELEVENLABS_VOICE_ID_HOMBRE`/`MUJER` configurada | Servidor Express real + `fetch` global mockeado (sin red real a ElevenLabs) | Devuelve 400 con `codigo: "falta_voz_espanol"`, nunca intenta una voz en inglés |
| `/tts` con éxito, caché, y reintento con modelo de respaldo | Servidor Express real + mock de ElevenLabs (éxito, luego forzando fallo del modelo configurado) | Primera llamada sin caché (`X-Tts-Cache: miss`), segunda llamada idéntica sirve desde caché (`hit`) sin llamar de nuevo a ElevenLabs; ante fallo del modelo, reintenta una vez con `eleven_multilingual_v2` |
| `/tts` límite diario | Servidor Express real, contador forzado al límite | Devuelve 429 con `codigo: "limite_diario"` al superarlo |
| `/fetch-document` protección SSRF | Servidor Express real, URLs apuntando a `127.0.0.1`, `10.0.0.5`, `169.254.169.254`, protocolo `file://` | Todas rechazadas antes de intentar la descarga |
| `prepararTextoParaTTS` (markdown, emoji decorativos, viñetas, URLs, emails, fechas, dobles puntos) | Función pura extraída y probada en Node, con casos concretos de cada transformación | Todas las transformaciones esperadas se dieron; se encontró y corrigió 1 bug real (fechas humanizadas dejaban `"...."` en vez de `"..."` al final de párrafo) |
| Motor de lectura IA: cola con prefetch, caché al volver a un bloque ya reproducido, pausa | Playwright + mock de `/tts` con latencia simulada | El bloque siguiente se pide en paralelo mientras suena el actual; volver a un bloque ya generado no vuelve a llamar a `/tts` (0 llamadas extra); pausar mantiene el estado correctamente |
| Confirmación antes de leer documento completo con voz IA (aviso de cantidad de caracteres) | Playwright, documento de prueba de ~850 caracteres | El diálogo de confirmación incluye la cantidad real de caracteres |
| Caída de `/tts` a mitad de la lectura de documento completo | Playwright + mock de `/tts` devolviendo 400 (`falta_voz_espanol`) | Cae a la voz del navegador para el resto del documento sin trabarse, mostrando el mensaje correcto |
| `quitarEncabezadosPiesRepetidos` (encabezado repetido en la mayoría de páginas) | Función pura extraída y probada en Node | Recorta el encabezado repetido en las páginas que lo tienen, deja intacta la página que no lo tiene; se encontró y corrigió 1 bug real (comparaba 80 caracteres exactos en vez de las primeras palabras, por lo que casi nunca coincidía con encabezados cortos seguidos de contenido variable) |
| `fragmentarConPaginas` (fragmentos largos de una misma página se dividen conservando el número de página) | Función pura extraída y probada en Node | Cada fragmento resultante de una página larga conserva `pagina` correctamente |
| `calcularBM25` (prioriza término específico sobre términos comunes; sin coincidencias da score 0) | Función pura extraída y probada en Node | El fragmento con el término más específico obtiene el score más alto; sin coincidencias, todos los scores dan 0 |
| Voz local Piper: texto normal, tildes/ñ/¿/¡, texto vacío, texto largo (~4000 caracteres), Piper no instalado, modelo inexistente, varias solicitudes consecutivas | `node --test` (23 tests) + CLI (`node test-voice.mjs`) + servidor Express real, usando `piper-tts` instalado de verdad en el entorno de pruebas con el modelo de prueba que trae el propio Piper (genera silencio, no es una voz real) | Los 23 tests automatizados pasan (20 siempre + 3 que solo corren si hay un Piper real configurado, que en esta sesión sí lo hubo); WAV real generado con cabecera RIFF válida; 3 solicitudes concurrentes generan 3 archivos sin colisión de nombres; texto con tildes/ñ/¿/¡ no rompe nada |
| Voz local Piper: motor desactivado (`TTS_ENABLED` sin definir) | Servidor Express real, `/health` y `POST /voice/piper` | `/health` informa `vozLocalConfigurada:false`; el endpoint devuelve 404 con `success:false` sin intentar ejecutar Piper; `/ask` sigue funcionando exactamente igual que antes (sin regresión) |
| Voz local Piper: endpoint completo con el ejemplo del enunciado ("Hola, Rodrigo. El sistema está funcionando correctamente.") | Servidor Express real, `POST /voice/piper` + descarga del audio vía `GET /voice/piper/audio/:nombre` | Genera el `.wav`, lo sirve con `Content-Type: audio/wav` y bytes RIFF válidos; intento de path traversal en el nombre de archivo (`../../server.js`) rechazado con 400 |
| Voz local Piper: fallo de escritura por permisos | No se pudo forzar un error real de permisos porque este entorno corre como root (root ignora los bits de permisos de archivo en Linux) | **No verificado con un fallo de permisos real** — el camino de manejo de errores es el mismo `try/catch` ya probado para "modelo inexistente"/"Piper no instalado" (cualquier excepción de `mkdir`/`spawn` se traduce a `success:false` sin crashear), pero no se pudo confirmar específicamente ese escenario |
| Worker de IA (Gemini/OpenRouter): 44 casos (validación, CORS, rate limit, caché, fallback, resumen de documentos largos, fetch handler completo) | `npm test` en `worker/` (node:test) + `wrangler dev --local` real, incluida una llamada real a la API de Gemini con clave inválida | Los 44 tests pasan; verificado en vivo que el Worker corre en el runtime real de Cloudflare (`workerd`), responde `/health`, aplica CORS solo al origen permitido, respeta el límite de 20 solicitudes/minuto (20 pasan, la 21ª da 429), y sirve la segunda solicitud idéntica desde caché sin volver a llamar al proveedor — detalle completo en `worker/README.md` |
| Panel "Funciones de IA" en la interfaz: oculto sin Worker configurado, visible con Worker+documento, selector de pregunta según la tarea, generación exitosa, error amigable (sin códigos HTTP ni stack traces), doble clic no duplica la solicitud, escuchar/pausar/detener no rompen nada | Playwright contra el servidor local, con `/api/generate` mockeado (éxito y error) | Todos los casos correctos; verificado en particular que el texto generado se inserta con `textContent` y nunca se ejecuta como HTML (una respuesta con `<script>` inyectado no corre el script, confirmado revisando `window.__inyectado`) |
| Regresión: motor de lectura IA, experiencia de lectura (página/tiempo restante/resaltado/continuar/TOC), backend de voz local | Se re-corrieron los tests de rondas anteriores tras agregar el panel de IA | Sin cambios de comportamiento — el panel nuevo no modifica ningún archivo de los que esas pruebas cubren salvo agregados aditivos |

No se fabricó ningún resultado: donde no se pudo ejecutar la prueba real
(PDF/DOCX real, voces de síntesis del navegador, calidad real de una voz
de ElevenLabs, backend real desplegado en Render, Safari/iPhone o Android
reales — todos bloqueados por restricciones de red o por no tener
dispositivos físicos en este entorno de desarrollo), queda aclarado en
vez de darlo por probado. Los tests de backend usan un servidor Express
real corrido localmente con `fetch` global reemplazado por una versión
simulada (sin red real a Groq/ElevenLabs); los tests de funciones puras
de `documentos.js`/`chat.js` se corrieron extrayendo esas funciones a un
módulo temporal de Node, ya que dependen de `pdfjsLib`/`mammoth`/DOM que
no están disponibles fuera del navegador.

## Próximas mejoras

- Tests automatizados (hoy la matriz de arriba es manual).
- Verificar en un iPhone/Safari y en Android reales — pendiente también
  para esta ronda, ver "Pruebas realizadas".
- OCR opcional para PDF escaneados (hoy solo se detecta y avisa, no se
  extrae texto de la imagen).
- Selector explícito de voz IA masculina/femenina independiente de los
  modos de voz del navegador (hoy la voz IA usa "hombre" por defecto,
  salvo que el modo "Personalizada" tenga elegida una voz que parezca
  femenina) — y mostrar el modelo/idioma de cada voz IA disponible, no
  solo si está configurada.
- Resolver la limitación de DNS rebinding en `/fetch-document` fijando la
  IP resuelta para el pedido real (Node/undici no lo expone de forma
  simple hoy).
- Experiencia de lectura: resaltado del texto que se está leyendo dentro
  del documento, "continuar donde quedaste" entre recargas de página,
  tabla de contenidos cuando el documento tiene títulos, y descarga del
  audio generado.
- Progressive Web App (ícono, instalable, funcionamiento básico offline).
- El panel "¿Qué querés lograr?" puede quedar unos pocos píxeles superpuesto
  con el borde del chat en laptops de poca altura (~720px) mientras está
  abierto — es temporal (se oculta al elegir una opción) y no afecta los
  controles de reproducción una vez elegida, pero se puede pulir más.
