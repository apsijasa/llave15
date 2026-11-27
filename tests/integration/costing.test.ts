import { randomUUID } from "node:crypto";
import { beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { costProfiles } from "../../src/server/db/schema-costing.ts";
import { products } from "../../src/server/db/schema-inventory.ts";
import { auditLog, services, servicePrices } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import {
  costProfileSchema,
  serviceQuoteSchema,
  productQuoteSchema,
  getCostProfile,
  saveCostProfile,
  suggestedMonthlyCosts,
  serviceQuote,
  productQuote,
} from "../../src/server/taller/costing.ts";
import { recordExpense, voidExpense } from "../../src/server/taller/expenses.ts";
import { ROLES } from "../../src/server/auth/permissions.ts";
import { createTestDb, type TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-14T15:00:00Z");
const LATER = new Date("2026-11-15T15:00:00Z");
const PROFILE = {
  rentClp: "250.000",
  utilitiesClp: "50000",
  wagesClp: "0",
  taxesClp: 20000,
  otherClp: 30000,
  suppliesClp: 50000,
  billableHoursMonth: "100",
  targetMarginPct: 30,
};
let test: TestDb;
let actors: Record<SessionUser["role"], SessionUser>;
let serviceId: string;
let productId: string;

beforeEach(async () => {
  test = await createTestDb();
  const branchId = randomUUID();
  await test.db.insert(branches).values({ id: branchId, name: "Sucursal" });
  actors = {} as typeof actors;
  for (const role of ROLES) {
    const actor = { id: randomUUID(), branchId, role, name: role, email: `${role}@example.test` };
    await test.db.insert(users).values({ ...actor, passwordHash: "hash-de-prueba" });
    actors[role] = actor;
  }
  serviceId = randomUUID();
  productId = randomUUID();
  await test.db
    .insert(services)
    .values({ id: serviceId, branchId, name: "Mantención general", estimatedMinutes: 90 });
  await test.db
    .insert(servicePrices)
    .values({ branchId, serviceId, bikeType: "mtb", priceClp: 35000 });
  await test.db.insert(products).values({
    id: productId,
    branchId,
    createdBy: actors.owner.id,
    sku: "LUB-1",
    name: "Lubricante",
    category: "insumo",
    costClp: 1500,
    priceClp: 2500,
  });
  return () => test.close();
});

it("sin perfil devuelve los valores por defecto", async () => {
  expect(await getCostProfile(test.db, actors.owner)).toEqual({
    rentClp: 0,
    utilitiesClp: 0,
    wagesClp: 0,
    taxesClp: 0,
    otherClp: 0,
    suppliesClp: 0,
    billableHoursMonth: 0,
    targetMarginPct: 30,
    saved: false,
    updatedAt: null,
  });
});
it("guarda y actualiza una fila y su auditoría, también para administración", async () => {
  expect(await saveCostProfile(test.db, actors.owner, PROFILE, NOW)).toEqual({ ok: true });
  const [first] = await test.db.select().from(costProfiles);
  expect(first).toMatchObject({ rentClp: 250000, updatedBy: actors.owner.id });
  expect(await test.db.select().from(auditLog)).toEqual([
    expect.objectContaining({
      action: "costing.profile_saved",
      entity: "cost_profile",
      entityId: first?.id,
      details: expect.objectContaining({ rentClp: 250000 }),
    }),
  ]);
  expect(
    await saveCostProfile(test.db, actors.owner, { ...PROFILE, rentClp: 300000 }, LATER),
  ).toEqual({ ok: true });
  expect(await test.db.select().from(costProfiles)).toEqual([
    expect.objectContaining({ id: first?.id, rentClp: 300000, updatedAt: LATER }),
  ]);
  expect(await getCostProfile(test.db, actors.owner)).toMatchObject({
    saved: true,
    updatedAt: LATER,
  });
  expect(await saveCostProfile(test.db, actors.admin, PROFILE, LATER)).toEqual({ ok: true });
});
it.each(["reception", "mechanic"] as const)("%s no lee ni escribe costos", async (role) => {
  const actor = actors[role];
  expect(await getCostProfile(test.db, actor)).toBeNull();
  expect(await suggestedMonthlyCosts(test.db, actor, NOW)).toBeNull();
  expect(await saveCostProfile(test.db, actor, PROFILE, NOW)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(await serviceQuote(test.db, actor, { serviceId })).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(await productQuote(test.db, actor, { productId })).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(await test.db.select().from(costProfiles)).toEqual([]);
  expect(await test.db.select().from(auditLog)).toEqual([]);
});
it.each([
  { targetMarginPct: 95 },
  { billableHoursMonth: -1 },
  { billableHoursMonth: 745 },
  { rentClp: "abc" },
  { rentClp: "1.5" },
  { rentClp: -1 },
  { rentClp: 1000000000 },
])("rechaza %j sin escribir", async (input) => {
  expect(await saveCostProfile(test.db, actors.owner, input, NOW)).toEqual({
    ok: false,
    code: "validation_error",
    fields: [Object.keys(input)[0]],
  });
  expect(await test.db.select().from(costProfiles)).toEqual([]);
});
it.each([400000, "400000", "400.000", "$ 400.000"])(
  "acepta pesos %s y defaults vacíos",
  (rentClp) => {
    expect(
      costProfileSchema.parse({ rentClp, utilitiesClp: "", targetMarginPct: "" }),
    ).toMatchObject({ rentClp: 400000, utilitiesClp: 0, targetMarginPct: 30 });
  },
);

async function expense(category: string, amountClp: number, expenseDate = "2026-10-15") {
  const result = await recordExpense(
    test.db,
    actors.owner,
    { category, amountClp, expenseDate, description: "Gasto de prueba", method: "transferencia" },
    NOW,
  );
  if (!result.ok) throw new Error(result.code);
  return result.expenseId;
}
it("sugiere solo gastos vigentes del mes local anterior, sin repuestos", async () => {
  for (const [category, amount] of Object.entries({
    arriendo: 250000,
    servicios: 45000,
    sueldos: 600000,
    insumos: 20000,
    repuestos: 80000,
    otros: 5000,
  }))
    await expense(category, amount);
  await expense("arriendo", 999000, "2026-11-01");
  await expense("arriendo", 1000, "2026-09-30");
  const voided = await expense("arriendo", 100000);
  expect(await voidExpense(test.db, actors.owner, voided, { reason: "Duplicado" }, NOW)).toEqual({
    ok: true,
  });
  expect(await suggestedMonthlyCosts(test.db, actors.owner, NOW)).toEqual({
    range: { from: "2026-10-01", to: "2026-10-31" },
    values: {
      rentClp: 250000,
      utilitiesClp: 45000,
      wagesClp: 600000,
      taxesClp: 0,
      suppliesClp: 20000,
      otherClp: 5000,
    },
    totalClp: 920000,
    hasExpenses: true,
  });
  expect(
    await suggestedMonthlyCosts(test.db, actors.owner, new Date("2026-12-01T03:30:00Z")),
  ).toMatchObject({ range: { from: "2026-11-01", to: "2026-11-30" }, totalClp: 999000 });
  expect(
    await suggestedMonthlyCosts(test.db, actors.owner, new Date("2026-12-01T02:30:00Z")),
  ).toMatchObject({ range: { from: "2026-10-01", to: "2026-10-31" } });
});
it("cotiza el servicio con catálogo y permite minutos, margen e insumos prorrateados", async () => {
  await saveCostProfile(test.db, actors.owner, PROFILE, NOW);
  const result = await serviceQuote(test.db, actors.owner, {
    serviceId,
    bikeType: "mtb",
    suppliesClp: "3000",
  });
  expect(result).toMatchObject({
    ok: true,
    quote: {
      serviceName: "Mantención general",
      bikeType: "mtb",
      minutes: 90,
      hourlyCostClp: 4000,
      laborClp: 6000,
      suppliesClp: 3000,
      costClp: 9000,
      marginPct: 30,
      priceNetClp: 12858,
      priceGrossClp: 15301,
      catalogPriceClp: 35000,
      catalogMarginPct: 74,
    },
    values: { minutes: "90" },
  });
  if (!result.ok) throw new Error(result.code);
  expect(result.quote.table).toHaveLength(4);
  expect(
    await serviceQuote(test.db, actors.owner, {
      serviceId,
      minutes: "60",
      suppliesClp: "3000",
      marginPct: "40",
    }),
  ).toMatchObject({ ok: true, quote: { costClp: 7000, priceNetClp: 11667, priceGrossClp: 13884 } });
  expect(
    await serviceQuote(test.db, actors.owner, { serviceId, packCostClp: "50000", packJobs: "60" }),
  ).toMatchObject({ ok: true, quote: { suppliesClp: 834 } });
  expect(
    await serviceQuote(test.db, actors.owner, { minutes: "50", suppliesClp: "1000" }),
  ).toMatchObject({ ok: true, quote: { minutes: 50, laborClp: 3334, catalogPriceClp: null } });
  expect(await test.db.select().from(servicePrices)).toEqual([
    expect.objectContaining({ priceClp: 35000 }),
  ]);
});
it("distingue horas faltantes, servicio inexistente y validación", async () => {
  expect(await serviceQuote(test.db, actors.owner, { serviceId })).toMatchObject({
    ok: false,
    code: "hours_missing",
  });
  await saveCostProfile(test.db, actors.owner, PROFILE, NOW);
  expect(await serviceQuote(test.db, actors.owner, { serviceId: randomUUID() })).toMatchObject({
    ok: false,
    code: "not_found",
  });
  expect(await serviceQuote(test.db, actors.owner, {})).toMatchObject({
    ok: false,
    code: "validation_error",
    fields: ["serviceId"],
  });
});
it("cotiza productos y costos manuales sin perfil y sin escribir precios", async () => {
  expect(await productQuote(test.db, actors.owner, { productId })).toMatchObject({
    ok: true,
    quote: {
      productLabel: "LUB-1 · Lubricante",
      costClp: 1500,
      marginPct: 30,
      priceNetClp: 2143,
      priceGrossClp: 2550,
      currentPriceClp: 2500,
      currentMarginPct: 40,
    },
  });
  expect(await productQuote(test.db, actors.owner, { productId, costClp: "2000" })).toMatchObject({
    ok: true,
    quote: { priceNetClp: 2858, priceGrossClp: 3401 },
  });
  expect(await productQuote(test.db, actors.owner, { costClp: "1500" })).toMatchObject({
    ok: true,
    quote: { productLabel: null, priceNetClp: 2143, currentPriceClp: null },
  });
  expect(await productQuote(test.db, actors.owner, { costClp: 0 })).toMatchObject({
    ok: true,
    quote: { costClp: 0 },
  });
  expect(await productQuote(test.db, actors.owner, { productId: randomUUID() })).toMatchObject({
    ok: false,
    code: "not_found",
  });
  expect(await productQuote(test.db, actors.owner, {})).toMatchObject({
    ok: false,
    code: "validation_error",
    fields: ["productId"],
  });
  await saveCostProfile(test.db, actors.owner, { targetMarginPct: 40 }, NOW);
  expect(await productQuote(test.db, actors.owner, { productId })).toMatchObject({
    ok: true,
    quote: { marginPct: 40 },
  });
  expect(await productQuote(test.db, actors.owner, { productId, marginPct: 0 })).toMatchObject({
    ok: true,
    quote: { marginPct: 0 },
  });
  expect(await test.db.select().from(products)).toEqual([
    expect.objectContaining({ priceClp: 2500 }),
  ]);
});
it.each([
  { minutes: 0 },
  { minutes: 1441 },
  { minutes: "1.5" },
  { minutes: 1, packJobs: 0 },
  { minutes: 1, packJobs: 10001 },
  { minutes: 1, bikeType: "avion" },
  { minutes: 1, marginPct: 91 },
])("valida cotización de servicio %j", (input) => {
  expect(serviceQuoteSchema.safeParse(input).success).toBe(false);
});
it.each([{ costClp: "1.5" }, { costClp: -1 }, { costClp: 1, marginPct: 100 }])(
  "valida cotización de producto %j",
  (input) => {
    expect(productQuoteSchema.safeParse(input).success).toBe(false);
  },
);
