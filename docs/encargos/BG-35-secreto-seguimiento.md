BG-35 · Secreto propio del seguimiento sin romper enlaces

## Contexto y autorización (Andrés, 17-nov)

Este es el paso 35 de la fase Llave 15 (decisión 57). Hoy el seguimiento firma sus tokens con `CANCEL_TOKEN_SECRET`. Este paso agrega el secreto propio `TRACKING_TOKEN_SECRET`, que es opcional y, si falta, usa `CANCEL_TOKEN_SECRET`. Las órdenes que ya tienen un token con el secreto viejo lo conservan, así que ningún enlace ya enviado deja de abrir. La decomisión de esa convivencia es `BG-DC2` (§9.1).

Lo que manda es el bloque **"BG-35 — Secreto propio del seguimiento sin romper enlaces (E4-T2)"** de `blueprints/bike-garage/blueprint.md` §9, junto con la tarea `E4-T2` de `tasks.json`.

## Lee antes

- `AGENTS.md` y `.claude/rules/server-api.md`.
- `.claude/rules/taller-domain.md`.
- El bloque de BG-35.
- `src/lib/env.ts`: los accesores, `parseSource`, `EnvError` y `getAppEnv` de BG-34.
- `src/server/taller/tracking.ts`.
- `src/server/taller/share-tokens.ts` o el archivo donde esté `hashShareToken`.
- `tests/integration/tracking.test.ts` y `tests/integration/tracking-page.test.ts`.
- `.env.example`.

## Qué hacer

Son cuatro archivos.

1. **`src/lib/env.ts`:** agrega `getTrackingEnv(source = process.env)`, que devuelve `{ TRACKING_TOKEN_SECRET: string; LEGACY_SECRET: string }`.
   - `TRACKING_TOKEN_SECRET` es opcional, se trata como ausente si viene vacío y debe tener al menos 32 caracteres. Si tiene menos, lanza un `EnvError` que lo nombra.
   - Si falta, vale `CANCEL_TOKEN_SECRET`.
   - `LEGACY_SECRET` es `CANCEL_TOKEN_SECRET`.
2. **`src/server/taller/tracking.ts`:**
   - `trackingTokenFor(orderId, secret = getTrackingEnv().TRACKING_TOKEN_SECRET)` conserva su firma y su derivación.
   - `ensureTrackingLink` cambia así:
     - Si la orden ya tiene una fila en `order_tracking_tokens`, calcula los candidatos con el secreto propio y con `LEGACY_SECRET`, y devuelve el que coincide con el `token_hash` guardado. No reescribe la fila.
     - Si ningún candidato coincide, devuelve el del secreto propio y actualiza `token_hash`. Es un caso raro, por ejemplo tras rotar las dos claves.
     - Si la orden no tiene fila, emite con el secreto propio, como hoy.
   - `viewTrackingByToken` no cambia.
   - Se actualiza el comentario de la decisión 49.
3. **`.env.example`:** agrega `TRACKING_TOKEN_SECRET=` con un comentario en español: al menos 32 caracteres; si queda vacío, se usa `CANCEL_TOKEN_SECRET`; los enlaces ya enviados siguen funcionando.
4. **`tests/integration/tracking-secret.test.ts` (nuevo, va primero):** cubre los cinco criterios del bloque y prueba que un enlace emitido con el secreto viejo sigue abriendo con `viewTrackingByToken` después de definir el nuevo.

**Ningún valor esperado cambia.** La paridad, sin flags, sale 0.

## No cambiar

- Las firmas exportadas.
- `src/server/booking/tokens.ts`: la cancelación sigue con `CANCEL_TOKEN_SECRET`.
- Las pruebas existentes, `drizzle/`, el esquema y `package.json`.
- La regla 14.
- Los archivos de entorno reales.

## Verificación

El Verify completo del bloque BG-35 y `pnpm gate` deben salir con código 0.
