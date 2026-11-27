import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { products, stockMovements } from "../../src/server/db/schema-inventory.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { auditLog, bikes, customers } from "../../src/server/db/schema-taller.ts";
import { addProductPartItem } from "../../src/server/taller/part-stock.ts";
import {
  createProduct,
  listProducts,
  productFormSchema,
  recordInternalUse,
  updateProduct,
} from "../../src/server/taller/products.ts";
import { createSale, previewSale } from "../../src/server/taller/sales.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const NOW = new Date("2026-11-28T15:00:00Z");
const FORM = {
  sku: "LIM-01",
  name: "Limpiador",
  category: "insumo",
  forSale: false,
  costClp: 1000,
  stockQty: 5,
};
let test: TestDb;
let shop: Awaited<ReturnType<typeof seedTwoShops>>["vector"];
beforeEach(async () => {
  test = await createTestDb();
  shop = (await seedTwoShops(test.db)).vector;
});
afterEach(async () => test.close());
async function create(input = {}) {
  const result = await createProduct(test.db, shop.owner, { ...FORM, ...input }, NOW);
  if (!result.ok) throw new Error(result.code);
  return result.productId;
}
async function snapshot() {
  return {
    products: await test.db.select().from(products),
    movements: await test.db.select().from(stockMovements),
    audits: await test.db.select().from(auditLog),
  };
}
it("crea uso interno sin precio, normaliza a cero y exige precio para vender", async () => {
  const id = await create({ priceClp: "" });
  expect((await snapshot()).products).toMatchObject([{ id, forSale: false, priceClp: 0 }]);
  expect(
    await createProduct(test.db, shop.owner, { ...FORM, sku: "VENTA", forSale: true }, NOW),
  ).toEqual({ ok: false, code: "validation_error" });
  expect(productFormSchema.safeParse({ ...FORM, forSale: true, priceClp: "" }).success).toBe(false);
  expect(productFormSchema.parse({ ...FORM, forSale: true, priceClp: 0 }).priceClp).toBe(0);
  expect(productFormSchema.parse({ ...FORM, priceClp: 5000 }).priceClp).toBe(0);
});
it("registra consumo con costo y nota, sin nota en la auditoría", async () => {
  const id = await create();
  expect(
    await recordInternalUse(test.db, shop.owner, id, { quantity: 2, note: "limpieza" }, NOW),
  ).toEqual({ ok: true, productId: id, stockQty: 3 });
  const state = await snapshot();
  expect(state.products[0]?.stockQty).toBe(3);
  expect(state.movements.find((m) => m.quantity === -2)).toMatchObject({
    branchId: shop.branch.id,
    kind: "ajuste",
    note: "Uso en taller: limpieza",
    unitCostClp: 1000,
    createdBy: shop.owner.id,
  });
  expect(state.audits.find((a) => a.action === "stock.internal_use")?.details).toEqual({
    productId: id,
    quantity: 2,
  });
});
it("registra sin nota opcional y rechaza entradas inválidas sin escribir", async () => {
  const id = await create();
  const before = await snapshot();
  for (const quantity of [0, 1.5, 100001, -2])
    expect(await recordInternalUse(test.db, shop.owner, id, { quantity }, NOW)).toEqual({
      ok: false,
      code: "validation_error",
    });
  expect(await recordInternalUse(test.db, shop.owner, id, { quantity: 6 }, NOW)).toEqual({
    ok: false,
    code: "out_of_stock",
  });
  expect(await recordInternalUse(test.db, shop.mechanic, id, { quantity: 2 }, NOW)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(await snapshot()).toEqual(before);
  expect(await recordInternalUse(test.db, shop.owner, id, { quantity: 1 }, NOW)).toMatchObject({
    ok: true,
  });
  expect((await snapshot()).movements.find((m) => m.quantity === -1)?.note).toBe("Uso en taller");
});
it("rechaza consumo de un producto para la venta", async () => {
  const id = await create({ forSale: true, priceClp: 2000 });
  const before = await snapshot();
  expect(await recordInternalUse(test.db, shop.owner, id, { quantity: 2 }, NOW)).toEqual({
    ok: false,
    code: "not_internal",
  });
  expect(await snapshot()).toEqual(before);
});
it("filtra por uso y omite costos al mecánico; audita cambios de uso", async () => {
  const id = await create();
  await create({ sku: "VENTA", forSale: true, priceClp: 2000 });
  expect((await listProducts(test.db, shop.owner, { forSale: false })).map((p) => p.id)).toEqual([
    id,
  ]);
  const rows = await listProducts(test.db, shop.mechanic, { forSale: false });
  expect(rows).toHaveLength(1);
  expect(rows[0]).not.toHaveProperty("costClp");
  expect(
    await updateProduct(test.db, shop.owner, id, { ...FORM, forSale: true, priceClp: 2000 }, NOW),
  ).toMatchObject({ ok: true });
  const [audit] = await test.db
    .select()
    .from(auditLog)
    .where(eq(auditLog.action, "product.updated"));
  expect(audit?.details).toMatchObject({ before: { forSale: false }, after: { forSale: true } });
});
it("bloquea venta y repuesto de orden sin consumir stock", async () => {
  const id = await create();
  const sale = { items: [{ productId: id, quantity: 1 }], method: "transferencia" };
  expect(await previewSale(test.db, shop.owner, sale)).toEqual({ ok: false, code: "not_found" });
  expect(await createSale(test.db, shop.owner, sale, NOW)).toEqual({
    ok: false,
    code: "not_found",
  });
  const [customer] = await test.db
    .insert(customers)
    .values({ branchId: shop.branch.id, name: "Cliente", phoneE164: "+56912345678" })
    .returning();
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: shop.branch.id,
      customerId: customer!.id,
      brand: "Marca",
      model: "Modelo",
      bikeType: "mtb",
    })
    .returning();
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: shop.branch.id,
      customerId: customer!.id,
      bikeId: bike!.id,
      number: 1,
      status: "creado",
      receivedAt: NOW,
      requestedService: "Revisión",
      createdBy: shop.owner.id,
    })
    .returning();
  const before = await snapshot();
  expect(
    await addProductPartItem(test.db, shop.owner, order!.id, { productId: id, quantity: 1 }, NOW),
  ).toEqual({ ok: false, code: "not_found" });
  expect(await snapshot()).toEqual(before);
});
it("revierte el movimiento y stock si falla la auditoría", async () => {
  const id = await create();
  const before = await snapshot();
  await test.client.exec(
    "alter table audit_log add constraint reject_internal_use check (action <> 'stock.internal_use')",
  );
  await expect(recordInternalUse(test.db, shop.owner, id, { quantity: 2 }, NOW)).rejects.toThrow();
  expect(await snapshot()).toEqual(before);
});
