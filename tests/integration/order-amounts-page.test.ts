import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { hashPassword, loginAdmin, SESSION_COOKIE } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { addPartItem } from "../../src/server/taller/items.ts";
import type { PricingMode } from "../../src/server/taller/rules.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null }));
vi.mock("../../src/server/db/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Base de prueba no inicializada.");
    return holder.db;
  },
}));
const { default: OrderPage } = await import("../../src/pages/taller/ordenes/[id]/index.astro");
const { default: ReceptionPage } = await import(
  "../../src/pages/taller/ordenes/[id]/recepcion.astro"
);
const { default: DeliveryPage } = await import("../../src/pages/taller/ordenes/[id]/entrega.astro");

const NOW = new Date("2026-11-14T15:00:00Z");
const PASSWORD = "clave-montos-de-prueba";
const SITE = "https://vectorbikes.cl";
const PAGES = [
  { page: OrderPage, suffix: "", totalLabel: "Total para el cliente" },
  { page: ReceptionPage, suffix: "/recepcion", totalLabel: "Total" },
  { page: DeliveryPage, suffix: "/entrega", totalLabel: "Total" },
] as const;
let test: TestDb;
let owner: SessionUser;
let bikeId: string;
let customerId: string;
let token: string;

async function seedUser(branchId: string) {
  const [user] = await test.db
    .insert(users)
    .values({
      branchId,
      role: "owner",
      name: "Personal de prueba",
      email: "owner@example.test",
      passwordHash: await hashPassword(PASSWORD),
    })
    .returning();
  if (!user) throw new Error("Falta el usuario.");
  owner = { ...user, role: "owner" };
  const result = await loginAdmin(test.db, {
    email: owner.email,
    password: PASSWORD,
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!result.ok) throw new Error("No se inició sesión.");
  token = result.token;
}

async function seedBike() {
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: owner.branchId,
      name: "Cliente de prueba",
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
  bikeId = bike.id;
}

async function seedOrder(pricingMode: PricingMode) {
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: owner.branchId,
      number: 1,
      customerId,
      bikeId,
      pricingMode,
      status: "recibida",
      requestedService: "Revisión general",
      createdBy: owner.id,
    })
    .returning();
  if (!order) throw new Error("Falta la orden.");
  expect(
    await addPartItem(
      test.db,
      owner,
      order.id,
      {
        description: "Cadena",
        quantity: 1,
        unitPriceClp: 10000,
      },
      NOW,
    ),
  ).toMatchObject({ ok: true });
  return order.id;
}

async function render(screen: (typeof PAGES)[number], orderId: string) {
  const request = new Request(`${SITE}/taller/ordenes/${orderId}${screen.suffix}`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  const response = await container
    .renderToResponse(screen.page, {
      request,
      params: { id: orderId },
    })
    .finally(() => vi.useRealTimers());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return (await response.text()).replace(/>\s+</g, "><");
}

function amountRow(label: string, amount: string) {
  return `<dt>${label}</dt><dd class="mono">${amount}</dd>`;
}

function expectPaymentAmount(html: string, balance: number) {
  const input = html.match(/<input\b[^>]*name="amountClp"[^>]*>/)?.[0];
  expect(html).toContain('<label for="amountClp">Monto</label>');
  expect(input).toContain('type="number"');
  expect(input).toContain(`max="${balance}"`);
  expect(input).toContain(`value="${balance}"`);
}

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta la sucursal.");
  await seedUser(branch.id);
  await seedBike();
  return async () => {
    holder.db = null;
    await test.close();
  };
});

it.each(PAGES)("muestra neto, IVA y total en /ordenes/:id$suffix", async (screen) => {
  const html = await render(screen, await seedOrder("neto"));
  const amounts =
    amountRow("Neto", "$10.000") +
    amountRow("IVA (19%)", "$1.900") +
    amountRow(screen.totalLabel, "$11.900");
  const summary = [...html.matchAll(/<dl class="data">[\s\S]*?<\/dl>/g)].find(([list]) =>
    list.includes("<dt>Neto</dt>"),
  )?.[0];
  expect(summary).toContain(amounts);
  if (screen.suffix === "/entrega") {
    expect(html).toContain(amounts + amountRow("Pagado", "$0") + amountRow("Saldo", "$11.900"));
    expectPaymentAmount(html, 11900);
  }
});

it.each(PAGES)("conserva el marcado final en /ordenes/:id$suffix", async (screen) => {
  const html = await render(screen, await seedOrder("final"));
  expect(html).not.toContain("IVA (19%)");
  expect(html).not.toContain("<dt>Neto</dt>");
  if (screen.suffix === "/recepcion") {
    expect(html).toContain('<p>Total: <span class="mono">$10.000</span></p>');
  } else {
    expect(html).toContain(amountRow(screen.totalLabel, "$10.000"));
  }
  if (screen.suffix === "/entrega") {
    expect(html).toContain(
      '<dl class="data">' +
        amountRow("Total", "$10.000") +
        amountRow("Pagado", "$0") +
        amountRow("Saldo", "$10.000") +
        "</dl>",
    );
    expectPaymentAmount(html, 10000);
  }
});

it("descuenta lo pagado del total con IVA para el saldo y el campo Monto", async () => {
  const orderId = await seedOrder("neto");
  await test.db.update(workOrders).set({ paidClp: 10000 }).where(eq(workOrders.id, orderId));
  const html = await render(PAGES[2], orderId);
  expect(html).toContain(
    amountRow("Total", "$11.900") + amountRow("Pagado", "$10.000") + amountRow("Saldo", "$1.900"),
  );
  expectPaymentAmount(html, 1900);
});

it("el CHECK exige pagar también el IVA antes de entregar una orden neto", async () => {
  const orderId = await seedOrder("neto");
  await expect(
    test.client.query(
      "update work_orders set status = 'entregada', qc_approved_at = $1, paid_clp = 10000 where id = $2",
      [NOW, orderId],
    ),
  ).rejects.toMatchObject({ code: "23514", constraint: "work_orders_delivered_paid_check" });
  const [unchanged] = await test.db.select().from(workOrders).where(eq(workOrders.id, orderId));
  expect(unchanged).toMatchObject({ status: "recibida", paidClp: 0, totalClp: 11900 });
  await test.db
    .update(workOrders)
    .set({
      status: "entregada",
      qcApprovedAt: NOW,
      paidClp: 11900,
    })
    .where(eq(workOrders.id, orderId));
  const [delivered] = await test.db.select().from(workOrders).where(eq(workOrders.id, orderId));
  expect(delivered).toMatchObject({ status: "entregada", paidClp: 11900, totalClp: 11900 });
});
