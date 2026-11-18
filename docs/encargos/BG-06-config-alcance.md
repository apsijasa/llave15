BG-06 · Configuración y alcance del taller; horarios por configuración

## Contexto y autorización (Andrés, 18-nov)

Sexto paso de la fase Llave 15 (decisión 57; nombre en BG-D31) y primer paso de la ventana V-BG2. El motor de reservas deja de depender solo de las constantes de Vector Bikes: lee la configuración del taller desde `shops` y aprende a resolver el alcance (`BookingScope`). El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-06 — Configuración y alcance del taller; horarios por configuración (E1-T6)"**, y en `tasks.json` (tarea `E1-T6`). §4 y §5 del blueprint definen `BookingScope`, `BookingConfig` y `ShopScopeError`. Ese texto manda: si algo de este encargo y el blueprint difieren, gana el blueprint.

Sin decisión nueva: BG-D4 (alcance como último argumento opcional; sin él, `singleShopScope`, que lanza con dos talleres). Este paso no cambia ninguna pantalla.

## Lee antes

`AGENTS.md`; `.claude/rules/booking-engine.md`, `.claude/rules/shops.md`; en el blueprint §4, §5 y el bloque de BG-06; `src/server/booking/rules.ts`, `src/server/booking/slots.ts`, `src/lib/time.ts`, `src/server/db/schema-shops.ts`, `tests/helpers/shops.ts` (`VECTOR_BIKES_PROFILE`, `DEMO_SHOP_PROFILE`, `seedShop`, `insertBranchForShop`) y `tests/helpers/pglite.ts` (desde BG-04, `createTestDb()` ya trae el taller `vector-bikes`, sin sucursal).

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-05`). Prueba nueva primero, en rojo; después el código. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo y `pnpm gate`, y el Checkpoint con el tag `bg-06`.

## Qué hacer

Exactamente estos cinco archivos:

1. `src/server/booking/config.ts` (nuevo): `BookingConfig`, `weekHoursSchema` (zod: claves `"1"`…`"7"`, valor `null` o `{ open, close }` en `HH:MM` con `open < close`), `bookingConfigFromShop(row)` y `LEGACY_BOOKING_CONFIG` armado con las constantes de `rules.ts` (transitorio; se borra en BG-28).
2. `src/server/shops/scope.ts` (nuevo): `BookingScope`, `ShopScopeError` (`ambiguous`, `missing`), `scopeForBranch(db, branchId)` y `singleShopScope(db)`.
3. `src/server/booking/slots.ts`: `DayInput.config?`, `gridForDate(date, mode?, config?)`, `calendarClosure(…, config?)`; sin configuración, `LEGACY_BOOKING_CONFIG`.
4. `src/server/booking/rules.ts`: `hoursFor(mode, weekday, config?)`.
5. `tests/integration/shop-config.test.ts` (nuevo): los seis criterios del bloque.

Ojo con una dependencia circular: `config.ts` usa las constantes de `rules.ts` y `rules.ts`/`slots.ts` usan `LEGACY_BOOKING_CONFIG`. Resuélvela sin cambiar firmas exportadas (por ejemplo, con un valor por defecto perezoso o `config.ts` importando solo constantes); si no se puede, detente y repórtalo.

## No cambiar

- Los resultados sin configuración: `slots.test.ts`, `multi-bike-slots.test.ts` y `pickup-hours.test.ts` pasan sin tocarse. Ninguna firma existente pierde compatibilidad (los argumentos nuevos van al final y son opcionales).
- Ninguna prueba existente, `tests/helpers/**`, `e2e/`, `drizzle/`, el esquema, `package.json` ni el lockfile. No migrar. No leer ni escribir archivos de entorno.
- Regla 14: ningún dato de un taller en `src/` más allá de lo que ya está en `rules.ts` (que se retira en BG-28). Regla 4: `db` y `now` como argumentos.
- Diseño: este paso no toca estilos ni pantallas (ver "Diseño por paso" en `AGENTS.md`).

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0, y `node scripts/bg-expect-parity.ts` → 0.
2. Claude: el Verify completo del bloque BG-06 y `pnpm gate` → exit 0.

## Reporte

Los archivos con sus líneas, cómo resolviste la dependencia entre `config.ts` y `rules.ts`, la cola de `pnpm check`, `pnpm test` y `pnpm build`, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
