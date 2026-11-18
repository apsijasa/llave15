BG-12 · Reserva manual por taller

## Contexto y autorización (Andrés, 18-nov)

Duodécimo paso de la fase Llave 15 (decisión 57; nombre en BG-D31). La reserva manual de `/taller/reservas` (la que crea el personal) pasa a usar el alcance y la configuración del taller del usuario: sus comunas, su tarifa de retiro y sus horarios. El listado y los bloques libres filtran por sucursal. El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-12 — Reserva manual por taller (E1-T12)"**, y en `tasks.json` (tarea `E1-T12`). Ese texto manda.

Contexto ya construido: `BookingScope`/`scopeForBranch`/`singleShopScope` (BG-06), `createBooking(…, scope)` y `readRange(…, branchId)` (BG-07; sin sucursal, las lecturas no ven filas con dos talleres, BG-D41), `bookingSchemaFor(config)` en la API con el mensaje de comunas armado desde `config.pickupComunas` (BG-08), contract completo (BG-09…BG-11: `branch_id` NOT NULL, índices por taller, CHECK genéricos).

## Lee antes

`AGENTS.md`; `.claude/rules/server-api.md`, `.claude/rules/taller-ui.md`, `.claude/rules/shops.md`, `.claude/rules/booking-engine.md`; el bloque de BG-12 del blueprint; `src/server/taller/manual-booking.ts`, `src/pages/taller/reservas/nueva.astro`, `src/pages/taller/reservas/index.astro`; `src/server/api/handlers.ts` (`bookingSchemaFor`, mensaje de comunas) como patrón; `tests/helpers/two-shops.ts`; `tests/integration/manual-booking.test.ts` (no se toca).

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-11`). Prueba nueva primero, en rojo; después el código. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo, `pnpm gate` y el Checkpoint con el tag `bg-12`.

## Qué hacer

Exactamente estos cuatro archivos:

1. `src/server/taller/manual-booking.ts`: `createManualBooking` carga `scopeForBranch(db, actor.branchId)`; zod con comunas, tarifa y retiro de `scope.config` (fuera los literales de las líneas ~49 y ~77); `createBooking(…, scope)`. `listUpcomingBookings(db, today, days?, branchId?)` y `freeBlocks(…, branchId?)` filtran por sucursal (argumento opcional al final).
2. `src/pages/taller/reservas/nueva.astro`: pasa `user.branchId`; comunas y tarifa desde la configuración del taller (fuera los literales de las líneas ~181 y ~228), con `formatClp`.
3. `src/pages/taller/reservas/index.astro`: pasa `user.branchId`.
4. `tests/integration/manual-booking-isolation.test.ts` (nuevo): los criterios 1 a 5 con `seedTwoShops` (las páginas se prueban como en las pruebas de páginas existentes del repo).

## Riesgo conocido

Si una prueba existente falla porque siembra dos sucursales o lee sin sucursal, **no la modifiques**: repórtala (archivo, línea, error) y termina el resto.

## No cambiar

- Firmas exportadas (el alcance o la sucursal van al final y son opcionales); ninguna prueba existente, `tests/helpers/**`, `e2e/`, `drizzle/`, el esquema, `package.json` ni el lockfile. No migrar. No leer ni escribir archivos de entorno.
- Regla 11 (sesión → permiso → zod → `src/server/taller/**`), regla 14 (ningún dato de un taller en `src/`), No negociables 1 y 3.
- Diseño: textos y estructura de las páginas iguales salvo las comunas y la tarifa, que salen de la configuración (ver "Diseño por paso" en `AGENTS.md`: sigue el monocromo).

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; `node scripts/bg-expect-parity.ts` → 0.
2. Claude: el Verify completo del bloque BG-12 y `pnpm gate` → exit 0.

## Reporte

Los archivos con sus líneas, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
