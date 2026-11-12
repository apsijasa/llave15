import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { log } from "../../src/lib/log.ts";
import { hashPassword, loginAdmin } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
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
  getStorage: async (): Promise<ObjectStorage> => ({
    get: async () => null,
    put: vi.fn(),
    delete: vi.fn(),
    exists: async () => false,
  }),
}));
const { default: StaffPage } = await import("../../src/pages/taller/ordenes/[id]/informe.astro");
const { default: PublicPage } = await import("../../src/pages/informe/[token].astro");
const NOW = new Date("2026-11-12T15:00:00Z");
const SITE = "https://vectorbikes.cl";
const PASSWORD = "clave-larga-de-prueba";
const FIELDS = {
  recommendations: "Lubricar la cadena",
  nextChecks: "Revisar transmisión",
  nextMaintenanceDate: "2027-05-12",
  nextMaintenanceNote: "Cambio de cadena",
};
let test: TestDb;
let owner: SessionUser;
let orderId: string;
let session: string;

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
      passwordHash: await hashPassword(PASSWORD),
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
      email: "ana@example.test",
      phoneE164: "+56912345678",
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
      status: "lista_para_retirar",
      requestedService: "Mantención",
      qcApprovedAt: NOW,
      receivedAt: NOW,
      createdBy: owner.id,
    })
    .returning();
  if (!order) throw new Error("Falta orden");
  orderId = order.id;
}

async function render(data?: Record<string, string>, cookie = session, origin = SITE) {
  const headers: Record<string, string> = { cookie: `vb_admin_session=${cookie}` };
  if (data) {
    headers.origin = origin;
    headers["content-type"] = "application/x-www-form-urlencoded";
  }
  const request = new Request(`${SITE}/taller/ordenes/${orderId}/informe`, {
    method: data ? "POST" : "GET",
    headers,
    body: data ? new URLSearchParams(data) : undefined,
  });
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  return container
    .renderToResponse(StaffPage, { request, params: { id: orderId } })
    .finally(() => vi.useRealTimers());
}

async function publicRender(token: string) {
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  return container.renderToResponse(PublicPage, {
    request: new Request(`${SITE}/informe/${token}`, {
      headers: { "x-forwarded-for": "203.0.113.7" },
    }),
    params: { token },
  });
}

async function getPlan() {
  const { getMaintenancePlan } = await import("../../src/server/taller/maintenance-plan.ts");
  return getMaintenancePlan(test.db, owner, orderId);
}

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(log, level);
  await seedOwner();
  await seedOrder();
  const result = await loginAdmin(test.db, {
    email: owner.email,
    password: PASSWORD,
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!result.ok) throw new Error(result.code);
  session = result.token;
  return async () => {
    holder.db = null;
    await test.close();
  };
});

afterEach(() => {
  for (const level of ["info", "warn", "error"] as const) {
    const calls = JSON.stringify(vi.mocked(log[level]).mock.calls);
    for (const secret of [owner.email, "ana@example.test", "+56912345678", session])
      expect(calls).not.toContain(secret);
  }
  vi.restoreAllMocks();
});

it("prellena la sugerencia cuando todavía no existe informe", async () => {
  const response = await render();
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toMatch(/<input\b[^>]*name="nextMaintenanceDate"[^>]*value="2027-05-12"/);
  expect(html).toContain("Nota para el cliente (opcional)");
  expect(html).toContain("Déjala vacía si no quieres que le avisemos.");
});

