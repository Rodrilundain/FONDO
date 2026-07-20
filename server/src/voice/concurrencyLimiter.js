// Limitador de concurrencia genérico con cola (Etapa 4 de la auditoría de
// seguridad): cada síntesis de Piper es un proceso del sistema operativo
// aparte -- sin límite, varias solicitudes simultáneas podrían saturar el
// contenedor. `crearLimitadorConcurrencia` devuelve una función `ejecutar`
// que corre como mucho `maxConcurrentes` tareas a la vez; el resto espera
// en una cola de hasta `maxEnCola`, y lo que no entra ahí se rechaza con
// un error claro en vez de acumularse sin límite.

export class ColaLlenaError extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "ColaLlenaError";
    this.codigo = "cola_llena";
  }
}

export function crearLimitadorConcurrencia({ maxConcurrentes, maxEnCola }) {
  let enCurso = 0;
  const cola = [];

  function despacharSiguiente() {
    if (enCurso >= maxConcurrentes || cola.length === 0) return;
    const { tarea, resolve, reject } = cola.shift();
    enCurso++;
    tarea().then(resolve, reject).finally(() => {
      enCurso--;
      despacharSiguiente();
    });
  }

  return function ejecutar(tarea) {
    return new Promise((resolve, reject) => {
      if (enCurso < maxConcurrentes) {
        enCurso++;
        tarea().then(resolve, reject).finally(() => {
          enCurso--;
          despacharSiguiente();
        });
        return;
      }
      if (cola.length >= maxEnCola) {
        reject(new ColaLlenaError("Hay demasiadas solicitudes de voz local esperando turno. Probá de nuevo en un momento."));
        return;
      }
      cola.push({ tarea, resolve, reject });
    });
  };
}
