// Límite adicional por cantidad de caracteres procesados (Etapa 3 /
// Punto 3 de la auditoría v2): además de "no más de N pedidos por
// minuto", esto evita que un pedido válido de por sí (pasa el límite de
// solicitudes) mande igual textos enormes uno atrás del otro. Ventana
// fija de 60s por clave, en memoria (misma limitación que el resto de
// los contadores de este backend -- se resetea si el proceso se reinicia,
// no es global entre instancias; documentado, no oculto).

export function crearLimitadorDeCaracteres({ maxCaracteresPorMinuto, obtenerClave, obtenerTexto, mensaje }) {
  const contadores = new Map();

  function middleware(req, res, next) {
    if (!maxCaracteresPorMinuto) return next(); // sin configurar: no se aplica, comportamiento anterior intacto
    const clave = obtenerClave(req);
    const texto = obtenerTexto(req) || "";
    const ahora = Date.now();
    let registro = contadores.get(clave);
    if (!registro || ahora - registro.inicio > 60_000) {
      registro = { inicio: ahora, total: 0 };
      contadores.set(clave, registro);
    }
    if (registro.total + texto.length > maxCaracteresPorMinuto) {
      return res.status(429).json({
        error: mensaje || "Se alcanzó el límite de texto procesado por minuto. Esperá un momento e intentá de nuevo.",
        codigo: "limite_caracteres"
      });
    }
    registro.total += texto.length;
    next();
  }

  middleware.reiniciarParaTests = () => contadores.clear();
  return middleware;
}
