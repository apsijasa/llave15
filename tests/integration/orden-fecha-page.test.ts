import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { consoleOutbox } from "../../src/server/email/transport.ts";
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
      status: "en_reparacion",
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
  consoleOutbox.length = 0;
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

it.each(["owner", "admin", "reception", "mechanic"] as const)(
  "%s guarda la fecha desde el detalle",
  async (role) => {
    holder.actor = await actor(role);
    await test.db
      .update(workOrders)
      .set({ assignedMechanicId: holder.actor.id })
      .where(eq(workOrders.id, orderId));
    const response = await render({ action: "fecha", date: "2026-11-23" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/taller/ordenes/${orderId}?hecho=fecha`);
    const [order] = await test.db.select().from(workOrders).where(eq(workOrders.id, orderId));
    expect(order?.estimatedDeliveryDate).toBe("2026-11-23");
  },
);

it.each(["2026-11-15", "fecha inválida", ""])(
  "fecha %s responde 422 con error accesible",
  async (date) => {
    const response = await render({ action: "fecha", date });
    expect(response.status).toBe(422);
    const html = await response.text();
    expect(html).toContain("La fecha de entrega debe ser hoy o posterior.");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="delivery-date-error"');
  },
);

it("el GET muestra la tarjeta y su botón sin mínimo de fecha", async () => {
  const html = await (await render()).text();
  expect(html).toContain("Fecha de entrega");
  expect(html).toContain("Guardar y avisar al cliente");
  expect(html).toContain('value="2026-10-23"');
  const field = html.slice(html.indexOf('id="delivery-date"'));
  expect(field.slice(0, field.indexOf(">"))).not.toContain("min=");
});

it("no muestra la tarjeta en una orden entregada y rechaza su POST", async () => {
  await test.db
    .update(workOrders)
    .set({ status: "entregada", qcApprovedAt: NOW })
    .where(eq(workOrders.id, orderId));
  expect(await (await render()).text()).not.toContain("Guardar y avisar al cliente");
  const response = await render({ action: "fecha", date: "2026-11-23" });
  expect(response.status).toBe(409);
  expect(await response.text()).toContain("La orden ya está cerrada.");
});

it("redirige con avisado=1 y muestra la confirmación del correo", async () => {
  await test.db.update(customers).set({ email: "ana@example.test" });
  const response = await render({ action: "fecha", date: "2026-11-23" });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(`/taller/ordenes/${orderId}?hecho=fecha&avisado=1`);
  const html = await (await render(undefined, "?hecho=fecha&avisado=1")).text();
  expect(html).toContain("Fecha de entrega guardada.");
  expect(html).toContain("Le avisamos al cliente por correo.");
  expect(html).toContain('role="status"');
});

it("el mecánico sin acceso recibe 403 sin cambiar la fecha", async () => {
  holder.actor = await actor("mechanic");
  expect((await render({ action: "fecha", date: "2026-11-23" })).status).toBe(403);
  const [order] = await test.db.select().from(workOrders).where(eq(workOrders.id, orderId));
  expect(order?.estimatedDeliveryDate).toBe("2026-10-23");
});
