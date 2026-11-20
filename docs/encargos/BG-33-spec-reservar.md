BG-33 · Spec de navegador de la reserva por taller (excepción BG-D19)

## Contexto y autorización (Andrés, 17-nov)

Paso 33 de la fase Llave 15 (decisión 57) y último de la etapa 3. Por excepción declarada (BG-D19), la página pública `/<slug>/reservar` (BG-31) tiene un spec de navegador en tablet. El spec **no envía** la reserva: Turnstile necesita red. El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-33 — Spec de navegador de la reserva por taller (E3-T5)"**, y en `tasks.json` (tarea `E3-T5`). Ese texto manda.

## Lee antes

`AGENTS.md`; `.claude/rules/e2e.md` (proyecto `tablet`, `.tap()`, ubicación por rol y nombre, solo `@playwright/test` y `e2e/fixtures.ts` en los specs, la siembra crece con `hasTable`, BG-33 es el paso que declara la siembra del Taller Demo E2E); el bloque de BG-33 del blueprint y BG-D19 en §20.3; `e2e/global-setup.ts` (`seedShop`, `seedUsers`), `e2e/fixtures.ts` (`SEED`), `playwright.config.ts` (solo leer), un spec existente como patrón (por ejemplo `e2e/seguimiento-enlace.spec.ts`); `tests/helpers/shops.ts` (`DEMO_SHOP_PROFILE` y la configuración del Taller Demo: bloque 60, capacidad 2, horizonte 14, retiro 9.000 a Ñuñoa y Providencia, prefijo `TD`, y sus horarios), `src/pages/[slug]/reservar.astro`, `src/components/islands/BookingIsland.tsx`, `BookingFields.tsx` y `BookingSchedule.tsx` (roles y nombres accesibles de los controles).

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-32`). Tu sandbox no tiene Postgres ni red: **no puedes correr el spec**. Escríbelo con cuidado y verifica que compile (`pnpm check`). Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre `pnpm test:tablet`, el Verify completo, `pnpm gate` y el Checkpoint con el tag `bg-33`.

## Qué hacer

Tres archivos escritos a mano:

1. `e2e/fixtures.ts`: `SEED.demoShopId` y `SEED.demoBranchId` (uuid fijos con el mismo patrón que los demás). Nada más cambia.
2. `e2e/global-setup.ts`: con `hasTable(sql, "shops")`, siembra el Taller Demo E2E: `slug` `taller-demo`, `name` `Taller Demo E2E`, los demás valores de `DEMO_SHOP_PROFILE` y de su configuración **escritos en el archivo** (no importes `tests/helpers/**`: `global-setup.ts` solo puede importar `hashPassword` y `scripts/vector-bikes-profile.ts`), prefijo `TD`, estado `activo`; y su sucursal (`SEED.demoBranchId`). Que los horarios de recepción del Taller Demo abran los próximos días hábiles, para que la isla muestre bloques. La siembra de Vector Bikes y todo lo demás no cambia.
3. `e2e/reservar-taller.spec.ts` (nuevo): los tres primeros criterios del blueprint. Para cada página espera con `page.waitForResponse` la respuesta de `/api/disponibilidad` cuya URL lleve `taller=<slug>`, elige un día disponible con `.tap()` y comprueba que los bloques mostrados sean los de esa respuesta (en el Taller Demo, de 60 minutos). Elige el modo retiro para ver las comunas (`Vitacura` y `Las Condes` en Vector Bikes; `Ñuñoa` y `Providencia` en el Taller Demo, sin `Vitacura`). Comprueba `Gestionado con Llave 15` en el pie. No toca Turnstile ni envía el formulario.

**Ningún valor esperado cambia:** los specs existentes y `playwright.config.ts` no se tocan; `pnpm test` y la paridad no cambian.

## No cambiar

- `playwright.config.ts`, los specs existentes, `src/**`, `tests/**`, `drizzle/`, `package.json` ni el lockfile. No leer ni escribir archivos de entorno. `e2e/**` puede leer `process.env` (excepción de la regla 11), pero no lo necesitas.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; `git diff HEAD --name-only -- e2e` lista solo `e2e/fixtures.ts` y `e2e/global-setup.ts` (el spec nuevo no está en seguimiento todavía).
2. Claude: `pnpm build && pnpm test:tablet e2e/reservar-taller.spec.ts`, `pnpm test:tablet` completo, el resto del Verify del bloque BG-33 y `pnpm gate` → exit 0.

## Reporte

Los tres archivos con sus líneas, los valores sembrados del Taller Demo E2E, cómo el spec relaciona los bloques mostrados con la respuesta de la API, la cola de `pnpm check`, `pnpm test` y `pnpm build`, y cualquier prueba existente que haya fallado y por qué.
