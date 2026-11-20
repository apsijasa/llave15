BG-36 · Tareas diarias por taller activo

## Contexto y autorización (Andrés, 17-nov)

Paso 36 de la fase Llave 15 (decisión 57). Las tareas diarias (`/api/tareas/*` y el cron de WhatsApp) recorren cada taller **activo** con su alcance y omiten los suspendidos. Manda el bloque **"BG-36 — Tareas diarias por taller activo (E4-T3)"** de `blueprints/bike-garage/blueprint.md` §9 y la tarea `E4-T3` de `tasks.json`.

## Lee antes

`AGENTS.md`; `.claude/rules/server-api.md`, `.claude/rules/shops.md`; el bloque de BG-36; `src/server/shops/scope.ts`; `src/server/api/task-handlers.ts`; `src/server/whatsapp/cron.ts` y `sendPendingReminders` en `src/server/whatsapp/service.ts`; `sendReminders` en `src/server/email/reminders.ts`; `sendOverdueDigest` y `shopDigests` en `src/server/taller/maintenance.ts`; `tests/integration/tasks.test.ts`, `tasks-maintenance*.test.ts`, `whatsapp.test.ts`; `tests/helpers/shops.ts`.

## Qué hacer

1. `scope.ts`: `activeShopScopes(db): Promise<BookingScope[]>` — un alcance por cada taller `activo` con su sucursal (orden estable por `slug`).
2. `task-handlers.ts`: `handleRemindersTask` llama `send(db, now, undefined, scope)` por cada alcance activo y suma `sent` y `failed`; la forma de la respuesta no cambia. `deps.send` sigue inyectable.
3. `whatsapp/cron.ts`: `handleWhatsAppCron` recorre `activeShopScopes` y suma `sent`, `failed` y `skipped`; misma forma de respuesta.
4. `src/server/taller/maintenance.ts` (archivo agregado al paso, ver la nota): `sendOverdueDigest` descarta las órdenes atrasadas y los productos de stock bajo de sucursales cuyo taller no está `activo` antes de contar y agrupar. Con un solo taller activo, el resultado es idéntico al de hoy.
5. `tests/integration/tasks-isolation.test.ts` (nuevo, primero): los cinco criterios del bloque con Vector Bikes y el Taller Demo; el suspendido no recibe recordatorios, resumen ni WhatsApp.

**Nota:** el bloque nombra cuatro archivos y dice que `handleAlertsTask` "omite los suspendidos", pero el agrupado vive en `maintenance.ts`: se agrega como quinto archivo (máximo del paso), sin cambiar su firma.

**Ningún valor esperado cambia:** `node scripts/bg-expect-parity.ts` sale 0.

## No cambiar

Autorización de tareas, formas de respuesta, firmas exportadas, `handleMaintenanceTask` y `handleRetentionTask`, las pruebas existentes, `drizzle/`, la regla 14.

## Verificación

El Verify completo del bloque BG-36 y `pnpm gate` → exit 0.
