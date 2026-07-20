import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { textToSpeech, estadoVozLocal } from "../voiceService.js";

// El modulo lee process.env en cada llamada (cargarVoiceConfig no cachea),
// asi que estos tests pueden cambiar variables de entorno entre casos sin
// reiniciar el proceso. Se limpian las variables relevantes despues de
// cada test para no contaminar los siguientes.
function limpiarEnv() {
  for (const clave of [
    "TTS_ENABLED", "TTS_ENGINE", "PIPER_EXECUTABLE", "PIPER_MODEL_PATH",
    "PIPER_CONFIG_PATH", "PIPER_OUTPUT_DIRECTORY", "TTS_AUTOPLAY",
  ]) delete process.env[clave];
}

test("textToSpeech: motor desactivado (TTS_ENABLED sin definir) devuelve success:false sin tocar Piper", async () => {
  limpiarEnv();
  const resultado = await textToSpeech({ text: "Hola, Rodrigo." });
  assert.equal(resultado.success, false);
  assert.equal(resultado.audioPath, null);
  assert.equal(resultado.engine, "piper");
  assert.match(resultado.error, /TTS_ENABLED/);
  limpiarEnv();
});

test("textToSpeech: texto vacio devuelve success:false con motor activado", async () => {
  limpiarEnv();
  process.env.TTS_ENABLED = "true";
  const resultado = await textToSpeech({ text: "   " });
  assert.equal(resultado.success, false);
  assert.equal(resultado.audioPath, null);
  assert.match(resultado.error, /vac/i);
  limpiarEnv();
});

test("textToSpeech: texto undefined no revienta, devuelve success:false", async () => {
  limpiarEnv();
  process.env.TTS_ENABLED = "true";
  const resultado = await textToSpeech({});
  assert.equal(resultado.success, false);
  limpiarEnv();
});

test("textToSpeech: motor desconocido devuelve error claro", async () => {
  limpiarEnv();
  process.env.TTS_ENABLED = "true";
  process.env.TTS_ENGINE = "motor-que-no-existe";
  const resultado = await textToSpeech({ text: "Hola." });
  assert.equal(resultado.success, false);
  assert.equal(resultado.engine, "motor-que-no-existe");
  assert.match(resultado.error, /no reconocido/);
  limpiarEnv();
});

test("textToSpeech: Piper activado pero sin PIPER_EXECUTABLE/PIPER_MODEL_PATH configurados", async () => {
  limpiarEnv();
  process.env.TTS_ENABLED = "true";
  process.env.TTS_ENGINE = "piper";
  const resultado = await textToSpeech({ text: "Hola, Rodrigo. El sistema esta funcionando correctamente." });
  assert.equal(resultado.success, false);
  assert.equal(resultado.audioPath, null);
  assert.equal(resultado.engine, "piper");
  assert.match(resultado.error, /PIPER_EXECUTABLE/);
  limpiarEnv();
});

test("textToSpeech: proveedores futuros (openvoice/melotts) responden 'no implementado' sin instalar nada", async () => {
  limpiarEnv();
  process.env.TTS_ENABLED = "true";
  process.env.TTS_ENGINE = "openvoice";
  const resultado = await textToSpeech({ text: "Hola." });
  assert.equal(resultado.success, false);
  assert.match(resultado.error, /OpenVoice/);
  assert.match(resultado.error, /no.*implementado/);
  limpiarEnv();
});

test("textToSpeech: varias llamadas consecutivas con motor desactivado, ninguna revienta", async () => {
  limpiarEnv();
  const resultados = await Promise.all([
    textToSpeech({ text: "Primera." }),
    textToSpeech({ text: "Segunda." }),
    textToSpeech({ text: "Tercera." }),
  ]);
  for (const r of resultados) {
    assert.equal(r.success, false);
    assert.equal(typeof r.error, "string");
  }
  limpiarEnv();
});

// --- estadoVozLocal: separa habilitado/disponible/estado (Etapa 3) ---

test("estadoVozLocal: TTS_ENABLED sin definir -> deshabilitado, nunca toca el filesystem", async () => {
  limpiarEnv();
  const r = await estadoVozLocal();
  assert.deepEqual(r, { habilitada: false, disponible: false, estado: "deshabilitado" });
  limpiarEnv();
});

test("estadoVozLocal: motor distinto de piper -> habilitada pero no implementada", async () => {
  limpiarEnv();
  process.env.TTS_ENABLED = "true";
  process.env.TTS_ENGINE = "openvoice";
  const r = await estadoVozLocal();
  assert.equal(r.habilitada, true);
  assert.equal(r.disponible, false);
  assert.equal(r.estado, "motor_no_implementado");
  limpiarEnv();
});

