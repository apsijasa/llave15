import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { shops } from "../../src/server/db/schema-shops.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import type { ObjectStorage } from "../../src/server/storage/storage.ts";
import { generateReport } from "../../src/server/taller/reports.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null }));
vi.mock("../../src/server/db/client.ts", () => ({
  getDb: () => {
    if (!holder.db) throw new Error("Base de prueba no inicializada");
    return holder.db;
  },
}));
vi.mock("../../src/server/storage/storage.ts", () => ({
  getStorage: vi.fn(
    async (): Promise<ObjectStorage> => ({
      get: async () => null,
      put: async () => {},
      delete: async () => {},
      exists: async () => false,
    }),
  ),
}));
const { default: ReportPage } = await import("../../src/pages/informe/[token].astro");
const SITE = "https://vectorbikes.cl";
const NOW = new Date("2026-11-12T15:00:00Z");
const LOGO = '<img src="/vector-bikes/logo" alt="Vector Bikes"';
let test: TestDb;

async function seedReport(): Promise<string> {
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta sucursal");
  const [user] = await test.db
    .insert(users)
    .values({
      branchId: branch.id,
      role: "owner",
      name: "Dueño",
      email: "owner@example.test",
      passwordHash: "hash",
    })
    .returning();
  if (!user) throw new Error("Falta usuario");
  const owner: SessionUser = {
    id: user.id,
    branchId: branch.id,
    role: "owner",
    name: user.name,
    email: user.email,
  };
  const [customer] = await test.db
    .insert(customers)
    .values({ branchId: branch.id, name: "Ana Pérez", phoneE164: "+56912345678" })
    .returning();
  if (!customer) throw new Error("Falta cliente");
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: branch.id,
      customerId: customer.id,
      brand: "Trek",
      model: "Marlin",
      bikeType: "mtb",
    })
    .returning();
  if (!bike) throw new Error("Falta bicicleta");
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: branch.id,
      number: 1,
      customerId: customer.id,
      bikeId: bike.id,
      status: "lista_para_retirar",
      requestedService: "Mantención",
      qcApprovedAt: NOW,
      createdBy: owner.id,
    })
    .returning();
  if (!order) throw new Error("Falta orden");
  const report = await generateReport(
    test.db,
    owner,
    order.id,
    { recommendations: "", nextChecks: "" },
    NOW,
  );
  if (!report.ok) throw new Error(report.code);
  return report.token;
}

async function render(token: string) {
  const request = new Request(`${SITE}/informe/${token}`, {
    headers: { "x-forwarded-for": "203.0.113.7" },
  });
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  return (await container.renderToResponse(ReportPage, { request, params: { token } })).text();
}

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  await test.db
    .update(shops)
    .set({ logoKey: "shops/vector-bikes/logo.png" })
    .where(eq(shops.slug, "vector-bikes"));
  return async () => {
    holder.db = null;
    await test.close();
  };
});

it("el informe público lleva el logo una sola vez, antes del título", async () => {
  const html = await render(await seedReport());
  expect(html.split(LOGO)).toHaveLength(2);
  expect(html.indexOf(LOGO)).toBeLessThan(html.indexOf("<h1"));
  expect(html).toContain("Av. Kennedy 7666, Vitacura · info@vectorbikes.cl");
});

it("un enlace no válido no muestra el logo", async () => {
  await seedReport();
  expect(await render("a".repeat(43))).not.toContain(LOGO);
});
