import { and, count, eq, gte, isNull, lt, lte, notInArray, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { TIMEZONE } from "../../lib/time.ts";
import type { SessionUser } from "../auth/admin-auth.ts";
import type { AppDb } from "../db/client.ts";
import { expenses } from "../db/schema-cash.ts";
import { workOrders } from "../db/schema-orders.ts";
import { payments } from "../db/schema-payments.ts";
import type { Range } from "./indicators-dashboard.ts";
import { indicatorsRangeSchema } from "./indicators.ts";
import { TERMINAL_STATUSES } from "./rules.ts";

export type DailyPoint = { date: string; incomeClp: number; expensesClp: number };
export type DailySeries = {
  days: DailyPoint[];
  averageDailyIncomeClp: number;
  bestDay: { date: string; incomeClp: number } | null;
  activeDays: number;
};
export type WeekdayCount = { weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7; label: string; count: number };
export type AgeBucket = { bucket: "0-3" | "4-7" | "8-14" | "15+"; label: string; count: number };
const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

/** Mismos límites de día local que `indicators.ts`. */
function rangeBounds(range: Range) {
  return {
    start: DateTime.fromISO(range.from, { zone: TIMEZONE }).startOf("day").toJSDate(),
    end: DateTime.fromISO(range.to, { zone: TIMEZONE }).plus({ days: 1 }).startOf("day").toJSDate(),
  };
}

function completeDaily(
  range: Range,
  income: Map<string, number>,
  expenses: Map<string, number>,
): DailySeries {
  const days: DailyPoint[] = [];
  let day = DateTime.fromISO(range.from, { zone: TIMEZONE });
  while (day.toFormat("yyyy-MM-dd") <= range.to) {
    const date = day.toFormat("yyyy-MM-dd");
    days.push({ date, incomeClp: income.get(date) ?? 0, expensesClp: expenses.get(date) ?? 0 });
    day = day.plus({ days: 1 });
  }
  const total = days.reduce((sum, day) => sum + day.incomeClp, 0);
  const best = days.reduce<DailyPoint | null>(
    (best, day) => (!best || day.incomeClp > best.incomeClp ? day : best),
    null,
  );
  return {
    days,
    averageDailyIncomeClp: Math.round(total / days.length),
    bestDay: total > 0 && best ? { date: best.date, incomeClp: best.incomeClp } : null,
    activeDays: days.filter((day) => day.incomeClp > 0).length,
  };
}

// El permiso ya fue revisado por dashboardIndicators.
export async function dailySeries(
  db: AppDb,
  actor: SessionUser,
  range: Range,
): Promise<DailySeries> {
  const parsed = indicatorsRangeSchema.parse(range);
  const bounds = rangeBounds(parsed);
  const date =
    sql<string>`to_char(${payments.receivedAt} at time zone ${TIMEZONE}, 'YYYY-MM-DD')`.as(
      "local_date",
    );
  const [paid, spent] = await Promise.all([
    db
      .select({ date, amount: sql<number>`sum(${payments.amountClp})`.mapWith(Number) })
      .from(payments)
      .where(
        and(
          eq(payments.branchId, actor.branchId),
          isNull(payments.voidedAt),
          gte(payments.receivedAt, bounds.start),
          lt(payments.receivedAt, bounds.end),
        ),
      )
      .groupBy(({ date }) => date),
    db
      .select({
        date: expenses.expenseDate,
        amount: sql<number>`sum(${expenses.amountClp})`.mapWith(Number),
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.branchId, actor.branchId),
          isNull(expenses.voidedAt),
          gte(expenses.expenseDate, parsed.from),
          lte(expenses.expenseDate, parsed.to),
        ),
      )
      .groupBy(expenses.expenseDate),
  ]);
  return completeDaily(
    parsed,
    new Map(paid.map((row) => [row.date, row.amount])),
    new Map(spent.map((row) => [row.date, row.amount])),
  );
}

// El permiso ya fue revisado por dashboardIndicators.
export async function ordersByWeekday(
  db: AppDb,
  actor: SessionUser,
  range: Range,
): Promise<WeekdayCount[]> {
  const bounds = rangeBounds(indicatorsRangeSchema.parse(range));
  const weekday = sql<
    WeekdayCount["weekday"]
  >`extract(isodow from ${workOrders.createdAt} at time zone ${TIMEZONE})`
    .mapWith(Number)
    .as("local_weekday");
  const rows = await db
    .select({ weekday, count: count() })
    .from(workOrders)
    .where(
      and(
        eq(workOrders.branchId, actor.branchId),
        isNull(workOrders.voidedAt),
        gte(workOrders.createdAt, bounds.start),
        lt(workOrders.createdAt, bounds.end),
      ),
    )
    .groupBy(({ weekday }) => weekday);
  return WEEKDAY_LABELS.map((label, index) => ({
    weekday: (index + 1) as WeekdayCount["weekday"],
    label,
    count: rows.find((row) => row.weekday === index + 1)?.count ?? 0,
  }));
}

// El permiso ya fue revisado por dashboardIndicators.
export async function openOrderAges(
  db: AppDb,
  actor: SessionUser,
  now: Date,
): Promise<AgeBucket[]> {
  const rows = await db
    .select({ receivedAt: workOrders.receivedAt, createdAt: workOrders.createdAt })
    .from(workOrders)
    .where(
      and(
        eq(workOrders.branchId, actor.branchId),
        isNull(workOrders.voidedAt),
        notInArray(workOrders.status, [...TERMINAL_STATUSES]),
      ),
    );
  const buckets: AgeBucket[] = [
    { bucket: "0-3", label: "0 a 3 días", count: 0 },
    { bucket: "4-7", label: "4 a 7 días", count: 0 },
    { bucket: "8-14", label: "8 a 14 días", count: 0 },
    { bucket: "15+", label: "15 días o más", count: 0 },
  ];
  for (const row of rows) {
    const age = Math.floor(
      (now.getTime() - (row.receivedAt ?? row.createdAt).getTime()) / 86400000,
    );
    const index = age <= 3 ? 0 : age <= 7 ? 1 : age <= 14 ? 2 : 3;
    const bucket = buckets[index];
    if (bucket) bucket.count += 1;
  }
  return buckets;
}
