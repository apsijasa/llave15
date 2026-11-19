import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "../../src/lib/time.ts";
import { monthOverview } from "../../src/server/admin/month.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { type CreateBookingInput, createBooking } from "../../src/server/booking/create-booking.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { blockedPeriods } from "../../src/server/db/schema.ts";
import type { BookingScope } from "../../src/server/shops/scope.ts";
import { createTestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

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
const { default: AdminPage } = await import("../../src/pages/admin/index.astro");
const { default: BlocksPage } = await import("../../src/pages/admin/bloqueos.astro");

/** El origen que acepta `isAllowedOrigin` en las pruebas (convivencia hasta BG-DC3). */
const SITE = "https://vectorbikes.cl";
/** Martes 2026-09-15, 12:00 hora local. */
const NOW = new Date("2026-09-15T15:00:00.000Z");
const MANANA = "2026-09-16";

let db: AppDb;
let shops: Awaited<ReturnType<typeof seedTwoShops>>;

async function seedBooking(scope: BookingScope, overrides: Partial<CreateBookingInput> = {}) {
  const result = await createBooking(
    db,
    {
      mode: "taller",
      serviceDate: MANANA,
      start: "16:30",
      customerName: "Cliente",
      phoneE164: "+56933333333",
      email: null,
      bike: "Ruta Giant",
      description: "Mantención general",
      comuna: null,
      address: null,
      ipHash: null,
      ...overrides,
    },
    NOW,
    scope,
  );
  if (!result.ok) throw new Error(`no se creó la reserva: ${result.code}`);
  return result.booking;
}

async function render(
  page: typeof AdminPage,
  path: string,
  actor: SessionUser,
  form?: Record<string, string>,
) {
  holder.actor = actor;
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  const request = new Request(`${SITE}${path}`, {
    method: form ? "POST" : "GET",
    headers: form ? { origin: SITE, "content-type": "application/x-www-form-urlencoded" } : {},
    body: form ? new URLSearchParams(form) : undefined,
  });
  const response = await container.renderToResponse(page, { request });
  return { status: response.status, html: await response.text() };
}

function dayOf(view: Awaited<ReturnType<typeof monthOverview>>, date: string) {
  const day = view.days.find((item) => item.date === date);
  if (!day) throw new Error(`Falta el día ${date}.`);
  return day;
}

describe("mes y bloqueos de /admin por sucursal", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const test = await createTestDb();
    db = test.db;
    holder.db = db;
    shops = await seedTwoShops(db);
  });

  it("cuenta en Vector Bikes solo sus reservas y bloqueos, con su capacidad y su horizonte", async () => {
    const { vector, demo } = shops;
    await seedBooking(vector.scope);
    await seedBooking(demo.scope, { start: "10:00" });
    await seedBooking(demo.scope, { start: "11:00", phoneE164: "+56944444444" });
    await db
      .insert(blockedPeriods)
      .values({ branchId: demo.branch.id, serviceDate: "2026-09-18", reason: "Inventario" });
    const view = await monthOverview(db, "2026-09", NOW, vector.scope);
    const config = vector.scope.config;
    expect(view.capacity).toBe(config.dailyCapacity);
    expect(dayOf(view, MANANA).used).toBe(1);
    expect(dayOf(view, "2026-09-18").state).not.toBe("blocked");
    const limit = addDays("2026-09-15", config.horizonDays);
    for (const day of view.days.filter((item) => item.date >= "2026-09-15")) {
      expect(day.outside).toBe(day.date > limit ? "horizon" : null);
    }
  });

  it("marca lleno en el Taller Demo el día con 2 bicis", async () => {
    const { demo } = shops;
    await seedBooking(demo.scope, { start: "10:00" });
    await seedBooking(demo.scope, { start: "11:00", phoneE164: "+56944444444" });
    const view = await monthOverview(db, "2026-09", NOW, demo.scope);
    expect(view.capacity).toBe(2);
    expect(dayOf(view, MANANA).state).toBe("full");
    // Horizonte del Taller Demo: 14 días desde el 15.
    expect(dayOf(view, "2026-09-29").outside).toBeNull();
    expect(dayOf(view, "2026-09-30").outside).toBe("horizon");
  });

  it("guarda el bloqueo del Taller Demo en su sucursal y no lo muestra a Vector Bikes", async () => {
    const { vector, demo } = shops;
    const created = await render(BlocksPage, "/admin/bloqueos", demo.owner, {
      fecha: "2026-09-21",
      desde: "",
      hasta: "",
      motivo: "Capacitación del equipo",
    });
    expect(created.status).toBe(303);
    const rows = await db.select().from(blockedPeriods);
    expect(rows.map((row) => row.branchId)).toEqual([demo.branch.id]);
    const forVector = await render(BlocksPage, "/admin/bloqueos", vector.owner);
    expect(forVector.html).not.toContain("Capacitación del equipo");
    const forDemo = await render(BlocksPage, "/admin/bloqueos", demo.owner);
    expect(forDemo.html).toContain("Capacitación del equipo");
  });

  it("no borra desde Vector Bikes un bloqueo del Taller Demo", async () => {
    const { vector, demo } = shops;
    const [block] = await db
      .insert(blockedPeriods)
      .values({ branchId: demo.branch.id, serviceDate: "2026-09-21", reason: "Inventario" })
      .returning();
    if (!block) throw new Error("Falta el bloqueo de prueba.");
    await render(BlocksPage, "/admin/bloqueos", vector.owner, {
      accion: "eliminar",
      id: block.id,
    });
    const [still] = await db.select().from(blockedPeriods).where(eq(blockedPeriods.id, block.id));
    expect(still?.id).toBe(block.id);
  });

  it("muestra en /admin solo las reservas del día del taller de cada dueño", async () => {
    const { vector, demo } = shops;
    await seedBooking(vector.scope, { customerName: "Cliente Vector" });
    await seedBooking(demo.scope, { start: "10:00", customerName: "Cliente Demo" });
    const forVector = await render(AdminPage, `/admin?fecha=${MANANA}`, vector.owner);
    expect(forVector.html).toContain("Cliente Vector");
    expect(forVector.html).not.toContain("Cliente Demo");
    const forDemo = await render(AdminPage, `/admin?fecha=${MANANA}`, demo.owner);
    expect(forDemo.html).toContain("Cliente Demo");
    expect(forDemo.html).not.toContain("Cliente Vector");
  });
});
