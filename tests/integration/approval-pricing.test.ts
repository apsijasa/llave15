import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import {
  workOrderApprovals,
  workOrderItems,
  workOrders,
} from "../../src/server/db/schema-orders.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { createApproval, listApprovals, viewApproval } from "../../src/server/taller/approvals.ts";
import type { PricingMode } from "../../src/server/taller/rules.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null, user: null as SessionUser | null }));
vi.mock("../../src/server/db/client.ts", async (original) => ({
  ...(await original<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => holder.db,
}));
vi.mock("../../src/server/auth/admin-auth.ts", async (original) => ({
  ...(await original<typeof import("../../src/server/auth/admin-auth.ts")>()),
  requireAdmin: async () => holder.user,
}));
const { default: ApprovalPage } = await import("../../src/pages/aprobacion/[token].astro");
const { default: AdditionalPage } = await import(
  "../../src/pages/taller/ordenes/[id]/adicional.astro"
);
const NOW = new Date("2026-11-14T15:00:00Z");
const SITE = "https://vectorbikes.cl";
const INPUT = {
  description: "Cadena desgastada",
  recommendation: "Reemplazar la cadena",
  priceClp: 10000,
};
let test: TestDb;
let owner: SessionUser;
let orderId: string;

async function seedOrder(pricingMode: PricingMode) {
  const customerId = randomUUID();
  const bikeId = randomUUID();
  orderId = randomUUID();
  await test.db.insert(customers).values({
    id: customerId,
    branchId: owner.branchId,
    name: "Ana María Pérez",
    phoneE164: "+56912345678",
    email: "ana@example.test",
    rut: "12.345.678-5",
  });
  await test.db.insert(bikes).values({
    id: bikeId,
    branchId: owner.branchId,
    customerId,
    brand: "Trek",
    model: "Marlin",
    bikeType: "mtb",
  });
  await test.db.insert(workOrders).values({
    id: orderId,
    branchId: owner.branchId,
    number: 1,
    customerId,
    bikeId,
    pricingMode,
    status: "diagnostico",
    requestedService: "Mantención",
    createdBy: owner.id,
  });
}

async function proposal(priceClp = INPUT.priceClp) {
  const result = await createApproval(test.db, owner, orderId, { ...INPUT, priceClp }, NOW);
  if (!result.ok) throw new Error(result.code);
  return result;
}

async function renderPublic(token: string, decision?: string, origin?: string) {
  const headers: Record<string, string> = { "x-forwarded-for": "203.0.113.7" };
  if (origin) headers.origin = origin;
  if (decision) headers["content-type"] = "application/x-www-form-urlencoded";
  const request = new Request(`${SITE}/aprobacion/${token}`, {
    method: decision ? "POST" : "GET",
    headers,
    body: decision ? new URLSearchParams({ decision }) : undefined,
  });
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  return container.renderToResponse(ApprovalPage, { request, params: { token } });
}

async function renderStaff() {
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  return container.renderToResponse(AdditionalPage, {
    request: new Request(`${SITE}/taller/ordenes/${orderId}/adicional`),
    params: { id: orderId },
  });
}

beforeEach(async () => {
  test = await createTestDb();
  owner = {
    id: randomUUID(),
    branchId: randomUUID(),
    role: "owner",
    name: "Dueño",
    email: "owner@example.test",
  };
  await test.db.insert(branches).values({ id: owner.branchId, name: "Vitacura" });
  await test.db.insert(users).values({ ...owner, passwordHash: "hash" });
  holder.db = test.db;
  holder.user = owner;
  return async () => {
    holder.db = null;
    holder.user = null;
    await test.close();
  };
});

it("expone el régimen neto en las lecturas pública e interna sin exponer datos personales", async () => {
  await seedOrder("neto");
  const { token, approvalId } = await proposal();
  expect(await viewApproval(test.db, token)).toEqual({
    view: "pending",
    approval: { firstName: "Ana", bike: "Trek Marlin", ...INPUT, pricingMode: "neto" },
  });
  expect(await listApprovals(test.db, owner, orderId)).toMatchObject([
    { id: approvalId, priceClp: 10000, pricingMode: "neto" },
  ]);
  expect(await listApprovals(test.db, { ...owner, branchId: randomUUID() }, orderId)).toEqual([]);
});

it.each([
  [10000, "$10.000", "$1.900", "$11.900"],
  [10003, "$10.003", "$1.901", "$11.904"],
] as const)(
  "muestra neto, IVA redondeado y total para un adicional de %s",
  async (price, net, vat, total) => {
    await seedOrder("neto");
    const { token } = await proposal(price);
    const response = await renderPublic(token);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const html = (await response.text()).replace(/>\s+</g, "><");
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).toContain("Hola Ana");
    expect(html).toMatch(new RegExp(`>Precio neto</[^>]+><[^>]+>\\${net}<`));
    expect(html).toMatch(new RegExp(`>IVA \\(19%\\)</[^>]+><[^>]+>\\${vat}<`));
    expect(html).toMatch(new RegExp(`>Total</[^>]+><[^>]+>\\${total}<`));
    for (const secret of ["María Pérez", "+56912345678", "ana@example.test", "12.345.678-5", token])
      expect(html).not.toContain(secret);
  },
);

