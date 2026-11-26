import { and, eq, isNull, sql } from "drizzle-orm";
import type { AppDb } from "../db/client.ts";
import { workOrderItems, workOrders } from "../db/schema-orders.ts";
import { recordStatusChange } from "./orders.ts";
import { normalizeOrderStatus, vatOfNet } from "./rules.ts";

/** Pagado exige saldo cero (BG-D54): si el total cambia, la orden vuelve a Lista para retirar. */
async function reopenPaidOrder(
  db: AppDb,
  order: { branchId: string; status: string; paidClp: number },
  orderId: string,
  totalClp: number,
  now: Date,
) {
  if (normalizeOrderStatus(order.status) !== "pagado" || totalClp === order.paidClp) return false;
  const recorded = await recordStatusChange(
    db,
    {
      branchId: order.branchId,
      orderId,
      from: "pagado",
      to: "lista_para_retirar",
      actorUserId: null,
      note: "Cambió el total",
    },
    now,
  );
  if (!recorded.ok) throw new Error("No se pudo registrar el cambio de estado por el total.");
  return true;
}

/** Recibe la misma transacción que agrega, cambia o anula la línea. */
export async function recomputeOrderTotals(db: AppDb, orderId: string, now: Date) {
  const [order] = await db
    .select({
      branchId: workOrders.branchId,
      pricingMode: workOrders.pricingMode,
      status: workOrders.status,
      paidClp: workOrders.paidClp,
    })
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
  const totalClp = order.pricingMode === "neto" ? subtotalClp + vatClp : totals.totalClp;
  const reopened = await reopenPaidOrder(db, order, orderId, totalClp, now);
  await db
    .update(workOrders)
    .set({
      ...totals,
      ...(order.pricingMode === "neto" ? { subtotalClp, vatClp, totalClp } : {}),
      ...(reopened ? { status: "lista_para_retirar" } : {}),
      updatedAt: now,
    })
    .where(and(eq(workOrders.branchId, order.branchId), eq(workOrders.id, orderId)));
}
