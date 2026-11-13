Aviso de WhatsApp "lista para retirar" para órdenes

## Contexto y autorización (Andrés, 12-nov)

El módulo de WhatsApp (`src/server/whatsapp/service.ts`, tabla `whatsapp_messages`) solo conoce reservas: `booking_id` es NOT NULL, `sendTemplate(booking, kind)` recibe una `Booking` y el aviso `ready` se dispara desde la agenda de `/admin` cuando la reserva pasa a `ready_for_pickup`. Cuando una **orden** aprueba el control de calidad (`submitQc` en `src/server/taller/qc.ts`), solo sale el correo (decisión 38). Andrés quiere que también salga la plantilla de WhatsApp cuando esté habilitado y el cliente haya consentido. En producción `WHATSAPP_ENABLED=false`: el encargo entra dormido.

Regístralo como **decisión 53** en `blueprints/vector-taller-f1/blueprint.md` §20.3, con este texto:

> **Aviso de WhatsApp para órdenes listas** (decisión del dueño, 2026-11-12, rama `feat/etapa-a`, encargo `docs/encargos/A-06-whatsapp-orden-lista.md`): se levanta parcialmente la constante "módulo WhatsApp" del §1. `service.ts` solo extrae de `sendTemplate` la función `postTemplate(to, template, variables)` que habla con Meta, sin cambiar su comportamiento ni sus pruebas. Lo nuevo vive en `src/server/whatsapp/order-notices.ts` y en la tabla `order_whatsapp_notices` (`work_order_id`, `type` CHECK `'ready'`, `status` pending/sending/sent/failed/unknown, `meta_message_id`, `error`, `attempts`, `claimed_at`, `sent_at`; único por orden y tipo), con la misma reclamación atómica y la misma regla para el resultado incierto que `sendNotice`. El consentimiento es el de la reserva de origen (`work_orders.booking_id` → `bookings.whatsapp_consent_at`): sin reserva o sin consentimiento, `skipped`. Usa `WHATSAPP_READY_TEMPLATE` con `[nombre, bicicleta, OT-00001]`. Se dispara en `submitQc` después del commit y después del correo; nunca cambia el resultado del control. Auditoría `notify.ready_whatsapp` con `{ status }`. El dueño revisa el texto de la plantilla aprobada en Meta antes de habilitar WhatsApp.

## Lee antes

`AGENTS.md`; `.claude/rules/database.md`; `.claude/rules/taller-domain.md`; `.claude/rules/server-api.md`; `.agents/memory/external-send-recovery.md`.

## Rama y reparto

Rama `feat/etapa-a`, sobre el último commit. Pruebas primero; `pnpm format && pnpm check && pnpm test && pnpm build` en verde; sin commits ni push (Claude corre `pnpm gate` y commitea). Commits que hará Claude: `feat: send the WhatsApp ready notice for work orders` y `docs: record the order WhatsApp notice as decision 53`.

## Esquema

En `src/server/db/schema-reports.ts`: tabla `orderWhatsappNotices` → `order_whatsapp_notices` con `id`, `branch_id` NOT NULL FK, `work_order_id` FK restrict, `type` text NOT NULL, `status` text NOT NULL default `'pending'`, `meta_message_id` text, `error` text, `attempts` integer NOT NULL default 0, `claimed_at`, `sent_at` timestamptz, `created_at`, `updated_at`; `uniqueIndex("uq_order_whatsapp_notices_order_type").on(workOrderId, type)`; CHECK `type in ('ready')` y CHECK `status in ('pending','sending','sent','failed','unknown')`. Agregar a `reportTables`. `pnpm db:generate` → `drizzle/0027_*.sql`. `pnpm db:migrate` y `pnpm db:check` los corre Claude contra la base dev.

## Qué hacer

