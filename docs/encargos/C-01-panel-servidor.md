Panel de indicadores, Etapa C: consultas del servidor

## Contexto y autorización (Andrés, 26-nov)

`/taller/indicadores` (decisión 54, encargos A-07, A-08 y F2-34) calcula en `src/server/taller/indicators.ts`, `indicators-finance.ts` e `indicators-customers.ts` casi todo lo que el dueño necesita, pero no compara con el período anterior ni entrega series para gráficos. Andrés quiere convertir esa pantalla en el panel completo de `blueprints/roadmap/dashboard-financiero.md` ("El taller en una mirada", "Cómo se movió el dinero", "Qué está moviendo el taller", "De consultas a clientes", "Una operación bajo control"). Este encargo deja las consultas nuevas; la pantalla viene en C-02.

Regístralo como **decisión BG-D55** en `blueprints/bike-garage/blueprint.md` §20.3 (nueva fila de la tabla después de `BG-D54`, mismas cinco columnas), con este texto:

> **Panel de indicadores, Etapa C** (decisión del dueño, 2026-11-26, rama `feat/panel-indicadores`, encargos `docs/encargos/C-01-panel-servidor.md` y `C-02-panel-pantalla.md`): `/taller/indicadores` pasa a ser el panel de la hoja de ruta `blueprints/roadmap/dashboard-financiero.md`, con la misma ruta, el mismo permiso `dashboard.finance` y la misma entrada del menú. Las consultas nuevas viven en `src/server/taller/indicators-dashboard.ts`, `indicators-series.ts` e `indicators-funnels.ts`, siempre por `branch_id`, con `now` por parámetro y `null` sin permiso. Entra la comparación contra el período anterior (mismo largo, termina el día anterior a Desde; sin base, la variación es `null`). "Cotizaciones" son los adicionales por orden (`work_order_approvals`), no existe una entidad de cotización suelta. Quedan fuera, para encargos posteriores, las metas de ingreso (esquema) y los reportes descargables. Las tablas de la Etapa A y B se conservan al pie de la pantalla como "Detalle del período": ninguna prueba existente se modifica. | Dejar la pantalla en tablas o construir una página nueva `/taller/panel` | Es la misma pantalla para la misma persona; las pruebas y el menú siguen válidos | Se decide guardar metas por taller o exportar reportes

## Lee antes

`AGENTS.md`; `.claude/rules/taller-domain.md`; `.claude/rules/database.md` (solo constructor de consultas de Drizzle o `sql` parametrizado; nunca `db.query.*`; nunca editar `drizzle/`).

## Rama y reparto

Rama `feat/panel-indicadores`, sobre el último commit (árbol limpio). Pruebas primero, en rojo; `pnpm format && pnpm check && pnpm test && pnpm build` en verde; sin commits ni push (Claude corre `pnpm gate` y commitea: `feat: compute the indicators dashboard blocks`). Escribe primero y verifica una vez al final. El sandbox no tiene red: no corras `pnpm db:*`, `pnpm test:tablet`, `pnpm smoke` ni `pnpm gate`.

## Reglas de negocio decididas

