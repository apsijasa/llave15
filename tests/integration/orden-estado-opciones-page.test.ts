import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
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
const { default: Orden } = await import("../../src/pages/taller/ordenes/[id]/index.astro");
const SITE_URL = "https://vectorbikes.cl";
const NOW = new Date("2026-11-16T15:00:00.000Z");
let test: TestDb;
let orderId: string;
let branchId: string;

async function actor(role: SessionUser["role"]): Promise<SessionUser> {
  const [user] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      name: "Persona de prueba",
      email: `${randomUUID()}@example.test`,
      passwordHash: "hash-de-prueba",
    })
    .returning();
  if (!user) throw new Error("Falta el usuario.");
  return { id: user.id, branchId, role, email: user.email, name: user.name };
}

async function seedBike() {
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId,
      name: "Ana Pérez",
      phoneE164: "+56912345678",
    })
    .returning();
  if (!customer) throw new Error("Falta el cliente.");
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId,
      customerId: customer.id,
      brand: "Trek",
      model: "Marlin",
      bikeType: "mtb",
    })
    .returning();
  if (!bike) throw new Error("Falta la bicicleta.");
  return bike;
}

async function seedOrder(user: SessionUser) {
  const bike = await seedBike();
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId,
      number: 1,
      customerId: bike.customerId,
      bikeId: bike.id,
      requestedService: "Mantención general",
      createdBy: user.id,
      status: "en_progreso",
      estimatedDeliveryDate: "2026-10-23",
    })
    .returning();
  if (!order) throw new Error("Falta la orden.");
  orderId = order.id;
}

async function render(data?: Record<string, string>, search = "") {
  const request = new Request(`${SITE_URL}/taller/ordenes/${orderId}${search}`, {
    method: data ? "POST" : "GET",
    headers: data ? { origin: SITE_URL, "content-type": "application/x-www-form-urlencoded" } : {},
    body: data ? new URLSearchParams(data) : undefined,
  });
  const container = await AstroContainer.create({ astroConfig: { site: SITE_URL } });
  return container.renderToResponse(Orden, { request, params: { id: orderId } });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  test = await createTestDb();
  holder.db = test.db;
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta la sucursal.");
  branchId = branch.id;
  holder.actor = await actor("owner");
  await seedOrder(holder.actor);
  return async () => {
    holder.actor = null;
    holder.db = null;
    vi.useRealTimers();
    await test.close();
  };
});

function option(html: string, value: string) {
  const match = new RegExp(`<option value="${value}"( disabled)?>([^<]*)</option>`).exec(html);
  if (!match) throw new Error(`Falta la opción ${value}.`);
  return { disabled: Boolean(match[1]), label: match[2] };
}

async function setOrder(values: Partial<typeof workOrders.$inferInsert>) {
  await test.db.update(workOrders).set(values).where(eq(workOrders.id, orderId));
}

it("Pagado no se ofrece con saldo pendiente y sí con saldo cero", async () => {
  await setOrder({ status: "lista_para_retirar", qcApprovedAt: NOW, totalClp: 1000, paidClp: 0 });
  expect(option(await (await render()).text(), "pagado")).toEqual({
    disabled: true,
    label: "Pagado — se completa al pagar el saldo",
  });
  await setOrder({ paidClp: 1000 });
  expect(option(await (await render()).text(), "pagado")).toEqual({
    disabled: false,
    label: "Pagado",
  });
});

it("Creado sin recepción terminada no ofrece Diagnóstico ni En progreso", async () => {
  await setOrder({ status: "creado", receivedAt: null });
  const pending = await (await render()).text();
  for (const value of ["diagnostico", "en_progreso"])
    expect(option(pending, value)).toMatchObject({
      disabled: true,
      label: expect.stringContaining("termina la recepción primero"),
    });
  await setOrder({ receivedAt: NOW });
  const received = await (await render()).text();
  expect(option(received, "diagnostico")).toEqual({ disabled: false, label: "Diagnóstico" });
  expect(option(received, "en_progreso")).toEqual({ disabled: false, label: "En progreso" });
});
