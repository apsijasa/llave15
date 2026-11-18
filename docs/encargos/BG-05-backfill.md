BG-05 · Migración de datos `pnpm bg:backfill` y ventana V-BG1

## Contexto y autorización (Andrés, 18-nov)

Quinto paso de la fase Llave 15 (decisión 57; nombre en BG-D31). Cierra la ventana V-BG1 (expand): BG-03 agregó las columnas nulables y este paso entrega el script que, en producción, crea el taller Vector Bikes, enlaza su sucursal y completa `branch_id` en las siete tablas de reserva. El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-05 — Migración de datos `pnpm bg:backfill` y ventana V-BG1 (E1-T5)"**, y en `tasks.json` (tarea `E1-T5`). Ese bloque manda: si algo de este encargo y el blueprint difieren, gana el blueprint.

Sin decisión nueva: BG-D8 (el perfil vive en `scripts/vector-bikes-profile.ts`, creado en BG-04; el correo de avisos sale de `SHOP_NOTIFY_EMAIL`) y BG-D10 (logo en el almacenamiento, `shops/<id>/logo.png`).

## Lee antes

`AGENTS.md`; `.claude/rules/database.md`, `.claude/rules/shops.md`, `.claude/rules/taller-domain.md` (regla de subir primero y escribir después); el bloque de BG-05 del blueprint; `scripts/vector-bikes-profile.ts`; `src/server/storage/storage.ts`; `src/lib/env.ts` (`getEmailEnv`); `scripts/f2-check.ts` como patrón de script con códigos de salida 0/1/2; `docs/ventanas/` (las ventanas de la fase 2 como patrón) y la sección "Publicar con cambios de esquema" de la bitácora que cita el blueprint.

## Ojo con la siembra de BG-04

Desde BG-04, `createTestDb()` ya trae el taller `vector-bikes`. Las pruebas de `bg-backfill.test.ts` que parten "sin taller" deben borrar los talleres al empezar (`await db.delete(shops)`) o sembrar su propio estado; no cambies `tests/helpers/**`.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-04`). Prueba primero, en rojo; después el código. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo (incluida la prueba de conexión fallida y `pnpm gate`) y el Checkpoint con el tag `bg-05`.

## Qué hacer

Exactamente estos cinco archivos:

1. `src/server/shops/backfill.ts` (nuevo): `backfillFirstShop(db, { profile, notifyEmail, logo?, storage?, dryRun }, now)` como dice el bloque: crea el taller si falta y la tabla está vacía; `ambiguous` sin escribir si hay sucursales sin taller y no es exactamente una; enlaza la sucursal y completa `branch_id` nulo en las siete tablas, todo en una transacción; el logo se sube **antes** de la transacción que guarda `logo_key` y se borra si la fila falla (regla 12). Devuelve `{ ok: true, dryRun, shopCreated, branchesLinked, filled, pending, logoStored }`. Recibe `db` y `now` (regla 4); ningún `fetch`, correo ni subida dentro de la transacción (regla 6).
2. `scripts/bg-backfill.ts` (nuevo): `[--dry-run] [--logo <ruta>]`; argumento desconocido → 2 con uso; sin conexión → 2 con `No se pudo conectar`; `ambiguous` o `pending > 0` después de escribir → 1; si no, 0. Una línea JSON sin datos personales. `SHOP_NOTIFY_EMAIL` vía `getEmailEnv()`, leído solo al escribir.
3. `package.json`: solo agrega `"bg:backfill": "node --env-file-if-exists=.env scripts/bg-backfill.ts"`. Ninguna dependencia.
4. `tests/integration/bg-backfill.test.ts` (nuevo): los criterios 1 a 4 del bloque.
5. `docs/ventanas/bg-v1.md` (nuevo): con `## Precondiciones`, `## Pasos en Replit` y `## Verificación después de publicar`, y el nombre real de la migración que crea `shops` (`drizzle/0038_peaceful_living_tribunal.sql`).

## No cambiar

- Ninguna prueba existente ni `tests/helpers/**`, `e2e/`, `drizzle/`, el esquema, ni dependencias o el lockfile.
- No leer ni escribir archivos de entorno; `process.env` solo a través de `src/lib/env.ts`. No migrar. No registrar correos, teléfonos ni tokens sin redactar (No negociable 4).
- Regla 14: ningún dato de un taller en `src/`; el perfil llega como argumento desde `scripts/`.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; `node scripts/bg-backfill.ts --x` → 2; `node scripts/bg-expect-parity.ts` → 0.
2. Claude: el Verify completo del bloque BG-05 y `pnpm gate` → exit 0.

## Reporte

Los archivos con sus líneas, la cola de `pnpm check`, `pnpm test` y `pnpm build`, los códigos de salida de los scripts, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
