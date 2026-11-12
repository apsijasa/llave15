import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { log } from "../../src/lib/log.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { serviceReports } from "../../src/server/db/schema-reports.ts";
import { auditLog, bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import {
  getMaintenancePlan,
  maintenancePlanByToken,
  maintenancePlanSchema,
  setMaintenancePlan,
  suggestedMaintenanceDate,
} from "../../src/server/taller/maintenance-plan.ts";
import { generateReport } from "../../src/server/taller/reports.ts";
import { newShareToken } from "../../src/server/taller/share-tokens.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-12T15:00:00Z");
const LATER = new Date("2026-11-12T15:01:00Z");
const PLAN = { nextMaintenanceDate: "2027-05-12", nextMaintenanceNote: "Cambio de cadena" };
const PRIVATE = { email: "ana@example.test", phoneE164: "+56912345678" };
let test: TestDb;
let owner: SessionUser;
let orderId: string;
let token: string;

async function seedOwner() {
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta sucursal");
  const [user] = await test.db
    .insert(users)
    .values({
      branchId: branch.id,
      role: "owner",
      name: "Dueño",
      email: "owner@example.test",
      passwordHash: "hash",
    })
    .returning();
  if (!user) throw new Error("Falta usuario");
  owner = { id: user.id, branchId: branch.id, role: "owner", name: user.name, email: user.email };
}

async function seedOrder() {
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: owner.branchId,
      name: "Ana María Pérez",
      ...PRIVATE,
    })
    .returning();
  if (!customer) throw new Error("Falta cliente");
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: owner.branchId,
      customerId: customer.id,
      brand: "Trek",
      model: "Marlin",
      bikeType: "mtb",
    })
    .returning();
  if (!bike) throw new Error("Falta bicicleta");
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: owner.branchId,
      number: 1,
      customerId: customer.id,
      bikeId: bike.id,
      status: "lista_para_retirar",
      requestedService: "Mantención",
      qcApprovedAt: NOW,
      receivedAt: NOW,
      createdBy: owner.id,
    })
    .returning();
  if (!order) throw new Error("Falta orden");
  orderId = order.id;
}

async function report() {
  const [row] = await test.db
    .select()
    .from(serviceReports)
    .where(eq(serviceReports.workOrderId, orderId));
  if (!row) throw new Error("Falta informe");
  return row;
}

beforeEach(async () => {
  test = await createTestDb();
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(log, level);
  await seedOwner();
  await seedOrder();
  const result = await generateReport(
    test.db,
    owner,
    orderId,
    { recommendations: "", nextChecks: "" },
    NOW,
  );
  if (!result.ok) throw new Error(result.code);
  token = result.token;
  return () => test.close();
});

afterEach(() => {
  for (const level of ["info", "warn", "error"] as const) {
    const calls = JSON.stringify(vi.mocked(log[level]).mock.calls);
    for (const secret of [PRIVATE.email, PRIVATE.phoneE164, owner.email, token])
      expect(calls).not.toContain(secret);
  }
  vi.restoreAllMocks();
});

it.each([
  ["2026-11-12T15:00:00Z", "2027-05-12"],
  ["2026-08-31T15:00:00Z", "2027-02-28"],
  ["2026-11-13T02:30:00Z", "2027-05-12"],
])("sugiere seis meses desde hoy en Santiago: %s", (instant, expected) => {
  expect(suggestedMaintenanceDate(new Date(instant))).toBe(expected);
});

it("guarda fecha y nota recortada, audita y conserva el snapshot", async () => {
  const before = await report();
  expect(
    await setMaintenancePlan(
      test.db,
      owner,
      orderId,
      {
        ...PLAN,
        nextMaintenanceNote: `  ${PLAN.nextMaintenanceNote}  `,
      },
      LATER,
    ),
  ).toEqual({ ok: true });
  expect(await getMaintenancePlan(test.db, owner, orderId)).toEqual(PLAN);
  expect(await report()).toMatchObject({ snapshot: before.snapshot, updatedAt: LATER });
  const rows = await test.db
    .select()
    .from(auditLog)
    .where(eq(auditLog.action, "report.maintenance_planned"));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    branchId: owner.branchId,
    actorUserId: owner.id,
    details: { nextMaintenanceDate: PLAN.nextMaintenanceDate },
    createdAt: LATER,
  });
});

it("permite descartar la fecha y no publica un plan sin fecha", async () => {
  expect(await getMaintenancePlan(test.db, owner, orderId)).toEqual({
    nextMaintenanceDate: null,
    nextMaintenanceNote: "",
  });
  expect(
    await setMaintenancePlan(test.db, owner, orderId, { ...PLAN, nextMaintenanceDate: null }, NOW),
  ).toEqual({ ok: true });
  expect((await getMaintenancePlan(test.db, owner, orderId))?.nextMaintenanceDate).toBeNull();
  expect(await maintenancePlanByToken(test.db, token)).toBeNull();
});

