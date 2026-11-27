import { randomUUID } from "node:crypto";
import { beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { expenses } from "../../src/server/db/schema-cash.ts";
import { workOrderApprovals, workOrders } from "../../src/server/db/schema-orders.ts";
import { payments } from "../../src/server/db/schema-payments.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { dashboardIndicators } from "../../src/server/taller/indicators-dashboard.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const NOW = new Date("2026-11-20T15:00:00Z");
const RANGE = { from: "2026-11-01", to: "2026-11-30" };
let test: TestDb;
let shops: Awaited<ReturnType<typeof seedTwoShops>>;

async function person(branchId: string) {
  const customerId = randomUUID();
  const bikeId = randomUUID();
  await test.db
    .insert(customers)
    .values({ id: customerId, branchId, name: "Cliente", phoneE164: "+56912345678" });
  await test.db
    .insert(bikes)
    .values({ id: bikeId, branchId, customerId, brand: "Trek", model: "Marlin", bikeType: "mtb" });
  return { customerId, bikeId };
}

async function seed(actor: SessionUser, amountClp: number) {
  const branchId = actor.branchId;
  const { customerId, bikeId } = await person(branchId);
  const workOrderId = randomUUID();
  await test.db.insert(workOrders).values({
    id: workOrderId,
    branchId,
    number: 1,
    customerId,
    bikeId,
    status: "diagnostico",
    requestedService: "Revisión",
    totalClp: amountClp,
    paidClp: 0,
    createdBy: actor.id,
    createdAt: NOW,
    receivedAt: NOW,
  });
  await test.db.insert(payments).values({
    branchId,
    workOrderId,
    kind: "final",
    method: "transferencia",
    amountClp,
    receivedAt: NOW,
    receivedBy: actor.id,
  });
  await test.db.insert(workOrderApprovals).values({
    branchId,
    workOrderId,
    description: "Adicional",
    recommendation: "Revisar",
    priceClp: amountClp,
    tokenHash: randomUUID(),
    createdBy: actor.id,
    createdAt: NOW,
  });
  await test.db.insert(expenses).values({
    branchId,
    category: "insumos",
    amountClp: amountClp / 2,
    expenseDate: "2026-11-20",
    description: "Lubricante",
    method: "transferencia",
    createdBy: actor.id,
  });
}

beforeEach(async () => {
  test = await createTestDb();
  shops = await seedTwoShops(test.db);
  await seed(shops.vector.owner, 11900);
  await seed(shops.demo.owner, 23800);
  return () => test.close();
});

it("cada taller ve solo sus pagos, órdenes, adicionales, egresos y saldos", async () => {
  for (const [actor, amount] of [
    [shops.vector.owner, 11900],
    [shops.demo.owner, 23800],
  ] as const) {
    const data = await dashboardIndicators(test.db, actor, RANGE, NOW);
    expect(data?.headline.income.currentClp).toBe(amount);
    expect(data?.headline.openOrders.count).toBe(1);
    expect(data?.approvals).toEqual({
      created: 1,
      pending: 1,
      approved: 0,
      rejected: 0,
      acceptedValueClp: 0,
      conversionPct: 0,
    });
    expect(data?.daily.days[19]).toEqual({
      date: "2026-11-20",
      incomeClp: amount,
      expensesClp: amount / 2,
    });
    expect(data?.rhythm).toEqual({
      activeDays: 1,
      ordersPerActiveDay: 1,
      amountToReview: { count: 1, totalClp: amount },
    });
    expect(data?.weekday[4]?.count).toBe(1);
    expect(data?.ages[0]?.count).toBe(1);
    expect(data?.returnedNewCount).toBe(0);
  }
});
