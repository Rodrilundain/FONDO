import { test } from "node:test";
import assert from "node:assert/strict";
import { crearLimitadorConcurrencia, ColaLlenaError } from "../concurrencyLimiter.js";

function tareaControlada() {
  let resolverExterno;
  const promesa = new Promise((resolve) => { resolverExterno = resolve; });
  return { tarea: () => promesa, resolver: resolverExterno };
}

test("crearLimitadorConcurrencia: corre hasta maxConcurrentes en paralelo, no más", async () => {
  const ejecutar = crearLimitadorConcurrencia({ maxConcurrentes: 2, maxEnCola: 10 });
  let enCursoAhora = 0;
  let picoMaximo = 0;

  const tarea = () => new Promise((resolve) => {
    enCursoAhora++;
    picoMaximo = Math.max(picoMaximo, enCursoAhora);
    setTimeout(() => { enCursoAhora--; resolve("ok"); }, 20);
  });

  await Promise.all([ejecutar(tarea), ejecutar(tarea), ejecutar(tarea), ejecutar(tarea), ejecutar(tarea)]);
  assert.equal(picoMaximo <= 2, true, `nunca deberían correr más de 2 a la vez, pico observado: ${picoMaximo}`);
});

test("crearLimitadorConcurrencia: encolados corren después, en orden, cuando se libera un lugar", async () => {
  const ejecutar = crearLimitadorConcurrencia({ maxConcurrentes: 1, maxEnCola: 5 });
  const orden = [];
  const a = tareaControlada();
  const b = tareaControlada();

  const pA = ejecutar(a.tarea).then(() => orden.push("A"));
  const pB = ejecutar(b.tarea).then(() => orden.push("B")); // encolada: maxConcurrentes=1

  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(orden, [], "todavía ninguna terminó");

  a.resolver();
  await pA;
  b.resolver();
  await pB;
  assert.deepEqual(orden, ["A", "B"]);
});

test("crearLimitadorConcurrencia: rechaza con ColaLlenaError cuando la cola está al máximo", async () => {
  const ejecutar = crearLimitadorConcurrencia({ maxConcurrentes: 1, maxEnCola: 1 });
  const ocupando = tareaControlada();
  const enCola = tareaControlada();

  const pOcupando = ejecutar(ocupando.tarea); // toma el único lugar concurrente
  const pEnCola = ejecutar(enCola.tarea); // llena la cola (maxEnCola=1)

  await assert.rejects(() => ejecutar(() => Promise.resolve()), ColaLlenaError);

  ocupando.resolver();
  await pOcupando;
  enCola.resolver();
  await pEnCola;
});

test("crearLimitadorConcurrencia: un rechazo en una tarea no bloquea a las siguientes en la cola", async () => {
  const ejecutar = crearLimitadorConcurrencia({ maxConcurrentes: 1, maxEnCola: 5 });
  const primera = ejecutar(() => Promise.reject(new Error("falló la primera")));
  const segunda = ejecutar(() => Promise.resolve("segunda ok"));

  await assert.rejects(() => primera, /falló la primera/);
  assert.equal(await segunda, "segunda ok");
});
