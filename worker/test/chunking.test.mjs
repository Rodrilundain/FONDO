import { test } from "node:test";
import assert from "node:assert/strict";
import { estimarTamano, necesitaDivision, dividirEnFragmentos } from "../src/chunking.js";

test("estimarTamano cuenta caracteres y palabras aproximadas", () => {
  const r = estimarTamano("Hola mundo, esto es una prueba.");
  assert.equal(r.caracteres, 31);
  assert.equal(r.palabrasAprox, 6);
});

test("necesitaDivision: false si el texto entra en un chunk", () => {
  assert.equal(necesitaDivision("corto", 6000), false);
  assert.equal(necesitaDivision("x".repeat(7000), 6000), true);
});

test("dividirEnFragmentos sin bloques: no corta palabras", () => {
  const oracion = "Esta es una oracion de prueba con bastante texto repetido. ";
  const texto = oracion.repeat(50);
  const fragmentos = dividirEnFragmentos(texto, { chunkSize: 500, chunkOverlap: 0 });
  assert.ok(fragmentos.length > 1);
  for (const f of fragmentos) {
    assert.ok(!/[a-z]-$/.test(f.texto.trim()), "no deberia terminar cortando una palabra");
  }
});

test("dividirEnFragmentos con overlap: el fragmento siguiente incluye la cola del anterior", () => {
  const oracion = "Palabra numero UNO. Palabra numero DOS. Palabra numero TRES. ";
  const texto = oracion.repeat(20);
  const sinOverlap = dividirEnFragmentos(texto, { chunkSize: 200, chunkOverlap: 0 });
  const conOverlap = dividirEnFragmentos(texto, { chunkSize: 200, chunkOverlap: 40 });
  assert.ok(conOverlap[1].texto.length > sinOverlap[1].texto.length, "el fragmento con overlap debe ser mas largo que el mismo fragmento sin overlap");
});

test("dividirEnFragmentos con bloques de pagina (PDF): conserva la referencia de pagina y no mezcla paginas distintas en el mismo fragmento base", () => {
  const bloques = [
    { pagina: 1, texto: "Contenido de la primera pagina, con bastante texto para que sea representativo del caso real." },
    { pagina: 2, texto: "Contenido de la segunda pagina, completamente distinto al de la primera pagina del documento." },
  ];
  const fragmentos = dividirEnFragmentos(bloques.map(b => b.texto).join("\n"), { chunkSize: 5000, chunkOverlap: 0, bloques });
  assert.equal(fragmentos.length, 2);
  assert.equal(fragmentos[0].referencia, "Página 1");
  assert.equal(fragmentos[1].referencia, "Página 2");
  assert.ok(fragmentos[0].texto.includes("primera pagina"));
  assert.ok(!fragmentos[0].texto.includes("segunda pagina"), "no deberia mezclar contenido de una pagina con el de otra en el mismo fragmento base");
});

test("dividirEnFragmentos con bloques de titulo (DOCX): usa el titulo como referencia", () => {
  const bloques = [
    { tipo: "titulo", texto: "Introduccion" },
    { tipo: "parrafo", texto: "Texto de la introduccion con contenido variado sobre el tema principal del documento." },
    { tipo: "titulo", texto: "Conclusion" },
    { tipo: "parrafo", texto: "Texto de la conclusion, resumiendo lo visto anteriormente en el documento completo." },
  ];
  const fragmentos = dividirEnFragmentos(bloques.map(b => b.texto).join("\n"), { chunkSize: 5000, chunkOverlap: 0, bloques });
  assert.equal(fragmentos.length, 4);
  assert.equal(fragmentos[0].referencia, "Introduccion");
  assert.equal(fragmentos[2].referencia, "Conclusion");
});

test("dividirEnFragmentos: documento vacio devuelve []", () => {
  assert.deepEqual(dividirEnFragmentos("", {}), []);
});
