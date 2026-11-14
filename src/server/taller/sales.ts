import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import { TIMEZONE } from "../booking/rules.ts";
import type { AppDb } from "../db/client.ts";
import { products } from "../db/schema-inventory.ts";
import { payments } from "../db/schema-payments.ts";
import { saleItems, sales } from "../db/schema-sales.ts";
import { customers } from "../db/schema-taller.ts";
import { branches } from "../db/schema.ts";
import { recordAudit } from "./audit.ts";
import type { AuditAction } from "./audit.ts";
import { RECORDABLE_PAYMENT_METHODS, vatOfNet } from "./rules.ts";
import { applyStockMovement } from "./stock.ts";

const pesos = z.number().int().min(0).max(2_147_483_647);
export const saleFormSchema = z
  .object({
    items: z
      .array(z.object({ productId: z.uuid(), quantity: z.number().int().min(1).max(100) }))
      .min(1)
      .max(5)
      .refine(
        (items) => new Set(items.map((item) => item.productId)).size === items.length,
        "No repitas productos.",
      ),
    customerId: z.uuid().optional(),
    discountClp: pesos.default(0),
    discountReason: z.string().trim().min(3).max(200).optional(),
    method: z.enum(RECORDABLE_PAYMENT_METHODS),
    externalId: z.string().trim().min(1).max(100).optional(),
    feeClp: pesos.optional(),
    docType: z.enum(["boleta", "factura"]).optional(),
    docNumber: z.string().trim().max(30).optional(),
  })
  .refine((data) => !data.discountClp || Boolean(data.discountReason), {
    path: ["discountReason"],
    message: "Escribe el motivo del descuento.",
  })
  .refine((data) => data.method !== "mercadopago" || Boolean(data.externalId), {
    path: ["externalId"],
    message: "Escribe el id de la operación.",
  })
  .refine((data) => data.method === "mercadopago" || data.feeClp === undefined, {
    path: ["feeClp"],
    message: "La comisión es solo para Mercado Pago.",
  });
type SaleInput = z.infer<typeof saleFormSchema>;
type FailureCode =
  | "forbidden"
  | "validation_error"
  | "not_found"
  | "out_of_stock"
  | "invalid_amount";
class SaleFailure extends Error {
  code: FailureCode;
  constructor(code: FailureCode) {
    super(code);
    this.code = code;
  }
}

export function formatSaleNumber(number: number): string {
  return `VM-${String(number).padStart(5, "0")}`;
}

function parseSale(actor: SessionUser, input: unknown) {
  if (!can(actor.role, "sales.record")) throw new SaleFailure("forbidden");
  const discount = z.object({ discountClp: z.number().positive() }).safeParse(input);
  if (discount.success && !can(actor.role, "items.override_price"))
    throw new SaleFailure("forbidden");
  const parsed = saleFormSchema.safeParse(input);
  if (!parsed.success) throw new SaleFailure("validation_error");
  return parsed.data;
}

function saleError(error: unknown) {
  if (error instanceof SaleFailure) return { ok: false, code: error.code } as const;
  throw error;
}

async function calculateSale(db: AppDb, actor: SessionUser, input: SaleInput, lock = false) {
  if (input.customerId) {
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.branchId, actor.branchId), eq(customers.id, input.customerId)));
    if (!customer) throw new SaleFailure("not_found");
  }
  const items = [];
  // Orden estable de bloqueo para ventas con varios productos.
  for (const item of [...input.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
    const query = db
      .select()
      .from(products)
      .where(
        and(
          eq(products.branchId, actor.branchId),
          eq(products.id, item.productId),
          eq(products.isActive, true),
        ),
      );
    const [product] = await (lock ? query.for("update") : query);
    if (!product) throw new SaleFailure("not_found");
    if (product.stockQty < item.quantity) throw new SaleFailure("out_of_stock");
    items.push({
      ...item,
      description: product.name,
      unitPriceClp: product.priceClp,
      unitCostClp: product.costClp,
    });
  }
  const subtotalClp =
    items.reduce((sum, item) => sum + item.quantity * item.unitPriceClp, 0) - input.discountClp;
  const vatClp = vatOfNet(subtotalClp);
  const totalClp = subtotalClp + vatClp;
  if (
    subtotalClp < 0 ||
    totalClp <= 0 ||
    totalClp > 2_147_483_647 ||
    (input.feeClp ?? 0) > totalClp
  )
    throw new SaleFailure("invalid_amount");
  return { items, subtotalClp, vatClp, totalClp };
}
type CalculatedSale = Awaited<ReturnType<typeof calculateSale>>;

