Indicadores del taller: consultas del servidor

## Contexto y autorización (Andrés, 12-nov)

`src/server/taller/dashboard.ts` muestra listas operativas y, con `dashboard.finance`, solo `incomeTodayClp` y los saldos pendientes. `blueprints/roadmap/dashboard-financiero.md` define una Etapa A del panel financiero que se calcula con los datos de la fase 1, sin esquema. Andrés quiere ese módulo de consultas ahora; la pantalla viene en A-08.

Regístralo como **decisión 54** en `blueprints/vector-taller-f1/blueprint.md` §20.3, con este texto:

> **Indicadores del taller, Etapa A** (decisión del dueño, 2026-11-12, rama `feat/etapa-a`, encargos `docs/encargos/A-07-indicadores-servidor.md` y `A-08-indicadores-pantalla.md`): `/taller/indicadores` es la Etapa A de `blueprints/roadmap/dashboard-financiero.md`: solo consultas sobre datos de la fase 1 (`src/server/taller/indicators.ts`), rango Desde/Hasta de hasta 366 días en fechas locales, dinero en pesos enteros, todo por `branch_id`, solo dueño y administrador (`dashboard.finance`); recepción y mecánico reciben `null`. La "caja del día" de esta etapa es el bloque "Ingresos por medio de pago" con el rango de un día; apertura, cierre, arqueo y egresos esperan a la caja de la fase 2. Sin gráficos: tablas con `tabular-nums`. Sin cambios de esquema.

## Lee antes

`AGENTS.md`; `.claude/rules/taller-domain.md`; `.claude/rules/database.md` (solo constructor de consultas de Drizzle o `sql` parametrizado; nunca `db.query.*`).

## Rama y reparto

Rama `feat/etapa-a`, sobre el último commit. Pruebas primero; `pnpm format && pnpm check && pnpm test && pnpm build` en verde; sin commits ni push (Claude corre `pnpm gate` y commitea). Commit que hará Claude: `feat: compute the workshop indicators for a date range`.

## Reglas de negocio decididas

| Tema | Regla |
|---|---|
| Rango | `indicatorsRangeSchema = z.object({ from: z.iso.date(), to: z.iso.date() }).refine(from <= to && días(to − from) ≤ 365)`. `defaultRange(now)` = `{ from: primer día del mes local, to: hoy local }`. Instantes del rango: `from` 00:00 y `to` + 1 día 00:00 en `TIMEZONE` (como `incomeToday` en `dashboard.ts`). |
| Permiso | `workshopIndicators` devuelve `null` sin `dashboard.finance`, sin consultar nada. |
| `income` | Pagos vigentes (`voided_at is null`) de órdenes no anuladas de la sucursal con `received_at` en el rango: `{ totalClp, count, byMethod: { method, label, amountClp, count }[] }` (todos los `PAYMENT_METHODS` presentes, con 0 si no hay). |
| `payments` | Los mismos pagos, máx. 200, más recientes primero: `{ receivedAt, orderNumber, kind, method, amountClp, receivedByName }`. |
| `delivered` | Órdenes con `delivered_at` en el rango: `{ count, totalClp, averageTicketClp }` (promedio entero, 0 si no hay). |
| `ordersCreated` | Órdenes con `created_at` en el rango: `{ count, byStatus: { status, label, count }[] }` (solo estados con count > 0, en el orden de `ORDER_STATUSES`). `openNow`: órdenes no terminales hoy, por estado. |
| `topServices` | Líneas `kind = 'servicio'` vigentes de órdenes creadas en el rango, agrupadas por `description`: las 6 con más cantidad y las 6 con más monto (`quantity × unit_price_clp`). |
| `customers` | `served`: clientes distintos con órdenes creadas en el rango; `newCount`: de esos, los cuya primera orden (mínimo `created_at` de todas sus órdenes no anuladas) cae en el rango; `returningCount = served − newCount`. |
| `bookings` | Reservas con `service_date` en el rango: `received` (todas), `cancelled`, `noShow`, `converted` (con al menos una `work_orders.booking_id`), `conversionPct` (entero, sobre `received − cancelled`, 0 si no hay). Las reservas no tienen `branch_id`: se cuentan todas (como hace `activeBookings` en `dashboard.ts`). |
| `coverage` | Sobre órdenes con `received_at` en el rango: `receivedCount`, `checklistCompletePct` (las que tienen las 7 `intake_checks`), `qcApprovedPct` (`qc_approved_at` no nulo), `reportsPct` (con fila en `service_reports`). Porcentajes enteros, 0 si no hay órdenes. |

