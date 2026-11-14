import { and, eq, isNull, sql } from "drizzle-orm";
import type { AppDb } from "../db/client.ts";
import { workOrderItems, workOrders } from "../db/schema-orders.ts";
import { vatOfNet } from "./rules.ts";

/** Recibe la misma transacción que agrega, cambia o anula la línea. */
export async function recomputeOrderTotals(db: AppDb, orderId: string, now: Date) {
  const [order] = await db
    .select({ branchId: workOrders.branchId, pricingMode: workOrders.pricingMode })
    .from(workOrders)
    .where(eq(workOrders.id, orderId))
    .limit(1);
  if (!order) return;
  const [totals] = await db
    .select({
      totalClp: sql<number>`coalesce(sum(quantity * unit_price_clp), 0)`.mapWith(Number),
      estimatedMinutes: sql<number>`coalesce(sum(quantity * estimated_minutes), 0)`.mapWith(Number),
    })
    .from(workOrderItems)
    .where(
      and(
        eq(workOrderItems.branchId, order.branchId),
        eq(workOrderItems.workOrderId, orderId),
        isNull(workOrderItems.voidedAt),
      ),
    );
  if (!totals) throw new Error("No se pudieron calcular los totales.");
  const subtotalClp = totals.totalClp;
  const vatClp = vatOfNet(subtotalClp);
  await db
    .update(workOrders)
    .set({
      ...totals,
      ...(order.pricingMode === "neto"
        ? { subtotalClp, vatClp, totalClp: subtotalClp + vatClp }
        : {}),
      updatedAt: now,
    })
    .where(and(eq(workOrders.branchId, order.branchId), eq(workOrders.id, orderId)));
}
