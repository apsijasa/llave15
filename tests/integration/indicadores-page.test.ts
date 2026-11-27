import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeEach, expect, it, vi } from "vitest";
import { hashPassword, loginAdmin } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { forbiddenResponse } from "../../src/server/auth/permissions.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { payments } from "../../src/server/db/schema-payments.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null }));
vi.mock("../../src/server/db/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Base de prueba no inicializada");
    return holder.db;
  },
}));
const { default: IndicatorsPage } = await import("../../src/pages/taller/indicadores.astro");

const NOW = new Date("2026-11-12T15:00:00Z");
const PASSWORD = "clave-indicadores-de-prueba";
const SITE = "https://vectorbikes.cl";
const ALERT =
  "El rango no es válido: usa fechas yyyy-mm-dd, Desde anterior o igual a Hasta y hasta un año.";
let test: TestDb;
let owner: SessionUser;

async function seedUser(branchId: string, role: Role): Promise<SessionUser> {
  const [row] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      name: `Usuario ${role}`,
      email: `${randomUUID()}@ejemplo.cl`,
      passwordHash: await hashPassword(PASSWORD),
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning();
  if (!row) throw new Error("Falta el usuario");
  return { ...row, role };
}

async function login(user = owner) {
  const result = await loginAdmin(test.db, {
    email: user.email,
    password: PASSWORD,
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!result.ok) throw new Error(`No se inició sesión: ${result.code}`);
  return result.token;
}

async function render(token?: string, query = "", method = "GET", now = NOW) {
  const request = new Request(`${SITE}/taller/indicadores${query}`, {
    method,
    headers: token ? { cookie: `vb_admin_session=${token}` } : {},
  });
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  vi.useFakeTimers({ toFake: ["Date"], now });
  return container.renderToResponse(IndicatorsPage, { request }).finally(() => vi.useRealTimers());
}

function expectRange(html: string, from = "2026-11-01", to = "2026-11-12") {
  for (const [name, value] of [
    ["desde", from],
    ["hasta", to],
  ]) {
    const input = html.match(new RegExp(`<input\\b[^>]*name="${name}"[^>]*>`))?.[0];
    expect(input).toContain('type="date"');
    expect(input).toContain(`value="${value}"`);
  }
}

async function seedPayment() {
  const branchId = owner.branchId;
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId,
      name: "Cliente prueba",
      phoneE164: "+56912345678",
    })
    .returning();
  if (!customer) throw new Error("Falta cliente");
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId,
      customerId: customer.id,
      brand: "Vector",
      model: "Prueba",
      bikeType: "mtb",
    })
    .returning();
  if (!bike) throw new Error("Falta bicicleta");
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId,
      number: 1,
      customerId: customer.id,
      bikeId: bike.id,
      status: "creado",
      requestedService: "Revisión",
      createdBy: owner.id,
      totalClp: 20000,
      paidClp: 20000,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning();
  if (!order) throw new Error("Falta orden");
  await test.db.insert(payments).values({
    branchId,
    workOrderId: order.id,
    kind: "final",
    method: "transferencia",
    amountClp: 20000,
    receivedBy: owner.id,
    receivedAt: NOW,
  });
}

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta sucursal");
  owner = await seedUser(branch.id, "owner");
  return async () => {
    holder.db = null;
    await test.close();
  };
});

it("muestra el mes en curso, los bloques y el menú al dueño sin caché", async () => {
  const response = await render(await login());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const html = await response.text();
  for (const label of [
    "Indicadores",
    "Ingresos",
    "Pagos",
    "Entregas",
    "Ticket promedio",
    "Órdenes creadas",
    "Clientes atendidos",
    "Conversión de reservas",
    "Por medio de pago",
    "Pagos del período",
    "Órdenes por estado",
    "Abiertas hoy",
    "Servicios más pedidos",
    "Reservas",
    "Cobertura",
    "Control de calidad",
    "Informes",
  ])
    expect(html).toContain(label);
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html).toContain("<caption>Ingresos por medio de pago</caption>");
  expect(html).toContain('href="/taller/indicadores"');
  expect(html).toContain('method="get"');
  expectRange(html);
});

it("presenta el pago sembrado en pesos para el rango explícito", async () => {
  await seedPayment();
  const response = await render(await login(), "?desde=2026-11-01&hasta=2026-11-12");
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain("$20.000");
  expect(html).toContain("OT-00001");
  expect(html).toContain("Transferencia");
  expectRange(html);
});

it("permite el acceso a administración", async () => {
  const admin = await seedUser(owner.branchId, "admin");
  expect((await render(await login(admin))).status).toBe(200);
});

it.each(["reception", "mechanic"] as const)(
  "rechaza a %s antes de validar el rango",
  async (role) => {
    const user = await seedUser(owner.branchId, role);
    const response = await render(await login(user), "?desde=invalido");
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe(await forbiddenResponse().text());
  },
);

it("redirige sin sesión al login con la ruta de vuelta", async () => {
  const response = await render();
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/admin/login?next=%2Ftaller%2Findicadores");
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it.each([
  "?desde=2026-13-01",
  "?desde=2026-11-12&hasta=2026-11-01",
  "?desde=2025-01-01&hasta=2026-11-12",
  "?desde=&hasta=",
])("devuelve 422 y el rango por defecto: %s", async (query) => {
  const response = await render(await login(), query);
  expect(response.status).toBe(422);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const html = await response.text();
  expect(html).toMatch(new RegExp(`<p\\b[^>]*role="alert"[^>]*>${ALERT}</p>`));
  expectRange(html);
});

it("calcula los cuatro atajos en Santiago y marca el rango activo", async () => {
  const response = await render(await login(), "", "GET", new Date("2026-11-13T01:00:00Z"));
  const html = await response.text();
  expectRange(html);
  for (const [label, from, to] of [
    ["Hoy", "2026-11-12", "2026-11-12"],
    ["Esta semana", "2026-11-09", "2026-11-12"],
    ["Este mes", "2026-11-01", "2026-11-12"],
    ["Mes anterior", "2026-10-01", "2026-10-31"],
  ]) {
    const link = html.match(new RegExp(`<a\\b[^>]*>\\s*${label}\\s*</a>`))?.[0];
    expect(link).toContain(`desde=${from}&amp;hasta=${to}`);
    if (label === "Este mes") expect(link).toContain('aria-current="page"');
    else expect(link).not.toContain("aria-current");
  }
});

it("rechaza POST con 405: la pantalla solo admite GET", async () => {
  const response = await render(await login(), "", "POST");
  expect(response.status).toBe(405);
  expect(response.headers.get("allow")).toBe("GET");
  expect(response.headers.get("cache-control")).toBe("no-store");
});