## Qué hacer

**`src/server/taller/indicators.ts` (nuevo, < 400 líneas; si no cabe, `indicators-customers.ts` con los bloques `customers`, `bookings` y `coverage`).**

```ts
export const indicatorsRangeSchema: z.ZodType<{ from: string; to: string }>;
export function defaultRange(now: Date): { from: string; to: string };
export type Indicators = { range; income; payments; delivered; ordersCreated; openNow; topServices; customers; bookings; coverage };
export async function workshopIndicators(db: AppDb, actor: SessionUser, range: { from: string; to: string }, now: Date): Promise<Indicators | null>;
```

Usa `payments`, `workOrders`, `workOrderItems`, `intakeChecks` de `schema-orders.ts`, `serviceReports` de `schema-reports.ts`, `customers` de `schema-taller.ts`, `bookings` y `users` de `schema.ts`; `PAYMENT_METHODS`, `PAYMENT_METHOD_LABELS`, `ORDER_STATUSES`, `STATUS_LABELS`, `TERMINAL_STATUSES`, `INTAKE_CHECK_KEYS` de `rules.ts`; `formatOrderNumber` de `orders.ts`; `TIMEZONE` y `localToday` como `dashboard.ts`. Funciones < 50 líneas: una por bloque.

## No cambiar

- `dashboard.ts`, `payments.ts`, `permissions.ts`, el esquema, `drizzle/`.
- Ninguna pantalla (A-08).
- Fotos por orden: sin tope.
- Ninguna prueba existente.

## Pruebas (primero, verlas fallar)

**`tests/integration/indicators.test.ts`** (PGlite; sembrar sucursal, dueño, recepción, mecánico, 3 clientes, 4 órdenes con fechas controladas, líneas con `addCatalogItem`/`addPartItem`, pagos con `recordPayment` y `voidPayment`, 2 reservas con `createBooking` y una convertida con `startReception`; `NOW = 2026-11-12T15:00:00Z`):
- Recepción y mecánico → `null`.
- `defaultRange(NOW)` → `{ from: "2026-11-01", to: "2026-11-12" }`.
- `indicatorsRangeSchema`: rango invertido falla; 366 días de diferencia falla; 365 pasa.
- `income.totalClp` excluye el pago anulado y el pago fuera del rango; `byMethod` trae los 4 medios con los montos correctos.
- `delivered.averageTicketClp` = total / count redondeado.
- `ordersCreated.byStatus` y `openNow` coinciden con lo sembrado.
- `topServices` ordena por cantidad y por monto.
- `customers`: cliente con una orden anterior al rango cuenta como recurrente.
- `bookings.converted` = 1 y `conversionPct` correcto; una reserva cancelada no cuenta en la base.
- `coverage`: la orden con 7 `intake_checks` y QC cuenta; la otra no.
- Otra sucursal: sus pagos y órdenes no aparecen.
- `afterEach`: ningún `log.*` con correo, teléfono ni RUT.

Ninguna prueba existente se modifica.

## Documentación

Decisión 54 en §20.3 (el README se actualiza en A-08, con la pantalla).

## Verificación

Codex: `pnpm test tests/integration/indicators.test.ts` → 0 failed y `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0. Claude: `pnpm gate` → exit 0.

## Reporte

La cola de `pnpm check`, `pnpm test` y `pnpm build`, líneas finales de `indicators.ts` (y del archivo auxiliar si lo hubo), y cualquier prueba existente que haya fallado y por qué, sin modificarla.
