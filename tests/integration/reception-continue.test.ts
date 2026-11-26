import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { and, eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import {
  intakeAccessories,
  intakeChecks,
  workOrderItems,
  workOrders,
} from "../../src/server/db/schema-orders.ts";
import { bikes, customers, servicePrices, services } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { continueReception } from "../../src/server/taller/reception-continue.ts";
import { INTAKE_CHECK_KEYS } from "../../src/server/taller/rules.ts";
import { type TestDb, createTestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null, actor: null as SessionUser | null }));
vi.mock("../../src/server/db/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Base de prueba no inicializada");
    return holder.db;
  },
}));
vi.mock("../../src/server/auth/admin-auth.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/auth/admin-auth.ts")>()),
  requireAdmin: async () => holder.actor,
}));
const { default: Recepcion } = await import("../../src/pages/taller/ordenes/[id]/recepcion.astro");

const SITE = "https://vectorbikes.cl";
const NOW = new Date("2026-10-23T15:00:00.000Z");

let test: TestDb;
let db: AppDb;
let owner: SessionUser;
let orderId: string;
let serviceId: string;
let otherOwner: SessionUser;

/** Lo mínimo que el formulario manda siempre: el servicio solicitado viaja en todos los envíos. */
function base(extra: Record<string, string> = {}): Record<string, string> {
  return { servicio_solicitado: "Mantención general", observaciones: "", ...extra };
}

async function render(data?: Record<string, string>, search = "") {
  const request = new Request(`${SITE}/taller/ordenes/${orderId}/recepcion${search}`, {
    method: data ? "POST" : "GET",
    headers: data ? { origin: SITE, "content-type": "application/x-www-form-urlencoded" } : {},
    body: data ? new URLSearchParams(data) : undefined,
  });
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  return container.renderToResponse(Recepcion, { request, params: { id: orderId } });
}

async function guardados(): Promise<string[]> {
  const rows = await db
    .select({ itemKey: intakeChecks.itemKey })
    .from(intakeChecks)
    .where(and(eq(intakeChecks.workOrderId, orderId), eq(intakeChecks.branchId, owner.branchId)));
  return rows.map((row) => row.itemKey).sort();
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  test = await createTestDb();
  db = test.db;
  holder.db = db;
  const [branch] = await db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta la sucursal.");
  const [user] = await db
    .insert(users)
    .values({
      branchId: branch.id,
      role: "owner",
      name: "Dueña",
      email: `${randomUUID()}@ejemplo.cl`,
      passwordHash: "hash-de-prueba",
    })
    .returning();
  if (!user) throw new Error("Falta el usuario.");
  owner = { id: user.id, branchId: branch.id, role: "owner", name: user.name, email: user.email };
  holder.actor = owner;
  const [customer] = await db
    .insert(customers)
    .values({ branchId: branch.id, name: "Patricia Cruzat", phoneE164: "+56911112222" })
    .returning();
  const [bike] = await db
    .insert(bikes)
    .values({
      branchId: branch.id,
      customerId: customer?.id ?? "",
      brand: "Trek",
      model: "Marlin",
      bikeType: "mtb",
    })
    .returning();
  const [order] = await db
    .insert(workOrders)
    .values({
      branchId: branch.id,
      number: 1,
      customerId: customer?.id ?? "",
      bikeId: bike?.id ?? "",
      requestedService: "Mantención general",
      createdBy: user.id,
    })
    .returning();
  orderId = order?.id ?? "";
  const [service] = await db
    .insert(services)
    .values({ branchId: branch.id, name: "Ajuste de frenos", estimatedMinutes: 30 })
    .returning();
  serviceId = service?.id ?? "";
  // Sin precio para el tipo de bici, agregar el servicio devuelve `no_price` y 422.
  await db
    .insert(servicePrices)
    .values({ branchId: branch.id, serviceId, bikeType: "mtb", priceClp: 12000 });
  const [other] = await db.insert(branches).values({ name: "Ñuñoa" }).returning();
  const [otherUser] = await db
    .insert(users)
    .values({
      branchId: other?.id ?? "",
      role: "owner",
      name: "Otra dueña",
      email: `${randomUUID()}@ejemplo.cl`,
      passwordHash: "hash-de-prueba",
    })
    .returning();
  otherOwner = {
    id: otherUser?.id ?? "",
    branchId: other?.id ?? "",
    role: "owner",
    name: "Otra dueña",
    email: otherUser?.email ?? "",
  };
  return async () => {
    holder.actor = null;
    holder.db = null;
    vi.useRealTimers();
    await test.close();
  };
});

const allOk = Object.fromEntries(INTAKE_CHECK_KEYS.map((key) => [key, "ok"]));
const checklist = (keys: readonly string[] = INTAKE_CHECK_KEYS) => ({
  servicio_solicitado: "Mantención general",
  observaciones: "",
  checks: Object.fromEntries(keys.map((key) => [key, { result: "ok", note: "" }])),
});

async function accesorios(): Promise<string[]> {
  const rows = await db
    .select({ description: intakeAccessories.description })
    .from(intakeAccessories)
    .where(eq(intakeAccessories.workOrderId, orderId));
  return rows.map((row) => row.description);
}

