BG-09 · Contract A: NOT NULL y clave de `booking_days`

## Contexto y autorización (Andrés, 18-nov)

Noveno paso de la fase Llave 15 (decisión 57; nombre en BG-D31) y primera de las tres generaciones de contract de la ventana V-BG3 (BG-D5). Después del backfill de BG-08, `branches.shop_id` y `branch_id` en las siete tablas de reserva pasan a NOT NULL, y la clave de `booking_days` pasa a (`branch_id`, `service_date`). El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-09 — Contract A: NOT NULL y clave de `booking_days` (E1-T9)"**, y en `tasks.json` (tarea `E1-T9`). Ese bloque manda.

Sin decisión nueva: BG-D3 (los valores por defecto de compatibilidad se conservan), BG-D5 (tres generaciones separadas, publicadas juntas), No negociable 8.

## Lee antes

`AGENTS.md`; `.claude/rules/database.md`; `.claude/skills/add-migration/SKILL.md`; el bloque de BG-09 y §4 del blueprint; `src/server/db/schema.ts`, `src/server/db/schema-shops.ts`; `tests/integration/shops-schema.test.ts` (patrón de prueba de esquema con PGlite y códigos SQLSTATE), `tests/helpers/two-shops.ts`.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-08`). Prueba nueva primero, en rojo; después el esquema y `pnpm db:generate` (sin red). Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre `pnpm db:migrate`, `pnpm db:check`, el Verify completo, `pnpm gate` y el Checkpoint con el tag `bg-09`.

## Qué hacer

Exactamente estos dos archivos escritos a mano, más lo que `pnpm db:generate` emita en `drizzle/`:

1. `src/server/db/schema.ts`: `.notNull()` en `branches.shopId` y en `bookingBranchReference()`; `booking_days` con `primaryKey({ columns: [t.branchId, t.serviceDate] })`. Los `$defaultFn` de compatibilidad se conservan. Quita el comentario "BG-09 agrega .notNull()…".
2. `tests/integration/shops-contract.test.ts` (nuevo): los criterios 2 a 4 del bloque (`23502` sin `shop_id` con dos talleres; `23502` sin `branch_id` con dos sucursales; `booking_days` acepta la misma fecha en dos sucursales y rechaza la misma sucursal dos veces con `23505`).

Una sola generación: la migración nueva contiene `SET NOT NULL` y no contiene `DROP TABLE`, `DROP COLUMN`, `CREATE TABLE` ni `RENAME`.

## Riesgo conocido

Con `branch_id` NOT NULL, cualquier prueba existente que inserte una reserva (o un día, bloque, bloqueo, intento o mensaje) sin sucursal en una base con cero o dos sucursales empezará a fallar con `23502`. Las de reservas ya usan `createBookingTestDb()` desde BG-04, pero algunas siembran con `createTestDb()` y sucursales a mano (por ejemplo `indicators.test.ts` y `reschedule-booking.test.ts` insertan dos). Si alguna falla, **no la modifiques**: detente y repórtala con el nombre, la línea y el error. La coordinadora decide.

## No cambiar

- Ninguna tabla, columna ni nombre de índice; ninguna prueba existente, `tests/helpers/**`, `e2e/`, `package.json` ni el lockfile.
- `drizzle/` solo por `pnpm db:generate`, nunca a mano ni `--custom`. No migrar. No leer ni escribir archivos de entorno.
- `schema.ts` queda bajo 400 líneas. Regla 14. Diseño: este paso no toca estilos ni pantallas.

## Verificación

1. Codex: `pnpm db:generate` y `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; `node scripts/bg-expect-parity.ts` → 0.
2. Claude: el Verify completo del bloque BG-09 (dry-run del backfill, migración y `db:check` en la base dev) y `pnpm gate` → exit 0.

## Reporte

Los archivos con sus líneas, el nombre del SQL generado y sus sentencias, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
