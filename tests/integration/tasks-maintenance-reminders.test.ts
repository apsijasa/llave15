import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { handleMaintenanceTask } from "../../src/server/api/task-handlers.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { serviceReports } from "../../src/server/db/schema-reports.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { consoleOutbox } from "../../src/server/email/transport.ts";
import {
  dueMaintenanceReminders,
  setMaintenancePlan,
} from "../../src/server/taller/maintenance-plan.ts";
import { generateReport } from "../../src/server/taller/reports.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

// Ya es 13 en UTC; en Santiago sigue siendo 12.
const NOW = new Date("2026-11-13T02:30:00Z");
const SEED_NOW = new Date("2026-09-01T15:00:00Z");
const SECRET = "test-maintenance-secret-0123456789abcdef";
const EMAIL = "ana@example.test";
const PHONE = "+56912345678";
const SITE_URL = "https://reservas.example.test";
const DEPS = { secret: SECRET, siteUrl: SITE_URL };
let test: TestDb;
let owner: SessionUser;
let logSpy: MockInstance<typeof console.log>;
let errorSpy: MockInstance<typeof console.error>;
let tokens: string[];
let nextNumber: number;

function taskRequest(header: string | null = `Bearer ${SECRET}`, method = "POST") {
  return new Request("https://vectorbikes.cl/api/tareas/mantenciones", {
    method,
    headers: header === null ? {} : { authorization: header },
  });
}

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

async function seedIdentity(email: string | null) {
  const [customer] = await test.db
    .insert(customers)
    .values({ branchId: owner.branchId, name: "Ana María Pérez", phoneE164: PHONE, email })
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
  return { customerId: customer.id, bikeId: bike.id };
}

async function seedReport(date: string | null = "2026-11-17", email: string | null = EMAIL) {
  const identity = await seedIdentity(email);
  const [order] = await test.db
    .insert(workOrders)
    .values({
      ...identity,
      branchId: owner.branchId,
      number: nextNumber++,
      status: "lista_para_retirar",
      requestedService: "Mantención",
      qcApprovedAt: SEED_NOW,
      receivedAt: SEED_NOW,
      createdAt: SEED_NOW,
      createdBy: owner.id,
    })
    .returning();
  if (!order) throw new Error("Falta orden");
  const report = await generateReport(
    test.db,
    owner,
    order.id,
    { recommendations: "", nextChecks: "" },
    SEED_NOW,
  );
  if (!report.ok) throw new Error(report.code);
  tokens.push(report.token);
  expect(
    await setMaintenancePlan(
      test.db,
      owner,
      order.id,
      {
        nextMaintenanceDate: date,
        nextMaintenanceNote: "Cambio de cadena",
      },
      SEED_NOW,
    ),
  ).toEqual({ ok: true });
  return order;
}

async function sentAt(orderId: string) {
  const [report] = await test.db
    .select()
    .from(serviceReports)
    .where(eq(serviceReports.workOrderId, orderId));
  if (!report) throw new Error("Falta informe");
  return report.maintenanceReminderSentAt;
}

beforeEach(async () => {
  vi.stubEnv("TASKS_SECRET", undefined);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleOutbox.length = 0;
  tokens = [];
  nextNumber = 1;
  test = await createTestDb();
  await seedOwner();
  return () => test.close();
});

afterEach(() => {
  try {
    const lines = JSON.stringify([...logSpy.mock.calls, ...errorSpy.mock.calls]);
    for (const sensitive of [EMAIL, PHONE, SECRET, "Ana María Pérez", ...tokens])
      expect(lines).not.toContain(sensitive);
    expect(lines).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    consoleOutbox.length = 0;
  }
});

it.each([null, "Bearer incorrecto", `Bearer ${"x".repeat(SECRET.length)}`, `bearer ${SECRET}`])(
  "rechaza cabeceras inválidas sin enviar ni marcar (%s)",
  async (header) => {
    const order = await seedReport();
    const transport = { send: vi.fn() };
    const response = await handleMaintenanceTask(taskRequest(header), test.db, NOW, {
      ...DEPS,
      transport,
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
    expect(transport.send).not.toHaveBeenCalled();
    expect(await sentAt(order.id)).toBeNull();
  },
);

it("rechaza GET antes de consultar configuración o enviar", async () => {
  const transport = { send: vi.fn() };
  const response = await handleMaintenanceTask(taskRequest(null, "GET"), test.db, NOW, {
    transport,
  });
  expect(response.status).toBe(405);
  expect(await response.json()).toEqual({ ok: false, error: "method_not_allowed" });
  expect(transport.send).not.toHaveBeenCalled();
  expect(errorSpy).not.toHaveBeenCalled();
});

it("rechaza un secreto sin configurar", async () => {
  const response = await handleMaintenanceTask(taskRequest(), test.db, NOW);
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ ok: false, error: "unauthorized" });
  expect(consoleOutbox).toHaveLength(0);
});

