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
