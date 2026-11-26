import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { payments } from "../../src/server/db/schema-payments.ts";
import { auditLog, bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { workshopIndicators } from "../../src/server/taller/indicators.ts";
import {
  listPayments,
  paymentFormSchema,
  recordPayment,
} from "../../src/server/taller/payments.ts";
import {
  FORM_PAYMENT_METHODS,
  PAYMENT_METHODS,
  POS_PROVIDERS,
} from "../../src/server/taller/rules.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null, actor: null as SessionUser | null }));
vi.mock("../../src/server/db/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Base de prueba no inicializada.");
    return holder.db;
  },
}));
vi.mock("../../src/server/auth/admin-auth.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/auth/admin-auth.ts")>()),
  requireAdmin: async () => holder.actor,
}));
const { default: DeliveryPage } = await import("../../src/pages/taller/ordenes/[id]/entrega.astro");

const NOW = new Date("2026-11-14T15:00:00Z");
const RANGE = { from: "2026-11-14", to: "2026-11-14" };
// Pago Mercado Pago anterior a F2-D30: queda en la base y se sigue mostrando.
const MP = {
  kind: "final",
  method: "mercadopago",
  amountClp: 11900,
  externalId: "MP-123",
  feeClp: 450,
} as const;
const POS = { kind: "final", method: "tarjeta", amountClp: 11900, posProvider: "getnet" } as const;
const INVALID = { ok: false, code: "validation_error" };
let test: TestDb;
let owner: SessionUser;
let orderId: string;

async function actor(branchId: string, role: SessionUser["role"]): Promise<SessionUser> {
  const [row] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      name: "Personal de prueba",
      email: `${randomUUID()}@example.test`,
      passwordHash: "hash-de-prueba",
    })
    .returning();
  if (!row) throw new Error("Falta el usuario de prueba.");
  return { ...row, role };
}

async function createOrder() {
  const branchId = owner.branchId;
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId,
      name: "Cliente de prueba",
      phoneE164: "+56912345678",
    })
    .returning();
  if (!customer) throw new Error("Falta el cliente de prueba.");
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId,
      customerId: customer.id,
      brand: "Oxford",
      model: "Prueba",
      bikeType: "mtb",
    })
    .returning();
  if (!bike) throw new Error("Falta la bicicleta de prueba.");
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId,
      number: 1,
      customerId: customer.id,
      bikeId: bike.id,
      status: "creado",
      receivedAt: NOW,
      requestedService: "Revisión",
      totalClp: 100000,
      createdBy: owner.id,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning();
  if (!order) throw new Error("Falta la orden de prueba.");
  return order.id;
}

async function snapshot() {
  return {
    orders: await test.db.select().from(workOrders),
    payments: await test.db.select().from(payments),
    audits: await test.db.select().from(auditLog),
  };
}

async function seedPayment(overrides: Partial<typeof payments.$inferInsert> = {}) {
  const [row] = await test.db
    .insert(payments)
    .values({
      ...MP,
      branchId: owner.branchId,
      workOrderId: orderId,
      receivedBy: owner.id,
      receivedAt: NOW,
      netClp: 11450,
      ...overrides,
    })
    .returning();
  if (!row) throw new Error("Falta el pago de prueba.");
  return row;
}

async function render(data?: Record<string, string>) {
  const site = "https://vectorbikes.cl";
  const request = new Request(`${site}/taller/ordenes/${orderId}/entrega`, {
    method: data ? "POST" : "GET",
    headers: data ? { origin: site, "content-type": "application/x-www-form-urlencoded" } : {},
    body: data ? new URLSearchParams(data) : undefined,
  });
  const container = await AstroContainer.create({ astroConfig: { site } });
  return container.renderToResponse(DeliveryPage, { request, params: { id: orderId } });
}

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta la sucursal de prueba.");
  owner = await actor(branch.id, "owner");
  holder.actor = owner;
  orderId = await createOrder();
  return async () => {
    holder.db = null;
    holder.actor = null;
    await test.close();
  };
});

it("registra un pago POS con su proveedor y abona el monto a la orden", async () => {
  const result = await recordPayment(test.db, owner, orderId, { ...POS, amountClp: "11900" }, NOW);
  expect(result).toMatchObject({ ok: true });
  const saved = await snapshot();
  expect(saved.payments).toHaveLength(1);
  expect(saved.payments[0]).toMatchObject({
    method: "tarjeta",
    posProvider: "getnet",
    amountClp: 11900,
    externalId: null,
    feeClp: 0,
    netClp: null,
  });
  expect(saved.orders[0]).toMatchObject({ paidClp: 11900, updatedAt: NOW });
  expect(saved.audits[0]?.details).toEqual({
    kind: "final",
    method: "tarjeta",
    amountClp: 11900,
    posProvider: "getnet",
  });
});

it("acepta los tres proveedores y la tarjeta sin proveedor de la API", async () => {
  for (const posProvider of POS_PROVIDERS) {
    const input = { ...POS, amountClp: 1000, posProvider };
    expect(await recordPayment(test.db, owner, orderId, input, NOW)).toMatchObject({ ok: true });
  }
  const plain = { kind: "final", method: "tarjeta", amountClp: 1000 };
  expect(await recordPayment(test.db, owner, orderId, plain, NOW)).toMatchObject({ ok: true });
  expect((await snapshot()).payments.map((row) => row.posProvider)).toEqual([
    ...POS_PROVIDERS,
    null,
  ]);
});

