import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getEmailEnv } from "../../src/lib/env.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { intakeChecks, orderPhotos, workOrders } from "../../src/server/db/schema-orders.ts";
import { auditLog, bikes, customers } from "../../src/server/db/schema-taller.ts";
import { shops } from "../../src/server/db/schema-shops.ts";
import { consoleOutbox } from "../../src/server/email/transport.ts";
import { profileForBranch } from "../../src/server/shops/profile.ts";
import type { ObjectStorage } from "../../src/server/storage/storage.ts";
import { finalizeReception } from "../../src/server/taller/reception.ts";
import { submitQc } from "../../src/server/taller/qc.ts";
import { INTAKE_CHECK_KEYS, QC_CHECK_KEYS } from "../../src/server/taller/rules.ts";
import { createTestDb, type TestDb } from "../helpers/pglite.ts";
import { DEMO_SHOP_PROFILE, VECTOR_BIKES_PROFILE } from "../helpers/shops.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const NOW = new Date("2026-10-05T15:00:00Z");
const CUSTOMER_EMAIL = "ana@example.test";
const ENV = {
  ...getEmailEnv(),
  EMAIL_FROM: "Vector Bikes <reservas@send.vectorbikes.cl>",
  EMAIL_REPLY_TO: "legacy-reply@example.test",
  SHOP_NOTIFY_EMAIL: "legacy-copy@example.test",
};
const DEPS = { env: ENV, siteUrl: "https://example.test" };
const SIGNATURE = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64")}`;
const RECEIVED = {
  orderNumber: "OT-00001",
  customerName: "Ana Pérez",
  bike: "Trek Marlin",
  requestedService: "Mantención general",
  items: [{ description: "Ajuste de frenos", quantity: 1, unitPriceClp: 18000 }],
  accessories: ["Luz trasera"],
  estimatedDeliveryDate: "2026-10-23",
  warrantyOfNumber: null,
  trackingUrl: "https://example.test/seguimiento/prueba",
};
const READY = { ...RECEIVED, totalClp: 45000, paidClp: 20000 };

// Huellas de subject, html y text anteriores a BG-19 con el pie declarado; desde BG-49 el pie lleva el nombre del taller.
const VECTOR_BASELINE = [
  "f4b8fb9dcef20c2bb8061501ddb82a1099926bf8b6c84215bff0cbc92babc6fb",
  "ad296f4ada6a7fb0ab29a43eb270e7dd65f2cb83a4f009bdb130657194d466b6",
];

function memoryStorage(): ObjectStorage {
  const objects = new Map<string, Buffer>();
  return {
    put: async (key, body) => {
      objects.set(key, body);
    },
    get: async (key) => objects.get(key) ?? null,
    delete: async (key) => {
      objects.delete(key);
    },
    exists: async (key) => objects.has(key),
  };
}

async function seedCustomerBike(db: TestDb["db"], actor: SessionUser) {
  const [customer] = await db
    .insert(customers)
    .values({
      branchId: actor.branchId,
      name: "Ana Pérez",
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
      requestedService: RECEIVED.requestedService,
      createdBy: actor.id,
      estimatedDeliveryDate: RECEIVED.estimatedDeliveryDate,
      deliveryDateConfirmedAt: NOW,
    })
    .returning();
  if (!order) throw new Error("Falta la orden de prueba.");
  await prepareReception(db, actor, order.id);
  return order.id;
}

async function prepareReception(db: TestDb["db"], actor: SessionUser, orderId: string) {
  await db.insert(intakeChecks).values(
    INTAKE_CHECK_KEYS.map((itemKey) => ({
      branchId: actor.branchId,
      workOrderId: orderId,
      itemKey,
      result: "ok",
      createdBy: actor.id,
    })),
  );
  await db.insert(orderPhotos).values({
    branchId: actor.branchId,
    workOrderId: orderId,
    stage: "recepcion",
    retentionClass: "recepcion_6m",
    fullKey: `orders/${orderId}/photo-full.jpg`,
    thumbKey: `orders/${orderId}/photo-thumb.jpg`,
    width: 10,
    height: 10,
    createdBy: actor.id,
  });
}

function expectIdentity(profile: typeof DEMO_SHOP_PROFILE | typeof VECTOR_BIKES_PROFILE) {
  expect(consoleOutbox.map((entry) => entry.to)).toEqual([CUSTOMER_EMAIL, profile.notifyEmail]);
  for (const email of consoleOutbox) {
    expect(email.from).toBe(`${profile.name} · Llave 15 <reservas@send.vectorbikes.cl>`);
    expect(email.replyTo).toBe(profile.email);
    expect(email.subject).toContain(profile.name);
    for (const body of [email.html, email.text]) {
      expect(body).toContain(profile.addressShort);
      expect(body).toContain("Gestionado con Llave 15");
      expect(body).not.toContain(ENV.EMAIL_REPLY_TO);
      expect(body).not.toContain(ENV.SHOP_NOTIFY_EMAIL);
    }
  }
  expect(consoleOutbox[1]?.subject).toBe(`Copia · ${consoleOutbox[0]?.subject}`);
}