| Tema | Regla |
|---|---|
| Permiso | Toda función exportada devuelve `null` sin `can(actor.role, "dashboard.finance")`, sin consultar nada. Ningún costo (`cost_clp`, `unit_cost_clp`, `fee_clp`, `net_clp`) sale de estos módulos: no hay nada que omitir por rol, y la prueba lo afirma. |
| Rango | El mismo `indicatorsRangeSchema` de `indicators.ts` (`parse` al entrar). Límites de día local como el `rangeBounds` privado de `indicators-finance.ts` (`TIMEZONE`, `from` 00:00 y `to` + 1 día 00:00): copia la función con el mismo comentario, no exportes nada nuevo de los módulos existentes. |
| `previousRange(range)` | Mismo número de días, terminando el día anterior a `from`: para `{ from: "2026-11-01", to: "2026-11-30" }` → `{ from: "2026-10-02", to: "2026-10-31" }`; para un solo día `{ from: "2026-11-20", to: "2026-11-20" }` → `{ from: "2026-11-19", to: "2026-11-19" }`. Fechas con luxon en `TIMEZONE`. |
| `Delta` | `{ currentClp, previousClp, deltaPct }` con `deltaPct = Math.round((current − previous) × 100 / previous)` si `previous > 0`; si no, `null`. |
| `headline.income` | Bruto de **todos** los pagos vigentes de la sucursal (órdenes y ventas, `voided_at is null`, `received_at` en el rango): la misma definición que `income().grossClp` de `indicators-finance.ts`. La prueba afirma que coincide con `financeIndicators(...).income.grossClp`. |
| `headline.averageTicket` | Como `delivered().averageTicketClp` de `indicators.ts`: órdenes no anuladas con `delivered_at` en el rango, `round(sum(total_clp) / count)`, 0 sin entregas. |
| `headline.netBalance` | Como `balanceClp` de `indicators-finance.ts`: `netOfGross` de los pagos vigentes − `netOfGross` de las devoluciones (`cash_movements` `egreso` con `reference_kind` en `sale_refund`/`order_refund`, `created_at` en el rango, vigentes) − egresos vigentes con `expense_date` entre `from` y `to`. La prueba afirma que coincide con `financeIndicators(...).balanceClp`. |
| `headline.openOrders` | `count`: órdenes no anuladas en estado no terminal (`TERMINAL_STATUSES`) hoy, sin importar el rango. `avgDaysToClose`: promedio entero de `delivered_at − received_at` en días (`extract(epoch …) / 86400`) de las órdenes entregadas en el rango con `received_at` no nulo; 0 si no hay. |
| `rhythm` | `activeDays`: días locales distintos del rango con al menos una orden creada (no anulada). `ordersPerActiveDay`: órdenes creadas en el rango / `activeDays`, redondeado a 1 decimal (`Math.round(x * 10) / 10`), 0 sin días activos. `amountToReview`: `{ count, totalClp }` de las órdenes no anuladas, no terminales, con `total_clp > paid_clp` (`totalClp` = suma de `total_clp − paid_clp`). |
| `daily` | Un elemento por cada día local del rango, en orden, con `date` `yyyy-MM-dd`, `incomeClp` (pagos vigentes por `received_at` convertido a día local: `to_char(received_at at time zone 'America/Santiago', 'YYYY-MM-DD')` con `TIMEZONE` parametrizado) y `expensesClp` (egresos vigentes por `expense_date`). Días sin movimiento van con 0. `averageDailyIncomeClp` = `round(suma de ingresos / cantidad de días del rango)`. `bestDay` = el día con mayor `incomeClp` (el primero en caso de empate), `null` si la suma es 0. `activeDays` = días con `incomeClp > 0`. |
| `weekday` | Siempre 7 elementos, lunes a domingo: `{ weekday: 1…7, label: "Lun" … "Dom", count }` con las órdenes no anuladas creadas en el rango según `extract(isodow from created_at at time zone …)`. Las etiquetas viven en una constante del módulo (`WEEKDAY_LABELS`); no son del taller, no van a `rules.ts`. |
| `ages` | Órdenes abiertas hoy (no anuladas, no terminales) por días transcurridos desde `received_at`, o `created_at` si no hay recepción: `floor((now − fecha) / 86 400 000)`. Siempre 4 elementos: `{ bucket: "0-3", label: "0 a 3 días" }`, `{ "4-7", "4 a 7 días" }`, `{ "8-14", "8 a 14 días" }`, `{ "15+", "15 días o más" }`, cada uno con `count`. Se calcula en TypeScript sobre las fechas leídas, con el `now` recibido. |
| `approvals` | Adicionales (`work_order_approvals`) de la sucursal, no anulados, con `created_at` en el rango, de órdenes no anuladas: `created` (todos), `pending` (`decision is null`), `approved` (`aprobado`), `rejected` (`rechazado`), `acceptedValueClp` (suma de `price_clp` de los aprobados), `conversionPct = round(approved × 100 / (approved + rejected))`, 0 sin decididos. |
| `bookingsPending` | Reservas de la sucursal con `service_date` entre `from` y `to`, `status = 'confirmed'` y sin orden vigente con ese `booking_id` (mismo `exists` que `bookingIndicators`). |
| `returnedNewCount` | Clientes cuya primera orden (mínimo `created_at` de sus órdenes no anuladas) cae en el rango **y** que tienen 2 o más órdenes creadas en el rango. Misma subconsulta de historial que `customerIndicators`, replicada en el módulo nuevo. |
| `paymentQuality` | Sobre las órdenes no anuladas con `delivered_at` en el rango: `deliveredCount`; `withoutPaymentCount` = con `total_clp > 0` y sin ningún pago vigente (`payments.work_order_id`, `voided_at is null`); `completePct = round((deliveredCount − withoutPaymentCount) × 100 / deliveredCount)`, 0 sin entregas; `amountToReviewClp` = suma de `total_clp` de las que no tienen pago. |
| Sucursal | Toda consulta filtra por `actor.branchId` (también las de `bookings`, `payments`, `expenses`, `cash_movements`, `work_order_approvals`). |
| Reloj | `now` llega por parámetro y se usa para `openOrders`, `ages` y `rhythm`; nunca `new Date()`. Funciones < 50 líneas; archivos < 400. |

