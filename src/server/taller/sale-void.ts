import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { payments } from "../db/schema-payments.ts";
import { saleItems, sales } from "../db/schema-sales.ts";
import { recordAudit } from "./audit.ts";
import { applyStockMovement } from "./stock.ts";

const reasonSchema = z.object({ reason: z.string().trim().min(3).max(200) });
class VoidFailure extends Error {
  code: "not_found" | "out_of_stock";
  constructor(code: "not_found" | "out_of_stock") {
    super(code);
    this.code = code;
  }
}

async function restoreStock(tx: AppDb, actor: SessionUser, saleId: string, now: Date) {
  const items = await tx
    .select()
    .from(saleItems)
    .where(and(eq(saleItems.branchId, actor.branchId), eq(saleItems.saleId, saleId)))
    .orderBy(asc(saleItems.productId));
  for (const item of items) {
    const movement = await applyStockMovement(
      tx,
      actor,
      {
        productId: item.productId,
        kind: "anulacion",
        quantity: item.quantity,
        unitCostClp: item.unitCostClp,
        referenceKind: "sale",
        referenceId: saleId,
      },
      now,
    );
    if (!movement.ok) throw new VoidFailure(movement.code);
  }
}

async function voidPayments(
  tx: AppDb,
  actor: SessionUser,
  saleId: string,
  reason: string,
  now: Date,
) {
  const rows = await tx
    .update(payments)
    .set({ voidedAt: now, voidedBy: actor.id, updatedAt: now })
    .where(
      and(
        eq(payments.branchId, actor.branchId),
        eq(payments.saleId, saleId),
        isNull(payments.voidedAt),
      ),
    )
    .returning({ id: payments.id, amountClp: payments.amountClp });
  for (const payment of rows)
    await recordAudit(
      tx,
      {
        branchId: actor.branchId,
        actorUserId: actor.id,
        entity: "sale",
        entityId: saleId,
        action: "payment.voided",
        details: { paymentId: payment.id, amountClp: payment.amountClp, reason },
      },
      now,
    );
}

async function cancelSale(
  tx: AppDb,
  actor: SessionUser,
  sale: typeof sales.$inferSelect,
  reason: string,
  now: Date,
) {
  const saleId = sale.id;
  await tx
    .update(sales)
    .set({
      status: "anulada",
      voidedAt: now,
      voidedBy: actor.id,
      voidReason: reason,
      paidClp: 0,
      updatedAt: now,
    })
    .where(and(eq(sales.branchId, actor.branchId), eq(sales.id, saleId)));
  await restoreStock(tx, actor, saleId, now);
  await voidPayments(tx, actor, saleId, reason, now);
  await recordAudit(
    tx,
    {
      branchId: actor.branchId,
      actorUserId: actor.id,
      action: "sale.voided",
      entity: "sale",
      entityId: saleId,
      details: { number: sale.number, reason },
    },
    now,
  );
  return { ok: true, saleId } as const;
}

export async function voidSale(
  db: AppDb,
  actor: SessionUser,
  saleId: string,
  input: unknown,
  now: Date,
) {
  if (!can(actor.role, "payments.void")) return { ok: false, code: "forbidden" } as const;
  const parsed = reasonSchema.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(saleId).success)
    return { ok: false, code: "validation_error" } as const;
  try {
    return await db.transaction(async (tx) => {
      const [sale] = await tx
        .select()
        .from(sales)
        .where(and(eq(sales.branchId, actor.branchId), eq(sales.id, saleId)))
        .for("update");
      if (!sale) return { ok: false, code: "not_found" } as const;
      if (sale.voidedAt || (sale.status !== "pagada" && sale.status !== "abierta"))
        return { ok: false, code: "invalid_status" } as const;
      return cancelSale(tx, actor, sale, parsed.data.reason, now);
    });
  } catch (error) {
    if (error instanceof VoidFailure) return { ok: false, code: error.code } as const;
    throw error;
  }
}
