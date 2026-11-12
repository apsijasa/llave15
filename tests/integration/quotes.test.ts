import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { log } from "../../src/lib/log.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import {
  auditLog,
  bikes,
  customers,
  servicePrices,
  services,
} from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { consoleOutbox, createTransport } from "../../src/server/email/transport.ts";
import { addCatalogItem, addPartItem, listItems, voidItem } from "../../src/server/taller/items.ts";
import { lastQuote, sendQuote } from "../../src/server/taller/quotes.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-12T15:00:00.000Z");
const LATER = new Date("2026-11-12T15:01:00.000Z");
const EMAIL = "ana@example.test";
const PHONE = "+56912345678";
const RUT = "12.345.678-5";
let test: TestDb;
let owner: SessionUser;
let orderId: string;
let customerId: string;

async function seedOrder() {
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: owner.branchId,
      name: "Ana María Pérez",
      email: EMAIL,
      phoneE164: PHONE,
      rut: RUT,
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
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: owner.branchId,
      number: 1,
      customerId,
      bikeId: bike.id,
      status: "diagnostico",
      requestedService: "Mantención",
      createdBy: owner.id,
      estimatedDeliveryDate: "2026-11-16",
    })
    .returning();
  if (!order) throw new Error("Falta la orden.");
  orderId = order.id;
}

async function addLines() {
  const [service] = await test.db
    .insert(services)
    .values({
      branchId: owner.branchId,
      name: "Ajuste de frenos",
      estimatedMinutes: 45,
    })
    .returning();
  if (!service) throw new Error("Falta el servicio.");
  await test.db.insert(servicePrices).values({
    branchId: owner.branchId,
    serviceId: service.id,
    bikeType: "mtb",
    priceClp: 12000,
  });
  expect(
    await addCatalogItem(test.db, owner, orderId, { serviceId: service.id, quantity: 2 }, NOW),
  ).toMatchObject({ ok: true });
  expect(
    await addPartItem(
      test.db,
      owner,
      orderId,
      { description: "Cadena", quantity: 1, unitPriceClp: 18000 },
      NOW,
    ),
  ).toMatchObject({ ok: true });
}

function audits() {
  return test.db.select().from(auditLog).where(eq(auditLog.action, "notify.quote_sent"));
}

function expectQuoteMessages() {
  expect(consoleOutbox).toHaveLength(2);
  expect(consoleOutbox[0]).toMatchObject({
    to: EMAIL,
    subject: "Cotización · OT-00001 · Vector Bikes",
  });
  expect(consoleOutbox[0]?.text).toContain("Ajuste de frenos: 2 × $12.000");
  expect(consoleOutbox[0]?.text).toContain("Cadena: 1 × $18.000");
  expect(consoleOutbox[0]?.text).toContain(
    "Ver el estado de tu bicicleta: https://vectorbikes.cl/seguimiento/",
  );
  expect(consoleOutbox[1]).toMatchObject({
    to: "info@vectorbikes.cl",
    subject: "Copia · Cotización · OT-00001 · Vector Bikes",
  });
}

beforeEach(async () => {
  consoleOutbox.length = 0;
  for (const level of ["info", "warn", "error"] as const)
    vi.spyOn(log, level).mockImplementation(() => {});
  test = await createTestDb();
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta la sucursal.");
  const [user] = await test.db
    .insert(users)
    .values({
      branchId: branch.id,
      role: "owner",
      name: "Dueña",
      email: "owner@example.test",
      passwordHash: "hash",
    })
    .returning();
  if (!user) throw new Error("Falta la dueña.");
  owner = { id: user.id, branchId: branch.id, role: "owner", name: user.name, email: user.email };
  await seedOrder();
  return async () => test.close();
});

afterEach(() => {
  try {
    for (const level of ["info", "warn", "error"] as const) {
      const output = JSON.stringify(vi.mocked(log[level]).mock.calls);
      for (const secret of [EMAIL, PHONE, RUT]) expect(output).not.toContain(secret);
    }
  } finally {
    vi.restoreAllMocks();
    consoleOutbox.length = 0;
  }
});

it("envía las dos líneas al cliente y copia al taller, luego audita fecha y total", async () => {
  await addLines();
  const transaction = vi.spyOn(test.db, "transaction");
  const transport = createTransport();
  const send = vi.spyOn(transport, "send").mockImplementation(async (message) => {
    expect(await audits()).toEqual([]);
    expect(transaction).not.toHaveBeenCalled();
    expect(await listItems(test.db, owner, orderId)).toHaveLength(2);
    await createTransport().send(message);
  });
  expect(await sendQuote(test.db, owner, orderId, NOW, { transport })).toEqual({
    ok: true,
    totalClp: 42000,
  });
  expect(send).toHaveBeenCalledTimes(2);
  expectQuoteMessages();
  expect(await audits()).toMatchObject([
    {
      branchId: owner.branchId,
      actorUserId: owner.id,
      entity: "work_order",
      entityId: orderId,
      createdAt: NOW,
      details: { totalClp: 42000, items: expect.any(Array) },
    },
  ]);
  expect((await audits())[0]?.details.items).toHaveLength(2);
  expect(await lastQuote(test.db, owner, orderId)).toEqual({ at: NOW, totalClp: 42000 });
  expect((await test.db.select().from(workOrders))[0]?.status).toBe("diagnostico");
});

