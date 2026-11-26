import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { products, suppliers } from "../../src/server/db/schema-inventory.ts";
import { purchaseImports } from "../../src/server/db/schema-purchase-imports.ts";
import { branches } from "../../src/server/db/schema.ts";
import type { InvoiceExtractor } from "../../src/server/taller/invoice-extract.ts";
import { normalizeInvoiceExtraction } from "../../src/server/taller/invoice-normalize.ts";
import { confirmPurchaseImport } from "../../src/server/taller/purchase-import-confirm.ts";
import {
  startPurchaseImport,
  getPurchaseImport,
  getImportDocument,
  discardPurchaseImport,
} from "../../src/server/taller/purchase-import.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";
import { memoryStorage } from "../helpers/memory-storage.ts";

const NOW = new Date("2026-11-26T15:00:00Z");
const file = { bytes: Buffer.from("%PDF- /Type /Page"), type: "application/pdf" };
const extraction = normalizeInvoiceExtraction({
  supplier: { name: "Proveedor sintético", rut: null },
  document: { type: "factura", number: "42", date: null },
  pricesIncludeVat: false,
  lines: [
    {
      code: "NEW",
      description: "Cadena sintética",
      quantity: 1,
      unit: "unidad",
      unitPrice: 10,
      lineTotal: null,
    },
  ],
  totals: { net: null, exempt: null, vat: null, total: null },
  confidence: "alta",
  warnings: [],
});
const extractor: InvoiceExtractor = {
  name: "anthropic",
  model: "falso",
  async extract() {
    return { ok: true, extraction, tokensIn: 0, tokensOut: 0 };
  },
};
let test: TestDb;
let shops: Awaited<ReturnType<typeof seedTwoShops>>;
let mem: ReturnType<typeof memoryStorage>;
beforeEach(async () => {
  test = await createTestDb();
  shops = await seedTwoShops(test.db);
  mem = memoryStorage();
});
afterEach(async () => test.close());
async function start(actor = shops.vector.owner) {
  const result = await startPurchaseImport(test.db, mem.storage, actor, extractor, file, NOW);
  if (!result.ok) throw new Error(result.code);
  return result.importId;
}
const input = {
  supplier: { mode: "create", name: "Proveedor sintético" },
  receiveNow: false,
  docType: "factura",
  docNumber: "42",
  lines: [
    {
      mode: "create",
      sku: "NEW",
      name: "Cadena sintética",
      category: "repuesto",
      priceClp: 20,
      quantity: 1,
      unitCostClp: 10,
    },
  ],
};
async function demoSnapshot() {
  const id = shops.demo.branch.id;
  return {
    branches: await test.db.select().from(branches).where(eq(branches.id, id)),
    suppliers: await test.db.select().from(suppliers).where(eq(suppliers.branchId, id)),
    products: await test.db.select().from(products).where(eq(products.branchId, id)),
  };
}
it("B no ve, confirma, descarta ni abre el documento de A", async () => {
  const id = await start();
  const b = shops.demo.owner;
  expect(await getPurchaseImport(test.db, b, id)).toBeNull();
  expect(await confirmPurchaseImport(test.db, b, id, input, NOW)).toEqual({
    ok: false,
    code: "not_found",
  });
  expect(await discardPurchaseImport(test.db, b, id, NOW)).toEqual({
    ok: false,
    code: "not_found",
  });
  expect((await getImportDocument(test.db, mem.storage, b, id)).status).toBe(404);
});
it("la cuota de B ignora las filas de A y confirmar A conserva la instantánea de B", async () => {
  const id = await start();
  const [row] = await test.db.select().from(purchaseImports).where(eq(purchaseImports.id, id));
  const { id: _id, ...copy } = row!;
  await test.db.insert(purchaseImports).values(Array.from({ length: 49 }, () => ({ ...copy })));
  expect(await start(shops.demo.owner)).toEqual(expect.any(String));
  const before = await demoSnapshot();
  expect(await confirmPurchaseImport(test.db, shops.vector.owner, id, input, NOW)).toMatchObject({
    ok: true,
  });
  expect(await demoSnapshot()).toEqual(before);
});
