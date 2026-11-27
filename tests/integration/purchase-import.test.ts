import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { ROLES } from "../../src/server/auth/permissions.ts";
import {
  products,
  suppliers,
  purchaseOrders,
  purchaseOrderItems,
  stockMovements,
} from "../../src/server/db/schema-inventory.ts";
import { purchaseImports } from "../../src/server/db/schema-purchase-imports.ts";
import { auditLog } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import type { InvoiceExtractor } from "../../src/server/taller/invoice-extract.ts";
import { noneInvoiceExtractor } from "../../src/server/taller/invoice-extract.ts";
import { normalizeInvoiceExtraction } from "../../src/server/taller/invoice-normalize.ts";
import {
  confirmPurchaseImport,
  confirmFormToInput,
} from "../../src/server/taller/purchase-import-confirm.ts";
import {
  startPurchaseImport,
  getPurchaseImport,
  getImportDocument,
  getPurchaseImportForPurchase,
  discardPurchaseImport,
} from "../../src/server/taller/purchase-import.ts";
import { createProduct } from "../../src/server/taller/products.ts";
import { createSupplier } from "../../src/server/taller/suppliers.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { memoryStorage } from "../helpers/memory-storage.ts";

const NOW = new Date("2026-11-26T15:00:00Z");
const PDF = { bytes: Buffer.from("%PDF-1.7 /Type /Pages /Type /Page"), type: "image/png" };
const extraction = () =>
  normalizeInvoiceExtraction({
    supplier: { name: "Proveedor sintético", rut: "12.345.678-5" },
    document: { type: "factura", number: "123", date: "2026-11-26" },
    pricesIncludeVat: false,
    lines: [
      {
        code: "cad",
        description: "Cadena sintética",
        quantity: 3,
        unit: "unidad",
        unitPrice: 6500,
        lineTotal: 19500,
      },
    ],
    totals: { net: 19500, exempt: 0, vat: 3705, total: 23205 },
    confidence: "alta",
    warnings: [],
  });
const extractor: InvoiceExtractor = {
  name: "anthropic",
  model: "falso",
  async extract() {
    return { ok: true, extraction: extraction(), tokensIn: 10, tokensOut: 20 };
  },
};
let test: TestDb;
let actors: Record<SessionUser["role"], SessionUser>;
let owner: SessionUser;
let mem: ReturnType<typeof memoryStorage>;
let supplierId: string;
let productId: string;

beforeEach(async () => {
  test = await createTestDb();
  mem = memoryStorage();
  const [branch] = await test.db.insert(branches).values({ name: "Principal" }).returning();
  actors = {} as typeof actors;
  for (const role of ROLES) {
    const [user] = await test.db
      .insert(users)
      .values({
        branchId: branch!.id,
        role,
        name: role,
        email: `${role}@example.test`,
        passwordHash: "hash",
      })
      .returning();
    actors[role] = { ...user!, role };
  }
  owner = actors.owner;
  const supplier = await createSupplier(
    test.db,
    owner,
    { name: "Proveedor sintético", rut: "12.345.678-5" },
    NOW,
  );
  if (!supplier.ok) throw new Error("Proveedor");
  supplierId = supplier.supplierId;
  const product = await createProduct(
    test.db,
    owner,
    {
      sku: "CAD",
      name: "Cadena sintética",
      category: "repuesto",
      priceClp: 9999,
      costClp: 5000,
      stockQty: 4,
    },
    NOW,
  );
  if (!product.ok) throw new Error("Producto");
  productId = product.productId;
});
afterEach(async () => test.close());
async function start(actor = owner, model = extractor, file = PDF) {
  return startPurchaseImport(test.db, mem.storage, actor, model, file, NOW);
}
async function imported() {
  const result = await start();
  if (!result.ok) throw new Error(result.code);
  return result.importId;
}
const input = (receiveNow = false) => ({
  supplier: { mode: "existing", supplierId },
  receiveNow,
  docType: "factura",
  docNumber: "123",
  notes: "Revisada",
  lines: [{ mode: "existing", productId, quantity: 3, unitCostClp: 6500 }],
});
const confirm = (id: string, value: unknown = input(), actor = owner) =>
  confirmPurchaseImport(test.db, actor, id, value, NOW);
