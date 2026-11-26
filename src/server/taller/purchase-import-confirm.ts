import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { normalizeRut } from "../../lib/rut.ts";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import { isUniqueViolation } from "../db/client.ts";
import type { AppDb } from "../db/client.ts";
import { products, suppliers, purchaseOrders, purchaseOrderItems } from "../db/schema-inventory.ts";
import { purchaseImports } from "../db/schema-purchase-imports.ts";
import { recordAudit } from "./audit.ts";
import { insertProduct } from "./products.ts";
import { allocatePurchaseNumber, receiveItems, PurchaseFailure } from "./purchases.ts";
import {
  IMPORT_PRODUCT_CATEGORIES,
  INVOICE_IMPORT_MAX_LINES,
  PURCHASE_DOC_TYPES,
} from "./rules.ts";
import { insertSupplierRow, isRutConflict, supplierFormSchema } from "./suppliers.ts";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);
const integer = (min: number, max: number) =>
  z
    .union([z.number(), z.string().trim().regex(/^\d+$/)])
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));
const amounts = { quantity: integer(1, 10000), unitCostClp: integer(0, 10000000) };
const lineSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("skip") }),
  z.object({ mode: z.literal("existing"), productId: z.uuid(), ...amounts }),
  z.object({
    mode: z.literal("create"),
    sku: z
      .string()
      .trim()
      .regex(/^\S{1,40}$/),
    name: z.string().trim().min(2).max(120),
    category: z.enum(IMPORT_PRODUCT_CATEGORIES),
    unit: z.string().trim().min(1).max(20).default("unidad"),
    priceClp: integer(0, 10000000),
    ...amounts,
  }),
]);
export const confirmImportSchema = z
  .object({
    supplier: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("existing"), supplierId: z.uuid() }),
      z.object({
        mode: z.literal("create"),
        name: z.string().trim().min(2).max(120),
        rut: optionalText(30)
          .refine(
            (value) => value === null || normalizeRut(value) !== null,
            "Ingresa un RUT válido.",
          )
          .transform((value) => (value === null ? null : normalizeRut(value))),
      }),
    ]),
    docType: z.preprocess(
      (value) => (value === "" || value === undefined ? null : value),
      z.enum(PURCHASE_DOC_TYPES).nullable(),
    ),
    docNumber: optionalText(80),
    notes: optionalText(500),
    receiveNow: z.boolean(),
    lines: z.array(lineSchema).min(1).max(INVOICE_IMPORT_MAX_LINES),
  })
  .superRefine((value, ctx) => {
    if (!value.lines.some((line) => line.mode !== "skip"))
      ctx.addIssue({
        code: "custom",
        path: ["lines", 0, "mode"],
        message: "Conserva al menos una línea.",
      });
    if (value.receiveNow)
      for (const field of ["docType", "docNumber"] as const)
        if (!value[field])
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: "Obligatorio para recibir la compra.",
          });
    const skus = new Set<string>();
    value.lines.forEach((line, index) => {
      if (line.mode !== "create") return;
      const sku = line.sku.toLowerCase();
      if (skus.has(sku))
        ctx.addIssue({
          code: "custom",
          path: ["lines", index, "sku"],
          message: "El SKU se repite en la factura.",
        });
      skus.add(sku);
    });
  });
type Input = z.infer<typeof confirmImportSchema>;
type KeptLine = Exclude<Input["lines"][number], { mode: "skip" }>;
type FailureCode = "forbidden" | "not_found" | "invalid_status" | "rut_exists" | "sku_exists";
export type ConfirmResult =
  | { ok: true; purchaseId: string }
  | { ok: false; code: FailureCode; field?: string }
  | { ok: false; code: "validation_error"; fields: Record<string, string> };
