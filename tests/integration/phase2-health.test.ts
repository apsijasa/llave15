import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { cashSessions } from "../../src/server/db/schema-cash.ts";
import { products, stockMovements } from "../../src/server/db/schema-inventory.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { payments } from "../../src/server/db/schema-payments.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { setCashControl } from "../../src/server/taller/cash.ts";
import { phase2Health } from "../../src/server/taller/phase2-health.ts";
import { applyStockMovement } from "../../src/server/taller/stock.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const BEFORE = new Date("2026-11-14T14:00:00Z");
const NOW = new Date("2026-11-14T15:00:00Z");
const LATER = new Date("2026-11-14T16:00:00Z");
const HEALTHY = {
  ok: true,
  netoInconsistent: 0,
  cashUnlinked: 0,
  cashDifferenceOver: 0,
  stockDrift: 0,
};
let test: TestDb;
let owner: SessionUser;
let orderId: string;
let productId: string;

beforeEach(async () => {
  test = await createTestDb();
  const branchId = randomUUID();
  await test.db.insert(branches).values({ id: branchId, name: "Sucursal" });
  owner = { id: randomUUID(), branchId, role: "owner", name: "Dueño", email: "owner@example.test" };
  await test.db.insert(users).values({ ...owner, passwordHash: "hash" });
  const customerId = randomUUID();
  await test.db
    .insert(customers)
    .values({ id: customerId, branchId, name: "Ana", phoneE164: "+56912345678" });
  const bikeId = randomUUID();
  await test.db
    .insert(bikes)
    .values({ id: bikeId, branchId, customerId, brand: "Trek", model: "Marlin", bikeType: "mtb" });
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId,
      number: 1,
      customerId,
      bikeId,
      status: "recibida",
      requestedService: "Mantención",
      pricingMode: "neto",
      subtotalClp: 10000,
      vatClp: 1900,
      totalClp: 11900,
      createdBy: owner.id,
    })
    .returning();
  if (!order) throw new Error("Falta la orden.");
  orderId = order.id;
  const [product] = await test.db
    .insert(products)
    .values({
      branchId,
      sku: "REP-1",
      name: "Cadena",
      category: "repuesto",
      priceClp: 5000,
      costClp: 3000,
      createdBy: owner.id,
    })
    .returning();
  if (!product) throw new Error("Falta el producto.");
  productId = product.id;
  const movement = await test.db.transaction((tx) =>
    applyStockMovement(
      tx,
      owner,
      { productId, kind: "ajuste", quantity: 3, note: "Stock inicial" },
      NOW,
    ),
  );
  expect(movement).toMatchObject({ ok: true, stockQty: 3 });
  return () => test.close();
});

async function cashPayment(createdAt: Date) {
  await test.db.insert(payments).values({
    branchId: owner.branchId,
    workOrderId: orderId,
    kind: "final",
    method: "efectivo",
    amountClp: 1000,
    receivedBy: owner.id,
    receivedAt: createdAt,
    createdAt,
  });
}

it("una base sana sale ok con los cuatro conteos en cero", async () => {
  expect(await phase2Health(test.db)).toEqual(HEALTHY);
});

it("cuenta una orden neto con el IVA mal escrito", async () => {
  await test.db
    .update(workOrders)
    .set({ subtotalClp: 10000, vatClp: 1800, totalClp: 11800 })
    .where(eq(workOrders.id, orderId));
  expect(await phase2Health(test.db)).toEqual({ ...HEALTHY, ok: false, netoInconsistent: 1 });
});

it("redondea el IVA como vatOfNet: 10.003 netos llevan 1.901", async () => {
  await test.db
    .update(workOrders)
    .set({ subtotalClp: 10003, vatClp: 1901, totalClp: 11904 })
    .where(eq(workOrders.id, orderId));
  expect(await phase2Health(test.db)).toEqual(HEALTHY);
});

it("cuenta un pago en efectivo sin caja posterior al último cambio del interruptor", async () => {
  await cashPayment(BEFORE);
  expect(await setCashControl(test.db, owner, { enabled: true }, NOW)).toMatchObject({ ok: true });
  expect(await phase2Health(test.db)).toEqual(HEALTHY);
  await cashPayment(LATER);
  expect(await phase2Health(test.db)).toEqual({ ...HEALTHY, ok: false, cashUnlinked: 1 });
});

it("no cuenta el efectivo sin caja de una sucursal con la caja deshabilitada", async () => {
  expect(await setCashControl(test.db, owner, { enabled: true }, NOW)).toMatchObject({ ok: true });
  expect(await setCashControl(test.db, owner, { enabled: false }, NOW)).toMatchObject({ ok: true });
  await cashPayment(LATER);
  expect(await phase2Health(test.db)).toEqual(HEALTHY);
});

it("cuenta una sesión cerrada con diferencia mayor que 5.000", async () => {
  const session = {
    branchId: owner.branchId,
    openedAt: NOW,
    openedBy: owner.id,
    openingCashClp: 20000,
    closedAt: LATER,
    closedBy: owner.id,
    expectedCashClp: 20000,
  };
  await test.db.insert(cashSessions).values([
    { ...session, countedCashClp: 15000, differenceClp: -5000 },
    { ...session, countedCashClp: 14000, differenceClp: -6000 },
  ]);
  expect(await phase2Health(test.db)).toEqual({ ...HEALTHY, ok: false, cashDifferenceOver: 1 });
});

it("cuenta un producto cuyo stock no coincide con sus movimientos", async () => {
  await test.db.insert(stockMovements).values({
    branchId: owner.branchId,
    productId,
    kind: "ajuste",
    quantity: 2,
    note: "Movimiento sin producto actualizado",
    createdBy: owner.id,
  });
  expect(await phase2Health(test.db)).toEqual({ ...HEALTHY, ok: false, stockDrift: 1 });
});
