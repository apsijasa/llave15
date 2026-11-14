import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { ROLES } from "../../src/server/auth/permissions.ts";
import { cashMovements } from "../../src/server/db/schema-cash.ts";
import { products, stockMovements } from "../../src/server/db/schema-inventory.ts";
import { payments } from "../../src/server/db/schema-payments.ts";
import { saleItems, sales } from "../../src/server/db/schema-sales.ts";
import { auditLog } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { closeCashSession, openCashSession, setCashControl } from "../../src/server/taller/cash.ts";
import { refundFormSchema, registerRefund } from "../../src/server/taller/refunds.ts";
import { voidSale } from "../../src/server/taller/sale-void.ts";
import { createSale } from "../../src/server/taller/sales.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-14T15:00:00Z");
const LATER = new Date("2026-11-14T16:00:00Z");
const SKU = "REP-CADENA";
let test: TestDb;
let actors: Record<(typeof ROLES)[number], SessionUser>;
let productId: string;

beforeEach(async () => {
  test = await createTestDb();
  const branchId = randomUUID();
  await test.db.insert(branches).values({ id: branchId, name: "Sucursal" });
  actors = {} as typeof actors;
  for (const role of ROLES) {
    const user = { id: randomUUID(), branchId, role, name: role, email: `${role}@example.test` };
    await test.db.insert(users).values({ ...user, passwordHash: "hash" });
    actors[role] = user;
  }
  const [product] = await test.db
    .insert(products)
    .values({
      branchId,
      sku: SKU,
      name: "Cadena",
      category: "repuesto",
      priceClp: 5000,
      costClp: 3000,
      stockQty: 3,
      createdBy: actors.owner.id,
    })
    .returning();
  if (!product) throw new Error("Falta el producto.");
  productId = product.id;
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

function sell(method = "efectivo", quantity = 2) {
  return createSale(test.db, actors.reception, { items: [{ productId, quantity }], method }, NOW);
}

async function soldInCash() {
  const result = await sell();
  if (!result.ok) throw new Error(result.code);
  return result;
}

async function stockQty() {
  const [product] = await test.db.select().from(products).where(eq(products.id, productId));
  return product?.stockQty;
}

async function snapshot() {
  return {
    sales: await test.db.select().from(sales),
    items: await test.db.select().from(saleItems),
    payments: await test.db.select().from(payments),
    stock: await test.db.select().from(stockMovements),
    cash: await test.db.select().from(cashMovements),
    audits: await test.db.select().from(auditLog),
    products: await test.db.select().from(products),
  };
}

it("con la caja abierta, la venta en efectivo queda pagada en la sesión con su ingreso", async () => {
  const sessionId = await openCash();
  const result = await soldInCash();
  expect(result).toMatchObject({ number: "VM-00001", totalClp: 11900 });
  const state = await snapshot();
  expect(state.sales).toEqual([
    expect.objectContaining({ status: "pagada", cashSessionId: sessionId, paidClp: 11900 }),
  ]);
  expect(state.payments).toEqual([
    expect.objectContaining({ saleId: result.saleId, cashSessionId: sessionId, amountClp: 11900 }),
  ]);
  expect(state.cash).toEqual([
    expect.objectContaining({
      cashSessionId: sessionId,
      kind: "ingreso",
      amountClp: 11900,
      referenceKind: "payment",
      referenceId: state.payments[0]?.id,
    }),
  ]);
});

it("con la caja habilitada y cerrada, rechaza la venta en efectivo sin escribir nada", async () => {
  await enableCash();
  const before = await snapshot();
  expect(await sell()).toEqual({ ok: false, code: "cash_closed" });
  expect(await snapshot()).toEqual(before);
  expect((await test.db.select().from(branches))[0]?.nextSaleNumber).toBe(1);
});

it("con la caja cerrada, una venta por transferencia sigue registrándose sin sesión", async () => {
  await enableCash();
  const result = await sell("transferencia");
  expect(result).toMatchObject({ ok: true });
  const state = await snapshot();
  expect(state.sales[0]?.cashSessionId).toBeNull();
  expect(state.cash).toEqual([]);
});

it("con la caja apagada, la venta en efectivo se registra sin sesión ni movimiento", async () => {
  expect(await sell()).toMatchObject({ ok: true });
  const state = await snapshot();
  expect(state.sales).toEqual([expect.objectContaining({ status: "pagada", cashSessionId: null })]);
  expect(state.payments).toEqual([expect.objectContaining({ cashSessionId: null })]);
  expect(state.cash).toEqual([]);
});

it("el dueño devuelve 1 unidad con monto y motivo: egreso, stock +1 y auditoría", async () => {
  const sessionId = await openCash();
  await soldInCash();
  expect(await stockQty()).toBe(1);
  const result = await registerRefund(
    test.db,
    actors.owner,
    {
      saleNumber: "VM-00001",
      amountClp: 5950,
      reason: "Cadena con defecto",
      returnedSku: SKU,
      returnedQuantity: 1,
    },
    LATER,
  );
  expect(result).toMatchObject({ ok: true });
  const state = await snapshot();
  expect(state.cash).toContainEqual(
    expect.objectContaining({
      cashSessionId: sessionId,
      kind: "egreso",
      amountClp: 5950,
      referenceKind: "sale_refund",
      referenceId: state.sales[0]?.id,
      note: "Cadena con defecto",
    }),
  );
  expect(state.stock).toContainEqual(
    expect.objectContaining({
      kind: "devolucion",
      quantity: 1,
      unitCostClp: 3000,
      referenceKind: "sale_refund",
      referenceId: state.sales[0]?.id,
    }),
  );
  expect(await stockQty()).toBe(2);
  expect(state.audits).toContainEqual(
    expect.objectContaining({
      actorUserId: actors.owner.id,
      action: "cash.refund",
      details: expect.objectContaining({
        reference: "VM-00001",
        amountClp: 5950,
        reason: "Cadena con defecto",
        returnedQuantity: 1,
      }),
    }),
  );
});

it("rechaza una devolución mayor que lo pagado menos lo ya devuelto, sin escribir", async () => {
  await openCash();
  await soldInCash();
  const refund = (amountClp: number) =>
    registerRefund(
      test.db,
      actors.owner,
      { saleNumber: "VM-00001", amountClp, reason: "Devolución parcial" },
      LATER,
    );
  expect(await refund(10000)).toMatchObject({ ok: true });
  const before = await snapshot();
  expect(await refund(1901)).toEqual({ ok: false, code: "invalid_amount" });
  expect(await snapshot()).toEqual(before);
  expect(await refund(1900)).toMatchObject({ ok: true });
});

it("rechaza devolver más unidades de las vendidas, sin escribir", async () => {
  await openCash();
  await soldInCash();
  const before = await snapshot();
  expect(
    await registerRefund(
      test.db,
      actors.owner,
      {
        saleNumber: "VM-00001",
        amountClp: 100,
        reason: "Tres cadenas",
        returnedSku: SKU,
        returnedQuantity: 3,
      },
      LATER,
    ),
  ).toEqual({ ok: false, code: "invalid_amount" });
  expect(await snapshot()).toEqual(before);
});

it.each(["reception", "mechanic"] as const)("%s no puede registrar devoluciones", async (role) => {
  await openCash();
  await soldInCash();
  const before = await snapshot();
  expect(
    await registerRefund(
      test.db,
      actors[role],
      { saleNumber: "VM-00001", amountClp: 100, reason: "Intento" },
      LATER,
    ),
  ).toEqual({ ok: false, code: "forbidden" });
  expect(await snapshot()).toEqual(before);
});

it("la devolución exige la caja habilitada y abierta", async () => {
  await soldInCash();
  const refund = () =>
    registerRefund(
      test.db,
      actors.owner,
      { saleNumber: "VM-00001", amountClp: 100, reason: "Sin caja" },
      LATER,
    );
  expect(await refund()).toEqual({ ok: false, code: "cash_control_off" });
  await enableCash();
  expect(await refund()).toEqual({ ok: false, code: "cash_closed" });
});

it("anular una venta en efectivo con la sesión abierta anula también su ingreso", async () => {
  await openCash();
  const sale = await soldInCash();
  expect(
    await voidSale(test.db, actors.owner, sale.saleId, { reason: "Error de registro" }, LATER),
  ).toMatchObject({ ok: true });
  const state = await snapshot();
  expect(state.cash[0]).toMatchObject({ voidedAt: LATER, voidedBy: actors.owner.id });
  expect(await stockQty()).toBe(3);
});

it("anular una venta en efectivo cuya sesión ya cerró no cambia nada", async () => {
  await openCash();
  const sale = await soldInCash();
  expect(
    await closeCashSession(test.db, actors.reception, { countedCashClp: 11900 }, LATER),
  ).toMatchObject({ ok: true, differenceClp: 0 });
  const before = await snapshot();
  expect(
    await voidSale(test.db, actors.owner, sale.saleId, { reason: "Error de registro" }, LATER),
  ).toEqual({ ok: false, code: "cash_session_closed" });
  expect(await snapshot()).toEqual(before);
});

it.each([
  { amountClp: 100, reason: "Sin destino" },
  { saleNumber: "VM-00001", workOrderId: randomUUID(), amountClp: 100, reason: "Los dos" },
  { saleNumber: "VM-1", amountClp: 100, reason: "Número inválido" },
  { saleNumber: "VM-00001", amountClp: 0, reason: "Monto cero" },
  { saleNumber: "VM-00001", amountClp: 100, reason: "No" },
  { saleNumber: "VM-00001", amountClp: 100, reason: "Sin cantidad", returnedSku: SKU },
  {
    workOrderId: randomUUID(),
    amountClp: 100,
    reason: "Orden con producto",
    returnedSku: SKU,
    returnedQuantity: 1,
  },
])("refundFormSchema rechaza %j", (input) => {
  expect(refundFormSchema.safeParse(input).success).toBe(false);
});
