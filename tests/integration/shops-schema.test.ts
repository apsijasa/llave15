import { afterEach, beforeEach, expect, it } from "vitest";
import { shops } from "../../src/server/db/schema-shops.ts";
import {
  blockedPeriods,
  bookingBikes,
  bookingBlocks,
  bookingDays,
  bookingRequests,
  bookings,
  branches,
  users,
  whatsappMessages,
} from "../../src/server/db/schema.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { createLegacyTestDb } from "../helpers/legacy-db.ts";

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

const shopValues = {
  slug: "taller-prueba",
  name: "Taller de prueba",
  email: "hola@ejemplo.cl",
  notifyEmail: "avisos@ejemplo.cl",
  phone: "+56912345678",
  phoneDisplay: "+56 9 1234 5678",
  streetAddress: "Calle de prueba 123",
  addressShort: "Calle de prueba",
  locality: "Comuna de prueba",
  region: "Región de prueba",
  receptionHours: { "1": { open: "10:00", close: "18:00" }, "7": null },
  pickupHours: { "1": { open: "09:00", close: "12:00" }, "7": null },
  dailyCapacity: 4,
  blockMinutes: 30,
  minNoticeMinutes: 120,
  horizonDays: 30,
  codePrefix: "TP",
};

let test: TestDb;
beforeEach(async () => {
  // Prueba el esquema expand de BG-03: columnas nulables, como la base antes de V-BG3 (BG-D42).
  test = await createLegacyTestDb();
});
afterEach(async () => {
  await test.close();
});

async function insertShop(overrides: Partial<typeof shops.$inferInsert> = {}) {
  const [shop] = await test.db
    .insert(shops)
    .values({ ...shopValues, ...overrides })
    .returning();
  if (!shop) throw new Error("No se creó el taller de prueba");
  return shop;
}

async function insertBranch(name = "Sucursal de prueba") {
  const [branch] = await test.db.insert(branches).values({ name }).returning();
  if (!branch) throw new Error("No se creó la sucursal de prueba");
  return branch;
}

async function insertBooking(code = "TP-001") {
  const [booking] = await test.db
    .insert(bookings)
    .values({
      code,
      serviceDate: "2026-11-23",
      mode: "taller",
      startsAt: new Date("2026-11-23T13:00:00Z"),
      endsAt: new Date("2026-11-23T14:00:00Z"),
      customerName: "Cliente de prueba",
      phoneE164: "+56912345678",
      bike: "Ruta",
      description: "Mantención",
      consentAt: new Date("2026-11-18T12:00:00Z"),
      cancelTokenHash: code,
    })
    .returning();
  if (!booking) throw new Error("No se creó la reserva de prueba");
  return booking;
}

