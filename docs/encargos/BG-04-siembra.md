BG-04 · Siembra del taller Vector Bikes en las pruebas

## Contexto y autorización (Andrés, 18-nov)

Cuarto paso de la fase llave15 (decisión 57; nombre en BG-D31). Es una excepción declarada al límite de cinco archivos (BG-D6): cuatro archivos propios y quince archivos de siembra que solo cambian líneas de siembra, nunca una expectativa. El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-04 — Siembra del taller Vector Bikes en las pruebas (E1-T4)"**, y en `tasks.json` (tarea `E1-T4`). El perfil literal de Vector Bikes y `DEMO_SHOP_PROFILE` están en §4. Ese texto manda: si algo de este encargo y el blueprint difieren, gana el blueprint.

BG-03 ya creó `shops`, `branches.shop_id` y `branch_id` nulable en las reservas, con valores por defecto de compatibilidad (BG-D3). Este paso hace que las pruebas siembren el taller como lo tendrá producción, sin cambiar lo que esperan.

## Lee antes

`AGENTS.md`; `.claude/rules/database.md`, `.claude/rules/e2e.md`; en el blueprint §4 (perfil literal, `tests/helpers/shops.ts`) y el bloque de BG-04; `tests/helpers/pglite.ts`, `e2e/global-setup.ts`, `src/lib/site.ts`, `src/server/booking/rules.ts`, `src/server/db/schema-shops.ts`.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-03`). Prueba nueva primero, en rojo; después el código y la siembra. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo (incluidos `pnpm test:tablet e2e/login.spec.ts` y `pnpm gate`) y el Checkpoint con el tag `bg-04`.

## Qué hacer

**Archivos propios (cuatro):**
1. `scripts/vector-bikes-profile.ts` (nuevo): `VECTOR_BIKES_PROFILE`, literal de §4. Vive fuera de `src/` (regla 14, BG-D8).
2. `tests/helpers/shops.ts` (nuevo): reexporta `VECTOR_BIKES_PROFILE`; `DEMO_SHOP_PROFILE` de §4; `seedShop(db, profile)`; `insertBranchForShop(db, shopId, name)`.
3. `tests/helpers/pglite.ts`: `createTestDb()` siembra el taller Vector Bikes (sin sucursal); nuevo `createBookingTestDb()` = `createTestDb()` + sucursal `Vitacura` de ese taller.
4. `tests/unit/vector-bikes-profile.test.ts` (nuevo): el perfil coincide con `src/lib/site.ts` y `src/server/booking/rules.ts` en todos los campos del criterio 3, y `codePrefix` es `VB`.

**Siembra declarada (quince, solo líneas de siembra):**
- `tests/integration/{api,create-booking,concurrency,cancel-flow,email,reminders,tasks,whatsapp,admin-panel,admin-month,foundation}.test.ts`: pasan de `createTestDb` a `createBookingTestDb`.
- `tests/integration/{users-schema,reports,history}.test.ts`: sus `INSERT` crudos de `branches` agregan `shop_id`; el de `bookings` en `users-schema` agrega `branch_id`.
- `e2e/global-setup.ts`: con `hasTable(sql, "shops")`, inserta el taller desde `VECTOR_BIKES_PROFILE` antes de la sucursal, la sucursal con `shop_id` y las reservas con `branch_id`.

Ningún otro archivo de `tests/` ni `e2e/` cambia: el Verify compara la lista exacta.

## No cambiar

- Ninguna expectativa (matcher) de ninguna prueba: `node scripts/bg-expect-parity.ts` debe salir 0.
- `src/` no cambia en este paso. Ni `drizzle/`, `package.json` ni el lockfile. No migrar. No leer ni escribir archivos de entorno.
- Regla 14: el perfil vive en `scripts/`, nunca en `src/`.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0, y `node scripts/bg-expect-parity.ts` → 0.
2. Claude: el Verify completo del bloque BG-04 (lista exacta de archivos, `pnpm test:tablet e2e/login.spec.ts`) y `pnpm gate` → exit 0.

## Reporte

Los archivos con sus líneas (propios y de siembra), la cola de `pnpm check`, `pnpm test` y `pnpm build`, la salida del script de paridad, y cualquier prueba existente que haya fallado y por qué, sin modificar su expectativa.
