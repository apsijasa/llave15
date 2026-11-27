import { spawnSync } from "node:child_process";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { runOrdersRemap } from "../../scripts/orders-remap-status.ts";
import { workOrders, workOrderStatusHistory } from "../../src/server/db/schema-orders.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { createTestDb, type TestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const NOW = new Date("2026-11-26T15:00:00Z");
const legacy = ["reservada", "recibida", "en_reparacion", "control_calidad", "trabajo_rechazado"];
const targets = ["creado", "creado", "en_progreso", "en_progreso", "cancelada"];
let test: TestDb;

beforeEach(async () => {
  test = await createTestDb();
  const shops = await seedTwoShops(test.db);
  for (const { owner } of Object.values(shops)) {
    const [customer] = await test.db
      .insert(customers)
      .values({
        branchId: owner.branchId,
        name: "Cliente",
        phoneE164: "+56912345678",
        email: "privado@example.test",
      })
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
    for (const [index, status] of legacy.entries()) {
      const [order] = await test.db
        .insert(workOrders)
        .values({
          branchId: owner.branchId,
          customerId: customer.id,
          bikeId: bike.id,
          createdBy: owner.id,
          number: index + 1,
          requestedService: "Revisión",
          status,
        })
        .returning();
      if (!order) throw new Error("Falta orden");
      await test.db.insert(workOrderStatusHistory).values({
        branchId: owner.branchId,
        workOrderId: order.id,
        toStatus: status,
        actorUserId: owner.id,
      });
    }
  }
  return () => test.close();
});

it("dry-run devuelve 1, imprime solo conteos y no escribe", async () => {
  const before = await test.db.select().from(workOrders);
  const write = vi.fn();
  expect(await runOrdersRemap(test.db, true, NOW, write)).toBe(1);
  expect(write).toHaveBeenCalledExactlyOnceWith(
    JSON.stringify({
      pending: 10,
      remapped: Object.fromEntries(legacy.map((status) => [status, 2])),
    }),
  );
  expect(await test.db.select().from(workOrders)).toEqual(before);
  expect(write.mock.calls.flat().join("")).not.toMatch(/privado|example|56912345678/);
});
it("traspasa los cinco alias en dos talleres, conserva historial y es idempotente", async () => {
  const history = await test.db.select().from(workOrderStatusHistory);
  const write = vi.fn();
  expect(await runOrdersRemap(test.db, false, NOW, write)).toBe(0);
  for (const [index, status] of targets.entries()) {
    const rows = await test.db
      .select()
      .from(workOrders)
      .where(eq(workOrders.number, index + 1));
    expect(rows).toHaveLength(2);
    expect(
      rows.every((row) => row.status === status && row.updatedAt.getTime() === NOW.getTime()),
    ).toBe(true);
  }
  expect(await test.db.select().from(workOrderStatusHistory)).toEqual(history);
  const before = await test.db.select().from(workOrders);
  expect(await runOrdersRemap(test.db, false, new Date("2026-11-27"), write)).toBe(0);
  expect(JSON.parse(write.mock.lastCall?.[0] ?? "null")).toEqual({
    pending: 0,
    remapped: Object.fromEntries(legacy.map((status) => [status, 0])),
  });
  expect(await test.db.select().from(workOrders)).toEqual(before);
  expect(await runOrdersRemap(test.db, true, NOW, write)).toBe(0);
});

it("el CLI sale 2 sin DATABASE_URL y no imprime configuración", () => {
  const result = spawnSync(process.execPath, ["scripts/orders-remap-status.ts", "--dry-run"], {
    encoding: "utf8",
    env: { DATABASE_URL: "" },
  });
  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr)).toEqual({
    code: "remap_failed",
    message: "No se pudo completar el traspaso de estados.",
  });
});
