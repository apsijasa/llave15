import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import { TIMEZONE } from "../booking/rules.ts";
import type { AppDb } from "../db/client.ts";
import { cashMovements, expenses } from "../db/schema-cash.ts";
import { products } from "../db/schema-inventory.ts";
import { workOrderItems, workOrders } from "../db/schema-orders.ts";
import { payments } from "../db/schema-payments.ts";
import { saleItems, sales } from "../db/schema-sales.ts";
import { indicatorsRangeSchema } from "./indicators.ts";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  POS_PROVIDERS,
  POS_PROVIDER_LABELS,
  netOfGross,
} from "./rules.ts";
import type { ExpenseCategory, PosProvider } from "./rules.ts";

type Range = { from: string; to: string };
type Bounds = { start: Date; end: Date };

export type FinanceIndicators = {
  range: Range;
  income: { grossClp: number; netClp: number; refundsClp: number };
  pos: { provider: PosProvider; label: string; grossClp: number }[];
  expenses: {
    totalClp: number;
    byCategory: { category: ExpenseCategory; label: string; amountClp: number }[];
  };
  balanceClp: number;
  expenseRatioPct: number;
  mix: { servicesClp: number; partsClp: number; counterSalesClp: number };
  inventory: {
    activeCount: number;
    lowStockCount: number;
    outOfStockCount: number;
    valueAtCostClp?: number;
  };
  partsMarginClp?: number;
};

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** Mismos límites de día local que `indicators.ts`. */
function rangeBounds(range: Range): Bounds {
  return {
    start: DateTime.fromISO(range.from, { zone: TIMEZONE }).startOf("day").toJSDate(),
    end: DateTime.fromISO(range.to, { zone: TIMEZONE }).plus({ days: 1 }).startOf("day").toJSDate(),
  };
}

function paymentScope(actor: SessionUser, bounds: Bounds) {
  return and(
    eq(payments.branchId, actor.branchId),
    isNull(payments.voidedAt),
    gte(payments.receivedAt, bounds.start),
    lt(payments.receivedAt, bounds.end),
  );
}

async function income(db: AppDb, actor: SessionUser, bounds: Bounds) {
  const paid = await db
    .select({ amountClp: payments.amountClp })
    .from(payments)
    .where(paymentScope(actor, bounds));
  const refunds = await db
    .select({ amountClp: cashMovements.amountClp })
    .from(cashMovements)
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
  return {
    grossClp: sum(paid.map((row) => row.amountClp)),
    netClp: sum(paid.map((row) => netOfGross(row.amountClp))),
    refundsClp: sum(refunds.map((row) => netOfGross(row.amountClp))),
  };
}

/** Bruto por proveedor de POS; los pagos `mercadopago` anteriores a F2-D30 cuentan como Mercado Pago. */
async function posByProvider(db: AppDb, actor: SessionUser, bounds: Bounds) {
  const provider = sql<string>`case when ${payments.method} = 'mercadopago' then 'mercadopago' else ${payments.posProvider} end`;
  const rows = await db
    .select({
      provider,
      grossClp: sql<number>`coalesce(sum(${payments.amountClp}), 0)`.mapWith(Number),
    })
    .from(payments)
    .where(
      and(
        paymentScope(actor, bounds),
        sql`(${payments.method} = 'mercadopago' or ${payments.posProvider} is not null)`,
      ),
    )
    .groupBy(provider);
  return POS_PROVIDERS.map((key) => ({
    provider: key,
    label: POS_PROVIDER_LABELS[key],
    grossClp: rows.find((row) => row.provider === key)?.grossClp ?? 0,
  }));
}

async function expenseTotals(db: AppDb, actor: SessionUser, range: Range) {
  const rows = await db
    .select({
      category: expenses.category,
      amountClp: sql<number>`coalesce(sum(${expenses.amountClp}), 0)`.mapWith(Number),
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.branchId, actor.branchId),
        isNull(expenses.voidedAt),
        gte(expenses.expenseDate, range.from),
        lte(expenses.expenseDate, range.to),
      ),
    )
    .groupBy(expenses.category);
  const byCategory = EXPENSE_CATEGORIES.map((category) => ({
    category,
    label: EXPENSE_CATEGORY_LABELS[category],
    amountClp: rows.find((row) => row.category === category)?.amountClp ?? 0,
  }));
  return { totalClp: sum(byCategory.map((row) => row.amountClp)), byCategory };
}

/** Líneas vigentes de órdenes vigentes entregadas en el rango, con su neto por línea. */
async function deliveredLines(db: AppDb, actor: SessionUser, bounds: Bounds) {
  const rows = await db
    .select({
      kind: workOrderItems.kind,
      productId: workOrderItems.productId,
      quantity: workOrderItems.quantity,
      unitPriceClp: workOrderItems.unitPriceClp,
      unitCostClp: workOrderItems.unitCostClp,
      pricingMode: workOrders.pricingMode,
    })
    .from(workOrderItems)
    .innerJoin(
      workOrders,
      and(eq(workOrders.id, workOrderItems.workOrderId), eq(workOrders.branchId, actor.branchId)),
    )
    .where(
      and(
        eq(workOrderItems.branchId, actor.branchId),
        isNull(workOrderItems.voidedAt),
        isNull(workOrders.voidedAt),
        isNotNull(workOrders.deliveredAt),
        gte(workOrders.deliveredAt, bounds.start),
        lt(workOrders.deliveredAt, bounds.end),
      ),
    );
  return rows.map((row) => {
    const gross = row.quantity * row.unitPriceClp;
    const netClp = row.pricingMode === "neto" ? gross : netOfGross(gross);
    const unitNet = row.pricingMode === "neto" ? row.unitPriceClp : netOfGross(row.unitPriceClp);
    return { ...row, netClp, unitNet };
  });
}

