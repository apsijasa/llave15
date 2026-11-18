import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createBooking } from "../../src/server/booking/create-booking.ts";
import { bookings } from "../../src/server/db/schema.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { createTestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const NOW = new Date("2026-09-15T15:00:00Z");
const DATE = "2026-09-16";

function sqlState(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  while (typeof error === "object" && error !== null && !seen.has(error)) {
    seen.add(error);
    if ("code" in error && typeof error.code === "string") return error.code;
    error = "cause" in error ? error.cause : undefined;
  }
  return undefined;
}

async function expectCheckViolation(query: Promise<unknown>) {
  let caught: unknown;
  try {
    await query;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeDefined();
  expect(sqlState(caught)).toBe("23514");
}

let test: TestDb;
let demo: Awaited<ReturnType<typeof seedTwoShops>>["demo"];

beforeEach(async () => {
  test = await createTestDb();
  ({ demo } = await seedTwoShops(test.db));
});
afterEach(async () => {
  await test.close();
});

function bookingRow(overrides: Partial<typeof bookings.$inferInsert> = {}) {
  return {
    branchId: demo.branch.id,
    code: "TD-260916-1000",
    serviceDate: DATE,
    mode: "retiro",
    startsAt: new Date("2026-09-16T13:00:00Z"),
    endsAt: new Date("2026-09-16T15:00:00Z"),
    customerName: "Cliente de prueba",
    phoneE164: "+56912345678",
    bike: "Urbana",
    description: "Ajuste de frenos",
    comuna: "Ñuñoa",
    address: "Irarrázaval 1000",
    pickupFeeClp: 15000,
    consentAt: NOW,
    cancelTokenHash: "hash-de-prueba",
    ...overrides,
  };
}

it("guarda el retiro del Taller Demo en Ñuñoa con tarifa de $9.000", async () => {
  const result = await createBooking(
    test.db,
    {
      mode: "retiro",
      serviceDate: DATE,
      start: "10:00",
      customerName: "Cliente de prueba",
      phoneE164: "+56912345678",
      email: null,
      bike: "Urbana",
      description: "Ajuste de frenos",
      comuna: "Ñuñoa",
      address: "Irarrázaval 1000",
      ipHash: null,
    },
    NOW,
    demo.scope,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.code);
  const rows = await test.db
    .select()
    .from(bookings)
    .where(and(eq(bookings.branchId, demo.branch.id), eq(bookings.id, result.booking.id)));
  expect(rows).toMatchObject([
    { branchId: demo.branch.id, mode: "retiro", comuna: "Ñuñoa", pickupFeeClp: 9000 },
  ]);
});

it("acepta un retiro con tarifa cero y dirección presente", async () => {
  const rows = await test.db
    .insert(bookings)
    .values(bookingRow({ pickupFeeClp: 0 }))
    .returning();
  expect(rows).toMatchObject([{ branchId: demo.branch.id, pickupFeeClp: 0 }]);
});

it.each([
  { name: "una reserva en taller con tarifa 100", values: { mode: "taller", pickupFeeClp: 100 } },
  { name: "un retiro con comuna vacía", values: { comuna: "" } },
  { name: "un retiro con comuna de solo espacios", values: { comuna: "   " } },
  { name: "un retiro sin dirección", values: { address: null } },
  { name: "un retiro con tarifa negativa", values: { pickupFeeClp: -1 } },
])("rechaza $name con SQLSTATE 23514", async ({ values }) => {
  await expectCheckViolation(test.db.insert(bookings).values(bookingRow(values)).execute());
});
