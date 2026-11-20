import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import type { EmailMessage } from "../../src/server/email/transport.ts";
import {
  sendMaintenanceReminders,
  setMaintenancePlan,
} from "../../src/server/taller/maintenance-plan.ts";
import { generateReport } from "../../src/server/taller/reports.ts";
import { createTestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null, actor: null as SessionUser | null }));
vi.mock("../../src/server/db/client.ts", async (original) => ({
  ...(await original<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Base de prueba no inicializada");
    return holder.db;
  },
}));
vi.mock("../../src/server/auth/admin-auth.ts", async (original) => ({
  ...(await original<typeof import("../../src/server/auth/admin-auth.ts")>()),
  requireAdmin: async () => holder.actor,
}));
const { default: Dashboard } = await import("../../src/pages/taller/index.astro");

const SITE_URL = "https://reservas.example.test";
const NOW = new Date("2026-11-12T15:00:00Z");
const SEED_NOW = new Date("2026-09-01T15:00:00Z");
let db: AppDb;
let shops: Awaited<ReturnType<typeof seedTwoShops>>;

beforeEach(async () => {
  const test = await createTestDb();
  db = test.db;
  holder.db = db;
  shops = await seedTwoShops(db);
  vi.stubEnv("PUBLIC_SITE_URL", `${SITE_URL}/`);
  return async () => {
    holder.db = null;
    holder.actor = null;
    await test.close();
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function seedOrder(actor: SessionUser) {
  const [customer] = await db
    .insert(customers)
    .values({
      branchId: actor.branchId,
      name: "Ana Pérez",
      phoneE164: "+56912345678",
      email: actor.email,
    })
    .returning();
  if (!customer) throw new Error("Falta cliente");
  const [bike] = await db
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
  const [order] = await db
    .insert(workOrders)
    .values({
      branchId: actor.branchId,
      customerId: customer.id,
      bikeId: bike.id,
      number: 1,
      status: "lista_para_retirar",
      requestedService: "Mantención",
      qcApprovedAt: SEED_NOW,
      receivedAt: SEED_NOW,
      createdAt: SEED_NOW,
      createdBy: actor.id,
    })
    .returning();
  if (!order) throw new Error("Falta orden");
  return order;
}

async function seedReminder(actor: SessionUser) {
  const order = await seedOrder(actor);
  const report = await generateReport(
    db,
    actor,
    order.id,
    {
      recommendations: "",
      nextChecks: "",
    },
    SEED_NOW,
  );
  if (!report.ok) throw new Error(report.code);
  expect(
    await setMaintenancePlan(
      db,
      actor,
      order.id,
      {
        nextMaintenanceDate: "2026-11-17",
        nextMaintenanceNote: "Cambio de cadena",
      },
      SEED_NOW,
    ),
  ).toEqual({ ok: true });
}

it("enlaza cada recordatorio a las reservas de su taller en un mismo envío", async () => {
  await seedReminder(shops.demo.owner);
  await seedReminder(shops.vector.owner);
  const messages: EmailMessage[] = [];
  const transport = {
    send: async (message: EmailMessage) => {
      messages.push(message);
    },
  };
  expect(await sendMaintenanceReminders(db, NOW, { transport, siteUrl: SITE_URL })).toEqual({
    sent: 2,
    failed: 0,
  });
  expect(messages).toHaveLength(2);
  for (const [key, slug] of [
    ["demo", "taller-demo"],
    ["vector", "vector-bikes"],
  ] as const) {
    const message = messages.find((entry) => entry.to === shops[key].owner.email);
    expect(message?.text).toContain(`Reservar hora: ${SITE_URL}/${slug}/reservar`);
    expect(message?.html).toContain(`href="${SITE_URL}/${slug}/reservar"`);
    expect(message?.text).not.toContain("#reserva");
  }
});

async function renderDashboard(actor: SessionUser) {
  holder.actor = actor;
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  const container = await AstroContainer.create({ astroConfig: { site: SITE_URL } });
  return container
    .renderToResponse(Dashboard, {
      request: new Request(`${SITE_URL}/taller`),
    })
    .finally(() => vi.useRealTimers());
}

it.each([
  ["vector", "vector-bikes", "owner"],
  ["vector", "vector-bikes", "mechanic"],
  ["demo", "taller-demo", "owner"],
  ["demo", "taller-demo", "mechanic"],
] as const)("/taller de %s (%s, %s) muestra su URL de reservas", async (key, slug, role) => {
  const response = await renderDashboard(shops[key][role]);
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain(`class="mono dash-url">${SITE_URL}/${slug}/reservar</span>`);
  expect(html).not.toContain("/#reservar");
  const otherSlug = key === "vector" ? "taller-demo" : "vector-bikes";
  expect(html).not.toContain(`${SITE_URL}/${otherSlug}/reservar`);
});

it("/taller conserva la página sin enlace cuando falta la URL del sitio", async () => {
  vi.stubEnv("PUBLIC_SITE_URL", undefined);
  const response = await renderDashboard(shops.demo.owner);
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain("Nueva recepción");
  expect(html).not.toContain("dash-url");
});

it("/taller conserva la página sin enlace cuando falta el perfil", async () => {
  const response = await renderDashboard({ ...shops.demo.owner, branchId: randomUUID() });
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain("Nueva recepción");
  expect(html).not.toContain("dash-url");
});
