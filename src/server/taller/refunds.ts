import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { cashMovements } from "../db/schema-cash.ts";
import { products, stockMovements } from "../db/schema-inventory.ts";
import { workOrders } from "../db/schema-orders.ts";
import { payments } from "../db/schema-payments.ts";
import { saleItems, sales } from "../db/schema-sales.ts";
import { recordAudit } from "./audit.ts";
import { recordCashMovement, requireOpenCashSession } from "./cash.ts";
import { applyStockMovement } from "./stock.ts";

export const refundFormSchema = z
  .strictObject({
    saleNumber: z
      .string()
      .trim()
      .regex(/^VM-\d{5}$/)
      .optional(),
    workOrderId: z.uuid().optional(),
    amountClp: z.number().int().positive().max(2_147_483_647),
    reason: z.string().trim().min(3).max(200),
    returnedSku: z.string().trim().min(1).max(64).optional(),
    returnedQuantity: z.number().int().min(1).max(100).optional(),
  })
  .refine((input) => (input.saleNumber === undefined) !== (input.workOrderId === undefined), {
    path: ["saleNumber"],
    message: "Indica una venta o una orden, no ambas.",
  })
  .refine((input) => (input.returnedSku === undefined) === (input.returnedQuantity === undefined), {
    path: ["returnedQuantity"],
    message: "Indica el producto devuelto y su cantidad.",
  })
  .refine((input) => input.returnedSku === undefined || input.saleNumber !== undefined, {
    path: ["returnedSku"],
    message: "Solo una venta puede devolver productos al stock.",
  });
type RefundInput = z.infer<typeof refundFormSchema>;
type Target = { kind: "sale_refund" | "order_refund"; id: string; label: string };
type RefundCode =
  | "forbidden"
  | "validation_error"
  | "not_found"
  | "invalid_amount"
  | "cash_control_off"
  | "cash_closed"
  | "cash_session_closed"
  | "out_of_stock";

/** Error centinela: algo falló después de escribir; se traduce fuera de la transacción. */
class RefundFailure extends Error {
  code: RefundCode;
  constructor(code: RefundCode) {
    super(code);
    this.code = code;
  }
}

async function resolveTarget(tx: AppDb, actor: SessionUser, input: RefundInput) {
  if (input.saleNumber) {
    const number = Number(input.saleNumber.slice(3));
    const [sale] = await tx
      .select({ id: sales.id })
      .from(sales)
      .where(and(eq(sales.branchId, actor.branchId), eq(sales.number, number)))
      .for("update");
    return sale ? ({ kind: "sale_refund", id: sale.id, label: input.saleNumber } as const) : null;
  }
  const [order] = await tx
    .select({ id: workOrders.id })
    .from(workOrders)
    .where(and(eq(workOrders.branchId, actor.branchId), eq(workOrders.id, input.workOrderId ?? "")))
    .for("update");
  return order ? ({ kind: "order_refund", id: order.id, label: order.id } as const) : null;
}

async function refundableClp(tx: AppDb, actor: SessionUser, target: Target) {
  const owner = target.kind === "sale_refund" ? payments.saleId : payments.workOrderId;
  const [paid] = await tx
    .select({ total: sql<number>`coalesce(sum(${payments.amountClp}), 0)`.mapWith(Number) })
    .from(payments)
    .where(
      and(eq(payments.branchId, actor.branchId), eq(owner, target.id), isNull(payments.voidedAt)),
    );
  const [refunded] = await tx
    .select({ total: sql<number>`coalesce(sum(${cashMovements.amountClp}), 0)`.mapWith(Number) })
    .from(cashMovements)
    .where(
      and(
        eq(cashMovements.branchId, actor.branchId),
        eq(cashMovements.kind, "egreso"),
        inArray(cashMovements.referenceKind, ["sale_refund", "order_refund"]),
        eq(cashMovements.referenceId, target.id),
        isNull(cashMovements.voidedAt),
      ),
    );
  return (paid?.total ?? 0) - (refunded?.total ?? 0);
}

