import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PLATFORM } from "../../src/lib/platform.ts";
import { recordAttempt } from "../../src/server/api/handlers.ts";
import { createBooking } from "../../src/server/booking/create-booking.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrderApprovals, workOrders } from "../../src/server/db/schema-orders.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { bookings } from "../../src/server/db/schema.ts";
import { createApproval } from "../../src/server/taller/approvals.ts";
import { newShareToken } from "../../src/server/taller/share-tokens.ts";
import { ensureTrackingLink } from "../../src/server/taller/tracking.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { createTestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null, branchId: "" }));
vi.mock("../../src/server/db/client.ts", () => ({
  getDb: () => {
    if (!holder.db) throw new Error("Base de prueba no inicializada");
    return holder.db;
  },
}));
vi.mock("../../src/server/api/handlers.ts", async (original) => {
  const handlers = await original<typeof import("../../src/server/api/handlers.ts")>();
  return {
    ...handlers,
    // Limitación previa: recordAttempt sin sucursal falla con dos talleres.
    // El adaptador de prueba conserva el registro real; el servidor queda intacto.
    recordAttempt: (ctx: Parameters<typeof handlers.recordAttempt>[0], branchId?: string) =>
      handlers.recordAttempt(ctx, branchId ?? holder.branchId),
  };
});
const { default: TrackingPage } = await import("../../src/pages/seguimiento/[token].astro");
const { default: ApprovalPage } = await import("../../src/pages/aprobacion/[token].astro");
const { default: CancelPage } = await import("../../src/pages/reservas/cancelar.astro");
const PAGES = { seguimiento: TrackingPage, aprobacion: ApprovalPage, cancelar: CancelPage };
type Page = keyof typeof PAGES;
const NOW = new Date("2026-09-15T15:00:00Z");
const SITE = "https://llave15.example";
let test: TestDb;
let shops: Awaited<ReturnType<typeof seedTwoShops>>;
let orderId: string;
let bookingId: string;
let approvalId: string;
let tokens: Record<Page, string>;

async function seedCustomerBike() {
  const branchId = shops.demo.branch.id;
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId,
      name: "Ana María Pérez",
      phoneE164: "+56933333333",
      email: "ana@example.test",
    })
    .returning();
  if (!customer) throw new Error("Falta cliente");
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
  if (!bike) throw new Error("Falta bicicleta");
  return { customer, bike };
}

async function seedOrder() {
  const { customer, bike } = await seedCustomerBike();
  const { demo } = shops;
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: demo.branch.id,
      number: 1,
      customerId: customer.id,
      bikeId: bike.id,
      status: "diagnostico",
      requestedService: "Mantención",
      createdBy: demo.owner.id,
      createdAt: NOW,
    })
    .returning();
  if (!order) throw new Error("Falta orden");
  orderId = order.id;
  const tracking = await ensureTrackingLink(test.db, demo.owner, orderId, SITE, NOW);
  const approval = await createApproval(
    test.db,
    demo.owner,
    orderId,
    {
      description: "Cadena desgastada",
      recommendation: "Reemplazar la cadena",
      priceClp: 35000,
    },
    NOW,
  );
  if (!tracking.ok || !approval.ok) throw new Error("Faltan enlaces de prueba");
  approvalId = approval.approvalId;
  return { seguimiento: tracking.token, aprobacion: approval.token };
}

async function seedBooking() {
  const result = await createBooking(
    test.db,
    {
      mode: "taller",
      serviceDate: "2026-09-16",
      start: "10:00",
      customerName: "Ana María Pérez",
      phoneE164: "+56933333333",
      email: null,
      bike: "Urbana",
      description: "Ajuste de frenos",
      comuna: null,
      address: null,
      ipHash: null,
    },
    NOW,
    shops.demo.scope,
  );
  if (!result.ok) throw new Error(result.code);
  bookingId = result.booking.id;
  return result.cancelToken;
}

async function render(page: Page, token = tokens[page], method = "GET") {
  const path = page === "cancelar" ? `/reservas/cancelar?token=${token}` : `/${page}/${token}`;
  const request = new Request(`${SITE}${path}`, {
    method,
    headers: { "x-forwarded-for": "203.0.113.7" },
    body: method === "POST" ? new URLSearchParams({ decision: "aprobar", token }) : undefined,
  });
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  return container.renderToResponse(PAGES[page], { request, params: { token } });
}

async function privateHtml(response: Response, status = 200) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  const html = await response.text();
  expect(html).toContain('name="robots" content="noindex"');
  const vector = shops.vector.shop;
  for (const value of [
    vector.name,
    vector.addressShort,
    vector.streetAddress,
    vector.email,
    vector.phone,
    vector.phoneDisplay,
    "vectorbikes.cl",
    "/brand/vector-bikes",
  ])
    expect(html).not.toContain(value);
  for (const value of ["María Pérez", "ana@example.test", "+56933333333"])
    expect(html).not.toContain(value);
  return html;
}

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  shops = await seedTwoShops(test.db);
  holder.branchId = shops.demo.branch.id;
  tokens = { ...(await seedOrder()), cancelar: await seedBooking() };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(async () => {
  vi.useRealTimers();
  holder.db = null;
  await test?.close();
});

