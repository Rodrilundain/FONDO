#!/usr/bin/env node
// === Comando de prueba: solo el módulo de voz, sin levantar el servidor ===
//
// Uso:
//   node test-voice.mjs
//   node test-voice.mjs "Otro texto para probar"
//
// Lee la configuración de server/.env (TTS_ENABLED, PIPER_EXECUTABLE,
// PIPER_MODEL_PATH, etc.) igual que el servidor. Si TTS_ENABLED no está en
// "true", el resultado va a mostrar success:false con un mensaje claro,
// sin intentar ejecutar Piper.

import { textToSpeech } from "./src/voice/voiceService.js";

const texto = process.argv.slice(2).join(" ")
  || "Hola, Rodrigo. El sistema está funcionando correctamente.";

console.log(`🎤 Probando síntesis de voz con: "${texto}"`);
const resultado = await textToSpeech({ text: texto, voice: "es_AR" });
console.log(JSON.stringify(resultado, null, 2));

if (resultado.success) {
  console.log(`✅ Audio generado en: ${resultado.audioPath}`);
} else {
  console.log(`❌ No se pudo generar el audio: ${resultado.error}`);
}

process.exit(resultado.success ? 0 : 1);
