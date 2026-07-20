# Voz local con Piper (motor opcional, gratis, sin cuota)

Este módulo agrega un motor de voz que corre 100% local (sin mandar texto
a ningún servicio externo, a diferencia de ElevenLabs), usando
[Piper](https://github.com/OHF-Voice/piper1-gpl). Es un motor separado del
resto de la app: si no lo configurás, MedusaLee sigue funcionando
exactamente igual que antes (texto + voz del navegador + ElevenLabs
opcional).

## Origen y licencias (verificado en esta sesión)

| Componente | Origen | Licencia |
|---|---|---|
| Motor Piper (paquete `piper-tts`) | [PyPI](https://pypi.org/project/piper-tts/), código en [github.com/OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl) | **GPL-3.0-or-later** (confirmado con `pip show piper-tts` y el archivo `COPYING` del repo) |
| espeak-ng (fonemización, viene incluido en el paquete) | Empaquetado dentro de `piper-tts` | GPL-3.0 (proyecto de terceros, ampliamente usado) |
| Modelos de voz (`.onnx` + `.onnx.json`) | [huggingface.co/rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) | **Varía por voz** — cada voz trae su propio `MODEL_CARD` con la licencia del dataset con el que se entrenó. Muchas son CC0, pero no todas: **revisá el `MODEL_CARD` de la voz elegida antes de usarla**, no asumas que todas son iguales. |

Nota importante sobre `es_AR-daniela`: **no pude confirmar en vivo si esa
voz existe en el catálogo actual**, porque `huggingface.co` está bloqueado
por la política de red de este entorno de desarrollo (se probó con
`curl`/`urlopen` y devuelve "CONNECT tunnel failed, 403" — no es un
límite de Piper, es la red de este sandbox). No voy a inventar que la
comprobé. El comando de abajo ("Listar todas las voces") te deja
verificarlo vos mismo en segundos, corriéndolo desde tu máquina.

GPL-3.0 es una licencia con copyleft: acá se usa a Piper como un programa
externo aparte (se lo invoca como proceso con `spawn`, nunca se linkea su
código a MedusaLee), que es el uso típico permitido sin que MedusaLee
tenga que licenciarse como GPL — pero no es un consejo legal. Si vas a
distribuir MedusaLee de forma que dependa de tener Piper instalado,
convendría que lo confirmes con alguien idóneo si te preocupa el tema.

## Instalación de Piper

Verificado en este entorno (Linux, Python 3.11, `pip` 24):

```bash
python3 -m venv .venv-piper       # opcional pero recomendado: entorno aislado
# Linux/Mac:
source .venv-piper/bin/activate
# Windows (PowerShell):
# .venv-piper\Scripts\Activate.ps1

pip install piper-tts
```

Esto instala el paquete `piper-tts` (versión `1.5.0` al momento de
probarlo) y deja un ejecutable `piper` disponible en:

- Linux/Mac: `.venv-piper/bin/piper`
- Windows: `.venv-piper\Scripts\piper.exe`

Esa ruta completa es lo que va en `PIPER_EXECUTABLE`.

### Listar todas las voces disponibles (para confirmar `es_AR-daniela` u otra)

```bash
python -m piper.download_voices
```

Sin argumentos, este comando **lista** todas las voces del catálogo (no
descarga nada). Buscá las que empiecen con `es_AR`, `es_MX`, `es_419` o
`es_ES` según lo que prefieras. Si aparece `es_AR-daniela-high` (o
`-medium`), es la voz que pediste.

### Descargar una voz

```bash
python -m piper.download_voices es_AR-daniela-high --download-dir server/models/piper
```

Esto descarga `es_AR-daniela-high.onnx` y `es_AR-daniela-high.onnx.json`
directo desde Hugging Face (`huggingface.co/rhasspy/piper-voices`) a
`server/models/piper/`. **Antes de usarla**, revisá el `MODEL_CARD` que
acompaña la voz en esa misma página de Hugging Face para confirmar su
licencia específica.

Si `es_AR-daniela` no existiera o no te convence su licencia, alternativas
en español latino/rioplatense conocidas en el catálogo de Piper (a
confirmar con el comando de arriba, no puedo garantizar cuáles siguen
disponibles): voces `es_MX` (México) y `es_419` (español latino genérico,
pensado para sonar neutro). Si preferís España en vez de Latinoamérica,
también hay varias `es_ES`.

### Probar la voz manualmente (sin MedusaLee)

```bash
echo "Hola, Rodrigo. El sistema está funcionando correctamente." | \
  .venv-piper/bin/piper \
  -m server/models/piper/es_AR-daniela-high.onnx \
  -c server/models/piper/es_AR-daniela-high.onnx.json \
  -f /tmp/prueba.wav

# reproducir (Linux):
aplay /tmp/prueba.wav
# Mac:
afplay /tmp/prueba.wav
# Windows (PowerShell):
# (New-Object Media.SoundPlayer 'C:\ruta\prueba.wav').PlaySync()
```

## Configuración en MedusaLee

En `server/.env` (no se commitea):

```bash
TTS_ENABLED=true
TTS_ENGINE=piper
PIPER_EXECUTABLE=/ruta/completa/a/.venv-piper/bin/piper
PIPER_MODEL_PATH=/ruta/completa/a/server/models/piper/es_AR-daniela-high.onnx
# PIPER_CONFIG_PATH= (opcional: si no se pone, se infiere <modelo>.onnx.json)
# PIPER_OUTPUT_DIRECTORY= (opcional: por defecto server/src/voice/audio)
TTS_AUTOPLAY=false
```

Con `TTS_ENABLED=false` (o sin definir), MedusaLee sigue respondiendo por
texto normalmente y **nunca** ejecuta Piper ni genera archivos de audio.

## Disponible para todos en Render (Docker), no solo en tu compu

Todo lo de arriba (`.venv-piper`, `PIPER_EXECUTABLE`, etc.) es para correr
Piper **localmente**: esa voz solo la escucha quien instaló Python y el
modelo en su propia máquina. Para que la voz `es_AR` esté disponible para
cualquiera que entre a la URL pública de MedusaLee, el backend se puede
desplegar en Render como imagen Docker en vez del runtime "Node" nativo
(que no trae Python).

Esto ya está armado en el repo:

- `server/Dockerfile`: imagen basada en `node:20-slim`, instala Python +
  un entorno virtual propio para Piper (`pip install piper-tts` dentro de
  ese venv, evitando el bloqueo PEP 668 de Debian), descarga la voz
  `es_AR-daniela-high` durante el build y arranca el mismo `server.js` de
  siempre.
- `render.yaml`: el servicio `medusa-backend` pasó de `runtime: node` a
  `runtime: docker` con `dockerfilePath: Dockerfile` y `dockerContext: .`
  (relativos a `rootDir: server`), y `TTS_ENABLED=true` ya viene puesto
  para este servicio (las demás variables `PIPER_*` quedan fijadas dentro
  de la imagen, no hace falta repetirlas en Render).

**Qué se verificó de esto y qué no** (importante, no se afirma que
funciona sin haberlo probado):

- ✅ Verificado: la sintaxis y los nombres de campo de `render.yaml`
  (`runtime: docker`, `dockerfilePath`, `dockerContext`) contra la
  documentación oficial de Render (Blueprint YAML Reference,
  render.com/docs/blueprint-spec).
- ✅ Verificado (en una sesión anterior, sin Docker): que
  `python3 -m venv` + `pip install piper-tts` dentro de ese venv instala
  un `piper` funcional y genera un `.wav` real.
- ❌ **No verificado**: el `docker build` de `server/Dockerfile` de punta
  a punta. El entorno donde se escribió este Dockerfile bloquea
  `production.cloudfront.docker.com` (el registro de Docker Hub), así que
  no se pudo descargar ni siquiera la imagen base `node:20-slim` para
  probar el build acá.
- ❌ **No verificado**: si el entorno de build de Render puede alcanzar
  `huggingface.co` para descargar el modelo de voz. El paso está escrito
  para no ser fatal (`|| echo "ADVERTENCIA..."`) — si falla, el build
  igual termina y el resto de MedusaLee sigue funcionando, solo que sin
  esa voz configurada. Hay que revisar el log de build en Render después
  de desplegar para confirmar si la descarga funcionó.
- ❌ **No verificado**: si cambiar el `runtime` de un servicio *ya
  existente* en Render de `node` a `docker` mediante un nuevo Blueprint
  Sync funciona de forma automática, o si Render pide recrear el
  servicio a mano desde el dashboard. No hay forma de probar esto sin
  acceso a la cuenta de Render.

En resumen: el Dockerfile está escrito y revisado con cuidado, pero el
primer build real va a pasar en Render, no acá. Si después de desplegar
la voz `es_AR` no aparece disponible, el log de build de Render (paso de
`RUN ... piper.download_voices`) es el primer lugar para mirar.

## Verificado vs. no verificado en esta sesión

**Sí verificado, ejecutado de verdad en este entorno**: instalación de
`piper-tts` vía pip, generación de un `.wav` real (cabecera RIFF/WAVE PCM
16 bits válida) a partir de texto con tildes/ñ/¿/¡ por stdin, usando el
modelo de prueba que trae el propio repo de Piper para sus tests
(`tests/test_voice.onnx`, genera silencio — no es una voz real, solo sirve
para probar el mecanismo). Ese modelo de prueba **no se incluyó en este
repositorio**: solo se usó en este entorno de sesión para confirmar que la
integración funciona de punta a punta.

**No verificado**: la voz `es_AR-daniela` en sí (no se pudo descargar ni
escuchar, Hugging Face bloqueado acá), su licencia específica, y el
comportamiento en Windows (sin esa plataforma disponible en este entorno).
