// === RemoteTTSProvider: interfaz preparada, NO implementada ===
// Etapa 7, capa 3 del sistema de voz. A proposito no llama a ningun
// servicio de voz remoto todavia: activar un proveedor de TTS pago sin
// que el usuario lo pida explicitamente no es aceptable.
//
// Antes de implementar esto de verdad hay que verificar (contra la
// documentacion oficial del proveedor elegido, no contra memoria):
//   - que modelos/voces ofrece y en que idiomas (espanol rioplatense es
//     el que le interesa a MedusaLee, ver PIPER_VOICE_ID_HOMBRE/MUJER en
//     server/.env.example para el equivalente ya resuelto con Piper);
//   - su licencia de uso (uso comercial, redistribucion del audio, etc);
//   - precio real (no asumir "nivel gratis" sin confirmarlo);
//   - formato de audio que devuelve (wav/mp3/ogg) y si soporta streaming;
//   - limites de uso (caracteres por pedido, cuota mensual).
//
// La clave de este proveedor, cuando se implemente, va a vivir en un
// secreto del Worker (por ejemplo REMOTE_TTS_API_KEY), igual que
// GEMINI_API_KEY/OPENROUTER_API_KEY -- nunca en el frontend.

export async function llamarRemoteTTS() {
  return {
    success: false,
    engine: "remote",
    audioUrl: null,
    error: "El proveedor de voz remoto todavía no está implementado ni configurado."
  };
}
