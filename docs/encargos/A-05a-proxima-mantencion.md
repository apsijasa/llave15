Próxima mantención planificada en el informe

## Contexto y autorización (Andrés, 12-nov)

El informe final (`src/server/taller/reports.ts`, página `src/pages/taller/ordenes/[id]/informe.astro`) guarda "Próximas revisiones" como texto libre dentro del `snapshot`. No hay una fecha estructurada, así que nada puede recordarle al cliente que le toca mantención. Andrés quiere que, al generar el informe, el taller fije (o descarte) la fecha sugerida de la próxima mantención con una nota, que el cliente la vea en el informe público, y que después (encargo A-05b) una tarea diaria mande el recordatorio.

Regístralo como **decisión 52** en `blueprints/vector-taller-f1/blueprint.md` §20.3, con este texto:

> **Próxima mantención planificada** (decisión del dueño, 2026-11-12, rama `feat/etapa-a`, encargo `docs/encargos/A-05a-proxima-mantencion.md`): la próxima mantención se guarda en `service_reports` (`next_maintenance_date date`, `next_maintenance_note text`, `maintenance_reminder_sent_at timestamptz`), no en `work_orders`: se decide en el mismo formulario del informe, `schema-orders.ts` está en su límite de líneas y una orden sin informe no promete nada. La sugerencia por defecto es `MAINTENANCE_INTERVAL_MONTHS = 6` desde la fecha del informe (zona `America/Santiago`); dejar la fecha vacía significa "sin recordatorio". El `snapshot` v1 del informe no cambia; el cliente ve "Próxima mantención sugerida" en la página pública. Cambiar la fecha reinicia el recordatorio.

## Lee antes

`AGENTS.md`; `.claude/rules/database.md`; `.claude/rules/taller-domain.md`; `.claude/rules/taller-ui.md`; `.claude/rules/server-api.md`.

## Rama y reparto

Rama `feat/etapa-a`, sobre el último commit. Pruebas primero; `pnpm format && pnpm check && pnpm test && pnpm build` en verde; sin commits ni push (Claude corre `pnpm gate` y commitea). Commits que hará Claude: `feat: plan the next maintenance date when generating the report` y `docs: record the planned maintenance as decision 52`.

## Reglas de negocio decididas

| Tema | Regla |
|---|---|
| Columnas | En `service_reports`: `next_maintenance_date date null`, `next_maintenance_note text null`, `maintenance_reminder_sent_at timestamptz null`; índice `idx_service_reports_maintenance` sobre (`next_maintenance_date`, `maintenance_reminder_sent_at`). Aditivo. |
| Constantes | En `src/server/taller/rules.ts`: `MAINTENANCE_INTERVAL_MONTHS = 6`, `MAINTENANCE_REMINDER_DAYS_BEFORE = 7`, `MAINTENANCE_REMINDER_GRACE_DAYS = 30` (las dos últimas las usa A-05b). |
| Sugerencia | `suggestedMaintenanceDate(now)` = hoy local + 6 meses, `yyyy-MM-dd`. El campo del formulario viene prellenado con ella cuando no hay informe previo; si hay informe, con la fecha guardada (o vacío si se descartó). |
| Validación | `maintenancePlanSchema = z.object({ nextMaintenanceDate: z.iso.date().nullable(), nextMaintenanceNote: z.string().trim().max(300) })`. La fecha vacía del formulario se traduce a `null`. Una fecha anterior a hoy → `validation_error`. |
| Permiso | `reports.generate`. Exige que exista un informe para la orden (`not_found` si no). |
| Reinicio | Si la fecha cambia respecto de la guardada, `maintenance_reminder_sent_at` vuelve a `null`. Si es la misma, se conserva. |
| Auditoría | `report.maintenance_planned` con `{ nextMaintenanceDate }` (agregar al tipo `AuditAction` en `audit.ts`). |
| Informe público | Bajo "Próximas revisiones", si hay fecha: "Próxima mantención sugerida: 12 de mayo de 2027" y la nota. |

## Esquema

`src/server/db/schema-reports.ts`: las tres columnas y el índice en `serviceReports`. `pnpm db:generate` → `drizzle/0026_*.sql` (solo `alter table … add column` × 3 y `create index`). `pnpm db:migrate` y `pnpm db:check` los corre Claude contra la base dev.

## Qué hacer

**`src/server/taller/rules.ts`**: las tres constantes al final.

**`src/server/taller/audit.ts`**: `"report.maintenance_planned"` en `AuditAction`.

**`src/server/taller/maintenance-plan.ts` (nuevo, < 200 líneas).**

```ts
export const maintenancePlanSchema: z.ZodType<{ nextMaintenanceDate: string | null; nextMaintenanceNote: string }>;
export function suggestedMaintenanceDate(now: Date): string;
export async function setMaintenancePlan(db: AppDb, actor: SessionUser, orderId: string, input: unknown, now: Date):
  Promise<{ ok: true } | { ok: false; code: "forbidden" | "not_found" | "validation_error" }>;
export async function getMaintenancePlan(db: AppDb, actor: SessionUser, orderId: string):
  Promise<{ nextMaintenanceDate: string | null; nextMaintenanceNote: string } | null>;
export async function maintenancePlanByToken(db: AppDb, token: string):
  Promise<{ nextMaintenanceDate: string; nextMaintenanceNote: string } | null>;
```

