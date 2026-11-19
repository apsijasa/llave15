import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ReportView from "../../src/components/taller/ReportView.astro";
import { PLATFORM } from "../../src/lib/platform.ts";
import { recordAttempt } from "../../src/server/api/handlers.ts";
import { hashPassword, loginAdmin } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { shops as shopTable } from "../../src/server/db/schema-shops.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { users } from "../../src/server/db/schema.ts";
import type { ObjectStorage } from "../../src/server/storage/storage.ts";
import { buildLabel } from "../../src/server/taller/label.ts";
import { generateReport, getReportForStaff } from "../../src/server/taller/reports.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { createTestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null }));
vi.mock("../../src/server/db/client.ts", () => ({
  getDb: () => {
    if (!holder.db) throw new Error("Base de prueba no inicializada");
    return holder.db;
  },
}));
vi.mock("../../src/server/storage/storage.ts", () => ({
  getStorage: async (): Promise<ObjectStorage> => ({
    get: async () => null,
    put: async () => {},
    delete: async () => {},
    exists: async () => false,
  }),
}));
const { default: PublicPage } = await import("../../src/pages/informe/[token].astro");
const { default: StaffPage } = await import("../../src/pages/taller/ordenes/[id]/informe.astro");
const NOW = new Date("2026-11-19T15:00:00Z");
const SITE = "https://vectorbikes.cl";
const PASSWORD = "clave-larga-de-prueba";
const INPUT = { recommendations: "Lubricar cadena", nextChecks: "Revisar frenos" };
let test: TestDb;
let shops: Awaited<ReturnType<typeof seedTwoShops>>;
let orders: Record<"vector" | "demo", { id: string; token: string }>;

async function seedCustomerBike(actor: SessionUser) {
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: actor.branchId,
      name: "Ana María Pérez",
      phoneE164: "+56933333333",
      email: "ana@example.test",
    })
    .returning();
  if (!customer) throw new Error("Falta cliente");
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: actor.branchId,
      customerId: customer.id,
      brand: "Trek",
      model: "Marlin",
      bikeType: "mtb",
    })
    .returning();
  if (!bike) throw new Error("Falta bicicleta");
  return { customer, bike };
}

async function seedReport(actor: SessionUser) {
  const { customer, bike } = await seedCustomerBike(actor);
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: actor.branchId,
      number: 1,
      customerId: customer.id,
      bikeId: bike.id,
      status: "lista_para_retirar",
      requestedService: "Mantención",
      qcApprovedAt: NOW,
      createdBy: actor.id,
    })
    .returning();
  if (!order) throw new Error("Falta orden");
  const report = await generateReport(test.db, actor, order.id, INPUT, NOW);
  if (!report.ok) throw new Error(report.code);
  return { id: order.id, token: report.token };
}

async function renderPublic(token: string, method = "GET") {
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  return container.renderToResponse(PublicPage, {
    request: new Request(`${SITE}/informe/${token}`, {
      method,
      headers: { "x-forwarded-for": "203.0.113.7" },
    }),
    params: { token },
  });
}

