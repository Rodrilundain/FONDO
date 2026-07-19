import { test } from "node:test";
import assert from "node:assert/strict";
import { validarTexto, validarTarea, validarBloques, validarOptions } from "../src/validation.js";

test("validarTexto: rechaza vacio, no-string, y texto demasiado largo", () => {
  assert.equal(validarTexto("", 100).valido, false);
  assert.equal(validarTexto("   ", 100).valido, false);
  assert.equal(validarTexto(42, 100).valido, false);
  assert.equal(validarTexto("x".repeat(101), 100).valido, false);
});

test("validarTexto: acepta texto normal dentro del limite", () => {
  assert.equal(validarTexto("Hola mundo", 100).valido, true);
});

test("validarTarea: solo acepta las 10 tareas conocidas", () => {
  assert.equal(validarTarea("summary"), true);
  assert.equal(validarTarea("qa"), true);
  assert.equal(validarTarea("tarea-inventada"), false);
  assert.equal(validarTarea(undefined), false);
});

test("validarBloques: acepta undefined/null (opcional)", () => {
  assert.equal(validarBloques(undefined).valido, true);
  assert.equal(validarBloques(null).valido, true);
});

test("validarBloques: rechaza forma invalida", () => {
  assert.equal(validarBloques("no es un array").valido, false);
  assert.equal(validarBloques([{ sinTexto: true }]).valido, false);
  assert.equal(validarBloques(Array.from({ length: 6000 }, () => ({ texto: "x" }))).valido, false);
});

test("validarBloques: acepta forma correcta", () => {
  assert.equal(validarBloques([{ pagina: 1, texto: "hola" }]).valido, true);
});

test("validarOptions: limpia y acota campos conocidos, ignora el resto", () => {
  const r = validarOptions({ language: "es", detail: "long", question: "x".repeat(3000), count: 999, campoRaro: "<script>" });
  assert.equal(r.valido, true);
  assert.equal(r.options.language, "es");
  assert.equal(r.options.question.length, 2000);
  assert.equal(r.options.count, 30);
  assert.equal(r.options.campoRaro, undefined);
});