`setMaintenancePlan` corre en una transacción: `select … for update` sobre `service_reports` por `work_order_id` y `branch_id`; `update` con las columnas y `updated_at = now`; `maintenance_reminder_sent_at = null` solo si la fecha cambió; `recordAudit`. `maintenancePlanByToken` valida con `shareTokenSchema`, busca por `share_token_hash` y devuelve `null` si no hay fecha. Fechas con luxon y `TIMEZONE` (`src/server/booking/rules.ts`); `localToday` de `src/server/booking/slots.ts`.

**`src/pages/taller/ordenes/[id]/informe.astro` (132 líneas → ≤ 175).** En el mismo formulario, después de "Próximas revisiones": `<div class="field"><label for="nextMaintenanceDate">Próxima mantención sugerida</label><input id="nextMaintenanceDate" name="nextMaintenanceDate" type="date" value={plan.nextMaintenanceDate ?? ""} /></div>` y `<div class="field"><label for="nextMaintenanceNote">Nota para el cliente (opcional)</label><input id="nextMaintenanceNote" name="nextMaintenanceNote" type="text" maxlength="300" value={plan.nextMaintenanceNote} /></div>`, con una ayuda "Déjala vacía si no quieres que le avisemos." En el POST, después de `generateReport` ok: `maintenancePlanSchema.safeParse({ nextMaintenanceDate: form.get("nextMaintenanceDate") || null, nextMaintenanceNote: form.get("nextMaintenanceNote") ?? "" })` → `setMaintenancePlan`; si falla la validación, 422 con "La fecha de la próxima mantención no puede ser anterior a hoy y la nota admite hasta 300 caracteres." y `aria-invalid` en el campo. Valor inicial del campo: `getMaintenancePlan` si hay informe; si no, `suggestedMaintenanceDate(now)`.

**`src/pages/informe/[token].astro`**: tras `viewReportByToken`, `const plan = report ? await maintenancePlanByToken(db, token) : null` y, debajo de `<ReportView …/>`, `{plan && <section><h2>Próxima mantención sugerida</h2><p>{fecha larga es-CL}</p>{plan.nextMaintenanceNote && <p>{plan.nextMaintenanceNote}</p>}</section>}`.

## No cambiar

- `src/server/taller/reports.ts`, `snapshotSchema`, `generateReport`, `ReportView.astro`.
- `src/server/db/schema-orders.ts`; `drizzle/` a mano.
- La tarea diaria y el correo de recordatorio: encargo A-05b.
- Ninguna prueba existente (`reports.test.ts`, `report-page.test.ts`, `report-view.test.ts`, `foundation.test.ts` deben pasar).
- Fotos por orden: sin tope.

## Pruebas (primero, verlas fallar)

**`tests/integration/maintenance-plan.test.ts`** (PGlite; sembrar orden `lista_para_retirar` y generar el informe con `generateReport` como en `report-page.test.ts`):
- `suggestedMaintenanceDate(new Date("2026-11-12T15:00:00Z"))` → `"2027-05-12"`; en el límite del año (`2026-08-31` → `2027-02-28`).
- `setMaintenancePlan` con fecha y nota → `ok`; `getMaintenancePlan` las devuelve; fila de auditoría `report.maintenance_planned`.
- Fecha `null` → `ok` y `getMaintenancePlan().nextMaintenanceDate === null`.
- Fecha anterior a hoy → `validation_error`; nota de 301 caracteres → `validation_error`.
- Sin informe generado → `not_found`; mecánico → `forbidden`; otra sucursal → `not_found`.
- Con `maintenance_reminder_sent_at` seteado a mano: misma fecha → se conserva; fecha distinta → `null`.
- `maintenancePlanByToken(token)` devuelve fecha y nota; token inválido o informe sin fecha → `null`.
- `afterEach`: ningún `log.*` con correo, teléfono ni token.

**`tests/integration/informe-mantencion-page.test.ts`** (patrón de `users-admin.test.ts` con `loginAdmin` y cookie; mock de `getDb` y de `getStorage`): POST con `recommendations`, `nextChecks`, `nextMaintenanceDate=2027-05-12`, `nextMaintenanceNote=Cambio de cadena` y `Origin` del sitio → 200 con el enlace del informe, y `getMaintenancePlan` devuelve la fecha; POST con fecha `2020-01-01` → 422 y el mensaje; GET sin informe previo muestra el `input` con la fecha sugerida; la página pública `/informe/[token]` muestra "Próxima mantención sugerida" y "12 de mayo de 2027".

Ninguna prueba existente se modifica. Si una falla, detente y reporta con el diff.

## Documentación

- Decisión 52 en §20.3.
- `README.md`, "Informe e historial": "El formulario trae la fecha sugerida de la próxima mantención (seis meses) y una nota; el cliente la ve en el informe y, si la dejas, recibirá un recordatorio una semana antes. Déjala vacía para no avisar."

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0. Claude: `pnpm db:migrate`, `pnpm db:check` y `pnpm gate` → exit 0.
2. Con `pnpm dev`: generar un informe con fecha y abrir el enlace público: aparece "Próxima mantención sugerida".

## Reporte

La cola de `pnpm check`, `pnpm test` y `pnpm build`, nombre de la migración, líneas finales de `informe.astro` y `maintenance-plan.ts`, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
