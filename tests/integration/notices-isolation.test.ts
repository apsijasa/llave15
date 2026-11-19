import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { products } from "../../src/server/db/schema-inventory.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { serviceReports } from "../../src/server/db/schema-reports.ts";
import { auditLog, bikes, customers } from "../../src/server/db/schema-taller.ts";
import { consoleOutbox } from "../../src/server/email/transport.ts";
import { changeDeliveryDate } from "../../src/server/taller/delivery-notice.ts";
import { sendMaintenanceReminders } from "../../src/server/taller/maintenance-plan.ts";
import {
  OverdueDigestError,
  overdueOrders,
  sendOverdueDigest,
} from "../../src/server/taller/maintenance.ts";
import { hashShareToken } from "../../src/server/taller/share-tokens.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { insertBranchForShop } from "../helpers/shops.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const NOW = new Date("2026-11-19T15:00:00Z");
let test: TestDb;
let pair: Awaited<ReturnType<typeof seedTwoShops>>;

beforeEach(async () => {
  test = await createTestDb();
  pair = await seedTwoShops(test.db);
  consoleOutbox.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  return () => test.close();
});

afterEach(() => {
  consoleOutbox.length = 0;
  vi.restoreAllMocks();
});

async function seedOrder(actor: SessionUser, number: number, name: string) {
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: actor.branchId,
      name,
      phoneE164: "+56912345678",
      email: `${name.toLowerCase()}@example.test`,
    })
    .returning();
  if (!customer) throw new Error("Falta cliente");
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: actor.branchId,
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
      branchId: actor.branchId,
      customerId: customer.id,
      bikeId: bike.id,
      number,
      status: "recibida",
      requestedService: "Mantención",
      estimatedDeliveryDate: "2026-11-18",
      createdBy: actor.id,
    })
    .returning();
  if (!order) throw new Error("Falta orden");
  return order;
}

async function seedReminder(actor: SessionUser, number: number, name: string) {
  const order = await seedOrder(actor, number, name);
  await test.db.insert(serviceReports).values({
    branchId: actor.branchId,
    workOrderId: order.id,
    generatedAt: NOW,
    snapshot: {},
    shareTokenHash: hashShareToken(order.id),
    generatedBy: actor.id,
    nextMaintenanceDate: "2026-11-20",
    nextMaintenanceNote: "Revisar cadena",
  });
  return order;
}

async function seedProduct(actor: SessionUser, sku: string) {
  await test.db.insert(products).values({
    branchId: actor.branchId,
    createdBy: actor.id,
    sku,
    name: `Producto ${sku}`,
    category: "repuesto",
    priceClp: 2000,
    stockQty: 1,
    minStock: 2,
  });
}

it("cambia la fecha con marca, remitente, respuesta y copia del Taller Demo", async () => {
  const order = await seedOrder(pair.demo.owner, 1, "Ana");
  const other = await seedOrder(pair.vector.owner, 1, "Berta");
  expect(await changeDeliveryDate(test.db, pair.demo.owner, order.id, "2026-11-23", NOW)).toEqual({
    ok: true,
    notified: true,
  });
  expect(consoleOutbox).toHaveLength(2);
  expect(consoleOutbox[0]).toMatchObject({
    to: "ana@example.test",
    subject: "Cambiamos la fecha de entrega · OT-00001 · Taller Demo",
    from: "Taller Demo · Llave 15 <reservas@send.vectorbikes.cl>",
    replyTo: pair.demo.shop.email,
  });
  expect(consoleOutbox[1]?.to).toBe(pair.demo.shop.notifyEmail);
  for (const email of consoleOutbox) {
    expect(email.text).toContain(pair.demo.shop.addressShort);
    expect(email.text).toContain("Gestionado con Llave 15");
    expect(`${email.text}${email.html}`).not.toContain(pair.vector.shop.name);
  }
  const [untouched] = await test.db.select().from(workOrders).where(eq(workOrders.id, other.id));
  expect(untouched?.estimatedDeliveryDate).toBe("2026-11-18");
  const audits = await test.db
    .select()
    .from(auditLog)
    .where(eq(auditLog.action, "notify.delivery_date_changed"));
  expect(audits).toHaveLength(1);
  expect(audits[0]?.branchId).toBe(pair.demo.branch.id);
});

