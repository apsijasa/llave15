import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { type CreateBookingInput, createBooking } from "../../src/server/booking/create-booking.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { bookingBlocks } from "../../src/server/db/schema.ts";
import { platformHealth } from "../../src/server/shops/health.ts";
import type { BookingScope } from "../../src/server/shops/scope.ts";
import { createTestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

/** Martes 2026-09-15, 12:00 hora local. */
const NOW = new Date("2026-09-15T15:00:00.000Z");
let db: AppDb;
let shops: Awaited<ReturnType<typeof seedTwoShops>>;

async function seedBooking(scope: BookingScope, overrides: Partial<CreateBookingInput> = {}) {
  const result = await createBooking(
    db,
    {
      mode: "taller",
      serviceDate: "2026-09-16",
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

async function seedOrder(branchId: string, ownerId: string, bookingId: string) {
  const [customer] = await db
    .insert(customers)
    .values({ branchId, name: "Cliente", phoneE164: "+56970000001" })
    .returning();
  if (!customer) throw new Error("Falta cliente");
  const [bike] = await db
    .insert(bikes)
    .values({ branchId, customerId: customer.id, brand: "Trek", model: "FX", bikeType: "urbana" })
    .returning();
  if (!bike) throw new Error("Falta bicicleta");
  const [order] = await db
    .insert(workOrders)
    .values({
      branchId,
      number: 1,
      customerId: customer.id,
      bikeId: bike.id,
      bookingId,
      bookingPosition: 1,
      status: "creado",
      requestedService: "Mantención",
      createdBy: ownerId,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning();
  if (!order) throw new Error("Falta orden");
  return order;
}

describe("platformHealth", () => {
  beforeEach(async () => {
    db = (await createTestDb()).db;
    shops = await seedTwoShops(db);
  });

  it("devuelve ok con dos talleres sanos y sus reservas y órdenes", async () => {
    const booking = await seedBooking(shops.vector.scope);
    await seedBooking(shops.demo.scope, { start: "10:00" });
    await seedOrder(shops.vector.branch.id, shops.vector.owner.id, booking.id);
    expect(await platformHealth(db)).toEqual({
      ok: true,
      shopsWithoutSingleBranch: 0,
      blocksCrossBranch: 0,
      ordersBookingCrossBranch: 0,
    });
  });

  it("cuenta una orden que apunta a una reserva de otra sucursal", async () => {
    const foreign = await seedBooking(shops.demo.scope, { start: "10:00" });
    await seedOrder(shops.vector.branch.id, shops.vector.owner.id, foreign.id);
    expect(await platformHealth(db)).toMatchObject({ ok: false, ordersBookingCrossBranch: 1 });
  });

  it("cuenta un bloque cuya reserva es de otra sucursal", async () => {
    const booking = await seedBooking(shops.demo.scope, { start: "10:00" });
    await db
      .update(bookingBlocks)
      .set({ branchId: shops.vector.branch.id })
      .where(eq(bookingBlocks.bookingId, booking.id));
    const health = await platformHealth(db);
    expect(health.ok).toBe(false);
    expect(health.blocksCrossBranch).toBeGreaterThan(0);
  });
});

describe("scripts de la compuerta", () => {
  it("bg-check sale 2 sin conexión", () => {
    const run = spawnSync(process.execPath, ["scripts/bg-check.ts"], {
      env: { ...process.env, DATABASE_URL: "postgres://127.0.0.1:1/x" },
      encoding: "utf8",
    });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("No se pudo conectar");
  });

  it("package.json declara test:web, bg:check y la compuerta con test:web", () => {
    const { scripts } = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(scripts["test:web"]).toBe("sh web/vector-bikes/scripts/test-web.sh");
    expect(scripts["bg:check"]).toBe("node --env-file-if-exists=.env scripts/bg-check.ts");
    expect(scripts.gate).toMatch(/&& pnpm test:web$/);
  });
});