async function expectAudit(db: TestDb["db"], actor: SessionUser, orderId: string, action: string) {
  const audits = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.branchId, actor.branchId),
        eq(auditLog.entityId, orderId),
        eq(auditLog.action, action),
      ),
    );
  expect(audits.map((entry) => entry.details)).toEqual([{ sent: true }]);
}

function expectPickupDetails(profile: typeof DEMO_SHOP_PROFILE | typeof VECTOR_BIKES_PROFILE) {
  for (const body of [consoleOutbox[0]?.html, consoleOutbox[0]?.text]) {
    expect(body).toContain(`${profile.streetAddress}, ${profile.locality}`);
    expect(body).toContain(
      `Lunes a viernes: ${profile.receptionHours[1].open} a ${profile.receptionHours[1].close}`,
    );
    if (profile === DEMO_SHOP_PROFILE) {
      expect(body).not.toContain(VECTOR_BIKES_PROFILE.name);
      expect(body).not.toContain(VECTOR_BIKES_PROFILE.streetAddress);
      expect(body).not.toContain("15:00 a 20:00");
      expect(body).not.toContain("Certificación exclusiva Vector");
    }
  }
}

describe("correos de orden aislados por taller", () => {
  let test: TestDb;
  let seeded: Awaited<ReturnType<typeof seedTwoShops>>;
  let storage: ObjectStorage;

  beforeEach(async () => {
    consoleOutbox.length = 0;
    test = await createTestDb();
    seeded = await seedTwoShops(test.db);
    storage = memoryStorage();
    await test.db
      .update(shops)
      .set({
        logoKey: "shops/vector/logo.png",
        certifications: ["Certificación exclusiva Vector"],
      })
      .where(eq(shops.id, seeded.vector.shop.id));
    return () => test.close();
  });

  it("la recepción envía al cliente y luego copia con la identidad de su taller", async () => {
    for (const [shop, profile] of [
      [seeded.demo, DEMO_SHOP_PROFILE],
      [seeded.vector, VECTOR_BIKES_PROFILE],
    ] as const) {
      const orderId = await seedOrder(test.db, shop.owner);
      consoleOutbox.length = 0;
      const result = await finalizeReception(
        test.db,
        storage,
        shop.owner,
        {
          orderId,
          signatureDataUrl: SIGNATURE,
          signedByName: "Ana Pérez",
        },
        NOW,
        DEPS,
      );
      expect(result).toEqual({ ok: true });
      expectIdentity(profile);
      expect(consoleOutbox[0]?.subject).toBe(`Recibimos tu bicicleta · OT-00001 · ${profile.name}`);
      await expectAudit(test.db, shop.owner, orderId, "notify.received");
      if (shop === seeded.demo) {
        expect(consoleOutbox[0]?.html).not.toContain(VECTOR_BIKES_PROFILE.name);
        expect(consoleOutbox[0]?.html).not.toContain("Certificación exclusiva Vector");
        expect(consoleOutbox[0]?.html).not.toContain("/vector-bikes/logo");
      }
    }
  });

  it("el control aprobado usa la dirección y horario del taller y copia solo a él", async () => {
    for (const [shop, profile] of [
      [seeded.demo, DEMO_SHOP_PROFILE],
      [seeded.vector, VECTOR_BIKES_PROFILE],
    ] as const) {
      const orderId = await seedOrder(test.db, shop.owner);
      await test.db
        .update(workOrders)
        .set({
          status: "en_progreso",
          assignedMechanicId: shop.mechanic.id,
        })
        .where(and(eq(workOrders.branchId, shop.branch.id), eq(workOrders.id, orderId)));
      consoleOutbox.length = 0;
      const result = await submitQc(
        test.db,
        shop.owner,
        orderId,
        {
          checks: Object.fromEntries(QC_CHECK_KEYS.map((key) => [key, { result: "ok", note: "" }])),
        },
        NOW,
        DEPS,
      );
      expect(result).toEqual({ ok: true, status: "lista_para_retirar" });
      expectIdentity(profile);
      expectPickupDetails(profile);
      await expectAudit(test.db, shop.owner, orderId, "notify.ready_for_pickup");
    }
  });

  it("conserva subject, html y text de Vector Bikes salvo el pie declarado", async () => {
    const { garageBrand, receivedBikeEmail, readyForPickupEmail } = await import(
      "../../src/server/email/garage/templates.ts"
    );
    const profile = await profileForBranch(test.db, seeded.vector.branch.id);
    if (!profile) throw new Error("Falta el perfil de prueba.");
    const brand = garageBrand({ ...profile, certifications: [] });
    const emails = [receivedBikeEmail(brand, RECEIVED), readyForPickupEmail(brand, READY)];
    expect(
      emails.map((email) => createHash("sha256").update(JSON.stringify(email)).digest("hex")),
    ).toEqual(VECTOR_BASELINE);
  });
});
