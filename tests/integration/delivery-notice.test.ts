import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { getEmailEnv } from "../../src/lib/env.ts";
import { log } from "../../src/lib/log.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { auditLog, bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { consoleOutbox, createTransport } from "../../src/server/email/transport.ts";
import type { EmailTransport } from "../../src/server/email/transport.ts";
import { changeDeliveryDate } from "../../src/server/taller/delivery-notice.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-16T15:00:00.000Z");
const PREVIOUS = "2026-10-23";
const DATE = "2026-11-23";
const EMAIL = "ana@example.test";
let test: TestDb;
let owner: SessionUser;
let orderId: string;
let customerId: string;

async function actor(role: SessionUser["role"] = "owner", branchId?: string): Promise<SessionUser> {
  const [user] = await test.db
    .insert(users)
    .values({
      branchId: branchId ?? owner.branchId,
      role,
      name: "Persona de prueba",
      email: `${randomUUID()}@example.test`,
      passwordHash: "hash-de-prueba",
    })
    .returning();
  if (!user) throw new Error("Falta el usuario.");
  return { id: user.id, branchId: user.branchId, role, name: user.name, email: user.email };
}

async function seedBike() {
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: owner.branchId,
      name: "Ana Pérez",
      phoneE164: "+56912345678",
      email: EMAIL,
    })
    .returning();
  if (!customer) throw new Error("Falta el cliente.");
  customerId = customer.id;
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: owner.branchId,
      customerId,
      brand: "Trek",
      model: "Marlin",
      bikeType: "mtb",
    })
    .returning();
  if (!bike) throw new Error("Falta la bicicleta.");
  return bike;
}

async function seedOrder() {
  const bike = await seedBike();
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: owner.branchId,
      number: 1,
      customerId,
      bikeId: bike.id,
      requestedService: "Mantención general",
      createdBy: owner.id,
      status: "diagnostico",
      estimatedDeliveryDate: PREVIOUS,
    })
    .returning();
  if (!order) throw new Error("Falta la orden.");
  orderId = order.id;
}

async function storedDate() {
  const [row] = await test.db.select().from(workOrders).where(eq(workOrders.id, orderId));
  return row?.estimatedDeliveryDate;
}

async function notices() {
  return test.db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.branchId, owner.branchId),
        eq(auditLog.entityId, orderId),
        eq(auditLog.action, "notify.delivery_date_changed"),
      ),
    );
}

beforeEach(async () => {
  consoleOutbox.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Red deshabilitada.");
    }),
  );
  test = await createTestDb();
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta la sucursal.");
  owner = await actor("owner", branch.id);
  await seedOrder();
  return async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await test.close();
  };
});

it("guarda antes de enviar, avisa al cliente y al taller, y audita ambas fechas", async () => {
  const transport = createTransport();
  const send = vi.fn(async (message: Parameters<EmailTransport["send"]>[0]) => {
    expect(await storedDate()).toBe(DATE);
    await transport.send(message);
  });
  expect(
    await changeDeliveryDate(test.db, owner, orderId, DATE, NOW, { transport: { send } }),
  ).toEqual({ ok: true, notified: true });
  expect(await storedDate()).toBe(DATE);
  expect(consoleOutbox).toHaveLength(2);
  expect(consoleOutbox[0]?.to).toBe(EMAIL);
  expect(consoleOutbox[1]?.to).toBe(getEmailEnv().SHOP_NOTIFY_EMAIL);
  expect(consoleOutbox[1]?.subject).toContain("Copia · Cambiamos la fecha de entrega");
  for (const email of consoleOutbox) {
    expect(email.text).toContain("23 de octubre de 2026");
    expect(email.text).toContain("23 de noviembre de 2026");
    expect(email.text).toContain("/seguimiento/");
  }
  const [entry] = await notices();
  expect(entry?.details).toEqual({ date: DATE, previousDate: PREVIOUS });
  expect(JSON.stringify(entry?.details)).not.toContain(EMAIL);
});

it("confirmar de nuevo la misma fecha no repite el aviso", async () => {
  await changeDeliveryDate(test.db, owner, orderId, DATE, NOW);
  consoleOutbox.length = 0;
  expect(await changeDeliveryDate(test.db, owner, orderId, DATE, NOW)).toEqual({
    ok: true,
    notified: false,
  });
  expect(consoleOutbox).toHaveLength(0);
  expect(await notices()).toHaveLength(1);
});

