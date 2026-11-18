import { eq } from "drizzle-orm";
import type { BookingConfig } from "../booking/config.ts";
import { bookingConfigFromShop } from "../booking/config.ts";
import type { AppDb } from "../db/client.ts";
import { shops } from "../db/schema-shops.ts";
import { branches } from "../db/schema.ts";

export type BookingScope = {
  shopId: string;
  slug: string;
  branchId: string;
  config: BookingConfig;
};

export class ShopScopeError extends Error {
  readonly code: "ambiguous" | "missing";

  constructor(code: "ambiguous" | "missing") {
    super(
      code === "ambiguous"
        ? "Hay más de un taller o sucursal. Indica el alcance del taller."
        : "Falta el taller o su sucursal para resolver el alcance.",
    );
    this.name = "ShopScopeError";
    this.code = code;
  }
}

export async function scopeForBranch(db: AppDb, branchId: string): Promise<BookingScope | null> {
  const [row] = await db
    .select({ shop: shops, branchId: branches.id })
    .from(branches)
    .innerJoin(shops, eq(branches.shopId, shops.id))
    .where(eq(branches.id, branchId))
    .limit(1);
  if (!row) return null;
  return {
    shopId: row.shop.id,
    slug: row.shop.slug,
    branchId: row.branchId,
    config: bookingConfigFromShop(row.shop),
  };
}

export async function singleShopScope(db: AppDb): Promise<BookingScope> {
  const rows = await db.select().from(shops).limit(2);
  if (rows.length > 1) throw new ShopScopeError("ambiguous");
  const shop = rows[0];
  if (!shop) throw new ShopScopeError("missing");
  const shopBranches = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.shopId, shop.id))
    .limit(2);
  if (shopBranches.length > 1) throw new ShopScopeError("ambiguous");
  const branch = shopBranches[0];
  if (!branch) throw new ShopScopeError("missing");
  return {
    shopId: shop.id,
    slug: shop.slug,
    branchId: branch.id,
    config: bookingConfigFromShop(shop),
  };
}