it("rechaza una orden cuyas líneas fueron anuladas", async () => {
  await addLines();
  for (const item of await listItems(test.db, owner, orderId))
    expect(await voidItem(test.db, owner, item.id, NOW)).toEqual({ ok: true });
  expect(await sendQuote(test.db, owner, orderId, NOW)).toEqual({ ok: false, code: "no_items" });
  expect(consoleOutbox).toEqual([]);
  expect(await audits()).toEqual([]);
  expect(await lastQuote(test.db, owner, orderId)).toBeNull();
});

it("rechaza al cliente sin correo", async () => {
  await addLines();
  await test.db.update(customers).set({ email: null }).where(eq(customers.id, customerId));
  expect(await sendQuote(test.db, owner, orderId, NOW)).toEqual({ ok: false, code: "no_email" });
  expect(consoleOutbox).toEqual([]);
  expect(await audits()).toEqual([]);
});

it("rechaza al mecánico sin escribir filas", async () => {
  await addLines();
  const before = await test.db.select().from(auditLog);
  const mechanic = { ...owner, role: "mechanic" } as const;
  expect(await sendQuote(test.db, mechanic, orderId, NOW)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(await lastQuote(test.db, mechanic, orderId)).toBeNull();
  expect(await test.db.select().from(auditLog)).toEqual(before);
  expect(consoleOutbox).toEqual([]);
});

it.each(["entregada", "cancelada", "trabajo_rechazado"])(
  "rechaza el estado terminal %s",
  async (status) => {
    await test.db
      .update(workOrders)
      .set({ status, qcApprovedAt: NOW })
      .where(eq(workOrders.id, orderId));
    expect(await sendQuote(test.db, owner, orderId, NOW)).toEqual({
      ok: false,
      code: "invalid_status",
    });
    expect(consoleOutbox).toEqual([]);
    expect(await audits()).toEqual([]);
  },
);

it("rechaza órdenes inexistentes, anuladas y de otra sucursal", async () => {
  expect(await sendQuote(test.db, owner, randomUUID(), NOW)).toEqual({
    ok: false,
    code: "not_found",
  });
  expect(await sendQuote(test.db, { ...owner, branchId: randomUUID() }, orderId, NOW)).toEqual({
    ok: false,
    code: "not_found",
  });
  await test.db.update(workOrders).set({ voidedAt: NOW }).where(eq(workOrders.id, orderId));
  expect(await sendQuote(test.db, owner, orderId, NOW)).toEqual({ ok: false, code: "not_found" });
  expect(consoleOutbox).toEqual([]);
  expect(await audits()).toEqual([]);
});

it("devuelve send_failed sin auditoría ni PII del error del transporte", async () => {
  await addLines();
  const send = vi.fn(async () => {
    throw new Error(`${EMAIL} ${PHONE} ${RUT}`);
  });
  expect(await sendQuote(test.db, owner, orderId, NOW, { transport: { send } })).toEqual({
    ok: false,
    code: "send_failed",
  });
  expect(send).toHaveBeenCalledTimes(1);
  expect(await audits()).toEqual([]);
  expect(log.error).toHaveBeenCalledWith("email.failed", { kind: "quote", orderId });
});

it("conserva el envío y su auditoría si falla la copia, sin PII en logs", async () => {
  await addLines();
  const send = vi
    .fn(async () => {})
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error(`${EMAIL} ${PHONE} ${RUT}`));
  expect(await sendQuote(test.db, owner, orderId, NOW, { transport: { send } })).toEqual({
    ok: true,
    totalClp: 42000,
  });
  expect(send).toHaveBeenCalledTimes(2);
  expect(await audits()).toHaveLength(1);
  expect(log.error).toHaveBeenCalledWith(
    "email.shop_copy_failed",
    expect.objectContaining({ code: "OT-00001" }),
  );
});

it("reenvía con las líneas nuevas y devuelve la última cotización de su sucursal", async () => {
  await addLines();
  expect(await sendQuote(test.db, owner, orderId, NOW)).toEqual({ ok: true, totalClp: 42000 });
  expect(
    await addPartItem(
      test.db,
      owner,
      orderId,
      { description: "Cable", quantity: 1, unitPriceClp: 5000 },
      LATER,
    ),
  ).toMatchObject({ ok: true });
  expect(await sendQuote(test.db, owner, orderId, LATER)).toEqual({ ok: true, totalClp: 47000 });
  expect((await audits()).map((row) => row.details.totalClp).sort()).toEqual([42000, 47000]);
  expect(consoleOutbox).toHaveLength(4);
  expect(await lastQuote(test.db, owner, orderId)).toEqual({ at: LATER, totalClp: 47000 });
  expect(await lastQuote(test.db, { ...owner, branchId: randomUUID() }, orderId)).toBeNull();
});
