import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { getEmailEnv } from "../../src/lib/env.ts";
import { log } from "../../src/lib/log.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { products } from "../../src/server/db/schema-inventory.ts";
import { workOrderItems, workOrders } from "../../src/server/db/schema-orders.ts";
import { auditLog, bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { consoleOutbox, createTransport } from "../../src/server/email/transport.ts";
import type { EmailTransport } from "../../src/server/email/transport.ts";
import { addPartItem, voidItem } from "../../src/server/taller/items.ts";
import { notifyPartAdded } from "../../src/server/taller/part-notice.ts";
import { addProductPartItem } from "../../src/server/taller/part-stock.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-16T15:00:00Z");
const EMAIL = "ana@example.test";
let test: TestDb;
let owner: SessionUser;
let orderId: string;
let customerId: string;
let bikeId: string;

async function seedCustomer() {
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
  bikeId = bike.id;
}

async function seedOrder(number = 1) {
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: owner.branchId,
      customerId,
      bikeId,
      number,
      status: "diagnostico",
      requestedService: "Revisión general",
      createdBy: owner.id,
    })
    .returning();
  if (!order) throw new Error("Falta la orden.");
  return order.id;
}

async function add(order = orderId, unitPriceClp = 5950) {
  const result = await addPartItem(
    test.db,
    owner,
    order,
    {
      description: "Pastillas de freno",
      quantity: 2,
      unitPriceClp,
    },
    NOW,
  );
  if (!result.ok) throw new Error("No se agregó el repuesto.");
  return result.itemId;
}

async function notices() {
  return test.db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.branchId, owner.branchId),
        eq(auditLog.entityId, orderId),
        eq(auditLog.action, "notify.part_added"),
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
  const [user] = await test.db
    .insert(users)
    .values({
      branchId: branch.id,
      role: "owner",
      name: "Personal de prueba",
      email: "owner@example.test",
      passwordHash: "hash-de-prueba",
    })
    .returning();
  if (!user) throw new Error("Falta el usuario.");
  owner = { ...user, role: "owner" };
  await seedCustomer();
  orderId = await seedOrder();
  return async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await test.close();
  };
});

it("avisa después de guardar, copia al taller y audita la línea y el total de toda la orden", async () => {
  await add(orderId, 500);
  const itemId = await add();
  expect(consoleOutbox).toHaveLength(0);
  const transport = createTransport();
  const send = vi.fn(async (message: Parameters<EmailTransport["send"]>[0]) => {
    const [item] = await test.db.select().from(workOrderItems).where(eq(workOrderItems.id, itemId));
    const [order] = await test.db.select().from(workOrders).where(eq(workOrders.id, orderId));
    expect(item?.voidedAt).toBeNull();
    expect(order?.totalClp).toBe(12900);
    await transport.send(message);
  });
  expect(await notifyPartAdded(test.db, owner, orderId, itemId, NOW, { transport: { send } })).toBe(
    true,
  );
  expect(consoleOutbox).toHaveLength(2);
  expect(consoleOutbox[0]?.to).toBe(EMAIL);
  expect(consoleOutbox[1]?.to).toBe(getEmailEnv().SHOP_NOTIFY_EMAIL);
  expect(consoleOutbox[1]?.subject).toContain("Copia · Agregamos un repuesto a tu orden");
  for (const email of consoleOutbox) {
    expect(email.text).toContain("Pastillas de freno: 2 × $5.950");
    expect(email.text).toContain("Nuevo total: $12.900");
    expect(email.text).toContain("/seguimiento/");
  }
  const [audit] = await notices();
  expect(audit).toMatchObject({ actorUserId: owner.id, entity: "work_order", createdAt: NOW });
  expect(audit?.details).toEqual({ itemId, totalClp: 12900 });
});

it("el repuesto del inventario avisa con el precio cobrado y omite el costo conocido", async () => {
  const [product] = await test.db
    .insert(products)
    .values({
      branchId: owner.branchId,
      sku: "PAST-01",
      name: "Pastillas del inventario",
      category: "repuesto",
      stockQty: 5,
      costClp: 2347,
      priceClp: 5000,
      createdBy: owner.id,
    })
    .returning();
  if (!product) throw new Error("Falta el producto.");
  const result = await addProductPartItem(
    test.db,
    owner,
    orderId,
    { productId: product.id, quantity: 2 },
    NOW,
  );
  if (!result.ok) throw new Error("No se agregó el repuesto.");
  expect(consoleOutbox).toHaveLength(0);
  expect(await notifyPartAdded(test.db, owner, orderId, result.itemId, NOW)).toBe(true);
  expect(consoleOutbox).toHaveLength(2);
  for (const email of consoleOutbox) {
    expect(email.text).toContain("Pastillas del inventario: 2 × $5.950");
    expect(`${email.text} ${email.html}`).not.toMatch(
      /costo|margen|unit_cost_clp|cost_clp|2347|2\.347/i,
    );
  }
});

