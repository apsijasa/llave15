import { and, asc, desc, eq, gt, ilike, lte, or } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import { isUniqueViolation } from "../db/client.ts";
import type { AppDb } from "../db/client.ts";
import { products, stockMovements, suppliers } from "../db/schema-inventory.ts";
import { users } from "../db/schema.ts";
import { recordAudit } from "./audit.ts";
import type { AuditAction } from "./audit.ts";
import { PRODUCT_CATEGORIES } from "./rules.ts";
import { applyStockMovement } from "./stock.ts";

function integer(min: number, max: number) {
  return z
    .union([
      z.number(),
      z
        .string()
        .trim()
        .regex(/^-?\d+$/),
    ])
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));
}

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);
}

const productFields = z.object({
  sku: z.string().trim().min(1).max(40).regex(/^\S+$/),
  name: z.string().trim().min(2).max(120),
  category: z.enum(PRODUCT_CATEGORIES),
  unit: z.string().trim().min(1).max(20).default("unidad"),
  costClp: integer(0, 10_000_000).default(0),
  priceClp: integer(0, 10_000_000),
  stockQty: integer(0, 100_000).default(0),
  minStock: integer(0, 100_000).default(0),
  barcode: optionalText(64),
  serialNumber: optionalText(80),
  supplierId: z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.uuid().nullable(),
  ),
  isActive: z.boolean().default(true),
});
export const productFormSchema = productFields.refine(
  (input) => input.category !== "bicicleta_usada" || input.serialNumber !== null,
  { path: ["serialNumber"], message: "Escribe el número de serie de la bicicleta." },
);
const adjustmentSchema = z.object({
  quantity: integer(-100_000, 100_000).refine((value) => value !== 0),
  reason: z.string().trim().min(3).max(200),
});
const filtersSchema = z.object({
  q: z.string().trim().optional(),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  lowOnly: z.boolean().optional(),
});
type ProductInput = z.infer<typeof productFormSchema>;
type ProductResult =
  | { ok: true; productId: string }
  | {
      ok: false;
      code: "forbidden" | "validation_error" | "not_found" | "sku_exists" | "out_of_stock";
    };

class StockFailure extends Error {
  code: "not_found" | "out_of_stock";
  constructor(code: "not_found" | "out_of_stock") {
    super(code);
    this.code = code;
  }
}

function productScope(actor: SessionUser, id: string) {
  return and(eq(products.branchId, actor.branchId), eq(products.id, id));
}

function productError(error: unknown): ProductResult {
  if (error instanceof StockFailure) return { ok: false, code: error.code };
  if (isUniqueViolation(error)) return { ok: false, code: "sku_exists" };
  throw error;
}

async function validSupplier(db: AppDb, actor: SessionUser, supplierId: string | null) {
  if (!supplierId) return true;
  const [supplier] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.branchId, actor.branchId), eq(suppliers.id, supplierId)));
  return Boolean(supplier);
}

async function auditProduct(
  tx: AppDb,
  actor: SessionUser,
  id: string,
  action: AuditAction,
  details: Record<string, unknown>,
  now: Date,
) {
  await recordAudit(
    tx,
    {
      branchId: actor.branchId,
      actorUserId: actor.id,
      action,
      entity: "product",
      entityId: id,
      details,
    },
    now,
  );
}

async function insertProduct(tx: AppDb, actor: SessionUser, input: ProductInput, now: Date) {
  const { stockQty, ...fields } = input;
  const [product] = await tx
    .insert(products)
    .values({
      ...fields,
      branchId: actor.branchId,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: products.id });
  if (!product) throw new Error("No se pudo crear el producto.");
  if (stockQty > 0) {
    const movement = await applyStockMovement(
      tx,
      actor,
      {
        productId: product.id,
        kind: "ajuste",
        quantity: stockQty,
        note: "Stock inicial",
      },
      now,
    );
    if (!movement.ok) throw new StockFailure(movement.code);
  }
  await auditProduct(tx, actor, product.id, "product.created", { productId: product.id }, now);
  return { ok: true, productId: product.id } as const;
}

