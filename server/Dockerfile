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

FROM node:20-slim

# Python + pip: node:20-slim se basa en Debian y trae python3, pero no
# pip ni venv por defecto.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      python3-venv \
      python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Entorno virtual propio para Piper (Debian bookworm bloquea "pip
# install" contra el Python del sistema por PEP 668 — un venv lo evita
# sin agregar flags riesgosos como --break-system-packages).
RUN python3 -m venv /opt/piper-venv \
    && /opt/piper-venv/bin/pip install --no-cache-dir piper-tts

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
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV PIPER_EXECUTABLE=/opt/piper-venv/bin/piper
ENV PIPER_MODEL_PATH=/app/models/piper/${PIPER_VOICE_NAME}.onnx
ENV PIPER_OUTPUT_DIRECTORY=/app/src/voice/audio
ENV NODE_ENV=production

EXPOSE 3000
CMD ["node", "server.js"]
