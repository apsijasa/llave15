import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeEach, expect, it, vi } from "vitest";
import { hashPassword, loginAdmin } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { payments } from "../../src/server/db/schema-payments.ts";
import { shops } from "../../src/server/db/schema-shops.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null }));
vi.mock("../../src/server/db/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Base no inicializada");
    return holder.db;
  },
}));
const { default: Page } = await import("../../src/pages/taller/indicadores.astro");
const NOW = new Date("2026-11-26T15:00:00Z");
const PASSWORD = "clave-panel-de-prueba";
const SITE = "https://panel.ejemplo.cl";
let test: TestDb;
let owner: SessionUser;

async function seedUser(role: Role, branchId: string): Promise<SessionUser> {
  const [user] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      name: "Usuario panel",
      email: `${randomUUID()}@ejemplo.cl`,
      passwordHash: await hashPassword(PASSWORD),
    })
    .returning();
  if (!user) throw new Error("Falta usuario");
  return { ...user, role };
}
async function login(user = owner) {
  const result = await loginAdmin(test.db, {
    email: user.email,
    password: PASSWORD,
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!result.ok) throw new Error(result.code);
  return result.token;
}
async function render(token?: string) {
  const request = new Request(`${SITE}/taller/indicadores`, {
    headers: token ? { cookie: `vb_admin_session=${token}` } : {},
  });
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  return container.renderToResponse(Page, { request }).finally(() => vi.useRealTimers());
}
async function seedPayments(previous: boolean) {
  const branchId = owner.branchId;
  const [customer] = await test.db
    .insert(customers)
    .values({ branchId, name: "Cliente", phoneE164: "+56912345678" })
    .returning();
  if (!customer) throw new Error("Falta cliente");
  const [bike] = await test.db
    .insert(bikes)
    .values({ branchId, customerId: customer.id, brand: "Marca", model: "Modelo", bikeType: "mtb" })
    .returning();
  if (!bike) throw new Error("Falta bicicleta");
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId,
      number: 1,
      customerId: customer.id,
      bikeId: bike.id,
      status: "diagnostico",
      requestedService: "Revisión",
      totalClp: 30000,
      paidClp: previous ? 30000 : 20000,
      createdBy: owner.id,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning();
  if (!order) throw new Error("Falta orden");
  const payment = {
    branchId,
    workOrderId: order.id,
    kind: "final" as const,
    method: "transferencia" as const,
    receivedBy: owner.id,
  };
  await test.db.insert(payments).values({ ...payment, amountClp: 20000, receivedAt: NOW });
  if (previous)
    await test.db.insert(payments).values({
      ...payment,
      kind: "abono",
      amountClp: 10000,
      receivedAt: new Date("2026-10-20T15:00:00Z"),
    });
}

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  const [shop] = await test.db.select().from(shops);
  if (!shop) throw new Error("Falta taller");
  const [branch] = await test.db
    .insert(branches)
    .values({ shopId: shop.id, name: "Sucursal panel" })
    .returning();
  if (!branch) throw new Error("Falta sucursal");
  owner = await seedUser("owner", branch.id);
  return async () => {
    holder.db = null;
    await test.close();
  };
});

it("renderiza cinco secciones, gráficos accesibles, perfil y detalle intacto", async () => {
  const response = await render(await login());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const html = await response.text();
  for (const title of [
    "El taller en una mirada",
    "Cómo se movió el dinero",
    "Qué está moviendo el taller",
    "De consultas a clientes",
    "Una operación bajo control",
    "Detalle del período",
  ])
    expect(html).toMatch(new RegExp(`<h2[^>]*>${title}</h2>`));
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(
    html.match(/<svg\b[^>]*role="img"[^>]*aria-label="[^"]+"/g)?.length,
  ).toBeGreaterThanOrEqual(8);
  const figures = html.match(/<figure\b[^>]*>[\s\S]*?<\/figure>/g) ?? [];
  expect(figures.length).toBeGreaterThanOrEqual(8);
  for (const figure of figures) {
    expect(figure).not.toMatch(/<figure\b[^>]*aria-label=/);
    expect(figure).toContain("<figcaption");
    expect(figure).toContain('class="dense chart-data"');
  }
  const patternIds = [...html.matchAll(/<pattern\b[^>]*id="([^"]+)"/g)].map((match) => match[1]);
  expect(patternIds).toHaveLength(5);
  expect(new Set(patternIds).size).toBe(5);
  for (const id of [
    "donut-result",
    "donut-mix",
    "donut-returning",
    "donut-checklist",
    "donut-payment",
  ])
    expect(patternIds).toContain(`${id}-hatch`);
  expect(html).toMatch(/<figure class="chart"><figcaption>Evolución diaria<\/figcaption>/);
  const [shop] = await test.db.select().from(shops);
  expect(html).toContain(`${shop?.name} · 1 nov – 26 nov 2026`);
  expect(html).toContain("<caption>Ingresos por medio de pago</caption>");
  expect(html).toMatch(/<h2[^>]*>Balance<\/h2>/);
  expect(html).not.toContain("<script");
});

