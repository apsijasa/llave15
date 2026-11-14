import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { products, purchaseOrderItems, purchaseOrders, suppliers } from "../db/schema-inventory.ts";
import { recordAudit } from "./audit.ts";
import type { AuditAction } from "./audit.ts";
import { PURCHASE_DOC_TYPES } from "./rules.ts";
import { applyStockMovement } from "./stock.ts";

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);
}
function integer(min: number, max: number) {
  return z
    .union([z.number(), z.string().trim().regex(/^\d+$/)])
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));
}
const createSchema = z.object({ supplierId: z.uuid(), notes: optionalText(500) });
const itemSchema = z.object({
  productId: z.uuid(),
  quantity: integer(1, 10_000),
  unitCostClp: integer(0, 10_000_000),
});
const receiptSchema = z.object({
  docType: z.preprocess(
    (value) => (value === "" ? null : value),
    z.enum(PURCHASE_DOC_TYPES).nullish(),
  ),
  docNumber: optionalText(80),
});
const voidSchema = z.object({ reason: z.string().trim().min(3).max(200) });
type FailureCode =
  | "forbidden"
  | "validation_error"
  | "not_found"
  | "invalid_status"
  | "out_of_stock";
type PurchaseResult = { ok: true; purchaseId: string } | { ok: false; code: FailureCode };

class PurchaseFailure extends Error {
  code: FailureCode;
  constructor(code: FailureCode) {
    super(code);
    this.code = code;
  }
}

export function formatPurchaseNumber(n: number): string {
  return `OC-${String(n).padStart(5, "0")}`;
}
function purchaseScope(actor: SessionUser, id: string) {
  return and(eq(purchaseOrders.branchId, actor.branchId), eq(purchaseOrders.id, id));
}
function itemScope(actor: SessionUser, id: string) {
  return and(
    eq(purchaseOrderItems.branchId, actor.branchId),
    eq(purchaseOrderItems.purchaseOrderId, id),
  );
}
async function auditPurchase(
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
      entity: "purchase",
      entityId: id,
      details,
    },
    now,
  );
}
async function allocatePurchaseNumber(db: AppDb, branchId: string) {
  const result = (await db.execute(sql`
    update branches set next_purchase_number = next_purchase_number + 1
    where id = ${branchId} returning next_purchase_number - 1 as number
  `)) as unknown as { number: number }[] | { rows: { number: number }[] };
  const [row] = Array.isArray(result) ? result : result.rows;
  if (!row) throw new Error("No se encontró la sucursal para numerar la compra.");
  return row.number;
}

export async function createPurchase(
  db: AppDb,
  actor: SessionUser,
  input: unknown,
  now: Date,
): Promise<PurchaseResult> {
  if (!can(actor.role, "purchases.manage")) return { ok: false, code: "forbidden" };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "validation_error" };
  return db.transaction(async (tx) => {
    const [supplier] = await tx
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.branchId, actor.branchId), eq(suppliers.id, parsed.data.supplierId)));
    if (!supplier) return { ok: false, code: "not_found" };
    const number = await allocatePurchaseNumber(tx, actor.branchId);
    const [purchase] = await tx
      .insert(purchaseOrders)
      .values({
        ...parsed.data,
        branchId: actor.branchId,
        number,
        status: "borrador",
        createdBy: actor.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: purchaseOrders.id });
    if (!purchase) throw new Error("No se pudo crear la compra.");
    await auditPurchase(tx, actor, purchase.id, "purchase.created", { number }, now);
    return { ok: true, purchaseId: purchase.id };
  });
}

async function mutatePurchase<T>(
  db: AppDb,
  actor: SessionUser,
  id: string,
  input: unknown,
  schema: z.ZodType<T>,
  statuses: readonly string[],
  action: AuditAction,
  now: Date,
  change: (tx: AppDb, data: T) => Promise<Record<string, unknown>>,
): Promise<PurchaseResult> {
  if (!can(actor.role, "purchases.manage")) return { ok: false, code: "forbidden" };
  const parsed = schema.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(id).success)
    return { ok: false, code: "validation_error" };
  try {
    return await db.transaction(async (tx) => {
      const [purchase] = await tx
        .select()
        .from(purchaseOrders)
        .where(purchaseScope(actor, id))
        .for("update");
      if (!purchase) return { ok: false, code: "not_found" };
      if (!statuses.includes(purchase.status)) return { ok: false, code: "invalid_status" };
      const details = await change(tx, parsed.data);
      await auditPurchase(tx, actor, id, action, details, now);
      return { ok: true, purchaseId: id };
    });
  } catch (error) {
    if (error instanceof PurchaseFailure) return { ok: false, code: error.code };
    throw error;
  }
}

export async function addPurchaseItem(
  db: AppDb,
  actor: SessionUser,
  id: string,
  input: unknown,
  now: Date,
) {
  return mutatePurchase(
    db,
    actor,
    id,
    input,
    itemSchema,
    ["borrador"],
    "purchase.item_added",
    now,
    async (tx, data) => {
      const [product] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.branchId, actor.branchId), eq(products.id, data.productId)));
      if (!product) throw new PurchaseFailure("not_found");
      await tx.insert(purchaseOrderItems).values({
        ...data,
        branchId: actor.branchId,
        purchaseOrderId: id,
        createdAt: now,
        updatedAt: now,
      });
      return { productId: data.productId, quantity: data.quantity };
    },
  );
}

