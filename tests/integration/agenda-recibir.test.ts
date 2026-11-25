import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { type Booking, bookings, branches, users } from "../../src/server/db/schema.ts";
import { listBookingOrders } from "../../src/server/taller/manual-booking.ts";
import { startReception } from "../../src/server/taller/orders.ts";
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
const { default: Agenda } = await import("../../src/pages/admin/index.astro");
const { default: Detalle } = await import("../../src/pages/admin/reservas/[id].astro");

const SITE = "https://vectorbikes.cl";
/** 2026-10-22 12:00 hora local. */
const NOW = new Date("2026-10-22T15:00:00.000Z");
const DIA = "2026-10-23";

let test: TestDb;
let db: AppDb;
let owner: SessionUser;

async function reserva(bikeCount = 1, status = "confirmed"): Promise<Booking> {
  const [row] = await db
    .insert(bookings)
    .values({
      branchId: owner.branchId,
      code: `VB-${randomUUID().slice(0, 8)}`,
      serviceDate: DIA,
      mode: "taller",
      bikeCount,
      status,
      startsAt: new Date("2026-10-23T18:00:00.000Z"),
      endsAt: new Date("2026-10-23T19:30:00.000Z"),
      customerName: "Patricia Cruzat",
      phoneE164: "+56911112222",
      bike: "Trek Marlin",
      description: "Mantención general",
      consentAt: NOW,
      cancelTokenHash: randomUUID(),
    })
    .returning();
  if (!row) throw new Error("Falta la reserva.");
  return row;
}

async function ordenDesde(booking: Booking): Promise<string> {
  const [customer] = await db
    .insert(customers)
    .values({ branchId: owner.branchId, name: "Patricia Cruzat", phoneE164: "+56911112222" })
    .returning();
  const [bike] = await db
    .insert(bikes)
    .values({
      branchId: owner.branchId,
      customerId: customer?.id ?? "",
      brand: "Trek",
      model: "Marlin",
      bikeType: "mtb",
    })
    .returning();
  const result = await startReception(
    db,
    owner,
    {
      bookingId: booking.id,
      customerId: customer?.id ?? "",
      bikeId: bike?.id ?? "",
      requestedService: "Mantención general",
    },
    NOW,
  );
  if (!result.ok) throw new Error(`No se creó la orden: ${result.code}`);
  return result.orderId;
}

async function render(page: unknown, path: string, params?: Record<string, string>) {
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  const response = await container.renderToResponse(page as never, {
    request: new Request(`${SITE}${path}`),
    params,
  });
  return response.text();
}

async function post(path: string, id: string, accion: string) {
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  return container.renderToResponse(Detalle, {
    request: new Request(`${SITE}${path}`, {
      method: "POST",
      headers: { origin: SITE, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ accion }),
    }),
    params: { id },
  });
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
  return async () => {
    holder.actor = null;
    holder.db = null;
    vi.useRealTimers();
    await test.close();
  };
});

it("el detalle de una reserva confirmada lleva a Nueva recepción como acción principal", async () => {
  const booking = await reserva();

  const html = await render(Detalle, `/admin/reservas/${booking.id}`, { id: booking.id });

  expect(html).toMatch(
    new RegExp(`<a class="btn" href="/taller/recepcion/nueva\\?reserva=${booking.id}">\\s*Recibir`),
  );
  // Las acciones del ciclo antiguo siguen, pero secundarias y plegadas.
  expect(html).toContain("<summary>Más acciones de la reserva</summary>");
  expect(html).toContain("Marcar lista para retirar");
  expect(html).not.toMatch(/<button type="submit" class="btn">/);
});

it("con una bici ya recibida, el detalle enlaza la orden y ofrece recibir la siguiente", async () => {
  const booking = await reserva(2);
  const orderId = await ordenDesde(booking);

  const html = await render(Detalle, `/admin/reservas/${booking.id}`, { id: booking.id });

  expect(html).toContain(`href="/taller/ordenes/${orderId}/recepcion"`);
  expect(html).toContain("Orden OT-00001");
  expect(html).toContain("Recibir (2 de 2)");
});

it("con todas las bicis recibidas ya no ofrece Recibir", async () => {
  const booking = await reserva(1);
  await ordenDesde(booking);

  const html = await render(Detalle, `/admin/reservas/${booking.id}`, { id: booking.id });

  expect(html).not.toContain(`/taller/recepcion/nueva?reserva=${booking.id}`);
  expect(html).toContain("Orden OT-00001");
});

it("la agenda del día ofrece Recibir en cada reserva confirmada sin orden", async () => {
  const booking = await reserva();
  const otra = await reserva();
  await ordenDesde(otra);

  const html = await render(Agenda, `/admin?fecha=${DIA}`);

  expect(html).toContain(`href="/taller/recepcion/nueva?reserva=${booking.id}"`);
  expect(html).not.toContain(`href="/taller/recepcion/nueva?reserva=${otra.id}"`);
  expect(html).toContain("OT-00001");
  expect(html).toContain(`href="/admin/reservas/${booking.id}"`);
});

it("listBookingOrders agrupa por reserva y respeta la sucursal", async () => {
  const booking = await reserva(2);
  const orderId = await ordenDesde(booking);

  const mine = await listBookingOrders(db, [booking.id], owner.branchId);
  expect(mine.get(booking.id)).toEqual([{ id: orderId, number: 1, position: 1 }]);
  expect(await listBookingOrders(db, [], owner.branchId)).toEqual(new Map());
  const [otherBranch] = await db.insert(branches).values({ name: "Otra" }).returning();
  expect((await listBookingOrders(db, [booking.id], otherBranch?.id)).size).toBe(0);
});

it("marcar lista para retirar sigue funcionando y vuelve al detalle", async () => {
  const booking = await reserva();

  const response = await post(`/admin/reservas/${booking.id}`, booking.id, "lista_para_retirar");

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    `/admin/reservas/${booking.id}?hecho=lista_para_retirar`,
  );
  const [updated] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
  expect(updated?.status).toBe("ready_for_pickup");
  expect(await db.select().from(workOrders)).toHaveLength(0);
});