it("genera por POST, guarda el plan y lo muestra con el logo en el informe público", async () => {
  const response = await render(FIELDS);
  expect(response.status).toBe(200);
  const html = await response.text();
  const match = html.match(/https:\/\/vectorbikes.cl\/informe\/([A-Za-z0-9_-]{43})/);
  expect(match).not.toBeNull();
  expect(await getPlan()).toEqual({
    nextMaintenanceDate: FIELDS.nextMaintenanceDate,
    nextMaintenanceNote: FIELDS.nextMaintenanceNote,
  });
  const token = match?.[1] ?? "";
  const info = vi.spyOn(log, "info");
  const page = await publicRender(token);
  expect(page.status).toBe(200);
  expect(page.headers.get("cache-control")).toBe("no-store");
  expect(page.headers.get("referrer-policy")).toBe("no-referrer");
  const body = await page.text();
  expect(body).toContain("Próxima mantención sugerida");
  expect(body).toContain("12 de mayo de 2027");
  expect(body).toContain(FIELDS.nextMaintenanceNote);
  expect(body.indexOf("Próxima mantención sugerida")).toBeGreaterThan(
    body.indexOf("Próximas revisiones"),
  );
  expect(body.indexOf("/brand/vector-bikes-logo.png")).toBeLessThan(body.indexOf("<h1"));
  expect(JSON.stringify(info.mock.calls)).not.toContain(token);
});

it.each([
  { ...FIELDS, nextMaintenanceDate: "2020-01-01" },
  { ...FIELDS, nextMaintenanceNote: "x".repeat(301) },
])("responde 422 con errores accesibles al rechazar el plan: %j", async (fields) => {
  const response = await render(fields);
  expect(response.status).toBe(422);
  const html = await response.text();
  expect(html).toContain(
    "La fecha de la próxima mantención no puede ser anterior a hoy y la nota admite hasta 300 caracteres.",
  );
  const key =
    fields.nextMaintenanceDate === "2020-01-01" ? "nextMaintenanceDate" : "nextMaintenanceNote";
  expect(html).toMatch(new RegExp(`<input\\b[^>]*name="${key}"[^>]*aria-invalid="true"`));
  expect(html).toMatch(/aria-describedby="form-error(?: maintenance-help)?"/);
});

it("un plan inválido no regenera el informe: el enlace anterior sigue sirviendo", async () => {
  const first = await (await render(FIELDS)).text();
  const token = first.match(/https:\/\/vectorbikes.cl\/informe\/([A-Za-z0-9_-]{43})/)?.[1] ?? "";
  expect(token).not.toBe("");
  const rejected = await render({ ...FIELDS, nextMaintenanceDate: "2020-01-01" });
  expect(rejected.status).toBe(422);
  expect(await rejected.text()).not.toMatch(/vectorbikes.cl\/informe\/[A-Za-z0-9_-]{43}/);
  expect((await publicRender(token)).status).toBe(200);
  expect(await getPlan()).toEqual({
    nextMaintenanceDate: FIELDS.nextMaintenanceDate,
    nextMaintenanceNote: FIELDS.nextMaintenanceNote,
  });
});

it("conserva la fecha guardada en GET y permite descartarla sin volver a sugerirla", async () => {
  await render({ ...FIELDS, nextMaintenanceDate: "2027-06-15" });
  expect(await (await render()).text()).toMatch(
    /<input\b[^>]*name="nextMaintenanceDate"[^>]*value="2027-06-15"/,
  );
  const response = await render({ ...FIELDS, nextMaintenanceDate: "" });
  expect(response.status).toBe(200);
  expect((await getPlan())?.nextMaintenanceDate).toBeNull();
  expect(await (await render()).text()).toMatch(
    /<input\b[^>]*name="nextMaintenanceDate"[^>]*\bvalue(?:="")?(?=[\s>])/,
  );
});

it("omite la sección pública cuando el informe no tiene fecha", async () => {
  const result = await generateReport(
    test.db,
    owner,
    orderId,
    { recommendations: "", nextChecks: "" },
    NOW,
  );
  if (!result.ok) throw new Error(result.code);
  expect(await (await publicRender(result.token)).text()).not.toContain(
    "Próxima mantención sugerida",
  );
});

it("exige sesión, permiso del servidor y origen permitido", async () => {
  expect((await render(undefined, "")).status).toBe(303);
  expect((await render(FIELDS, session, "https://otro.cl")).status).toBe(403);
  await test.db.update(users).set({ role: "mechanic" }).where(eq(users.id, owner.id));
  expect((await render(FIELDS)).status).toBe(403);
});
