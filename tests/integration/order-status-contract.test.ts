import { beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { workOrderStatusHistory } from "../../src/server/db/schema-orders.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { startReception } from "../../src/server/taller/orders.ts";
import { LEGACY_ORDER_STATUSES } from "../../src/server/taller/rules.ts";
import { ensureTrackingLink, viewTrackingByToken } from "../../src/server/taller/tracking.ts";
import { createTestDb, type TestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const NOW = new Date("2026-11-27T15:00:00Z");
let test: TestDb;
let owner: SessionUser;
let orderId: string;

async function seedOrder() {
  const [customer] = await test.db
    .insert(customers)
    .values({ branchId: owner.branchId, name: "Cliente de prueba", phoneE164: "+56912345678" })
    .returning();
  if (!customer) throw new Error("Falta cliente");
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: owner.branchId,
      customerId: customer.id,
      brand: "Prueba",
      model: "Ruta",
      bikeType: "ruta",
    })
    .returning();
  if (!bike) throw new Error("Falta bici");
  const result = await startReception(
    test.db,
    owner,
    { customerId: customer.id, bikeId: bike.id, requestedService: "Revisión general" },
    NOW,
  );
  if (!result.ok) throw new Error(result.code);
  return result.orderId;
}

beforeEach(async () => {
  test = await createTestDb();
  owner = (await seedTwoShops(test.db)).vector.owner;
  orderId = await seedOrder();
  return () => test.close();
});

it.each(LEGACY_ORDER_STATUSES)("la base rechaza el estado heredado %s", async (status) => {
  await expect(
    test.client.query("update work_orders set status = $1 where id = $2", [status, orderId]),
  ).rejects.toMatchObject({ code: "23514", constraint: "work_orders_status_check" });
});

it("acepta historial heredado y lo muestra como En reparación en seguimiento", async () => {
  const [row] = await test.db
    .insert(workOrderStatusHistory)
    .values({
      branchId: owner.branchId,
      workOrderId: orderId,
      fromStatus: "recibida",
      toStatus: "en_reparacion",
      createdAt: NOW,
    })
    .returning();
  expect(row?.toStatus).toBe("en_reparacion");
  const link = await ensureTrackingLink(test.db, owner, orderId, "https://example.test", NOW);
  if (!link.ok) throw new Error(link.code);
  const view = await viewTrackingByToken(test.db, link.token);
  expect(view?.timeline).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ status: "en_reparacion", label: "En reparación" }),
    ]),
  );
});
