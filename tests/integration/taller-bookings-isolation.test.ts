import { beforeEach, describe, expect, it } from "vitest";
import { type CreateBookingInput, createBooking } from "../../src/server/booking/create-booking.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import type { BookingScope } from "../../src/server/shops/scope.ts";
import { insertBike } from "../../src/server/taller/bikes.ts";
import { nextBookingReception } from "../../src/server/taller/booking-reception.ts";
import { customerFormSchema, insertCustomer } from "../../src/server/taller/customers.ts";
import { adminDashboard } from "../../src/server/taller/dashboard.ts";
import { bookingIndicators } from "../../src/server/taller/indicators-customers.ts";
import { prefillFromBooking, startReception } from "../../src/server/taller/orders.ts";
import { createTestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

/** Martes 2026-09-15, 12:00 hora local. */
const NOW = new Date("2026-09-15T15:00:00.000Z");
const HOY = "2026-09-15";
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

/** Reservas de hoy: se crean un rato antes, cuando todavía cumplían la antelación. */
async function seedToday(scope: BookingScope, start: string, phoneE164: string) {
  const earlier = new Date("2026-09-14T15:00:00.000Z");
  const result = await createBooking(
    db,
    {
      mode: "taller",
      serviceDate: HOY,
      start,
      customerName: "Cliente de hoy",
      phoneE164,
      email: null,
      bike: "Urbana",
      description: "Ajuste",
      comuna: null,
      address: null,
      ipHash: null,
    },
    earlier,
    scope,
  );
  if (!result.ok) throw new Error(`no se creó la reserva de hoy: ${result.code}`);
  return result.booking;
}

describe("reservas del tablero, indicadores y recepción por sucursal", () => {
  beforeEach(async () => {
    const test = await createTestDb();
    db = test.db;
    shops = await seedTwoShops(db);
  });

  it("cuenta en el tablero de Vector Bikes solo sus reservas activas", async () => {
    const { vector, demo } = shops;
    await seedToday(vector.scope, "16:30", "+56911110000");
    await seedToday(demo.scope, "12:00", "+56922220000");
    const dashboard = await adminDashboard(db, vector.owner, NOW);
    expect(dashboard?.bookingsToday).toHaveLength(1);
    expect(dashboard?.bookingsToday[0]?.time).toBe("16:30");
  });

  it("no cuenta en los indicadores de Vector Bikes reservas del Taller Demo", async () => {
    const { vector, demo } = shops;
    await seedBooking(vector.scope);
    await seedBooking(demo.scope, { start: "10:00" });
    await seedBooking(demo.scope, { start: "11:00", phoneE164: "+56944444444" });
    const range = { from: HOY, to: "2026-09-30" };
    expect((await bookingIndicators(db, vector.owner, range)).received).toBe(1);
    expect((await bookingIndicators(db, demo.owner, range)).received).toBe(2);
  });

  it("no ofrece recibir en Vector Bikes una reserva del Taller Demo", async () => {
    const { vector, demo } = shops;
    const foreign = await seedBooking(demo.scope, { start: "10:00" });
    expect(await nextBookingReception(db, vector.owner, foreign.id)).toBeNull();
    expect(await prefillFromBooking(db, vector.owner, foreign.id)).toBeNull();
    expect(await nextBookingReception(db, demo.owner, foreign.id)).toEqual({
      bookingId: foreign.id,
      position: 1,
      total: 1,
    });
  });

  it("no crea la orden cuando la recepción trae una reserva de otro taller", async () => {
    const { vector, demo } = shops;
    const foreign = await seedBooking(demo.scope, { start: "10:00" });
    const customer = await insertCustomer(
      db,
      vector.branch.id,
      customerFormSchema.parse({ name: "Cliente Vector", phoneE164: "912345678" }),
      NOW,
    );
    if (!customer.ok) throw new Error("Falta el cliente de prueba.");
    const bike = await insertBike(
      db,
      vector.branch.id,
      customer.customer.id,
      { brand: "Trek", model: "Marlin 7", bikeType: "mtb" },
      NOW,
    );
    if (!bike.ok) throw new Error("Falta la bicicleta de prueba.");
    const result = await startReception(
      db,
      vector.owner,
      {
        bookingId: foreign.id,
        customerId: customer.customer.id,
        bikeId: bike.bike.id,
        requestedService: "Revisar frenos",
      },
      NOW,
    );
    expect(result.ok).toBe(false);
    expect(await db.select().from(workOrders)).toHaveLength(0);
  });
});
