BG-11 · Contract C: CHECK relajados y ventana V-BG3

## Contexto y autorización (Andrés, 18-nov)

Undécimo paso de la fase Llave 15 (decisión 57; nombre en BG-D31): última generación de contract y cierre de la etapa 1. Los dos CHECK de reservas que hoy fijan la tarifa de Vector Bikes ($15.000) y sus comunas pasan a reglas genéricas (tarifa ≥ 0, comuna no vacía y dirección presente en retiro); la tarifa y las comunas de cada taller ya las valida zod con su configuración (BG-08). Además se escribe la guía de la ventana V-BG3, que publica juntas las cuatro migraciones de contract. El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-11 — Contract C: CHECK relajados y ventana V-BG3 (E1-T11)"**, y en `tasks.json` (tarea `E1-T11`). §4 tiene los dos CHECK nuevos. Ese texto manda.

Contexto ya construido: BG-09 (NOT NULL; `booking_days` borrada y recreada con su PK por sucursal, en dos migraciones, BG-D42) y BG-10 (índices únicos por taller; RUT por sucursal, BG-D43). Las migraciones de contract son `drizzle/0039_low_ozymandias.sql`, `0040_big_wonder_man.sql`, `0041_awesome_firebird.sql` y la que emita este paso.

## Lee antes

`AGENTS.md`; `.claude/rules/database.md`; `.claude/skills/add-migration/SKILL.md`; §4, BG-D5, BG-D42 y BG-D43 y el bloque de BG-11 del blueprint; `src/server/db/schema.ts` (`bookings_fee_check`, `bookings_retiro_address_check`); `tests/integration/shops-contract.test.ts` como patrón; `docs/ventanas/bg-v1.md` y `bg-v2.md` como patrón de la guía.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-10`). Prueba nueva primero, en rojo; después el esquema, `pnpm db:generate` (sin red) y la guía. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre `pnpm db:migrate`, `pnpm db:check`, el Verify completo, `pnpm gate` y el Checkpoint con el tag `bg-11`.

## Qué hacer

Exactamente estos tres archivos escritos a mano, más lo que emita `pnpm db:generate`:

1. `src/server/db/schema.ts`: `bookings_fee_check` y `bookings_retiro_address_check` según §4 (salen de `schema.ts` los literales `Vitacura` y `Las Condes` y el `15000`). Ningún otro CHECK cambia.
2. `tests/integration/shops-checks.test.ts` (nuevo): los criterios 2 y 3 (retiro del Taller Demo en `Ñuñoa` guardado con `pickup_fee_clp = 9000`; reserva `taller` con tarifa 100, o retiro con comuna vacía o sin dirección → `23514`).
3. `docs/ventanas/bg-v3.md` (nuevo): las **cuatro** migraciones de contract por su nombre real (las tres de arriba y la nueva); el aviso de cambio destructivo que mostrará Replit (borra y recrea `booking_days`, cuyas filas son anclas de bloqueo que se recrean solas; NOT NULL; índices recreados); `## Precondiciones` (`pnpm bg:backfill --dry-run` con `"pending":0` en producción, V-BG1 y V-BG2 publicadas, taller cerrado, respaldo del día); `## Pasos en Replit`; `## Verificación después de publicar`.

La migración nueva tiene exactamente cuatro sentencias `ALTER TABLE` (dos `DROP CONSTRAINT` y dos `ADD CONSTRAINT`). Si drizzle-kit pregunta algo o deja una sentencia comentada, **detente y repórtalo** (no edites `drizzle/`).

## No cambiar

- Ningún otro CHECK, tabla, columna ni índice; ninguna prueba existente, `tests/helpers/**`, `e2e/`, `package.json` ni el lockfile. Si una prueba existente falla, no la modifiques: repórtala (archivo, línea, error) y termina el resto.
- `drizzle/` solo por `pnpm db:generate`. No migrar. No leer ni escribir archivos de entorno.
- Regla 14 (este paso saca datos de Vector Bikes de `src/`). Diseño: no toca estilos ni pantallas.

## Verificación

1. Codex: `pnpm db:generate` y `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; `node scripts/bg-expect-parity.ts` → 0.
2. Claude: el Verify completo del bloque BG-11 y `pnpm gate` → exit 0.

## Reporte

Los archivos con sus líneas, el nombre del SQL generado y sus sentencias, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
