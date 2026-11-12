Tarea diaria de recordatorios de mantención

## Contexto y autorización (Andrés, 12-nov)

Desde A-05a cada informe puede llevar `next_maintenance_date` (decisión 52). Falta quien avise: hoy las tareas diarias son `/api/tareas/recordatorios`, `/alertas` y `/retencion` (`src/server/api/task-handlers.ts`, cron de Make.com a las 10:00). Andrés quiere una cuarta, `/api/tareas/mantenciones`, que siete días antes de la fecha mande al cliente "Se acerca la mantención de tu bicicleta", una sola vez.

Amplía la **decisión 52** en `blueprints/vector-taller-f1/blueprint.md` §20.3 agregando al final de su texto:

> Desde el encargo A-05b, `/api/tareas/mantenciones` (mismo `TASKS_SECRET`) envía `maintenanceReminderEmail` una sola vez por informe, `MAINTENANCE_REMINDER_DAYS_BEFORE = 7` días antes de la fecha y con `MAINTENANCE_REMINDER_GRACE_DAYS = 30` días de gracia si la tarea no corrió; no se envía si el cliente no tiene correo, si la orden está anulada ni si la bicicleta tiene una orden posterior. Es una comunicación de servicio derivada del informe (finalidad declarada en FASE1 §7), no una campaña: el correo invita a responder para no recibir más avisos y el taller borra la fecha en el informe.

## Lee antes

`AGENTS.md`; `.claude/rules/server-api.md`; `.claude/rules/taller-domain.md`.

## Rama y reparto

Rama `feat/etapa-a`, sobre el último commit. Pruebas primero; `pnpm format && pnpm check && pnpm test && pnpm build` en verde; sin commits ni push (Claude corre `pnpm gate` y commitea). Commit que hará Claude: `feat: add the daily maintenance reminder task`.

## Reglas de negocio decididas

| Tema | Regla |
|---|---|
| Candidatos | `service_reports` con `next_maintenance_date` entre `hoy − 30` y `hoy + 7` (fechas locales, `localToday`/`addDays` de `src/server/booking/slots.ts`), `maintenance_reminder_sent_at is null`; join `work_orders` (`voided_at is null`) → `customers` (`email is not null`) → `bikes`; excluir si existe otra `work_orders` de la misma `bike_id` con `created_at` posterior a la orden del informe y `voided_at is null`. Orden por fecha y número. |
| Correo | `maintenanceReminderEmail({ orderNumber, customerName, bike, nextMaintenanceDate, note, bookingUrl })`: asunto `Se acerca la mantención de tu bicicleta · Vector Bikes`; intro `Hola <primer nombre>,` y "Cuando revisamos tu bicicleta sugerimos una próxima mantención. Se acerca la fecha."; filas Bicicleta, Fecha sugerida (larga, es-CL), Nota si existe, Última orden; enlace "Reservar hora" a `bookingUrl` (= `PUBLIC_SITE_URL` + `/#reserva`); nota "Si no quieres recibir este aviso, responde este correo y lo quitamos.". En `src/server/email/order-templates.ts`. |
| Idempotencia | Igual que `sendReminders` (`src/server/email/reminders.ts`): `maintenance_reminder_sent_at = now` solo después de un envío exitoso, con `where … is null`. Un fallo cuenta en `failed`, deja `log.error("email.failed", { kind: "maintenance", orderId })` sin correo y no marca. |
| Handler | `handleMaintenanceTask(request, db, now, deps = {})` con `taskGuard(request, "maintenance", deps.secret)`; 200 `{ ok: true, sent }` o 500 `{ ok: false, sent, failed }`; errores inesperados → 500 `internal_error` con `log.error("tasks.maintenance_failed")`. |
| Ruta | `src/pages/api/tareas/mantenciones.ts`, copia de `recordatorios.ts`. |

## Qué hacer

- **`src/server/taller/maintenance-plan.ts`** (A-05a; queda < 320 líneas): `dueMaintenanceReminders(db, now)` y `sendMaintenanceReminders(db, now, deps: { transport?: EmailTransport; siteUrl?: string } = {}): Promise<{ sent: number; failed: number }>`.
- **`src/server/email/order-templates.ts`**: `maintenanceReminderEmail`.
- **`src/server/api/task-handlers.ts`** (98 → ≤ 130): `handleMaintenanceTask`.
- **`src/pages/api/tareas/mantenciones.ts`** (nuevo).
- **`scripts/smoke.sh`**: una línea más, `test "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/tareas/mantenciones")" = 401`.

## No cambiar

- `sendReminders`, `maintenance.ts` (atrasos y retención), los otros tres handlers y sus rutas.
- `e2e/**`, `playwright.config.ts`, el esquema, `drizzle/`.
- Ninguna prueba existente (`tasks.test.ts`, `tasks-maintenance.test.ts`, `reminders.test.ts` deben pasar).
- Fotos por orden: sin tope.

## Pruebas (primero, verlas fallar)

**`tests/unit/maintenance-email.test.ts`:** asunto, fecha larga, nota presente o ausente, enlace "Reservar hora" al `bookingUrl`, frase de baja, `escapeHtml` en la nota.

**`tests/integration/tasks-maintenance-reminders.test.ts`** (patrón de `tests/integration/tasks.test.ts`: `vi.stubEnv("TASKS_SECRET", undefined)`, `consoleOutbox`, `afterEach` sin PII; sembrar orden, informe y `setMaintenancePlan`):
- Cabecera inválida → 401 sin enviar; GET → 405.
- Fecha a 5 días → 200 `{ ok: true, sent: 1 }`, un correo al cliente con "Se acerca la mantención", `maintenance_reminder_sent_at` seteado.
- Segunda corrida → `sent: 0`.
- Fecha a 20 días → 0; fecha hace 10 días (dentro de la gracia) → 1; hace 40 días → 0.
- Cliente sin correo → 0; orden anulada → 0; bici con una orden posterior → 0.
- Transporte que lanza → 500 `{ ok: false, sent: 0, failed: 1 }`, `sent_at` sigue `null`, `log.error` sin correo.
- Dos informes elegibles → `sent: 2`, en orden de fecha.

Ninguna prueba existente se modifica. Si una falla, detente y reporta con el diff.

## Documentación

- Decisión 52 ampliada.
- `README.md`: en "Tareas diarias y respaldos" y en "Recordatorios por correo (cron externo)", el cuarto POST `/api/tareas/mantenciones` en el escenario de Make.com, y una frase: "Mantenciones avisa al cliente una semana antes de la fecha sugerida en el informe, una sola vez."

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0. Claude: `pnpm gate` → exit 0 (incluye el smoke con la línea nueva).
2. Con el build local y `.env`: `curl -s -X POST -H "Authorization: Bearer $TASKS_SECRET" http://127.0.0.1:4321/api/tareas/mantenciones` → `{"ok":true,"sent":0}`; sin cabecera → 401.

## Reporte

La cola de `pnpm check`, `pnpm test` y `pnpm build`, texto plano de un recordatorio generado en las pruebas, líneas finales de `task-handlers.ts` y `maintenance-plan.ts`, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
