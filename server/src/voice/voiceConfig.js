// === Configuración del sistema de voz local (Piper) ===
// Responsabilidad única: leer variables de entorno y devolver valores por
// defecto razonables. Ninguna ruta personal/absoluta va escrita acá — todo
// lo que apunta al ejecutable o al modelo de Piper se configura por fuera
// (server/.env, que no se commitea).

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carpeta donde se guardan los .wav generados temporalmente. Vive dentro
// del propio módulo para no depender de una ruta absoluta del sistema del
// desarrollador; se puede pisar con PIPER_OUTPUT_DIRECTORY si se prefiere
// otro destino (por ejemplo, un disco con más espacio en el servidor).
const OUTPUT_DIR_POR_DEFECTO = path.join(__dirname, "audio");

function leerBooleano(valor, porDefecto) {
  if (valor === undefined || valor === "") return porDefecto;
  return valor === "true" || valor === "1";
}

function leerNumero(valor, porDefecto) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

// Se llama en cada uso (no se cachea a nivel de módulo) para que los tests
// puedan cambiar process.env entre casos sin reiniciar el proceso.
export function cargarVoiceConfig() {
  return {
    // Apagado por defecto: como con ElevenLabs, la voz IA local es opt-in,
    // no algo que se intente usar sin que el usuario la haya configurado.
    ttsEnabled: leerBooleano(process.env.TTS_ENABLED, false),
    ttsEngine: (process.env.TTS_ENGINE || "piper").toLowerCase(),
    piper: {
      // Ruta al ejecutable de Piper (o al script `piper` que deja
      // `pip install piper-tts` en el venv). Vacío por defecto: sin esto
      // configurado, el módulo informa el error en vez de intentar
      // adivinar una ruta.
      executable: process.env.PIPER_EXECUTABLE || "",
      modelPath: process.env.PIPER_MODEL_PATH || "",
      // Si se deja vacío, se infiere `${modelPath}.json` — es el mismo
      // comportamiento por defecto que tiene Piper internamente.
      configPath: process.env.PIPER_CONFIG_PATH || "",
      outputDirectory: process.env.PIPER_OUTPUT_DIRECTORY || OUTPUT_DIR_POR_DEFECTO,
    },
    // Reproducir automáticamente al terminar de generar el audio. Solo
    // tiene sentido cuando MedusaLee corre localmente con parlantes (por
    // ejemplo, este mismo test por consola) — en el backend desplegado en
    // Render no hay dispositivo de audio, así que ahí no debería activarse.
    autoplay: leerBooleano(process.env.TTS_AUTOPLAY, false),
    maxCaracteresPorBloque: leerNumero(process.env.TTS_MAX_CHARS_POR_BLOQUE, 500),
    tempMaxAgeMinutos: leerNumero(process.env.TTS_TEMP_MAX_AGE_MINUTOS, 60),
    // Cada síntesis de Piper es un proceso aparte (spawn) que consume CPU
    // real -- sin límite, varias solicitudes simultáneas podrían saturar
    // el contenedor. maxConcurrencia limita cuántas corren en paralelo;
    // el resto espera en una cola de hasta maxEnCola, y lo que no entra
    // ahí se rechaza con un error claro en vez de acumularse sin límite.
    piperMaxConcurrencia: leerNumero(process.env.PIPER_MAX_CONCURRENCIA, 2),
    piperMaxEnCola: leerNumero(process.env.PIPER_MAX_EN_COLA, 5),
  };
}
