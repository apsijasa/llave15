import { randomUUID } from "node:crypto";
import { beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { ROLES } from "../../src/server/auth/permissions.ts";
import { cashMovements } from "../../src/server/db/schema-cash.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { payments } from "../../src/server/db/schema-payments.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { closeCashSession, openCashSession, setCashControl } from "../../src/server/taller/cash.ts";
import { recordPayment, voidPayment } from "../../src/server/taller/payments.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-14T15:00:00Z");
const LATER = new Date("2026-11-14T16:00:00Z");
const CASH = { kind: "abono", method: "efectivo", amountClp: 20000 } as const;
let test: TestDb;
let actors: Record<(typeof ROLES)[number], SessionUser>;
let orderId: string;

beforeEach(async () => {
  test = await createTestDb();
  const branchId = randomUUID();
  await test.db.insert(branches).values({ id: branchId, name: "Sucursal" });
  actors = {} as typeof actors;
  for (const role of ROLES) {
    const actor = { id: randomUUID(), branchId, role, name: role, email: `${role}@example.test` };
    await test.db.insert(users).values({ ...actor, passwordHash: "hash" });
    actors[role] = actor;
  }
  const [customer] = await test.db
    .insert(customers)
    .values({ branchId, name: "Cliente de prueba", phoneE164: "+56912345678" })
    .returning();
  if (!customer) throw new Error("Falta el cliente de prueba.");
  const [bike] = await test.db
    .insert(bikes)
    .values({ branchId, customerId: customer.id, brand: "Trek", model: "Marlin", bikeType: "mtb" })
    .returning();
  if (!bike) throw new Error("Falta la bicicleta de prueba.");
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId,
      number: 1,
      customerId: customer.id,
      bikeId: bike.id,
      status: "creado",
      receivedAt: NOW,
      requestedService: "Revisión general",
      totalClp: 50000,
      createdBy: actors.owner.id,
    })
    .returning();
  if (!order) throw new Error("Falta la orden de prueba.");
  orderId = order.id;
  return () => test.close();
});

async function enableCash() {
  expect(await setCashControl(test.db, actors.owner, { enabled: true }, NOW)).toMatchObject({
    ok: true,
  });
}

async function openCash() {
  await enableCash();
  const result = await openCashSession(test.db, actors.reception, { openingCashClp: 0 }, NOW);
  if (!result.ok) throw new Error(result.code);
  return result.sessionId;
}

async function pay(input: object = CASH) {
  return recordPayment(test.db, actors.reception, orderId, input, NOW);
}

async function state() {
  return {
    payments: await test.db.select().from(payments),
    movements: await test.db.select().from(cashMovements),
    orders: await test.db.select().from(workOrders),
  };
}

it("con la caja abierta, el pago en efectivo entra a la sesión con su ingreso", async () => {
  const sessionId = await openCash();
  const result = await pay();
  if (!result.ok) throw new Error(result.code);
  const { payments: rows, movements } = await state();
  expect(rows).toEqual([
    expect.objectContaining({ id: result.paymentId, cashSessionId: sessionId, amountClp: 20000 }),
  ]);
  expect(movements).toEqual([
    expect.objectContaining({
      cashSessionId: sessionId,
      kind: "ingreso",
      amountClp: 20000,
      referenceKind: "payment",
      referenceId: result.paymentId,
      voidedAt: null,
    }),
  ]);
});

it("con la caja habilitada y sin sesión abierta, rechaza el efectivo sin escribir", async () => {
  await enableCash();
  const before = await state();
  expect(await pay()).toEqual({ ok: false, code: "cash_closed" });
  expect(await state()).toEqual(before);
});

it("con la caja apagada, registra el efectivo como hoy y sin sesión", async () => {
  const result = await pay();
  expect(result).toMatchObject({ ok: true });
  const { payments: rows, movements, orders } = await state();
  expect(rows).toEqual([expect.objectContaining({ cashSessionId: null, method: "efectivo" })]);
  expect(movements).toEqual([]);
  expect(orders[0]?.paidClp).toBe(20000);
});

it("anular un pago en efectivo con la sesión abierta anula también su movimiento", async () => {
  await openCash();
  const result = await pay();
  if (!result.ok) throw new Error(result.code);
  expect(await voidPayment(test.db, actors.owner, result.paymentId, LATER)).toEqual({ ok: true });
  const { payments: rows, movements, orders } = await state();
  expect(rows[0]?.voidedAt).toEqual(LATER);
  expect(movements[0]).toMatchObject({ voidedAt: LATER, voidedBy: actors.owner.id });
  expect(orders[0]?.paidClp).toBe(0);
});

it("si la sesión del pago ya cerró, no anula nada", async () => {
  await openCash();
  const result = await pay();
  if (!result.ok) throw new Error(result.code);
  expect(
    await closeCashSession(test.db, actors.reception, { countedCashClp: 20000 }, LATER),
  ).toMatchObject({ ok: true, differenceClp: 0 });
  const before = await state();
  expect(await voidPayment(test.db, actors.owner, result.paymentId, LATER)).toEqual({
    ok: false,
    code: "cash_session_closed",
  });
  expect(await state()).toEqual(before);
});

it.each(["transferencia", "tarjeta", "otro"])(
  "un pago por %s con la caja abierta no crea movimiento de caja",
  async (method) => {
    await openCash();
    const result = await pay({ ...CASH, method });
    expect(result).toMatchObject({ ok: true });
    const { payments: rows, movements } = await state();
    expect(rows).toEqual([expect.objectContaining({ cashSessionId: null, method })]);
    expect(movements).toEqual([]);
  },
);

it("con la caja abierta, un pago efectivo inválido no deja sesión ni movimiento", async () => {
  await openCash();
  expect(await pay({ ...CASH, amountClp: 999999 })).toEqual({
    ok: false,
    code: "invalid_amount",
  });
  const { payments: rows, movements } = await state();
  expect(rows).toEqual([]);
  expect(movements).toEqual([]);
});