async function lineas(): Promise<number> {
  const rows = await db
    .select({ id: workOrderItems.id })
    .from(workOrderItems)
    .where(eq(workOrderItems.workOrderId, orderId));
  return rows.length;
}

async function orden() {
  const [row] = await db.select().from(workOrders).where(eq(workOrders.id, orderId));
  return row;
}

it("guarda checklist, accesorio, servicio y fecha de una vez", async () => {
  const result = await continueReception(
    db,
    owner,
    orderId,
    {
      checklist: checklist(),
      description: "Luz trasera",
      serviceId,
      quantity: 1,
      date: "2026-10-27",
    },
    NOW,
  );

  expect(result).toEqual({ ok: true, complete: true });
  expect(await guardados()).toHaveLength(INTAKE_CHECK_KEYS.length);
  expect(await accesorios()).toEqual(["Luz trasera"]);
  expect(await lineas()).toBe(1);
  const row = await orden();
  expect(row?.estimatedDeliveryDate).toBe("2026-10-27");
  expect(row?.deliveryDateConfirmedAt).not.toBeNull();
  expect(row?.status).toBe("creado");
});

it("sin accesorio ni servicio escritos, solo guarda el checklist y la fecha", async () => {
  const result = await continueReception(
    db,
    owner,
    orderId,
    { checklist: checklist(), quantity: 1, date: "2026-10-27" },
    NOW,
  );

  expect(result).toEqual({ ok: true, complete: true });
  expect(await accesorios()).toEqual([]);
  expect(await lineas()).toBe(0);
});

it("con el checklist incompleto guarda igual y avisa que falta", async () => {
  const result = await continueReception(
    db,
    owner,
    orderId,
    { checklist: checklist(["frenos", "cadena"]), quantity: 1, date: "2026-10-27" },
    NOW,
  );

  expect(result).toEqual({ ok: true, complete: false });
  expect(await guardados()).toEqual(["cadena", "frenos"]);
  expect((await orden())?.deliveryDateConfirmedAt).not.toBeNull();
});

it("un servicio sin precio se detiene ahí y deja guardado el checklist", async () => {
  await db.delete(servicePrices).where(eq(servicePrices.serviceId, serviceId));

  const result = await continueReception(
    db,
    owner,
    orderId,
    { checklist: checklist(), serviceId, quantity: 1, date: "2026-10-27" },
    NOW,
  );

  expect(result).toEqual({ ok: false, code: "no_price" });
  expect(await guardados()).toHaveLength(INTAKE_CHECK_KEYS.length);
  expect((await orden())?.deliveryDateConfirmedAt).toBeNull();
});

it("solo sirve en Creado sin recepción", async () => {
  await db
    .update(workOrders)
    .set({ status: "creado", receivedAt: NOW })
    .where(eq(workOrders.id, orderId));

  const result = await continueReception(
    db,
    owner,
    orderId,
    { checklist: checklist(), quantity: 1, date: "2026-10-27" },
    NOW,
  );

  expect(result).toEqual({ ok: false, code: "invalid_status" });
  expect(await guardados()).toEqual([]);
});

it("no toca la orden de otro taller", async () => {
  const result = await continueReception(
    db,
    otherOwner,
    orderId,
    { checklist: checklist(), description: "Luz", quantity: 1, date: "2026-10-27" },
    NOW,
  );

  expect(result).toEqual({ ok: false, code: "not_found" });
  expect(await guardados()).toEqual([]);
  expect(await accesorios()).toEqual([]);
});

it("«Continuar» completo guarda todo y lleva a Fotos y firma", async () => {
  const response = await render(
    base({ ...allOk, accion: "continuar", description: "Bolso", serviceId, date: "2026-10-27" }),
  );

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(`/taller/ordenes/${orderId}/cierre`);
  expect(await accesorios()).toEqual(["Bolso"]);
  expect(await lineas()).toBe(1);
});

it("«Continuar» con puntos pendientes se queda y nombra lo que falta", async () => {
  const response = await render(
    base({ frenos: "ok", accion: "continuar", description: "", serviceId: "", date: "2026-10-27" }),
  );

  expect(response.status).toBe(303);
  const location = response.headers.get("location") ?? "";
  expect(location).toBe(`/taller/ordenes/${orderId}/recepcion?hecho=continuar#checklist`);
  const html = await (await render(undefined, "?hecho=continuar")).text();
  expect(html).toContain("Guardamos la recepción. Para seguir a fotos y firma, marca:");
  expect(html).toContain("Cadena");
  expect(await guardados()).toEqual(["frenos"]);
});

it("en Creado sin recepción hay un solo botón principal: Continuar", async () => {
  const html = await (await render()).text();

  expect(html).toMatch(
    /<button[^>]*value="continuar"[^>]*class="btn"[^>]*>Continuar a fotos y firma/,
  );
  expect(html).not.toContain("Guardar checklist");
  expect(html).not.toContain("Confirmar fecha");
  expect(html.match(/class="btn"/g)).toHaveLength(1);
});

it("después de completar la recepción, la página conserva sus botones para corregir", async () => {
  await db
    .update(workOrders)
    .set({ status: "creado", receivedAt: NOW })
    .where(eq(workOrders.id, orderId));

  const html = await (await render()).text();

  expect(html).toContain("Guardar checklist");
  expect(html).toContain("Confirmar fecha");
  expect(html).not.toContain('value="continuar"');
});