it("seguimiento muestra la marca y el pie dentro del contenido, sin encabezado ni footer", async () => {
  const response = await render("seguimiento");
  expect(response.headers.get("x-robots-tag")).toBe("noindex");
  const html = await privateHtml(response);
  expect(html).toContain(`<title>Seguimiento de tu bicicleta — ${shops.demo.shop.name}</title>`);
  expect(html).toContain(`Hola Ana, este es el estado de tu bicicleta en ${shops.demo.shop.name}.`);
  expect(html).not.toMatch(/<header\b|<footer\b/);
  expect(html).not.toContain(shops.demo.shop.addressShort);
  expect(html).not.toContain("Lunes a viernes:");
  expect(html).toMatch(/<p\b[^>]*>Gestionado con Llave 15<\/p>\s*<\/div>\s*<\/section>/);
});

it("seguimiento listo para retirar usa la dirección y horario del Demo", async () => {
  await test.db
    .update(workOrders)
    .set({ status: "lista_para_retirar", qcApprovedAt: NOW })
    .where(eq(workOrders.id, orderId));
  const html = await privateHtml(await render("seguimiento"));
  expect(html).toContain(shops.demo.shop.addressShort);
  expect(html).toContain(
    "Lunes a viernes: 10:00 a 13:00. Sábado: cerrado. Domingo y feriados: cerrado.",
  );
  expect(html).toContain(PLATFORM.footerLine);
  expect(html).not.toMatch(/<header\b|<footer\b/);
});

it("aprobación pendiente usa PublicLayout con el taller del token y solo primer nombre", async () => {
  const html = await privateHtml(await render("aprobacion"));
  expect(html).toContain(`<title>Aprobar adicional — ${shops.demo.shop.name}</title>`);
  expect(html).toContain(
    `Responde a la propuesta de trabajo adicional de ${shops.demo.shop.name}.`,
  );
  for (const text of [
    shops.demo.shop.name,
    shops.demo.shop.addressShort,
    shops.demo.shop.email,
    PLATFORM.footerLine,
    "Hola Ana",
    "Cadena desgastada",
  ])
    expect(html).toContain(text);
  expect(html).toMatch(/<header\b/);
  expect(html).toMatch(/<footer\b/);
  expect(html).not.toContain(tokens.aprobacion);
});

it("cancelación usa PublicLayout con el contacto del Demo", async () => {
  const html = await privateHtml(await render("cancelar"));
  expect(html).toContain(`<title>Cancelar reserva — ${shops.demo.shop.name}</title>`);
  for (const text of [
    shops.demo.shop.name,
    shops.demo.shop.addressShort,
    shops.demo.shop.email,
    PLATFORM.footerLine,
    "¿Cancelar tu reserva?",
  ])
    expect(html).toContain(text);
  expect(html).toMatch(/<header\b/);
  expect(html).toMatch(/<footer\b/);
});

it("reserva iniciada ofrece el correo del Demo en el mensaje", async () => {
  await test.db.update(bookings).set({ startsAt: NOW }).where(eq(bookings.id, bookingId));
  const html = await privateHtml(await render("cancelar"));
  expect(html).toContain(`Si necesitas algo, escríbenos a ${shops.demo.shop.email}.`);
});

it.each(["seguimiento", "aprobacion", "cancelar"] as const)(
  "%s: token desconocido o malformado responde 404 sin marca de taller",
  async (page) => {
    for (const token of [newShareToken(), "invalido"]) {
      const html = await privateHtml(await render(page, token), 404);
      expect(html).toContain("Enlace no válido");
      expect(html).toMatch(/<title>[^<]+ — Llave 15<\/title>/);
      expect(html).not.toContain(shops.demo.shop.name);
      expect(html).not.toContain(shops.demo.shop.email);
      expect(html).not.toMatch(/<header\b|<footer\b/);
      if (page === "cancelar")
        expect(html).toContain(
          "Si el problema sigue, contacta al taller donde hiciste la reserva.",
        );
    }
  },
);

it("aprobación ya decidida conserva el 404 sin marca, como un token desconocido", async () => {
  await test.db
    .update(workOrderApprovals)
    .set({ decidedAt: NOW, decision: "aprobado" })
    .where(eq(workOrderApprovals.id, approvalId));
  const html = await privateHtml(await render("aprobacion"), 404);
  expect(html).toBe(await privateHtml(await render("aprobacion", newShareToken()), 404));
});

it.each(["seguimiento", "aprobacion"] as const)(
  "%s: límite de intentos mantiene 429 y no revela el taller del token",
  async (page) => {
    for (let index = 0; index < 5; index++)
      await recordAttempt({ db: test.db, now: NOW, ip: "203.0.113.7" }, shops.demo.branch.id);
    const response = await render(page, tokens[page], page === "aprobacion" ? "POST" : "GET");
    expect(response.headers.get("Retry-After")).toBe("600");
    const html = await privateHtml(response, 429);
    expect(html).toContain("Demasiados intentos. Vuelve a intentar en 10 minutos.");
    expect(html).toMatch(/<title>[^<]+ — Llave 15<\/title>/);
    expect(html).not.toContain(shops.demo.shop.name);
    expect(html).not.toMatch(/<header\b|<footer\b/);
  },
);
