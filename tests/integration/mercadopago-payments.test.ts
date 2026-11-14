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
import { PAYMENT_METHODS, RECORDABLE_PAYMENT_METHODS } from "../../src/server/taller/rules.ts";
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
const MP = {
  kind: "final",
  method: "mercadopago",
  amountClp: 11900,
  externalId: "MP-123",
  feeClp: 450,
} as const;
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
      status: "recibida",
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

it("registra operación recortada, comisión y neto; abona el monto bruto a la orden", async () => {
  const result = await recordPayment(
    test.db,
    owner,
    orderId,
    {
      ...MP,
      externalId: "  MP-123  ",
      amountClp: "11900",
      feeClp: "450",
    },
    NOW,
  );
  expect(result).toMatchObject({ ok: true });
  const saved = await snapshot();
  expect(saved.payments).toHaveLength(1);
  expect(saved.payments[0]).toMatchObject({ ...MP, netClp: 11450, receivedAt: NOW });
  expect(saved.orders[0]).toMatchObject({ paidClp: 11900, updatedAt: NOW });
  expect(saved.audits).toHaveLength(1);
  expect(saved.audits[0]).toMatchObject({
    action: "payment.recorded",
    actorUserId: owner.id,
    entityId: orderId,
    createdAt: NOW,
  });
});

it("exige una operación de 1 a 100 caracteres sin escribir", async () => {
  const before = await snapshot();
  for (const externalId of [undefined, "", "   ", "x".repeat(101)]) {
    expect(await recordPayment(test.db, owner, orderId, { ...MP, externalId }, NOW)).toEqual(
      INVALID,
    );
  }
  expect(await snapshot()).toEqual(before);
});

it("rechaza comisiones inválidas o mayores que el monto antes de escribir", async () => {
  const before = await snapshot();
  for (const feeClp of [-1, 1.5, 11901, 2147483648, "", null, true, "450.5"]) {
    expect(await recordPayment(test.db, owner, orderId, { ...MP, feeClp }, NOW)).toEqual(INVALID);
  }
  expect(await snapshot()).toEqual(before);
});

it("rechaza comisión positiva para los cuatro métodos anteriores sin escribir", async () => {
  const before = await snapshot();
  for (const method of PAYMENT_METHODS) {
    expect(await recordPayment(test.db, owner, orderId, { ...MP, method }, NOW)).toEqual(INVALID);
  }
  expect(await snapshot()).toEqual(before);
});

it("admite comisión omitida o igual al monto y el formulario hereda las validaciones", async () => {
  for (const feeClp of [undefined, 11900]) {
    const input = { ...MP, feeClp };
    expect(paymentFormSchema.safeParse(input).success).toBe(true);
    expect(await recordPayment(test.db, owner, orderId, input, NOW)).toMatchObject({ ok: true });
  }
  const saved = await test.db.select().from(payments);
  expect(saved.map((row) => [row.feeClp, row.netClp])).toEqual([
    [0, 11900],
    [11900, 0],
  ]);
  for (const input of [
    { ...MP, externalId: undefined },
    { ...MP, method: "tarjeta" },
    { ...MP, feeClp: 11901 },
  ]) {
    expect(paymentFormSchema.safeParse(input).success).toBe(false);
  }
});

it("conserva filas y detalles de auditoría de los medios anteriores", async () => {
  for (const method of PAYMENT_METHODS) {
    const input = { kind: "final", method, amountClp: 1000 };
    expect(await recordPayment(test.db, owner, orderId, input, NOW)).toMatchObject({ ok: true });
  }
  const saved = await snapshot();
  for (const row of saved.payments) {
    expect(row).toMatchObject({ externalId: null, feeClp: 0, netClp: null });
  }
  expect(saved.audits.map((row) => row.details)).toEqual(
    PAYMENT_METHODS.map((method) => ({
      kind: "final",
      method,
      amountClp: 1000,
    })),
  );
  expect(
    await recordPayment(
      test.db,
      owner,
      orderId,
      {
        kind: "final",
        method: "tarjeta",
        amountClp: 1000,
        feeClp: 0,
      },
      NOW,
    ),
  ).toMatchObject({ ok: true });
});