it.each([undefined, "https://visor.example.test"])(
  "aprueba sin exigir Origin (%s), guarda el neto y cobra el total con IVA una sola vez",
  async (origin) => {
    await seedOrder("neto");
    const { token, approvalId } = await proposal();
    expect(await test.db.select().from(workOrderItems)).toEqual([]);
    const response = await renderPublic(token, "aprobar", origin);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Gracias, registramos tu respuesta: Aprobado");
    expect(await test.db.select().from(workOrderItems)).toMatchObject([
      { approvalId, unitPriceClp: 10000, quantity: 1, origin: "adicional" },
    ]);
    expect(await test.db.select().from(workOrders)).toMatchObject([
      { pricingMode: "neto", subtotalClp: 10000, vatClp: 1900, totalClp: 11900 },
    ]);
    expect(await test.db.select().from(workOrderApprovals)).toMatchObject([{ priceClp: 10000 }]);
    expect((await renderPublic(token, "aprobar", origin)).status).toBe(404);
    expect(await test.db.select().from(workOrderItems)).toHaveLength(1);
  },
);

it("rotula Precio neto y desglosa el IVA de cada propuesta en la página del dueño", async () => {
  await seedOrder("neto");
  await proposal();
  await proposal(10003);
  const response = await renderStaff();
  expect(response.status).toBe(200);
  const html = (await response.text()).replace(/>\s+</g, "><");
  expect(html).toContain('<label for="priceClp">Precio neto</label>');
  expect(html).toContain("$10.000 + IVA $1.900 = $11.900");
  expect(html).toContain("$10.003 + IVA $1.901 = $11.904");
});

it("conserva la respuesta pública, el precio y el marcado de las órdenes final", async () => {
  await seedOrder("final");
  const { token } = await proposal();
  expect(await viewApproval(test.db, token)).toEqual({
    view: "pending",
    approval: { firstName: "Ana", bike: "Trek Marlin", ...INPUT },
  });
  const html = (await (await renderPublic(token)).text()).replace(/>\s+</g, "><");
  expect(html).toContain(
    '<div class="ticket-total"><span class="label">Precio</span><strong>$10.000</strong></div>',
  );
  const staffHtml = (await (await renderStaff()).text()).replace(/>\s+</g, "><");
  expect(staffHtml).toContain('<label for="priceClp">Precio</label>');
  expect(staffHtml).toContain('<td class="mono">$10.000</td>');
  for (const page of [html, staffHtml]) {
    expect(page).not.toContain("Precio neto");
    expect(page).not.toContain("IVA");
  }
  expect((await renderPublic(token, "aprobar")).status).toBe(200);
  const [order] = await test.db.select().from(workOrders).where(eq(workOrders.id, orderId));
  expect(order).toMatchObject({ subtotalClp: 0, vatClp: 0, totalClp: 10000 });
});
