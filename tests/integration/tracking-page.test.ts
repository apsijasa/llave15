import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { log } from "../../src/lib/log.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { bookingRequests, branches, users } from "../../src/server/db/schema.ts";
import { newShareToken } from "../../src/server/taller/share-tokens.ts";
import { ensureTrackingLink, viewTrackingByToken } from "../../src/server/taller/tracking.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null }));
vi.mock("../../src/server/db/client.ts", () => ({
  getDb: () => {
    if (!holder.db) throw new Error("Base de prueba no inicializada");
    return holder.db;
  },
}));
vi.mock("../../src/server/taller/tracking.ts", async (original) => {
  const tracking = await original<typeof import("../../src/server/taller/tracking.ts")>();
  return { ...tracking, viewTrackingByToken: vi.fn(tracking.viewTrackingByToken) };
});
const { default: TrackingPage } = await import("../../src/pages/seguimiento/[token].astro");
const SITE = "https://vectorbikes.cl";
const NOW = new Date("2026-11-12T15:00:00Z");
const PRIVATE = ["+56912345678", "ana@example.test", "12.345.678-5", "María", "Pérez"];
let test: TestDb;
let owner: SessionUser;
let orderId: string;
let token: string;

async function seedOwner() {
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
  owner = { id: user.id, branchId: branch.id, role: "owner", name: user.name, email: user.email };
}

async function seedOrder() {
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: owner.branchId,
      name: "Ana María Pérez",
      phoneE164: PRIVATE[0]!,
      email: PRIVATE[1],
      rut: PRIVATE[2],
    })
    .returning();
  if (!customer) throw new Error("Falta cliente");
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: owner.branchId,
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
      branchId: owner.branchId,
      number: 1,
      customerId: customer.id,
      bikeId: bike.id,
      status: "recibida",
      requestedService: "Mantención",
      diagnosis: "Diagnóstico privado",
      createdBy: owner.id,
      estimatedDeliveryDate: "2026-11-14",
      createdAt: NOW,
    })
    .returning();
  if (!order) throw new Error("Falta orden");
  orderId = order.id;
}

async function render(value = token, method = "GET", ip = "203.0.113.7", origin?: string) {
  const headers: Record<string, string> = { "x-forwarded-for": ip };
  if (origin) headers.origin = origin;
  const request = new Request(`${SITE}/seguimiento/${value}`, { method, headers });
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  return container.renderToResponse(TrackingPage, { request, params: { token: value } });
}

async function responseBytes(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-robots-tag")).toBe("noindex");
  const body = await response.text();
  expect(body).toContain('<meta name="robots" content="noindex">');
  return { status: response.status, headers: [...response.headers.entries()].sort(), body };
}

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  await seedOwner();
  await seedOrder();
  const link = await ensureTrackingLink(test.db, owner, orderId, SITE, NOW);
  if (!link.ok) throw new Error(link.code);
  token = link.token;
  vi.clearAllMocks();
  for (const level of ["info", "warn", "error"] as const)
    vi.spyOn(log, level).mockImplementation(() => {});
});

afterEach(async () => {
  try {
    for (const level of ["info", "warn", "error"] as const) {
      const calls = JSON.stringify(vi.mocked(log[level]).mock.calls);
      for (const secret of [...PRIVATE, token]) expect(calls).not.toContain(secret);
    }
  } finally {
    holder.db = null;
    vi.restoreAllMocks();
    await test?.close();
  }
});

it.each([undefined, "https://visor.example.test/ruta?token=privado"])(
  "GET válido respeta privacidad y cabeceras, con Origin %s",
  async (origin) => {
    const bytes = await responseBytes(await render(token, "GET", "203.0.113.7", origin));
    expect(bytes.status).toBe(200);
    for (const text of [
      "Seguimiento de tu bicicleta",
      "OT-00001",
      "Ana",
      "Trek Marlin",
      "Recibida",
      "Orden creada",
      "(actual)",
      "14-11-2026",
    ])
      expect(bytes.body).toContain(text);
    expect(bytes.body.match(/<h1[ >]/g)).toHaveLength(1);
    expect(bytes.body).not.toMatch(/<form\b|<header\b|<footer\b/);
    for (const secret of [token, ...PRIVATE, "Diagnóstico privado"])
      expect(bytes.body).not.toContain(secret);
    expect(log.info).toHaveBeenCalledExactlyOnceWith("tracking.origin", {
      origin: origin ? "https://visor.example.test" : "ausente",
    });
    expect(await test.db.select().from(bookingRequests)).toEqual([]);
  },
);

it("inexistente, malformado y orden anulada dan 404 idénticos", async () => {
  await test.db.update(workOrders).set({ voidedAt: NOW }).where(eq(workOrders.id, orderId));
  const responses = [];
  for (const value of [newShareToken(), "invalido", token]) {
    const bytes = await responseBytes(await render(value));
    expect(bytes.status).toBe(404);
    expect(bytes.body).toContain("Enlace no válido");
    for (const secret of [value, ...PRIVATE]) expect(bytes.body).not.toContain(secret);
    responses.push(bytes);
  }
  expect(responses[1]).toEqual(responses[0]);
  expect(responses[2]).toEqual(responses[0]);
});

it("cinco 404 bloquean esa IP antes de consultar; otra IP sigue en 200", async () => {
  for (let index = 0; index < 5; index++)
    expect((await render(index % 2 ? "invalido" : newShareToken())).status).toBe(404);
  expect(await test.db.select().from(bookingRequests)).toHaveLength(5);
  vi.mocked(viewTrackingByToken).mockClear();
  const response = await render();
  expect(response.headers.get("Retry-After")).toBe("600");
  const bytes = await responseBytes(response);
  expect(bytes.status).toBe(429);
  expect(bytes.body).toContain("Demasiados intentos. Vuelve a intentar en 10 minutos.");
  expect(viewTrackingByToken).not.toHaveBeenCalled();
  expect((await render(token, "GET", "203.0.113.8")).status).toBe(200);
});

it("las visitas válidas no consumen el límite", async () => {
  for (let index = 0; index < 6; index++) expect((await render()).status).toBe(200);
  expect(await test.db.select().from(bookingRequests)).toEqual([]);
});

it.each(["POST", "PUT", "PATCH", "DELETE"])(
  "%s recibe el 404 fijo sin consultar",
  async (method) => {
    const missing = await responseBytes(await render(newShareToken()));
    vi.mocked(viewTrackingByToken).mockClear();
    expect(await responseBytes(await render(token, method))).toEqual(missing);
    expect(viewTrackingByToken).not.toHaveBeenCalled();
    expect(await test.db.select().from(bookingRequests)).toHaveLength(1);
  },
);

it("muestra la dirección y horario solo cuando está lista para retirar", async () => {
  expect((await responseBytes(await render())).body).not.toContain("Av. Kennedy 7666");
  await test.db
    .update(workOrders)
    .set({ status: "lista_para_retirar", qcApprovedAt: NOW })
    .where(eq(workOrders.id, orderId));
  const bytes = await responseBytes(await render());
  expect(bytes.status).toBe(200);
  for (const text of ["Lista para retirar", "Av. Kennedy 7666", "15:00", "20:00", "10:00", "14:00"])
    expect(bytes.body).toContain(text);
});
