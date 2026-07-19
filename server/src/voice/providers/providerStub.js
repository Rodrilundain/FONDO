// === Proveedor placeholder para motores todavía no implementados ===
// Deja la interfaz lista (mismo método `synthesize` que piperProvider) para
// poder sumar OpenVoice/MeloTTS más adelante sin tocar voiceService.js, sin
// instalar ninguna dependencia hasta que se implementen de verdad.

export function crearProviderNoImplementado(nombre) {
  return {
    async synthesize() {
      const error = new Error(`El proveedor de voz "${nombre}" todavía no está implementado.`);
      error.codigo = "proveedor_no_implementado";
      throw error;
    },
  };
}