class ImportFailure extends Error {
  code: FailureCode;
  field?: string;
  constructor(code: FailureCode, field?: string) {
    super(code);
    this.code = code;
    this.field = field;
  }
}
export function confirmFormToInput(form: FormData, lineCount: number): unknown {
  const get = (key: string) => form.get(key) ?? "";
  const supplier =
    get("supplier-mode") === "existing"
      ? { mode: "existing", supplierId: get("supplier-supplierId") }
      : { mode: get("supplier-mode"), name: get("supplier-name"), rut: get("supplier-rut") };
  const lines = Array.from({ length: lineCount }, (_, index) => {
    const field = (key: string) => get(`line-${index}-${key}`);
    const mode = field("mode");
    if (mode === "skip") return { mode };
    const values = { mode, quantity: field("quantity"), unitCostClp: field("unitCostClp") };
    return mode === "existing"
      ? { ...values, productId: field("productId") }
      : {
          ...values,
          sku: field("sku"),
          name: field("name"),
          category: field("category"),
          unit: field("unit"),
          priceClp: field("priceClp"),
        };
  });
  return {
    supplier,
    docType: get("docType"),
    docNumber: get("docNumber"),
    notes: get("notes"),
    receiveNow: get("receiveNow") === "on",
    lines,
  };
}
function fieldsOf(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => {
      const path = issue.path;
      const name =
        path[0] === "lines"
          ? `line-${String(path[1] ?? 0)}-${String(path[2] ?? "mode")}`
          : path.map(String).join("-");
      return [
        name,
        issue.code === "custom" ? issue.message : "Revisa este campo e ingresa un valor válido.",
      ];
    }),
  );
}
const scope = (actor: SessionUser, id: string) =>
  and(eq(purchaseImports.branchId, actor.branchId), eq(purchaseImports.id, id));
