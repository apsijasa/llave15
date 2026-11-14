import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeEach, expect, it, vi } from "vitest";
import { hashPassword, loginAdmin } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { ROLES } from "../../src/server/auth/permissions.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { cashMovements, expenses } from "../../src/server/db/schema-cash.ts";
import { auditLog } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { closeCashSession, openCashSession, setCashControl } from "../../src/server/taller/cash.ts";
import {
  expenseFormSchema,
  listExpenses,
  recordExpense,
  voidExpense,
} from "../../src/server/taller/expenses.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null }));
vi.mock("../../src/server/db/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Base de prueba no inicializada");
    return holder.db;
  },
}));
const { default: ExpensesPage } = await import("../../src/pages/taller/gastos/index.astro");

const NOW = new Date("2026-11-14T15:00:00Z");
const LATER = new Date("2026-11-14T16:00:00Z");
const PASSWORD = "clave-gastos-de-prueba";
const SITE = "https://vectorbikes.cl";
const RANGE = { from: "2026-11-01", to: "2026-11-30" };
const CASH_EXPENSE = {
  category: "insumos",
  amountClp: 8000,
  expenseDate: "2026-11-14",
  description: "Lubricante",
  method: "efectivo",
} as const;
let test: TestDb;
let actors: Record<(typeof ROLES)[number], SessionUser>;

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  const branchId = randomUUID();
  await test.db.insert(branches).values({ id: branchId, name: "Sucursal" });
  actors = {} as typeof actors;
  const passwordHash = await hashPassword(PASSWORD);
  for (const role of ROLES) {
    const user = { id: randomUUID(), branchId, role, name: role, email: `${role}@example.test` };
    await test.db.insert(users).values({ ...user, passwordHash });
    actors[role] = user;
  }
  return async () => {
    holder.db = null;
    await test.close();
  };
});

async function enableCash() {
  expect(await setCashControl(test.db, actors.owner, { enabled: true }, NOW)).toMatchObject({
    ok: true,
  });
}

async function openCash() {
  await enableCash();
  const result = await openCashSession(test.db, actors.owner, { openingCashClp: 20000 }, NOW);
  if (!result.ok) throw new Error(result.code);
  return result.sessionId;
}

async function recorded(input: object = CASH_EXPENSE) {
  const result = await recordExpense(test.db, actors.owner, input, NOW);
  if (!result.ok) throw new Error(result.code);
  return result.expenseId;
}

async function snapshot() {
  return {
    expenses: await test.db.select().from(expenses),
    movements: await test.db.select().from(cashMovements),
    audits: await test.db.select().from(auditLog),
  };
}

it("con la caja abierta, un gasto en efectivo de 8.000 queda en la sesión con su egreso", async () => {
  const sessionId = await openCash();
  const expenseId = await recorded();
  const state = await snapshot();
  expect(state.expenses).toEqual([
    expect.objectContaining({ id: expenseId, cashSessionId: sessionId, amountClp: 8000 }),
  ]);
  expect(state.movements).toEqual([
    expect.objectContaining({
      cashSessionId: sessionId,
      kind: "egreso",
      amountClp: 8000,
      referenceKind: "expense",
      referenceId: expenseId,
    }),
  ]);
  expect(state.audits).toContainEqual(
    expect.objectContaining({ action: "expense.recorded", entityId: expenseId }),
  );
});

it("un gasto por transferencia se guarda sin sesión ni movimiento, aun con la caja abierta", async () => {
  await openCash();
  await recorded({ ...CASH_EXPENSE, method: "transferencia" });
  const state = await snapshot();
  expect(state.expenses).toEqual([expect.objectContaining({ cashSessionId: null })]);
  expect(state.movements).toEqual([]);
});

it("con la caja apagada, un gasto en efectivo se guarda sin sesión", async () => {
  await recorded();
  const state = await snapshot();
  expect(state.expenses).toEqual([expect.objectContaining({ cashSessionId: null })]);
  expect(state.movements).toEqual([]);
});

it("con la caja habilitada y cerrada, rechaza el gasto en efectivo sin escribir", async () => {
  await enableCash();
  const before = await snapshot();
  expect(await recordExpense(test.db, actors.owner, CASH_EXPENSE, NOW)).toEqual({
    ok: false,
    code: "cash_closed",
  });
  expect(await snapshot()).toEqual(before);
});