async function paidSales(db: AppDb, actor: SessionUser, bounds: Bounds) {
  const rows = await db
    .select({ id: sales.id, subtotalClp: sales.subtotalClp, discountClp: sales.discountClp })
    .from(sales)
    .where(
      and(
        eq(sales.branchId, actor.branchId),
        eq(sales.status, "pagada"),
        isNull(sales.voidedAt),
        gte(sales.createdAt, bounds.start),
        lt(sales.createdAt, bounds.end),
      ),
    );
  const items = rows.length
    ? await db
        .select({
          quantity: saleItems.quantity,
          unitPriceClp: saleItems.unitPriceClp,
          unitCostClp: saleItems.unitCostClp,
        })
        .from(saleItems)
        .where(
          and(
            eq(saleItems.branchId, actor.branchId),
            inArray(
              saleItems.saleId,
              rows.map((row) => row.id),
            ),
          ),
        )
    : [];
  return { rows, items };
}

async function inventory(db: AppDb, actor: SessionUser, showCosts: boolean) {
  const [row] = await db
    .select({
      activeCount: sql<number>`count(*)`.mapWith(Number),
      lowStockCount:
        sql<number>`count(*) filter (where ${products.minStock} > 0 and ${products.stockQty} <= ${products.minStock})`.mapWith(
          Number,
        ),
      outOfStockCount: sql<number>`count(*) filter (where ${products.stockQty} = 0)`.mapWith(
        Number,
      ),
      valueAtCostClp:
        sql<number>`coalesce(sum(${products.stockQty}::bigint * ${products.costClp}), 0)`.mapWith(
          Number,
        ),
    })
    .from(products)
    .where(and(eq(products.branchId, actor.branchId), eq(products.isActive, true)));
  const totals = row ?? { activeCount: 0, lowStockCount: 0, outOfStockCount: 0, valueAtCostClp: 0 };
  if (showCosts) return totals;
  const { valueAtCostClp: _value, ...visible } = totals;
  return visible;
}

type Lines = Awaited<ReturnType<typeof deliveredLines>>;
type Sales = Awaited<ReturnType<typeof paidSales>>;

function mix(lines: Lines, counter: Sales) {
  return {
    servicesClp: sum(lines.filter((line) => line.kind === "servicio").map((line) => line.netClp)),
    partsClp: sum(lines.filter((line) => line.kind === "repuesto").map((line) => line.netClp)),
    counterSalesClp: sum(counter.rows.map((row) => row.subtotalClp)),
  };
}

function partsMargin(lines: Lines, counter: Sales) {
  const orderMargin = sum(
    lines
      .filter((line) => line.productId !== null && line.unitCostClp !== null)
      .map((line) => (line.unitNet - (line.unitCostClp ?? 0)) * line.quantity),
  );
  const saleMargin = sum(
    counter.items.map((item) => (item.unitPriceClp - item.unitCostClp) * item.quantity),
  );
  return orderMargin + saleMargin - sum(counter.rows.map((row) => row.discountClp));
}

export async function financeIndicators(
  db: AppDb,
  actor: SessionUser,
  range: Range,
  now: Date,
): Promise<FinanceIndicators | null> {
  if (!can(actor.role, "dashboard.finance")) return null;
  const parsed = indicatorsRangeSchema.parse(range);
  const bounds = rangeBounds(parsed);
  // El inventario es el estado actual; el reloj se inyecta igual que en `workshopIndicators`.
  void now;
  const showCosts = can(actor.role, "costs.view");
  const [incomeTotals, pos, expenseRows, lines, counter, stock] = await Promise.all([
    income(db, actor, bounds),
    posByProvider(db, actor, bounds),
    expenseTotals(db, actor, parsed),
    deliveredLines(db, actor, bounds),
    paidSales(db, actor, bounds),
    inventory(db, actor, showCosts),
  ]);
  const balanceClp = incomeTotals.netClp - incomeTotals.refundsClp - expenseRows.totalClp;
  const expenseRatioPct =
    incomeTotals.netClp > 0 ? Math.round((expenseRows.totalClp * 100) / incomeTotals.netClp) : 0;
  return {
    range: parsed,
    income: incomeTotals,
    pos,
    expenses: expenseRows,
    balanceClp,
    expenseRatioPct,
    mix: mix(lines, counter),
    inventory: stock,
    ...(showCosts ? { partsMarginClp: partsMargin(lines, counter) } : {}),
  };
}
