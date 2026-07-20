// === VoiceService: interfaz única de texto-a-voz para MedusaLee ===
// Hoy solo Piper está implementado de verdad. La idea de tener un mapa de
// proveedores (en vez de llamar a Piper directo) es poder sumar otros
// motores (OpenVoice, MeloTTS) más adelante sin cambiar la firma de
// `textToSpeech`, que es lo que el resto de MedusaLee (o un script de
// prueba) termina usando.
//
//   VoiceService
//    |- PiperProvider     (implementado)
//    |- OpenVoiceProvider (placeholder, sin dependencias instaladas)
//    `- MeloTTSProvider   (placeholder, sin dependencias instaladas)

import { cargarVoiceConfig } from "./voiceConfig.js";
import { validarTexto, limpiarTextoParaSintesis, dividirEnBloques } from "./textSanitizer.js";
import {
  sintetizarConPiper, limpiarArchivosViejos, reproducirAudioLocal,
  verificarPiperDisponible, carpetaAudioEsEscribible, probarPiperReal
} from "./providers/piperProvider.js";
import { crearProviderNoImplementado } from "./providers/providerStub.js";
import { crearLimitadorConcurrencia, ColaLlenaError } from "./concurrencyLimiter.js";
import { crearCachePiperHealth } from "./piperHealthCache.js";

// Cada síntesis de Piper es un proceso del sistema operativo aparte: sin
// límite, varias solicitudes simultáneas podrían saturar el contenedor
// (Etapa 4 de la auditoría de seguridad). El limitador se crea una sola
// vez (tamaño fijado por PIPER_MAX_CONCURRENCIA/PIPER_MAX_EN_COLA al
// primer uso) y se reutiliza para todas las solicitudes siguientes.
let limitadorPiper = null;
function obtenerLimitadorPiper(config) {
  if (!limitadorPiper) {
    limitadorPiper = crearLimitadorConcurrencia({
      maxConcurrentes: config.piperMaxConcurrencia,
      maxEnCola: config.piperMaxEnCola,
    });
  }
  return limitadorPiper;
}
// Solo para tests: permite que un test cambie PIPER_MAX_CONCURRENCIA y
// vuelva a crear el limitador con el nuevo tamaño.
export function reiniciarLimitadorPiperParaTests() {
  limitadorPiper = null;
}

// Cachea el resultado de una prueba real de síntesis para /health (Punto
// 7 de la auditoría v2) -- ver piperHealthCache.js. Mismo patrón que el
// limitador de arriba: se crea una sola vez, con el TTL configurado al
// primer uso.
let cachePiperHealth = null;
function obtenerCachePiperHealth(config) {
  if (!cachePiperHealth) {
    cachePiperHealth = crearCachePiperHealth({ ttlMs: config.piperHealthCacheMs });
  }
  return cachePiperHealth;
}
export function reiniciarCachePiperHealthParaTests() {
  cachePiperHealth = null;
}

const PROVIDERS = {
  piper: {
    synthesize: (texto, config) =>
      obtenerLimitadorPiper(config)(() => sintetizarConPiper(texto, config.piper)),
  },
  openvoice: crearProviderNoImplementado("OpenVoice"),
  melotts: crearProviderNoImplementado("MeloTTS"),
};

function respuestaError(engine, mensaje, codigo) {
  return { success: false, audioPath: null, engine, error: mensaje, codigo: codigo || null };
}

function respuestaOk(engine, audioPath) {
  return { success: true, audioPath, engine, error: null };
}

