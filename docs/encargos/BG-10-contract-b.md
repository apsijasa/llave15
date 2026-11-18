BG-10 · Contract B: índices únicos por taller

## Contexto y autorización (Andrés, 18-nov)

Décimo paso de la fase Llave 15 (decisión 57; nombre en BG-D31) y segunda generación de contract de la ventana V-BG3 (BG-D5). Los cuatro índices únicos que hoy son globales pasan a ser por taller o por sucursal, **con el mismo nombre** (BG-D11), para que dos talleres puedan tener el mismo código de reserva, el mismo bloque, el mismo nombre de sucursal o un cliente con el mismo RUT. El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-10 — Contract B: índices únicos por taller (E1-T10)"**, y en `tasks.json` (tarea `E1-T10`). §4 tiene la definición de cada índice. Ese texto manda.

Contexto de BG-09 (ya construido): `shop_id` y `branch_id` son NOT NULL y `booking_days` tiene PK (`branch_id`, `service_date`) (BG-D42). Las pruebas que necesitan filas sin taller usan `tests/helpers/legacy-db.ts`.

## Lee antes

`AGENTS.md`; `.claude/rules/database.md`; `.claude/skills/add-migration/SKILL.md`; §4 y el bloque de BG-10 del blueprint; `src/server/db/schema.ts` (`uq_bookings_code`, `uq_booking_blocks_active_slot`, `uq_branches_name`), `src/server/db/schema-taller.ts` (`uq_customers_rut`); `tests/integration/shops-contract.test.ts` y `tests/helpers/two-shops.ts` como patrón.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-09`). Prueba nueva primero, en rojo; después el esquema y `pnpm db:generate` (sin red). Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre `pnpm db:migrate`, `pnpm db:check`, el Verify completo, `pnpm gate` y el Checkpoint con el tag `bg-10`.

## Qué hacer

Exactamente estos tres archivos escritos a mano, más lo que emita `pnpm db:generate`:

1. `src/server/db/schema.ts`: `uq_bookings_code` sobre (`branch_id`, `code`); `uq_booking_blocks_active_slot` sobre (`branch_id`, `service_date`, `block_start`) con `is_active = true`; `uq_branches_name` sobre (`shop_id`, `name`).
2. `src/server/db/schema-taller.ts`: `uq_customers_rut` sobre (`branch_id`, `rut`) con `rut is not null`.
3. `tests/integration/shops-unique.test.ts` (nuevo): los criterios 2 a 4 (misma fecha y hora en dos talleres; segundo bloque activo en la misma sucursal → `23505`; mismo RUT o mismo nombre de sucursal aceptado entre talleres y rechazado con `23505` nombrando el índice de siempre en el mismo taller).

Una sola generación: la migración nueva contiene `DROP INDEX` y `CREATE UNIQUE INDEX`, y no contiene `DROP TABLE`, `DROP COLUMN`, `CREATE TABLE` ni `RENAME`. Mismos nombres de índice. Si drizzle-kit pregunta algo o deja una sentencia comentada, **detente y repórtalo** (no edites `drizzle/`).

## Riesgo conocido

Si una prueba existente esperaba un rechazo entre sucursales o talleres distintos y ahora se acepta, **no la modifiques**: detente con ese caso y repórtalo (archivo, línea, error). Lo mismo si una siembra sin sucursal choca con algo nuevo.

## No cambiar

- Ningún nombre de índice, tabla ni columna; ninguna prueba existente, `tests/helpers/**`, `e2e/`, `package.json` ni el lockfile. No Negociable 1 (la garantía de un bloque por bici vive en la base).
- `drizzle/` solo por `pnpm db:generate`, nunca a mano ni `--custom`. No migrar. No leer ni escribir archivos de entorno.
- Archivos bajo 400 líneas. Regla 14. Diseño: este paso no toca estilos ni pantallas.

## Verificación

1. Codex: `pnpm db:generate` y `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; `node scripts/bg-expect-parity.ts` → 0.
2. Claude: el Verify completo del bloque BG-10 (migración y `db:check` en la base dev) y `pnpm gate` → exit 0.

## Reporte

Los archivos con sus líneas, el nombre del SQL generado y sus sentencias, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
