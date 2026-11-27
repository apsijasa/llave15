import { afterEach, beforeEach, expect, it } from "vitest";
import { products, stockMovements } from "../../src/server/db/schema-inventory.ts";
import { purchaseImports } from "../../src/server/db/schema-purchase-imports.ts";
import { normalizeInvoiceExtraction } from "../../src/server/taller/invoice-normalize.ts";
import { confirmPurchaseImport } from "../../src/server/taller/purchase-import-confirm.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const NOW = new Date("2026-11-28T15:00:00Z");
let test: TestDb;
let shop: Awaited<ReturnType<typeof seedTwoShops>>["vector"];
beforeEach(async () => {
  test = await createTestDb();
  shop = (await seedTwoShops(test.db)).vector;
});
afterEach(async () => test.close());
it.each([false, true])("confirma productos mixtos; recibir ahora = %s", async (receiveNow) => {
  const [row] = await test.db
    .insert(purchaseImports)
    .values({
      branchId: shop.branch.id,
      createdBy: shop.owner.id,
      fileKey: "documento.pdf",
      fileType: "pdf",
      fileBytes: 10,
      provider: "falso",
      model: "falso",
      promptVersion: "1",
      extraction: normalizeInvoiceExtraction({
        supplier: { name: "Proveedor sintético", rut: null },
        document: { type: "factura", number: "42", date: null },
        pricesIncludeVat: false,
        lines: [],
        totals: { net: null, exempt: null, vat: null, total: null },
        confidence: "alta",
        warnings: [],
      }),
    })
    .returning();
  const line = {
    mode: "create",
    category: "insumo",
    unit: "unidad",
    quantity: 2,
    unitCostClp: 1000,
  };
  expect(
    await confirmPurchaseImport(
      test.db,
      shop.owner,
      row!.id,
      {
        supplier: { mode: "create", name: "Proveedor sintético" },
        receiveNow,
        docType: "factura",
        docNumber: "42",
        lines: [
          { ...line, sku: "VENTA", name: "Para vender", forSale: true, priceClp: 2500 },
          { ...line, sku: "USO", name: "Para uso interno", forSale: false, priceClp: "" },
        ],
      },
      NOW,
    ),
  ).toMatchObject({ ok: true });
  const rows = await test.db.select().from(products);
  expect(rows.find((p) => p.sku === "VENTA")).toMatchObject({
    forSale: true,
    priceClp: 2500,
    stockQty: receiveNow ? 2 : 0,
  });
  expect(rows.find((p) => p.sku === "USO")).toMatchObject({
    forSale: false,
    priceClp: 0,
    stockQty: receiveNow ? 2 : 0,
  });
  expect(await test.db.select().from(stockMovements)).toHaveLength(receiveNow ? 2 : 0);
});
