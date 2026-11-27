import { and, count, eq, gt, gte, inArray, isNull, lt, lte, notInArray, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { TIMEZONE } from "../../lib/time.ts";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { cashMovements, expenses } from "../db/schema-cash.ts";
import { workOrders } from "../db/schema-orders.ts";
import { payments } from "../db/schema-payments.ts";
import {
  approvalsFunnel,
  bookingsPending,
  paymentQuality,
  returnedNewCount,
} from "./indicators-funnels.ts";
import type { ApprovalsFunnel, PaymentQuality } from "./indicators-funnels.ts";
import { dailySeries, openOrderAges, ordersByWeekday } from "./indicators-series.ts";
import type { AgeBucket, DailySeries, WeekdayCount } from "./indicators-series.ts";
import { indicatorsRangeSchema } from "./indicators.ts";
import { netOfGross, TERMINAL_STATUSES } from "./rules.ts";

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
  daily: DailySeries;
  weekday: WeekdayCount[];
  ages: AgeBucket[];
  approvals: ApprovalsFunnel;
  bookingsPending: number;
  returnedNewCount: number;
  paymentQuality: PaymentQuality;
};
type Bounds = { start: Date; end: Date };

/** Mismos límites de día local que `indicators.ts`. */
function rangeBounds(range: Range): Bounds {
  return {
    start: DateTime.fromISO(range.from, { zone: TIMEZONE }).startOf("day").toJSDate(),
    end: DateTime.fromISO(range.to, { zone: TIMEZONE }).plus({ days: 1 }).startOf("day").toJSDate(),
  };
}

export function previousRange(range: Range): Range {
  const parsed = indicatorsRangeSchema.parse(range);
  const from = DateTime.fromISO(parsed.from, { zone: TIMEZONE });
  const days = DateTime.fromISO(parsed.to, { zone: TIMEZONE }).diff(from, "days").days + 1;
  return {
    from: from.minus({ days }).toFormat("yyyy-MM-dd"),
    to: from.minus({ days: 1 }).toFormat("yyyy-MM-dd"),
  };
}

function delta(currentClp: number, previousClp: number): Delta {
  return {
    currentClp,
    previousClp,
    deltaPct: previousClp > 0 ? Math.round(((currentClp - previousClp) * 100) / previousClp) : null,
  };
}

function orderScope(actor: SessionUser) {
  return and(eq(workOrders.branchId, actor.branchId), isNull(workOrders.voidedAt));
}

function openScope(actor: SessionUser) {
  return and(orderScope(actor), notInArray(workOrders.status, [...TERMINAL_STATUSES]));
}

async function periodPayments(db: AppDb, actor: SessionUser, bounds: Bounds) {
  return db
    .select({ amountClp: payments.amountClp })
    .from(payments)
    .where(
      and(
        eq(payments.branchId, actor.branchId),
        isNull(payments.voidedAt),
        gte(payments.receivedAt, bounds.start),
        lt(payments.receivedAt, bounds.end),
      ),
    );
}

async function periodRefunds(db: AppDb, actor: SessionUser, bounds: Bounds) {
  return db
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
}

async function periodExpenses(db: AppDb, actor: SessionUser, range: Range) {
  const [row] = await db
    .select({ amount: sql<number>`coalesce(sum(${expenses.amountClp}), 0)`.mapWith(Number) })
    .from(expenses)
    .where(
      and(
        eq(expenses.branchId, actor.branchId),
        isNull(expenses.voidedAt),
        gte(expenses.expenseDate, range.from),
        lte(expenses.expenseDate, range.to),
      ),
    );
  return row?.amount ?? 0;
}

async function deliveredTotals(db: AppDb, actor: SessionUser, bounds: Bounds) {
  const [row] = await db
    .select({
      deliveredCount: count(),
      deliveredTotalClp: sql<number>`coalesce(sum(${workOrders.totalClp}), 0)`.mapWith(Number),
    })
    .from(workOrders)
    .where(
      and(
        orderScope(actor),
        gte(workOrders.deliveredAt, bounds.start),
        lt(workOrders.deliveredAt, bounds.end),
      ),
    );
  return row ?? { deliveredCount: 0, deliveredTotalClp: 0 };
}

