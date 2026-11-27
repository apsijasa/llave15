import { TIMEZONE, localToday } from "../../lib/time.ts";
import { and, asc, count, desc, eq, gte, isNull, lt, notInArray, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { workOrderItems, workOrders } from "../db/schema-orders.ts";
import { payments } from "../db/schema-payments.ts";
import { users } from "../db/schema.ts";
import {
  bookingIndicators,
  coverageIndicators,
  customerIndicators,
} from "./indicators-customers.ts";
import { formatOrderNumber } from "./orders.ts";
import {
  ORDER_STATUSES,
  FORM_PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  normalizeOrderStatus,
  statusLabel,
  TERMINAL_STATUSES,
} from "./rules.ts";
import type { OrderStatus, RecordablePaymentMethod } from "./rules.ts";

type Range = { from: string; to: string };
type Bounds = { start: Date; end: Date };
type StatusCount = { status: OrderStatus; label: string; count: number };
type ServiceCount = { description: string; quantity: number; amountClp: number };

export const indicatorsRangeSchema: z.ZodType<Range> = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine(
    ({ from, to }) =>
      from <= to &&
      DateTime.fromISO(to, { zone: "UTC" }).diff(DateTime.fromISO(from, { zone: "UTC" }), "days")
        .days <= 365,
    {
      message: "Selecciona un rango de hasta 366 días, con Desde anterior o igual a Hasta.",
    },
  );

export function defaultRange(now: Date): Range {
  const today = localToday(now);
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export type Indicators = {
  range: Range;
  income: {
    totalClp: number;
    count: number;
    byMethod: {
      method: RecordablePaymentMethod;
      label: string;
      amountClp: number;
      count: number;
    }[];
  };
  payments: {
    receivedAt: Date;
    orderNumber: string;
    kind: "abono" | "final";
    method: RecordablePaymentMethod;
    amountClp: number;
    receivedByName: string;
  }[];
  delivered: { count: number; totalClp: number; averageTicketClp: number };
  ordersCreated: { count: number; byStatus: StatusCount[] };
  openNow: StatusCount[];
  topServices: { byQuantity: ServiceCount[]; byAmount: ServiceCount[] };
  customers: { served: number; newCount: number; returningCount: number };
  bookings: {
    received: number;
    cancelled: number;
    noShow: number;
    converted: number;
    conversionPct: number;
  };
  coverage: {
    receivedCount: number;
    checklistCompletePct: number;
    qcApprovedPct: number;
    reportsPct: number;
  };
};

function orderScope(actor: SessionUser) {
  return and(eq(workOrders.branchId, actor.branchId), isNull(workOrders.voidedAt));
}

function paymentScope(actor: SessionUser, bounds: Bounds) {
  return and(
    eq(payments.branchId, actor.branchId),
    isNull(payments.voidedAt),
    gte(payments.receivedAt, bounds.start),
    lt(payments.receivedAt, bounds.end),
  );
}

async function income(
  db: AppDb,
  actor: SessionUser,
  bounds: Bounds,
): Promise<Indicators["income"]> {
  const rows = await db
    .select({
      method: payments.method,
      count: count(),
      amountClp: sql<number>`sum(${payments.amountClp})`.mapWith(Number),
    })
    .from(payments)
    .innerJoin(workOrders, and(eq(workOrders.id, payments.workOrderId), orderScope(actor)))
    .where(paymentScope(actor, bounds))
    .groupBy(payments.method);
  const methods: RecordablePaymentMethod[] = [...PAYMENT_METHODS];
  if (rows.some((row) => row.method === "mercadopago" && row.count > 0))
    methods.push("mercadopago");
  const byMethod = methods.map((method) => {
    const row = rows.find((row) => row.method === method);
    return {
      method,
      label:
        method === "tarjeta" ? FORM_PAYMENT_METHOD_LABELS.tarjeta : PAYMENT_METHOD_LABELS[method],
      amountClp: row?.amountClp ?? 0,
      count: row?.count ?? 0,
    };
  });
  return {
    totalClp: byMethod.reduce((total, row) => total + row.amountClp, 0),
    count: byMethod.reduce((total, row) => total + row.count, 0),
    byMethod,
  };
}

async function recentPayments(
  db: AppDb,
  actor: SessionUser,
  bounds: Bounds,
): Promise<Indicators["payments"]> {
  const rows = await db
    .select({
      receivedAt: payments.receivedAt,
      number: workOrders.number,
      kind: payments.kind,
      method: payments.method,
      amountClp: payments.amountClp,
      receivedByName: users.name,
    })
    .from(payments)
    .innerJoin(workOrders, and(eq(workOrders.id, payments.workOrderId), orderScope(actor)))
    .innerJoin(users, and(eq(users.id, payments.receivedBy), eq(users.branchId, actor.branchId)))
    .where(paymentScope(actor, bounds))
    .orderBy(desc(payments.receivedAt), desc(payments.id))
    .limit(200);
  return rows.map(({ number, ...row }) => ({ ...row, orderNumber: formatOrderNumber(number) }));
}

async function delivered(db: AppDb, actor: SessionUser, bounds: Bounds) {
  const [row] = await db
    .select({
      count: count(),
      totalClp: sql<number>`coalesce(sum(${workOrders.totalClp}), 0)`.mapWith(Number),
    })
    .from(workOrders)
    .where(
      and(
        orderScope(actor),
        gte(workOrders.deliveredAt, bounds.start),
        lt(workOrders.deliveredAt, bounds.end),
      ),
    );
  const totalClp = row?.totalClp ?? 0;
  const deliveredCount = row?.count ?? 0;
  return {
    count: deliveredCount,
    totalClp,
    averageTicketClp: deliveredCount ? Math.round(totalClp / deliveredCount) : 0,
  };
}

function statusCounts(rows: { status: string; count: number }[]): StatusCount[] {
  return ORDER_STATUSES.flatMap((status) => {
    const amount = rows
      .filter((row) => normalizeOrderStatus(row.status) === status)
      .reduce((total, row) => total + row.count, 0);
    return amount > 0 ? [{ status, label: statusLabel(status), count: amount }] : [];
  });
}

async function ordersCreated(db: AppDb, actor: SessionUser, bounds: Bounds) {
  const rows = await db
    .select({ status: workOrders.status, count: count() })
    .from(workOrders)
    .where(
      and(
        orderScope(actor),
        gte(workOrders.createdAt, bounds.start),
        lt(workOrders.createdAt, bounds.end),
      ),
    )
    .groupBy(workOrders.status);
  return { count: rows.reduce((total, row) => total + row.count, 0), byStatus: statusCounts(rows) };
}

async function openNow(db: AppDb, actor: SessionUser) {
  const rows = await db
    .select({ status: workOrders.status, count: count() })
    .from(workOrders)
    .where(and(orderScope(actor), notInArray(workOrders.status, [...TERMINAL_STATUSES])))
    .groupBy(workOrders.status);
  return statusCounts(rows);
}

async function topServices(db: AppDb, actor: SessionUser, bounds: Bounds) {
  const totals = db
    .select({
      description: workOrderItems.description,
      quantity: sql<number>`sum(${workOrderItems.quantity})`.mapWith(Number).as("quantity"),
      amountClp:
        sql<number>`sum(${workOrderItems.quantity}::bigint * ${workOrderItems.unitPriceClp})`
          .mapWith(Number)
          .as("amount_clp"),
    })
    .from(workOrderItems)
    .innerJoin(workOrders, and(eq(workOrders.id, workOrderItems.workOrderId), orderScope(actor)))
    .where(
      and(
        eq(workOrderItems.branchId, actor.branchId),
        isNull(workOrderItems.voidedAt),
        eq(workOrderItems.kind, "servicio"),
        gte(workOrders.createdAt, bounds.start),
        lt(workOrders.createdAt, bounds.end),
      ),
    )
    .groupBy(workOrderItems.description)
    .as("service_totals");
  const [byQuantity, byAmount] = await Promise.all([
    db.select().from(totals).orderBy(desc(totals.quantity), asc(totals.description)).limit(6),
    db.select().from(totals).orderBy(desc(totals.amountClp), asc(totals.description)).limit(6),
  ]);
  return { byQuantity, byAmount };
}

function rangeBounds(range: Range): Bounds {
  return {
    start: DateTime.fromISO(range.from, { zone: TIMEZONE }).startOf("day").toJSDate(),
    end: DateTime.fromISO(range.to, { zone: TIMEZONE }).plus({ days: 1 }).startOf("day").toJSDate(),
  };
}

export async function workshopIndicators(
  db: AppDb,
  actor: SessionUser,
  range: Range,
  now: Date,
): Promise<Indicators | null> {
  if (!can(actor.role, "dashboard.finance")) return null;
  const parsed = indicatorsRangeSchema.parse(range);
  const bounds = rangeBounds(parsed);
  // El estado actual no depende del rango; el reloj se inyecta igual que en el dashboard.
  void now;
  const [
    incomeResult,
    paymentsResult,
    deliveredResult,
    createdResult,
    openResult,
    servicesResult,
    customersResult,
    bookingsResult,
    coverageResult,
  ] = await Promise.all([
    income(db, actor, bounds),
    recentPayments(db, actor, bounds),
    delivered(db, actor, bounds),
    ordersCreated(db, actor, bounds),
    openNow(db, actor),
    topServices(db, actor, bounds),
    customerIndicators(db, actor, bounds),
    bookingIndicators(db, actor, parsed),
    coverageIndicators(db, actor, bounds),
  ]);
  return {
    range: parsed,
    income: incomeResult,
    payments: paymentsResult,
    delivered: deliveredResult,
    ordersCreated: createdResult,
    openNow: openResult,
    topServices: servicesResult,
    customers: customersResult,
    bookings: bookingsResult,
    coverage: coverageResult,
  };
}
