import { randomUUID } from "node:crypto";
import { beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { ROLES } from "../../src/server/auth/permissions.ts";
import { cashMovements, cashSessions } from "../../src/server/db/schema-cash.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { payments } from "../../src/server/db/schema-payments.ts";
import { sales } from "../../src/server/db/schema-sales.ts";
import { auditLog, bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import {
  closeCashSession,
  currentCashSession,
  dayPaymentsSummary,
  listCashSessions,
  openCashSession,
  recordCashMovement,
  requireOpenCashSession,
  setCashControl,
  voidCashMovementFor,
} from "../../src/server/taller/cash.ts";
import { RECORDABLE_PAYMENT_METHODS } from "../../src/server/taller/rules.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-14T15:00:00Z");
const LATER = new Date("2026-11-14T16:00:00Z");
let test: TestDb;
let actors: Record<(typeof ROLES)[number], SessionUser>;
const failure = (code: string) => ({ ok: false, code });

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
  return () => test.close();
});

function control(enabled: unknown, actor = actors.owner) {
  return setCashControl(test.db, actor, { enabled }, NOW);
}

function close(countedCashClp: unknown, actor = actors.owner) {
  return closeCashSession(test.db, actor, { countedCashClp }, LATER);
}

async function opened(actor = actors.reception) {
  expect(await control(true, actors.owner)).toMatchObject({ ok: true });
  const result = await openCashSession(test.db, actor, { openingCashClp: 20000 }, NOW);
  if (!result.ok) throw new Error(result.code);
  return result.sessionId;
}

function movement(sessionId: string, overrides = {}) {
  return {
    sessionId,
    kind: "ingreso",
    amountClp: 15000,
    referenceKind: "payment",
    referenceId: randomUUID(),
    ...overrides,
  };
}

async function record(input: ReturnType<typeof movement>, actor = actors.reception) {
  return test.db.transaction((tx) => recordCashMovement(tx, actor, input, NOW));
}

async function cashState() {
  return {
    branches: await test.db.select().from(branches),
    sessions: await test.db.select().from(cashSessions),
    movements: await test.db.select().from(cashMovements),
    audits: await test.db.select().from(auditLog),
  };
}