it("rechaza proveedor fuera de POS, Mercado Pago suelto y los campos de comisión, sin escribir", async () => {
  const before = await snapshot();
  for (const input of [
    ...PAYMENT_METHODS.filter((method) => method !== "tarjeta").map((method) => ({
      ...POS,
      method,
    })),
    { ...POS, posProvider: "redcompra" },
    { kind: "final", method: "mercadopago", amountClp: 11900, externalId: "MP-1" },
    { ...POS, externalId: "MP-1" },
    { ...POS, feeClp: 0 },
  ]) {
    expect(await recordPayment(test.db, owner, orderId, input, NOW)).toEqual(INVALID);
  }
  expect(await snapshot()).toEqual(before);
});

it("el formulario exige proveedor con POS y lo rechaza con otros medios", () => {
  expect(paymentFormSchema.safeParse(POS).success).toBe(true);
  expect(paymentFormSchema.safeParse({ ...POS, posProvider: undefined }).success).toBe(false);
  expect(paymentFormSchema.safeParse({ ...POS, method: "efectivo" }).success).toBe(false);
  expect(
    paymentFormSchema.safeParse({ kind: "final", method: "transferencia", amountClp: 1 }).success,
  ).toBe(true);
});

it("la base rechaza un proveedor inválido o un proveedor con otro medio", async () => {
  await expect(
    seedPayment({
      ...POS,
      externalId: null,
      feeClp: 0,
      netClp: null,
      posProvider: "redcompra" as never,
    }),
  ).rejects.toThrow();
  await expect(
    seedPayment({ ...POS, method: "efectivo", externalId: null, feeClp: 0, netClp: null }),
  ).rejects.toThrow();
  await expect(
    seedPayment({ ...POS, externalId: null, feeClp: 0, netClp: null }),
  ).resolves.toMatchObject({ posProvider: "getnet" });
});

it("omite comisión y neto de pagos antiguos sin costs.view", async () => {
  await seedPayment();
  for (const role of ["owner", "admin", "reception", "mechanic"] as const) {
    const staff = await actor(owner.branchId, role);
    await test.db
      .update(workOrders)
      .set({ assignedMechanicId: staff.id })
      .where(eq(workOrders.id, orderId));
    const [row] = await listPayments(test.db, staff, orderId);
    expect(row).toMatchObject({ externalId: "MP-123", amountClp: 11900 });
    if (role === "owner" || role === "admin") {
      expect(row).toMatchObject({ feeClp: 450, netClp: 11450 });
    } else {
      expect(row).not.toHaveProperty("feeClp");
      expect(row).not.toHaveProperty("netClp");
    }
  }
});

it("indicadores muestra la tarjeta como POS y suma Mercado Pago antiguo aparte", async () => {
  await seedPayment({ ...POS, amountClp: 1000, externalId: null, feeClp: 0, netClp: null });
  const initial = await workshopIndicators(test.db, owner, RANGE, NOW);
  expect(initial?.income.byMethod.map((row) => row.method)).toEqual([...PAYMENT_METHODS]);
  expect(initial?.income.byMethod.find((row) => row.method === "tarjeta")).toMatchObject({
    label: "POS",
    amountClp: 1000,
  });
  await seedPayment();
  const current = await workshopIndicators(test.db, owner, RANGE, NOW);
  expect(current?.income.byMethod[4]).toMatchObject({ method: "mercadopago", amountClp: 11900 });
  expect(current?.income).toMatchObject({ totalClp: 12900, count: 2 });
});

it("ofrece POS con su lista de proveedores y ya no el bloque de Mercado Pago", async () => {
  await seedPayment();
  for (const role of ["owner", "reception"] as const) {
    holder.actor = await actor(owner.branchId, role);
    const response = await render();
    expect(response.status).toBe(200);
    const html = await response.text();
    for (const method of FORM_PAYMENT_METHODS) expect(html).toContain(`value="${method}"`);
    expect(html).not.toContain('name="method" type="radio" value="mercadopago"');
    expect(html).toMatch(/value="tarjeta"[^>]*>\s*POS<\/label>/);
    expect(html).toMatch(/<label[^>]*for="posProvider"[^>]*>Proveedor del POS<\/label>/);
    for (const label of ["Transbank", "Mercado Pago", "Getnet"])
      expect(html).toMatch(new RegExp(`<option value="[a-z]+"[^>]*>${label}</option>`));
    expect(html).not.toContain("Solo Mercado Pago");
    expect(html).not.toContain('name="externalId"');
    expect(html).not.toContain('name="feeClp"');
    expect(html.includes('<th scope="col">Comisión</th>')).toBe(role === "owner");
  }
});

it("el POST registra POS con proveedor e ignora el proveedor con otro medio", async () => {
  const base = { action: "record", kind: "final", amountClp: "1000" };
  for (const fields of [
    { method: "tarjeta", posProvider: "transbank" },
    { method: "transferencia", posProvider: "getnet" },
    { method: "efectivo", posProvider: "" },
  ]) {
    const response = await render({ ...base, ...fields });
    expect(response.status).toBe(303);
  }
  const rows = (await snapshot()).payments.map((row) => [row.method, row.posProvider]);
  expect(rows).toEqual([
    ["tarjeta", "transbank"],
    ["transferencia", null],
    ["efectivo", null],
  ]);
  const html = await (await render()).text();
  expect(html).toContain("POS · Transbank");
  expect(html).not.toContain('<th scope="col">Comisión</th>');
});

it("el POST con POS sin proveedor responde 422 sin escribir", async () => {
  const before = await snapshot();
  const response = await render({
    action: "record",
    kind: "final",
    method: "tarjeta",
    amountClp: "1000",
    posProvider: "",
  });
  expect(response.status).toBe(422);
  const html = await response.text();
  expect(html).toContain("Elige el proveedor del POS");
  expect(html).toMatch(/<select[^>]*name="posProvider"[^>]*aria-invalid="true"/);
  expect(await snapshot()).toEqual(before);
});
