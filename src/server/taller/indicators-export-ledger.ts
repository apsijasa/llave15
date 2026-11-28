import { and, eq, gte, inArray, isNull, lt, lte } from "drizzle-orm";
import { DateTime } from "luxon";
import type { CsvCell } from "../../lib/csv.ts";
import { TIMEZONE } from "../../lib/time.ts";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { cashMovements, expenses } from "../db/schema-cash.ts";
import { workOrders } from "../db/schema-orders.ts";
import { payments } from "../db/schema-payments.ts";
import { sales } from "../db/schema-sales.ts";
import type { Range } from "./indicators-dashboard.ts";
import { financeIndicators } from "./indicators-finance.ts";
import { formatOrderNumber } from "./orders.ts";
import { formatSaleNumber } from "./sale-queries.ts";
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_METHOD_LABELS,
  paymentMethodLabel,
  TAX_DOC_TYPE_LABELS,
} from "./rules.ts";
import type { ExpenseCategory, ExpenseMethod } from "./rules.ts";

type Bounds = { start: Date; end: Date };
export function exportBounds(range: Range): Bounds {
  return {
    start: DateTime.fromISO(range.from, { zone: TIMEZONE }).startOf("day").toJSDate(),
    end: DateTime.fromISO(range.to, { zone: TIMEZONE }).plus({ days: 1 }).startOf("day").toJSDate(),
  };
}
function document(order: number | null, sale: number | null) {
  return order !== null ? formatOrderNumber(order) : sale !== null ? formatSaleNumber(sale) : "";
}
function localTime(date: Date): string[] {
  const local = DateTime.fromJSDate(date, { zone: TIMEZONE });
  return [local.toFormat("yyyy-MM-dd"), local.toFormat("HH:mm")];
}
async function paymentRows(db: AppDb, actor: SessionUser, bounds: Bounds, costs: boolean) {
  const rows = await db
    .select({
      receivedAt: payments.receivedAt,
      order: workOrders.number,
      sale: sales.number,
      method: payments.method,
      posProvider: payments.posProvider,
      kind: payments.kind,
      amount: payments.amountClp,
      ...(costs ? { fee: payments.feeClp, net: payments.netClp } : {}),
    })
    .from(payments)
    .leftJoin(
      workOrders,
      and(eq(workOrders.id, payments.workOrderId), eq(workOrders.branchId, actor.branchId)),
    )
    .leftJoin(sales, and(eq(sales.id, payments.saleId), eq(sales.branchId, actor.branchId)))
    .where(
      and(
        eq(payments.branchId, actor.branchId),
        isNull(payments.voidedAt),
        gte(payments.receivedAt, bounds.start),
        lt(payments.receivedAt, bounds.end),
      ),
    );
  return rows.map((row): CsvCell[] => [
    ...localTime(row.receivedAt),
    "Ingreso",
    document(row.order, row.sale),
    paymentMethodLabel(row.method, row.posProvider),
    row.kind === "abono" ? "Abono" : "Pago final",
    row.amount,
    ...(costs ? [row.fee ?? null, row.net ?? null] : []),
  ]);
}
async function refundRows(db: AppDb, actor: SessionUser, bounds: Bounds, costs: boolean) {
  const rows = await db
    .select({
      createdAt: cashMovements.createdAt,
      amount: cashMovements.amountClp,
      order: workOrders.number,
      sale: sales.number,
    })
    .from(cashMovements)
    .leftJoin(
      workOrders,
      and(
        eq(workOrders.id, cashMovements.referenceId),
        eq(workOrders.branchId, actor.branchId),
        eq(cashMovements.referenceKind, "order_refund"),
      ),
    )
    .leftJoin(
      sales,
      and(
        eq(sales.id, cashMovements.referenceId),
        eq(sales.branchId, actor.branchId),
        eq(cashMovements.referenceKind, "sale_refund"),
      ),
    )
    .where(
      and(
        eq(cashMovements.branchId, actor.branchId),
        isNull(cashMovements.voidedAt),
        eq(cashMovements.kind, "egreso"),
        inArray(cashMovements.referenceKind, ["sale_refund", "order_refund"]),
        gte(cashMovements.createdAt, bounds.start),
        lt(cashMovements.createdAt, bounds.end),
      ),
    );
  return rows.map((row): CsvCell[] => [
    ...localTime(row.createdAt),
    "Devolución",
    document(row.order, row.sale),
    "Efectivo",
    "",
    -row.amount,
    ...(costs ? [null, null] : []),
  ]);
}
async function expenseRows(db: AppDb, actor: SessionUser, range: Range, costs: boolean) {
  const rows = await db
    .select({
      date: expenses.expenseDate,
      category: expenses.category,
      method: expenses.method,
      docType: expenses.docType,
      docNumber: expenses.docNumber,
      amount: expenses.amountClp,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.branchId, actor.branchId),
        isNull(expenses.voidedAt),
        gte(expenses.expenseDate, range.from),
        lte(expenses.expenseDate, range.to),
      ),
    );
  return rows.map((row): CsvCell[] => [
    row.date,
    "",
    "Egreso",
    row.docType && row.docNumber
      ? `${TAX_DOC_TYPE_LABELS[row.docType as keyof typeof TAX_DOC_TYPE_LABELS]} ${row.docNumber}`
      : "",
    EXPENSE_METHOD_LABELS[row.method as ExpenseMethod],
    EXPENSE_CATEGORY_LABELS[row.category as ExpenseCategory],
    -row.amount,
    ...(costs ? [null, null] : []),
  ]);
}
function totalRow(label: string, amount: number, costs: boolean): CsvCell[] {
  return [label, null, null, null, null, null, amount, ...(costs ? [null, null] : [])];
}
export async function ledgerRows(
  db: AppDb,
  actor: SessionUser,
  range: Range,
  now: Date,
): Promise<CsvCell[][]> {
  const costs = can(actor.role, "costs.view");
  const bounds = exportBounds(range);
  const [paid, refunded, spent, finance] = await Promise.all([
    paymentRows(db, actor, bounds, costs),
    refundRows(db, actor, bounds, costs),
    expenseRows(db, actor, range, costs),
    financeIndicators(db, actor, range, now),
  ]);
  if (!finance) return [];
  const rows = [...paid, ...refunded, ...spent].sort((a, b) =>
    `${a[0]} ${a[1]}`.localeCompare(`${b[0]} ${b[1]}`),
  );
  const refunds = refunded.reduce((sum, row) => sum + Number(row[6]), 0);
  const income = finance.income.grossClp;
  const expenses = -finance.expenses.totalClp;
  return [
    [
      "Fecha",
      "Hora",
      "Tipo",
      "Documento",
      "Medio",
      "Detalle",
      "Monto",
      ...(costs ? ["Comisión", "Neto"] : []),
    ],
    ...rows,
    [],
    totalRow("Total ingresos", income, costs),
    totalRow("Total devoluciones", refunds, costs),
    totalRow("Total egresos", expenses, costs),
    totalRow("Movimiento neto", income + refunds + expenses, costs),
  ];
}