function visibleItem(
  actor: SessionUser,
  item: CalculatedSale["items"][number] | typeof saleItems.$inferSelect,
) {
  if (can(actor.role, "costs.view")) return item;
  const { unitCostClp: _cost, ...visible } = item;
  return visible;
}

export async function previewSale(db: AppDb, actor: SessionUser, input: unknown) {
  try {
    const calculated = await calculateSale(db, actor, parseSale(actor, input));
    return {
      ok: true,
      ...calculated,
      items: calculated.items.map((item) => visibleItem(actor, item)),
    } as const;
  } catch (error) {
    return saleError(error);
  }
}

async function auditSale(
  tx: AppDb,
  actor: SessionUser,
  saleId: string,
  action: AuditAction,
  details: Record<string, unknown>,
  now: Date,
) {
  const entry = {
    branchId: actor.branchId,
    actorUserId: actor.id,
    entity: "sale",
    entityId: saleId,
    action,
    details,
  };
  await recordAudit(tx, entry, now);
}

async function writeSaleItems(
  tx: AppDb,
  actor: SessionUser,
  saleId: string,
  items: CalculatedSale["items"],
  now: Date,
) {
  for (const item of items) {
    await tx
      .insert(saleItems)
      .values({ ...item, branchId: actor.branchId, saleId, createdAt: now, updatedAt: now });
    const movement = await applyStockMovement(
      tx,
      actor,
      {
        productId: item.productId,
        kind: "venta",
        quantity: -item.quantity,
        unitCostClp: item.unitCostClp,
        referenceKind: "sale",
        referenceId: saleId,
      },
      now,
    );
    if (!movement.ok) throw new SaleFailure(movement.code);
  }
}