export async function sendPurchase(db: AppDb, actor: SessionUser, id: string, now: Date) {
  return mutatePurchase(
    db,
    actor,
    id,
    {},
    z.object({}),
    ["borrador"],
    "purchase.sent",
    now,
    async (tx) => {
      await tx
        .update(purchaseOrders)
        .set({ status: "enviada", updatedAt: now })
        .where(purchaseScope(actor, id));
      return {};
    },
  );
}

async function receiveItems(tx: AppDb, actor: SessionUser, id: string, now: Date) {
  const items = await tx
    .select()
    .from(purchaseOrderItems)
    .where(itemScope(actor, id))
    .orderBy(asc(purchaseOrderItems.productId), asc(purchaseOrderItems.id));
  if (!items.length) throw new PurchaseFailure("invalid_status");
  // Orden estable de locks de productos para compras que comparten varias líneas.
  for (const item of items) {
    const result = await applyStockMovement(
      tx,
      actor,
      {
        productId: item.productId,
        kind: "compra",
        quantity: item.quantity,
        unitCostClp: item.unitCostClp,
        referenceKind: "purchase_order",
        referenceId: id,
      },
      now,
    );
    if (!result.ok) throw new PurchaseFailure(result.code);
    await tx
      .update(purchaseOrderItems)
      .set({ receivedQty: item.quantity, updatedAt: now })
      .where(and(itemScope(actor, id), eq(purchaseOrderItems.id, item.id)));
  }
  return items.length;
}

export async function receivePurchase(
  db: AppDb,
  actor: SessionUser,
  id: string,
  input: unknown,
  now: Date,
) {
  return mutatePurchase(
    db,
    actor,
    id,
    input,
    receiptSchema,
    ["borrador", "enviada"],
    "purchase.received",
    now,
    async (tx, data) => {
      const itemCount = await receiveItems(tx, actor, id, now);
      await tx
        .update(purchaseOrders)
        .set({
          ...data,
          status: "recibida",
          receivedAt: now,
          receivedBy: actor.id,
          updatedAt: now,
        })
        .where(purchaseScope(actor, id));
      return { itemCount };
    },
  );
}

export async function voidPurchase(
  db: AppDb,
  actor: SessionUser,
  id: string,
  input: unknown,
  now: Date,
) {
  return mutatePurchase(
    db,
    actor,
    id,
    input,
    voidSchema,
    ["borrador", "enviada"],
    "purchase.voided",
    now,
    async (tx, data) => {
      await tx
        .update(purchaseOrders)
        .set({
          status: "anulada",
          voidedAt: now,
          voidedBy: actor.id,
          updatedAt: now,
        })
        .where(purchaseScope(actor, id));
      return { reason: data.reason };
    },
  );
}

function purchaseRows(db: AppDb, actor: SessionUser) {
  return db
    .select({ purchase: purchaseOrders, supplierName: suppliers.name })
    .from(purchaseOrders)
    .innerJoin(
      suppliers,
      and(eq(suppliers.id, purchaseOrders.supplierId), eq(suppliers.branchId, actor.branchId)),
    );
}

export async function listPurchases(db: AppDb, actor: SessionUser) {
  if (!can(actor.role, "purchases.manage")) return [];
  const rows = await purchaseRows(db, actor)
    .where(eq(purchaseOrders.branchId, actor.branchId))
    .orderBy(desc(purchaseOrders.number))
    .limit(300);
  const totals = can(actor.role, "costs.view")
    ? await db
        .select({
          id: purchaseOrderItems.purchaseOrderId,
          total: sql<string>`sum(${purchaseOrderItems.quantity}::bigint * ${purchaseOrderItems.unitCostClp})`,
        })
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.branchId, actor.branchId))
        .groupBy(purchaseOrderItems.purchaseOrderId)
    : [];
  const byId = new Map(totals.map((row) => [row.id, Number(row.total)]));
  return rows.map(({ purchase, supplierName }) => ({
    ...purchase,
    supplierName,
    ...(can(actor.role, "costs.view") ? { totalClp: byId.get(purchase.id) ?? 0 } : {}),
  }));
}

export async function getPurchase(db: AppDb, actor: SessionUser, id: string) {
  if (!can(actor.role, "purchases.manage") || !z.uuid().safeParse(id).success) return null;
  const [row] = await purchaseRows(db, actor).where(purchaseScope(actor, id));
  if (!row) return null;
  const rows = await db
    .select({
      item: purchaseOrderItems,
      productName: products.name,
      sku: products.sku,
      stockQty: products.stockQty,
    })
    .from(purchaseOrderItems)
    .innerJoin(
      products,
      and(eq(products.id, purchaseOrderItems.productId), eq(products.branchId, actor.branchId)),
    )
    .where(itemScope(actor, id))
    .orderBy(asc(purchaseOrderItems.createdAt), asc(purchaseOrderItems.id));
  const items = rows.map(({ item, ...product }) => {
    if (can(actor.role, "costs.view")) return { ...item, ...product };
    const { unitCostClp: _cost, ...visible } = item;
    return { ...visible, ...product };
  });
  return { ...row.purchase, supplierName: row.supplierName, items };
}