it("crea talleres con sus valores por defecto y horarios JSON", async () => {
  const shop = await insertShop();
  expect(shop).toMatchObject({
    ...shopValues,
    timezone: "America/Santiago",
    status: "activo",
    pickupEnabled: false,
    pickupFeeClp: 0,
    pickupComunas: [],
    certifications: [],
    legalName: null,
    rut: null,
    mapsUrl: null,
    instagramUrl: null,
    logoKey: null,
  });
  expect(shop.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(shop.createdAt).toBeInstanceOf(Date);
  expect(shop.updatedAt).toBeInstanceOf(Date);
});

it("guarda false al omitir is_platform_admin", async () => {
  const branch = await insertBranch();
  const result = await test.client.query<{ is_platform_admin: boolean }>(
    `insert into users (branch_id, email, password_hash, name, role)
     values ($1, 'usuario@ejemplo.cl', 'test-hash', 'Usuario de prueba', 'owner')
     returning is_platform_admin`,
    [branch.id],
  );
  expect(result.rows).toEqual([{ is_platform_admin: false }]);
  expect(users.isPlatformAdmin.notNull).toBe(true);
});

const invalidShops: Partial<typeof shops.$inferInsert>[] = [
  { slug: "Taller" },
  { slug: "taller--prueba" },
  { slug: "-taller" },
  { slug: "ab" },
  { slug: "a".repeat(41) },
  { codePrefix: "tp" },
  { codePrefix: "T" },
  { codePrefix: "ABCDE" },
  { dailyCapacity: 0 },
  { dailyCapacity: 21 },
  { blockMinutes: 25 },
  { minNoticeMinutes: -1 },
  { minNoticeMinutes: 10081 },
  { horizonDays: 0 },
  { horizonDays: 121 },
  { pickupFeeClp: -1 },
  { status: "cerrado" },
  { pickupEnabled: true, pickupComunas: [] },
  { timezone: "UTC" },
];
it.each(invalidShops)("rechaza el taller inválido %j con SQLSTATE 23514", async (values) => {
  await expectSqlState(insertShop(values), "23514");
});

it.each([
  { slug: shopValues.slug, codePrefix: "OT" },
  { slug: "otro-taller", codePrefix: shopValues.codePrefix },
])("rechaza el duplicado %j con SQLSTATE 23505", async (values) => {
  await insertShop();
  await expectSqlState(insertShop(values), "23505");
});

it("acepta los límites de configuración, suspensión y retiro con comunas", async () => {
  for (const [position, blockMinutes] of [15, 20, 30, 45, 60].entries()) {
    await insertShop({
      slug: `taller-${position}`,
      codePrefix: `T${String.fromCharCode(65 + position)}`,
      blockMinutes,
      dailyCapacity: position === 0 ? 1 : 20,
      minNoticeMinutes: position === 0 ? 0 : 10080,
      horizonDays: position === 0 ? 1 : 120,
      status: "suspendido",
      pickupEnabled: true,
      pickupComunas: ["Comuna de prueba"],
    });
  }
});

it("enlaza automáticamente la sucursal con un solo taller y queda nula con dos", async () => {
  await test.db.delete(shops); // parte sin talleres, aunque la siembra traiga uno (BG-04)
  expect((await insertBranch("Sin taller")).shopId).toBeNull();
  const shop = await insertShop();
  expect((await insertBranch()).shopId).toBe(shop.id);
  await insertShop({ slug: "otro-taller", codePrefix: "OT" });
  expect((await insertBranch("Otra sucursal")).shopId).toBeNull();
  const [explicit] = await test.db
    .insert(branches)
    .values({ name: "Sucursal explícita", shopId: shop.id })
    .returning();
  expect(explicit?.shopId).toBe(shop.id);
});

async function insertBikeAndBlock(bookingId: string, serviceDate: string) {
  const [bike] = await test.db
    .insert(bookingBikes)
    .values({
      bookingId,
      position: 2,
      bike: "Ruta",
      description: "Mantención",
    })
    .returning();
  const [block] = await test.db
    .insert(bookingBlocks)
    .values({
      bookingId,
      serviceDate,
      blockStart: "10:00",
    })
    .returning();
  return [bike, block];
}

async function insertBookingRows() {
  const booking = await insertBooking();
  const bookingId = booking.id;
  const serviceDate = booking.serviceDate;
  const children = await insertBikeAndBlock(bookingId, serviceDate);
  const [day] = await test.db.insert(bookingDays).values({ serviceDate }).returning();
  const [period] = await test.db
    .insert(blockedPeriods)
    .values({
      serviceDate,
      reason: "Bloqueo de prueba",
    })
    .returning();
  const [request] = await test.db
    .insert(bookingRequests)
    .values({ ipHash: "test-hash" })
    .returning();
  const [message] = await test.db
    .insert(whatsappMessages)
    .values({ bookingId, type: "ready" })
    .returning();
  return [booking, ...children, day, period, request, message];
}

it.each([0, 1, 2])("resuelve branch_id en las siete tablas con %i sucursales", async (count) => {
  let branchId: string | null = null;
  for (let position = 0; position < count; position++) {
    branchId = (await insertBranch(`Sucursal ${position}`)).id;
  }
  for (const row of await insertBookingRows()) {
    expect(row).toMatchObject({ branchId: count === 1 ? branchId : null });
  }
});

it("permite un branch_id explícito con dos sucursales", async () => {
  const branch = await insertBranch();
  await insertBranch("Otra sucursal");
  const [request] = await test.db
    .insert(bookingRequests)
    .values({ branchId: branch.id, ipHash: "test-hash" })
    .returning();
  expect(request?.branchId).toBe(branch.id);
});

it("crea los cuatro índices no únicos por sucursal", async () => {
  const result = await test.client.query<{ indexname: string; indexdef: string }>(
    "select indexname, indexdef from pg_indexes where schemaname = 'public'",
  );
  const indexes = {
    idx_bookings_branch_service_date: "(branch_id, service_date)",
    idx_booking_blocks_branch_service_date: "(branch_id, service_date)",
    idx_blocked_periods_branch_service_date: "(branch_id, service_date)",
    idx_booking_requests_branch_ip_created: "(branch_id, ip_hash, created_at)",
  };
  for (const [name, columns] of Object.entries(indexes)) {
    const index = result.rows.find((row) => row.indexname === name);
    expect(index?.indexdef).toContain(columns);
    expect(index?.indexdef).not.toContain("UNIQUE");
  }
});