it("envía la fecha a cinco días una sola vez y marca después del envío", async () => {
  const order = await seedReport();
  vi.stubEnv("TASKS_SECRET", SECRET);
  vi.stubEnv("PUBLIC_SITE_URL", SITE_URL);
  const response = await handleMaintenanceTask(taskRequest(), test.db, NOW);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, sent: 1 });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await sentAt(order.id)).toEqual(NOW);
  expect(consoleOutbox).toHaveLength(1);
  expect(consoleOutbox[0]).toMatchObject({
    to: EMAIL,
    subject: "Se acerca la mantención de tu bicicleta · Vector Bikes",
  });
  expect(consoleOutbox[0]?.text).toContain(`Reservar hora: ${SITE_URL}/vector-bikes/reservar`);
  for (const body of [consoleOutbox[0]?.text ?? "", consoleOutbox[0]?.html ?? ""]) {
    expect(body).not.toMatch(/token/i);
    expect(body.match(/https:\/\/[^\s"<>]+/g)).toEqual([`${SITE_URL}/vector-bikes/reservar`]);
  }
  const repeated = await handleMaintenanceTask(taskRequest(), test.db, NOW);
  expect(repeated.status).toBe(200);
  expect(await repeated.json()).toEqual({ ok: true, sent: 0 });
  expect(consoleOutbox).toHaveLength(1);
});

it.each([
  ["2026-12-02", 0],
  ["2026-11-02", 1],
  ["2026-10-03", 0],
  ["2026-11-19", 1],
  ["2026-11-20", 0],
  ["2026-10-13", 1],
  ["2026-10-12", 0],
  [null, 0],
])("respeta ventana local y gracia: %s → %i", async (date, expected) => {
  const order = await seedReport(date);
  const response = await handleMaintenanceTask(taskRequest(), test.db, NOW, DEPS);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, sent: expected });
  expect(consoleOutbox).toHaveLength(expected);
  expect(await sentAt(order.id)).toEqual(expected ? NOW : null);
});

it("excluye clientes sin correo", async () => {
  const order = await seedReport("2026-11-17", null);
  const response = await handleMaintenanceTask(taskRequest(), test.db, NOW, DEPS);
  expect(await response.json()).toEqual({ ok: true, sent: 0 });
  expect(consoleOutbox).toHaveLength(0);
  expect(await sentAt(order.id)).toBeNull();
});

it("excluye órdenes anuladas", async () => {
  const order = await seedReport();
  await test.db.update(workOrders).set({ voidedAt: NOW }).where(eq(workOrders.id, order.id));
  const response = await handleMaintenanceTask(taskRequest(), test.db, NOW, DEPS);
  expect(await response.json()).toEqual({ ok: true, sent: 0 });
  expect(await sentAt(order.id)).toBeNull();
  expect(consoleOutbox).toHaveLength(0);
});

it.each([false, true])(
  "una orden posterior excluye solo si no está anulada (%s)",
  async (voided) => {
    const order = await seedReport();
    await test.db.insert(workOrders).values({
      ...order,
      id: randomUUID(),
      number: nextNumber++,
      createdAt: NOW,
      voidedAt: voided ? NOW : null,
    });
    const response = await handleMaintenanceTask(taskRequest(), test.db, NOW, DEPS);
    expect(await response.json()).toEqual({ ok: true, sent: voided ? 1 : 0 });
    expect(consoleOutbox).toHaveLength(voided ? 1 : 0);
  },
);

it("una orden anterior no excluye el informe", async () => {
  const order = await seedReport();
  await test.db.insert(workOrders).values({
    ...order,
    id: randomUUID(),
    number: nextNumber++,
    createdAt: new Date("2026-08-01T15:00:00Z"),
  });
  const response = await handleMaintenanceTask(taskRequest(), test.db, NOW, DEPS);
  expect(await response.json()).toEqual({ ok: true, sent: 1 });
});

it("un fallo no marca el informe ni registra datos del transporte", async () => {
  const order = await seedReport();
  const transport = {
    send: vi.fn(async () => {
      expect(await sentAt(order.id)).toBeNull();
      throw new Error(`${EMAIL} ${PHONE} ${SECRET} ${tokens[0]}`);
    }),
  };
  const response = await handleMaintenanceTask(taskRequest(), test.db, NOW, { ...DEPS, transport });
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ ok: false, sent: 0, failed: 1 });
  expect(await sentAt(order.id)).toBeNull();
  expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining(`"event":"email.failed","time":`),
  );
  expect(JSON.parse(errorSpy.mock.calls[0]?.[0] as string)).toMatchObject({
    kind: "maintenance",
    orderId: order.id,
  });
});

it("responde internal_error ante errores inesperados sin exponer su mensaje", async () => {
  vi.spyOn(test.db, "select").mockImplementationOnce(() => {
    throw new Error(EMAIL);
  });
  const response = await handleMaintenanceTask(taskRequest(), test.db, NOW, DEPS);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ ok: false, error: "internal_error" });
  expect(errorSpy).toHaveBeenCalledWith(
    expect.stringContaining('"event":"tasks.maintenance_failed"'),
  );
});

it.each(["2026-11-13", "2026-11-17"])(
  "envía dos informes en orden de fecha y número (%s)",
  async (date) => {
    const first = await seedReport();
    const second = await seedReport(date);
    const orderedIds = date === "2026-11-17" ? [first.id, second.id] : [second.id, first.id];
    expect((await dueMaintenanceReminders(test.db, NOW)).map((row) => row.orderId)).toEqual(
      orderedIds,
    );
    const response = await handleMaintenanceTask(taskRequest(), test.db, NOW, DEPS);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, sent: 2 });
    expect(consoleOutbox).toHaveLength(2);
    expect(consoleOutbox.map((email) => email.text.match(/Última orden: (OT-\d+)/)?.[1])).toEqual(
      date === "2026-11-17" ? ["OT-00001", "OT-00002"] : ["OT-00002", "OT-00001"],
    );
  },
);

it("continúa con el siguiente informe si falla el primero", async () => {
  const first = await seedReport("2026-11-13");
  const second = await seedReport("2026-11-17");
  const transport = {
    send: vi.fn().mockRejectedValueOnce(new Error(EMAIL)).mockResolvedValueOnce(undefined),
  };
  const response = await handleMaintenanceTask(taskRequest(), test.db, NOW, { ...DEPS, transport });
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ ok: false, sent: 1, failed: 1 });
  expect(await sentAt(first.id)).toBeNull();
  expect(await sentAt(second.id)).toEqual(NOW);
});
