# Worker de IA para MedusaLee (Cloudflare Workers)

Backend seguro e independiente del backend de Render que ya tiene
MedusaLee: MedusaLee (GitHub Pages) nunca llama a Gemini/OpenRouter
directo -- le pide a este Worker, que guarda las claves como secretos y
llama el a los proveedores.

```
Usuario -> MedusaLee (GitHub Pages) -> este Worker -> Gemini (principal)
                                                     -> OpenRouter (respaldo, si Gemini falla)
```

**Es un backend nuevo, en paralelo al de Render/Groq que ya funciona.**
No reemplaza nada: `/ask` en `server/server.js` sigue funcionando igual
que siempre. Este Worker es una opción adicional (10 tareas de IA
distintas, ver abajo), no todavía conectada a la interfaz de MedusaLee --
esa conexión (Etapa 8 del pedido original) queda para una siguiente
ronda, a definir con el usuario.

## Qué se verificó de verdad en este entorno de desarrollo

- **`wrangler deploy --dry-run`**: el Worker compila y empaqueta sin
  errores (25.75 KiB, todas las importaciones resuelven bien).
- **`wrangler dev --local`**: el Worker corre de verdad en el runtime de
  Cloudflare (`workerd`) local. Se probaron en vivo: `/health`, preflight
  CORS con origen permitido, rechazo de origen no autorizado, rechazo de
  texto vacío, rechazo de tarea inválida, y **una llamada real a la API
  de Gemini** (con una clave inválida a propósito) que devolvió
  correctamente `CLAVE_INVALIDA` sin romper nada -- confirma que la URL y
  el formato del pedido a Gemini son correctos de verdad, no solo en
  teoría. También se probó el límite de solicitudes (20/minuto): los
  primeros 20 pedidos pasan, el 21° devuelve 429. Se probó también el
  **caché de solicitudes idénticas** (Etapa 10): dos pedidos con el mismo
  texto+tarea+opciones — el segundo se sirve desde caché sin volver a
  llamar al proveedor (verificado tanto por unit tests de `cache.js` como
  por una prueba de integración que llama a `worker.fetch()` directo con
  `fetch` global mockeado, confirmando el log `generate_cache_hit`).
- **44 tests automatizados** (`npm test`, Node.js `node:test`, sin
  dependencias nuevas) cubren validación, CORS, límite de solicitudes,
  caché, la lógica de proveedor principal/respaldo (incluyendo cuándo SÍ
  y cuándo NO debe caer a OpenRouter), la división de documentos largos
  con consolidación de resúmenes, y el `fetch()` completo del Worker
  (`/health`, orígenes, Content-Type, rutas desconocidas).

## Qué NO se pudo verificar acá