it("abre con autor y auditoría; traduce el índice único sin dejar una transacción abortada", async () => {
  const sessionId = await opened();
  expect((await test.db.select().from(cashSessions))[0]).toMatchObject({
    id: sessionId,
    branchId: actors.owner.branchId,
    openedBy: actors.reception.id,
    openingCashClp: 20000,
    openedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const before = await cashState();
  expect(await openCashSession(test.db, actors.reception, { openingCashClp: 0 }, NOW)).toEqual(
    failure("cash_session_open"),
  );
  expect(await cashState()).toEqual(before);
  expect(before.audits.find((row) => row.action === "cash.opened")).toMatchObject({
    actorUserId: actors.reception.id,
    entityId: sessionId,
    details: { openingCashClp: 20000 },
  });
});

it("rechaza apertura con control apagado y cierre sin sesión", async () => {
  expect(await openCashSession(test.db, actors.owner, { openingCashClp: 0 }, NOW)).toEqual(
    failure("cash_control_off"),
  );
  expect(await close(0, actors.reception)).toEqual(failure("not_found"));
  expect(await currentCashSession(test.db, actors.reception)).toBeNull();
  expect(await listCashSessions(test.db, actors.reception)).toEqual([]);
  expect((await cashState()).audits).toEqual([]);
});

it("cierra con esperado 32.000 y diferencia -1.000; conserva movimientos y audita el arqueo", async () => {
  const sessionId = await opened();
  const income = movement(sessionId);
  expect(await record(income)).toMatchObject({ ok: true });
  expect(
    await record(
      movement(sessionId, { kind: "egreso", amountClp: 3000, referenceKind: "expense" }),
    ),
  ).toMatchObject({ ok: true });
  expect(await currentCashSession(test.db, actors.reception)).toMatchObject({
    id: sessionId,
    incomeClp: 15000,
    expenseClp: 3000,
    expectedCashClp: 32000,
    movements: expect.arrayContaining([
      expect.objectContaining({ referenceKind: "payment", referenceId: income.referenceId }),
      expect.objectContaining({ referenceKind: "expense" }),
    ]),
  });
  expect(
    await closeCashSession(
      test.db,
      actors.reception,
      { countedCashClp: 31000, note: "Diferencia revisada" },
      LATER,
    ),
  ).toMatchObject({ ok: true });
  expect((await test.db.select().from(cashSessions))[0]).toMatchObject({
    closedAt: LATER,
    closedBy: actors.reception.id,
    countedCashClp: 31000,
    expectedCashClp: 32000,
    differenceClp: -1000,
    note: "Diferencia revisada",
    updatedAt: LATER,
  });
  expect((await cashState()).audits.find((row) => row.action === "cash.closed")).toMatchObject({
    entityId: sessionId,
    details: { expectedCashClp: 32000, countedCashClp: 31000, differenceClp: -1000 },
  });
  expect(await currentCashSession(test.db, actors.owner)).toBeNull();
  expect(await close(0, actors.owner)).toEqual(failure("not_found"));
  expect(await openCashSession(test.db, actors.admin, { openingCashClp: 0 }, LATER)).toMatchObject({
    ok: true,
  });
});

it("solo dueño/admin cambian el control; no audita cambios nulos y no apaga con sesión abierta", async () => {
  expect(await control(true, actors.reception)).toEqual(failure("forbidden"));
  await opened();
  expect(await control(true, actors.admin)).toEqual({ ok: true, changed: false });
  expect(await control(false, actors.owner)).toEqual(failure("cash_session_open"));
  await close(20000, actors.reception);
  expect(await control(false, actors.admin)).toEqual({ ok: true, changed: true });
  const changes = (await cashState()).audits.filter((row) => row.action === "cash.control_changed");
  expect(changes.map((row) => row.details)).toEqual([{ enabled: true }, { enabled: false }]);
});

it("requireOpenCashSession distingue apagado, cerrado y abierto dentro de la transacción llamadora", async () => {
  const required = () =>
    test.db.transaction((tx) => requireOpenCashSession(tx, actors.owner.branchId));
  expect(await required()).toEqual({ mode: "off" });
  await control(true, actors.owner);
  expect(await required()).toEqual({ mode: "closed" });
  const sessionId = await opened();
  expect(await required()).toEqual({ mode: "open", sessionId });
  await close(20000, actors.owner);
  expect(await required()).toEqual({ mode: "closed" });
});

it("anula sin borrar; omite anulados del esperado y rechaza anular o registrar en sesión cerrada", async () => {
  const sessionId = await opened();
  const input = movement(sessionId);
  await record(input);
  const voided = () =>
    test.db.transaction((tx) =>
      voidCashMovementFor(tx, actors.reception, "payment", input.referenceId, LATER),
    );
  expect(await voided()).toEqual({ ok: true });
  expect(await voided()).toEqual({ ok: true });
  expect((await test.db.select().from(cashMovements))[0]).toMatchObject({
    voidedAt: LATER,
    voidedBy: actors.reception.id,
  });
  expect(await currentCashSession(test.db, actors.owner)).toMatchObject({
    incomeClp: 0,
    expenseClp: 0,
    expectedCashClp: 20000,
  });
  await record(input);
  await close(35000, actors.owner);
  const before = await cashState();
  expect(await voided()).toEqual(failure("cash_session_closed"));
  expect(await record(movement(sessionId))).toEqual(failure("cash_session_closed"));
  expect(await cashState()).toEqual(before);
});

it("niega al mecánico todas las funciones con actor antes de consultar o escribir", async () => {
  const { mechanic } = actors;
  const before = await cashState();
  for (const result of [
    await setCashControl(test.db, mechanic, { enabled: true }, NOW),
    await openCashSession(test.db, mechanic, { openingCashClp: 0 }, NOW),
    await closeCashSession(test.db, mechanic, { countedCashClp: 0 }, NOW),
    await currentCashSession(test.db, mechanic),
    await listCashSessions(test.db, mechanic),
    await dayPaymentsSummary(test.db, mechanic, NOW),
    await test.db.transaction((tx) =>
      recordCashMovement(tx, mechanic, movement(randomUUID()), NOW),
    ),
    await test.db.transaction((tx) =>
      voidCashMovementFor(tx, mechanic, "payment", randomUUID(), NOW),
    ),
  ])
    expect(result).toEqual(failure("forbidden"));
  expect(await cashState()).toEqual(before);
});

it("valida montos enteros, rango, UUID, tipo y referencia sin escribir", async () => {
  for (const amount of [-1, 0.5, 10000001, NaN, "abc", null]) {
    expect(await openCashSession(test.db, actors.owner, { openingCashClp: amount }, NOW)).toEqual(
      failure("validation_error"),
    );
    expect(await close(amount, actors.owner)).toEqual(failure("validation_error"));
  }
  expect(await control("false", actors.owner)).toEqual(failure("validation_error"));
  const sessionId = await opened();
  const before = await cashState();
  for (const override of [
    { amountClp: 0 },
    { amountClp: -1 },
    { amountClp: 1.5 },
    { kind: "otro" },
    { referenceKind: "otro" },
    { sessionId: "abc" },
    { referenceId: "abc" },
  ]) {
    expect(await record(movement(sessionId, override))).toEqual(failure("validation_error"));
  }
  expect(
    await test.db.transaction((tx) => voidCashMovementFor(tx, actors.owner, "payment", "abc", NOW)),
  ).toEqual(failure("validation_error"));
  expect(await cashState()).toEqual(before);
});

it("aísla sesiones, movimientos, historial y control por sucursal", async () => {
  const sessionId = await opened();
  const input = movement(sessionId);
  await record(input);
  const branchId = randomUUID();
  await test.db.insert(branches).values({ id: branchId, name: "Otra" });
  const outsider = { ...actors.owner, branchId };
  expect(await currentCashSession(test.db, outsider)).toBeNull();
  expect(await listCashSessions(test.db, outsider)).toEqual([]);
  expect(await closeCashSession(test.db, outsider, { countedCashClp: 0 }, NOW)).toEqual(
    failure("not_found"),
  );
  expect(await record(input, outsider)).toEqual(failure("not_found"));
  expect(await record(movement(randomUUID()))).toEqual(failure("not_found"));
  expect(
    await test.db.transaction((tx) =>
      voidCashMovementFor(tx, outsider, "payment", input.referenceId, NOW),
    ),
  ).toEqual({ ok: true });
  expect((await test.db.select().from(cashMovements))[0]?.voidedAt).toBeNull();
  expect(await setCashControl(test.db, outsider, { enabled: true }, NOW)).toMatchObject({
    ok: true,
  });
  expect(await openCashSession(test.db, outsider, { openingCashClp: 0 }, LATER)).toMatchObject({
    ok: true,
  });
  expect(await listCashSessions(test.db, actors.owner)).toHaveLength(1);
});

it("lista solo las últimas 30 sesiones de la sucursal por fecha descendente", async () => {
  const rows = Array.from({ length: 31 }, (_, i) => ({
    branchId: actors.owner.branchId,
    openedBy: actors.owner.id,
    openingCashClp: i,
    openedAt: new Date(NOW.getTime() + i * 1000),
    closedAt: LATER,
    closedBy: actors.owner.id,
    countedCashClp: i,
    expectedCashClp: i,
    differenceClp: 0,
  }));
  await test.db.insert(cashSessions).values(rows);
  const result = await listCashSessions(test.db, actors.reception);
  expect(result).toHaveLength(30);
  if (!Array.isArray(result)) throw new Error("Falta historial");
  expect(result.map((row) => row.openingCashClp)).toEqual(
    Array.from({ length: 30 }, (_, i) => 30 - i),
  );
});

async function paymentTargets() {
  const branchId = actors.owner.branchId;
  const customerId = randomUUID();
  const bikeId = randomUUID();
  const workOrderId = randomUUID();
  const saleId = randomUUID();
  await test.db
    .insert(customers)
    .values({ id: customerId, branchId, name: "Cliente", phoneE164: "+56912345678" });
  await test.db
    .insert(bikes)
    .values({ id: bikeId, branchId, customerId, brand: "Marca", model: "Modelo", bikeType: "mtb" });
  await test.db.insert(workOrders).values({
    id: workOrderId,
    branchId,
    customerId,
    bikeId,
    number: 1,
    requestedService: "Revisión",
    createdBy: actors.owner.id,
  });
  await test.db.insert(sales).values({
    id: saleId,
    branchId,
    number: 1,
    subtotalClp: 0,
    vatClp: 0,
    totalClp: 0,
    createdBy: actors.owner.id,
  });
  return [{ workOrderId }, { saleId }];
}

function addPayment(values: typeof payments.$inferInsert) {
  return test.db.insert(payments).values(values);
}

it("resume todos los métodos de órdenes y ventas vigentes en el día de Santiago, sin comisiones ni otros días/sucursales", async () => {
  const targets = await paymentTargets();
  for (const target of targets) {
    for (const method of RECORDABLE_PAYMENT_METHODS) {
      for (const receivedAt of [
        new Date("2026-11-14T03:00:00Z"),
        new Date("2026-11-15T02:59:59.999Z"),
      ]) {
        await addPayment({
          ...target,
          branchId: actors.owner.branchId,
          kind: "final",
          method,
          amountClp: 1000,
          receivedBy: actors.owner.id,
          receivedAt,
          externalId: method === "mercadopago" ? "MP-123" : null,
          feeClp: method === "mercadopago" ? 100 : 0,
        });
      }
    }
  }
  const extraBranch = randomUUID();
  await test.db.insert(branches).values({ id: extraBranch, name: "Otra" });
  for (const overrides of [
    { receivedAt: new Date("2026-11-14T02:59:59.999Z") },
    { receivedAt: new Date("2026-11-15T03:00:00Z") },
    { voidedAt: LATER, voidedBy: actors.owner.id },
    { branchId: extraBranch },
  ])
    await addPayment({
      ...targets[0],
      branchId: actors.owner.branchId,
      kind: "final",
      method: "efectivo",
      amountClp: 9999,
      receivedBy: actors.owner.id,
      receivedAt: NOW,
      ...overrides,
    });
  expect(
    await dayPaymentsSummary(test.db, actors.reception, new Date("2026-11-15T02:00:00Z")),
  ).toEqual(RECORDABLE_PAYMENT_METHODS.map((method) => ({ method, amountClp: 4000, count: 4 })));
  expect(await dayPaymentsSummary(test.db, actors.admin, new Date("2026-11-16T15:00:00Z"))).toEqual(
    RECORDABLE_PAYMENT_METHODS.map((method) => ({ method, amountClp: 0, count: 0 })),
  );
});