it.each([
  { ...PLAN, nextMaintenanceDate: "2020-01-01" },
  { ...PLAN, nextMaintenanceDate: "2026-02-30" },
  { ...PLAN, nextMaintenanceDate: "" },
  { ...PLAN, nextMaintenanceNote: "x".repeat(301) },
  { ...PLAN, nextMaintenanceNote: null },
])("rechaza una entrada inválida sin cambiar filas: %j", async (input) => {
  const before = await report();
  expect(await setMaintenancePlan(test.db, owner, orderId, input, NOW)).toEqual({
    ok: false,
    code: "validation_error",
  });
  expect(await report()).toEqual(before);
  expect(await test.db.select().from(auditLog)).toHaveLength(1);
});

it("acepta hoy local aunque el instante UTC esté en el día siguiente", async () => {
  expect(
    await setMaintenancePlan(
      test.db,
      owner,
      orderId,
      { ...PLAN, nextMaintenanceDate: "2026-11-12" },
      new Date("2026-11-13T02:30:00Z"),
    ),
  ).toEqual({ ok: true });
  expect(
    maintenancePlanSchema.safeParse({ ...PLAN, nextMaintenanceNote: "x".repeat(300) }).success,
  ).toBe(true);
});

it("exige informe, permiso y sucursal, y valida el identificador", async () => {
  expect(await setMaintenancePlan(test.db, owner, randomUUID(), PLAN, NOW)).toEqual({
    ok: false,
    code: "not_found",
  });
  expect(await setMaintenancePlan(test.db, owner, "inválido", PLAN, NOW)).toEqual({
    ok: false,
    code: "not_found",
  });
  const mechanic = { ...owner, role: "mechanic" } as const;
  expect(await setMaintenancePlan(test.db, mechanic, orderId, PLAN, NOW)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(await getMaintenancePlan(test.db, mechanic, orderId)).toBeNull();
  const other = { ...owner, branchId: randomUUID() };
  expect(await setMaintenancePlan(test.db, other, orderId, PLAN, NOW)).toEqual({
    ok: false,
    code: "not_found",
  });
  expect(await getMaintenancePlan(test.db, other, orderId)).toBeNull();
  expect(await getMaintenancePlan(test.db, owner, "inválido")).toBeNull();
  await seedOrderWithoutReport();
});

async function seedOrderWithoutReport() {
  const original = await report();
  const [order] = await test.db.select().from(workOrders).where(eq(workOrders.id, orderId));
  if (!order) throw new Error("Falta orden");
  const id = randomUUID();
  await test.db.insert(workOrders).values({ ...order, id, number: 2 });
  expect(await setMaintenancePlan(test.db, owner, id, PLAN, NOW)).toEqual({
    ok: false,
    code: "not_found",
  });
  expect(await getMaintenancePlan(test.db, owner, id)).toBeNull();
  expect(await report()).toEqual(original);
}

it("conserva el envío con la misma fecha y lo reinicia cuando cambia o se descarta", async () => {
  await setMaintenancePlan(test.db, owner, orderId, PLAN, NOW);
  await test.db.update(serviceReports).set({ maintenanceReminderSentAt: NOW });
  await setMaintenancePlan(
    test.db,
    owner,
    orderId,
    { ...PLAN, nextMaintenanceNote: "Nota nueva" },
    LATER,
  );
  expect((await report()).maintenanceReminderSentAt).toEqual(NOW);
  await setMaintenancePlan(
    test.db,
    owner,
    orderId,
    { ...PLAN, nextMaintenanceDate: "2027-05-13" },
    LATER,
  );
  expect((await report()).maintenanceReminderSentAt).toBeNull();
  await test.db.update(serviceReports).set({ maintenanceReminderSentAt: NOW });
  await setMaintenancePlan(test.db, owner, orderId, { ...PLAN, nextMaintenanceDate: null }, LATER);
  expect((await report()).maintenanceReminderSentAt).toBeNull();
});

it("consulta por hash del token y rechaza tokens inválidos, desconocidos y reemplazados", async () => {
  await setMaintenancePlan(test.db, owner, orderId, PLAN, NOW);
  expect(await maintenancePlanByToken(test.db, token)).toEqual(PLAN);
  expect(await maintenancePlanByToken(test.db, "inválido")).toBeNull();
  expect(await maintenancePlanByToken(test.db, newShareToken())).toBeNull();
  const result = await generateReport(
    test.db,
    owner,
    orderId,
    { recommendations: "", nextChecks: "" },
    LATER,
  );
  if (!result.ok) throw new Error(result.code);
  expect(await maintenancePlanByToken(test.db, token)).toBeNull();
  expect(await maintenancePlanByToken(test.db, result.token)).toEqual(PLAN);
});

it("revierte el cambio si falla la auditoría en la transacción", async () => {
  const before = await report();
  await expect(
    setMaintenancePlan(test.db, { ...owner, id: randomUUID() }, orderId, PLAN, NOW),
  ).rejects.toThrow();
  expect(await report()).toEqual(before);
});
