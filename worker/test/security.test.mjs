import { test } from "node:test";
import assert from "node:assert/strict";
import {
  origenPermitido, encabezadosCORS, listaOrigenesPermitidos,
  ipDelPedido, claveLimite, dentroDelLimite, verificarLimite, reiniciarLimitador
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

test("claveLimite: usa el ID de sesion del header cuando tiene forma valida", () => {
  const req = { headers: new Map([
    ["X-Medusa-Session-Id", "a1b2c3d4-e5f6-4789-a012-3456789abcde"],
    ["CF-Connecting-IP", "9.9.9.9"]
  ]) };
  req.headers.get = req.headers.get.bind(req.headers);
  assert.equal(claveLimite(req), "session:a1b2c3d4-e5f6-4789-a012-3456789abcde");
});

test("claveLimite: cae a la IP si no hay ID de sesion o tiene forma invalida", () => {
  const sinSesion = { headers: new Map([["CF-Connecting-IP", "9.9.9.9"]]) };
  sinSesion.headers.get = sinSesion.headers.get.bind(sinSesion.headers);
  assert.equal(claveLimite(sinSesion), "ip:9.9.9.9");

  const sesionRara = { headers: new Map([
    ["X-Medusa-Session-Id", "<script>alert(1)</script>"],
    ["CF-Connecting-IP", "9.9.9.9"]
  ]) };
  sesionRara.headers.get = sesionRara.headers.get.bind(sesionRara.headers);
  assert.equal(claveLimite(sesionRara), "ip:9.9.9.9");
});

test("verificarLimite: sin binding, usa el respaldo en memoria", async () => {
  reiniciarLimitador();
  const clave = "ip:respaldo-test";
  for (let i = 0; i < 3; i++) {
    assert.equal(await verificarLimite({ key: clave, maxPorMinuto: 3, binding: undefined }), true);
  }
  assert.equal(await verificarLimite({ key: clave, maxPorMinuto: 3, binding: undefined }), false);
});

test("verificarLimite: con binding, delega en binding.limit() y respeta su resultado", async () => {
  const binding = { limit: async ({ key }) => ({ success: key === "permitido" }) };
  assert.equal(await verificarLimite({ key: "permitido", maxPorMinuto: 1, binding }), true);
  assert.equal(await verificarLimite({ key: "denegado", maxPorMinuto: 1, binding }), false);
});

test("verificarLimite: si el binding tira una excepcion, cae al respaldo en memoria en vez de fallar abierto", async () => {
  reiniciarLimitador();
  const bindingRoto = { limit: async () => { throw new Error("binding caido"); } };
  const clave = "ip:binding-roto-test";
  // El respaldo en memoria permite 1 pedido y rechaza el segundo.
  assert.equal(await verificarLimite({ key: clave, maxPorMinuto: 1, binding: bindingRoto }), true);
  assert.equal(await verificarLimite({ key: clave, maxPorMinuto: 1, binding: bindingRoto }), false);
});