test("estadoVozLocal: habilitada pero sin PIPER_EXECUTABLE configurado -> ejecutable_no_encontrado", async () => {
  limpiarEnv();
  process.env.TTS_ENABLED = "true";
  process.env.TTS_ENGINE = "piper";
  const r = await estadoVozLocal();
  assert.equal(r.habilitada, true);
  assert.equal(r.disponible, false);
  assert.equal(r.estado, "ejecutable_no_encontrado");
  limpiarEnv();
});

test("estadoVozLocal: TTS_ENABLED=true SOLO ya no alcanza para verse como disponible (el bug que se corrige acá)", async () => {
  limpiarEnv();
  process.env.TTS_ENABLED = "true";
  // A propósito: ni PIPER_EXECUTABLE ni PIPER_MODEL_PATH configurados,
  // que es exactamente la situación real de un deploy sin Piper instalado.
  const r = await estadoVozLocal();
  assert.equal(r.habilitada, true, "el motor SÍ está habilitado por configuración");
  assert.equal(r.disponible, false, "pero NO está realmente disponible/operativo");
  assert.notEqual(r.estado, "operativo");
  limpiarEnv();
});

test("estadoVozLocal: ejecutable y modelo presentes pero el modelo apunta a un archivo que no existe -> modelo_no_encontrado", async () => {
  limpiarEnv();
  const dir = await mkdtemp(path.join(tmpdir(), "medusa-piper-estado-"));
  const ejecutableFalso = path.join(dir, "piper-falso");
  await writeFile(ejecutableFalso, "x");
  process.env.TTS_ENABLED = "true";
  process.env.TTS_ENGINE = "piper";
  process.env.PIPER_EXECUTABLE = ejecutableFalso;
  process.env.PIPER_MODEL_PATH = path.join(dir, "no-existe.onnx");
  const r = await estadoVozLocal();
  assert.equal(r.estado, "modelo_no_encontrado");
  limpiarEnv();
});

test("estadoVozLocal: no expone rutas completas del servidor en la respuesta", async () => {
  limpiarEnv();
  process.env.TTS_ENABLED = "true";
  process.env.TTS_ENGINE = "piper";
  process.env.PIPER_EXECUTABLE = "/ruta/secreta/del/servidor/piper";
  const r = await estadoVozLocal();
  assert.equal(JSON.stringify(r).includes("/ruta/secreta"), false);
  limpiarEnv();
});

// --- Integracion real de extremo a extremo (solo si esta configurado) ---
const ejecutableReal = process.env.TEST_PIPER_EXECUTABLE;
const modeloReal = process.env.TEST_PIPER_MODEL_PATH;

test("textToSpeech: genera un audio real con Piper instalado (si esta configurado)", { skip: !ejecutableReal || !modeloReal }, async () => {
  limpiarEnv();
  process.env.TTS_ENABLED = "true";
  process.env.TTS_ENGINE = "piper";
  process.env.PIPER_EXECUTABLE = ejecutableReal;
  process.env.PIPER_MODEL_PATH = modeloReal;
  if (process.env.TEST_PIPER_CONFIG_PATH) process.env.PIPER_CONFIG_PATH = process.env.TEST_PIPER_CONFIG_PATH;

  const resultado = await textToSpeech({ text: "Hola, Rodrigo. El sistema esta funcionando correctamente.", voice: "es_AR" });
  assert.equal(resultado.success, true);
  assert.equal(resultado.engine, "piper");
  assert.equal(resultado.error, null);
  assert.ok(resultado.audioPath.endsWith(".wav"));

  const { stat } = await import("node:fs/promises");
  const info = await stat(resultado.audioPath);
  assert.ok(info.size > 44);
  limpiarEnv();
});

test("textToSpeech: texto largo (varios miles de caracteres) no revienta el modulo", { skip: !ejecutableReal || !modeloReal }, async () => {
  limpiarEnv();
  process.env.TTS_ENABLED = "true";
  process.env.TTS_ENGINE = "piper";
  process.env.PIPER_EXECUTABLE = ejecutableReal;
  process.env.PIPER_MODEL_PATH = modeloReal;
  if (process.env.TEST_PIPER_CONFIG_PATH) process.env.PIPER_CONFIG_PATH = process.env.TEST_PIPER_CONFIG_PATH;

  const textoLargo = "Esta es una oracion de prueba para un texto largo. ".repeat(80); // ~4000 caracteres
  const resultado = await textToSpeech({ text: textoLargo });
  assert.equal(resultado.success, true);
  limpiarEnv();
});