it("volver a una fecha ya notificada tampoco repite el aviso", async () => {
  await changeDeliveryDate(test.db, owner, orderId, DATE, NOW);
  await changeDeliveryDate(test.db, owner, orderId, "2026-11-24", NOW);
  consoleOutbox.length = 0;
  expect(await changeDeliveryDate(test.db, owner, orderId, DATE, NOW)).toEqual({
    ok: true,
    notified: false,
  });
  expect(consoleOutbox).toHaveLength(0);
  expect(await notices()).toHaveLength(2);
});

it("en Creado sin recepción guarda sin aviso", async () => {
  await test.db.update(workOrders).set({ status: "creado" }).where(eq(workOrders.id, orderId));
  expect(await changeDeliveryDate(test.db, owner, orderId, DATE, NOW)).toEqual({
    ok: true,
    notified: false,
  });
  expect(await storedDate()).toBe(DATE);
  expect(consoleOutbox).toHaveLength(0);
  expect(await notices()).toHaveLength(0);
});

it.each(["entregada", "cancelada"])("rechaza el estado terminal %s", async (status) => {
  await test.db
    .update(workOrders)
    .set({ status, qcApprovedAt: NOW })
    .where(eq(workOrders.id, orderId));
  expect(await changeDeliveryDate(test.db, owner, orderId, DATE, NOW)).toEqual({
    ok: false,
    code: "invalid_status",
  });
  expect(await storedDate()).toBe(PREVIOUS);
  expect(consoleOutbox).toHaveLength(0);
});

it("el mecánico asignado puede cambiarla en reparación", async () => {
  const mechanic = await actor("mechanic");
  await test.db
    .update(workOrders)
    .set({ status: "en_progreso", assignedMechanicId: mechanic.id })
    .where(eq(workOrders.id, orderId));
  expect(await changeDeliveryDate(test.db, mechanic, orderId, DATE, NOW)).toEqual({
    ok: true,
    notified: true,
  });
  expect(await storedDate()).toBe(DATE);
});

it("el mecánico no asignado no accede a una orden en reparación", async () => {
  const mechanic = await actor("mechanic");
  await test.db.update(workOrders).set({ status: "en_progreso" }).where(eq(workOrders.id, orderId));
  expect(await changeDeliveryDate(test.db, mechanic, orderId, DATE, NOW)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(await storedDate()).toBe(PREVIOUS);
  expect(consoleOutbox).toHaveLength(0);
});

it("sin correo guarda sin enviar ni auditar un aviso", async () => {
  await test.db.update(customers).set({ email: null }).where(eq(customers.id, customerId));
  expect(await changeDeliveryDate(test.db, owner, orderId, DATE, NOW)).toEqual({
    ok: true,
    notified: false,
  });
  expect(await storedDate()).toBe(DATE);
  expect(consoleOutbox).toHaveLength(0);
  expect(await notices()).toHaveLength(0);
});

it.each(["2026-11-15", "2026-02-30", "fecha inválida"])("rechaza la fecha %s", async (date) => {
  expect(await changeDeliveryDate(test.db, owner, orderId, date, NOW)).toEqual({
    ok: false,
    code: "invalid_date",
  });
  expect(await storedDate()).toBe(PREVIOUS);
  expect(consoleOutbox).toHaveLength(0);
});

it("un fallo de transporte conserva la fecha y registra solo el identificador", async () => {
  const error = vi.spyOn(log, "error").mockImplementation(() => {});
  const transport: EmailTransport = {
    send: async () => {
      throw new Error(`Error para ${EMAIL}`);
    },
  };
  expect(await changeDeliveryDate(test.db, owner, orderId, DATE, NOW, { transport })).toEqual({
    ok: true,
    notified: false,
  });
  expect(await storedDate()).toBe(DATE);
  expect(error).toHaveBeenCalledExactlyOnceWith("email.failed", { kind: "delivery_date", orderId });
  expect(JSON.stringify(error.mock.calls)).not.toContain(EMAIL);
  expect(await notices()).toHaveLength(0);
});

it("no encuentra órdenes anuladas ni de otra sucursal", async () => {
  await test.db.update(workOrders).set({ voidedAt: NOW }).where(eq(workOrders.id, orderId));
  expect(await changeDeliveryDate(test.db, owner, orderId, DATE, NOW)).toEqual({
    ok: false,
    code: "not_found",
  });
  expect(
    await changeDeliveryDate(test.db, { ...owner, branchId: randomUUID() }, orderId, DATE, NOW),
  ).toEqual({ ok: false, code: "not_found" });
  expect(await storedDate()).toBe(PREVIOUS);
});
