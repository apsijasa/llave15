import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { log } from "../../src/lib/log.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { intakeChecks, orderPhotos, workOrders } from "../../src/server/db/schema-orders.ts";
import { orderTrackingTokens } from "../../src/server/db/schema-reports.ts";
import { auditLog, bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import type { NotifyDeps } from "../../src/server/email/notifications.ts";
import { consoleOutbox, createTransport } from "../../src/server/email/transport.ts";
import { createLocalStorage } from "../../src/server/storage/storage.ts";
import type { ObjectStorage } from "../../src/server/storage/storage.ts";
import { qcFormSchema, submitQc } from "../../src/server/taller/qc.ts";
import { finalizeReception } from "../../src/server/taller/reception.ts";
import { INTAKE_CHECK_KEYS, QC_CHECK_KEYS } from "../../src/server/taller/rules.ts";
import { hashShareToken } from "../../src/server/taller/share-tokens.ts";
import * as tracking from "../../src/server/taller/tracking.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-12T15:00:00Z");
const SITE_URL = "https://vectorbikes.cl";
const CUSTOMER_EMAIL = "ana@example.test";
const PHONE = "+56912345678";
const SIGNER = "Ana Pérez";
let test: TestDb;
let owner: SessionUser;
let orderId: string;
let storage: ObjectStorage;
let dir: string;
let signatureDataUrl: string;
let deps: NotifyDeps;
let tokens: string[];

async function seedOwner() {
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta la sucursal.");
  const [user] = await test.db
    .insert(users)
    .values({
      branchId: branch.id,
      role: "owner",
      name: "Dueña",
      email: "owner@example.test",
      passwordHash: "hash-de-prueba",
    })
    .returning();
  if (!user) throw new Error("Falta el usuario.");
  owner = { id: user.id, branchId: branch.id, role: "owner", name: user.name, email: user.email };
}

async function seedOrder() {
  const [customer] = await test.db
    .insert(customers)
    .values({ branchId: owner.branchId, name: SIGNER, phoneE164: PHONE, email: CUSTOMER_EMAIL })
    .returning();
  if (!customer) throw new Error("Falta el cliente.");
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
  if (!bike) throw new Error("Falta la bicicleta.");
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: owner.branchId,
      number: 1,
      customerId: customer.id,
      bikeId: bike.id,
      requestedService: "Mantención general",
      estimatedDeliveryDate: "2026-11-14",
      deliveryDateConfirmedAt: NOW,
      createdBy: owner.id,
    })
    .returning();
  if (!order) throw new Error("Falta la orden.");
  orderId = order.id;
  tokens.push(tracking.trackingTokenFor(orderId));
}

async function prepareReception() {
  await test.db.insert(intakeChecks).values(
    INTAKE_CHECK_KEYS.map((itemKey) => ({
      branchId: owner.branchId,
      workOrderId: orderId,
      itemKey,
      result: "ok",
      createdBy: owner.id,
    })),
  );
  await test.db.insert(orderPhotos).values({
    branchId: owner.branchId,
    workOrderId: orderId,
    stage: "recepcion",
    retentionClass: "recepcion_6m",
    fullKey: `orders/${orderId}/${randomUUID()}-full.jpg`,
    thumbKey: `orders/${orderId}/${randomUUID()}-thumb.jpg`,
    width: 10,
    height: 10,
    createdBy: owner.id,
  });
}

async function receive() {
  await prepareReception();
  return finalizeReception(
    test.db,
    storage,
    owner,
    { orderId, signatureDataUrl, signedByName: SIGNER },
    NOW,
    deps,
  );
}

async function approveQc() {
  await test.db
    .update(workOrders)
    .set({ status: "control_calidad" })
    .where(eq(workOrders.id, orderId));
  const input = qcFormSchema.parse({
    checks: Object.fromEntries(QC_CHECK_KEYS.map((key) => [key, { result: "ok", note: "" }])),
  });
  return submitQc(test.db, owner, orderId, input, NOW, deps);
}

async function tokenRows() {
  return test.db
    .select()
    .from(orderTrackingTokens)
    .where(
      and(
        eq(orderTrackingTokens.branchId, owner.branchId),
        eq(orderTrackingTokens.workOrderId, orderId),
      ),
    );
}

