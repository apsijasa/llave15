import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { log } from "../../src/lib/log.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { ROLES } from "../../src/server/auth/permissions.ts";
import { cashMovements, cashSessions, expenses } from "../../src/server/db/schema-cash.ts";
import { workOrderApprovals, workOrders } from "../../src/server/db/schema-orders.ts";
import { payments } from "../../src/server/db/schema-payments.ts";
import { sales } from "../../src/server/db/schema-sales.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { bookings, branches, users } from "../../src/server/db/schema.ts";
import {
  dashboardIndicators,
  previousRange,
} from "../../src/server/taller/indicators-dashboard.ts";
import { financeIndicators } from "../../src/server/taller/indicators-finance.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";
const NOW = new Date("2026-11-20T15:00:00Z");
const IN_RANGE = new Date("2026-11-14T15:00:00Z");
const OLD = new Date("2026-10-15T15:00:00Z");
const RANGE = { from: "2026-11-01", to: "2026-11-30" };
const PREVIOUS = { from: "2026-10-02", to: "2026-10-31" };
const PRIVATE = { email: "cliente@example.test", phoneE164: "+56912345678", rut: "12345678-5" };
let test: TestDb;
let actors: Record<(typeof ROLES)[number], SessionUser>;
let branchId: string;
let customerId: string;
let bikeId: string;
let orderNumber: number;
beforeEach(async () => {
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(log, level);
  test = await createTestDb();
  branchId = randomUUID();
  await test.db.insert(branches).values({ id: branchId, name: "Sucursal" });
  actors = {} as typeof actors;
  for (const role of ROLES) {
    const user = { id: randomUUID(), branchId, role, name: role, email: `${role}@example.test` };
    await test.db.insert(users).values({ ...user, passwordHash: "hash" });
    actors[role] = user;
  }
  customerId = randomUUID();
  await test.db.insert(customers).values({ id: customerId, branchId, name: "Ana", ...PRIVATE });
  bikeId = randomUUID();
  await test.db
    .insert(bikes)
    .values({ id: bikeId, branchId, customerId, brand: "Trek", model: "Marlin", bikeType: "mtb" });
  orderNumber = 0;
  return () => test.close();
});
afterEach(() => {
  for (const level of ["info", "warn", "error"] as const) {
    const calls = JSON.stringify(vi.mocked(log[level]).mock.calls);
    for (const secret of [
      ...Object.values(PRIVATE),
      ...Object.values(actors).map((actor) => actor.email),
    ])
      expect(calls).not.toContain(secret);
  }
  vi.restoreAllMocks();
});
async function order(values: Partial<typeof workOrders.$inferInsert> = {}) {
  const [row] = await test.db
    .insert(workOrders)
    .values({
      branchId,
      number: ++orderNumber,
      customerId,
      bikeId,
      status: "diagnostico",
      requestedService: "Mantención",
      totalClp: 0,
      createdBy: actors.owner.id,
      createdAt: IN_RANGE,
      ...values,
    })
    .returning();
  if (!row) throw new Error("Falta la orden.");
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
    expenseDate: "2026-11-20",
    description: "Lubricante",
    method: "transferencia",
    createdBy: actors.owner.id,
    ...values,
  });
}
async function approval(
  workOrderId: string,
  priceClp: number,
  values: Partial<typeof workOrderApprovals.$inferInsert> = {},
) {
  await test.db.insert(workOrderApprovals).values({
    branchId,
    workOrderId,
    description: "Adicional",
    recommendation: "Revisar",
    priceClp,
    tokenHash: randomUUID(),
    createdBy: actors.owner.id,
    createdAt: IN_RANGE,
    ...values,
  });
}
async function booking(status = "confirmed", serviceDate = "2026-11-14") {
  const [row] = await test.db
    .insert(bookings)
    .values({
      branchId,
      code: randomUUID(),
      status,
      serviceDate,
      mode: "taller",
      startsAt: IN_RANGE,
      endsAt: NOW,
      customerName: "Ana",
      phoneE164: PRIVATE.phoneE164,
      bike: "Bici",
      description: "Revisión",
      consentAt: OLD,
      cancelTokenHash: randomUUID(),
    })
    .returning();
  if (!row) throw new Error("Falta reserva.");
  return row.id;
}
function indicators(actor = actors.owner, range = RANGE) {
  return dashboardIndicators(test.db, actor, range, NOW);
}
it.each(["reception", "mechanic"] as const)(
  "%s recibe null sin consultar ni validar el rango",
  async (role) => {
    const select = vi.spyOn(test.db, "select");
    expect(await indicators(actors[role], { from: "inválido", to: "inválido" })).toBeNull();
    expect(select).not.toHaveBeenCalled();
  },
);
it("dueño y administración reciben el objeto sin costos y se valida el rango", async () => {
  const result = await indicators();
  expect(result).toMatchObject({ range: RANGE, previous: PREVIOUS });
  expect(await indicators(actors.admin)).toEqual(result);
  for (const field of ["cost", "fee", "net_clp"])
    expect(JSON.stringify(result)).not.toContain(field);
  await expect(indicators(actors.owner, { from: RANGE.to, to: RANGE.from })).rejects.toThrow();
});
it("calcula el período anterior del mes y de un día", () => {
  expect(previousRange(RANGE)).toEqual(PREVIOUS);
  expect(previousRange({ from: "2026-11-20", to: "2026-11-20" })).toEqual({
    from: "2026-11-19",
    to: "2026-11-19",
  });
});
it("compara ingresos, excluye pagos anulados y coincide con finanzas", async () => {
  const workOrderId = await order();
  await pay({ workOrderId });
  await pay({ workOrderId, amountClp: 10000, receivedAt: OLD });
  await pay({ workOrderId, voidedAt: NOW, voidedBy: actors.owner.id });
  const data = await indicators();
  expect(data?.headline.income).toEqual({ currentClp: 11900, previousClp: 10000, deltaPct: 19 });
  for (const field of ["cost", "fee", "net_clp"]) expect(JSON.stringify(data)).not.toContain(field);
  expect(data?.headline.income.currentClp).toBe(
    (await financeIndicators(test.db, actors.owner, RANGE, NOW))?.income.grossClp,
  );
});
it("sin base anterior la variación es null y suma pagos de ventas", async () => {
  const [sale] = await test.db
    .insert(sales)
    .values({
      branchId,
      number: 1,
      subtotalClp: 10000,
      vatClp: 1900,
      totalClp: 11900,
      createdBy: actors.owner.id,
      createdAt: IN_RANGE,
    })
    .returning();
  if (!sale) throw new Error("Falta venta.");
  await pay({ saleId: sale.id });
  const data = await indicators();
  expect(data?.headline.income).toEqual({ currentClp: 11900, previousClp: 0, deltaPct: null });
  expect(data?.headline.income.currentClp).toBe(
    (await financeIndicators(test.db, actors.owner, RANGE, NOW))?.income.grossClp,
  );
});
it("descuenta egresos y devoluciones netas con la misma definición de finanzas", async () => {
  await pay({ workOrderId: await order() });
  await expense(8000);
  await expense(9999, { voidedAt: NOW });
  await expense(9999, { expenseDate: "2026-12-01" });
  const [session] = await test.db
    .insert(cashSessions)
    .values({ branchId, openedAt: IN_RANGE, openedBy: actors.owner.id, openingCashClp: 0 })
    .returning();
  if (!session) throw new Error("Falta caja.");
  for (const referenceKind of ["sale_refund", "order_refund"] as const)
    await test.db.insert(cashMovements).values({
      branchId,
      cashSessionId: session.id,
      kind: "egreso",
      amountClp: 595,
      referenceKind,
      referenceId: randomUUID(),
      createdBy: actors.owner.id,
      createdAt: IN_RANGE,
    });
  const balance = (await indicators())?.headline.netBalance;
  expect(balance).toEqual({ currentClp: 1000, previousClp: 0, deltaPct: null });
  expect(balance?.currentClp).toBe(
    (await financeIndicators(test.db, actors.owner, RANGE, NOW))?.balanceClp,
  );
});
it("promedia tickets y días de cierre y cuenta abiertas fuera del rango", async () => {
  await order({ createdAt: OLD });
  await order();
  for (const totalClp of [10000, 20000])
    await order({
      status: "entregada",
      totalClp,
      paidClp: totalClp,
      receivedAt: new Date("2026-11-10T15:00:00Z"),
      deliveredAt: IN_RANGE,
      qcApprovedAt: IN_RANGE,
    });
  await order({ voidedAt: NOW });
  await order({ status: "cancelada" });
  const data = await indicators();
  expect(data?.headline.averageTicket).toEqual({
    currentClp: 15000,
    previousClp: 0,
    deltaPct: null,
  });
  expect(data?.headline.openOrders).toEqual({ count: 2, avgDaysToClose: 4 });
});
it("mide ritmo de creación por día local y saldo abierto", async () => {
  await order({ totalClp: 11900, paidClp: 1900 });
  await order({ createdAt: new Date("2026-11-14T02:30:00Z") });
  await order({ createdAt: new Date("2026-11-13T15:00:00Z") });
  await order({ voidedAt: NOW, totalClp: 99999 });
  await order({ status: "cancelada", totalClp: 99999, createdAt: OLD });
  expect((await indicators())?.rhythm).toEqual({
    activeDays: 2,
    ordersPerActiveDay: 1.5,
    amountToReview: { count: 1, totalClp: 10000 },
  });
});
it("rellena 30 días y ubica ingresos y egresos en el día local", async () => {
  await pay({ workOrderId: await order() });
  await expense(8000);
  const daily = (await indicators())?.daily;
  expect(daily?.days).toHaveLength(30);
  expect(daily?.days[0]).toEqual({ date: "2026-11-01", incomeClp: 0, expensesClp: 0 });
  expect(daily?.days[13]).toEqual({ date: "2026-11-14", incomeClp: 11900, expensesClp: 0 });
  expect(daily?.days[19]).toEqual({ date: "2026-11-20", incomeClp: 0, expensesClp: 8000 });
  expect(daily).toMatchObject({
    bestDay: { date: "2026-11-14", incomeClp: 11900 },
    activeDays: 1,
    averageDailyIncomeClp: Math.round(11900 / 30),
  });
});
it("agrupa UTC en Chile y elige el primer día ante empate", async () => {
  const workOrderId = await order();
  await pay({ workOrderId, receivedAt: new Date("2026-11-14T02:30:00Z") });
  await pay({ workOrderId });
  await pay({ workOrderId, receivedAt: new Date("2026-11-01T02:59:59Z") });
  await pay({ workOrderId, receivedAt: new Date("2026-12-01T03:00:00Z") });
  const daily = (await indicators())?.daily;
  expect(daily?.days[12]?.incomeClp).toBe(11900);
  expect(daily?.bestDay).toEqual({ date: "2026-11-13", incomeClp: 11900 });
  expect(daily?.activeDays).toBe(2);
  expect(daily?.averageDailyIncomeClp).toBe(Math.round(23800 / 30));
});
it("devuelve lunes a domingo y cuenta el martes local", async () => {
  await order({ createdAt: new Date("2026-11-17T15:00:00Z") });
  await order({ createdAt: new Date("2026-11-18T02:30:00Z") });
  await order({ voidedAt: NOW });
  const weekday = (await indicators())?.weekday;
  expect(weekday?.map(({ weekday, label }) => [weekday, label])).toEqual([
    [1, "Lun"],
    [2, "Mar"],
    [3, "Mié"],
    [4, "Jue"],
    [5, "Vie"],
    [6, "Sáb"],
    [7, "Dom"],
  ]);
  expect(weekday?.[1]?.count).toBe(2);
  expect(weekday?.reduce((sum, day) => sum + day.count, 0)).toBe(2);
});
it("agrupa antigüedad con now y usa creación si falta recepción", async () => {
  for (const days of [1, 5, 10, 20])
    await order({ receivedAt: new Date(NOW.getTime() - days * 86400000) });
  expect((await indicators())?.ages.map(({ count }) => count)).toEqual([1, 1, 1, 1]);
  await order({ createdAt: new Date(NOW.getTime() - 5 * 86400000) });
  await order({ voidedAt: NOW });
  await order({ status: "cancelada" });
  expect((await indicators())?.ages).toEqual([
    { bucket: "0-3", label: "0 a 3 días", count: 1 },
    { bucket: "4-7", label: "4 a 7 días", count: 2 },
    { bucket: "8-14", label: "8 a 14 días", count: 1 },
    { bucket: "15+", label: "15 días o más", count: 1 },
  ]);
});
it("resume adicionales vigentes de órdenes vigentes por decisión", async () => {
  const id = await order();
  await approval(id, 5000);
  await approval(id, 7000, { decision: "aprobado", decidedAt: NOW });
  await approval(id, 3000, { decision: "rechazado", decidedAt: NOW });
  await approval(id, 9999, { voidedAt: NOW });
  await approval(id, 9999, { createdAt: OLD });
  await approval(await order({ voidedAt: NOW }), 9999);
  expect((await indicators())?.approvals).toEqual({
    created: 3,
    pending: 1,
    approved: 1,
    rejected: 1,
    acceptedValueClp: 7000,
    conversionPct: 50,
  });
});
it("cuenta reservas confirmadas sin orden vigente en el rango", async () => {
  await booking();
  await order({ bookingId: await booking() });
  await booking("cancelled");
  await booking("confirmed", "2026-10-31");
  expect((await indicators())?.bookingsPending).toBe(1);
  await order({ bookingId: await booking(), voidedAt: NOW });
  expect((await indicators())?.bookingsPending).toBe(2);
});
it("cuenta nuevos que volvieron y excluye al cliente con historia previa", async () => {
  await order();
  await order();
  expect((await indicators())?.returnedNewCount).toBe(1);
  await order({ createdAt: OLD, voidedAt: NOW });
  expect((await indicators())?.returnedNewCount).toBe(1);
  await order({ createdAt: OLD });
  expect((await indicators())?.returnedNewCount).toBe(0);
});
it("mide entregas sin respaldo de pago vigente", async () => {
  const delivered = {
    status: "entregada",
    totalClp: 11900,
    paidClp: 11900,
    deliveredAt: IN_RANGE,
    qcApprovedAt: IN_RANGE,
  };
  await pay({ workOrderId: await order(delivered) });
  const unpaid = await order(delivered);
  await pay({ workOrderId: unpaid, voidedAt: NOW });
  await order({ ...delivered, voidedAt: NOW });
  expect((await indicators())?.paymentQuality).toEqual({
    deliveredCount: 2,
    withoutPaymentCount: 1,
    completePct: 50,
    amountToReviewClp: 11900,
  });
});
it("sin movimientos entrega ceros y no divide por cero", async () => {
  const data = await indicators();
  expect(data?.headline).toEqual({
    income: { currentClp: 0, previousClp: 0, deltaPct: null },
    averageTicket: { currentClp: 0, previousClp: 0, deltaPct: null },
    netBalance: { currentClp: 0, previousClp: 0, deltaPct: null },
    openOrders: { count: 0, avgDaysToClose: 0 },
  });
  expect(data?.rhythm).toEqual({
    activeDays: 0,
    ordersPerActiveDay: 0,
    amountToReview: { count: 0, totalClp: 0 },
  });
  expect(data?.daily).toMatchObject({ bestDay: null, averageDailyIncomeClp: 0, activeDays: 0 });
  expect(Object.values(data?.approvals ?? {})).toEqual([0, 0, 0, 0, 0, 0]);
  expect(data?.paymentQuality).toEqual({
    deliveredCount: 0,
    withoutPaymentCount: 0,
    completePct: 0,
    amountToReviewClp: 0,
  });
  expect(data?.bookingsPending).toBe(0);
  expect(data?.returnedNewCount).toBe(0);
});