async function supplierFor(tx: AppDb, actor: SessionUser, input: Input["supplier"], now: Date) {
  if (input.mode === "create") {
    try {
      return await insertSupplierRow(tx, actor, supplierFormSchema.parse(input), now);
    } catch (error) {
      if (isRutConflict(error)) throw new ImportFailure("rut_exists", "supplier-rut");
      throw error;
    }
  }
  const [row] = await tx
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.branchId, actor.branchId), eq(suppliers.id, input.supplierId)));
  if (!row) throw new ImportFailure("not_found");
  return row.id;
}
async function validateProducts(tx: AppDb, actor: SessionUser, lines: Input["lines"]) {
  const ids = lines.flatMap((line) => (line.mode === "existing" ? [line.productId] : []));
  if (ids.length) {
    const rows = await tx
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.branchId, actor.branchId), inArray(products.id, ids)));
    if (new Set(rows.map((row) => row.id)).size !== new Set(ids).size)
      throw new ImportFailure("not_found");
  }
  const skus = lines.flatMap((line) => (line.mode === "create" ? [line.sku.toLowerCase()] : []));
  if (!skus.length) return;
  const rows = await tx
    .select({ sku: products.sku })
    .from(products)
    .where(and(eq(products.branchId, actor.branchId), inArray(sql`lower(${products.sku})`, skus)));
  const index = lines.findIndex(
    (line) =>
      line.mode === "create" &&
      rows.some((row) => row.sku.toLowerCase() === line.sku.toLowerCase()),
  );
  if (index >= 0) throw new ImportFailure("sku_exists", `line-${index}-sku`);
}
async function productFor(
  tx: AppDb,
  actor: SessionUser,
  line: KeptLine,
  supplierId: string,
  index: number,
  now: Date,
) {
  if (line.mode === "existing") return line.productId;
  try {
    const result = await insertProduct(
      tx,
      actor,
      {
        sku: line.sku,
        name: line.name,
        category: line.category,
        unit: line.unit,
        priceClp: line.priceClp,
        stockQty: 0,
        costClp: line.unitCostClp,
        supplierId,
        minStock: 0,
        barcode: null,
        serialNumber: null,
        isActive: true,
      },
      now,
    );
    return result.productId;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ImportFailure("sku_exists", `line-${index}-sku`);
    throw error;
  }
}
async function addLines(
  tx: AppDb,
  actor: SessionUser,
  id: string,
  supplierId: string,
  lines: Input["lines"],
  now: Date,
) {
  for (const [index, line] of lines.entries()) {
    if (line.mode === "skip") continue;
    const productId = await productFor(tx, actor, line, supplierId, index, now);
    await tx.insert(purchaseOrderItems).values({
      branchId: actor.branchId,
      purchaseOrderId: id,
      productId,
      quantity: line.quantity,
      unitCostClp: line.unitCostClp,
      createdAt: now,
      updatedAt: now,
    });
  }
}
async function createOrder(
  tx: AppDb,
  actor: SessionUser,
  supplierId: string,
  input: Input,
  now: Date,
) {
  const number = await allocatePurchaseNumber(tx, actor.branchId);
  const [row] = await tx
    .insert(purchaseOrders)
    .values({
      branchId: actor.branchId,
      supplierId,
      number,
      status: "borrador",
      docType: input.docType,
      docNumber: input.docNumber,
      notes: input.notes,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: purchaseOrders.id });
  if (!row) throw new Error("No se pudo crear la compra.");
  await addLines(tx, actor, row.id, supplierId, input.lines, now);
  if (input.receiveNow) {
    await receiveItems(tx, actor, row.id, now);
    await tx
      .update(purchaseOrders)
      .set({ status: "recibida", receivedAt: now, receivedBy: actor.id, updatedAt: now })
      .where(and(eq(purchaseOrders.branchId, actor.branchId), eq(purchaseOrders.id, row.id)));
  }
  return { purchaseId: row.id, number };
}
async function confirmTransaction(
  tx: AppDb,
  actor: SessionUser,
  id: string,
  input: Input,
  now: Date,
): Promise<ConfirmResult> {
  const [row] = await tx.select().from(purchaseImports).where(scope(actor, id)).for("update");
  if (!row) throw new ImportFailure("not_found");
  if (row.status !== "extraida") throw new ImportFailure("invalid_status");
  const supplierId = await supplierFor(tx, actor, input.supplier, now);
  await validateProducts(tx, actor, input.lines);
  const { purchaseId, number } = await createOrder(tx, actor, supplierId, input, now);
  await tx
    .update(purchaseImports)
    .set({
      status: "confirmada",
      purchaseOrderId: purchaseId,
      confirmedAt: now,
      confirmedBy: actor.id,
      updatedAt: now,
    })
    .where(scope(actor, id));
  await recordAudit(
    tx,
    {
      branchId: actor.branchId,
      actorUserId: actor.id,
      action: "purchase.imported",
      entity: "purchase",
      entityId: purchaseId,
      details: {
        number,
        importId: id,
        lineCount: input.lines.filter((line) => line.mode !== "skip").length,
        createdProducts: input.lines.filter((line) => line.mode === "create").length,
        createdSupplier: input.supplier.mode === "create",
        received: input.receiveNow,
      },
    },
    now,
  );
  return { ok: true, purchaseId };
}
export async function confirmPurchaseImport(
  db: AppDb,
  actor: SessionUser,
  id: string,
  input: unknown,
  now: Date,
): Promise<ConfirmResult> {
  if (!can(actor.role, "purchases.manage") || !can(actor.role, "costs.view"))
    return { ok: false, code: "forbidden" };
  const creates = z.object({ lines: z.array(z.object({ mode: z.string() })) }).safeParse(input);
  if (
    creates.success &&
    creates.data.lines.some((line) => line.mode === "create") &&
    !can(actor.role, "inventory.adjust")
  )
    return { ok: false, code: "forbidden" };
  const parsed = confirmImportSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, code: "validation_error", fields: fieldsOf(parsed.error) };
  if (!z.uuid().safeParse(id).success) return { ok: false, code: "not_found" };
  try {
    return await db.transaction((tx) => confirmTransaction(tx, actor, id, parsed.data, now));
  } catch (error) {
    if (error instanceof ImportFailure)
      return { ok: false, code: error.code, ...(error.field ? { field: error.field } : {}) };
    if (error instanceof PurchaseFailure)
      return { ok: false, code: error.code === "not_found" ? "not_found" : "invalid_status" };
    throw error;
  }
}
