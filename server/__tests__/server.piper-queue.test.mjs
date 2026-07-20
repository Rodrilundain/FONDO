// Prueba específica del Punto 7 de la auditoría v2: cuando la cola de
// síntesis de Piper está llena, POST /voice/piper responde 429 con un
// mensaje claro (antes caía en la rama genérica de 502, indistinguible
// de un fallo real de Piper). Archivo separado (proceso propio) porque
// TTS_ENABLED/PIPER_*/etc. se leen una sola vez al importar server.js.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.ALLOWED_ORIGIN = "";
process.env.TURNSTILE_ENABLED = "";
process.env.TTS_ENABLED = "true";
process.env.TTS_ENGINE = "piper";
process.env.PIPER_MAX_CONCURRENCIA = "1";
process.env.PIPER_MAX_EN_COLA = "1";

const dir = await mkdtemp(path.join(tmpdir(), "medusa-piper-queue-"));
const ejecutable = path.join(dir, "piper-lento.sh");
const modelo = path.join(dir, "modelo.onnx");
await writeFile(modelo, "x");
await writeFile(modelo + ".json", "{}");
// Deliberadamente lento (300ms) para que la solicitud siguiente todavía
// esté "en curso" cuando lleguen la 2da (a la cola) y la 3ra (rechazada).
await writeFile(ejecutable, `#!/bin/sh\nsleep 0.3\nprintf 'RIFF....WAVEfmt algo-de-contenido-de-mas-de-44-bytes-en-total' > "$6"\nexit 0\n`);
await chmod(ejecutable, 0o755);
process.env.PIPER_EXECUTABLE = ejecutable;
process.env.PIPER_MODEL_PATH = modelo;
process.env.PIPER_OUTPUT_DIRECTORY = path.join(dir, "salida");

const app = (await import("../server.js")).default;

let server, baseUrl;

before(() => new Promise((resolve) => {
  server = app.listen(0, "127.0.0.1", () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

after(() => new Promise((resolve) => server.close(() => resolve())));

function pedirVoz(texto) {
  return fetch(`${baseUrl}/voice/piper`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({ text: texto })
  });
}

test("cola de síntesis llena responde 429 con codigo cola_llena, no un 502 genérico", async () => {
  const [r1, r2, r3] = await Promise.all([
    pedirVoz("Primera solicitud, ocupa el único slot concurrente."),
    pedirVoz("Segunda solicitud, entra a la cola (tamaño 1)."),
    pedirVoz("Tercera solicitud, la cola ya está llena.")
  ]);

  const estados = [r1.status, r2.status, r3.status].sort();
  assert.deepEqual(estados, [200, 200, 429], "dos deberían completarse (una directa, una desde la cola) y una debería rechazarse por cola llena");

  const rechazada = [r1, r2, r3].find(r => r.status === 429);
  const cuerpo = await rechazada.json();
  assert.equal(cuerpo.codigo, "cola_llena");
  assert.match(cuerpo.error, /demasiadas solicitudes/i);
});
