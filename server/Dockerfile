# Backend de MedusaLee (Node/Express) + Piper (Python) en la misma imagen,
# para que la voz local en español rioplatense/latino esté disponible para
# cualquiera que entre a la app, no solo en la compu de quien la instaló.
#
# Por qué Docker y no el runtime "Node" nativo de Render: ese runtime no
# trae Python, y Piper lo necesita. Docker permite instalar ambos en el
# mismo servicio sin tocar la arquitectura (sigue siendo un solo backend,
# con /ask, /tts y /voice/piper en la misma URL de siempre).
#
# Advertencia honesta: el paso que descarga el modelo de voz necesita
# alcanzar huggingface.co durante el build. No se pudo verificar que
# funcione desde el entorno de desarrollo donde se escribió este
# Dockerfile (esa red bloquea huggingface.co) — si el build de Render
# también lo bloquea, ese paso falla solo y el resto de MedusaLee sigue
# funcionando igual (Piper queda sin voz configurada). Revisá el log de
# build si la voz no aparece disponible después de desplegar.
#
# Etapa 4 de la auditoría de seguridad (endurecimiento del Dockerfile):
# imagen base fijada por digest (verificado en vivo contra
# registry-1.docker.io, no inventado), versión de piper-tts fijada,
# npm ci en vez de npm install, usuario sin privilegios para correr Node,
# HEALTHCHECK, y límite de concurrencia para Piper (ver
# src/voice/concurrencyLimiter.js, no es parte de este archivo pero
# responde al mismo pedido).

# node:20-slim (Debian 12 "bookworm"), digest resuelto en vivo el
# 2026-07-20 contra registry-1.docker.io/v2/library/node/manifests/20-slim.
FROM node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0

# Python + pip: node:20-slim se basa en Debian y trae python3, pero no
# pip ni venv por defecto.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      python3-venv \
      python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Entorno virtual propio para Piper (Debian bookworm bloquea "pip
# install" contra el Python del sistema por PEP 668 — un venv lo evita
# sin agregar flags riesgosos como --break-system-packages). Versión
# fijada (confirmada como la última publicada en PyPI al momento de
# escribir esto, vía "pip index"/pypi.org/pypi/piper-tts/json) para que
# el build sea reproducible y no traiga una versión nueva sin haberla
# probado.
RUN python3 -m venv /opt/piper-venv \
    && /opt/piper-venv/bin/pip install --no-cache-dir piper-tts==1.5.0

# Voz por defecto: la que pidió el usuario (es_AR, rioplatense). Se puede
# pisar en el momento del build con --build-arg PIPER_VOICE_NAME=otra-voz
# si esta no está disponible o su licencia no conviene — confirmá primero
# corriendo "python -m piper.download_voices" (sin argumentos) para ver
# el catálogo vigente, ver server/src/voice/README.md.
ARG PIPER_VOICE_NAME=es_AR-daniela-high
ENV PIPER_VOICE_NAME=${PIPER_VOICE_NAME}

RUN mkdir -p /app/models/piper \
    && ( /opt/piper-venv/bin/python -m piper.download_voices "${PIPER_VOICE_NAME}" --download-dir /app/models/piper \
         || echo "ADVERTENCIA DE BUILD: no se pudo descargar la voz '${PIPER_VOICE_NAME}'. Piper va a quedar sin modelo configurado (MedusaLee sigue funcionando igual, sin esa voz). Ver server/src/voice/README.md." )

WORKDIR /app

# Solo lo necesario para "npm ci" primero (mejor cacheo de capas), y
# npm ci en vez de npm install: instala exactamente lo que dice
# package-lock.json, falla si el lockfile no está sincronizado con
# package.json, en vez de resolver versiones nuevas silenciosamente.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# .dockerignore se encarga de no copiar node_modules, .env, tests,
# modelos/audio ya generados, etc. -- solo entra el código de la app.
COPY . .

# Usuario sin privilegios para correr el servidor: node:20-slim ya trae
# un usuario "node" (uid/gid 1000) pensado para esto, así que no hace
# falta crear uno nuevo. Se le da dueño de /app (el código y la carpeta
# de audio temporal que Piper necesita poder escribir) y de la venv de
# Piper (necesita poder ejecutar el binario, no solo leerlo).
RUN chown -R node:node /app /opt/piper-venv
USER node

ENV PIPER_EXECUTABLE=/opt/piper-venv/bin/piper
ENV PIPER_MODEL_PATH=/app/models/piper/${PIPER_VOICE_NAME}.onnx
ENV PIPER_OUTPUT_DIRECTORY=/app/src/voice/audio
ENV NODE_ENV=production

EXPOSE 3000

# Node 20 trae fetch() nativo -- no hace falta instalar curl/wget solo
# para este chequeo. Si /health no responde 200 en 5 intentos de 3s,
# Render (u otro orquestador que respete HEALTHCHECK) puede reiniciar el
# contenedor.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
