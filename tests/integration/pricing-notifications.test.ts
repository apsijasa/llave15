import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { intakeChecks, orderPhotos, workOrders } from "../../src/server/db/schema-orders.ts";
import { auditLog, bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { consoleOutbox } from "../../src/server/email/transport.ts";
import { createLocalStorage } from "../../src/server/storage/storage.ts";
import { addPartItem } from "../../src/server/taller/items.ts";
import { qcFormSchema, submitQc } from "../../src/server/taller/qc.ts";
import { lastQuote, sendQuote } from "../../src/server/taller/quotes.ts";
import { finalizeReception } from "../../src/server/taller/reception.ts";
import { INTAKE_CHECK_KEYS, QC_CHECK_KEYS } from "../../src/server/taller/rules.ts";
import type { PricingMode } from "../../src/server/taller/rules.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-14T15:00:00.000Z");
const CUSTOMER_EMAIL = "ana@example.test";
let test: TestDb;
let owner: SessionUser;
let mechanic: SessionUser;
let dir: string;

async function createUser(branchId: string, role: "owner" | "mechanic"): Promise<SessionUser> {
  const [user] = await test.db
    .insert(users)
    .values({ branchId, role, name: role, email: `${role}@example.test`, passwordHash: "hash" })
    .returning();
  if (!user) throw new Error("Falta el usuario de prueba.");
  return { id: user.id, branchId, role, name: user.name, email: user.email };
}

async function createOrder(pricingMode: PricingMode) {
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: owner.branchId,
      name: "Ana Pérez",
      phoneE164: "+56912345678",
      email: CUSTOMER_EMAIL,
    })
    .returning();
  if (!customer) throw new Error("Falta el cliente de prueba.");
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
  if (!bike) throw new Error("Falta la bicicleta de prueba.");
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: owner.branchId,
      number: 1,
      customerId: customer.id,
      bikeId: bike.id,
      requestedService: "Mantención general",
      createdBy: owner.id,
      assignedMechanicId: mechanic.id,
      pricingMode,
    })
    .returning();
  if (!order) throw new Error("Falta la orden de prueba.");
  expect(
    await addPartItem(
      test.db,
      owner,
      order.id,
      { description: "Cadena", quantity: 2, unitPriceClp: 5000 },
      NOW,
    ),
  ).toMatchObject({ ok: true });
  return order.id;
}

async function prepareReception(orderId: string) {
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
  await test.db
    .update(workOrders)
    .set({ estimatedDeliveryDate: "2026-11-16", deliveryDateConfirmedAt: NOW })
    .where(eq(workOrders.id, orderId));
  const png = await sharp({
    create: { width: 10, height: 10, channels: 4, background: "#000000" },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

function expectAmounts(mode: PricingMode, totalLabel: string) {
  expect(consoleOutbox).toHaveLength(2);
  expect(consoleOutbox[0]?.to).toBe(CUSTOMER_EMAIL);
  for (const message of consoleOutbox) {
    if (mode === "neto") {
      expect.soft(message.text).toContain("Neto: $10.000");
      expect.soft(message.text).toContain("IVA (19%): $1.900");
      expect.soft(message.text).toContain(`${totalLabel}: $11.900`);
      for (const value of ["Neto", "IVA (19%)", "$10.000", "$1.900", "$11.900"])
        expect.soft(message.html).toContain(value);
    } else {
      expect(message.text).toContain(`${totalLabel}: $10.000`);
      for (const body of [message.text, message.html]) {
        expect(body).not.toContain("IVA (19%)");
        expect(body).not.toContain("Neto");
      }
    }
  }
}

beforeEach(async () => {
  consoleOutbox.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("red deshabilitada en tests");
    }),
  );
  test = await createTestDb();
  dir = mkdtempSync(join(tmpdir(), "vector-pricing-notifications-"));
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta la sucursal de prueba.");
  owner = await createUser(branch.id, "owner");
  mechanic = await createUser(branch.id, "mechanic");
  return async () => {
    vi.unstubAllGlobals();
    consoleOutbox.length = 0;
    rmSync(dir, { recursive: true, force: true });
    await test.close();
  };
});

describe.each(["neto", "final"] as const)("envíos con régimen %s", (mode) => {
  it("envía los montos cotizados al finalizar la recepción", async () => {
    const orderId = await createOrder(mode);
    const signatureDataUrl = await prepareReception(orderId);
    expect(
      await finalizeReception(
        test.db,
        createLocalStorage(dir),
        owner,
        { orderId, signatureDataUrl, signedByName: "Ana Pérez" },
        NOW,
      ),
    ).toEqual({ ok: true });
    expect(consoleOutbox[0]?.subject).toContain("Recibimos tu bicicleta");
    expectAmounts(mode, "Total cotizado");
  });

  it("envía los montos al aprobar el control de calidad", async () => {
    const orderId = await createOrder(mode);
    await test.db
      .update(workOrders)
      .set({ status: "en_progreso", paidClp: 2000 })
      .where(eq(workOrders.id, orderId));
    const input = qcFormSchema.parse({
      checks: Object.fromEntries(QC_CHECK_KEYS.map((key) => [key, { result: "ok", note: "" }])),
    });
    expect(await submitQc(test.db, owner, orderId, input, NOW)).toEqual({
      ok: true,
      status: "lista_para_retirar",
    });
    expect(consoleOutbox[0]?.subject).toContain("lista para retirar");
    expectAmounts(mode, "Total");
    expect(consoleOutbox[0]?.text).toContain("Abonado: $2.000");
    expect(consoleOutbox[0]?.text).toContain(mode === "neto" ? "Saldo: $9.900" : "Saldo: $8.000");
  });

  it("envía la cotización y audita y devuelve el total a cobrar", async () => {
    const orderId = await createOrder(mode);
    const result = await sendQuote(test.db, owner, orderId, NOW);
    expect(consoleOutbox[0]?.subject).toContain("Cotización");
    expectAmounts(mode, "Total");
    const totalClp = mode === "neto" ? 11900 : 10000;
    expect.soft(result).toEqual({ ok: true, totalClp });
    const audits = await test.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, orderId), eq(auditLog.action, "notify.quote_sent")));
    expect.soft(audits).toMatchObject([{ details: { totalClp }, createdAt: NOW }]);
    expect(await lastQuote(test.db, owner, orderId)).toEqual({ at: NOW, totalClp });
  });
});