export async function createProduct(
  db: AppDb,
  actor: SessionUser,
  input: unknown,
  now: Date,
): Promise<ProductResult> {
  if (!can(actor.role, "inventory.adjust")) return { ok: false, code: "forbidden" };
  const parsed = productFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "validation_error" };
  try {
    return await db.transaction(async (tx) => {
      if (!(await validSupplier(tx, actor, parsed.data.supplierId)))
        return { ok: false, code: "not_found" };
      return insertProduct(tx, actor, parsed.data, now);
    });
  } catch (error) {
    return productError(error);
  }
}

export async function updateProduct(
  db: AppDb,
  actor: SessionUser,
  id: string,
  input: unknown,
  now: Date,
): Promise<ProductResult> {
  if (!can(actor.role, "inventory.adjust")) return { ok: false, code: "forbidden" };
  const parsed = productFormSchema.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(id).success)
    return { ok: false, code: "validation_error" };
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(products)
        .where(productScope(actor, id))
        .for("update");
      if (!before || !(await validSupplier(tx, actor, parsed.data.supplierId)))
        return { ok: false, code: "not_found" };
      const { stockQty: _stockQty, ...fields } = parsed.data;
      await tx
        .update(products)
        .set({ ...fields, updatedAt: now })
        .where(productScope(actor, id));
      await auditProduct(
        tx,
        actor,
        id,
        "product.updated",
        {
          before: { priceClp: before.priceClp, costClp: before.costClp },
          after: { priceClp: fields.priceClp, costClp: fields.costClp },
        },
        now,
      );
      return { ok: true, productId: id };
    });
  } catch (error) {
    return productError(error);
  }
}

export async function adjustStock(
  db: AppDb,
  actor: SessionUser,
  id: string,
  input: unknown,
  now: Date,
) {
  if (!can(actor.role, "inventory.adjust")) return { ok: false, code: "forbidden" } as const;
  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(id).success)
    return { ok: false, code: "validation_error" } as const;
  try {
    return await db.transaction(async (tx) => {
      const { quantity, reason } = parsed.data;
      const movement = await applyStockMovement(
        tx,
        actor,
        {
          productId: id,
          kind: "ajuste",
          quantity,
          note: reason,
        },
        now,
      );
      if (!movement.ok) throw new StockFailure(movement.code);
      await auditProduct(tx, actor, id, "stock.adjusted", { productId: id, quantity, reason }, now);
      return movement;
    });
  } catch (error) {
    if (error instanceof StockFailure) return { ok: false, code: error.code } as const;
    throw error;
  }
}

function visibleProduct(actor: SessionUser, product: typeof products.$inferSelect) {
  if (can(actor.role, "costs.view")) return product;
  const { costClp: _costClp, ...visible } = product;
  return visible;
}

export async function listProducts(
  db: AppDb,
  actor: SessionUser,
  filters: z.input<typeof filtersSchema> = {},
) {
  if (!can(actor.role, "inventory.view")) return [];
  const parsed = filtersSchema.safeParse(filters);
  if (!parsed.success) return [];
  const { q, category, lowOnly } = parsed.data;
  const rows = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.branchId, actor.branchId),
        q
          ? or(
              ilike(products.sku, `%${q}%`),
              ilike(products.name, `%${q}%`),
              ilike(products.barcode, `%${q}%`),
            )
          : undefined,
        category ? eq(products.category, category) : undefined,
        lowOnly
          ? and(
              eq(products.isActive, true),
              gt(products.minStock, 0),
              lte(products.stockQty, products.minStock),
            )
          : undefined,
      ),
    )
    .orderBy(asc(products.name), asc(products.id))
    .limit(300);
  return rows.map((product) => visibleProduct(actor, product));
}

export async function getProduct(db: AppDb, actor: SessionUser, id: string) {
  if (!can(actor.role, "inventory.view") || !z.uuid().safeParse(id).success) return null;
  const [product] = await db.select().from(products).where(productScope(actor, id));
  if (!product) return null;
  const rows = await db
    .select({ movement: stockMovements, actorName: users.name })
    .from(stockMovements)
    .innerJoin(
      users,
      and(eq(users.id, stockMovements.createdBy), eq(users.branchId, actor.branchId)),
    )
    .where(and(eq(stockMovements.branchId, actor.branchId), eq(stockMovements.productId, id)))
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(50);
  const movements = rows.map(({ movement, actorName }) => {
    if (can(actor.role, "costs.view")) return { ...movement, actorName };
    const { unitCostClp: _unitCostClp, ...visible } = movement;
    return { ...visible, actorName };
  });
  return { ...visibleProduct(actor, product), movements };
}
