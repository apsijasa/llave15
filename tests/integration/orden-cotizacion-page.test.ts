import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { hashPassword, loginAdmin } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { consoleOutbox } from "../../src/server/email/transport.ts";
import { addPartItem } from "../../src/server/taller/items.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null }));
vi.mock("../../src/server/db/client.ts", async (original) => ({
  ...(await original<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => holder.db,
}));
const { default: OrderPage } = await import("../../src/pages/taller/ordenes/[id]/index.astro");
const NOW = new Date("2026-11-12T15:00:00.000Z");
const LATER = new Date("2026-11-12T15:01:00.000Z");
const SITE = "https://vectorbikes.cl";
const PASSWORD = "clave-larga-de-prueba";
let test: TestDb;
let owner: SessionUser;
let orderId: string;
let customerId: string;
let token: string;
let mechanicToken: string;

async function seedUser(branchId: string, role: SessionUser["role"]) {
  const [user] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      name: `Usuario ${role}`,
      email: `${role}@example.test`,
      passwordHash: await hashPassword(PASSWORD),
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning();
  if (!user) throw new Error("Falta el usuario.");
  const result = await loginAdmin(test.db, {
    email: user.email,
    password: PASSWORD,
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!result.ok) throw new Error("No se inició sesión.");
  return {
    user: { id: user.id, branchId: user.branchId, role, name: user.name, email: user.email },
    token: result.token,
  };
}

async function seedOrder() {
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: owner.branchId,
      name: "Ana Pérez",
      email: "ana@example.test",
      phoneE164: "+56912345678",
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
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: owner.branchId,
      number: 1,
      customerId,
      bikeId: bike.id,
      status: "diagnostico",
      requestedService: "Mantención",
      createdBy: owner.id,
    })
    .returning();
  if (!order) throw new Error("Falta la orden.");
  orderId = order.id;
}

async function render(session = token, data?: Record<string, string>, search = "", origin = SITE) {
  const request = new Request(`${SITE}/taller/ordenes/${orderId}${search}`, {
    method: data ? "POST" : "GET",
    headers: {
      cookie: `vb_admin_session=${session}`,
      ...(data ? { origin, "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: data ? new URLSearchParams(data) : undefined,
  });
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  vi.useFakeTimers({ toFake: ["Date"], now: LATER });
  return container
    .renderToResponse(OrderPage, { request, params: { id: orderId } })
    .finally(() => vi.useRealTimers());
}

async function addLine() {
  expect(
    await addPartItem(
      test.db,
      owner,
      orderId,
      { description: "Cadena", quantity: 2, unitPriceClp: 12000 },
      NOW,
    ),
  ).toMatchObject({ ok: true });
}

beforeEach(async () => {
  consoleOutbox.length = 0;
  test = await createTestDb();
  holder.db = test.db;
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta la sucursal.");
  const seeded = await seedUser(branch.id, "owner");
  owner = seeded.user;
  token = seeded.token;
  mechanicToken = (await seedUser(branch.id, "mechanic")).token;
  await seedOrder();
  return async () => {
    holder.db = null;
    consoleOutbox.length = 0;
    await test.close();
  };
});

it("envía por POST como dueña, redirige 303 y muestra aviso y última cotización", async () => {
  await addLine();
  const response = await render(token, { action: "quote" });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(`/taller/ordenes/${orderId}?hecho=cotizacion`);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(consoleOutbox).toHaveLength(2);
  const html = await (await render(token, undefined, "?hecho=cotizacion")).text();
  expect(html).toContain('role="status">Cotización enviada.</p>');
  expect(html).toContain("Última cotización:");
  expect(html).toContain("$24.000");
});

it("deniega el POST del mecánico en el servidor", async () => {
  await addLine();
  expect((await render(mechanicToken, { action: "quote" })).status).toBe(403);
  expect(consoleOutbox).toEqual([]);
});

it("muestra el botón a la dueña y lo oculta al mecánico", async () => {
  const ownerPage = await render();
  expect(ownerPage.status).toBe(200);
  expect(await ownerPage.text()).toContain("Enviar cotización por correo");
  const mechanicPage = await render(mechanicToken);
  expect(mechanicPage.status).toBe(200);
  expect(await mechanicPage.text()).not.toContain("Enviar cotización por correo");
});

it("rechaza el origen ajeno y no envía correos", async () => {
  await addLine();
  expect((await render(token, { action: "quote" }, "", "https://otro.cl")).status).toBe(403);
  expect(consoleOutbox).toEqual([]);
});

it("muestra 409 con el error de líneas o de correo", async () => {
  const empty = await render(token, { action: "quote" });
  expect(empty.status).toBe(409);
  expect(await empty.text()).toContain("La orden no tiene líneas vigentes para cotizar.");
  await addLine();
  await test.db.update(customers).set({ email: null }).where(eq(customers.id, customerId));
  const noEmail = await render(token, { action: "quote" });
  expect(noEmail.status).toBe(409);
  expect(await noEmail.text()).toContain("El cliente no tiene correo registrado.");
  expect(consoleOutbox).toEqual([]);
});

it("oculta el botón en órdenes terminales y rechaza su POST", async () => {
  await test.db.update(workOrders).set({ status: "cancelada" }).where(eq(workOrders.id, orderId));
  expect(await (await render()).text()).not.toContain("Enviar cotización por correo");
  const response = await render(token, { action: "quote" });
  expect(response.status).toBe(409);
  expect(await response.text()).toContain(
    "La orden cambió o esta acción no está disponible. Revisa su estado.",
  );
  expect(consoleOutbox).toEqual([]);
});