- **`src/server/whatsapp/service.ts`**: extraer `export async function postTemplate(to: string, template: string, variables: string[]): Promise<string>` con el `fetch` actual (URL, cabeceras, cuerpo, timeout, manejo de respuesta); `postTemplate` usa `to` tal cual y `sendTemplate` la llama con `booking.phoneE164.replace(/^\+/, "")`, como hoy. Cero cambios de comportamiento; `tests/integration/whatsapp.test.ts` intacto.
- **`src/server/whatsapp/order-notices.ts` (nuevo, < 200 líneas)**: `export type OrderNoticeSender = (to: string, template: string, variables: string[]) => Promise<string>`; `export async function notifyOrderReadyByWhatsApp(db, actor, orderId, now, sender: OrderNoticeSender = postTemplate): Promise<NoticeResult>`. Pasos: `getWhatsAppEnv()` → deshabilitado → `skipped`; leer orden (sucursal, no anulada, `status = 'lista_para_retirar'`) con cliente, bici y reserva (`leftJoin bookings`); sin `booking` o sin `whatsapp_consent_at` → `skipped`; transacción de reclamación (`insert … onConflictDoNothing` + `update … where status in ('pending','failed') returning`) idéntica en forma a `sendNotice`; fuera de la transacción `sender(phoneE164 sin el "+" inicial, env.WHATSAPP_READY_TEMPLATE, [firstName, bike, formatOrderNumber(number)])`; éxito → `sent` + `meta_message_id`; HTTP 4xx → `failed`; otro error → `unknown`; `log.error("whatsapp.failed", { kind: "order_ready", orderId, message })` sin teléfono; `recordAudit("notify.ready_whatsapp", { status })` al final (fuera de transacción, con `db`). Agregar `"notify.ready_whatsapp"` a `AuditAction`.
- **`src/server/taller/qc.ts`**: en `submitQc`, después de `notifyReadyForPickup`, `await notifyOrderReadyByWhatsApp(db, actor, orderId, now, deps.whatsappSender)` dentro de un `try/catch` que solo loguea. `NotifyDeps` de `src/server/email/notifications.ts` gana `whatsappSender?: OrderNoticeSender` (tipo importado desde `order-notices.ts`; `notifications.ts` solo suma la propiedad opcional).

## No cambiar

- `cron.ts`, `sendNotice`, `sendPendingReminders`, `reconcileNotice`, `/api/internal/whatsapp-reminders`, `whatsapp_messages`, `bookings`.
- `tests/integration/whatsapp.test.ts` y toda prueba existente.
- `.env.example` (ninguna variable nueva). Fotos por orden: sin tope.

## Pruebas (primero, verlas fallar)

**`tests/integration/whatsapp-orden.test.ts`** (patrón de `whatsapp.test.ts` con `vi.stubEnv`; sembrar reserva con `whatsappConsentAt`, orden `lista_para_retirar` con `booking_id`, cliente y bici; `sender` falso que registra argumentos):
- Con consentimiento → `sent`, fila `sent` con `meta_message_id`, `sender` llamado con `("56912345678", "bicicleta_lista", ["Ana", "Trek Marlin", "OT-00001"])`, auditoría `notify.ready_whatsapp` `{ status: "sent" }`.
- Sin consentimiento → `skipped`, 0 filas, `sender` no llamado.
- Sin reserva → `skipped`.
- `WHATSAPP_ENABLED=false` → `skipped` sin consultar la base.
- Orden en otro estado → `skipped`.
- `sender` lanza `Meta rechazó la plantilla (HTTP 400)` → `failed`, fila `failed`, `log.error` sin teléfono.
- `sender` lanza error de red → `failed` con razón "incierto", fila `unknown`.
- Dos llamadas seguidas → un solo envío (segunda `skipped` "Ya enviado…").
- `afterEach`: ningún `log.*` con teléfono, correo ni RUT.

**`tests/integration/qc-whatsapp.test.ts`**: aprobar el control con `WHATSAPP_ENABLED=false` → resultado `lista_para_retirar`, el correo sale igual, 0 filas en `order_whatsapp_notices`; con env habilitado y `whatsappSender` falso en `deps` → 1 fila `sent`; con `whatsappSender` que lanza → el control igual queda aprobado.

Ninguna prueba existente se modifica. Si `whatsapp.test.ts` o `qc.test.ts` fallan, detente y reporta con el diff.

## Documentación

- Decisión 53 en §20.3 y nota al pie de la fila "Constante: módulo WhatsApp" del §1 remitiendo a ella.
- `README.md`, "Control de calidad": "Si WhatsApp está habilitado y el cliente lo aceptó al reservar, también recibe el aviso por WhatsApp." Y en "Recordatorios → Preparación de Meta": que la plantilla `WHATSAPP_READY_TEMPLATE` recibe `[nombre, bicicleta, número de orden]` cuando el aviso sale por una orden.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0. Claude: `pnpm db:migrate`, `pnpm db:check` y `pnpm gate` → exit 0.
2. Con `pnpm dev` y `WHATSAPP_ENABLED=false`: aprobar un control y ver en el log `whatsapp.skipped` o equivalente; el correo sale igual.

## Reporte

La cola de `pnpm check`, `pnpm test` y `pnpm build`, nombre de la migración, líneas finales de `service.ts`, `order-notices.ts` y `qc.ts`, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