async function renderStaff() {
  const actor = shops.demo.owner;
  await test.db
    .update(users)
    .set({ passwordHash: await hashPassword(PASSWORD) })
    .where(eq(users.id, actor.id));
  const session = await loginAdmin(test.db, {
    email: actor.email,
    password: PASSWORD,
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!session.ok) throw new Error(session.code);
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  return container.renderToResponse(StaffPage, {
    request: new Request(`${SITE}/taller/ordenes/${orders.demo.id}/informe`, {
      method: "POST",
      headers: {
        cookie: `vb_admin_session=${session.token}`,
        origin: SITE,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(INPUT),
    }),
    params: { id: orders.demo.id },
  });
}

function expectNoBrand(html: string, shop: typeof shops.vector.shop) {
  for (const value of [shop.name, shop.addressShort, shop.email, shop.phoneDisplay])
    expect(html).not.toContain(value);
}

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  shops = await seedTwoShops(test.db);
  for (const entry of [shops.vector, shops.demo]) {
    await test.db
      .update(shopTable)
      .set({ logoKey: `shops/${entry.shop.id}/logo.png` })
      .where(eq(shopTable.id, entry.shop.id));
  }
  await test.db
    .update(shopTable)
    .set({ certifications: ["Certificación Demo"] })
    .where(eq(shopTable.id, shops.demo.shop.id));
  orders = {
    vector: await seedReport(shops.vector.owner),
    demo: await seedReport(shops.demo.owner),
  };
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterEach(async () => {
  vi.useRealTimers();
  holder.db = null;
  await test?.close();
});

it.each(["vector", "demo"] as const)(
  "el informe de %s usa solo el taller del token",
  async (key) => {
    const own = shops[key].shop;
    const other = shops[key === "demo" ? "vector" : "demo"].shop;
    const response = await renderPublic(orders[key].token);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    const html = await response.text();
    expect(html).toContain(`<title>Informe de servicio — ${own.name}</title>`);
    for (const value of [own.name, own.addressShort, own.email, own.phoneDisplay])
      expect(html).toContain(value);
    const logo = `<img src="/${own.slug}/logo" alt="${own.name}"`;
    expect(html.split(logo)).toHaveLength(2);
    expect(html.indexOf(logo)).toBeLessThan(html.indexOf("<h1"));
    expect(html).toMatch(/<p\b[^>]*>Gestionado con Llave 15<\/p>\s*<\/div>\s*<\/section>/);
    expect(html).not.toMatch(/<header\b|<footer\b/);
    expectNoBrand(html, other);
    for (const value of ["María", "Pérez", "ana@example.test", "+56933333333", orders[key].token])
      expect(html).not.toContain(value);
    if (key === "demo") expect(html).toContain("Certificaciones: Certificación Demo");
  },
);

it("sin logo no renderiza una imagen de marca", async () => {
  await test.db
    .update(shopTable)
    .set({ logoKey: null })
    .where(eq(shopTable.id, shops.demo.shop.id));
  const html = await (await renderPublic(orders.demo.token)).text();
  expect(html).not.toMatch(/<img\b/);
  expect(html).toContain(shops.demo.shop.name);
  expect(html).toContain(PLATFORM.footerLine);
});

it("el personal usa la marca de su sucursal en el informe y WhatsApp", async () => {
  const response = await renderStaff();
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain("<title>OT-00001 · Informe — Llave 15</title>");
  const href = html.match(/href="(https:\/\/wa.me\/[^"]+)"/)?.[1];
  expect(href).toBeDefined();
  expect(decodeURIComponent(href ?? "")).toContain(
    "Hola Ana, aquí está el informe del servicio de tu bicicleta en Taller Demo:",
  );
  expect(html).toContain(
    `${shops.demo.shop.name} · ${shops.demo.shop.addressShort} · ${shops.demo.shop.email} · ${shops.demo.shop.phoneDisplay}`,
  );
  expect(html).toContain("Certificaciones: Certificación Demo");
  const article = html.match(/<article\b[\s\S]*<\/article>/)?.[0];
  expect(article).toBeDefined();
  expectNoBrand(article ?? "", shops.vector.shop);
});

it.each(["vector", "demo"] as const)("la etiqueta de %s titula con la plataforma", async (key) => {
  const result = await buildLabel(test.db, shops[key].owner, orders[key].id, SITE, {
    toSvg: async () => "<svg></svg>",
  });
  if (!result.ok) throw new Error(result.code);
  expect(result.html).toContain("<title>Etiqueta OT-00001 — Llave 15</title>");
  expectNoBrand(result.html, shops.vector.shop);
  expectNoBrand(result.html, shops.demo.shop);
});

it("ReportView sin brand omite contacto y certificaciones y conserva el total", async () => {
  const report = await getReportForStaff(test.db, shops.demo.owner, orders.demo.id);
  if (!report) throw new Error("Falta informe");
  const container = await AstroContainer.create();
  const html = await container.renderToString(ReportView, {
    props: { snapshot: report.snapshot, photos: {} },
  });
  expect(html).not.toContain("Contacto del taller");
  expect(html).not.toContain("Certificaciones");
  expect(html).toContain("Total");
  expectNoBrand(html, shops.vector.shop);
  expectNoBrand(html, shops.demo.shop);
});

it("el límite no revela la marca del token y conserva el 429", async () => {
  for (let index = 0; index < 5; index++)
    await recordAttempt({ db: test.db, now: NOW, ip: "203.0.113.7" }, shops.demo.branch.id);
  const response = await renderPublic(orders.demo.token);
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("600");
  const html = await response.text();
  expect(html).toContain("<title>Informe de servicio — Llave 15</title>");
  expect(html).toContain("Demasiados intentos. Vuelve a intentar en 10 minutos.");
  expectNoBrand(html, shops.vector.shop);
  expectNoBrand(html, shops.demo.shop);
});

it("un método distinto de GET conserva el 404 sin marca de taller", async () => {
  const response = await renderPublic(orders.demo.token, "POST");
  expect(response.status).toBe(404);
  const html = await response.text();
  expect(html).toContain("Enlace no válido");
  expect(html).toContain("<title>Informe de servicio — Llave 15</title>");
  expectNoBrand(html, shops.vector.shop);
  expectNoBrand(html, shops.demo.shop);
});
