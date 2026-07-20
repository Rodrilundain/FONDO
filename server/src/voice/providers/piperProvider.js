// === Proveedor Piper: ejecuta el binario/CLI de Piper como proceso aparte ===
// Seguridad: el texto SIEMPRE se manda por stdin, nunca como parte de un
// comando armado con texto del usuario. `spawn` recibe el ejecutable y sus
// argumentos como un array (sin `shell: true`), así que no hay shell de por
// medio que necesite escapar comillas, espacios ni caracteres especiales
// (ni en Linux/Mac ni en Windows).

import { spawn } from "node:child_process";
import { access, constants as fsConstants, mkdir, readdir, stat, unlink, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { platform } from "node:os";

const PREFIJO_ARCHIVO = "medusa-piper-";

async function existeArchivo(ruta) {
  if (!ruta) return false;
  try {
    await access(ruta, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function nombreArchivoUnico() {
  // Timestamp + bytes al azar: evita colisiones entre solicitudes
  // consecutivas o concurrentes sin necesitar un contador compartido.
  const marca = Date.now();
  const azar = crypto.randomBytes(4).toString("hex");
  return `${PREFIJO_ARCHIVO}${marca}-${azar}.wav`;
}

// Revisa que el ejecutable, el modelo y su configuración existan de verdad
// antes de intentar correr Piper — así "modelo inexistente" o "Piper no
// instalado" dan un mensaje claro en vez de que spawn() falle de forma
// más críptica.
export async function verificarPiperDisponible(piperConfig) {
  const errores = [];

  if (!piperConfig.executable) {
    errores.push("Falta configurar PIPER_EXECUTABLE.");
  } else if (!(await existeArchivo(piperConfig.executable))) {
    errores.push(`No se encontró el ejecutable de Piper en "${piperConfig.executable}".`);
  }

  if (!piperConfig.modelPath) {
    errores.push("Falta configurar PIPER_MODEL_PATH.");
  } else if (!(await existeArchivo(piperConfig.modelPath))) {
    errores.push(`No se encontró el modelo de voz en "${piperConfig.modelPath}".`);
  }

  const configPath = piperConfig.configPath || (piperConfig.modelPath ? `${piperConfig.modelPath}.json` : "");
  if (piperConfig.modelPath && !(await existeArchivo(configPath))) {
    errores.push(`No se encontró el archivo de configuración de la voz en "${configPath}".`);
  }

  return { disponible: errores.length === 0, errores, configPath };
}

// Confirma que la carpeta de salida exista (la crea si hace falta, igual
// que sintetizarConPiper) y que de verdad se pueda escribir ahí -- separa
// "el ejecutable/modelo están bien" de "el servidor puede guardar el
// .wav resultante" (por ejemplo, un filesystem de solo lectura o sin
// permisos, algo que verificarPiperDisponible no detecta).
export async function carpetaAudioEsEscribible(directorio) {
  try {
    await mkdir(directorio, { recursive: true });
    const rutaPrueba = path.join(directorio, `.medusa-piper-permtest-${crypto.randomBytes(4).toString("hex")}`);
    await writeFile(rutaPrueba, "");
    await rm(rutaPrueba, { force: true });
    return true;
  } catch {
    return false;
  }
}

// Corre Piper una vez sobre `texto` y devuelve la ruta del .wav generado.
// Lanza un Error con `.codigo` en caso de falla (piper_no_disponible,
// piper_spawn_error, piper_exit_error, piper_salida_vacia) — quien llama
// decide cómo mostrarlo; acá no se atrapa en silencio.
export async function sintetizarConPiper(texto, piperConfig) {
  const { disponible, errores, configPath } = await verificarPiperDisponible(piperConfig);
  if (!disponible) {
    const error = new Error(errores.join(" "));
    error.codigo = "piper_no_disponible";
    throw error;
  }

  await mkdir(piperConfig.outputDirectory, { recursive: true });
  const rutaSalida = path.join(piperConfig.outputDirectory, nombreArchivoUnico());

  await new Promise((resolve, reject) => {
    let proceso;
    try {
      proceso = spawn(
        piperConfig.executable,
        ["-m", piperConfig.modelPath, "-c", configPath, "-f", rutaSalida],
        { stdio: ["pipe", "ignore", "pipe"] }
      );
    } catch (err) {
      const error = new Error(`No se pudo iniciar el proceso de Piper: ${err.message}`);
      error.codigo = "piper_spawn_error";
      reject(error);
      return;
    }

    let stderrCapturado = "";
    proceso.stderr?.on("data", chunk => {
      stderrCapturado += chunk.toString();
    });

    proceso.on("error", err => {
      // Se dispara, por ejemplo, si el ejecutable no tiene permiso de
      // ejecución o el binario no es válido para este sistema operativo.
      const error = new Error(`No se pudo ejecutar Piper: ${err.message}`);
      error.codigo = "piper_spawn_error";
      reject(error);
    });

    proceso.on("close", code => {
      if (code === 0) {
        resolve();
        return;
      }
      const detalle = stderrCapturado.trim();
      const error = new Error(`Piper terminó con código ${code}.${detalle ? " " + detalle : ""}`);
      error.codigo = "piper_exit_error";
      reject(error);
    });

    proceso.stdin.on("error", () => {
      // Puede pasar si el proceso muere antes de que termine de escribirse
      // el texto; el evento "close"/"error" de arriba ya maneja el fallo.
    });
    proceso.stdin.write(texto, "utf-8");
    proceso.stdin.end();
  });

  if (!(await existeArchivo(rutaSalida))) {
    const error = new Error("Piper terminó sin errores pero no generó ningún archivo de audio.");
    error.codigo = "piper_salida_vacia";
    throw error;
  }
  const info = await stat(rutaSalida);
  if (info.size <= 44) {
    // 44 bytes es el tamaño de una cabecera WAV vacía sin datos de audio.
    const error = new Error("Piper generó un archivo de audio vacío.");
    error.codigo = "piper_salida_vacia";
    throw error;
  }

  return rutaSalida;
}

const TEXTO_PRUEBA_SALUD = "Prueba.";

// Corre una síntesis REAL, corta, para /health (Punto 7 de la auditoría
// v2): a diferencia de verificarPiperDisponible() (que solo mira que el
// ejecutable/modelo/config EXISTAN como archivos), esto confirma que
// Piper de verdad puede ejecutarse y producir un .wav válido -- detecta,
// por ejemplo, un ejecutable presente pero sin permiso de ejecución, un
// modelo corrupto, o una versión de Piper incompatible con el modelo.
// Se borra el archivo generado apenas se confirma (no hace falta
// guardarlo, es solo una prueba). Lanza si falla -- quien llama decide
// cómo cachear/traducir el resultado (ver voiceService.js).
export async function probarPiperReal(piperConfig) {
  const rutaSalida = await sintetizarConPiper(TEXTO_PRUEBA_SALUD, piperConfig);
  await unlink(rutaSalida).catch(() => {});
  return true;
}

// Borra archivos generados por este módulo (mismo prefijo) más viejos que
// `maxEdadMinutos`, para que la carpeta de audio temporal no crezca sin
// límite. Solo toca archivos con el prefijo propio, nunca la carpeta
// entera, por si `outputDirectory` llegara a compartirse con otra cosa.
export async function limpiarArchivosViejos(directorio, maxEdadMinutos) {
  let nombres;
  try {
    nombres = await readdir(directorio);
  } catch {
    return; // la carpeta todavía no existe: nada que limpiar
  }
  const limiteMs = maxEdadMinutos * 60 * 1000;
  const ahora = Date.now();
  for (const nombre of nombres) {
    if (!nombre.startsWith(PREFIJO_ARCHIVO) || !nombre.endsWith(".wav")) continue;
    const ruta = path.join(directorio, nombre);
    try {
      const info = await stat(ruta);
      if (ahora - info.mtimeMs > limiteMs) await unlink(ruta);
    } catch {
      // Pudo haberlo borrado otra solicitud concurrente entre el readdir
      // y el stat/unlink: no es un error real, se ignora.
    }
  }
}

// Reproduce el .wav generado usando el reproductor de línea de comandos
// del sistema operativo. Es "best effort": solo tiene sentido cuando
// MedusaLee corre localmente con salida de audio (por ejemplo, el script
// de prueba por consola); en un servidor headless como Render no hay
// dispositivo de audio y esto simplemente no va a encontrar el
// reproductor — se resuelve `false` en vez de lanzar un error, para que
// nunca pueda tirar abajo el resto de la app.
export function reproducirAudioLocal(rutaWav) {
  return new Promise(resolve => {
    let comando;
    let args;
    switch (platform()) {
      case "darwin":
        comando = "afplay";
        args = [rutaWav];
        break;
      case "win32": {
        // -EncodedCommand evita cualquier problema de comillas/espacios en
        // la ruta: el script va codificado en base64, no se parsea como
        // texto de shell.
        const script = `(New-Object Media.SoundPlayer '${rutaWav.replace(/'/g, "''")}').PlaySync();`;
        comando = "powershell";
        args = ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")];
        break;
      }
      default:
        comando = "aplay";
        args = [rutaWav];
        break;
    }
    try {
      const proceso = spawn(comando, args, { stdio: "ignore" });
      proceso.on("error", () => resolve(false));
      proceso.on("close", code => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}