it("omite comisión y neto sin costs.view y conserva el id de operación", async () => {
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

it("agrega Mercado Pago a indicadores solo con pagos vigentes del rango y suma el bruto", async () => {
  await seedPayment({
    method: "tarjeta",
    externalId: null,
    feeClp: 0,
    netClp: null,
    amountClp: 1000,
  });
  await seedPayment({ receivedAt: new Date("2026-11-13T15:00:00Z") });
  const initial = await workshopIndicators(test.db, owner, RANGE, NOW);
  expect(initial?.income.byMethod.map((row) => row.method)).toEqual([...PAYMENT_METHODS]);
  expect(initial?.income).toMatchObject({ totalClp: 1000, count: 1 });
  const payment = await seedPayment();
  const current = await workshopIndicators(test.db, owner, RANGE, NOW);
  expect(current?.income.byMethod).toHaveLength(5);
  expect(current?.income.byMethod[4]).toEqual({
    method: "mercadopago",
    label: "Mercado Pago",
    amountClp: 11900,
    count: 1,
  });
  expect(current?.income).toMatchObject({ totalClp: 12900, count: 2 });
  await test.db
    .update(payments)
    .set({ voidedAt: NOW, voidedBy: owner.id })
    .where(eq(payments.id, payment.id));
  expect((await workshopIndicators(test.db, owner, RANGE, NOW))?.income).toEqual(initial?.income);
});

it("ofrece los cinco métodos y muestra la comisión del pago solo con costs.view", async () => {
  await seedPayment();
  for (const role of ["owner", "reception"] as const) {
    holder.actor = await actor(owner.branchId, role);
    const response = await render();
    expect(response.status).toBe(200);
    const html = await response.text();
    for (const method of RECORDABLE_PAYMENT_METHODS) expect(html).toContain(`value="${method}"`);
    expect(html).toContain("Solo Mercado Pago");
    expect(html).toMatch(/<label[^>]*for="externalId"[^>]*>Id de la operación<\/label>/);
    expect(html).toMatch(/<label[^>]*for="feeClp"[^>]*>Comisión<\/label>/);
    expect(html.includes('<th scope="col">Comisión</th>')).toBe(role === "owner");
  }
});

it("el POST omite campos opcionales vacíos y registra Mercado Pago con comisión", async () => {
  const base = { action: "record", kind: "final", amountClp: "11900" };
  for (const fields of [
    { method: "tarjeta", externalId: "   ", feeClp: "" },
    { method: "mercadopago", externalId: " MP-123 ", feeClp: "450" },
    { method: "mercadopago", externalId: "MP-456", feeClp: "" },
  ]) {
    const response = await render({ ...base, ...fields });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `/taller/ordenes/${orderId}/entrega?hecho=record`,
    );
  }
  expect(
    (await snapshot()).payments.map((row) => [row.externalId, row.feeClp, row.netClp]),
  ).toEqual([
    [null, 0, null],
    ["MP-123", 450, 11450],
    ["MP-456", 0, 11900],
  ]);
});

it("el POST marca y conserva los campos inválidos de Mercado Pago sin escribir", async () => {
  const before = await snapshot();
  const response = await render({
    action: "record",
    kind: "final",
    method: "mercadopago",
    amountClp: "11900",
    externalId: "",
    feeClp: "450",
  });
  expect(response.status).toBe(422);
  const html = await response.text();
  expect(html).toMatch(/<input[^>]*name="externalId"[^>]*aria-invalid="true"/);
  expect(html).toMatch(/<input[^>]*name="feeClp"[^>]*value="450"/);
  expect(await snapshot()).toEqual(before);
});
