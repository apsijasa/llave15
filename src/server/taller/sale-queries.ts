import { and, asc, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { DateTime } from "luxon";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import { TIMEZONE } from "../booking/rules.ts";
import type { AppDb } from "../db/client.ts";
import { payments } from "../db/schema-payments.ts";
import { saleItems, sales } from "../db/schema-sales.ts";
import { customers } from "../db/schema-taller.ts";

export function formatSaleNumber(number: number): string {
  return `VM-${String(number).padStart(5, "0")}`;
}

/** Omite el costo congelado para roles sin costs.view. */
export function visibleItem<T extends { unitCostClp: number }>(actor: SessionUser, item: T) {
  if (can(actor.role, "costs.view")) return item;
  const { unitCostClp: _cost, ...visible } = item;
  return visible;
}

const rangeSchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine(
    ({ from, to }) =>
      from <= to &&
      DateTime.fromISO(to, { zone: "UTC" }).diff(DateTime.fromISO(from, { zone: "UTC" }), "days")
        .days < 31,
  );

async function saleRows(db: AppDb, actor: SessionUser, filter: ReturnType<typeof and>) {
  const rows = await db
    .select({ sale: sales, customerName: customers.name })
    .from(sales)
    .leftJoin(
      customers,
      and(eq(customers.id, sales.customerId), eq(customers.branchId, actor.branchId)),
    )
    .where(and(eq(sales.branchId, actor.branchId), filter))
    .orderBy(desc(sales.createdAt), desc(sales.number));
  if (!rows.length) return [];
  const ids = rows.map(({ sale }) => sale.id);
  const items = await db
    .select()
    .from(saleItems)
    .where(and(eq(saleItems.branchId, actor.branchId), inArray(saleItems.saleId, ids)))
    .orderBy(asc(saleItems.createdAt), asc(saleItems.id));
  const paid = await db
    .select()
    .from(payments)
    .where(and(eq(payments.branchId, actor.branchId), inArray(payments.saleId, ids)))
    .orderBy(asc(payments.receivedAt), asc(payments.id));
  const visiblePayments = paid.map((payment) => {
    if (can(actor.role, "costs.view")) return payment;
    const { feeClp: _fee, netClp: _net, ...visible } = payment;
    return visible;
  });
  return rows.map(({ sale, customerName }) => ({
    ...sale,
    number: formatSaleNumber(sale.number),
    customerName,
    method: paid.find((payment) => payment.saleId === sale.id)?.method,
    items: items.filter((item) => item.saleId === sale.id).map((item) => visibleItem(actor, item)),
    payments: visiblePayments.filter((payment) => payment.saleId === sale.id),
  }));
}

export async function listSales(
  db: AppDb,
  actor: SessionUser,
  range: { from: string; to: string },
) {
  if (!can(actor.role, "sales.record")) return [];
  const parsed = rangeSchema.safeParse(range);
  if (!parsed.success) return [];
  const start = DateTime.fromISO(parsed.data.from, { zone: TIMEZONE }).startOf("day").toJSDate();
  const end = DateTime.fromISO(parsed.data.to, { zone: TIMEZONE })
    .plus({ days: 1 })
    .startOf("day")
    .toJSDate();
  return saleRows(db, actor, and(gte(sales.createdAt, start), lt(sales.createdAt, end)));
}

export async function listCustomerSales(db: AppDb, actor: SessionUser, customerId: string) {
  if (!can(actor.role, "sales.record") || !z.uuid().safeParse(customerId).success) return [];
  return saleRows(db, actor, and(eq(sales.customerId, customerId), isNull(sales.voidedAt)));
}
