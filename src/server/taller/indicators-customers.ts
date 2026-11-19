import { and, between, count, eq, exists, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { SessionUser } from "../auth/admin-auth.ts";
import type { AppDb } from "../db/client.ts";
import { intakeChecks, workOrders } from "../db/schema-orders.ts";
import { serviceReports } from "../db/schema-reports.ts";
import { customers } from "../db/schema-taller.ts";
import { bookings } from "../db/schema.ts";
import { INTAKE_CHECK_KEYS } from "./rules.ts";

type Bounds = { start: Date; end: Date };

function percentage(amount: number, total: number) {
  return total > 0 ? Math.round((amount * 100) / total) : 0;
}

export async function customerIndicators(db: AppDb, actor: SessionUser, bounds: Bounds) {
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
    .select({
      served: count(),
      newCount:
        sql<number>`count(*) filter (where ${history.firstAt} >= ${bounds.start.toISOString()}::timestamptz and ${history.firstAt} < ${bounds.end.toISOString()}::timestamptz)`.mapWith(
          Number,
        ),
    })
    .from(history)
    .where(sql`${history.inRange} > 0`);
  const served = row?.served ?? 0;
  const newCount = row?.newCount ?? 0;
  return { served, newCount, returningCount: served - newCount };
}

export async function bookingIndicators(
  db: AppDb,
  actor: SessionUser,
  range: { from: string; to: string },
) {
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
  // Solo las reservas de la sucursal, igual que activeBookings del tablero (BG-15).
  const [row] = await db
    .select({
      received: count(),
      cancelled: sql<number>`count(*) filter (where ${bookings.status} = 'cancelled')`.mapWith(
        Number,
      ),
      noShow: sql<number>`count(*) filter (where ${bookings.status} = 'no_show')`.mapWith(Number),
      converted: sql<number>`count(*) filter (where ${exists(converted)})`.mapWith(Number),
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.branchId, actor.branchId),
        between(bookings.serviceDate, range.from, range.to),
      ),
    );
  const values = row ?? { received: 0, cancelled: 0, noShow: 0, converted: 0 };
  return {
    ...values,
    conversionPct: percentage(values.converted, values.received - values.cancelled),
  };
}

export async function coverageIndicators(db: AppDb, actor: SessionUser, bounds: Bounds) {
  const checks = db
    .select({ count: count() })
    .from(intakeChecks)
    .where(
      and(eq(intakeChecks.branchId, actor.branchId), eq(intakeChecks.workOrderId, workOrders.id)),
    );
  const reports = db
    .select({ id: serviceReports.id })
    .from(serviceReports)
    .where(
      and(
        eq(serviceReports.branchId, actor.branchId),
        eq(serviceReports.workOrderId, workOrders.id),
      ),
    );
  const [row] = await db
    .select({
      receivedCount: count(),
      checklist:
        sql<number>`count(*) filter (where (${checks}) = ${INTAKE_CHECK_KEYS.length})`.mapWith(
          Number,
        ),
      qc: sql<number>`count(*) filter (where ${isNotNull(workOrders.qcApprovedAt)})`.mapWith(
        Number,
      ),
      reports: sql<number>`count(*) filter (where ${exists(reports)})`.mapWith(Number),
    })
    .from(workOrders)
    .where(
      and(
        eq(workOrders.branchId, actor.branchId),
        isNull(workOrders.voidedAt),
        gte(workOrders.receivedAt, bounds.start),
        lt(workOrders.receivedAt, bounds.end),
      ),
    );
  const receivedCount = row?.receivedCount ?? 0;
  return {
    receivedCount,
    checklistCompletePct: percentage(row?.checklist ?? 0, receivedCount),
    qcApprovedPct: percentage(row?.qc ?? 0, receivedCount),
    reportsPct: percentage(row?.reports ?? 0, receivedCount),
  };
}