const imports = () => test.db.select().from(purchaseImports);
async function snapshot() {
  return {
    imports: await imports(),
    products: await test.db.select().from(products),
    suppliers: await test.db.select().from(suppliers),
    orders: await test.db.select().from(purchaseOrders),
    items: await test.db.select().from(purchaseOrderItems),
    movements: await test.db.select().from(stockMovements),
    audits: await test.db.select().from(auditLog),
    branches: await test.db.select().from(branches),
  };
}
it.each(["reception", "mechanic"] as const)(
  "deniega a %s sin costos, objetos ni cambios",
  async (role) => {
    const id = await imported();
    const before = await snapshot();
    expect(await start(actors[role])).toEqual({ ok: false, code: "forbidden" });
    expect(await getPurchaseImport(test.db, actors[role], id)).toBeNull();
    expect(await confirm(id, input(), actors[role])).toEqual({ ok: false, code: "forbidden" });
    expect(await discardPurchaseImport(test.db, actors[role], id, NOW)).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(await snapshot()).toEqual(before);
    expect(mem.objects.size).toBe(1);
  },
);
it("none no guarda objetos ni filas", async () => {
  expect(await start(owner, noneInvoiceExtractor)).toEqual({ ok: false, code: "unavailable" });
  expect(await imports()).toEqual([]);
  expect(mem.objects.size).toBe(0);
});
it("guarda PDF detectado por firma con páginas, tokens y coincidencias", async () => {
  const id = await imported();
  expect(await imports()).toMatchObject([
    { id, status: "extraida", pages: 1, fileType: "pdf", tokensIn: 10 },
  ]);
  expect([...mem.objects.keys()]).toEqual([`purchases/imports/${id}/documento.pdf`]);
  expect(await getPurchaseImport(test.db, owner, id)).toMatchObject({
    supplierMatch: { supplierId, by: "rut" },
    lines: [{ match: { productId }, matchedBy: "sku" }],
  });
});
it("normaliza PNG a JPG y rechaza basura, tamaño y seis páginas", async () => {
  const bytes = await sharp({ create: { width: 20, height: 30, channels: 3, background: "white" } })
    .png()
    .toBuffer();
  expect(await start(owner, extractor, { bytes, type: "text/plain" })).toMatchObject({ ok: true });
  const stored = [...mem.objects.values()][0]!;
  expect((await sharp(stored).metadata()).format).toBe("jpeg");
  for (const [bytes, code] of [
    [Buffer.from("basura"), "invalid_file"],
    [Buffer.alloc(10 * 1024 * 1024 + 1), "too_large"],
    [Buffer.from(`%PDF- ${"/Type /Page ".repeat(6)}`), "too_many_pages"],
  ] as const) {
    expect(await start(owner, extractor, { bytes, type: "" })).toEqual({ ok: false, code });
  }
});
it("fallo de extracción borra el objeto, guarda error y cuenta las cincuenta lecturas", async () => {
  const failed: InvoiceExtractor = {
    ...extractor,
    async extract() {
      return { ok: false, code: "network" };
    },
  };
  expect(await start(owner, failed)).toEqual({ ok: false, code: "extraction_failed" });
  const [row] = await imports();
  expect(row).toMatchObject({ status: "fallida", errorCode: "network", fileKey: null });
  expect(mem.objects.size).toBe(0);
  await test.db
    .insert(purchaseImports)
    .values(Array.from({ length: 49 }, () => ({ ...row!, id: randomUUID() })));
  expect(await start()).toEqual({ ok: false, code: "quota" });
  expect(await imports()).toHaveLength(50);
});
it("busca por nombre exacto, código de barras y ofrece hasta tres sugerencias sin asignar", async () => {
  const id = await imported();
  const data = extraction();
  data.supplier.rut = null;
  data.supplier.name = "PROVEEDOR SINTÉTICO";
  await test.db.update(products).set({ barcode: "BARRA" }).where(eq(products.id, productId));
  data.lines = [
    { ...data.lines[0]!, code: "BARRA" },
    { ...data.lines[0]!, code: null },
  ];
  await test.db.update(purchaseImports).set({ extraction: data }).where(eq(purchaseImports.id, id));
  const view = await getPurchaseImport(test.db, owner, id);
  expect(view?.supplierMatch).toEqual({ supplierId, by: "name" });
  expect(view?.lines[0]?.matchedBy).toBe("barcode");
  expect(view?.lines[1]?.match).toBeNull();
  expect(view?.lines[1]?.suggestions).toMatchObject([{ productId }]);
  expect(view?.lines[1]?.suggestions.length).toBeLessThanOrEqual(3);
});
it("confirma mezcla con proveedor nuevo, crea producto sin stock y omite línea", async () => {
  const id = await imported();
  const value = {
    ...input(),
    supplier: { mode: "create", name: "Proveedor nuevo", rut: null },
    lines: [
      ...input().lines,
      {
        mode: "create",
        sku: "NUEVO",
        name: "Cadena nueva",
        category: "repuesto",
        unit: "unidad",
        priceClp: 8000,
        quantity: 2,
        unitCostClp: 4000,
      },
      { mode: "skip" },
    ],
  };
  const result = await confirm(id, value);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const data = await snapshot();
  expect(data.orders).toMatchObject([
    {
      id: result.purchaseId,
      number: 1,
      status: "borrador",
      docType: "factura",
      docNumber: "123",
      notes: "Revisada",
    },
  ]);
  expect(data.items).toHaveLength(2);
  expect(data.products.find((p) => p.sku === "NUEVO")).toMatchObject({
    stockQty: 0,
    costClp: 4000,
    minStock: 0,
    supplierId: data.orders[0]!.supplierId,
  });
  expect(data.imports).toMatchObject([
    { status: "confirmada", purchaseOrderId: result.purchaseId },
  ]);
  const audits = data.audits.filter((a) => a.entity === "purchase");
  expect(audits).toMatchObject([
    {
      action: "purchase.imported",
      details: {
        number: 1,
        importId: id,
        lineCount: 2,
        createdProducts: 1,
        createdSupplier: true,
        received: false,
      },
    },
  ]);
  expect(audits).toHaveLength(1);
  expect(await getPurchaseImportForPurchase(test.db, owner, result.purchaseId)).toMatchObject({
    id,
    documentUrl: `/taller/compras/factura/${id}/documento`,
  });
  expect(await confirm(id)).toEqual({ ok: false, code: "invalid_status" });
});
it("recibe, pondera a 5643 y conserva el precio de venta", async () => {
  const id = await imported();
  expect(await confirm(id, input(true))).toMatchObject({ ok: true });
  const data = await snapshot();
  expect(data.products).toMatchObject([{ stockQty: 7, costClp: 5643, priceClp: 9999 }]);
  expect(data.items).toMatchObject([{ receivedQty: 3 }]);
  expect(data.orders).toMatchObject([
    { status: "recibida", receivedAt: NOW, receivedBy: owner.id },
  ]);
  expect(data.movements.filter((m) => m.kind === "compra")).toMatchObject([
    { quantity: 3, referenceKind: "purchase_order", referenceId: data.orders[0]!.id },
  ]);
});
it("descarta sin borrar documento y no permite confirmar otra vez", async () => {
  const id = await imported();
  expect(await discardPurchaseImport(test.db, owner, id, NOW)).toEqual({ ok: true });
  expect(mem.objects.size).toBe(1);
  expect(await confirm(id)).toEqual({ ok: false, code: "invalid_status" });
  expect(await discardPurchaseImport(test.db, owner, id, NOW)).toEqual({
    ok: false,
    code: "invalid_status",
  });
});
it("valida documentos, líneas, SKU duplicado y permisos antes de escribir", async () => {
  const id = await imported();
  const before = await snapshot();
  const create = {
    mode: "create",
    sku: "NEW",
    name: "Cadena",
    category: "repuesto",
    priceClp: 5000,
    quantity: 1,
    unitCostClp: 1000,
  };
  for (const value of [
    { ...input(true), docType: null },
    { ...input(true), docNumber: "" },
    { ...input(), lines: [{ mode: "skip" }] },
    { ...input(), lines: [create, create] },
    { ...input(), lines: [{ ...create, priceClp: "" }] },
  ]) {
    expect(await confirm(id, value)).toMatchObject({
      ok: false,
      code: "validation_error",
      fields: expect.any(Object),
    });
  }
  expect(await confirm(id, { ...input(), lines: [create] }, actors.reception)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(await snapshot()).toEqual(before);
});
it("traduce conflictos de RUT y SKU y revierte toda la transacción", async () => {
  const id = await imported();
  const before = await snapshot();
  expect(
    await confirm(id, {
      ...input(),
      supplier: { mode: "create", name: "Otro", rut: "12345678-5" },
    }),
  ).toMatchObject({ ok: false, code: "rut_exists" });
  expect(
    await confirm(id, {
      ...input(),
      lines: [
        {
          mode: "create",
          sku: "CAD",
          name: "Otro",
          category: "repuesto",
          priceClp: 20,
          quantity: 1,
          unitCostClp: 10,
        },
      ],
    }),
  ).toMatchObject({ ok: false, code: "sku_exists", field: "line-0-sku" });
  expect(await snapshot()).toEqual(before);
  await test.client.exec(
    "alter table audit_log add constraint reject_import check (action <> 'purchase.imported')",
  );
  await expect(confirm(id, input(true))).rejects.toThrow();
  expect(await snapshot()).toEqual(before);
});
it("convierte nombres planos sin confiar en el conteo enviado", () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    "supplier-mode": "existing",
    "supplier-supplierId": supplierId,
    receiveNow: "on",
    "line-0-mode": "existing",
    "line-0-productId": productId,
    "line-0-quantity": "3",
    "line-0-unitCostClp": "6500",
    "line-1-mode": "create",
  }))
    form.set(key, value);
  expect(confirmFormToInput(form, 1)).toMatchObject({
    receiveNow: true,
    lines: [{ mode: "existing", productId, quantity: "3", unitCostClp: "6500" }],
  });
});
it("sirve documento privado con sus cabeceras y errores de acceso", async () => {
  const id = await imported();
  expect((await getImportDocument(test.db, mem.storage, null, id)).status).toBe(401);
  expect((await getImportDocument(test.db, mem.storage, actors.mechanic, id)).status).toBe(403);
  expect((await getImportDocument(test.db, mem.storage, owner, "invalido")).status).toBe(404);
  const response = await getImportDocument(test.db, mem.storage, owner, id);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("content-disposition")).toBe(
    `inline; filename="documento-${id}.pdf"`,
  );
  expect(response.headers.get("cache-control")).toBe("private, max-age=300");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  mem.objects.clear();
  expect((await getImportDocument(test.db, mem.storage, owner, id)).status).toBe(404);
});
it("CHECK rechaza fallida sin error y confirmada sin vínculo", async () => {
  const id = await imported();
  await expect(
    test.db
      .update(purchaseImports)
      .set({ status: "fallida", fileKey: null })
      .where(eq(purchaseImports.id, id)),
  ).rejects.toThrow();
  await expect(
    test.db.update(purchaseImports).set({ status: "confirmada" }).where(eq(purchaseImports.id, id)),
  ).rejects.toThrow();
});