async function periodTotals(db: AppDb, actor: SessionUser, range: Range) {
  const bounds = rangeBounds(range);
  const [paid, refunds, expensesClp, delivered] = await Promise.all([
    periodPayments(db, actor, bounds),
    periodRefunds(db, actor, bounds),
    periodExpenses(db, actor, range),
    deliveredTotals(db, actor, bounds),
  ]);
  return {
    grossClp: paid.reduce((sum, row) => sum + row.amountClp, 0),
    netClp: paid.reduce((sum, row) => sum + netOfGross(row.amountClp), 0),
    refundsClp: refunds.reduce((sum, row) => sum + netOfGross(row.amountClp), 0),
    expensesClp,
    ...delivered,
  };
}

async function openOrders(db: AppDb, actor: SessionUser, range: Range, now: Date) {
  const bounds = rangeBounds(range);
  // Las órdenes abiertas son el estado actual, independiente del rango y del instante inyectado.
  void now;
  const [[opened], [closed]] = await Promise.all([
    db.select({ count: count() }).from(workOrders).where(openScope(actor)),
    db
      .select({
        days: sql<number>`coalesce(avg(extract(epoch from (${workOrders.deliveredAt} - ${workOrders.receivedAt})) / 86400), 0)`.mapWith(
          Number,
        ),
      })
      .from(workOrders)
      .where(
        and(
          orderScope(actor),
          gte(workOrders.deliveredAt, bounds.start),
          lt(workOrders.deliveredAt, bounds.end),
        ),
      ),
  ]);
  return { count: opened?.count ?? 0, avgDaysToClose: Math.round(closed?.days ?? 0) };
}

async function rhythm(db: AppDb, actor: SessionUser, range: Range, now: Date) {
  const bounds = rangeBounds(range);
  // El saldo abierto es el estado actual; now también se recibe para mantener el reloj inyectado.
  void now;
  const [[created], [amount]] = await Promise.all([
    db
      .select({
        count: count(),
        activeDays:
          sql<number>`count(distinct (${workOrders.createdAt} at time zone ${TIMEZONE})::date)`.mapWith(
            Number,
          ),
      })
      .from(workOrders)
      .where(
        and(
          orderScope(actor),
          gte(workOrders.createdAt, bounds.start),
          lt(workOrders.createdAt, bounds.end),
        ),
      ),
    db
      .select({
        count: count(),
        totalClp:
          sql<number>`coalesce(sum(${workOrders.totalClp} - ${workOrders.paidClp}), 0)`.mapWith(
            Number,
          ),
      })
      .from(workOrders)
      .where(and(openScope(actor), gt(workOrders.totalClp, workOrders.paidClp))),
  ]);
  const activeDays = created?.activeDays ?? 0;
  return {
    activeDays,
    ordersPerActiveDay:
      activeDays > 0 ? Math.round(((created?.count ?? 0) * 10) / activeDays) / 10 : 0,
    amountToReview: amount ?? { count: 0, totalClp: 0 },
  };
}

type Totals = Awaited<ReturnType<typeof periodTotals>>;
function ticket(totals: Totals) {
  return totals.deliveredCount > 0
    ? Math.round(totals.deliveredTotalClp / totals.deliveredCount)
    : 0;
}
function balance(totals: Totals) {
  return totals.netClp - totals.refundsClp - totals.expensesClp;
}

export async function dashboardIndicators(
  db: AppDb,
  actor: SessionUser,
  range: Range,
  now: Date,
): Promise<DashboardIndicators | null> {
  if (!can(actor.role, "dashboard.finance")) return null;
  const parsed = indicatorsRangeSchema.parse(range);
  const previous = previousRange(parsed);
  const [current, prior, open, pace, daily, weekday, ages, approvals, pending, returned, quality] =
    await Promise.all([
      periodTotals(db, actor, parsed),
      periodTotals(db, actor, previous),
      openOrders(db, actor, parsed, now),
      rhythm(db, actor, parsed, now),
      dailySeries(db, actor, parsed),
      ordersByWeekday(db, actor, parsed),
      openOrderAges(db, actor, now),
      approvalsFunnel(db, actor, parsed),
      bookingsPending(db, actor, parsed),
      returnedNewCount(db, actor, parsed),
      paymentQuality(db, actor, parsed),
    ]);
  return {
    range: parsed,
    previous,
    headline: {
      income: delta(current.grossClp, prior.grossClp),
      averageTicket: delta(ticket(current), ticket(prior)),
      netBalance: delta(balance(current), balance(prior)),
      openOrders: open,
    },
    rhythm: pace,
    daily,
    weekday,
    ages,
    approvals,
    bookingsPending: pending,
    returnedNewCount: returned,
    paymentQuality: quality,
  };
}
