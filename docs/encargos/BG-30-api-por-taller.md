BG-30 · API de reservas por taller

## Contexto y autorización (Andrés, 17-nov)

Paso 30 de la fase Llave 15 (decisión 57) y segundo de la etapa 3. BG-29 dejó `scopeBySlug` y `slugSchema`. Este paso hace que `GET /api/disponibilidad` y `POST /api/reservas` atiendan a un taller por su `slug` (`taller`), con rate limit por taller y Turnstile atado al slug con `cdata`. La isla envía el slug. El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-30 — API de reservas por taller (E3-T2)"**, y en `tasks.json` (tarea `E3-T2`). Ese texto manda.

## Lee antes

`AGENTS.md`; `.claude/rules/server-api.md` (taller en la API pública, orden taller → rate limit → zod → Turnstile, `shop_not_found` 404 sin registrar el intento, formas de respuesta que no cambian), `.claude/rules/booking-engine.md`, `.claude/rules/shops.md`, `.claude/rules/ui-design.md` (islas); el bloque de BG-30 del blueprint; `src/server/api/handlers.ts` (`handleAvailability`, `handleCreateBooking`, `checkRateLimit`, `recordAttempt`, `HandlerContext.scope`), `src/server/api/turnstile.ts`, `src/server/shops/scope.ts` y `src/server/shops/slugs.ts` (BG-29), `src/components/islands/BookingIsland.tsx`, `src/components/islands/turnstile.ts`, `src/components/islands/booking-state.ts` (`IslandShop.slug`); `tests/integration/api.test.ts`, `tests/integration/api-shop-config.test.ts`, `tests/integration/scope-by-slug.test.ts` y `tests/helpers/shops.ts` como patrón.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-29`). Prueba nueva primero, en rojo; después el código. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo (`pnpm test:build` incluido), `pnpm gate` y el Checkpoint con el tag `bg-30`.

## Qué hacer

Cinco archivos escritos a mano, según el "Hacer" del blueprint:

1. `src/server/api/handlers.ts`:
   - `taller` opcional en `availabilitySchema` y en el cuerpo estricto de la reserva (`bookingFields`).
   - Resolución del taller **primero**: con `taller`, `scopeBySlug`; si devuelve `null` → 404 `{ error: "No encontramos ese taller.", code: "shop_not_found" }`, **antes** del rate limit y **sin** `recordAttempt`. Sin `taller`, `ctx.scope ?? singleShopScope(db)`; si `singleShopScope` lanza `ShopScopeError` → 422 `validation_error` con `fields: { taller: "Falta el taller." }`. Agrega `shop_not_found` a los códigos y mensajes existentes sin cambiar los demás.
   - Para leer `taller` del cuerpo antes del rate limit, sácalo del JSON con un parseo mínimo (string opcional) antes de la validación completa; la validación estricta posterior lo acepta como campo conocido.
   - `checkRateLimit(ctx, branchId?)`: con `branchId` cuenta solo los intentos de esa sucursal (`booking_requests.branch_id`); sin él, igual que hoy (lo usan las páginas por token: no cambian). La reserva llama `checkRateLimit(ctx, scope.branchId)` y `recordAttempt(ctx, scope.branchId)`.
   - Turnstile: si `verifyTurnstile` devuelve `cdata` y no es el `slug` del alcance → 403 `turnstile_failed`.
   - El archivo tiene hoy 392 líneas y debe quedar **bajo 400** (regla 7): compacta lo que agregues (por ejemplo un ayudante `resolveScope` que devuelva alcance o respuesta de error, usado por ambos handlers); **no** crees un archivo nuevo en `src/`. Si de verdad no cabe, detente y repórtalo.
2. `src/server/api/turnstile.ts`: `verifyTurnstile` devuelve `{ success: boolean; cdata: string | null }` (de `result.cdata` si es string). Cualquier fallo sigue siendo `{ success: false, cdata: null }`. Ajusta su único llamador en `handlers.ts`.
3. `src/components/islands/BookingIsland.tsx`: `taller: shop.slug` en el cuerpo de `POST /api/reservas` y `&taller=${shop.slug}` (codificado) en la consulta de `/api/disponibilidad`; nada más cambia.
4. `src/components/islands/turnstile.ts`: `TurnstileOptions` gana `cdata?: string` y `useTurnstile` la pasa al widget con `shop.slug` (agrega el parámetro que haga falta; ajusta el llamador en la isla).
5. `tests/integration/api-by-shop.test.ts` (nuevo): los seis criterios del blueprint con dos talleres (`seedTwoShops`): disponibilidad del Taller Demo con la misma forma, 201 en su sucursal, 404 `shop_not_found` para desconocido/reservado/suspendido sin fila en `booking_requests`, 429 en el Taller Demo tras 5 intentos de una IP mientras Vector Bikes la acepta, 403 con `cdata` distinto (Turnstile con un `fetchFn` falso, como en las pruebas existentes), y sin `taller` con un solo taller igual que hoy.

**Ningún valor esperado cambia:** `api.test.ts`, `api-shop-config.test.ts`, `booking-state.test.ts`, `approval-decide.test.ts` y las pruebas de páginas por token pasan sin tocarlas; la paridad corre sin `--allow` ni `--skip`. Si una prueba existente falla, **no la modifiques**: repórtala (archivo, línea, error) y termina el resto.

## No cambiar

- Las formas de respuesta (201 `{ code, service_date, start, end, mode, fee }`, disponibilidad `{ timezone, modo, capacity, days }`, errores `{ error, code, fields? }`); el orden taller → rate limit → zod → Turnstile → transacción → correos; las páginas por token y su rate limit global; `src/pages/**` (la página `/<slug>/reservar` es BG-31); `src/server/booking/**`.
- Ninguna prueba existente, `tests/helpers/**`, `e2e/`, `drizzle/`, el esquema, `package.json` ni el lockfile. No leer ni escribir archivos de entorno. Regla 14: ningún dato de un taller en `src/`. Regla 6: nada de red dentro de la transacción.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; `pnpm test tests/integration/api-by-shop.test.ts tests/integration/api.test.ts tests/integration/api-shop-config.test.ts tests/unit/booking-state.test.ts` → exit 0; `wc -l src/server/api/handlers.ts` < 400; `node scripts/bg-expect-parity.ts` → 0.
2. Claude: el Verify completo del bloque BG-30 (`pnpm test:build`) y `pnpm gate` → exit 0.

## Reporte

Los cinco archivos con sus líneas, el orden final de pasos de `handleCreateBooking`, la nueva firma de `checkRateLimit` y `verifyTurnstile`, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué.
