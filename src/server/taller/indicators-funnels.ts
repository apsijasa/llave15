import { and, between, count, eq, gt, gte, isNull, lt, notExists, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { TIMEZONE } from "../../lib/time.ts";
import type { SessionUser } from "../auth/admin-auth.ts";
import type { AppDb } from "../db/client.ts";
import { workOrderApprovals, workOrders } from "../db/schema-orders.ts";
import { payments } from "../db/schema-payments.ts";
import { customers } from "../db/schema-taller.ts";
import { bookings } from "../db/schema.ts";
import type { Range } from "./indicators-dashboard.ts";
import { indicatorsRangeSchema } from "./indicators.ts";

export type ApprovalsFunnel = {
  created: number;
  pending: number;
  approved: number;
  rejected: number;
  acceptedValueClp: number;
  conversionPct: number;
};
export type PaymentQuality = {
  deliveredCount: number;
  withoutPaymentCount: number;
  completePct: number;
  amountToReviewClp: number;
};

/** Mismos límites de día local que `indicators.ts`. */
function rangeBounds(range: Range) {
  return {
    start: DateTime.fromISO(range.from, { zone: TIMEZONE }).startOf("day").toJSDate(),
    end: DateTime.fromISO(range.to, { zone: TIMEZONE }).plus({ days: 1 }).startOf("day").toJSDate(),
  };
}

// El permiso ya fue revisado por dashboardIndicators.
export async function approvalsFunnel(
  db: AppDb,
  actor: SessionUser,
  range: Range,
): Promise<ApprovalsFunnel> {
  const bounds = rangeBounds(indicatorsRangeSchema.parse(range));
  const [row] = await db
    .select({
      created: count(),
      pending: sql<number>`count(*) filter (where ${workOrderApprovals.decision} is null)`.mapWith(
        Number,
      ),
      approved:
        sql<number>`count(*) filter (where ${workOrderApprovals.decision} = 'aprobado')`.mapWith(
          Number,
        ),
      rejected:
        sql<number>`count(*) filter (where ${workOrderApprovals.decision} = 'rechazado')`.mapWith(
          Number,
        ),
      acceptedValueClp:
        sql<number>`coalesce(sum(${workOrderApprovals.priceClp}) filter (where ${workOrderApprovals.decision} = 'aprobado'), 0)`.mapWith(
          Number,
        ),
    })
    .from(workOrderApprovals)
    .innerJoin(
      workOrders,
      and(
        eq(workOrders.id, workOrderApprovals.workOrderId),
        eq(workOrders.branchId, actor.branchId),
        isNull(workOrders.voidedAt),
      ),
    )
    .where(
      and(
        eq(workOrderApprovals.branchId, actor.branchId),
        isNull(workOrderApprovals.voidedAt),
        gte(workOrderApprovals.createdAt, bounds.start),
        lt(workOrderApprovals.createdAt, bounds.end),
      ),
    );
  const values = row ?? { created: 0, pending: 0, approved: 0, rejected: 0, acceptedValueClp: 0 };
  const decided = values.approved + values.rejected;
  return {
    ...values,
    conversionPct: decided > 0 ? Math.round((values.approved * 100) / decided) : 0,
  };
}

// El permiso ya fue revisado por dashboardIndicators.
export async function bookingsPending(
  db: AppDb,
  actor: SessionUser,
  range: Range,
): Promise<number> {
  const parsed = indicatorsRangeSchema.parse(range);
  const converted = db
    .select({ id: workOrders.id })
    .from(workOrders)
    .where(
      and(
        eq(workOrders.branchId, actor.branchId),
        isNull(workOrders.voidedAt),
        eq(workOrders.bookingId, bookings.id),
      ),
    );
  const [row] = await db
    .select({ count: count() })
    .from(bookings)
    .where(
      and(
        eq(bookings.branchId, actor.branchId),
        between(bookings.serviceDate, parsed.from, parsed.to),
        eq(bookings.status, "confirmed"),
        notExists(converted),
      ),
    );
  return row?.count ?? 0;
}

// El permiso ya fue revisado por dashboardIndicators.
export async function returnedNewCount(
  db: AppDb,
  actor: SessionUser,
  range: Range,
): Promise<number> {
  const bounds = rangeBounds(indicatorsRangeSchema.parse(range));
  const history = db
    .select({
      customerId: customers.id,
      firstAt: sql<Date>`min(${workOrders.createdAt})`.as("first_at"),
      inRange:
        sql<number>`count(*) filter (where ${workOrders.createdAt} >= ${bounds.start.toISOString()}::timestamptz and ${workOrders.createdAt} < ${bounds.end.toISOString()}::timestamptz)`
          .mapWith(Number)
          .as("in_range"),
    })
    .from(workOrders)
    .innerJoin(
      customers,
      and(eq(customers.id, workOrders.customerId), eq(customers.branchId, actor.branchId)),
    )
    .where(and(eq(workOrders.branchId, actor.branchId), isNull(workOrders.voidedAt)))
    .groupBy(customers.id)
    .as("customer_history");
  const [row] = await db
    .select({ count: count() })
    .from(history)
    .where(
      and(
        sql`${history.firstAt} >= ${bounds.start.toISOString()}::timestamptz`,
        sql`${history.firstAt} < ${bounds.end.toISOString()}::timestamptz`,
        sql`${history.inRange} >= 2`,
      ),
    );
  return row?.count ?? 0;
}

// El permiso ya fue revisado por dashboardIndicators.
export async function paymentQuality(
  db: AppDb,
  actor: SessionUser,
  range: Range,
): Promise<PaymentQuality> {
  const bounds = rangeBounds(indicatorsRangeSchema.parse(range));
  const paid = db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.branchId, actor.branchId),
        eq(payments.workOrderId, workOrders.id),
        isNull(payments.voidedAt),
      ),
    );
  const missing = and(gt(workOrders.totalClp, 0), notExists(paid));
  const [row] = await db
    .select({
      deliveredCount: count(),
      withoutPaymentCount: sql<number>`count(*) filter (where ${missing})`.mapWith(Number),
      amountToReviewClp:
        sql<number>`coalesce(sum(${workOrders.totalClp}) filter (where ${notExists(paid)}), 0)`.mapWith(
          Number,
        ),
    })
    .from(workOrders)
    .where(
      and(
        eq(workOrders.branchId, actor.branchId),
        isNull(workOrders.voidedAt),
        gte(workOrders.deliveredAt, bounds.start),
        lt(workOrders.deliveredAt, bounds.end),
      ),
    );
  const values = row ?? { deliveredCount: 0, withoutPaymentCount: 0, amountToReviewClp: 0 };
  return {
    ...values,
    completePct:
      values.deliveredCount > 0
        ? Math.round(
            ((values.deliveredCount - values.withoutPaymentCount) * 100) / values.deliveredCount,
          )
        : 0,
  };
}
