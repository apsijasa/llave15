BG-32 · Enlaces a la página de reservas del taller

## Contexto y autorización (Andrés, 17-nov)

Paso 32 de la fase Llave 15 (decisión 57) y cuarto de la etapa 3. BG-31 creó `/<slug>/reservar`. Este paso apunta a esa página los dos enlaces del sistema que hoy van a la portada: el del recordatorio de mantención (`/#reserva`, ancla rota hoy, FASE §6) y el de la tarjeta de `/taller` (`/#reservar`). El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-32 — Enlaces a la página de reservas del taller (E3-T4)"**, y en `tasks.json` (tarea `E3-T4`). Ese texto manda.

## Lee antes

`AGENTS.md`; `.claude/rules/taller-domain.md`, `.claude/rules/taller-ui.md`, `.claude/rules/server-api.md` (enlaces del sistema); el bloque de BG-32 del blueprint; `src/server/taller/maintenance-plan.ts` (`sendMaintenanceReminders`, hoy `new URL("/#reserva", deps.siteUrl ?? getSiteEnv().PUBLIC_SITE_URL)` una vez para todas las órdenes, y el mapa `profiles` por sucursal), `src/pages/taller/index.astro` (hoy `bookingUrl = …/#reservar`, con su `try/catch`), `src/server/shops/profile.ts` (`profileForBranch`, `ShopProfile.slug`); `tests/integration/maintenance-plan.test.ts`, `tests/integration/tasks-maintenance-reminders.test.ts`, `tests/integration/dashboard.test.ts`, `tests/unit/maintenance-email.test.ts` y `tests/helpers/shops.ts` como patrón.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-31`). Prueba nueva primero, en rojo; después el código. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo, `pnpm gate` y el Checkpoint con el tag `bg-32`.

## Qué hacer

Tres archivos escritos a mano:

1. `src/server/taller/maintenance-plan.ts`: el enlace se arma **por recordatorio**, con el `slug` del perfil de la orden: `new URL(`/${profile.slug}/reservar`, deps.siteUrl ?? getSiteEnv().PUBLIC_SITE_URL)`. Sin `#reserva` en el archivo. El resto del correo, la agrupación y los conteos no cambian.
2. `src/pages/taller/index.astro`: el enlace de la tarjeta apunta a `<PUBLIC_SITE_URL>/<slug del taller del usuario>/reservar` (el slug sale de `profileForBranch(db, user.branchId)`, que la página ya pueda tener o que se agrega); mantiene el `try/catch` (sin `PUBLIC_SITE_URL` o sin perfil, la tarjeta se muestra sin enlace). Sigue bajo 400 líneas.
3. `tests/integration/booking-links.test.ts` (nuevo): los tres primeros criterios con dos talleres (recordatorio del Taller Demo → `/taller-demo/reservar`, de Vector Bikes → `/vector-bikes/reservar`, `/taller` del personal de cada taller → su slug).

## Valores esperados que cambian (declarados)

Solo el enlace del recordatorio de mantención: `…/#reserva` → `…/vector-bikes/reservar`. Hoy lo afirman `tests/integration/tasks-maintenance-reminders.test.ts:202` y `:205`; cambia solo esa parte de la cola del matcher, en una línea, y **repórtalo**. `tests/unit/maintenance-email.test.ts` pasa el `bookingUrl` como dato de entrada a la plantilla: no es una expectativa, no lo toques. Si otra prueba existente afirma el enlace viejo de `/taller` (`/#reservar`), aplica el mismo criterio y repórtalo. Cualquier otra prueba que falle, **no la modifiques**: repórtala (archivo, línea, error) y termina el resto.

## No cambiar

- El resto del correo de mantención (asunto, texto, plantilla, condiciones de envío) y el resto de `/taller`; `Base.astro`, `Landing.astro`, `reservas/cancelar.astro` (sus `/#reservar` son de la portada heredada y siguen hasta la etapa 4).
- `tests/helpers/**`, `e2e/`, `drizzle/`, `package.json` ni el lockfile. No leer ni escribir archivos de entorno. Regla 14: ningún slug literal en `src/`.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; `pnpm test tests/integration/booking-links.test.ts tests/integration/maintenance-plan.test.ts tests/integration/tasks-maintenance-reminders.test.ts tests/integration/dashboard.test.ts` → exit 0; `grep -Eq '#reserva([^r]|$)' src/server/taller/maintenance-plan.ts; test $? -eq 1` → 0; `node scripts/bg-expect-parity.ts --allow '/vector-bikes/reservar' --allow '/#reserva'` → 0.
2. Claude: el Verify completo del bloque BG-32 y `pnpm gate` → exit 0.

## Reporte

Los tres archivos con sus líneas, cada cambio en pruebas existentes línea por línea, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué.