async function expectTrackingMessages(action: string) {
  expect(consoleOutbox).toHaveLength(2);
  const [customer, copy] = consoleOutbox;
  expect(customer?.to).toBe(CUSTOMER_EMAIL);
  expect(copy?.to).toBe("info@vectorbikes.cl");
  const url = customer?.text.match(/Ver el estado de tu bicicleta: (\S+)/)?.[1];
  expect(url ?? "").toMatch(/^https:\/\/vectorbikes\.cl\/seguimiento\/[A-Za-z0-9_-]{43}$/);
  if (!url) throw new Error("Falta el enlace de seguimiento.");
  const token = url.split("/").at(-1);
  if (!token) throw new Error("Falta el token.");
  tokens.push(token);
  for (const email of consoleOutbox) {
    expect(email.text).toContain(`/seguimiento/${token}`);
    expect(email.html).toContain(`href="${url}"`);
  }
  const rows = await tokenRows();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    branchId: owner.branchId,
    workOrderId: orderId,
    tokenHash: hashShareToken(token),
    createdAt: NOW,
  });
  expect(JSON.stringify(rows)).not.toContain(token);
  expect(
    await test.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, orderId), eq(auditLog.action, action))),
  ).toHaveLength(1);
  return { url, row: rows[0] };
}

beforeEach(async () => {
  consoleOutbox.length = 0;
  tokens = [];
  for (const level of ["info", "warn", "error"] as const)
    vi.spyOn(log, level).mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Red deshabilitada en tests")));
  deps = { transport: createTransport(), siteUrl: SITE_URL };
  test = await createTestDb();
  dir = mkdtempSync(join(tmpdir(), "vector-seguimiento-correo-"));
  storage = createLocalStorage(dir);
  await seedOwner();
  await seedOrder();
  const png = await sharp({
    create: { width: 10, height: 10, channels: 4, background: "black" },
  })
    .png()
    .toBuffer();
  signatureDataUrl = `data:image/png;base64,${png.toString("base64")}`;
});

afterEach(async () => {
  try {
    for (const level of ["info", "warn", "error"] as const) {
      const calls = JSON.stringify(vi.mocked(log[level]).mock.calls);
      for (const secret of [CUSTOMER_EMAIL, PHONE, ...tokens]) expect(calls).not.toContain(secret);
    }
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (dir) rmSync(dir, { recursive: true, force: true });
    await test?.close();
  }
});

it("finalizar la recepción crea el hash y envía el enlace al cliente y al taller", async () => {
  expect(await tokenRows()).toHaveLength(0);
  expect(await receive()).toEqual({ ok: true });
  await expectTrackingMessages("notify.received");
});

it("aprobar los siete puntos del control crea el hash y envía ambos correos", async () => {
  expect(QC_CHECK_KEYS).toHaveLength(7);
  expect(await approveQc()).toEqual({ ok: true, status: "lista_para_retirar" });
  await expectTrackingMessages("notify.ready_for_pickup");
});

it("el control reutiliza la misma fila y URL que creó la recepción", async () => {
  expect(await receive()).toEqual({ ok: true });
  const received = await expectTrackingMessages("notify.received");
  consoleOutbox.length = 0;

  expect(await approveQc()).toEqual({ ok: true, status: "lista_para_retirar" });
  const ready = await expectTrackingMessages("notify.ready_for_pickup");
  expect(ready).toEqual(received);
});

it.each(["recepción", "control"])("sin correo no crea tokens ni envíos en %s", async (flow) => {
  await test.db
    .update(customers)
    .set({ email: null })
    .where(eq(customers.branchId, owner.branchId));

  expect((await (flow === "recepción" ? receive() : approveQc())).ok).toBe(true);
  expect(consoleOutbox).toHaveLength(0);
  expect(await test.db.select().from(orderTrackingTokens)).toHaveLength(0);
});

it.each(["recepción", "control"])(
  "si no obtiene el enlace, %s envía el aviso igual",
  async (flow) => {
    const ensure = vi.spyOn(tracking, "ensureTrackingLink").mockResolvedValue({
      ok: false,
      code: "forbidden",
    });

    expect((await (flow === "recepción" ? receive() : approveQc())).ok).toBe(true);
    expect(ensure).toHaveBeenCalledWith(test.db, owner, orderId, SITE_URL, NOW);
    expect(consoleOutbox).toHaveLength(2);
    for (const email of consoleOutbox) {
      expect(email.text).not.toContain("/seguimiento/");
      expect(email.html).not.toContain("/seguimiento/");
    }
    expect(await tokenRows()).toHaveLength(0);
  },
);
