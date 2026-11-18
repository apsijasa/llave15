import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  LEGACY_BOOKING_CONFIG,
  bookingConfigFromShop,
  weekHoursSchema,
} from "../../src/server/booking/config.ts";
import { hoursFor } from "../../src/server/booking/rules.ts";
import type { DayInput } from "../../src/server/booking/slots.ts";
import {
  calendarClosure,
  checkStart,
  computeDay,
  gridForDate,
} from "../../src/server/booking/slots.ts";
import { shops } from "../../src/server/db/schema-shops.ts";
import { branches } from "../../src/server/db/schema.ts";
import { ShopScopeError, scopeForBranch, singleShopScope } from "../../src/server/shops/scope.ts";
import { createLegacyTestDb, NO_SHOP } from "../helpers/legacy-db.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { createTestDb } from "../helpers/pglite.ts";
import { DEMO_SHOP_PROFILE, insertBranchForShop, seedShop } from "../helpers/shops.ts";

function dayInput(extra: Partial<DayInput> = {}): DayInput {
  return {
    date: "2026-10-05",
    mode: "taller",
    now: new Date("2026-10-05T12:30:00Z"), // 09:30 en Santiago.
    activeBlockStarts: [],
    blocked: [],
    usedCount: 0,
    ...extra,
  };
}

describe("configuración de reservas desde shops", () => {
  let test: TestDb;
  let vector: typeof shops.$inferSelect;
  let demo: typeof shops.$inferSelect;

  beforeAll(async () => {
    test = await createTestDb();
    const [shop] = await test.db.select().from(shops);
    if (!shop) throw new Error("Falta el taller sembrado");
    vector = shop;
    demo = await seedShop(test.db, DEMO_SHOP_PROFILE);
  });
  afterAll(async () => {
    await test.close();
  });

  it("carga Vector Bikes con la misma configuración heredada y prefijo VB", () => {
    expect(bookingConfigFromShop(vector)).toEqual(LEGACY_BOOKING_CONFIG);
    expect(bookingConfigFromShop(vector).codePrefix).toBe("VB");
  });

  it("carga todos los valores propios del Taller Demo", () => {
    expect(bookingConfigFromShop(demo)).toEqual({
      blockMinutes: 60,
      dailyCapacity: 2,
      minNoticeMinutes: 60,
      horizonDays: 14,
      pickupEnabled: true,
      pickupFeeClp: 9000,
      pickupComunas: ["Ñuñoa", "Providencia"],
      receptionHours: DEMO_SHOP_PROFILE.receptionHours,
      pickupHours: DEMO_SHOP_PROFILE.pickupHours,
      codePrefix: "TD",
    });
  });

  it.each([
    { open: "25:00", close: "26:00" },
    { open: "10:60", close: "13:00" },
    { open: "9:00", close: "13:00" },
    { open: "13:00", close: "13:00" },
    { open: "14:00", close: "13:00" },
  ])("rechaza horarios inválidos %j en recepción y retiro", (hours) => {
    for (const field of ["receptionHours", "pickupHours"] as const) {
      expect(() =>
        bookingConfigFromShop({ ...demo, [field]: { ...demo[field], "1": hours } }),
      ).toThrow(ZodError);
    }
  });

  it("exige las siete claves ISO y rechaza claves fuera de la semana", () => {
    const { "7": _sunday, ...incomplete } = demo.receptionHours;
    expect(weekHoursSchema.safeParse(incomplete).success).toBe(false);
    expect(weekHoursSchema.safeParse({ ...demo.receptionHours, "8": null }).success).toBe(false);
    expect(weekHoursSchema.parse(demo.receptionHours)).toEqual(demo.receptionHours);
  });

  it("genera bloques de una hora y respeta el horario por modalidad", () => {
    const config = bookingConfigFromShop(demo);
    expect(gridForDate("2026-10-05", "taller", config)).toEqual(["10:00", "11:00", "12:00"]);
    expect(hoursFor("taller", 1, config)).toEqual({ open: "10:00", close: "13:00" });
    const morningPickup = { ...config, pickupHours: vector.pickupHours };
    expect(gridForDate("2026-10-05", "retiro", morningPickup).at(0)).toBe("09:00");
    expect(hoursFor("retiro", 1, morningPickup)).toEqual({ open: "09:00", close: "20:00" });
    expect(calendarClosure("2026-10-10", [], "taller", config)?.status).toBe("closed");
  });

  it("aplica capacidad, horizonte inclusivo y antelación propios del taller", () => {
    const input = dayInput({ config: bookingConfigFromShop(demo) });
    expect(computeDay({ ...input, usedCount: 2 }).status).toBe("full");
    expect(computeDay({ ...input, usedCount: 1, bikeCount: 2 }).status).toBe("full");
    expect(computeDay({ ...input, date: "2026-10-19" }).status).toBe("open");
    expect(computeDay({ ...input, date: "2026-10-20" }).status).toBe("closed");
    expect(computeDay(input).blocks).toEqual([
      { start: "10:00", state: "late" },
      { start: "11:00", state: "free" },
      { start: "12:00", state: "free" },
    ]);
    const boundary = { ...input, now: new Date("2026-10-05T12:00:00Z") };
    expect(computeDay(boundary).blocks[0]?.state).toBe("free");
    expect(checkStart({ ...input, start: "10:00" })).toEqual({ ok: false, reason: "late" });
    expect(checkStart({ ...input, start: "11:30" })).toEqual({
      ok: false,
      reason: "invalid_start",
    });
  });

  it("calcula el término y los bloques consecutivos con el tamaño configurado", () => {
    const input = dayInput({ config: bookingConfigFromShop(demo) });
    expect(checkStart({ ...input, start: "11:00" })).toMatchObject({
      ok: true,
      blockStarts: ["11:00"],
      startsAt: new Date("2026-10-05T14:00:00Z"),
      endsAt: new Date("2026-10-05T15:00:00Z"),
    });
    for (const extra of [{ mode: "retiro" as const }, { bikeCount: 2 }]) {
      expect(checkStart({ ...input, ...extra, start: "11:00" })).toMatchObject({
        ok: true,
        blockStarts: ["11:00", "12:00"],
        endsAt: new Date("2026-10-05T16:00:00Z"),
      });
      expect(checkStart({ ...input, ...extra, start: "12:00" })).toEqual({
        ok: false,
        reason: "noroom",
      });
    }
  });

  it("cierra el retiro cuando el taller lo deshabilita", () => {
    const config = { ...bookingConfigFromShop(demo), pickupEnabled: false };
    expect(hoursFor("retiro", 1, config)).toBeNull();
    expect(gridForDate("2026-10-05", "retiro", config)).toEqual([]);
    expect(computeDay(dayInput({ mode: "retiro", config })).status).toBe("closed");
    expect(gridForDate("2026-10-05", "taller", config)).toHaveLength(3);
  });

  it("sin configuración conserva los horarios, cupos y duración heredados", () => {
    const input = dayInput();
    expect(hoursFor("taller", 1)).toEqual({ open: "15:00", close: "20:00" });
    expect(hoursFor("retiro", 1)).toEqual({ open: "09:00", close: "20:00" });
    expect(gridForDate(input.date)).toEqual([
      "15:00",
      "15:30",
      "16:00",
      "16:30",
      "17:00",
      "17:30",
      "18:00",
      "18:30",
      "19:00",
      "19:30",
    ]);
    expect(computeDay({ ...input, usedCount: 3 }).status).toBe("open");
    expect(computeDay({ ...input, usedCount: 4 }).status).toBe("full");
    expect(checkStart({ ...input, start: "15:00" })).toMatchObject({
      ok: true,
      blockStarts: ["15:00"],
      endsAt: new Date("2026-10-05T18:30:00Z"),
    });
    expect(computeDay(input)).toEqual(computeDay({ ...input, config: LEGACY_BOOKING_CONFIG }));
  });
});

