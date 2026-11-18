BG-08 · API pública con la configuración del taller y ventana V-BG2

## Contexto y autorización (Andrés, 18-nov)

Octavo paso de la fase Llave 15 (decisión 57; nombre en BG-D31) y cierre de la ventana V-BG2. La API pública de reservas valida y responde con la configuración del taller (capacidad, horario, bloque, retiro y comunas), sin cambiar la forma de sus respuestas. Además se escribe la guía de la ventana V-BG2, que en producción corre `pnpm bg:backfill` antes de publicar el código con alcance. El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-08 — API pública con la configuración del taller y ventana V-BG2 (E1-T8)"**, y en `tasks.json` (tarea `E1-T8`). §5 del blueprint tiene los mensajes de error. Ese texto manda.

Sin decisión nueva: BG-D4 (alcance opcional; sin él, `singleShopScope`) y BG-D17 (la API recibirá `taller` desde la etapa 3; en este paso solo el contexto).

## Lee antes

`AGENTS.md`; `.claude/rules/server-api.md`, `.claude/rules/booking-engine.md`, `.claude/rules/shops.md`; el bloque de BG-08 y §5 del blueprint; `src/server/api/handlers.ts`, `src/server/booking/config.ts`, `src/server/shops/scope.ts`, `tests/helpers/two-shops.ts`; `tests/integration/api.test.ts` (no se toca); `docs/ventanas/bg-v1.md` como patrón de la guía.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-07`). Prueba nueva primero, en rojo; después el código y la guía. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo (incluidos los `pnpm bg:backfill` contra la base dev), `pnpm gate` y el Checkpoint con el tag `bg-08`.

## Qué hacer

Exactamente estos tres archivos:

1. `src/server/api/handlers.ts`: `HandlerContext.scope?`; sin él, `singleShopScope(ctx.db)`. `bookingSchemaFor(config)`: `comuna` validada contra `config.pickupComunas` con el mensaje de §5 (`Elige Vitacura o Las Condes.` para Vector Bikes, `Elige Ñuñoa o Providencia.` para el Taller Demo); retiro rechazado si `!config.pickupEnabled`; `handleAvailability` usa `config` (capacidad, horario, bloque) y mantiene la forma `{ timezone, modo, capacity, days }`. El orden rate limit → zod → Turnstile no cambia. Pasa el alcance a `createBooking` y a `readRange`.
2. `tests/integration/api-shop-config.test.ts` (nuevo): los criterios 1 a 4 del bloque, con `seedTwoShops`.
3. `docs/ventanas/bg-v2.md` (nuevo): `## Precondiciones` (V-BG1 publicada), `## Migración de datos en producción` (con el taller cerrado y respaldo del día: `pnpm bg:backfill --dry-run`, `pnpm bg:backfill --logo public/brand/vector-bikes-logo.png`, `pnpm bg:backfill --dry-run` con `"pending":0`), `## Pasos en Replit` (recién entonces publicar `bg-08`) y `## Verificación después de publicar`.

## No cambiar

- La forma de ninguna respuesta de la API ni los mensajes de hoy para Vector Bikes; `api.test.ts` y el resto de las pruebas pasan sin tocarse.
- Ninguna prueba existente, `tests/helpers/**`, `e2e/`, `drizzle/`, el esquema, `package.json` ni el lockfile. No migrar ni correr `bg:backfill` (no hay base en el sandbox). No leer ni escribir archivos de entorno.
- Regla 5 (zod antes de `src/server/**`), regla 14 (ningún dato de un taller en `src/`: los mensajes de comuna se arman desde `config.pickupComunas`, nunca escritos a mano). Diseño: este paso no toca estilos ni pantallas.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0, y `node scripts/bg-expect-parity.ts` → 0.
2. Claude: el Verify completo del bloque BG-08 (backfill de la base dev) y `pnpm gate` → exit 0.

## Reporte

Los archivos con sus líneas, cómo se arma el mensaje de comunas, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
