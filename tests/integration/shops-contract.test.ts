import { afterEach, beforeEach, expect, it } from "vitest";
import { bookingDays, bookings, branches } from "../../src/server/db/schema.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { createTestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

function sqlState(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  while (typeof error === "object" && error !== null && !seen.has(error)) {
    seen.add(error);
    if ("code" in error && typeof error.code === "string") return error.code;
    error = "cause" in error ? error.cause : undefined;
  }
  return undefined;
}

async function expectSqlState(query: Promise<unknown>, code: string) {
  let caught: unknown;
  try {
    await query;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeDefined();
  expect(sqlState(caught)).toBe(code);
}

let test: TestDb;
beforeEach(async () => {
  test = await createTestDb();
});
afterEach(async () => {
  await test.close();
});

it("rechaza una sucursal sin shop_id con dos talleres con SQLSTATE 23502", async () => {
  await seedTwoShops(test.db);
  await expectSqlState(
    test.db.insert(branches).values({ name: "Sucursal sin taller" }).execute(),
    "23502",
  );
});

it("rechaza una reserva sin branch_id con dos sucursales con SQLSTATE 23502", async () => {
  await seedTwoShops(test.db);
  await expectSqlState(
    test.db
      .insert(bookings)
      .values({
        code: "TP-001",
        serviceDate: "2026-11-23",
        mode: "taller",
        startsAt: new Date("2026-11-23T13:00:00Z"),
        endsAt: new Date("2026-11-23T14:00:00Z"),
        customerName: "Cliente de prueba",
        phoneE164: "+56912345678",
        bike: "Ruta",
        description: "Mantención",
        consentAt: new Date("2026-11-18T12:00:00Z"),
        cancelTokenHash: "hash-de-prueba",
      })
      .execute(),
    "23502",
  );
});

it("acepta la misma fecha en dos sucursales y rechaza repetirla en una con SQLSTATE 23505", async () => {
  const { vector, demo } = await seedTwoShops(test.db);
  const serviceDate = "2026-11-23";
  const rows = await test.db
    .insert(bookingDays)
    .values([
      { branchId: vector.branch.id, serviceDate },
      { branchId: demo.branch.id, serviceDate },
    ])
    .returning();
  expect(rows).toEqual([
    expect.objectContaining({ branchId: vector.branch.id, serviceDate }),
    expect.objectContaining({ branchId: demo.branch.id, serviceDate }),
  ]);
  await expectSqlState(
    test.db.insert(bookingDays).values({ branchId: vector.branch.id, serviceDate }).execute(),
    "23505",
  );
});
