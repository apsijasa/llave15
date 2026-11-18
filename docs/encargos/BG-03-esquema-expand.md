BG-03 · Esquema expand: `shops`, `shop_id`, `branch_id` en reservas

## Contexto y autorización (Andrés, 18-nov)

Tercer paso de la fase Llave 15 (decisión 57; nombre en BG-D31) y primera generación de esquema de la ventana V-BG1 (expand). El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-03 — Esquema expand: `shops`, `shop_id`, `branch_id` en reservas (E1-T3)"**, y en `tasks.json` (tarea `E1-T3`). El esquema literal está en §4 del blueprint (`schema-shops.ts`, `onlyShopId`, `onlyBranchId`, `bookingBranchReference`, índices). Ese texto manda: si algo de este encargo y el blueprint difieren, gana el blueprint.

Sin decisión nueva: BG-D1 (`shops` es la nueva cabeza de la cadena) y BG-D3 (valores por defecto de compatibilidad con `$defaultFn`; la coordinadora confirmó que drizzle-orm 0.45.2 acepta un `SQL` devuelto por `$defaultFn`, `insert.js` línea 380).

## Lee antes

`AGENTS.md`; `.claude/rules/database.md`; la skill `.claude/skills/add-migration/SKILL.md`; en el blueprint §4 completo y el bloque de BG-03; `src/server/db/schema.ts`, `scripts/db-check.ts` y una prueba de esquema existente (`tests/integration/users-schema.test.ts`) como patrón.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit. Prueba primero (en rojo), después el esquema; luego `pnpm db:generate` (no necesita red) para emitir la migración en `drizzle/`. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre `pnpm db:migrate`, `pnpm db:check`, el Verify completo, `pnpm gate` y el Checkpoint con el tag `bg-03`.

## Qué hacer

Exactamente estos archivos escritos a mano, más lo que `pnpm db:generate` emita en `drizzle/`:

1. **`src/server/db/schema-shops.ts`** (nuevo): `shops`, `shopTables` y `onlyShopId` según el patrón literal de §4. No importa ningún otro archivo de esquema; define sus propios `instant`/`createdAt`/`updatedAt`.
2. **`src/server/db/schema.ts`**: `branches.shopId` nulable con `$defaultFn(onlyShopId)`; `users.isPlatformAdmin` (boolean, NOT NULL, default false); `bookingBranchReference()` nulable en `bookings`, `booking_bikes`, `booking_blocks`, `booking_days`, `blocked_periods`, `booking_requests` y `whatsapp_messages`; los cuatro índices no únicos de §4. Debe quedar bajo 400 líneas.
3. **`scripts/db-check.ts`**: recorre también `shopTables`.
4. **`tests/integration/shops-schema.test.ts`** (nuevo): los criterios 2 a 5 del bloque (default false de `is_platform_admin`; CHECK con `23514` y únicos con `23505`; `shopId` y `branchId` automáticos con uno y nulos con dos).

Una sola generación, aditiva: la migración nueva no contiene `DROP`, `RENAME` ni `SET NOT NULL`, y sí `CREATE TABLE "shops"`.

## No cambiar

- Ninguna columna, índice ni CHECK existente; ninguna prueba existente, `e2e/`, `package.json` ni el lockfile.
- `drizzle/` solo por `pnpm db:generate`; nunca a mano ni con `--custom`. No migrar (no hay base en el sandbox). No leer ni escribir archivos de entorno.
- Regla 14: ningún dato de un taller en `src/`. Regla 8 (`branch_id`): nulable ahora; NOT NULL llega en BG-09.

## Verificación

1. Codex: `pnpm db:generate` y `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0.
2. Claude: `pnpm db:migrate`, `pnpm db:check`, el Verify completo del bloque BG-03 (incluido `node scripts/bg-expect-parity.ts` → 0) y `pnpm gate` → exit 0.

## Reporte

Los archivos con sus líneas, el nombre del archivo SQL generado y su contenido resumido (sentencias), la cola de `pnpm check`, `pnpm test` y `pnpm build`, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