it.each([true, false])("muestra comparación con base anterior: %s", async (previous) => {
  await seedPayments(previous);
  const html = await (await render(await login())).text();
  expect(html).toContain(previous ? "▲ +100%" : "Sin período anterior comparable");
});

it("rechaza recepción y redirige cuando falta la sesión", async () => {
  expect((await render(await login(await seedUser("reception", owner.branchId)))).status).toBe(403);
  const response = await render();
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/admin/login?next=%2Ftaller%2Findicadores");
});

it("genera HTML verificable de un KpiTile y un Donut sin código cliente", async () => {
  const { default: KpiTile } = await import("../../src/components/taller/indicators/KpiTile.astro");
  const { default: Donut } = await import("../../src/components/taller/indicators/Donut.astro");
  const container = await AstroContainer.create();
  const kpi = await container.renderToString(KpiTile, {
    props: {
      label: "Ingresos",
      value: "$20.000",
      delta: { text: "▲ +100%", direction: "up", caption: "vs. período anterior" },
    },
  });
  const donut = await container.renderToString(Donut, {
    props: {
      id: "donut-example",
      title: "Resultado del período",
      center: "60%",
      segments: [
        { label: "Balance", value: 60, text: "$6.000" },
        { label: "Devoluciones", value: 10, text: "$1.000" },
        { label: "Gastos", value: 30, text: "$3.000" },
      ],
    },
  });
  expect(kpi).toContain('class="delta delta--up"');
  expect(kpi).toContain("▲ +100% <span>vs. período anterior</span>");
  expect(kpi).toMatch(/^<div class="card taller-card">/);
  expect(kpi).not.toContain("aria-label");
  expect(donut).toContain("<pattern");
  expect(donut).toContain("stroke-dasharray");
  expect(donut).toContain('class="dense chart-data"');
  console.info("KPI_HTML", kpi);
  console.info("DONUT_HTML", donut);
});

it("normaliza los arcos con valores positivos y permite anillos del mismo título con ids propios", async () => {
  const { default: Donut } = await import("../../src/components/taller/indicators/Donut.astro");
  const container = await AstroContainer.create();
  const segments = [
    { label: "Balance", value: -5000, text: "−$5.000" },
    { label: "Devoluciones", value: 5000, text: "$5.000" },
    { label: "Gastos", value: 15000, text: "$15.000" },
  ];
  const renderDonut = (id: string) =>
    container.renderToString(Donut, {
      props: {
        id,
        title: "Resultado del período",
        center: "0%",
        segments,
        footer: [{ label: "Balance", value: "−$5.000" }],
      },
    });
  const html = await renderDonut("loss-first");
  expect(html).toContain('id="loss-first-hatch"');
  expect(await renderDonut("loss-second")).toContain('id="loss-second-hatch"');
  expect(html).toContain('stroke-dasharray="25 75"');
  expect(html).toContain('stroke-dasharray="75 25"');
  expect(html).toContain("<dt>Balance</dt><dd>−$5.000</dd>");
  expect(html).not.toMatch(/<figure\b[^>]*aria-label=/);
  const empty = await container.renderToString(Donut, {
    props: {
      id: "loss-empty",
      title: "Sin ingresos",
      center: "0%",
      segments: [{ label: "Balance", value: -5000, text: "−$5.000" }],
    },
  });
  expect(empty).toContain('stroke-dasharray="0 100"');
});

it("presenta los valores del embudo como HTML sin deformar texto ni perder estados", async () => {
  const { default: Funnel } = await import("../../src/components/taller/indicators/Funnel.astro");
  const container = await AstroContainer.create();
  const html = await container.renderToString(Funnel, {
    props: {
      title: "Trabajos por estado",
      rows: [
        { label: "Diagnóstico", status: "diagnostico", value: 2, text: "2" },
        { label: "Lista para retirar", status: "lista_para_retirar", value: 1, text: "1" },
      ],
    },
  });
  expect(html).toContain('class="status status--diagnostico"');
  expect(html).toContain("--w: 50%");
  expect(html).toContain('<span class="funnel-value">1</span>');
  expect(html).toContain('class="dense chart-data"');
  expect(html).not.toContain('preserveAspectRatio="none"');
  expect(html).not.toContain("<text");
});