// Función reutilizable principal. Nunca lanza una excepción hacia quien la
// llama: cualquier fallo (Piper no instalado, modelo faltante, texto
// vacío, motor desactivado) se traduce a `{ success: false, error }`, para
// que un problema del sistema de voz jamás le impida a MedusaLee entregar
// su respuesta en texto.
//
//   const audioResult = await textToSpeech({ text: respuesta, voice: "es_AR", autoplay: true });
export async function textToSpeech({ text, voice, autoplay } = {}) {
  const config = cargarVoiceConfig();
  const engine = config.ttsEngine;

  if (!config.ttsEnabled) {
    return respuestaError(engine, "La síntesis de voz está desactivada (TTS_ENABLED=false).");
  }
  if (!validarTexto(text)) {
    return respuestaError(engine, "El texto está vacío.");
  }

  const provider = PROVIDERS[engine];
  if (!provider) {
    return respuestaError(engine, `Motor de voz "${engine}" no reconocido. Motores disponibles: ${Object.keys(PROVIDERS).join(", ")}.`);
  }

  // Piper ya administra pausas entre oraciones internamente, así que hoy
  // se sintetiza el texto completo en un solo pedido; dividirlo en bloques
  // deja el terreno preparado por si en el futuro conviene generar/
  // reproducir por partes (documentos largos, streaming).
  const textoLimpio = limpiarTextoParaSintesis(text);
  const textoFinal = dividirEnBloques(textoLimpio, config.maxCaracteresPorBloque).join(" ");

  // Limpieza de archivos viejos en segundo plano: no bloquea ni puede
  // hacer fallar esta solicitud si algo sale mal borrando.
  limpiarArchivosViejos(config.piper.outputDirectory, config.tempMaxAgeMinutos).catch(() => {});

  let audioPath;
  try {
    audioPath = await provider.synthesize(textoFinal, { ...config, voice });
  } catch (err) {
    // err.codigo distingue, por ejemplo, "cola_llena" (Punto 7 de la
    // auditoría v2: la cola de síntesis de Piper está llena, el llamador
    // debería traducir esto a 429/503) de un fallo real de Piper.
    return respuestaError(engine, err?.message || "Error desconocido al generar la voz.", err?.codigo);
  }

  const debeReproducir = autoplay !== undefined ? autoplay : config.autoplay;
  if (debeReproducir) {
    // Best effort: si no hay parlantes o reproductor (por ejemplo, en un
    // servidor desplegado sin audio), no afecta el resultado ya generado.
    reproducirAudioLocal(audioPath).catch(() => {});
  }

  return respuestaOk(engine, audioPath);
}

// Para que server.js pueda decidir si muestra la opción de voz local sin
// tener que leer variables de entorno por su cuenta.
export function vozLocalHabilitada() {
  return cargarVoiceConfig().ttsEnabled;
}

// Estado real de la voz local para /health (Etapa 3 de la auditoría de
// seguridad, ampliado en el Punto 7 de la v2): separa "está habilitada
// por configuración" de "está realmente operativa" -- antes, TTS_ENABLED
// =true por sí solo hacía que /health mostrara la voz como disponible
// aunque el modelo nunca se hubiera descargado. `estado` es un código
// estable para diagnosticar sin exponer rutas completas del servidor
// (esas rutas solo quedan en `errores`, pensado para logs internos, no
// para la respuesta HTTP). Valores posibles: deshabilitado,
// ejecutable_no_encontrado, modelo_no_encontrado, config_no_encontrada,
// directorio_no_escribible, prueba_fallida, disponible (y
// motor_no_implementado para motores todavía no implementados, aparte
// de Piper).
//
// El último paso (prueba_fallida/disponible) corre una síntesis REAL,
// corta, con Piper -- más cara que solo mirar si los archivos existen,
// así que su resultado se cachea (PIPER_HEALTH_CACHE_MS, 5 minutos por
// defecto) para no correr Piper en cada pedido a /health.
export async function estadoVozLocal() {
  const config = cargarVoiceConfig();
  if (!config.ttsEnabled) {
    return { habilitada: false, disponible: false, estado: "deshabilitado" };
  }
  if (config.ttsEngine !== "piper") {
    // openvoice/melotts son placeholders sin implementar todavía.
    return { habilitada: true, disponible: false, estado: "motor_no_implementado" };
  }

  const { disponible, errores } = await verificarPiperDisponible(config.piper);
  if (!disponible) {
    let estado = "ejecutable_no_encontrado"; // default: cubre también el caso genérico sin match específico
    if (errores.some(e => /PIPER_EXECUTABLE|el ejecutable de Piper/.test(e))) estado = "ejecutable_no_encontrado";
    else if (errores.some(e => /PIPER_MODEL_PATH|el modelo de voz/.test(e))) estado = "modelo_no_encontrado";
    else if (errores.some(e => /configuración de la voz/.test(e))) estado = "config_no_encontrada";
    return { habilitada: true, disponible: false, estado };
  }

  if (!(await carpetaAudioEsEscribible(config.piper.outputDirectory))) {
    return { habilitada: true, disponible: false, estado: "directorio_no_escribible" };
  }

  const cache = obtenerCachePiperHealth(config);
  const pruebaOk = await cache.obtener(() => probarPiperReal(config.piper));
  if (!pruebaOk) {
    return { habilitada: true, disponible: false, estado: "prueba_fallida" };
  }

  return { habilitada: true, disponible: true, estado: "disponible" };
}

// Para que server.js pueda servir el .wav generado sin duplicar la lógica
// de dónde vive la carpeta de audio (mismo criterio que usa Piper).
export function rutaDirectorioAudioPiper() {
  return cargarVoiceConfig().piper.outputDirectory;
}