/** Producto devuelto de una venta: debe ser un ítem de esa venta con unidades por devolver. */
async function returnedItem(tx: AppDb, actor: SessionUser, saleId: string, input: RefundInput) {
  if (!input.returnedSku || !input.returnedQuantity) return null;
  const [item] = await tx
    .select({
      productId: saleItems.productId,
      unitCostClp: saleItems.unitCostClp,
      sold: sql<number>`sum(${saleItems.quantity})`.mapWith(Number),
    })
    .from(saleItems)
    .innerJoin(products, eq(products.id, saleItems.productId))
    .where(
      and(
        eq(saleItems.branchId, actor.branchId),
        eq(saleItems.saleId, saleId),
        eq(products.sku, input.returnedSku),
      ),
    )
    .groupBy(saleItems.productId, saleItems.unitCostClp);
  if (!item) throw new RefundFailure("not_found");
  const [returned] = await tx
    .select({ total: sql<number>`coalesce(sum(${stockMovements.quantity}), 0)`.mapWith(Number) })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.branchId, actor.branchId),
        eq(stockMovements.productId, item.productId),
        eq(stockMovements.kind, "devolucion"),
        eq(stockMovements.referenceKind, "sale_refund"),
        eq(stockMovements.referenceId, saleId),
      ),
    );
  if (input.returnedQuantity > item.sold - (returned?.total ?? 0))
    throw new RefundFailure("invalid_amount");
  return { ...item, quantity: input.returnedQuantity };
}

async function writeRefund(
  tx: AppDb,
  actor: SessionUser,
  sessionId: string,
  target: Target,
  input: RefundInput,
  now: Date,
) {
  const item =
    target.kind === "sale_refund" ? await returnedItem(tx, actor, target.id, input) : null;
  const movement = await recordCashMovement(
    tx,
    actor,
    {
      sessionId,
      kind: "egreso",
      amountClp: input.amountClp,
      referenceKind: target.kind,
      referenceId: target.id,
      note: input.reason,
    },
    now,
  );
  if (!movement.ok) throw new RefundFailure(movement.code);
  if (item) {
    const stock = await applyStockMovement(
      tx,
      actor,
      {
        productId: item.productId,
        kind: "devolucion",
        quantity: item.quantity,
        unitCostClp: item.unitCostClp,
        referenceKind: "sale_refund",
        referenceId: target.id,
      },
      now,
    );
    if (!stock.ok) throw new RefundFailure(stock.code);
  }
  const details = {
    reference: target.label,
    amountClp: input.amountClp,
    reason: input.reason,
    ...(item ? { returnedQuantity: item.quantity } : {}),
  };
  await recordAudit(
    tx,
    {
      branchId: actor.branchId,
      actorUserId: actor.id,
      action: "cash.refund",
      entity: target.kind === "sale_refund" ? "sale" : "work_order",
      entityId: target.id,
      details,
    },
    now,
  );
  return { ok: true, movementId: movement.movementId } as const;
}

export async function registerRefund(db: AppDb, actor: SessionUser, input: unknown, now: Date) {
  if (!can(actor.role, "payments.void")) return { ok: false, code: "forbidden" } as const;
  const parsed = refundFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "validation_error" } as const;
  try {
    return await db.transaction(async (tx) => {
      const cash = await requireOpenCashSession(tx, actor.branchId);
      if (cash.mode === "off") return { ok: false, code: "cash_control_off" } as const;
      if (cash.mode === "closed") return { ok: false, code: "cash_closed" } as const;
      const target = await resolveTarget(tx, actor, parsed.data);
      if (!target) return { ok: false, code: "not_found" } as const;
      if (parsed.data.amountClp > (await refundableClp(tx, actor, target)))
        return { ok: false, code: "invalid_amount" } as const;
      return writeRefund(tx, actor, cash.sessionId, target, parsed.data, now);
    });
  } catch (error) {
    if (error instanceof RefundFailure) return { ok: false, code: error.code } as const;
    throw error;
  }
}
