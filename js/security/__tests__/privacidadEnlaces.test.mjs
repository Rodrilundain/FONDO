import { test } from "node:test";
import assert from "node:assert/strict";
import mod from "../privacidadEnlaces.js";

const { urlPareceSensible, decidirUsoDeProxies, dominioDeUrl, tipoEstimadoDeUrl, resumirUrl } = mod;

test("urlPareceSensible: URL normal, sin nada raro, no es sensible", () => {
  assert.equal(urlPareceSensible("https://ejemplo.com/documento.pdf"), false);
});

test("urlPareceSensible: bloquea URLs con token en la query", () => {
  assert.equal(urlPareceSensible("https://ejemplo.com/doc?token=abc123"), true);
});

test("urlPareceSensible: bloquea firmas prefirmadas de S3/GCS (X-Amz-Signature / X-Goog-Signature)", () => {
  assert.equal(urlPareceSensible("https://bucket.s3.amazonaws.com/doc.pdf?X-Amz-Signature=abc&X-Amz-Expires=3600"), true);
  assert.equal(urlPareceSensible("https://storage.googleapis.com/doc.pdf?X-Goog-Signature=abc"), true);
});

test("urlPareceSensible: bloquea URLs con usuario:contraseña embebidos", () => {
  assert.equal(urlPareceSensible("https://usuario:secreto@ejemplo.com/doc.pdf"), true);
});

test("urlPareceSensible: bloquea ?key= suelto sin bloquear palabras que solo contienen 'key'", () => {
  assert.equal(urlPareceSensible("https://maps.example.com/doc?key=AIzaXYZ"), true);
  assert.equal(urlPareceSensible("https://ejemplo.com/doc?keyword=hola"), false);
});

test("urlPareceSensible: bloquea tokens en el fragmento (#access_token=..., típico de OAuth implícito)", () => {
  assert.equal(urlPareceSensible("https://ejemplo.com/doc#access_token=abc123&expires_in=3600"), true);
});

test("urlPareceSensible: bloquea un JWT suelto en la URL", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123def456";
  assert.equal(urlPareceSensible(`https://ejemplo.com/doc?data=${jwt}`), true);
});

test("urlPareceSensible: bloquea hosts locales/privados (127.0.0.1, localhost, 10.x, 192.168.x, .local, IPv6 ULA/link-local)", () => {
  for (const url of [
    "http://127.0.0.1/doc.pdf",
    "http://localhost:8080/doc.pdf",
    "http://10.0.0.5/doc.pdf",
    "http://172.16.0.5/doc.pdf",
    "http://192.168.1.5/doc.pdf",
    "http://169.254.169.254/doc.pdf",
    "http://miequipo.local/doc.pdf",
    "http://[::1]/doc.pdf",
    "http://[fe80::1]/doc.pdf",
    "http://[fc00::1]/doc.pdf"
  ]) {
    assert.equal(urlPareceSensible(url), true, url);
  }
});

test("urlPareceSensible: NO bloquea un host público que solo se parece a un rango privado (ej. 172.32.x, fuera del rango 172.16-31)", () => {
  assert.equal(urlPareceSensible("http://172.32.0.5/doc.pdf"), false);
});

test("urlPareceSensible: bloquea URLs excesivamente largas", () => {
  const url = "https://ejemplo.com/doc?relleno=" + "a".repeat(2100);
  assert.equal(urlPareceSensible(url), true);
});

test("urlPareceSensible: una URL inválida no rompe, devuelve false", () => {
  assert.equal(urlPareceSensible("no-es-una-url"), false);
});

test("decidirUsoDeProxies: proxies deshabilitados -> false, sin llegar a preguntar", () => {
  let sePregunto = false;
  const resultado = decidirUsoDeProxies({
    url: "https://ejemplo.com/doc.pdf",
    proxiesDeshabilitados: true,
    confirmarConUsuario: () => { sePregunto = true; return true; }
  });
  assert.equal(resultado, false);
  assert.equal(sePregunto, false);
});

test("decidirUsoDeProxies: URL sensible (token) -> false, sin llegar a preguntar", () => {
  let sePregunto = false;
  const resultado = decidirUsoDeProxies({
    url: "https://ejemplo.com/doc.pdf?token=abc",
    proxiesDeshabilitados: false,
    confirmarConUsuario: () => { sePregunto = true; return true; }
  });
  assert.equal(resultado, false);
  assert.equal(sePregunto, false);
});

test("decidirUsoDeProxies: usuario confirma -> true", () => {
  const resultado = decidirUsoDeProxies({
    url: "https://ejemplo.com/doc.pdf",
    proxiesDeshabilitados: false,
    confirmarConUsuario: () => true
  });
  assert.equal(resultado, true);
});

test("decidirUsoDeProxies: usuario cancela -> false", () => {
  const resultado = decidirUsoDeProxies({
    url: "https://ejemplo.com/doc.pdf",
    proxiesDeshabilitados: false,
    confirmarConUsuario: () => false
  });
  assert.equal(resultado, false);
});

test("dominioDeUrl: devuelve el hostname", () => {
  assert.equal(dominioDeUrl("https://ejemplo.com:8080/a/b?x=1"), "ejemplo.com");
});

test("dominioDeUrl: URL inválida no rompe", () => {
  assert.equal(dominioDeUrl("no-es-una-url"), "(enlace no válido)");
});

test("tipoEstimadoDeUrl: detecta por extensión", () => {
  assert.equal(tipoEstimadoDeUrl("https://ejemplo.com/doc.pdf"), "PDF");
  assert.equal(tipoEstimadoDeUrl("https://ejemplo.com/doc.docx"), "Word (DOCX)");
  assert.equal(tipoEstimadoDeUrl("https://ejemplo.com/doc.txt"), "texto plano");
  assert.equal(tipoEstimadoDeUrl("https://ejemplo.com/doc.md"), "Markdown");
  assert.match(tipoEstimadoDeUrl("https://ejemplo.com/pagina"), /desconocido/);
});

test("resumirUrl: no toca URLs cortas", () => {
  const url = "https://ejemplo.com/doc.pdf";
  assert.equal(resumirUrl(url), url);
});

test("resumirUrl: recorta URLs largas conservando principio y final", () => {
  const url = "https://ejemplo.com/" + "a".repeat(200) + "/doc.pdf";
  const resumen = resumirUrl(url, 90);
  assert.ok(resumen.length <= 91);
  assert.ok(resumen.startsWith("https://ejemplo.com/"));
  assert.ok(resumen.includes("…"));
});
