import { and, eq } from "drizzle-orm";
import type { SessionUser } from "../auth/admin-auth.ts";
import type { AppDb } from "../db/client.ts";
import { products, stockMovements } from "../db/schema-inventory.ts";
import type { StockMovementKind } from "../db/schema-inventory.ts";

type StockInput = {
  productId: string;
  kind: StockMovementKind;
  quantity: number;
  unitCostClp?: number;
  referenceKind?: "purchase_order" | "work_order_item" | "sale" | "sale_refund" | "import";
  referenceId?: string;
  note?: string;
};
type StockResult =
  | { ok: true; movementId: string; stockQty: number; costClp: number }
  | { ok: false; code: "not_found" | "out_of_stock" };

function isStockCheck(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const detail = current as {
      code?: string;
      constraint?: string;
      constraint_name?: string;
      cause?: unknown;
    };
    if (
      detail.code === "23514" &&
      (detail.constraint === "products_stock_qty_check" ||
        detail.constraint_name === "products_stock_qty_check")
    )
      return true;
    current = detail.cause;
  }
  return false;
}

async function writeMovement(
  tx: AppDb,
  actor: SessionUser,
  input: StockInput,
  stockQty: number,
  costClp: number,
  now: Date,
) {
  const [movement] = await tx
    .insert(stockMovements)
    .values({
      ...input,
      branchId: actor.branchId,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: stockMovements.id });
  if (!movement) throw new Error("No se pudo registrar el movimiento.");
  await tx
    .update(products)
    .set({ stockQty, costClp, updatedAt: now })
    .where(and(eq(products.branchId, actor.branchId), eq(products.id, input.productId)));
  return { ok: true, movementId: movement.id, stockQty, costClp } as const;
}

/** Solo dentro de la transacción del llamador, con entrada validada.
 * Si falla después de otras escrituras (incluido un CHECK), el llamador debe lanzar
 * un centinela y traducirlo fuera de la transacción para garantizar el rollback.
 * El costo devuelto es interno: quien lo exponga debe exigir costs.view.
 */
export async function applyStockMovement(
  tx: AppDb,
  actor: SessionUser,
  input: StockInput,
  now: Date,
): Promise<StockResult> {
  const [product] = await tx
    .select()
    .from(products)
    .where(and(eq(products.branchId, actor.branchId), eq(products.id, input.productId)))
    .for("update");
  if (!product) return { ok: false, code: "not_found" };
  const stockQty = product.stockQty + input.quantity;
  if (stockQty < 0) return { ok: false, code: "out_of_stock" };
  let costClp = product.costClp;
  if (input.kind === "compra") {
    if (input.unitCostClp === undefined) throw new Error("Falta el costo de compra.");
    costClp =
      product.stockQty > 0
        ? Math.round(
            (product.stockQty * product.costClp + input.quantity * input.unitCostClp) / stockQty,
          )
        : input.unitCostClp;
  }
  try {
    return await writeMovement(tx, actor, input, stockQty, costClp, now);
  } catch (error) {
    if (isStockCheck(error)) return { ok: false, code: "out_of_stock" };
    throw error;
  }
}
