import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import {
  workOrderItems,
  workOrders,
  workOrderStatusHistory,
} from "../../src/server/db/schema-orders.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { startReception } from "../../src/server/taller/orders.ts";
import { recomputeOrderTotals } from "../../src/server/taller/order-totals.ts";
import { createTestDb, type TestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const NOW = new Date("2026-11-26T15:00:00Z");
let test: TestDb;
let owner: SessionUser;
let orderId: string;

async function seedOrder(actor: SessionUser) {
  const [customer] = await test.db
    .insert(customers)
    .values({ branchId: actor.branchId, name: "Cliente de prueba", phoneE164: "+56912345678" })
    .returning();
  if (!customer) throw new Error("Falta cliente");
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: actor.branchId,
      customerId: customer.id,
      brand: "Prueba",
      model: "Ruta",
      bikeType: "ruta",
    })
    .returning();
  if (!bike) throw new Error("Falta bici");
  const result = await startReception(
    test.db,
    actor,
    { customerId: customer.id, bikeId: bike.id, requestedService: "Revisión general" },
    NOW,
  );
  if (!result.ok) throw new Error(result.code);
  return result.orderId;
}

async function addItem(unitPriceClp: number) {
  await test.db.insert(workOrderItems).values({
    branchId: owner.branchId,
    workOrderId: orderId,
    kind: "servicio",
    origin: "adicional",
    description: "Ajuste",
    unitPriceClp,
    createdBy: owner.id,
  });
}

async function saved() {
  const [row] = await test.db.select().from(workOrders).where(eq(workOrders.id, orderId));
  return row;
}

async function paidHistory() {
  const rows = await test.db
    .select()
    .from(workOrderStatusHistory)
    .where(eq(workOrderStatusHistory.workOrderId, orderId));
  return rows.filter((row) => row.fromStatus === "pagado");
}

beforeEach(async () => {
  test = await createTestDb();
  owner = (await seedTwoShops(test.db)).vector.owner;
  orderId = await seedOrder(owner);
  await addItem(1000);
  await recomputeOrderTotals(test.db, orderId, NOW);
  await test.db
    .update(workOrders)
    .set({ status: "pagado", qcApprovedAt: NOW, paidClp: 1000 })
    .where(eq(workOrders.id, orderId));
  return () => test.close();
});

it("una orden Pagado cuyo total cambia vuelve a Lista para retirar con historial", async () => {
  await addItem(500);
  await recomputeOrderTotals(test.db, orderId, NOW);
  expect(await saved()).toMatchObject({
    status: "lista_para_retirar",
    totalClp: 1500,
    paidClp: 1000,
  });
  expect(await paidHistory()).toEqual([
    expect.objectContaining({
      fromStatus: "pagado",
      toStatus: "lista_para_retirar",
      note: "Cambió el total",
      actorUserId: null,
      createdAt: NOW,
    }),
  ]);
});

it("una orden Pagado cuyo total no cambia sigue en Pagado sin historial", async () => {
  await recomputeOrderTotals(test.db, orderId, NOW);
  expect(await saved()).toMatchObject({ status: "pagado", totalClp: 1000, paidClp: 1000 });
  expect(await paidHistory()).toEqual([]);
});
