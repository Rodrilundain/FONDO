import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readdir, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  verificarPiperDisponible,
  sintetizarConPiper,
  limpiarArchivosViejos,
  carpetaAudioEsEscribible,
} from "../providers/piperProvider.js";

test("verificarPiperDisponible: sin PIPER_EXECUTABLE ni PIPER_MODEL_PATH configurados", async () => {
  const resultado = await verificarPiperDisponible({ executable: "", modelPath: "", configPath: "", outputDirectory: "/tmp" });
  assert.equal(resultado.disponible, false);
  assert.ok(resultado.errores.some(e => e.includes("PIPER_EXECUTABLE")));
  assert.ok(resultado.errores.some(e => e.includes("PIPER_MODEL_PATH")));
});

test("verificarPiperDisponible: ejecutable configurado pero que no existe en disco", async () => {
  const resultado = await verificarPiperDisponible({
    executable: "/ruta/que/no/existe/piper",
    modelPath: "/ruta/que/no/existe/modelo.onnx",
    configPath: "",
    outputDirectory: "/tmp",
  });
  assert.equal(resultado.disponible, false);
  assert.ok(resultado.errores.some(e => e.includes("No se encontro el ejecutable") || e.includes("No se encontró el ejecutable")));
});

test("sintetizarConPiper: falla con codigo piper_no_disponible si falta configuracion", async () => {
  await assert.rejects(
    () => sintetizarConPiper("Hola", { executable: "", modelPath: "", configPath: "", outputDirectory: "/tmp" }),
    err => {
      assert.equal(err.codigo, "piper_no_disponible");
      return true;
    }
  );
});

test("limpiarArchivosViejos: borra solo archivos propios (prefijo medusa-piper-) mas viejos que el limite", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "medusa-piper-test-"));
  const viejoPropio = path.join(dir, "medusa-piper-1111-aaaa.wav");
  const nuevoPropio = path.join(dir, "medusa-piper-2222-bbbb.wav");
  const otroArchivo = path.join(dir, "no-es-nuestro.wav");

  await writeFile(viejoPropio, "x");
  await writeFile(nuevoPropio, "x");
  await writeFile(otroArchivo, "x");

  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000);
  await utimes(viejoPropio, haceUnaHora, haceUnaHora);
  await utimes(otroArchivo, haceUnaHora, haceUnaHora);

  await limpiarArchivosViejos(dir, 10); // limite: 10 minutos

  const restantes = await readdir(dir);
  assert.ok(!restantes.includes("medusa-piper-1111-aaaa.wav"), "el archivo propio viejo deberia haberse borrado");
  assert.ok(restantes.includes("medusa-piper-2222-bbbb.wav"), "el archivo propio nuevo NO deberia borrarse");
  assert.ok(restantes.includes("no-es-nuestro.wav"), "un archivo que no es nuestro nunca deberia tocarse");
});

test("limpiarArchivosViejos: no falla si el directorio todavia no existe", async () => {
  await limpiarArchivosViejos("/ruta/que/no/existe/para/nada", 60);
});

test("carpetaAudioEsEscribible: true para una carpeta temporal real (la crea si hace falta)", async () => {
  const dir = path.join(await mkdtemp(path.join(tmpdir(), "medusa-piper-write-")), "subcarpeta-nueva");
  assert.equal(await carpetaAudioEsEscribible(dir), true);
});

test("carpetaAudioEsEscribible: false para una ruta que no se puede crear/escribir", async () => {
  // Un archivo comun no se puede usar como "directorio padre" -- mkdir
  // recursive falla ahi con ENOTDIR.
  const dir = await mkdtemp(path.join(tmpdir(), "medusa-piper-notdir-"));
  const archivoComun = path.join(dir, "esto-es-un-archivo");
  await writeFile(archivoComun, "x");
  assert.equal(await carpetaAudioEsEscribible(path.join(archivoComun, "subcarpeta")), false);
});

// --- Prueba de integracion real, solo si el entorno tiene Piper configurado ---
// No se puede asumir que Piper este instalado en cualquier maquina que
// corra estos tests, asi que esta prueba se salta (no falla) si no estan
// las variables de entorno TEST_PIPER_EXECUTABLE / TEST_PIPER_MODEL_PATH.
// Ver server/src/voice/README.md para como configurarlas.
const ejecutableReal = process.env.TEST_PIPER_EXECUTABLE;
const modeloReal = process.env.TEST_PIPER_MODEL_PATH;

test("sintetizarConPiper: integracion real con un Piper instalado (si esta configurado)", { skip: !ejecutableReal || !modeloReal }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "medusa-piper-real-"));
  const rutaWav = await sintetizarConPiper("Hola, Rodrigo. El sistema esta funcionando correctamente.", {
    executable: ejecutableReal,
    modelPath: modeloReal,
    configPath: process.env.TEST_PIPER_CONFIG_PATH || "",
    outputDirectory: dir,
  });
  assert.ok(rutaWav.endsWith(".wav"));
  const { stat } = await import("node:fs/promises");
  const info = await stat(rutaWav);
  assert.ok(info.size > 44, "el wav generado deberia tener datos de audio, no solo la cabecera");
});
