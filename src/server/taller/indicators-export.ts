import { and, eq, gte, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import type { CsvCell } from "../../lib/csv.ts";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { workOrderItems, workOrders } from "../db/schema-orders.ts";
import { users } from "../db/schema.ts";
import { dashboardIndicators } from "./indicators-dashboard.ts";
import type { DashboardIndicators, Delta, Range } from "./indicators-dashboard.ts";
import { exportBounds, ledgerRows } from "./indicators-export-ledger.ts";
import { financeIndicators } from "./indicators-finance.ts";
import type { FinanceIndicators } from "./indicators-finance.ts";
import { indicatorsRangeSchema, workshopIndicators } from "./indicators.ts";
import type { Indicators } from "./indicators.ts";
import { TERMINAL_STATUSES, withLegacyStatuses } from "./rules.ts";

export const REPORT_KINDS = ["ingresos-egresos", "resumen", "mecanicos"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
const decimal = (value: number | null): CsvCell =>
  value === null ? null : String(value).replace(".", ",");
function overviewRows(d: DashboardIndicators): CsvCell[][] {
  const delta = (label: string, value: Delta): CsvCell[] => [
    "Visión general",
    label,
    value.currentClp,
    "CLP",
    value.previousClp,
    decimal(value.deltaPct),
  ];
  const row = (label: string, value: number, unit: string): CsvCell[] => [
    "Visión general",
    label,
    Number.isInteger(value) ? value : decimal(value),
    unit,
  ];
  return [
    delta("Ingresos", d.headline.income),
    delta("Ticket promedio", d.headline.averageTicket),
    delta("Balance neto", d.headline.netBalance),
    row("Trabajos abiertos", d.headline.openOrders.count, "órdenes"),
    row("Días promedio para cerrar", d.headline.openOrders.avgDaysToClose, "días"),
    row("Trabajos por día activo", d.rhythm.ordersPerActiveDay, "órdenes"),
    row("Monto por revisar", d.rhythm.amountToReview.totalClp, "CLP"),
    row("Cantidad por revisar", d.rhythm.amountToReview.count, "órdenes"),
  ];
}
function financeRows(i: Indicators, f: FinanceIndicators): CsvCell[][] {
  const row = (label: string, value: number, unit = "CLP"): CsvCell[] => [
    "Lectura financiera",
    label,
    unit === "%" ? decimal(value) : value,
    unit,
  ];
  const retained =
    f.income.netClp > 0 ? Math.max(0, Math.round((f.balanceClp * 100) / f.income.netClp)) : 0;
  return [
    row("Gastos", f.expenses.totalClp),
    row("% retenido", retained, "%"),
    row("Gastos / ingresos", f.expenseRatioPct, "%"),
    row("Servicios", f.mix.servicesClp),
    row("Repuestos", f.mix.partsClp),
    row("Ventas de mostrador", f.mix.counterSalesClp),
    ...i.income.byMethod.map((item) => row(`Ingresos: ${item.label}`, item.amountClp)),
    ...f.expenses.byCategory.map((item) => row(`Gastos: ${item.label}`, item.amountClp)),
  ];
}
function opportunityRows(i: Indicators, d: DashboardIndicators): CsvCell[][] {
  const clients = (label: string, value: number): CsvCell[] => [
    "Clientes",
    label,
    value,
    "clientes",
  ];
  const funnel = (label: string, value: number, unit: string): CsvCell[] => [
    "Reservas y adicionales",
    label,
    unit === "%" ? decimal(value) : value,
    unit,
  ];
  return [
    clients("Atendidos", i.customers.served),
    clients("Nuevos", i.customers.newCount),
    clients("Recurrentes", i.customers.returningCount),
    clients("Nuevos que volvieron", d.returnedNewCount),
    funnel("Reservas recibidas", i.bookings.received, "reservas"),
    funnel("Reservas pendientes", d.bookingsPending, "reservas"),
    funnel("Reservas convertidas", i.bookings.converted, "reservas"),
    funnel("Conversión de reservas", i.bookings.conversionPct, "%"),
    funnel("Adicionales creados", d.approvals.created, "órdenes"),
    funnel("Adicionales aprobados", d.approvals.approved, "órdenes"),
    funnel("Adicionales rechazados", d.approvals.rejected, "órdenes"),
    funnel("Valor aceptado", d.approvals.acceptedValueClp, "CLP"),
    funnel("Conversión de adicionales", d.approvals.conversionPct, "%"),
  ];
}
function controlRows(i: Indicators, f: FinanceIndicators, d: DashboardIndicators): CsvCell[][] {
  const row = (label: string, value: number, unit: string): CsvCell[] => [
    "Control",
    label,
    unit === "%" ? decimal(value) : value,
    unit,
  ];
  return [
    row("Cobertura de checklist", i.coverage.checklistCompletePct, "%"),
    row("Control de calidad", i.coverage.qcApprovedPct, "%"),
    row("Informes", i.coverage.reportsPct, "%"),
    row("Productos activos", f.inventory.activeCount, "productos"),
    row("Bajo mínimo", f.inventory.lowStockCount, "productos"),
    row("Sin stock", f.inventory.outOfStockCount, "productos"),
    row("Calidad de pago", d.paymentQuality.completePct, "%"),
    row("Entregadas sin pago", d.paymentQuality.withoutPaymentCount, "órdenes"),
    row("Monto entregado por revisar", d.paymentQuality.amountToReviewClp, "CLP"),
    ...(f.inventory.valueAtCostClp === undefined
      ? []
      : [row("Valor de inventario", f.inventory.valueAtCostClp, "CLP")]),
    ...(f.partsMarginClp === undefined
      ? []
      : [row("Margen de repuestos", f.partsMarginClp, "CLP")]),
  ];
}
async function summaryRows(
  db: AppDb,
  actor: SessionUser,
  range: Range,
  now: Date,
): Promise<CsvCell[][]> {
  const [i, f, d] = await Promise.all([
    workshopIndicators(db, actor, range, now),
    financeIndicators(db, actor, range, now),
    dashboardIndicators(db, actor, range, now),
  ]);
  if (!i || !f || !d) return [];
  return [
    ["Sección", "Indicador", "Valor", "Unidad", "Período anterior", "Variación (%)"],
    ["Período", "Desde", range.from],
    ["Período", "Hasta", range.to],
    ...overviewRows(d),
    ...financeRows(i, f),
    ...opportunityRows(i, d),
    ...controlRows(i, f, d),
  ];
}
function mechanicServices(db: AppDb, branchId: string) {
  return db
    .select({
      amount: sql<number>`coalesce(sum(${workOrderItems.quantity}::bigint * ${workOrderItems.unitPriceClp}), 0)`,
    })
    .from(workOrderItems)
    .where(
      and(
        eq(workOrderItems.branchId, branchId),
        eq(workOrderItems.workOrderId, workOrders.id),
        isNull(workOrderItems.voidedAt),
        eq(workOrderItems.kind, "servicio"),
      ),
    );
}
async function mechanicOrders(db: AppDb, actor: SessionUser, range: Range) {
  const bounds = exportBounds(range);
  const delivered = and(
    gte(workOrders.deliveredAt, bounds.start),
    lt(workOrders.deliveredAt, bounds.end),
  );
  const opened = notInArray(workOrders.status, withLegacyStatuses(TERMINAL_STATUSES));
  const services = mechanicServices(db, actor.branchId);
  return db
    .select({
      mechanicId: workOrders.assignedMechanicId,
      name: users.name,
      count: sql<number>`count(*) filter (where ${delivered})`.mapWith(Number),
      amount:
        sql<number>`coalesce(sum(${workOrders.totalClp}) filter (where ${delivered}), 0)`.mapWith(
          Number,
        ),
      services: sql<number>`coalesce(sum((${services})) filter (where ${delivered}), 0)`.mapWith(
        Number,
      ),
      days: sql<
        number | null
      >`avg(extract(epoch from (${workOrders.deliveredAt} - ${workOrders.receivedAt})) / 86400) filter (where ${delivered})`.mapWith(
        Number,
      ),
      open: sql<number>`count(*) filter (where ${opened})`.mapWith(Number),
    })
    .from(workOrders)
    .leftJoin(
      users,
      and(eq(users.id, workOrders.assignedMechanicId), eq(users.branchId, actor.branchId)),
    )
    .where(
      and(
        eq(workOrders.branchId, actor.branchId),
        isNull(workOrders.voidedAt),
        or(delivered, opened),
      ),
    )
    .groupBy(workOrders.assignedMechanicId, users.name);
}
async function mechanicRows(db: AppDb, actor: SessionUser, range: Range): Promise<CsvCell[][]> {
  const rows = await mechanicOrders(db, actor, range);
  rows.sort(
    (a, b) =>
      b.amount - a.amount || (a.name ?? "Sin asignar").localeCompare(b.name ?? "Sin asignar"),
  );
  return [
    [
      "Mecánico",
      "Órdenes entregadas",
      "Monto entregado",
      "Monto de servicios",
      "Días promedio de cierre",
      "Órdenes abiertas hoy",
    ],
    ...rows.map((row): CsvCell[] => [
      row.name ?? "Sin asignar",
      row.count,
      row.amount,
      row.services,
      row.days === null ? null : Math.round(row.days),
      row.open,
    ]),
  ];
}
export async function exportIndicatorsReport(
  db: AppDb,
  actor: SessionUser,
  kind: ReportKind,
  range: Range,
  now: Date,
): Promise<{ ok: true; filename: string; rows: CsvCell[][] } | { ok: false; code: "forbidden" }> {
  if (!can(actor.role, "dashboard.finance")) return { ok: false, code: "forbidden" };
  const parsed = indicatorsRangeSchema.parse(range);
  const rows =
    kind === "ingresos-egresos"
      ? await ledgerRows(db, actor, parsed, now)
      : kind === "resumen"
        ? await summaryRows(db, actor, parsed, now)
        : await mechanicRows(db, actor, parsed);
  return { ok: true, filename: `indicadores-${kind}-${parsed.from}-${parsed.to}.csv`, rows };
}
