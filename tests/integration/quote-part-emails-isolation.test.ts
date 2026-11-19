import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getEmailEnv } from "../../src/lib/env.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { auditLog, bikes, customers } from "../../src/server/db/schema-taller.ts";
import { quoteEmail, partAddedEmail } from "../../src/server/email/order-templates.ts";
import { consoleOutbox } from "../../src/server/email/transport.ts";
import { addPartItem } from "../../src/server/taller/items.ts";
import { notifyPartAdded } from "../../src/server/taller/part-notice.ts";
import { sendQuote } from "../../src/server/taller/quotes.ts";
import { createTestDb, type TestDb } from "../helpers/pglite.ts";
import { DEMO_SHOP_PROFILE, VECTOR_BIKES_PROFILE, vectorBikesBrand } from "../helpers/shops.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const NOW = new Date("2026-11-19T15:00:00Z");
const CUSTOMER_EMAIL = "ana@example.test";
const ENV = {
  ...getEmailEnv(),
  EMAIL_FROM: "Vector Bikes <reservas@send.vectorbikes.cl>",
  EMAIL_REPLY_TO: "legacy-reply@example.test",
  SHOP_NOTIFY_EMAIL: "legacy-copy@example.test",
};
const DEPS = { env: ENV, siteUrl: "https://example.test" };
const ITEM = { description: "Cadena", quantity: 2, unitPriceClp: 5950 };
const QUOTE = {
  orderNumber: "OT-00001",
  customerName: "Ana Pérez",
  bike: "Trek Marlin",
  items: [ITEM],
  estimatedDeliveryDate: "2026-11-20",
  trackingUrl: "https://example.test/seguimiento/prueba",
};
const PART = {
  ...QUOTE,
  item: ITEM,
  pricingMode: "final" as const,
  subtotalClp: 11900,
  vatClp: 0,
  totalClp: 11900,
};

// Huellas anteriores a BG-20: solo se agregó el pie declarado a HTML y texto.
const VECTOR_BASELINE = [
  "5ed04d61cde0d47a56b508472b827c8c7aea8b78d8786c4b57b84f681bef9ec0",
  "1380abfedb62ff00bbf49fd70632b0d0f301d7f42683875360072af99966cc4c",
];

async function seedCustomerBike(db: TestDb["db"], actor: SessionUser) {
  const [customer] = await db
    .insert(customers)
    .values({
      branchId: actor.branchId,
      name: QUOTE.customerName,
      phoneE164: "+56933334444",
      email: CUSTOMER_EMAIL,
    })
    .returning();
  if (!customer) throw new Error("Falta el cliente de prueba.");
  const [bike] = await db
    .insert(bikes)
    .values({
      branchId: actor.branchId,
      customerId: customer.id,
      brand: "Trek",
      model: "Marlin",
      bikeType: "mtb",
    })
    .returning();
  if (!bike) throw new Error("Falta la bicicleta de prueba.");
  return { customer, bike };
}

async function seedOrder(db: TestDb["db"], actor: SessionUser) {
  const { customer, bike } = await seedCustomerBike(db, actor);
  const [order] = await db
    .insert(workOrders)
    .values({
      branchId: actor.branchId,
      number: 1,
      customerId: customer.id,
      bikeId: bike.id,
      status: "diagnostico",
      requestedService: "Revisión general",
      createdBy: actor.id,
      estimatedDeliveryDate: QUOTE.estimatedDeliveryDate,
    })
    .returning();
  if (!order) throw new Error("Falta la orden de prueba.");
  const item = await addPartItem(db, actor, order.id, PART.item, NOW);
  if (!item.ok) throw new Error("Falta el repuesto de prueba.");
  expect(consoleOutbox).toHaveLength(0);
  return { orderId: order.id, itemId: item.itemId };
}

