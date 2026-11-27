import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { products } from "../db/schema-inventory.ts";
import { workOrderItems, workOrders } from "../db/schema-orders.ts";
import { recordAudit } from "./audit.ts";
import { recomputeOrderTotals } from "./order-totals.ts";
import { getOrderHeader } from "./orders.ts";
import { grossOfNet, TERMINAL_STATUSES } from "./rules.ts";
import { canAccessOrder } from "./status.ts";
import { applyStockMovement } from "./stock.ts";

const QUANTITY_MESSAGE = "Escribe una cantidad entera entre 1 y 100.";
export const productPartSchema = z.strictObject({
  productId: z.uuid({ error: "Selecciona un producto del inventario." }),
  quantity: z.coerce
    .number(QUANTITY_MESSAGE)
    .int(QUANTITY_MESSAGE)
    .min(1, QUANTITY_MESSAGE)
    .max(100, QUANTITY_MESSAGE),
});

type PartItem = typeof workOrderItems.$inferSelect;
class StockFailure extends Error {
  code: "not_found" | "out_of_stock";
  constructor(code: "not_found" | "out_of_stock") {
    super(code);
    this.code = code;
  }
}

async function lockOrder(tx: AppDb, actor: SessionUser, orderId: string) {
  await tx
    .select({ id: workOrders.id })
    .from(workOrders)
    .where(and(eq(workOrders.branchId, actor.branchId), eq(workOrders.id, orderId)))
    .for("update");
  const header = await getOrderHeader(tx, actor, orderId);
  if (!header || header.order.voidedAt) return { ok: false, code: "not_found" } as const;
  if (!canAccessOrder(actor, header.order)) return { ok: false, code: "forbidden" } as const;
  if ((TERMINAL_STATUSES as readonly string[]).includes(header.order.status))
    return { ok: false, code: "invalid_status" } as const;
  return { ok: true, order: header.order } as const;
}

async function insertPart(
  tx: AppDb,
  actor: SessionUser,
  order: typeof workOrders.$inferSelect,
  product: typeof products.$inferSelect,
  quantity: number,
  now: Date,
) {
  const [item] = await tx
    .insert(workOrderItems)
    .values({
      branchId: actor.branchId,
      workOrderId: order.id,
      productId: product.id,
      kind: "repuesto",
      origin: "inicial",
      description: product.name,
      quantity,
      unitPriceClp: order.pricingMode === "neto" ? product.priceClp : grossOfNet(product.priceClp),
      unitCostClp: product.costClp,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!item) throw new Error("No se pudo agregar el repuesto del inventario.");
  return item;
}

async function moveItemStock(
  tx: AppDb,
  actor: SessionUser,
  item: PartItem,
  kind: "consumo_orden" | "anulacion",
  now: Date,
) {
  if (!item.productId) return;
  const movement = await applyStockMovement(
    tx,
    actor,
    {
      productId: item.productId,
      kind,
      quantity: kind === "consumo_orden" ? -item.quantity : item.quantity,
      unitCostClp: item.unitCostClp ?? undefined,
      referenceKind: "work_order_item",
      referenceId: item.id,
    },
    now,
  );
  if (!movement.ok) throw new StockFailure(movement.code);
}

async function auditPart(tx: AppDb, actor: SessionUser, item: PartItem, now: Date) {
  await recordAudit(
    tx,
    {
      branchId: actor.branchId,
      actorUserId: actor.id,
      action: "item.added",
      entity: "work_order",
      entityId: item.workOrderId,
      details: {
        itemId: item.id,
        productId: item.productId,
        kind: item.kind,
        origin: item.origin,
        quantity: item.quantity,
        unitPriceClp: item.unitPriceClp,
      },
    },
    now,
  );
}

export async function addProductPartItem(
  db: AppDb,
  actor: SessionUser,
  orderId: string,
  input: unknown,
  now: Date,
) {
  if (!can(actor.role, "items.add_part")) return { ok: false, code: "forbidden" } as const;
  const parsed = productPartSchema.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(orderId).success)
    return { ok: false, code: "validation_error" } as const;
  try {
    return await db.transaction(async (tx) => {
      const access = await lockOrder(tx, actor, orderId);
      if (!access.ok) return access;
      const [product] = await tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.branchId, actor.branchId),
            eq(products.id, parsed.data.productId),
            eq(products.isActive, true),
            eq(products.forSale, true),
          ),
        )
        .for("update");
      if (!product) return { ok: false, code: "not_found" } as const;
      const item = await insertPart(tx, actor, access.order, product, parsed.data.quantity, now);
      await moveItemStock(tx, actor, item, "consumo_orden", now);
      await recomputeOrderTotals(tx, orderId, now);
      await auditPart(tx, actor, item, now);
      return { ok: true, itemId: item.id } as const;
    });
  } catch (error) {
    if (error instanceof StockFailure) return { ok: false, code: error.code } as const;
    throw error;
  }
}

/** Solo dentro de la transacción que anula la línea; cualquier fallo debe revertirla. */
export async function reverseItemStock(tx: AppDb, actor: SessionUser, item: PartItem, now: Date) {
  await moveItemStock(tx, actor, item, "anulacion", now);
}
