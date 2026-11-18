import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { customers } from "../../src/server/db/schema-taller.ts";
import { bookingBlocks, bookings, branches } from "../../src/server/db/schema.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { createTestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

async function expectUniqueViolation(query: Promise<unknown>, constraint: string) {
  let caught: unknown;
  try {
    await query;
  } catch (error) {
    caught = error;
  }
  const seen = new Set<unknown>();
  while (typeof caught === "object" && caught !== null && !seen.has(caught)) {
    seen.add(caught);
    if ("code" in caught) break;
    caught = "cause" in caught ? caught.cause : undefined;
  }
  expect(caught).toMatchObject({ code: "23505", constraint });
}

const serviceDate = "2026-11-23";
const blockStart = "15:00:00";
const rut = "12345678-5";

function bookingRow(branchId: string, code: string) {
  return {
    branchId,
    code,
    serviceDate,
    mode: "taller",
    startsAt: new Date("2026-11-23T18:00:00Z"),
    endsAt: new Date("2026-11-23T18:30:00Z"),
    customerName: "Cliente de prueba",
    phoneE164: "+56912345678",
    bike: "Gravel",
    description: "Mantención",
    consentAt: new Date("2026-11-18T12:00:00Z"),
    cancelTokenHash: randomUUID(),
  };
}

function blockRow(booking: typeof bookings.$inferSelect, isActive = true) {
  return { branchId: booking.branchId, bookingId: booking.id, serviceDate, blockStart, isActive };
}

function customerRow(branchId: string, customerRut: string | null = rut) {
  return { branchId, name: "Cliente de prueba", rut: customerRut, phoneE164: "+56912345678" };
}

let test: TestDb;
let tenants: Awaited<ReturnType<typeof seedTwoShops>>;
beforeEach(async () => {
  test = await createTestDb();
  tenants = await seedTwoShops(test.db);
});
afterEach(async () => {
  await test.close();
});

it("acepta reservas en la misma fecha y hora en Vector Bikes y el Taller Demo", async () => {
  const { vector, demo } = tenants;
  const rows = await test.db
    .insert(bookings)
    .values([bookingRow(vector.branch.id, "VB-001"), bookingRow(demo.branch.id, "TD-001")])
    .returning();
  const blocks = await test.db
    .insert(bookingBlocks)
    .values(rows.map((row) => blockRow(row)))
    .returning();
  expect(blocks).toEqual([
    expect.objectContaining({
      branchId: vector.branch.id,
      serviceDate,
      blockStart,
      isActive: true,
    }),
    expect.objectContaining({ branchId: demo.branch.id, serviceDate, blockStart, isActive: true }),
  ]);
});

it.each(["vector", "demo"] as const)(
  "rechaza un segundo bloque activo en la misma sucursal (%s) con el índice de siempre",
  async (tenant) => {
    const { branch } = tenants[tenant];
    const rows = await test.db
      .insert(bookings)
      .values([bookingRow(branch.id, "TP-001"), bookingRow(branch.id, "TP-002")])
      .returning();
    const [first, second] = rows;
    if (!first || !second) throw new Error("Faltan las reservas de prueba.");
    await test.db.insert(bookingBlocks).values(blockRow(first));
    await expectUniqueViolation(
      test.db.insert(bookingBlocks).values(blockRow(second)).execute(),
      "uq_booking_blocks_active_slot",
    );
  },
);

it("acepta bloques inactivos repetidos junto al bloque activo de la misma sucursal", async () => {
  const [booking] = await test.db
    .insert(bookings)
    .values(bookingRow(tenants.vector.branch.id, "TP-001"))
    .returning();
  if (!booking) throw new Error("Falta la reserva de prueba.");
  const rows = await test.db
    .insert(bookingBlocks)
    .values([blockRow(booking), blockRow(booking, false), blockRow(booking, false)])
    .returning();
  expect(rows.map((row) => row.isActive)).toEqual([true, false, false]);
});

it("acepta el mismo código de reserva en dos sucursales de distintos talleres", async () => {
  const rows = await test.db
    .insert(bookings)
    .values([
      bookingRow(tenants.vector.branch.id, "TP-001"),
      bookingRow(tenants.demo.branch.id, "TP-001"),
    ])
    .returning();
  expect(rows.map((row) => row.branchId)).toEqual([
    tenants.vector.branch.id,
    tenants.demo.branch.id,
  ]);
});

it.each(["vector", "demo"] as const)(
  "rechaza repetir el código de reserva en la misma sucursal (%s) con el índice de siempre",
  async (tenant) => {
    const { branch } = tenants[tenant];
    await test.db.insert(bookings).values(bookingRow(branch.id, "TP-001"));
    await expectUniqueViolation(
      test.db.insert(bookings).values(bookingRow(branch.id, "TP-001")).execute(),
      "uq_bookings_code",
    );
  },
);

it("acepta el mismo RUT en dos talleres", async () => {
  const rows = await test.db
    .insert(customers)
    .values([customerRow(tenants.vector.branch.id), customerRow(tenants.demo.branch.id)])
    .returning();
  expect(rows).toEqual([
    expect.objectContaining({ branchId: tenants.vector.branch.id, rut }),
    expect.objectContaining({ branchId: tenants.demo.branch.id, rut }),
  ]);
});

it.each(["vector", "demo"] as const)(
  "rechaza repetir el RUT en la misma sucursal (%s) con el índice de siempre",
  async (tenant) => {
    const { branch } = tenants[tenant];
    await test.db.insert(customers).values(customerRow(branch.id));
    await expectUniqueViolation(
      test.db.insert(customers).values(customerRow(branch.id)).execute(),
      "uq_customers_rut",
    );
  },
);

it("acepta varios clientes sin RUT en la misma sucursal", async () => {
  const row = customerRow(tenants.vector.branch.id, null);
  const rows = await test.db.insert(customers).values([row, row]).returning();
  expect(rows.map((customer) => customer.rut)).toEqual([null, null]);
});

it("acepta el mismo nombre de sucursal en dos talleres", async () => {
  const rows = await test.db
    .insert(branches)
    .values([
      { shopId: tenants.vector.shop.id, name: "Sucursal Central" },
      { shopId: tenants.demo.shop.id, name: "Sucursal Central" },
    ])
    .returning();
  expect(rows).toEqual([
    expect.objectContaining({ shopId: tenants.vector.shop.id, name: "Sucursal Central" }),
    expect.objectContaining({ shopId: tenants.demo.shop.id, name: "Sucursal Central" }),
  ]);
});

it.each(["vector", "demo"] as const)(
  "rechaza repetir el nombre de sucursal en el mismo taller (%s) con el índice de siempre",
  async (tenant) => {
    const { shop, branch } = tenants[tenant];
    await expectUniqueViolation(
      test.db.insert(branches).values({ shopId: shop.id, name: branch.name }).execute(),
      "uq_branches_name",
    );
  },
);