async function insertSale(
  tx: AppDb,
  actor: SessionUser,
  input: SaleInput,
  totals: CalculatedSale,
  now: Date,
) {
  const [branch] = await tx
    .update(branches)
    .set({ nextSaleNumber: sql`${branches.nextSaleNumber} + 1` })
    .where(eq(branches.id, actor.branchId))
    .returning({ number: sql<number>`${branches.nextSaleNumber} - 1` });
  if (!branch) throw new SaleFailure("not_found");
  const {
    items: _items,
    method: _method,
    externalId: _externalId,
    feeClp: _feeClp,
    ...fields
  } = input;
  const [sale] = await tx
    .insert(sales)
    .values({
      ...fields,
      branchId: actor.branchId,
      number: branch.number,
      subtotalClp: totals.subtotalClp,
      vatClp: totals.vatClp,
      totalClp: totals.totalClp,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!sale) throw new Error("No se pudo registrar la venta.");
  await writeSaleItems(tx, actor, sale.id, totals.items, now);
  return sale;
}

async function paySale(
  tx: AppDb,
  actor: SessionUser,
  sale: typeof sales.$inferSelect,
  input: SaleInput,
  now: Date,
) {
  const feeClp = input.feeClp ?? 0;
  const [payment] = await tx
    .insert(payments)
    .values({
      branchId: actor.branchId,
      saleId: sale.id,
      workOrderId: null,
      kind: "final",
      method: input.method,
      amountClp: sale.totalClp,
      externalId: input.method === "mercadopago" ? input.externalId : null,
      feeClp,
      netClp: input.method === "mercadopago" ? sale.totalClp - feeClp : null,
      receivedBy: actor.id,
      receivedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: payments.id });
  if (!payment) throw new Error("No se pudo registrar el pago.");
  await tx
    .update(sales)
    .set({ status: "pagada", paidClp: sale.totalClp, updatedAt: now })
    .where(and(eq(sales.branchId, actor.branchId), eq(sales.id, sale.id)));
  await auditSale(
    tx,
    actor,
    sale.id,
    "payment.recorded",
    { paymentId: payment.id, method: input.method, amountClp: sale.totalClp },
    now,
  );
}

export async function createSale(db: AppDb, actor: SessionUser, input: unknown, now: Date) {
  try {
    const parsed = parseSale(actor, input);
    return await db.transaction(async (tx) => {
      // La sucursal serializa la numeración; siempre se bloquea antes que los productos.
      const [branch] = await tx
        .select({ id: branches.id })
        .from(branches)
        .where(eq(branches.id, actor.branchId))
        .for("update");
      if (!branch) throw new SaleFailure("not_found");
      const totals = await calculateSale(tx, actor, parsed, true);
      const sale = await insertSale(tx, actor, parsed, totals, now);
      await paySale(tx, actor, sale, parsed, now);
      await auditSale(
        tx,
        actor,
        sale.id,
        "sale.created",
        {
          number: sale.number,
          totalClp: sale.totalClp,
          items: totals.items.map(({ unitCostClp: _cost, ...item }) => item),
        },
        now,
      );
      if (parsed.discountClp > 0)
        await auditSale(
          tx,
          actor,
          sale.id,
          "sale.discounted",
          { amountClp: parsed.discountClp, reason: parsed.discountReason },
          now,
        );
      return {
        ok: true,
        saleId: sale.id,
        number: formatSaleNumber(sale.number),
        totalClp: sale.totalClp,
      } as const;
    });
  } catch (error) {
    return saleError(error);
  }
}

const rangeSchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine(
    ({ from, to }) =>
      from <= to &&
      DateTime.fromISO(to, { zone: "UTC" }).diff(DateTime.fromISO(from, { zone: "UTC" }), "days")
        .days < 31,
  );

async function saleRows(db: AppDb, actor: SessionUser, filter: ReturnType<typeof and>) {
  const rows = await db
    .select({ sale: sales, customerName: customers.name })
    .from(sales)
    .leftJoin(
      customers,
      and(eq(customers.id, sales.customerId), eq(customers.branchId, actor.branchId)),
    )
    .where(and(eq(sales.branchId, actor.branchId), filter))
    .orderBy(desc(sales.createdAt), desc(sales.number));
  if (!rows.length) return [];
  const ids = rows.map(({ sale }) => sale.id);
  const items = await db
    .select()
    .from(saleItems)
    .where(and(eq(saleItems.branchId, actor.branchId), inArray(saleItems.saleId, ids)))
    .orderBy(asc(saleItems.createdAt), asc(saleItems.id));
  const paid = await db
    .select()
    .from(payments)
    .where(and(eq(payments.branchId, actor.branchId), inArray(payments.saleId, ids)))
    .orderBy(asc(payments.receivedAt), asc(payments.id));
  const visiblePayments = paid.map((payment) => {
    if (can(actor.role, "costs.view")) return payment;
    const { feeClp: _fee, netClp: _net, ...visible } = payment;
    return visible;
  });
  return rows.map(({ sale, customerName }) => ({
    ...sale,
    number: formatSaleNumber(sale.number),
    customerName,
    method: paid.find((payment) => payment.saleId === sale.id)?.method,
    items: items.filter((item) => item.saleId === sale.id).map((item) => visibleItem(actor, item)),
    payments: visiblePayments.filter((payment) => payment.saleId === sale.id),
  }));
}

export async function listSales(
  db: AppDb,
  actor: SessionUser,
  range: { from: string; to: string },
) {
  if (!can(actor.role, "sales.record")) return [];
  const parsed = rangeSchema.safeParse(range);
  if (!parsed.success) return [];
  const start = DateTime.fromISO(parsed.data.from, { zone: TIMEZONE }).startOf("day").toJSDate();
  const end = DateTime.fromISO(parsed.data.to, { zone: TIMEZONE })
    .plus({ days: 1 })
    .startOf("day")
    .toJSDate();
  return saleRows(db, actor, and(gte(sales.createdAt, start), lt(sales.createdAt, end)));
}

export async function listCustomerSales(db: AppDb, actor: SessionUser, customerId: string) {
  if (!can(actor.role, "sales.record") || !z.uuid().safeParse(customerId).success) return [];
  return saleRows(db, actor, and(eq(sales.customerId, customerId), isNull(sales.voidedAt)));
}
