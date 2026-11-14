import { and, asc, eq, gt, lte } from "drizzle-orm";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { products } from "../db/schema-inventory.ts";

function selectLowStock(db: AppDb, branchId?: string) {
  return db
    .select({
      branchId: products.branchId,
      sku: products.sku,
      name: products.name,
      stockQty: products.stockQty,
      minStock: products.minStock,
    })
    .from(products)
    .where(
      and(
        eq(products.isActive, true),
        gt(products.minStock, 0),
        lte(products.stockQty, products.minStock),
        branchId === undefined ? undefined : eq(products.branchId, branchId),
      ),
    )
    .orderBy(asc(products.sku));
}

/** El resumen diario reúne el stock bajo de todas las sucursales. */
export async function lowStockProducts(db: AppDb) {
  return selectLowStock(db);
}

export async function branchLowStock(db: AppDb, actor: SessionUser) {
  if (!can(actor.role, "purchases.manage")) return null;
  return selectLowStock(db, actor.branchId);
}
