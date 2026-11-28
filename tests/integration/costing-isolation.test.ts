import { beforeEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { costProfiles } from "../../src/server/db/schema-costing.ts";
import { products } from "../../src/server/db/schema-inventory.ts";
import { services } from "../../src/server/db/schema-taller.ts";
import {
  getCostProfile,
  saveCostProfile,
  suggestedMonthlyCosts,
  serviceQuote,
  productQuote,
} from "../../src/server/taller/costing.ts";
import { recordExpense } from "../../src/server/taller/expenses.ts";
import { createTestDb, type TestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const NOW = new Date("2026-11-14T15:00:00Z");
let test: TestDb;
let shops: Awaited<ReturnType<typeof seedTwoShops>>;
beforeEach(async () => {
  test = await createTestDb();
  shops = await seedTwoShops(test.db);
  return () => test.close();
});
it("aísla los perfiles al crearlos y actualizarlos", async () => {
  const { vector, demo } = shops;
  await saveCostProfile(test.db, vector.owner, { rentClp: 400000, billableHoursMonth: 100 }, NOW);
  expect(await getCostProfile(test.db, demo.owner)).toMatchObject({ rentClp: 0, saved: false });
  await saveCostProfile(test.db, demo.owner, { rentClp: 200000, billableHoursMonth: 80 }, NOW);
  const before = await test.db
    .select()
    .from(costProfiles)
    .where(eq(costProfiles.branchId, demo.branch.id));
  await saveCostProfile(test.db, vector.owner, { rentClp: 500000, billableHoursMonth: 100 }, NOW);
  expect(
    await test.db.select().from(costProfiles).where(eq(costProfiles.branchId, demo.branch.id)),
  ).toEqual(before);
  const rows = await test.db.select().from(costProfiles);
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((row) => row.branchId))).toEqual(
    new Set([vector.branch.id, demo.branch.id]),
  );
});
it("no sugiere gastos ni cotiza ids del otro taller, aun con costos escritos", async () => {
  const { vector, demo } = shops;
  await recordExpense(
    test.db,
    vector.owner,
    {
      category: "arriendo",
      amountClp: 250000,
      expenseDate: "2026-10-10",
      description: "Arriendo mensual",
      method: "transferencia",
    },
    NOW,
  );
  expect(await suggestedMonthlyCosts(test.db, demo.owner, NOW)).toMatchObject({
    values: { rentClp: 0, utilitiesClp: 0, wagesClp: 0, taxesClp: 0, otherClp: 0, suppliesClp: 0 },
    totalClp: 0,
    hasExpenses: false,
  });
  const [product] = await test.db
    .insert(products)
    .values({
      branchId: vector.branch.id,
      createdBy: vector.owner.id,
      sku: "OTRO",
      name: "Producto privado",
      category: "insumo",
      costClp: 1500,
      priceClp: 2500,
    })
    .returning();
  const [service] = await test.db
    .insert(services)
    .values({ branchId: vector.branch.id, name: "Servicio privado", estimatedMinutes: 90 })
    .returning();
  await saveCostProfile(test.db, demo.owner, { billableHoursMonth: 100 }, NOW);
  expect(
    await productQuote(test.db, demo.owner, { productId: product?.id, costClp: 1000 }),
  ).toMatchObject({ ok: false, code: "not_found" });
  expect(
    await serviceQuote(test.db, demo.owner, { serviceId: service?.id, minutes: 60 }),
  ).toMatchObject({ ok: false, code: "not_found" });
});