## Qué hacer

**`src/server/taller/indicators-dashboard.ts` (nuevo, < 300 líneas).**

```ts
export type Range = { from: string; to: string };
export type Delta = { currentClp: number; previousClp: number; deltaPct: number | null };
export type DashboardIndicators = {
  range: Range;
  previous: Range;
  headline: {
    income: Delta;
    averageTicket: Delta;
    netBalance: Delta;
    openOrders: { count: number; avgDaysToClose: number };
  };
  rhythm: {
    activeDays: number;
    ordersPerActiveDay: number;
    amountToReview: { count: number; totalClp: number };
  };
  daily: DailySeries;        // de indicators-series.ts
  weekday: WeekdayCount[];   // de indicators-series.ts
  ages: AgeBucket[];         // de indicators-series.ts
  approvals: ApprovalsFunnel;            // de indicators-funnels.ts
  bookingsPending: number;
  returnedNewCount: number;
  paymentQuality: PaymentQuality;        // de indicators-funnels.ts
};
export function previousRange(range: Range): Range;
export async function dashboardIndicators(db: AppDb, actor: SessionUser, range: Range, now: Date): Promise<DashboardIndicators | null>;
```

Dentro: una función privada `periodTotals(db, actor, range)` que devuelve `{ grossClp, netClp, refundsClp, expensesClp, deliveredCount, deliveredTotalClp }` para un rango (se llama dos veces, rango actual y anterior, en el mismo `Promise.all` que el resto de los bloques); `delta(current, previous)`; `openOrders`; `rhythm`. Usa `payments` (`schema-payments.ts`), `workOrders` (`schema-orders.ts`), `cashMovements` y `expenses` (`schema-cash.ts`), `netOfGross` y `TERMINAL_STATUSES` (`rules.ts`), `TIMEZONE` (`src/lib/time.ts`), `can` (`permissions.ts`).

**`src/server/taller/indicators-series.ts` (nuevo, < 250 líneas).**

```ts
export type DailyPoint = { date: string; incomeClp: number; expensesClp: number };
export type DailySeries = { days: DailyPoint[]; averageDailyIncomeClp: number; bestDay: { date: string; incomeClp: number } | null; activeDays: number };
export type WeekdayCount = { weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7; label: string; count: number };
export type AgeBucket = { bucket: "0-3" | "4-7" | "8-14" | "15+"; label: string; count: number };
export async function dailySeries(db: AppDb, actor: SessionUser, range: Range): Promise<DailySeries>;
export async function ordersByWeekday(db: AppDb, actor: SessionUser, range: Range): Promise<WeekdayCount[]>;
export async function openOrderAges(db: AppDb, actor: SessionUser, now: Date): Promise<AgeBucket[]>;
```

Estas tres no revisan permiso (solo las llama `dashboardIndicators`, que ya lo revisó); documenta eso en un comentario de una línea sobre cada una.

**`src/server/taller/indicators-funnels.ts` (nuevo, < 250 líneas).**

```ts
export type ApprovalsFunnel = { created: number; pending: number; approved: number; rejected: number; acceptedValueClp: number; conversionPct: number };
export type PaymentQuality = { deliveredCount: number; withoutPaymentCount: number; completePct: number; amountToReviewClp: number };
export async function approvalsFunnel(db: AppDb, actor: SessionUser, range: Range): Promise<ApprovalsFunnel>;
export async function bookingsPending(db: AppDb, actor: SessionUser, range: Range): Promise<number>;
export async function returnedNewCount(db: AppDb, actor: SessionUser, range: Range): Promise<number>;
export async function paymentQuality(db: AppDb, actor: SessionUser, range: Range): Promise<PaymentQuality>;
```

Mismo contrato sin permiso que las series. `workOrderApprovals` y `workOrders` de `schema-orders.ts`, `bookings` de `schema.ts`, `customers` de `schema-taller.ts`, `payments` de `schema-payments.ts`.

## No cambiar

- `indicators.ts`, `indicators-finance.ts`, `indicators-customers.ts`, `dashboard.ts`, `rules.ts`, `permissions.ts`, `src/lib/time.ts` (solo importar).
- El esquema y `drizzle/`. Ninguna pantalla (C-02). `README.md` se toca en C-02.
- Ninguna prueba existente (en particular `indicators.test.ts`, `indicators-finance.test.ts`, `indicadores-page.test.ts`, `indicadores-finance-page.test.ts`). Si una falla, detente y reporta con el diff.
- Fotos por orden: sin tope.

## Pruebas (primero, verlas fallar)

