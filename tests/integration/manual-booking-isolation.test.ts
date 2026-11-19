import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { type CreateBookingInput, createBooking } from "../../src/server/booking/create-booking.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { bookings } from "../../src/server/db/schema.ts";
import type { BookingScope } from "../../src/server/shops/scope.ts";
import {
  createManualBooking,
  freeBlocks,
  listUpcomingBookings,
  manualBookingSchemaFor,
} from "../../src/server/taller/manual-booking.ts";
import type { ManualBookingInput } from "../../src/server/taller/manual-booking.ts";
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
const { default: NewBookingPage } = await import("../../src/pages/taller/reservas/nueva.astro");
const { default: BookingsPage } = await import("../../src/pages/taller/reservas/index.astro");

const SITE = "https://llave15.cl";
/** Martes 2026-09-15, 12:00 hora local. */
const NOW = new Date("2026-09-15T15:00:00.000Z");
const MANANA = "2026-09-16";
const noMail = { notify: async () => {} };

let db: AppDb;
let shops: Awaited<ReturnType<typeof seedTwoShops>>;

function manual(overrides: Partial<ManualBookingInput> = {}): ManualBookingInput {
  return {
    mode: "retiro",
    service_date: MANANA,
    start: "10:00",
    nombre: "Camila Fuentes",
    telefono: "922222222",
    bicicleta: "Urbana Trek",
    descripcion: "Ajuste de cambios",
    comuna: "Ñuñoa",
    direccion: "Avenida Grecia 2000",
    source: "telefono",
    consentimiento: true,
    ...overrides,
  };
}

async function seedBooking(scope: BookingScope, overrides: Partial<CreateBookingInput>) {
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

async function render(page: typeof BookingsPage, path: string, actor: SessionUser) {
  holder.actor = actor;
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  const response = await container.renderToResponse(page, {
    request: new Request(`${SITE}${path}`),
  });
  return { status: response.status, html: await response.text() };
}

describe("reserva manual por taller", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const test = await createTestDb();
    db = test.db;
    holder.db = db;
    shops = await seedTwoShops(db);
  });

  it("guarda la reserva del Taller Demo en su sucursal con su tarifa, comunas y horarios", async () => {
    const { demo } = shops;
    const result = await createManualBooking(db, demo.owner, manual(), NOW, noMail);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [row] = await db.select().from(bookings).where(eq(bookings.id, result.booking.id));
    expect(row?.branchId).toBe(demo.branch.id);
    expect(row?.pickupFeeClp).toBe(9000);
    expect(row?.comuna).toBe("Ñuñoa");
    expect(row?.code.startsWith("TD-")).toBe(true);
    // 16:00 está fuera del horario del Taller Demo (10:00 a 13:00).
    const late = await createManualBooking(
      db,
      demo.owner,
      manual({ start: "16:00", telefono: "944444444" }),
      NOW,
      noMail,
    );
    expect(late.ok).toBe(false);
    // Otro día, sin reservas: la grilla completa del Taller Demo.
    const blocks = await freeBlocks(db, "2026-09-17", "taller", NOW, 1, undefined, demo.branch.id);
    expect(blocks.map((block) => block.start)).toEqual(["10:00", "11:00", "12:00"]);
  });

  it("rechaza en Vector Bikes una comuna del Taller Demo con el mensaje de Vector Bikes", async () => {
    const { vector } = shops;
    const result = await createManualBooking(
      db,
      vector.owner,
      manual({ start: "16:30" }),
      NOW,
      noMail,
    );
    expect(result).toEqual({ ok: false, code: "validation_error" });
    const parsed = manualBookingSchemaFor(vector.scope.config).safeParse(manual());
    expect(parsed.success).toBe(false);
    const comuna = parsed.error?.issues.find((issue) => issue.path[0] === "comuna");
    expect(comuna?.message).toBe(
      `Elige ${vector.scope.config.pickupComunas.slice(0, -1).join(", ")} o ${vector.scope.config.pickupComunas.at(-1)}.`,
    );
  });

  it("lista las reservas próximas solo de la sucursal pedida", async () => {
    const { vector, demo } = shops;
    const own = await seedBooking(vector.scope, { customerName: "Cliente Vector" });
    await seedBooking(demo.scope, { start: "10:00", customerName: "Cliente Demo" });
    const rows = await listUpcomingBookings(db, "2026-09-15", 14, vector.branch.id);
    expect(rows.map((row) => row.id)).toEqual([own.id]);
  });

  it("muestra en la nueva reserva del Taller Demo sus comunas y su tarifa", async () => {
    const { status, html } = await render(
      NewBookingPage,
      `/taller/reservas/nueva?service_date=${MANANA}&mode=retiro&bicis=1`,
      shops.demo.owner,
    );
    expect(status).toBe(200);
    expect(html).toContain("Ñuñoa");
    expect(html).toContain("Providencia");
    expect(html).toContain("$9.000");
    expect(html).not.toContain("Vitacura");
  });

  it("lista en /taller/reservas solo las reservas del taller de cada dueño", async () => {
    const { vector, demo } = shops;
    await seedBooking(vector.scope, { customerName: "Cliente Vector" });
    await seedBooking(demo.scope, { start: "10:00", customerName: "Cliente Demo" });
    const forVector = await render(BookingsPage, "/taller/reservas", vector.owner);
    expect(forVector.html).toContain("Cliente Vector");
    expect(forVector.html).not.toContain("Cliente Demo");
    const forDemo = await render(BookingsPage, "/taller/reservas", demo.owner);
    expect(forDemo.html).toContain("Cliente Demo");
    expect(forDemo.html).not.toContain("Cliente Vector");
  });
});
