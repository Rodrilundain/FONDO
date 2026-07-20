import { test } from "node:test";
import assert from "node:assert/strict";
import { verificarTurnstile } from "../src/turnstile.js";

test("verificarTurnstile: sin token, falla sin llamar a fetch", async () => {
  let seLlamo = false;
  const fetchImpl = async () => { seLlamo = true; return { json: async () => ({ success: true }) }; };
  const resultado = await verificarTurnstile({ token: "", secretKey: "secreto", fetchImpl });
  assert.equal(resultado.success, false);
  assert.equal(resultado.motivo, "falta_token");
  assert.equal(seLlamo, false);
});

test("verificarTurnstile: token valido segun Cloudflare -> success", async () => {
  let urlUsada, bodyUsado;
  const fetchImpl = async (url, opts) => {
    urlUsada = url;
    bodyUsado = opts.body;
    return { json: async () => ({ success: true, "error-codes": [] }) };
  };
  const resultado = await verificarTurnstile({ token: "token-del-widget", secretKey: "secreto-123", remoteIp: "1.2.3.4", fetchImpl });
  assert.equal(resultado.success, true);
  assert.equal(urlUsada, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.match(bodyUsado, /secret=secreto-123/);
  assert.match(bodyUsado, /response=token-del-widget/);
  assert.match(bodyUsado, /remoteip=1.2.3.4/);
});

test("verificarTurnstile: Cloudflare rechaza el token -> success false con error-codes", async () => {
  const fetchImpl = async () => ({ json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }) });
  const resultado = await verificarTurnstile({ token: "token-invalido", secretKey: "secreto", fetchImpl });
  assert.equal(resultado.success, false);
  assert.equal(resultado.motivo, "token_invalido");
  assert.deepEqual(resultado.erroresCloudflare, ["invalid-input-response"]);
});

test("verificarTurnstile: error de red se traduce en motivo claro, no en excepcion", async () => {
  const fetchImpl = async () => { throw new Error("network down"); };
  const resultado = await verificarTurnstile({ token: "x", secretKey: "y", fetchImpl });
  assert.equal(resultado.success, false);
  assert.equal(resultado.motivo, "error_de_red");
});

test("verificarTurnstile: respuesta no-JSON de Cloudflare no revienta el llamador", async () => {
  const fetchImpl = async () => ({ json: async () => { throw new Error("no es json"); } });
  const resultado = await verificarTurnstile({ token: "x", secretKey: "y", fetchImpl });
  assert.equal(resultado.success, false);
  assert.equal(resultado.motivo, "respuesta_invalida");
});
