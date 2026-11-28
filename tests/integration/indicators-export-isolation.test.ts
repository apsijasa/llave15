import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { cashMovements, cashSessions, expenses } from "../../src/server/db/schema-cash.ts";
import { workOrderItems, workOrders } from "../../src/server/db/schema-orders.ts";
import { payments } from "../../src/server/db/schema-payments.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { users } from "../../src/server/db/schema.ts";
import { exportIndicatorsReport, REPORT_KINDS } from "../../src/server/taller/indicators-export.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const NOW = new Date("2026-11-20T15:00:00Z");
const RANGE = { from: "2026-11-01", to: "2026-11-30" };
let test: TestDb;
let shops: Awaited<ReturnType<typeof seedTwoShops>>;
async function seed(actor: SessionUser, amount: number) {
  const branchId = actor.branchId;
  const customerId = randomUUID();
  const bikeId = randomUUID();
  const workOrderId = randomUUID();
  await test.db
    .insert(customers)
    .values({ id: customerId, branchId, name: "Cliente privado", phoneE164: "+56912345678" });
  await test.db
    .insert(bikes)
    .values({ id: bikeId, branchId, customerId, brand: "Marca", model: "Modelo", bikeType: "mtb" });
  await test.db.insert(workOrders).values({
    id: workOrderId,
    branchId,
    number: 1,
    customerId,
    bikeId,
    status: "entregada",
    requestedService: "Revisión",
    assignedMechanicId: actor.id,
    totalClp: amount,
    paidClp: amount,
    createdBy: actor.id,
    receivedAt: new Date("2026-11-18T15:00:00Z"),
    deliveredAt: NOW,
    qcApprovedAt: NOW,
    createdAt: NOW,
  });
  await test.db.insert(workOrderItems).values({
    branchId,
    workOrderId,
    kind: "servicio",
    origin: "inicial",
    description: "Revisión",
    quantity: 1,
    unitPriceClp: amount,
    createdBy: actor.id,
  });
  await seedMovements(actor, amount, workOrderId);
}
async function seedMovements(actor: SessionUser, amount: number, workOrderId: string) {
  const branchId = actor.branchId;
  await test.db.insert(payments).values({
    branchId,
    workOrderId,
    kind: "final",
    method: "transferencia",
    amountClp: amount,
    receivedAt: NOW,
    receivedBy: actor.id,
  });
  await test.db.insert(expenses).values({
    branchId,
    category: "insumos",
    amountClp: amount / 2,
    expenseDate: RANGE.to,
    description: "Privado",
    method: "transferencia",
    createdBy: actor.id,
  });
  const cashSessionId = randomUUID();
  await test.db
    .insert(cashSessions)
    .values({ id: cashSessionId, branchId, openedAt: NOW, openedBy: actor.id, openingCashClp: 0 });
  await test.db.insert(cashMovements).values({
    branchId,
    cashSessionId,
    kind: "egreso",
    amountClp: amount / 10,
    referenceKind: "order_refund",
    referenceId: workOrderId,
    createdAt: NOW,
    createdBy: actor.id,
  });
}
beforeEach(async () => {
  test = await createTestDb();
  shops = await seedTwoShops(test.db);
  await test.db
    .update(users)
    .set({ name: "Personal ajeno" })
    .where(eq(users.id, shops.demo.owner.id));
  await seed(shops.vector.owner, 10000);
  await seed(shops.demo.owner, 88880);
  return () => test.close();
});
it.each(REPORT_KINDS)("%s contiene solo datos del taller A", async (kind) => {
  const result = await exportIndicatorsReport(test.db, shops.vector.owner, kind, RANGE, NOW);
  if (!result.ok) throw new Error(result.code);
  expect(JSON.stringify(result.rows)).not.toContain("Personal ajeno");
  expect(result.rows.flat()).not.toContain(88880);
  expect(result.rows.flat()).not.toContain(44440);
  expect(result.rows.flat()).not.toContain(-8888);
  if (kind === "ingresos-egresos")
    expect(result.rows.slice(1, 4).map((row) => row[6])).toEqual([10000, -1000, -5000]);
  if (kind === "resumen") expect(result.rows.find((row) => row[1] === "Ingresos")?.[2]).toBe(10000);
  if (kind === "mecanicos")
    expect(result.rows.slice(1)).toEqual([[shops.vector.owner.name, 1, 10000, 10000, 2, 0]]);
});