it.each(["reception", "mechanic"] as const)("%s no registra ni anula gastos", async (role) => {
  const expenseId = await recorded({ ...CASH_EXPENSE, method: "tarjeta" });
  const before = await snapshot();
  expect(await recordExpense(test.db, actors[role], CASH_EXPENSE, NOW)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(await voidExpense(test.db, actors[role], expenseId, { reason: "Error" }, LATER)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(await listExpenses(test.db, actors[role], RANGE)).toEqual([]);
  expect(await snapshot()).toEqual(before);
});

it("anular un gasto con la sesión abierta marca el gasto y su movimiento", async () => {
  await openCash();
  const expenseId = await recorded();
  expect(
    await voidExpense(test.db, actors.owner, expenseId, { reason: "Registrado dos veces" }, LATER),
  ).toEqual({ ok: true });
  const state = await snapshot();
  expect(state.expenses[0]).toMatchObject({
    voidedAt: LATER,
    voidedBy: actors.owner.id,
    voidReason: "Registrado dos veces",
  });
  expect(state.movements[0]).toMatchObject({ voidedAt: LATER, voidedBy: actors.owner.id });
  expect(state.audits).toContainEqual(
    expect.objectContaining({ action: "expense.voided", entityId: expenseId }),
  );
});

it("anular un gasto cuya sesión ya cerró no cambia nada", async () => {
  await openCash();
  const expenseId = await recorded();
  expect(
    await closeCashSession(test.db, actors.owner, { countedCashClp: 12000 }, LATER),
  ).toMatchObject({ ok: true, differenceClp: 0 });
  const before = await snapshot();
  expect(await voidExpense(test.db, actors.owner, expenseId, { reason: "Tarde" }, LATER)).toEqual({
    ok: false,
    code: "cash_session_closed",
  });
  expect(await snapshot()).toEqual(before);
});

it("lista vigentes y anulados del rango y rechaza rangos de más de 366 días", async () => {
  const kept = await recorded({ ...CASH_EXPENSE, method: "transferencia" });
  const voided = await recorded({ ...CASH_EXPENSE, method: "tarjeta", expenseDate: "2026-11-02" });
  await voidExpense(test.db, actors.owner, voided, { reason: "Duplicado" }, LATER);
  await recorded({ ...CASH_EXPENSE, method: "otro", expenseDate: "2026-10-31" });
  const rows = await listExpenses(test.db, actors.owner, RANGE);
  expect(rows.map((row) => [row.id, row.voidedAt !== null])).toEqual([
    [kept, false],
    [voided, true],
  ]);
  expect(
    await listExpenses(test.db, actors.owner, { from: "2025-01-01", to: "2026-11-30" }),
  ).toEqual([]);
});

it.each([
  { ...CASH_EXPENSE, amountClp: 0 },
  { ...CASH_EXPENSE, category: "comida" },
  { ...CASH_EXPENSE, method: "mercadopago" },
  { ...CASH_EXPENSE, description: "x" },
  { ...CASH_EXPENSE, expenseDate: "14-11-2026" },
  { ...CASH_EXPENSE, docType: "guia" },
  { ...CASH_EXPENSE, docNumber: "1".repeat(31) },
])("expenseFormSchema rechaza %j", (input) => {
  expect(expenseFormSchema.safeParse(input).success).toBe(false);
});

async function render(user: SessionUser) {
  const login = await loginAdmin(test.db, {
    email: user.email,
    password: PASSWORD,
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!login.ok) throw new Error(login.code);
  const request = new Request(`${SITE}/taller/gastos`, {
    headers: { cookie: `vb_admin_session=${login.token}` },
  });
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  return container.renderToResponse(ExpensesPage, { request }).finally(() => vi.useRealTimers());
}

it("recepción recibe 403 en /taller/gastos", async () => {
  expect((await render(actors.reception)).status).toBe(403);
});

it("el dueño ve el formulario y la lista del mes en curso", async () => {
  await recorded({ ...CASH_EXPENSE, method: "transferencia" });
  const response = await render(actors.owner);
  expect(response.status).toBe(200);
  const html = await response.text();
  for (const label of [
    "Categoría",
    "Monto neto",
    "Fecha",
    "Descripción",
    "Proveedor (opcional)",
    "Medio",
    "Documento",
    "Folio",
  ])
    expect(html).toContain(`>${label}</label>`);
  expect(html).toContain("Registrar gasto");
  expect(html).toContain("Lubricante");
  expect(html).toContain('value="2026-11-01"');
});
