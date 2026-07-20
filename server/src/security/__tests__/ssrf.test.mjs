import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ipEsPrivadaOReservada,
  validarUrlSsrf,
  descargarConProteccionSsrf,
  SsrfBlockedError
} from "../ssrf.js";

test("ipEsPrivadaOReservada: rangos IPv4 privados/reservados bloqueados", () => {
  for (const ip of [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255",
    "192.168.1.1", "169.254.1.1", "0.0.0.0", "224.0.0.1", "255.255.255.255"
  ]) {
    assert.equal(ipEsPrivadaOReservada(ip), true, ip);
  }
});

test("ipEsPrivadaOReservada: IPs públicas permitidas", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.0.1", "172.32.0.1"]) {
    assert.equal(ipEsPrivadaOReservada(ip), false, ip);
  }
});

test("ipEsPrivadaOReservada: IPv6 loopback/link-local/ULA bloqueados", () => {
  for (const ip of ["::1", "fe80::1", "fc00::1", "fd12:3456::1"]) {
    assert.equal(ipEsPrivadaOReservada(ip), true, ip);
  }
});

test("ipEsPrivadaOReservada: IPv4 encapsulada en IPv6 bloqueada", () => {
  assert.equal(ipEsPrivadaOReservada("::ffff:127.0.0.1"), true);
  assert.equal(ipEsPrivadaOReservada("::ffff:10.0.0.5"), true);
  assert.equal(ipEsPrivadaOReservada("::ffff:8.8.8.8"), false);
});

test("ipEsPrivadaOReservada: IPv6 pública permitida", () => {
  assert.equal(ipEsPrivadaOReservada("2606:4700:4700::1111"), false);
});

test("validarUrlSsrf: rechaza protocolos que no son http/https", async () => {
  await assert.rejects(
    () => validarUrlSsrf(new URL("ftp://ejemplo.com/archivo")),
    SsrfBlockedError
  );
});

test("validarUrlSsrf: rechaza hostname localhost sin ir a DNS", async () => {
  let resolverLlamado = false;
  await assert.rejects(
    () => validarUrlSsrf(new URL("http://localhost:1234/"), {
      resolver: async () => { resolverLlamado = true; return [{ address: "8.8.8.8" }]; }
    }),
    SsrfBlockedError
  );
  assert.equal(resolverLlamado, false);
});

test("validarUrlSsrf: rechaza si CUALQUIERA de las IPs resueltas es privada, no solo la primera", async () => {
  const resolver = async () => [{ address: "8.8.8.8" }, { address: "192.168.1.1" }];
  await assert.rejects(
    () => validarUrlSsrf(new URL("https://ejemplo.com/"), { resolver }),
    SsrfBlockedError
  );
});

test("validarUrlSsrf: permite cuando todas las IPs resueltas son públicas", async () => {
  const resolver = async () => [{ address: "8.8.8.8" }, { address: "1.1.1.1" }];
  await assert.doesNotReject(() => validarUrlSsrf(new URL("https://ejemplo.com/"), { resolver }));
});

test("validarUrlSsrf: falla de DNS se traduce en SsrfBlockedError, no en excepción cruda", async () => {
  const resolver = async () => { throw new Error("ENOTFOUND"); };
  await assert.rejects(
    () => validarUrlSsrf(new URL("https://no-existe.invalido/"), { resolver }),
    SsrfBlockedError
  );
});

// --- descargarConProteccionSsrf: redirecciones ---

function mockResponse(status, { location, ok } = {}) {
  return {
    status,
    ok: ok ?? (status >= 200 && status < 300),
    headers: { get: (h) => (h.toLowerCase() === "location" ? location ?? null : null) }
  };
}

test("descargarConProteccionSsrf: sigue una redirección pública válida y revalida destino", async () => {
  const resolver = async () => [{ address: "8.8.8.8" }];
  let llamadas = 0;
  const fetchImpl = async (url) => {
    llamadas++;
    if (llamadas === 1) return mockResponse(302, { location: "https://destino-publico.com/doc.pdf" });
    return mockResponse(200);
  };
  const { finalUrl } = await descargarConProteccionSsrf("https://origen-publico.com/link", { fetchImpl, resolver });
  assert.equal(finalUrl, "https://destino-publico.com/doc.pdf");
  assert.equal(llamadas, 2);
});

test("descargarConProteccionSsrf: BLOQUEA una redirección hacia una IP privada", async () => {
  const resolver = async (hostname) => {
    if (hostname === "interno.local") return [{ address: "10.0.0.5" }];
    return [{ address: "8.8.8.8" }];
  };
  const fetchImpl = async () => mockResponse(302, { location: "http://interno.local/admin" });
  await assert.rejects(
    () => descargarConProteccionSsrf("https://publico.com/redirige", { fetchImpl, resolver }),
    SsrfBlockedError
  );
});

test("descargarConProteccionSsrf: BLOQUEA redirección disfrazada con IP literal privada", async () => {
  const resolver = async () => [{ address: "8.8.8.8" }];
  const fetchImpl = async () => mockResponse(302, { location: "http://127.0.0.1:6379/" });
  await assert.rejects(
    () => descargarConProteccionSsrf("https://publico.com/redirige", { fetchImpl, resolver }),
    SsrfBlockedError
  );
});

test("descargarConProteccionSsrf: respeta el máximo de redirecciones (3)", async () => {
  const resolver = async () => [{ address: "8.8.8.8" }];
  let llamadas = 0;
  const fetchImpl = async () => {
    llamadas++;
    return mockResponse(302, { location: `https://salto${llamadas}.com/` });
  };
  await assert.rejects(
    () => descargarConProteccionSsrf("https://inicio.com/", { fetchImpl, resolver, maxRedirects: 3 }),
    SsrfBlockedError
  );
  // 1 pedido inicial + 3 redirecciones seguidas = 4 fetch antes de rendirse
  assert.equal(llamadas, 4);
});

test("descargarConProteccionSsrf: redirección sin cabecera Location falla con error claro", async () => {
  const resolver = async () => [{ address: "8.8.8.8" }];
  const fetchImpl = async () => mockResponse(302, { location: null });
  await assert.rejects(
    () => descargarConProteccionSsrf("https://inicio.com/", { fetchImpl, resolver }),
    SsrfBlockedError
  );
});
