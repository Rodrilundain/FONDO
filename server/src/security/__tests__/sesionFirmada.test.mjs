import { test } from "node:test";
import assert from "node:assert/strict";
import { generarSesionFirmada, verificarSesionFirmada, firmarValorSesion } from "../sesionFirmada.js";

test("generarSesionFirmada + verificarSesionFirmada: un token propio siempre valida contra el mismo secreto", () => {
  const secreto = "secreto-de-prueba";
  const token = generarSesionFirmada(secreto);
  const valor = verificarSesionFirmada(token, secreto);
  assert.equal(typeof valor, "string");
  assert.ok(valor.length > 0);
});

test("verificarSesionFirmada: rechaza un token firmado con OTRO secreto", () => {
  const token = generarSesionFirmada("secreto-A");
  assert.equal(verificarSesionFirmada(token, "secreto-B"), null);
});

test("verificarSesionFirmada: rechaza un token inventado sin pasar por generarSesionFirmada", () => {
  assert.equal(verificarSesionFirmada("valor-cualquiera.firma-inventada", "secreto"), null);
});

test("verificarSesionFirmada: rechaza valores sin punto, vacíos, undefined o de otro tipo", () => {
  for (const v of ["", "sin-punto-ni-firma", null, undefined, 12345, {}]) {
    assert.equal(verificarSesionFirmada(v, "secreto"), null, JSON.stringify(v));
  }
});

test("verificarSesionFirmada: si alguien altera el valor (mismo largo de firma), la firma ya no coincide", () => {
  const secreto = "secreto";
  const token = generarSesionFirmada(secreto);
  const [valor, firma] = token.split(".");
  const valorAlterado = valor.slice(0, -1) + (valor.slice(-1) === "a" ? "b" : "a");
  assert.equal(verificarSesionFirmada(`${valorAlterado}.${firma}`, secreto), null);
});

test("firmarValorSesion: es determinístico para el mismo valor+secreto", () => {
  assert.equal(firmarValorSesion("x", "s"), firmarValorSesion("x", "s"));
  assert.notEqual(firmarValorSesion("x", "s1"), firmarValorSesion("x", "s2"));
});

test("generarSesionFirmada: dos llamadas producen valores distintos (aleatorio real, no fijo)", () => {
  const secreto = "secreto";
  const a = generarSesionFirmada(secreto);
  const b = generarSesionFirmada(secreto);
  assert.notEqual(a, b);
});
