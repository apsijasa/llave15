import { randomUUID } from "node:crypto";
import { beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { ROLES } from "../../src/server/auth/permissions.ts";
import { cashMovements, cashSessions, expenses } from "../../src/server/db/schema-cash.ts";
import { products } from "../../src/server/db/schema-inventory.ts";
import { workOrderItems, workOrders } from "../../src/server/db/schema-orders.ts";
import { payments } from "../../src/server/db/schema-payments.ts";
import { saleItems, sales } from "../../src/server/db/schema-sales.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { financeIndicators } from "../../src/server/taller/indicators-finance.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-20T15:00:00Z");
const IN_RANGE = new Date("2026-11-14T15:00:00Z");
const OUT_OF_RANGE = new Date("2026-10-31T15:00:00Z");
const RANGE = { from: "2026-11-01", to: "2026-11-30" };
let test: TestDb;
let actors: Record<(typeof ROLES)[number], SessionUser>;
let branchId: string;
let customerId: string;
let bikeId: string;
let orderNumber = 0;
let saleNumber = 0;

beforeEach(async () => {
  test = await createTestDb();
  branchId = randomUUID();
  orderNumber = 0;
  saleNumber = 0;
  await test.db.insert(branches).values({ id: branchId, name: "Sucursal" });
  actors = {} as typeof actors;
  for (const role of ROLES) {
    const user = { id: randomUUID(), branchId, role, name: role, email: `${role}@example.test` };
    await test.db.insert(users).values({ ...user, passwordHash: "hash" });
    actors[role] = user;
  }
  customerId = randomUUID();
  await test.db
    .insert(customers)
    .values({ id: customerId, branchId, name: "Ana", phoneE164: "+56912345678" });
  bikeId = randomUUID();
  await test.db
    .insert(bikes)
    .values({ id: bikeId, branchId, customerId, brand: "Trek", model: "Marlin", bikeType: "mtb" });
  return () => test.close();
});

async function order(values: Partial<typeof workOrders.$inferInsert> = {}) {
  orderNumber += 1;
  const [row] = await test.db
    .insert(workOrders)
    .values({
      branchId,
      number: orderNumber,
      customerId,
      bikeId,
      status: "creado",
      requestedService: "Mantención",
      totalClp: 11900,
      createdBy: actors.owner.id,
      ...values,
    })
    .returning();
  if (!row) throw new Error("Falta la orden.");
  return row.id;
}

async function product(values: Partial<typeof products.$inferInsert> = {}) {
  const [row] = await test.db
    .insert(products)
    .values({
      branchId,
      sku: randomUUID(),
      name: "Cadena",
      category: "repuesto",
      priceClp: 5000,
      costClp: 3000,
      stockQty: 0,
      createdBy: actors.owner.id,
      ...values,
    })
    .returning();
  if (!row) throw new Error("Falta el producto.");
  return row.id;
}

async function sale(
  totals: { subtotalClp: number; vatClp: number; totalClp: number },
  values: Partial<typeof sales.$inferInsert> = {},
) {
  saleNumber += 1;
  const [row] = await test.db
    .insert(sales)
    .values({
      branchId,
      number: saleNumber,
      status: "pagada",
      paidClp: totals.totalClp,
      createdBy: actors.owner.id,
      createdAt: IN_RANGE,
      ...totals,
      ...values,
    })
    .returning();
  if (!row) throw new Error("Falta la venta.");
  return row.id;
}

async function pay(values: Partial<typeof payments.$inferInsert>) {
  await test.db.insert(payments).values({
    branchId,
    kind: "final",
    method: "transferencia",
    amountClp: 11900,
    receivedBy: actors.owner.id,
    receivedAt: IN_RANGE,
    ...values,
  });
}

async function expense(amountClp: number, values: Partial<typeof expenses.$inferInsert> = {}) {
  await test.db.insert(expenses).values({
    branchId,
    category: "insumos",
    amountClp,
    expenseDate: "2026-11-14",
    description: "Lubricante",
    method: "transferencia",
    createdBy: actors.owner.id,
    ...values,
  });
}

function indicators(actor = actors.owner) {
  return financeIndicators(test.db, actor, RANGE, NOW);
}

it.each(["reception", "mechanic"] as const)("%s recibe null", async (role) => {
  expect(await indicators(actors[role])).toBeNull();
});

it("suma ingresos de órdenes y ventas, egresos, balance y gastos sobre ingresos", async () => {
  await pay({ workOrderId: await order() });
  await pay({ saleId: await sale({ subtotalClp: 10000, vatClp: 1900, totalClp: 11900 }) });
  await expense(8000);
  // Fuera del rango o anulados: no cuentan.
  await pay({ workOrderId: await order(), receivedAt: OUT_OF_RANGE });
  await pay({ workOrderId: await order(), voidedAt: IN_RANGE, voidedBy: actors.owner.id });
  await expense(5000, { expenseDate: "2026-10-31" });
  await expense(5000, { voidedAt: IN_RANGE, voidedBy: actors.owner.id, voidReason: "Duplicado" });
  const result = await indicators();
  expect(result).toMatchObject({
    income: { grossClp: 23800, netClp: 20000, refundsClp: 0 },
    expenses: { totalClp: 8000 },
    balanceClp: 12000,
    expenseRatioPct: 40,
  });
  expect(result?.expenses.byCategory).toContainEqual({
    category: "insumos",
    label: "Insumos",
    amountClp: 8000,
  });
});

it("descuenta las devoluciones netas del balance", async () => {
  await pay({ workOrderId: await order() });
  const [session] = await test.db
    .insert(cashSessions)
    .values({ branchId, openedAt: IN_RANGE, openedBy: actors.owner.id, openingCashClp: 0 })
    .returning();
  if (!session) throw new Error("Falta la sesión.");
  await test.db.insert(cashMovements).values({
    branchId,
    cashSessionId: session.id,
    kind: "egreso",
    amountClp: 1190,
    referenceKind: "sale_refund",
    referenceId: randomUUID(),
    createdBy: actors.owner.id,
    createdAt: IN_RANGE,
  });
  expect(await indicators()).toMatchObject({
    income: { grossClp: 11900, netClp: 10000, refundsClp: 1000 },
    balanceClp: 9000,
  });
});

it("POS por proveedor: suma el bruto y cuenta Mercado Pago antiguo como Mercado Pago", async () => {
  await pay({ workOrderId: await order(), method: "tarjeta", posProvider: "getnet" });
  await pay({ workOrderId: await order(), method: "tarjeta", posProvider: "mercadopago" });
  await pay({
    workOrderId: await order(),
    method: "mercadopago",
    externalId: "MP-123",
    feeClp: 450,
    netClp: 11450,
  });
  await pay({ workOrderId: await order(), method: "tarjeta" });
  const expected = [
    { provider: "transbank", label: "Transbank", grossClp: 0 },
    { provider: "mercadopago", label: "Mercado Pago", grossClp: 23800 },
    { provider: "getnet", label: "Getnet", grossClp: 11900 },
  ];
  expect((await indicators())?.pos).toEqual(expected);
  expect((await indicators(actors.admin))?.pos).toEqual(expected);
});

it("mix de ingresos y margen de repuestos", async () => {
  const partId = await product();
  const orderId = await order({
    status: "entregada",
    pricingMode: "neto",
    subtotalClp: 15000,
    vatClp: 2850,
    totalClp: 17850,
    paidClp: 17850,
    qcApprovedAt: IN_RANGE,
    deliveredAt: IN_RANGE,
  });
  const line = {
    branchId,
    workOrderId: orderId,
    origin: "inicial" as const,
    createdBy: actors.owner.id,
  };
  await test.db.insert(workOrderItems).values([
    { ...line, kind: "servicio", description: "Mantención", unitPriceClp: 10000 },
    {
      ...line,
      kind: "repuesto",
      description: "Cadena",
      productId: partId,
      unitCostClp: 3000,
      unitPriceClp: 5000,
    },
    {
      ...line,
      kind: "servicio",
      description: "Anulada",
      unitPriceClp: 99999,
      voidedAt: IN_RANGE,
      voidedBy: actors.owner.id,
    },
  ]);
  const saleId = await sale({ subtotalClp: 10000, vatClp: 1900, totalClp: 11900 });
  await test.db.insert(saleItems).values({
    branchId,
    saleId,
    productId: partId,
    description: "Cadena",
    quantity: 2,
    unitPriceClp: 5000,
    unitCostClp: 3000,
  });
  const result = await indicators();
  expect(result?.mix).toEqual({ servicesClp: 10000, partsClp: 5000, counterSalesClp: 10000 });
  expect(result?.partsMarginClp).toBe(6000);
});

it("una orden final entra al mix por su neto", async () => {
  const orderId = await order({
    status: "entregada",
    totalClp: 11900,
    paidClp: 11900,
    qcApprovedAt: IN_RANGE,
    deliveredAt: IN_RANGE,
  });
  await test.db.insert(workOrderItems).values({
    branchId,
    workOrderId: orderId,
    origin: "inicial",
    kind: "servicio",
    description: "Mantención",
    unitPriceClp: 11900,
    createdBy: actors.owner.id,
  });
  expect((await indicators())?.mix.servicesClp).toBe(10000);
});

it("inventario: activos, bajo mínimo, sin stock y valor a costo", async () => {
  await product({ minStock: 2, stockQty: 1, costClp: 3000 });
  await product({ minStock: 0, stockQty: 0, costClp: 2000 });
  await product({ stockQty: 4, costClp: 1000 });
  await product({ stockQty: 10, costClp: 9999, isActive: false });
  expect((await indicators())?.inventory).toEqual({
    activeCount: 3,
    lowStockCount: 1,
    outOfStockCount: 1,
    valueAtCostClp: 1 * 3000 + 4 * 1000,
  });
});

it("sin movimientos devuelve ceros sin dividir por cero", async () => {
  const result = await indicators();
  expect(result).toMatchObject({
    range: RANGE,
    income: { grossClp: 0, netClp: 0, refundsClp: 0 },
    pos: [
      { provider: "transbank", label: "Transbank", grossClp: 0 },
      { provider: "mercadopago", label: "Mercado Pago", grossClp: 0 },
      { provider: "getnet", label: "Getnet", grossClp: 0 },
    ],
    expenses: { totalClp: 0 },
    balanceClp: 0,
    expenseRatioPct: 0,
    mix: { servicesClp: 0, partsClp: 0, counterSalesClp: 0 },
    inventory: { activeCount: 0, lowStockCount: 0, outOfStockCount: 0, valueAtCostClp: 0 },
    partsMarginClp: 0,
  });
  expect(result?.expenses.byCategory).toHaveLength(6);
});
