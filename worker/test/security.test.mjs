import { test } from "node:test";
import assert from "node:assert/strict";
import {
  origenPermitido, encabezadosCORS, listaOrigenesPermitidos,
  ipDelPedido, dentroDelLimite, reiniciarLimitador
} from "../src/security.js";

test("origenPermitido: acepta solo origenes en la lista, rechaza sin Origin", () => {
  const permitidos = ["https://rodrilundain.github.io"];
  assert.equal(origenPermitido("https://rodrilundain.github.io", permitidos), true);
  assert.equal(origenPermitido("https://otro-sitio.com", permitidos), false);
  assert.equal(origenPermitido("", permitidos), false);
  assert.equal(origenPermitido(null, permitidos), false);
});

test("encabezadosCORS: vacio para origen no permitido, headers completos para uno permitido", () => {
  const permitidos = ["https://rodrilundain.github.io"];
  assert.deepEqual(encabezadosCORS("https://otro-sitio.com", permitidos), {});
  const headers = encabezadosCORS("https://rodrilundain.github.io", permitidos);
  assert.equal(headers["Access-Control-Allow-Origin"], "https://rodrilundain.github.io");
  assert.equal(headers["Vary"], "Origin");
});

test("listaOrigenesPermitidos: parsea CSV de ALLOWED_ORIGIN, ignora vacios", () => {
  const r = listaOrigenesPermitidos({ ALLOWED_ORIGIN: " https://a.com, https://b.com ,, " });
  assert.deepEqual(r, ["https://a.com", "https://b.com"]);
});

test("listaOrigenesPermitidos: sin ALLOWED_ORIGIN devuelve []", () => {
  assert.deepEqual(listaOrigenesPermitidos({}), []);
});

test("ipDelPedido: usa CF-Connecting-IP", () => {
  const req = { headers: new Map([["CF-Connecting-IP", "1.2.3.4"]]) };
  req.headers.get = req.headers.get.bind(req.headers);
  assert.equal(ipDelPedido(req), "1.2.3.4");
});

test("dentroDelLimite: permite hasta el maximo por minuto, rechaza el siguiente", () => {
  reiniciarLimitador();
  const ip = "9.9.9.9";
  for (let i = 0; i < 5; i++) assert.equal(dentroDelLimite(ip, 5), true, `pedido ${i + 1} deberia pasar`);
  assert.equal(dentroDelLimite(ip, 5), false, "el 6to pedido en el mismo minuto deberia rechazarse");
});

test("dentroDelLimite: IPs distintas no comparten contador", () => {
  reiniciarLimitador();
  assert.equal(dentroDelLimite("1.1.1.1", 1), true);
  assert.equal(dentroDelLimite("2.2.2.2", 1), true);
  assert.equal(dentroDelLimite("1.1.1.1", 1), false);
});