function expectIdentity(profile: typeof DEMO_SHOP_PROFILE | typeof VECTOR_BIKES_PROFILE) {
  const other = profile === DEMO_SHOP_PROFILE ? VECTOR_BIKES_PROFILE : DEMO_SHOP_PROFILE;
  expect(consoleOutbox.map((email) => email.to)).toEqual([CUSTOMER_EMAIL, profile.notifyEmail]);
  for (const email of consoleOutbox) {
    expect(email.from).toBe(`${profile.name} · Llave 15 <reservas@send.vectorbikes.cl>`);
    expect(email.replyTo).toBe(profile.email);
    expect(email.subject).toContain(profile.name);
    expect(email.subject).not.toContain(other.name);
    for (const body of [email.html, email.text]) {
      expect(body).toContain(profile.name);
      expect(body).toContain(profile.addressShort);
      expect(body).toContain(profile.email);
      expect(body).toContain("Gestionado con Llave 15");
      expect(body).toContain("Cadena");
      expect(body).toContain("2 × $5.950");
      expect(body).not.toContain(other.name);
      expect(body).not.toContain(other.addressShort);
      expect(body).not.toContain(other.email);
      expect(body).not.toContain(`/${other.slug}/logo`);
      expect(body).not.toContain(ENV.EMAIL_REPLY_TO);
      expect(body).not.toContain(ENV.SHOP_NOTIFY_EMAIL);
      expect(body).not.toMatch(/costo|margen|cost_clp|unit_cost_clp|fee_clp|net_clp/i);
    }
  }
  expect(consoleOutbox[1]?.subject).toBe(`Copia · ${consoleOutbox[0]?.subject}`);
}

async function expectAudit(db: TestDb["db"], actor: SessionUser, orderId: string, action: string) {
  const rows = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.branchId, actor.branchId),
        eq(auditLog.entityId, orderId),
        eq(auditLog.action, action),
      ),
    );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ actorUserId: actor.id, createdAt: NOW });
  return rows[0]?.details;
}

describe("cotización y aviso de repuesto aislados por taller", () => {
  let test: TestDb;
  let seeded: Awaited<ReturnType<typeof seedTwoShops>>;

  beforeEach(async () => {
    consoleOutbox.length = 0;
    test = await createTestDb();
    seeded = await seedTwoShops(test.db);
    return () => test.close();
  });

  it("envía la cotización al cliente y luego copia con la identidad de cada taller", async () => {
    for (const [shop, profile] of [
      [seeded.demo, DEMO_SHOP_PROFILE],
      [seeded.vector, VECTOR_BIKES_PROFILE],
    ] as const) {
      consoleOutbox.length = 0;
      const { orderId } = await seedOrder(test.db, shop.owner);
      const other = shop === seeded.demo ? seeded.vector : seeded.demo;
      expect(await sendQuote(test.db, other.owner, orderId, NOW, DEPS)).toEqual({
        ok: false,
        code: "not_found",
      });
      expect(consoleOutbox).toHaveLength(0);
      expect(await sendQuote(test.db, shop.owner, orderId, NOW, DEPS)).toEqual({
        ok: true,
        totalClp: 11900,
      });
      expectIdentity(profile);
      expect(consoleOutbox[0]?.subject).toBe(`Cotización · OT-00001 · ${profile.name}`);
      expect(await expectAudit(test.db, shop.owner, orderId, "notify.quote_sent")).toEqual({
        totalClp: 11900,
        items: QUOTE.items,
      });
    }
  });

  it("avisa del repuesto con la marca y el pie de su taller sin cruzar órdenes", async () => {
    for (const [shop, profile] of [
      [seeded.demo, DEMO_SHOP_PROFILE],
      [seeded.vector, VECTOR_BIKES_PROFILE],
    ] as const) {
      consoleOutbox.length = 0;
      const { orderId, itemId } = await seedOrder(test.db, shop.owner);
      const other = shop === seeded.demo ? seeded.vector : seeded.demo;
      expect(await notifyPartAdded(test.db, other.owner, orderId, itemId, NOW, DEPS)).toBe(false);
      expect(consoleOutbox).toHaveLength(0);
      expect(await notifyPartAdded(test.db, shop.owner, orderId, itemId, NOW, DEPS)).toBe(true);
      expectIdentity(profile);
      expect(consoleOutbox[0]?.subject).toBe(
        `Agregamos un repuesto a tu orden · OT-00001 · ${profile.name}`,
      );
      expect(await expectAudit(test.db, shop.owner, orderId, "notify.part_added")).toEqual({
        itemId,
        totalClp: 11900,
      });
    }
  });

  it("conserva subject, html y text de Vector Bikes salvo el pie declarado", () => {
    const brand = vectorBikesBrand();
    const emails = [quoteEmail(brand, QUOTE), partAddedEmail(brand, PART)];
    expect(
      emails.map((email) => createHash("sha256").update(JSON.stringify(email)).digest("hex")),
    ).toEqual(VECTOR_BASELINE);
  });
});
