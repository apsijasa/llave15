import { afterEach, expect, it } from "vitest";
import { products, stockMovements } from "../../src/server/db/schema-inventory.ts";
import { auditLog } from "../../src/server/db/schema-taller.ts";
import { createProduct, recordInternalUse } from "../../src/server/taller/products.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";
let test: TestDb;
afterEach(async () => test?.close());
it("B no registra uso ni cambia stock, movimientos o auditoría de A", async () => {
  test = await createTestDb();
  const { vector, demo } = await seedTwoShops(test.db);
  const now = new Date("2026-11-28T15:00:00Z");
  const result = await createProduct(
    test.db,
    vector.owner,
    { sku: "LIM", name: "Limpiador", category: "insumo", forSale: false, stockQty: 5 },
    now,
  );
  if (!result.ok) throw new Error(result.code);
  const snapshot = async () => ({
    products: await test.db.select().from(products),
    movements: await test.db.select().from(stockMovements),
    audits: await test.db.select().from(auditLog),
  });
  const before = await snapshot();
  expect(
    await recordInternalUse(test.db, demo.owner, result.productId, { quantity: 2 }, now),
  ).toEqual({ ok: false, code: "not_found" });
  expect(await snapshot()).toEqual(before);
});
