BG-07 · Reservas por sucursal y arnés de dos talleres

## Contexto y autorización (Andrés, 18-nov)

Séptimo paso de la fase Llave 15 (decisión 57; nombre en BG-D31), ventana V-BG2. Las escrituras y lecturas de reservas pasan a filtrar por sucursal, y nace el arnés de dos talleres que usarán todas las pruebas de aislamiento (`*-isolation.test.ts`, No negociable 20). El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-07 — Reservas por sucursal y arnés de dos talleres (E1-T7)"**, y en `tasks.json` (tarea `E1-T7`). Ese bloque manda: si algo de este encargo y el blueprint difieren, gana el blueprint.

Sin decisión nueva: BG-D4 (alcance opcional al final; sin él, `singleShopScope`, que lanza con dos talleres). BG-06 ya dejó `BookingConfig`, `LEGACY_BOOKING_CONFIG`, `BookingScope`, `scopeForBranch` y `singleShopScope`.

## Lee antes

`AGENTS.md`; `.claude/rules/booking-engine.md`, `.claude/rules/shops.md`, `.claude/rules/database.md`; el bloque de BG-07 del blueprint y §4/§5; `src/server/booking/create-booking.ts`, `day-state.ts`, `availability.ts`, `config.ts`, `src/server/shops/scope.ts`; `tests/helpers/shops.ts`, `tests/helpers/pglite.ts`; las pruebas `create-booking.test.ts`, `concurrency.test.ts`, `multi-bike-booking.test.ts`, `api.test.ts`.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-06`). Pruebas primero, en rojo; después el código. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo, `pnpm gate` y el Checkpoint con el tag `bg-07`.

## Qué hacer

Exactamente estos cinco archivos:

1. `src/server/booking/create-booking.ts`: `createBooking(db, input, now, scope?)`; sin alcance, `singleShopScope`. Toda fila con `scope.branchId`; `booking_days` con (`branchId`, `serviceDate`) y bloqueado con `FOR UPDATE` filtrando sucursal y fecha, **sin cambiar el orden de los locks** (día → teléfono); límite de teléfono por sucursal; `nextCode` por sucursal con `${config.codePrefix}-AAMMDD-HHMM`; tarifa desde `config`. La forma de `CreateBookingResult` no cambia.
2. `src/server/booking/day-state.ts`: `readDay(tx, serviceDate, excludeBookingId?, branchId?)` filtra por sucursal.
3. `src/server/booking/availability.ts`: `readRange(db, from, to, excludeBookingId?, branchId?)` filtra por sucursal; sin ella, `singleShopScope`.
4. `tests/helpers/two-shops.ts` (nuevo): `seedTwoShops(db)` → `{ vector, demo }` con taller, sucursal, dueño, mecánico y alcance de cada uno (usa `seedShop`, `insertBranchForShop`, `DEMO_SHOP_PROFILE`; recuerda que `createTestDb()` ya trae Vector Bikes).
5. `tests/integration/booking-isolation.test.ts` (nuevo): los cinco primeros criterios. El Taller Demo solo reserva `taller` (los CHECK se relajan en BG-11) y a horas distintas de Vector Bikes (el índice de bloques es global hasta BG-10).

## Riesgo conocido

Algunas pruebas existentes siembran con `createTestDb()` y después insertan sucursales a mano (`reschedule-booking.test.ts`, `indicators.test.ts` insertan dos). Si alguna llama a `createBooking`, `readRange` o `readDay` sin alcance con más de una sucursal y empieza a fallar, **no la modifiques**: detente y repórtalo con el nombre de la prueba y el error. La coordinadora decide.

## No cambiar

- Ninguna prueba existente (`create-booking`, `concurrency`, `multi-bike-booking`, `api` y el resto pasan sin tocarse), `tests/helpers/shops.ts`, `tests/helpers/pglite.ts`, `e2e/`, `drizzle/`, el esquema, `package.json` ni el lockfile. No migrar. No leer ni escribir archivos de entorno.
- No negociable 1 (capacidad y un bloque por bici, en la base) y 3 (nunca borrar reservas). Reglas 4, 6 y 13 (error centinela en la transacción).
- Regla 14: ningún dato de un taller en `src/`. Diseño: este paso no toca estilos ni pantallas.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0, y `node scripts/bg-expect-parity.ts` → 0.
2. Claude: el Verify completo del bloque BG-07 y `pnpm gate` → exit 0.

## Reporte

Los archivos con sus líneas, el orden de locks resultante, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