describe("alcance del taller", () => {
  let test: TestDb;
  let vector: typeof shops.$inferSelect;

  beforeEach(async () => {
    test = await createTestDb();
    const [shop] = await test.db.select().from(shops);
    if (!shop) throw new Error("Falta el taller sembrado");
    vector = shop;
  });
  afterEach(async () => {
    await test.close();
  });

  async function expectScopeError(code: "ambiguous" | "missing") {
    const result = singleShopScope(test.db);
    await expect(result).rejects.toBeInstanceOf(ShopScopeError);
    await expect(result).rejects.toMatchObject({ code });
  }

  it("resuelve el único taller con su única sucursal y configuración", async () => {
    const branch = await insertBranchForShop(test.db, vector.id, "Vitacura");
    const expected = {
      shopId: vector.id,
      slug: vector.slug,
      branchId: branch.id,
      config: LEGACY_BOOKING_CONFIG,
    };
    expect(await singleShopScope(test.db)).toEqual(expected);
    expect(await scopeForBranch(test.db, branch.id)).toEqual(expected);
  });

  it("resuelve cada sucursal explícita con dos talleres y rechaza el alcance implícito", async () => {
    const vectorBranch = await insertBranchForShop(test.db, vector.id, "Vitacura");
    const demo = await seedShop(test.db, DEMO_SHOP_PROFILE);
    await expectScopeError("ambiguous"); // Incluso antes de crear la segunda sucursal.
    const demoBranch = await insertBranchForShop(test.db, demo.id, "Ñuñoa");
    expect(await scopeForBranch(test.db, demoBranch.id)).toEqual({
      shopId: demo.id,
      slug: demo.slug,
      branchId: demoBranch.id,
      config: bookingConfigFromShop(demo),
    });
    expect(await scopeForBranch(test.db, vectorBranch.id)).toMatchObject({ shopId: vector.id });
    await expectScopeError("ambiguous");
  });

  it("rechaza el alcance implícito si el único taller tiene dos sucursales", async () => {
    await insertBranchForShop(test.db, vector.id, "Primera");
    await insertBranchForShop(test.db, vector.id, "Segunda");
    await expectScopeError("ambiguous");
  });

  it("rechaza el alcance si falta la sucursal o no hay talleres", async () => {
    await expectScopeError("missing");
    await test.db.delete(shops);
    await expectScopeError("missing");
  });

  it("devuelve null para una sucursal inexistente o sin taller asociado", async () => {
    await test.close();
    test = await createLegacyTestDb(); // la sucursal huérfana solo cabe antes de V-BG3
    expect(await scopeForBranch(test.db, "00000000-0000-0000-0000-000000000000")).toBeNull();
    const [orphan] = await test.db
      .insert(branches)
      .values({ name: "Sin taller", shopId: NO_SHOP })
      .returning();
    if (!orphan) throw new Error("Falta la sucursal de prueba");
    expect(await scopeForBranch(test.db, orphan.id)).toBeNull();
    await expectScopeError("missing");
  });
});