**`tests/integration/indicators-dashboard.test.ts`** (PGlite con `createTestDb`; sembrado como `tests/integration/indicators-finance.test.ts`: sucursal, un usuario por rol de `ROLES`, cliente y bici, con helpers locales `order`, `pay`, `expense`; `NOW = 2026-11-20T15:00:00Z`, `RANGE = { from: "2026-11-01", to: "2026-11-30" }`, `PREVIOUS = { from: "2026-10-02", to: "2026-10-31" }`):
- Recepción y mecánico → `null`; dueño y administración → objeto.
- `previousRange`: el caso del mes y el caso de un día de la tabla.
- `headline.income`: un pago de $11.900 el 14-nov y uno de $10.000 el 15-oct → `{ currentClp: 11900, previousClp: 10000, deltaPct: 19 }`; sin pagos en octubre → `deltaPct: null`; un pago anulado (`voided_at`) no cuenta; coincide con `financeIndicators(db, owner, RANGE, NOW).income.grossClp`.
- `headline.netBalance` coincide con `financeIndicators(...).balanceClp` con un egreso de $8.000 (`expense_date` en el rango) y una devolución.
- `headline.averageTicket`: dos entregas de $10.000 y $20.000 en el rango → `currentClp: 15000`.
- `headline.openOrders`: 2 abiertas y 1 entregada → `count: 2`; entregada con `received_at` 10-nov y `delivered_at` 14-nov → `avgDaysToClose: 4`.
- `rhythm`: 3 órdenes creadas en 2 días distintos → `activeDays: 2`, `ordersPerActiveDay: 1.5`; una abierta con `total_clp: 11900, paid_clp: 1900` → `amountToReview: { count: 1, totalClp: 10000 }`.
- `daily`: 30 elementos; el pago del 14-nov aparece en `2026-11-14` y el egreso del 20-nov en `2026-11-20`; `bestDay.date === "2026-11-14"`; `activeDays: 1`; `averageDailyIncomeClp === Math.round(11900 / 30)`; sin pagos → `bestDay: null`. Un pago recibido `2026-11-14T02:30:00Z` (23:30 del 13 en Chile) cae en `2026-11-13`.
- `weekday`: siempre 7; una orden creada `2026-11-17T15:00:00Z` (martes) → `weekday: 2`, `label: "Mar"`, `count: 1`.
- `ages`: abiertas con `received_at` hace 1, 5, 10 y 20 días → un `count: 1` en cada bucket; una sin `received_at` usa `created_at`.
- `approvals`: tres adicionales (`price_clp` 5.000 pendiente, 7.000 aprobado, 3.000 rechazado) → `{ created: 3, pending: 1, approved: 1, rejected: 1, acceptedValueClp: 7000, conversionPct: 50 }`; uno anulado y uno de octubre no cuentan.
- `bookingsPending`: dos reservas `confirmed` en el rango, una con orden (`booking_id`) → `1`; una `cancelled` no cuenta.
- `returnedNewCount`: cliente nuevo con 2 órdenes en el rango → `1`; cliente con una orden anterior al rango y 2 en el rango → `0`.
- `paymentQuality`: dos entregadas, una con pago vigente y una con `total_clp: 11900` sin pagos → `{ deliveredCount: 2, withoutPaymentCount: 1, completePct: 50, amountToReviewClp: 11900 }`.
- El objeto serializado (`JSON.stringify`) no contiene `cost`, `fee` ni `net_clp`.
- `afterEach` como `indicators.test.ts`: ningún `log.info/warn/error` con correo, teléfono ni RUT.

**`tests/integration/indicators-dashboard-isolation.test.ts`** (`seedTwoShops` de `tests/helpers/two-shops.ts`): un pago, una orden abierta, un adicional y un egreso en cada taller con montos distintos; `dashboardIndicators(db, vector.owner, …)` solo ve lo de Vector y `dashboardIndicators(db, demo.owner, …)` solo lo del demo (`headline.income.currentClp`, `headline.openOrders.count`, `approvals.created`, `daily` del día sembrado, `rhythm.amountToReview`).

Ninguna prueba existente se modifica.

## Documentación

- Decisión BG-D55 en `blueprints/bike-garage/blueprint.md` §20.3 con el texto de arriba.

## Verificación

1. Codex: `pnpm test tests/integration/indicators-dashboard.test.ts tests/integration/indicators-dashboard-isolation.test.ts` → 0 failed, y `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0.
2. Claude: `pnpm gate` → exit 0.

## Reporte

Archivos creados con sus líneas finales, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la consulta SQL que usaste para el día local de `daily` (para revisarla), y cualquier prueba existente que haya fallado y por qué, sin modificarla.