it("usa los montos netos de la orden para Neto, IVA y Total", async () => {
  await test.db.update(workOrders).set({ pricingMode: "neto" }).where(eq(workOrders.id, orderId));
  const itemId = await add();
  expect(await notifyPartAdded(test.db, owner, orderId, itemId, NOW)).toBe(true);
  const [order] = await test.db.select().from(workOrders).where(eq(workOrders.id, orderId));
  expect(order).toMatchObject({ subtotalClp: 11900, vatClp: 2261, totalClp: 14161 });
  for (const email of consoleOutbox) {
    expect(email.text).toContain("Neto: $11.900\nIVA (19%): $2.261\nTotal: $14.161");
    expect(email.text).not.toMatch(/costo/i);
  }
});

it.each(["reservada", "cancelada", "trabajo_rechazado", "entregada"])(
  "no avisa en %s",
  async (status) => {
    const itemId = await add();
    await test.db
      .update(workOrders)
      .set({ status, qcApprovedAt: NOW, paidClp: 11900 })
      .where(eq(workOrders.id, orderId));
    expect(await notifyPartAdded(test.db, owner, orderId, itemId, NOW)).toBe(false);
    expect(consoleOutbox).toHaveLength(0);
    expect(await notices()).toHaveLength(0);
  },
);

it("no avisa sin correo del cliente", async () => {
  const itemId = await add();
  await test.db.update(customers).set({ email: null }).where(eq(customers.id, customerId));
  expect(await notifyPartAdded(test.db, owner, orderId, itemId, NOW)).toBe(false);
  expect(consoleOutbox).toHaveLength(0);
  expect(await notices()).toHaveLength(0);
});

it("un fallo del transporte conserva la línea y no registra datos personales", async () => {
  const itemId = await add();
  const error = vi.spyOn(log, "error").mockImplementation(() => {});
  const transport: EmailTransport = {
    send: async () => {
      throw new Error(`Error para ${EMAIL}`);
    },
  };
  expect(await notifyPartAdded(test.db, owner, orderId, itemId, NOW, { transport })).toBe(false);
  const [item] = await test.db.select().from(workOrderItems).where(eq(workOrderItems.id, itemId));
  expect(item).toMatchObject({ id: itemId, voidedAt: null });
  expect(error).toHaveBeenCalledExactlyOnceWith("email.failed", { kind: "part_added", orderId });
  expect(JSON.stringify(error.mock.calls)).not.toContain(EMAIL);
  expect(await notices()).toHaveLength(0);
});

it("un fallo de la copia no cambia el envío al cliente ni filtra datos en logs", async () => {
  const itemId = await add();
  const error = vi.spyOn(log, "error").mockImplementation(() => {});
  const transport = createTransport();
  const send = vi.fn(async (message: Parameters<EmailTransport["send"]>[0]) => {
    if (message.to !== EMAIL) throw new Error(`Error para ${EMAIL}`);
    await transport.send(message);
  });
  expect(await notifyPartAdded(test.db, owner, orderId, itemId, NOW, { transport: { send } })).toBe(
    true,
  );
  expect(consoleOutbox).toHaveLength(1);
  expect(await notices()).toHaveLength(1);
  expect(error).toHaveBeenCalledOnce();
  expect(JSON.stringify(error.mock.calls)).not.toContain(EMAIL);
});

it("rechaza líneas ajenas a la orden o a la sucursal, anuladas y servicios", async () => {
  const otherOrder = await seedOrder(2);
  const otherItem = await add(otherOrder);
  expect(await notifyPartAdded(test.db, owner, orderId, otherItem, NOW)).toBe(false);
  const itemId = await add();
  expect(
    await notifyPartAdded(test.db, { ...owner, branchId: randomUUID() }, orderId, itemId, NOW),
  ).toBe(false);
  await test.db
    .update(workOrderItems)
    .set({ kind: "servicio" })
    .where(eq(workOrderItems.id, itemId));
  expect(await notifyPartAdded(test.db, owner, orderId, itemId, NOW)).toBe(false);
  await test.db
    .update(workOrderItems)
    .set({ kind: "repuesto" })
    .where(eq(workOrderItems.id, itemId));
  await voidItem(test.db, owner, itemId, NOW);
  expect(await notifyPartAdded(test.db, owner, orderId, itemId, NOW)).toBe(false);
  expect(consoleOutbox).toHaveLength(0);
});

it("nunca lanza si falla una lectura", async () => {
  const itemId = await add();
  vi.spyOn(log, "error").mockImplementation(() => {});
  vi.spyOn(test.db, "select").mockImplementationOnce(() => {
    throw new Error(EMAIL);
  });
  expect(await notifyPartAdded(test.db, owner, orderId, itemId, NOW)).toBe(false);
});
