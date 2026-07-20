import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ipEsPrivadaOReservada,
  validarUrlSsrf,
  validarDestinoSeguro,
  descargarConProteccionSsrf,
  SsrfBlockedError
} from "../ssrf.js";

test("validarDestinoSeguro es el mismo export que validarUrlSsrf (alias)", () => {
  assert.equal(validarDestinoSeguro, validarUrlSsrf);
});

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

test("descargarConProteccionSsrf: dos redirecciones válidas en cadena terminan descargando el destino final", async () => {
  const resolver = async () => [{ address: "8.8.8.8" }];
  let llamadas = 0;
  const fetchImpl = async () => {
    llamadas++;
    if (llamadas === 1) return mockResponse(302, { location: "https://paso-2.com/" });
    if (llamadas === 2) return mockResponse(302, { location: "https://destino-final.com/doc.pdf" });
    return mockResponse(200);
  };
  const { finalUrl } = await descargarConProteccionSsrf("https://paso-1.com/", { fetchImpl, resolver, maxRedirects: 3 });
  assert.equal(finalUrl, "https://destino-final.com/doc.pdf");
  assert.equal(llamadas, 3);
});

test("descargarConProteccionSsrf: usa timeoutMs pasándolo a cada fetch como AbortSignal", async () => {
  const resolver = async () => [{ address: "8.8.8.8" }];
  let signalRecibido;
  const fetchImpl = async (url, opts) => { signalRecibido = opts.signal; return mockResponse(200); };
  await descargarConProteccionSsrf("https://x.test/", { fetchImpl, resolver, timeoutMs: 1234 });
  assert.ok(signalRecibido instanceof AbortSignal);
});

test("descargarConProteccionSsrf: redirección hacia un protocolo no HTTP se bloquea", async () => {
  const resolver = async () => [{ address: "8.8.8.8" }];
  const fetchImpl = async () => mockResponse(302, { location: "file:///etc/passwd" });
  await assert.rejects(
    () => descargarConProteccionSsrf("https://publico.com/redirige", { fetchImpl, resolver }),
    SsrfBlockedError
  );
});

// --- Casos puntuales pedidos explícitamente en la auditoría v2 ---

test("validarDestinoSeguro: rechaza credenciales en la URL (user:pass@host)", async () => {
  const resolver = async () => [{ address: "8.8.8.8" }];
  await assert.rejects(
    () => validarDestinoSeguro(new URL("https://usuario:clave@ejemplo.com/doc.pdf"), { resolver }),
    SsrfBlockedError
  );
});

test("validarDestinoSeguro: rechaza dominios que terminan en .local", async () => {
  const resolver = async () => [{ address: "8.8.8.8" }]; // aunque resuelva a una IP pública
  await assert.rejects(
    () => validarDestinoSeguro(new URL("http://impresora.local/archivo"), { resolver }),
    SsrfBlockedError
  );
  await assert.rejects(
    () => validarDestinoSeguro(new URL("http://impresora.LOCAL./archivo"), { resolver }), // con punto final y mayúsculas
    SsrfBlockedError
  );
});

test("validarDestinoSeguro: 169.254.169.254 (metadata de nube) bloqueada", async () => {
  const resolver = async () => [{ address: "169.254.169.254" }];
  await assert.rejects(
    () => validarDestinoSeguro(new URL("http://metadata.ejemplo.com/latest/meta-data/"), { resolver }),
    SsrfBlockedError
  );
});

test("validarDestinoSeguro: 10.0.0.1 y 172.16.0.1 y 192.168.0.1 bloqueadas como hostname literal", async () => {
  for (const host of ["10.0.0.1", "172.16.0.1", "192.168.0.1"]) {
    await assert.rejects(
      () => validarDestinoSeguro(new URL(`http://${host}/`), { resolver: async () => [{ address: host }] }),
      SsrfBlockedError,
      host
    );
  }
});

test("validarDestinoSeguro: formatos alternativos de IPv4 (decimal/hex/octal/forma corta) se normalizan y bloquean", async () => {
  // Node normaliza estas 4 formas a "127.0.0.1" ya dentro de new URL()
  // (comportamiento real del parser WHATWG, no una suposición -- verificado
  // en este mismo entorno con "node -e" antes de escribir este test).
  for (const url of ["http://2130706433/", "http://0x7f000001/", "http://0177.0.0.1/", "http://127.1/"]) {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, "127.0.0.1", `${url} debería normalizarse a 127.0.0.1`);
    await assert.rejects(
      () => validarDestinoSeguro(parsed, { resolver: async () => [{ address: "127.0.0.1" }] }),
      SsrfBlockedError,
      url
    );
  }
});

test("validarDestinoSeguro: IPv6 literal en la URL se valida directo, sin ir a DNS", async () => {
  let resolverLlamado = false;
  const resolver = async () => { resolverLlamado = true; return [{ address: "8.8.8.8" }]; };
  for (const url of ["http://[::1]/", "http://[fe80::1]/", "http://[fc00::1]/", "http://[::ffff:127.0.0.1]/"]) {
    await assert.rejects(() => validarDestinoSeguro(new URL(url), { resolver }), SsrfBlockedError, url);
  }
  assert.equal(resolverLlamado, false, "un literal IPv6 no necesita resolver DNS, ya es una IP");
});

test("validarDestinoSeguro: IPv6 literal PÚBLICA no se bloquea por error (antes fallaba por accidente)", async () => {
  await assert.doesNotReject(() => validarDestinoSeguro(new URL("http://[2606:4700:4700::1111]/"), {
    resolver: async () => { throw new Error("no debería llamarse"); }
  }));
});
