import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { readRange } from "../../src/server/booking/availability.ts";
import type { CreateBookingInput } from "../../src/server/booking/create-booking.ts";
import { createBooking } from "../../src/server/booking/create-booking.ts";
import { readDay } from "../../src/server/booking/day-state.ts";
import {
  blockedPeriods,
  bookingBikes,
  bookingBlocks,
  bookingDays,
  bookings,
} from "../../src/server/db/schema.ts";
import { ShopScopeError } from "../../src/server/shops/scope.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { createTestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const NOW = new Date("2026-09-15T15:00:00.000Z");
const DATE = "2026-09-16";
const EMPTY_DAY = { activeBlockStarts: [], blocked: [], usedCount: 0 };
const FIRST_BIKE = { bike: "Urbana", description: "Ajuste de frenos" };
const BIKES = [FIRST_BIKE, { bike: "Ruta", description: "Cambio de cadena" }];

function input(overrides: Partial<CreateBookingInput> = {}): CreateBookingInput {
  return {
    mode: "taller",
    serviceDate: DATE,
    start: "10:00",
    customerName: "Javiera Rojas",
    phoneE164: "+56933334444",
    email: null,
    bike: FIRST_BIKE.bike,
    description: FIRST_BIKE.description,
    comuna: null,
    address: null,
    ipHash: null,
    ...overrides,
  };
}

describe("reservas aisladas por taller", () => {
  let test: TestDb;
  let vector: Awaited<ReturnType<typeof seedTwoShops>>["vector"];
  let demo: typeof vector;

  beforeEach(async () => {
    test = await createTestDb();
    ({ vector, demo } = await seedTwoShops(test.db));
    return () => test.close();
  });

  it("guarda reserva, bicis, bloques y día del Demo con su prefijo y duración", async () => {
    const result = await createBooking(test.db, input({ bikes: BIKES }), NOW, demo.scope);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.booking).toMatchObject({ branchId: demo.branch.id, code: "TD-260916-1000" });
    expect(result.booking.endsAt.getTime() - result.booking.startsAt.getTime()).toBe(7_200_000);
    expect(await test.db.select().from(bookings)).toMatchObject([{ branchId: demo.branch.id }]);
    expect(await test.db.select().from(bookingBikes)).toMatchObject([{ branchId: demo.branch.id }]);
    expect(await test.db.select().from(bookingBlocks)).toMatchObject([
      { branchId: demo.branch.id, blockStart: "10:00:00" },
      { branchId: demo.branch.id, blockStart: "11:00:00" },
    ]);
    expect(await test.db.select().from(bookingDays)).toMatchObject([
      { branchId: demo.branch.id, serviceDate: DATE },
    ]);
  });

  it("limita el Demo a dos bicis y deja cupo en Vector el mismo día", async () => {
    expect(await createBooking(test.db, input({ bikes: BIKES }), NOW, demo.scope)).toMatchObject({
      ok: true,
    });
    const third = await createBooking(
      test.db,
      input({ start: "12:00", phoneE164: "+56955556666" }),
      NOW,
      demo.scope,
    );
    expect(third).toEqual({ ok: false, code: "slot_unavailable" });
    expect(
      await createBooking(test.db, input({ start: "15:00" }), NOW, vector.scope),
    ).toMatchObject({
      ok: true,
    });
    expect(await test.db.select().from(bookings)).toHaveLength(2);
  });

  it("aplica el límite telefónico dentro de cada sucursal", async () => {
    expect(
      await createBooking(test.db, input({ start: "15:00" }), NOW, vector.scope),
    ).toMatchObject({
      ok: true,
    });
    expect(await createBooking(test.db, input(), NOW, demo.scope)).toMatchObject({ ok: true });
    expect(
      await createBooking(
        test.db,
        input({ serviceDate: "2026-09-17", start: "16:00" }),
        NOW,
        vector.scope,
      ),
    ).toEqual({ ok: false, code: "phone_limit" });
    expect(await test.db.select().from(bookingDays)).toHaveLength(1);
    expect(await test.db.select().from(bookings)).toHaveLength(2);
  });

  it("lee solo bloques, bloqueos y bicis de la sucursal y respeta la exclusión", async () => {
    await createBooking(test.db, input({ bikes: BIKES }), NOW, demo.scope);
    const own = await createBooking(test.db, input({ start: "15:00" }), NOW, vector.scope);
    expect(own.ok).toBe(true);
    if (!own.ok) throw new Error(own.code);
    await test.db.insert(blockedPeriods).values([
      { branchId: demo.branch.id, serviceDate: DATE, reason: "Cerrado" },
      {
        branchId: vector.branch.id,
        serviceDate: DATE,
        startTime: "18:00",
        endTime: "19:00",
        reason: "Reunión",
      },
    ]);
    const expected = {
      activeBlockStarts: ["15:00"],
      blocked: [{ startTime: "18:00", endTime: "19:00" }],
      usedCount: 1,
    };
    const range = await readRange(test.db, DATE, DATE, undefined, vector.branch.id);
    expect(range(DATE)).toEqual(expected);
    expect(
      await test.db.transaction((tx) => readDay(tx, DATE, undefined, vector.branch.id)),
    ).toEqual(expected);
    const excluding = await readRange(test.db, DATE, DATE, own.booking.id, vector.branch.id);
    expect(excluding(DATE)).toEqual({ ...expected, activeBlockStarts: [], usedCount: 0 });
    expect(
      await test.db.transaction((tx) => readDay(tx, DATE, own.booking.id, vector.branch.id)),
    ).toEqual(excluding(DATE));
    expect(range("2026-09-17")).toEqual({ activeBlockStarts: [], blocked: [], usedCount: 0 });
  });

  it("exige alcance con dos talleres y no escribe ninguna fila", async () => {
    await expect(createBooking(test.db, input({ start: "15:00" }), NOW)).rejects.toThrow(
      ShopScopeError,
    );
    expect((await readRange(test.db, DATE, DATE))(DATE)).toEqual(EMPTY_DAY);
    expect(await test.db.transaction((tx) => readDay(tx, DATE))).toEqual(EMPTY_DAY);
    expect(await test.db.select().from(bookings)).toHaveLength(0);
    expect(await test.db.select().from(bookingBikes)).toHaveLength(0);
    expect(await test.db.select().from(bookingBlocks)).toHaveLength(0);
    expect(
      await test.db.select().from(bookingDays).where(eq(bookingDays.serviceDate, DATE)),
    ).toHaveLength(0);
  });

  it("sin alcance y con dos talleres, readRange no ve filas de ninguno (falla cerrada, BG-D41)", async () => {
    const booked = await createBooking(test.db, input({ start: "15:00" }), NOW, vector.scope);
    expect(booked.ok).toBe(true);
    expect((await readRange(test.db, DATE, DATE))(DATE)).toEqual(EMPTY_DAY);
    expect(
      (await readRange(test.db, DATE, DATE, undefined, vector.branch.id))(DATE).usedCount,
    ).toBe(1);
  });
});
