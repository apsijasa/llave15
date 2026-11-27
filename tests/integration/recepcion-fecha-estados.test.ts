import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { intakeAccessories, intakeChecks, workOrders } from "../../src/server/db/schema-orders.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { consoleOutbox } from "../../src/server/email/transport.ts";
import { INTAKE_CHECK_KEYS } from "../../src/server/taller/rules.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null, actor: null as SessionUser | null }));
vi.mock("../../src/server/db/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Base de prueba no inicializada.");
    return holder.db;
  },
}));
vi.mock("../../src/server/auth/admin-auth.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/auth/admin-auth.ts")>()),
  requireAdmin: async () => holder.actor,
}));
const { default: Recepcion } = await import("../../src/pages/taller/ordenes/[id]/recepcion.astro");
const SITE_URL = "https://vectorbikes.cl";
const NOW = new Date("2026-11-16T15:00:00.000Z");
let test: TestDb;
let orderId: string;

async function seedActor() {
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta la sucursal.");
  const [user] = await test.db
    .insert(users)
    .values({
      branchId: branch.id,
      role: "owner",
      name: "Dueña",
      email: `${randomUUID()}@example.test`,
      passwordHash: "hash-de-prueba",
    })
    .returning();
  if (!user) throw new Error("Falta el usuario.");
  holder.actor = {
    id: user.id,
    branchId: branch.id,
    role: "owner",
    name: user.name,
    email: user.email,
  };
  return user;
}

async function seedBike(user: Awaited<ReturnType<typeof seedActor>>) {
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: user.branchId,
      name: "Ana Pérez",
      phoneE164: "+56912345678",
      email: "ana@example.test",
    })
    .returning();
  if (!customer) throw new Error("Falta el cliente.");
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: user.branchId,
      customerId: customer.id,
      brand: "Trek",
      model: "Marlin",
      bikeType: "mtb",
    })
    .returning();
  if (!bike) throw new Error("Falta la bicicleta.");
  return bike;
}

async function seedOrder(user: Awaited<ReturnType<typeof seedActor>>) {
  const bike = await seedBike(user);
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: user.branchId,
      number: 1,
      customerId: bike.customerId,
      bikeId: bike.id,
      requestedService: "Mantención general",
      createdBy: user.id,
      status: "diagnostico",
      estimatedDeliveryDate: "2026-10-23",
    })
    .returning();
  if (!order) throw new Error("Falta la orden.");
  orderId = order.id;
  await test.db.insert(intakeChecks).values(
    INTAKE_CHECK_KEYS.map((itemKey) => ({
      branchId: user.branchId,
      workOrderId: orderId,
      itemKey,
      result: "ok",
      createdBy: user.id,
    })),
  );
}

async function render(data?: Record<string, string>, search = "") {
  const request = new Request(`${SITE_URL}/taller/ordenes/${orderId}/recepcion${search}`, {
    method: data ? "POST" : "GET",
    headers: data ? { origin: SITE_URL, "content-type": "application/x-www-form-urlencoded" } : {},
    body: data ? new URLSearchParams(data) : undefined,
  });
  const container = await AstroContainer.create({ astroConfig: { site: SITE_URL } });
  return container.renderToResponse(Recepcion, { request, params: { id: orderId } });
}

function form(extra: Record<string, string>) {
  return {
    servicio_solicitado: "Mantención general",
    observaciones: "",
    ...Object.fromEntries(INTAKE_CHECK_KEYS.map((key) => [key, "ok"])),
    ...extra,
  };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  test = await createTestDb();
  holder.db = test.db;
  consoleOutbox.length = 0;
  await seedOrder(await seedActor());
  return async () => {
    holder.actor = null;
    holder.db = null;
    vi.useRealTimers();
    await test.close();
  };
});

it.each(["diagnostico", "en_progreso"])(
  "confirma la fecha en %s con los siete puntos marcados",
  async (status) => {
    await test.db.update(workOrders).set({ status }).where(eq(workOrders.id, orderId));
    const before = await test.db.select().from(intakeChecks);
    const response = await render(form({ accion: "fecha", date: "2026-11-23" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `/taller/ordenes/${orderId}/recepcion?hecho=fecha&avisado=1`,
    );
    const [order] = await test.db.select().from(workOrders).where(eq(workOrders.id, orderId));
    expect(order?.estimatedDeliveryDate).toBe("2026-11-23");
    expect(await test.db.select().from(intakeChecks)).toEqual(before);
  },
);

it("agrega un accesorio en diagnóstico sin intentar guardar el checklist", async () => {
  const response = await render(form({ accion: "accesorio", description: "Portabultos" }));
  expect(response.status).toBe(303);
  const [accessory] = await test.db.select().from(intakeAccessories);
  expect(accessory?.description).toBe("Portabultos");
});

it("en diagnóstico los datos inválidos del checklist no bloquean los otros botones", async () => {
  const response = await render(
    form({
      accion: "fecha",
      date: "2026-11-23",
      servicio_solicitado: "",
      frenos: "inválido",
    }),
  );
  expect(response.status).toBe(303);
});

it("guardar explícitamente el checklist en diagnóstico conserva el 409 y su mensaje", async () => {
  const response = await render(form({ accion: "checklist" }));
  expect(response.status).toBe(409);
  expect(await response.text()).toContain(
    "El checklist solo se puede guardar en una orden en estado Creado.",
  );
});

it.each([false, true])(
  "confirma el guardado dentro de la tarjeta, avisado=%s",
  async (notified) => {
    const html = await (
      await render(undefined, `?hecho=fecha${notified ? "&avisado=1" : ""}`)
    ).text();
    const start = html.indexOf('id="delivery-heading"');
    const card = html.slice(start, html.indexOf("</form>", start));
    expect(card).toContain('role="status"');
    expect(card).toContain("Fecha de entrega guardada.");
    expect(card.includes("Le avisamos al cliente por correo.")).toBe(notified);
  },
);
