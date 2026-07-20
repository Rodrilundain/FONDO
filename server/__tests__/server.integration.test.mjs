// Tests de integración de la app Express real (server.js), arrancada en
// un puerto efímero por test -- no usa supertest (para no sumar una
// dependencia nueva): pega pedidos HTTP reales con fetch() contra
// 127.0.0.1. global.fetch se sobreescribe ANTES de que la ruta lo llame,
// igual que en los tests del Worker, para no depender de red real (Groq,
// Turnstile) en estos tests.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.ALLOWED_ORIGIN = "";
process.env.TURNSTILE_ENABLED = "";
process.env.TURNSTILE_SECRET_KEY = "";

const app = (await import("../server.js")).default;

let server, baseUrl;
const fetchOriginal = global.fetch;

before(() => new Promise((resolve) => {
  server = app.listen(0, "127.0.0.1", () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

after(() => new Promise((resolve) => {
  global.fetch = fetchOriginal;
  server.close(() => resolve());
}));

beforeEach(() => {
  global.fetch = fetchOriginal;
});

test("CORS: origen permitido recibe Access-Control-Allow-Origin", async () => {
  const res = await fetch(`${baseUrl}/health`, { headers: { Origin: "http://localhost:3000" } });
  assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:3000");
});

test("CORS: origen no permitido es rechazado con 403", async () => {
  const res = await fetch(`${baseUrl}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://sitio-no-permitido.com" },
    body: JSON.stringify({ context: "doc", question: "hola" })
  });
  assert.equal(res.status, 403);
});

test("/health: forma esperada, sin exponer claves", async () => {
  const res = await fetch(`${baseUrl}/health`);
  const data = await res.json();
  assert.equal(data.status, "ok");
  assert.equal(typeof data.groqConfigurado, "boolean");
  assert.equal(typeof data.turnstileHabilitado, "boolean");
  assert.equal(JSON.stringify(data).includes(process.env.GROQ_API_KEY || "no-deberia-aparecer"), false);
});

test("/ask: validación rechaza pregunta faltante con 400", async () => {
  const res = await fetch(`${baseUrl}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({ context: "documento" })
  });
  assert.equal(res.status, 400);
});

test("/ask: validación rechaza documento faltante con 400", async () => {
  const res = await fetch(`${baseUrl}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({ question: "¿Qué dice el documento?" })
  });
  assert.equal(res.status, 400);
});

test("/ask: con Turnstile desactivado (default), un pedido válido llega hasta Groq sin pedir token", async () => {
  let seLlamoAGroq = false;
  // El propio test le pega al server local con fetch() (fetchOriginal);
  // solo se intercepta la llamada saliente del backend hacia Groq.
  global.fetch = async (url, opts) => {
    if (!String(url).includes("groq.com")) return fetchOriginal(url, opts);
    seLlamoAGroq = true;
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Respuesta de prueba." } }] })
    };
  };
  const res = await fetch(`${baseUrl}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({ context: "Documento de prueba.", question: "¿De qué trata?" })
  });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.reply, "Respuesta de prueba.");
  assert.equal(seLlamoAGroq, true);
});

test("/fetch-document: URL inválida se rechaza con 400 sin intentar descargar nada", async () => {
  const res = await fetch(`${baseUrl}/fetch-document`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({ url: "no-es-una-url" })
  });
  assert.equal(res.status, 400);
});

test("/fetch-document: bloquea SSRF hacia localhost de punta a punta a través de la ruta real", async () => {
  const res = await fetch(`${baseUrl}/fetch-document`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({ url: "http://127.0.0.1:9999/algo" })
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /no está permitida/);
});

test("/fetch-document: sigue una redirección hacia otro host público y descarga el contenido final", async () => {
  let llamadasSalientes = 0;
  global.fetch = async (url, opts) => {
    const destino = String(url);
    if (destino.startsWith(baseUrl)) return fetchOriginal(destino, opts);
    llamadasSalientes++;
    if (destino === "https://example.com/link-original") {
      return {
        status: 302,
        headers: { get: (h) => (h.toLowerCase() === "location" ? "https://example.com/destino-final" : null) }
      };
    }
    if (destino === "https://example.com/destino-final") {
      const cuerpo = new TextEncoder().encode("contenido de prueba");
      let entregado = false;
      return {
        status: 200,
        ok: true,
        headers: {
          get: (h) => {
            if (h.toLowerCase() === "content-length") return String(cuerpo.length);
            if (h.toLowerCase() === "content-type") return "text/plain";
            return null;
          }
        },
        body: {
          getReader: () => ({
            read: async () => {
              if (entregado) return { done: true, value: undefined };
              entregado = true;
              return { done: false, value: cuerpo };
            },
            cancel: async () => {}
          })
        }
      };
    }
    throw new Error(`URL inesperada en el mock: ${destino}`);
  };

  const res = await fetch(`${baseUrl}/fetch-document`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify({ url: "https://example.com/link-original" })
  });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "contenido de prueba");
  assert.equal(llamadasSalientes, 2, "debería haber pedido primero la URL original y después la de destino");
  assert.equal(res.headers.get("x-original-url"), "https://example.com/destino-final");
});
