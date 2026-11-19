import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agendaForDate, applyAdminAction, bookingDetail } from "../../src/server/admin/agenda.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { type CreateBookingInput, createBooking } from "../../src/server/booking/create-booking.ts";
import { rescheduleBooking } from "../../src/server/booking/reschedule-booking.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { bookingBlocks, bookings } from "../../src/server/db/schema.ts";
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
const { default: AdminBookingPage } = await import("../../src/pages/admin/reservas/[id].astro");
const { default: ReschedulePage } = await import(
  "../../src/pages/taller/reservas/[id]/reprogramar.astro"
);

const SITE = "https://llave15.cl";
/** Martes 2026-09-15, 12:00 hora local. */
const NOW = new Date("2026-09-15T15:00:00.000Z");
const MANANA = "2026-09-16";
const PASADO = "2026-09-17";

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

async function render(page: typeof AdminBookingPage, path: string, id: string) {
  holder.actor = shops.vector.owner;
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  const response = await container.renderToResponse(page, {
    request: new Request(`${SITE}${path}`),
    params: { id },
  });
  return response.status;
}

describe("agenda y reprogramación por sucursal", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const test = await createTestDb();
    db = test.db;
    holder.db = db;
    shops = await seedTwoShops(db);
  });

  it("no muestra ni cambia desde Vector Bikes una reserva del Taller Demo", async () => {
    const { vector, demo } = shops;
    const foreign = await seedBooking(demo.scope, { start: "10:00" });
    expect(await bookingDetail(db, foreign.id, vector.branch.id)).toBeNull();
    expect(await bookingDetail(db, foreign.id, demo.branch.id)).not.toBeNull();
    for (const action of ["cancelar", "completar", "no_show", "lista_para_retirar"] as const) {
      const result = await applyAdminAction(
        db,
        foreign.id,
        action,
        NOW,
        vector.owner,
        vector.branch.id,
      );
      expect(result).toEqual({ ok: false, code: "not_found" });
    }
    const [row] = await db.select().from(bookings).where(eq(bookings.id, foreign.id));
    expect(row?.status).toBe("confirmed");
  });

  it("arma la agenda del día solo con las reservas de la sucursal", async () => {
    const { vector, demo } = shops;
    const own = await seedBooking(vector.scope);
    await seedBooking(demo.scope, { start: "10:00" });
    const agenda = await agendaForDate(db, MANANA, vector.branch.id);
    expect(agenda.map((booking) => booking.id)).toEqual([own.id]);
  });

  it("reprograma una reserva del Taller Demo con sus horarios, su capacidad y su sucursal", async () => {
    const { demo } = shops;
    const booking = await seedBooking(demo.scope, { start: "10:00" });
    // 16:30 está fuera del horario del Taller Demo (10:00 a 13:00).
    const outside = await rescheduleBooking(
      db,
      demo.owner,
      { bookingId: booking.id, serviceDate: PASADO, start: "16:30" },
      NOW,
    );
    expect(outside).toEqual({ ok: false, code: "slot_unavailable" });
    const moved = await rescheduleBooking(
      db,
      demo.owner,
      { bookingId: booking.id, serviceDate: PASADO, start: "11:00" },
      NOW,
    );
    expect(moved.ok).toBe(true);
    const active = await db
      .select()
      .from(bookingBlocks)
      .where(eq(bookingBlocks.bookingId, booking.id));
    const current = active.filter((block) => block.isActive);
    expect(current.length).toBeGreaterThan(0);
    expect(current.every((block) => block.branchId === demo.branch.id)).toBe(true);
    expect(current.every((block) => block.serviceDate === PASADO)).toBe(true);

    // Capacidad diaria del Taller Demo: 2 bicis. Con el día lleno, no entra otra.
    await seedBooking(demo.scope, {
      serviceDate: PASADO,
      start: "12:00",
      phoneE164: "+56944444444",
    });
    const third = await seedBooking(demo.scope, { start: "11:00", phoneE164: "+56955555555" });
    const full = await rescheduleBooking(
      db,
      demo.owner,
      { bookingId: third.id, serviceDate: PASADO, start: "10:00" },
      NOW,
    );
    expect(full).toEqual({ ok: false, code: "slot_unavailable" });
  });

  it("no deja reprogramar desde Vector Bikes una reserva del Taller Demo", async () => {
    const { vector, demo } = shops;
    const foreign = await seedBooking(demo.scope, { start: "10:00" });
    const result = await rescheduleBooking(
      db,
      vector.owner,
      { bookingId: foreign.id, serviceDate: PASADO, start: "16:30" },
      NOW,
    );
    expect(result).toEqual({ ok: false, code: "not_found" });
  });

  it("responde 404 a Vector Bikes en las páginas de una reserva del Taller Demo", async () => {
    const foreign = await seedBooking(shops.demo.scope, { start: "10:00" });
    expect(await render(AdminBookingPage, `/admin/reservas/${foreign.id}`, foreign.id)).toBe(404);
    expect(
      await render(ReschedulePage, `/taller/reservas/${foreign.id}/reprogramar`, foreign.id),
    ).toBe(404);
  });
});
