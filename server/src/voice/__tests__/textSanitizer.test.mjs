import { test } from "node:test";
import assert from "node:assert/strict";
import { validarTexto, limpiarTextoParaSintesis, dividirEnBloques } from "../textSanitizer.js";

test("validarTexto: rechaza vacio, espacios, undefined, null y numeros", () => {
  assert.equal(validarTexto(""), false);
  assert.equal(validarTexto("   "), false);
  assert.equal(validarTexto(undefined), false);
  assert.equal(validarTexto(null), false);
  assert.equal(validarTexto(42), false);
});

test("validarTexto: acepta texto normal", () => {
  assert.equal(validarTexto("Hola, Rodrigo."), true);
});

test("limpiarTextoParaSintesis: conserva tildes, la letra ene con virgulilla y signos de apertura", () => {
  const entrada = "C\u00f3mo est\u00e1s, se\u00f1or. Qu\u00e9 bueno, \u00d1and\u00fa vive en A\u00f1atuya.";
  assert.equal(limpiarTextoParaSintesis(entrada), entrada);
});

test("limpiarTextoParaSintesis: colapsa espacios repetidos", () => {
  const entrada = "Hola    mundo.";
  assert.equal(limpiarTextoParaSintesis(entrada), "Hola mundo.");
});

test("limpiarTextoParaSintesis: quita caracteres de control invisibles", () => {
  const entrada = "Hola" + String.fromCharCode(1) + " mundo.";
  assert.equal(limpiarTextoParaSintesis(entrada), "Hola mundo.");
});

test("limpiarTextoParaSintesis: recorta espacios al principio/final", () => {
  assert.equal(limpiarTextoParaSintesis("   Hola.   "), "Hola.");
});

test("dividirEnBloques: texto corto queda en un solo bloque", () => {
  const bloques = dividirEnBloques("Hola, Rodrigo.", 500);
  assert.deepEqual(bloques, ["Hola, Rodrigo."]);
});

test("dividirEnBloques: texto largo se parte sin cortar oraciones a la mitad", () => {
  const oracion = "Esta es una oracion de prueba con bastante texto repetido. ";
  const texto = oracion.repeat(20);
  const bloques = dividirEnBloques(texto, 300);
  assert.ok(bloques.length > 1, "deberia partirse en mas de un bloque");
  for (const bloque of bloques) {
    assert.ok(!bloque.endsWith("oracion de prueba"), "no deberia cortar una oracion a la mitad: " + bloque.slice(-40));
  }
  for (const bloque of bloques) assert.ok(bloque.length <= 300 + oracion.length);
});