it("cada recordatorio usa la marca y el remitente de la sucursal de su orden", async () => {
  await seedReminder(pair.demo.owner, 1, "Ana");
  await seedReminder(pair.vector.owner, 1, "Berta");
  await seedReminder(pair.demo.owner, 2, "Carla");
  expect(await sendMaintenanceReminders(test.db, NOW)).toEqual({ sent: 3, failed: 0 });
  expect(consoleOutbox).toHaveLength(3);
  for (const email of consoleOutbox) {
    const shop = email.to === "berta@example.test" ? pair.vector.shop : pair.demo.shop;
    const other = shop.id === pair.demo.shop.id ? pair.vector.shop : pair.demo.shop;
    expect(email.subject).toBe(`Se acerca la mantención de tu bicicleta · ${shop.name}`);
    expect(email.from).toBe(`${shop.name} · Llave 15 <reservas@send.vectorbikes.cl>`);
    expect(email.replyTo).toBe(shop.email);
    expect(email.text).toContain(shop.addressShort);
    expect(email.text).toContain("Gestionado con Llave 15");
    expect(`${email.text}${email.html}`).not.toContain(other.name);
  }
  expect(await sendMaintenanceReminders(test.db, NOW)).toEqual({ sent: 0, failed: 0 });
});

it("resume por taller, reuniendo sus sucursales y aislando órdenes y stock", async () => {
  const branch = await insertBranchForShop(test.db, pair.vector.shop.id, "Segunda sucursal");
  const actor = { ...pair.vector.owner, branchId: branch.id };
  await seedOrder(pair.vector.owner, 1, "Ana");
  await seedOrder(actor, 2, "Berta");
  await seedOrder(pair.demo.owner, 3, "Carla");
  await seedProduct(actor, "VB-01");
  await seedProduct(pair.demo.owner, "TD-01");
  expect(await sendOverdueDigest(test.db, NOW)).toEqual({ overdue: 3, sent: true, lowStock: 2 });
  expect(consoleOutbox).toHaveLength(2);
  const vector = consoleOutbox.find((email) => email.to === pair.vector.shop.notifyEmail);
  const demo = consoleOutbox.find((email) => email.to === pair.demo.shop.notifyEmail);
  expect(vector).toMatchObject({
    subject: "Órdenes atrasadas: 2 · Vector Bikes",
    from: "Vector Bikes · Llave 15 <reservas@send.vectorbikes.cl>",
    replyTo: pair.vector.shop.email,
    text: [
      "OT-00001 · Ana · Trek Marlin · prometida 18-11-2026 (1 días)",
      "OT-00002 · Berta · Trek Marlin · prometida 18-11-2026 (1 días)",
      "Stock bajo mínimo:",
      "VB-01 · Producto VB-01 · stock 1 (mínimo 2)",
    ].join("\n"),
  });
  expect(demo).toMatchObject({
    subject: "Órdenes atrasadas: 1 · Taller Demo",
    from: "Taller Demo · Llave 15 <reservas@send.vectorbikes.cl>",
    replyTo: pair.demo.shop.email,
    text: "OT-00003 · Carla · Trek Marlin · prometida 18-11-2026 (1 días)\nStock bajo mínimo:\nTD-01 · Producto TD-01 · stock 1 (mínimo 2)",
  });
  for (const email of consoleOutbox) {
    expect(email.html).toBe(
      email.text
        .split("\n")
        .map((line) => `<p>${line}</p>`)
        .join("\n"),
    );
    expect(email.text).not.toContain("Gestionado con Llave 15");
  }
});

it("envía stock sin atrasos solo al taller que tiene productos bajo mínimo", async () => {
  await seedProduct(pair.demo.owner, "TD-01");
  expect(await sendOverdueDigest(test.db, NOW)).toEqual({ overdue: 0, sent: true, lowStock: 1 });
  expect(consoleOutbox).toHaveLength(1);
  expect(consoleOutbox[0]).toMatchObject({
    to: pair.demo.shop.notifyEmail,
    subject: "Stock bajo mínimo: 1 · Taller Demo",
    text: "Stock bajo mínimo:\nTD-01 · Producto TD-01 · stock 1 (mínimo 2)",
    html: "<p>Stock bajo mínimo:</p>\n<p>TD-01 · Producto TD-01 · stock 1 (mínimo 2)</p>",
  });
});

it("intenta los demás talleres tras un fallo y propaga el total de atrasadas", async () => {
  await seedOrder(pair.vector.owner, 1, "Ana");
  await seedOrder(pair.demo.owner, 2, "Berta");
  const failure = new Error("Fallo de transporte");
  const transport = { send: vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined) };
  const result = sendOverdueDigest(test.db, NOW, { transport });
  await expect(result).rejects.toBeInstanceOf(OverdueDigestError);
  await expect(result).rejects.toMatchObject({ overdue: 2, cause: failure });
  expect(transport.send).toHaveBeenCalledTimes(2);
  expect(new Set(transport.send.mock.calls.map(([email]) => email.to))).toEqual(
    new Set([pair.vector.shop.notifyEmail, pair.demo.shop.notifyEmail]),
  );
});

it("conserva la forma pública de overdueOrders y no agrega la sucursal", async () => {
  await seedOrder(pair.demo.owner, 1, "Ana");
  expect(await overdueOrders(test.db, NOW)).toEqual([
    {
      number: "OT-00001",
      customerName: "Ana",
      bike: "Trek Marlin",
      estimatedDeliveryDate: "2026-11-18",
      daysLate: 1,
    },
  ]);
});