- **OpenRouter en vivo**: `openrouter.ai` está bloqueado por la red de
  este entorno de desarrollo (`curl` devuelve "CONNECT tunnel failed,
  403"). La implementación sigue el contrato público y estable de
  OpenRouter (API compatible con OpenAI en `/api/v1/chat/completions`),
  pero no se probó contra el servicio real. Probala vos con una clave
  real antes de confiar en que el respaldo funciona.
- **Despliegue real a Cloudflare**: `api.cloudflare.com` también está
  bloqueado acá, así que no se pudo ejecutar `wrangler deploy` de verdad
  (solo `--dry-run` y `wrangler dev --local`, ambos exitosos). El
  despliegue real lo tenés que hacer vos, con tu cuenta de Cloudflare.
- **El nombre exacto del modelo Gemini vigente**: no pude leer
  `ai.google.dev/gemini-api/docs/models` directamente (403 a un fetch
  automatizado). El default (`gemini-2.5-flash-lite`, en
  `src/services/ai/providerConfig.js`) viene de búsquedas web de julio de
  2026, no de una lectura directa de la documentación oficial --
  confirmalo vos en ese link antes de desplegar a producción, o simplemente
  configurá `GEMINI_MODEL` con el que confirmes.
- **Turnstile y el binding de Rate Limiting en vivo** (agregados en la
  Etapa 2 de la auditoría de seguridad): la sintaxis de
  `[[ratelimits]]` en `wrangler.toml` sí se verificó con
  `wrangler deploy --dry-run` (reconoce el binding como `Rate Limit`,
  `env.RATE_LIMITER (20 requests/60s)`), y el contrato de
  `challenges.cloudflare.com/turnstile/v0/siteverify` está tomado de la
  documentación oficial de Cloudflare Turnstile -- pero ninguno de los
  dos se probó contra un Worker desplegado de verdad ni una cuenta de
  Cloudflare real (no disponible en este entorno). Cubiertos por tests
  con `fetch`/binding mockeados, no en vivo.

## Instalación local

```bash
cd worker
npm install
```

## Configurar secretos (nunca van en el código ni en `wrangler.toml`)

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put OPENROUTER_API_KEY   # opcional
npx wrangler secret put TURNSTILE_SECRET_KEY # opcional, solo si activás Turnstile (ver mas abajo)
```

Te van a pedir pegar el valor en un prompt interactivo -- no queda
guardado en ningún archivo del repositorio.

Para desarrollo local (`wrangler dev`), copiá `.dev.vars.example` a
`.dev.vars` (que está en `.gitignore`, nunca se commitea) y pegá ahí tus
claves de prueba.

### Conseguir las claves

- **Gemini**: https://aistudio.google.com/apikey (cuenta de Google,
  nivel gratis disponible con límites diarios).
- **OpenRouter**: https://openrouter.ai/keys (cuenta gratuita; revisá
  https://openrouter.ai/models para elegir un modelo gratis vigente --
  no asumas que uno que viste en un blog sigue disponible).

## Variables no secretas (`wrangler.toml`, sección `[vars]`)

| Variable | Qué hace | Default |
|---|---|---|
| `ALLOWED_ORIGIN` | Origen(es) permitidos por CORS, separados por coma. **Cambiá esto por tu GitHub Pages real antes de desplegar.** | `https://tu-usuario.github.io` (placeholder, no funciona tal cual) |
| `AI_ENABLED` | Apaga/prende todo el Worker de IA. | `true` |
| `AI_PRIMARY_PROVIDER` | `gemini` u `openrouter`. | `gemini` |
| `AI_FALLBACK_ENABLED` | Si se intenta el otro proveedor cuando el principal falla de forma recuperable. | `true` |
| `AI_REQUEST_TIMEOUT_MS` | Timeout por pedido a un proveedor. | `30000` |
| `AI_MAX_RETRIES` | Reservado para reintentos dentro de un mismo proveedor (no usado todavía; hoy el "reintento" es cambiar de proveedor). | `1` |
| `AI_MAX_INPUT_CHARACTERS` | Tamaño máximo de texto aceptado por pedido. | `50000` |
| `CHUNK_SIZE` / `CHUNK_OVERLAP` | División de documentos largos para el resumen (Etapa 6). | `6000` / `400` |
| `MAX_DOCUMENT_CHARACTERS` | Límite dursimo antes de ni siquiera intentar procesar. | `400000` |
| *(`MAX_FILE_SIZE_MB`, no está acá)* | Este Worker nunca recibe archivos, solo texto ya extraído (JSON) — el límite de tamaño de archivo real vive en el frontend (`js/documentos.js`, `MAX_FILE_SIZE_MB = 20`) y en `server/server.js` (`MAX_FETCH_BYTES`) para las descargas por URL. Agregar esa variable acá no tendría ningún efecto real, así que no se hizo. | — |
| `GEMINI_MODEL` | Ver advertencia arriba: confirmalo vos. Sin esto, se usa el default no verificado. | *(sin setear)* |
| `OPENROUTER_MODEL` | Sin esto, el respaldo se informa como no configurado (a propósito, para no fijar un modelo gratis que podría haber dejado de existir). | *(sin setear, respaldo deshabilitado)* |
| `AI_RATE_LIMIT_POR_MINUTO` | Límite del respaldo en memoria (ver "Rate limiting" mas abajo). El límite del binding nativo se fija aparte, en `[ratelimits.simple]`. | `20` |
| `TURNSTILE_ENABLED` | Activa la verificación de Cloudflare Turnstile en `/api/generate` (ver mas abajo). | `false` |

Editá estos valores directamente en `wrangler.toml` (no son secretos) o
con `npx wrangler deploy --var CLAVE:valor` puntualmente.

## Turnstile (opcional, Etapa 2 de la auditoría)

Protege `/api/generate` de scripts automatizados sin exigir que la
persona se loguee. Con `TURNSTILE_ENABLED=false` (default), no hace nada
-- el Worker funciona exactamente igual que antes.

Para activarlo:

1. Creá un sitio en el [dashboard de Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile)
   (Cloudflare, gratis) -- te da dos claves: una **site key** (pública) y
   una **secret key** (privada).
2. `npx wrangler secret put TURNSTILE_SECRET_KEY` con la secret key.
3. `TURNSTILE_ENABLED = "true"` en `wrangler.toml`.
4. En MedusaLee (frontend), pegá la site key en "⚙️ Configuración
   avanzada" → Turnstile (ver `js/seguridad.js`). El widget se muestra
   solo, resuelve un token, y ese token viaja en
   `payload.turnstileToken` en cada pedido a `/api/generate` -- sin eso,
   el Worker devuelve 403 sin llegar a gastar una llamada a Gemini/OpenRouter.

**No verificado**: no se pudo crear un sitio de Turnstile real ni probar
el flujo completo (widget → token → `/turnstile/v0/siteverify`) desde
este entorno de desarrollo (sin cuenta de Cloudflare disponible acá). La
llamada a `siteverify` sigue el contrato documentado oficialmente
(developers.cloudflare.com/turnstile), cubierta por tests con `fetch`
mockeado -- no contra el servicio real.

## Rate limiting

Dos capas, en `src/security.js`:

1. **Binding nativo de Cloudflare** (`env.RATE_LIMITER`, ver
   `[[ratelimits]]` en `wrangler.toml`): un límite de verdad, global entre
   isolates/regiones -- confirmado con `wrangler deploy --dry-run`
   (reconoce el binding como `Rate Limit`), pero no probado en un Worker
   desplegado de verdad (sin cuenta de Cloudflare disponible acá).
2. **Respaldo en memoria** (el limitador que ya existía): se usa
   automáticamente si el binding no está disponible (por ejemplo en
   `wrangler dev` sin el binding, o en los tests) o si falla en tiempo de
   ejecución.

La clave del límite es el ID de sesión que manda el frontend en el header
`X-Medusa-Session-Id` (generado una vez por navegador, ver
`js/seguridad.js`) si está presente y tiene forma válida; si no, se cae a
la IP (`CF-Connecting-IP`) como antes.

## Desplegar

```bash
npx wrangler deploy
```

Wrangler te va a pedir loguearte con tu cuenta de Cloudflare la primera
vez (`wrangler login`, abre el navegador). Al terminar te da la URL del
Worker (algo como `https://medusalee-ai-worker.tu-cuenta.workers.dev`).

## Despliegue automático con GitHub Actions

`.github/workflows/deploy-worker.yml` despliega el Worker solo cuando
pusheás a `main` y cambió algo dentro de `worker/` (usa
[`cloudflare/wrangler-action`](https://github.com/cloudflare/wrangler-action),
la acción oficial de Cloudflare). Necesita dos secretos configurados en
GitHub — **nunca en el código**: `Settings` → `Secrets and variables` →
`Actions` → `New repository secret`, en el repo.

- **`CLOUDFLARE_API_TOKEN`**: Cloudflare dashboard → ícono de tu perfil →
  `My Profile` → `API Tokens` → `Create Token` → plantilla **"Edit
  Cloudflare Workers"** (le da permiso justo para desplegar Workers, nada
  más). Copiá el token generado y pegalo como ese secreto en GitHub.
- **`CLOUDFLARE_ACCOUNT_ID`**: Cloudflare dashboard → cualquier dominio o
  la sección Workers & Pages → se ve en la barra lateral derecha
  ("Account ID"). Pegalo como el otro secreto.

Este workflow **no toca** `GEMINI_API_KEY` ni `OPENROUTER_API_KEY` — esos
seguís configurándolos una sola vez con `wrangler secret put` desde tu
compu (paso de arriba); quedan guardados del lado de Cloudflare y
`wrangler deploy` no los borra ni los pisa en los despliegues siguientes.

Sin esos dos secretos configurados en GitHub, el workflow va a fallar con
un error de autenticación de Cloudflare — es esperable hasta que los
cargues.

**No verificado**: este workflow no se pudo probar de punta a punta
desde este entorno de desarrollo (no hay una cuenta de Cloudflare real
disponible acá, y `api.cloudflare.com` está bloqueado). Su sintaxis
(`cloudflare/wrangler-action@v4`, el token con plantilla "Edit Cloudflare
Workers") está verificada contra la documentación y el repositorio
oficial de Cloudflare, pero la primera ejecución real la vas a ver vos en
la pestaña "Actions" del repo después de cargar los secretos y pushear un
cambio en `worker/`.

## Probar

```bash
# Local, sin desplegar (recomendado primero):
npm run dev
# en otra terminal:
curl http://localhost:8787/health

# Tests automatizados:
npm test
```

## Endpoints

- `GET /health`: estado del Worker y qué proveedores están configurados
  (sin exponer las claves).
- `POST /api/generate`: el endpoint principal.
  ```json
  {
    "task": "summary",
    "content": "texto del documento o fragmento",
    "options": { "language": "es", "detail": "medium" },
    "bloques": [{ "pagina": 1, "texto": "..." }],
    "turnstileToken": "token-resuelto-por-el-widget"
  }
  ```
  `task` es una de: `summary`, `explain_simple`, `qa`, `chat`,
  `study_questions`, `multiple_choice`, `key_concepts`, `study_guide`,
  `extract_data`, `section_explanation`. `bloques` es opcional (la misma
  forma que ya usa `js/documentos.js` del frontend) y solo se usa para
  conservar referencias de página/sección en resúmenes largos.
  `turnstileToken` solo hace falta si `TURNSTILE_ENABLED=true` (ver mas
  abajo); si Turnstile está desactivado, se ignora aunque venga.

  Respuesta (éxito):
  ```json
  { "success": true, "provider": "gemini", "model": "gemini-2.5-flash-lite", "content": "...", "usage": { "inputTokens": 120, "outputTokens": 340 }, "error": null }
  ```
  Respuesta (error):
  ```json
  { "success": false, "provider": "gemini", "model": null, "content": null, "usage": null, "error": { "code": "SIN_API_KEY", "message": "..." } }
  ```

## Solución de errores comunes

| Síntoma | Causa probable |
|---|---|
| `403 Origen no autorizado` | `ALLOWED_ORIGIN` no incluye el dominio exacto desde el que estás probando (incluye protocolo, sin barra final). |
| `SIN_API_KEY` | Falta `wrangler secret put GEMINI_API_KEY` (o `OPENROUTER_API_KEY`). |
| `SIN_MODELO` en el respaldo | No configuraste `OPENROUTER_MODEL` -- es a propósito, no un bug. |
| `CLAVE_INVALIDA` | La clave está mal copiada o vencida/revocada. |
| `429` | Límite de solicitudes por minuto alcanzado (ver "Rate limiting" arriba). |
| `403 No se pudo verificar que sos una persona` | Turnstile está activo (`TURNSTILE_ENABLED=true`) y falta o es inválido `turnstileToken` -- confirmá que pegaste la site key correcta en el frontend. |
| `500` en `/api/generate` con Turnstile activo | Falta `wrangler secret put TURNSTILE_SECRET_KEY` en el Worker. |
| El Worker no arranca con `wrangler dev` | Corré `npm install` primero dentro de `worker/`. |

## Limitación conocida: la caché de solicitudes es aproximada

El caché de solicitudes idénticas (`src/cache.js`) tiene la misma
limitación: vive en memoria por isolate (máximo 100 entradas, se
descartan las más viejas), así que no es un caché global entre
instancias/regiones de Cloudflare -- es un ahorro de costos best-effort
para el caso común (el mismo usuario pidiendo lo mismo dos veces
seguidas), no una garantía de deduplicación exacta.

## Seguridad de una clave que ya se expuso

Si en algún momento pegaste una clave de Gemini u OpenRouter en un lugar
que no debía (un commit, un chat, un archivo público): **no la
reutilices**. Andá al panel del proveedor (Google AI Studio / OpenRouter)
y revocala, generá una nueva, y pegala solo con `wrangler secret put`.
