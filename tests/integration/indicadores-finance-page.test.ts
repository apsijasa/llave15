import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeEach, expect, it, vi } from "vitest";
import { hashPassword, loginAdmin } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { expenses } from "../../src/server/db/schema-cash.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { payments } from "../../src/server/db/schema-payments.ts";
import { sales } from "../../src/server/db/schema-sales.ts";
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

const NOW = new Date("2026-11-20T15:00:00Z");
const IN_RANGE = new Date("2026-11-14T15:00:00Z");
const PASSWORD = "clave-finanzas-de-prueba";
const SITE = "https://vectorbikes.cl";
let test: TestDb;
let owner: SessionUser;
let reception: SessionUser;

async function seedUser(branchId: string, role: Role): Promise<SessionUser> {
  const [row] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      name: `Usuario ${role}`,
      email: `${randomUUID()}@ejemplo.cl`,
      passwordHash: await hashPassword(PASSWORD),
    })
    .returning();
  if (!row) throw new Error("Falta el usuario");
  return { ...row, role };
}

async function render(user: SessionUser, query = "?desde=2026-11-01&hasta=2026-11-30") {
  const login = await loginAdmin(test.db, {
    email: user.email,
    password: PASSWORD,
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!login.ok) throw new Error(`No se inició sesión: ${login.code}`);
  const request = new Request(`${SITE}/taller/indicadores${query}`, {
    headers: { cookie: `vb_admin_session=${login.token}` },
  });
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  return container.renderToResponse(IndicatorsPage, { request }).finally(() => vi.useRealTimers());
}

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  const branchId = randomUUID();
  await test.db.insert(branches).values({ id: branchId, name: "Sucursal" });
  owner = await seedUser(branchId, "owner");
  reception = await seedUser(branchId, "reception");
  const customerId = randomUUID();
  await test.db
    .insert(customers)
    .values({ id: customerId, branchId, name: "Ana", phoneE164: "+56912345678" });
  const bikeId = randomUUID();
  await test.db
    .insert(bikes)
    .values({ id: bikeId, branchId, customerId, brand: "Trek", model: "Marlin", bikeType: "mtb" });
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId,
      number: 1,
      customerId,
      bikeId,
      status: "creado",
      requestedService: "Mantención",
      totalClp: 11900,
      createdBy: owner.id,
    })
    .returning();
  const [sale] = await test.db
    .insert(sales)
    .values({
      branchId,
      number: 1,
      status: "pagada",
      subtotalClp: 10000,
      vatClp: 1900,
      totalClp: 11900,
      paidClp: 11900,
      createdBy: owner.id,
      createdAt: IN_RANGE,
    })
    .returning();
  if (!order || !sale) throw new Error("Faltan filas de prueba");
  const payment = {
    branchId,
    kind: "final" as const,
    amountClp: 11900,
    receivedBy: owner.id,
    receivedAt: IN_RANGE,
  };
  await test.db.insert(payments).values([
    {
      ...payment,
      workOrderId: order.id,
      method: "mercadopago",
      externalId: "MP-1",
      feeClp: 450,
      netClp: 11450,
    },
    { ...payment, saleId: sale.id, method: "transferencia" },
  ]);
  await test.db.insert(expenses).values({
    branchId,
    category: "arriendo",
    amountClp: 8000,
    expenseDate: "2026-11-14",
    description: "Arriendo",
    method: "transferencia",
    createdBy: owner.id,
  });
  return async () => {
    holder.db = null;
    await test.close();
  };
});

function cell(html: string, label: string) {
  return html.match(
    new RegExp(`<th scope="row"[^>]*>${label}</th>\\s*<td class="mono"[^>]*>([^<]*)</td>`),
  )?.[1];
}

it("el dueño ve las cinco secciones de la Etapa B con montos en celdas mono", async () => {
  const response = await render(owner);
  expect(response.status).toBe(200);
  const html = await response.text();
  for (const title of [
    "Egresos del período",
    "Balance",
    "Mix de ingresos",
    "POS por proveedor",
    "Inventario",
  ])
    expect(html).toMatch(new RegExp(`<h2 id="[^"]+"[^>]*>${title}</h2>`));
  expect(cell(html, "Arriendo")).toBe("$8.000");
  expect(cell(html, "Ingresos netos")).toBe("$20.000");
  expect(cell(html, "Balance")).toBe("$12.000");
  expect(cell(html, "Gastos sobre ingresos")).toBe("40%");
  expect(cell(html, "Ventas de mostrador")).toBe("$10.000");
  expect(cell(html, "Transbank")).toBe("$0");
  expect(cell(html, "Mercado Pago")).toBe("$11.900");
  expect(cell(html, "Getnet")).toBe("$0");
  expect(cell(html, "Productos activos")).toBe("0");
  expect(cell(html, "Valor a costo")).toBe("$0");
  expect(cell(html, "Margen de repuestos")).toBe("$0");
});

it("recepción recibe 403 como hoy", async () => {
  expect((await render(reception)).status).toBe(403);
});
