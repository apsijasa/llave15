import { sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { shops } from "../../src/server/db/schema-shops.ts";
import {
  blockedPeriods,
  bookingBikes,
  bookingBlocks,
  bookingDays,
  bookingRequests,
  bookings,
  branches,
  whatsappMessages,
} from "../../src/server/db/schema.ts";
import { backfillFirstShop } from "../../src/server/shops/backfill.ts";
import type { ObjectStorage } from "../../src/server/storage/storage.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { createLegacyTestDb, NO_BRANCH, NO_SHOP } from "../helpers/legacy-db.ts";
import { DEMO_SHOP_PROFILE, seedShop, VECTOR_BIKES_PROFILE } from "../helpers/shops.ts";

const now = new Date("2026-11-18T12:00:00Z");
const input = { profile: VECTOR_BIKES_PROFILE, notifyEmail: "avisos@ejemplo.cl", dryRun: false };
const tables = {
  bookings,
  bookingBikes,
  bookingBlocks,
  bookingDays,
  blockedPeriods,
  bookingRequests,
  whatsappMessages,
};
let test: TestDb;
beforeEach(async () => {
  test = await createLegacyTestDb();
  await test.db.delete(shops);
});
afterEach(async () => {
  await test.close();
});

async function seedLegacyBooking() {
  const [booking] = await test.db
    .insert(bookings)
    .values({
      branchId: NO_BRANCH,
      code: "VB-001",
      serviceDate: "2026-11-23",
      mode: "taller",
      startsAt: now,
      endsAt: new Date("2026-11-18T13:00:00Z"),
      customerName: "Cliente de prueba",
      phoneE164: "+56912345678",
      bike: "Ruta",
      description: "Mantención",
      consentAt: now,
      cancelTokenHash: "test-hash",
    })
    .returning();
  if (!booking) throw new Error("Falta la reserva de prueba");
  return booking;
}

async function seedLegacyRows() {
  const [branch] = await test.db
    .insert(branches)
    .values({ name: "Sucursal inicial", shopId: NO_SHOP })
    .returning();
  if (!branch) throw new Error("Falta la sucursal de prueba");
  const booking = await seedLegacyBooking();
  await test.db.insert(bookingBikes).values({
    branchId: NO_BRANCH,
    bookingId: booking.id,
    position: 2,
    bike: "Ruta",
    description: "Mantención",
  });
  await test.db.insert(bookingBlocks).values({
    branchId: NO_BRANCH,
    bookingId: booking.id,
    serviceDate: booking.serviceDate,
    blockStart: "10:00",
  });
  await test.db
    .insert(bookingDays)
    .values({ branchId: NO_BRANCH, serviceDate: booking.serviceDate });
  await test.db.insert(blockedPeriods).values({
    branchId: NO_BRANCH,
    serviceDate: booking.serviceDate,
    reason: "Bloqueo de prueba",
  });
  await test.db.insert(bookingRequests).values({ branchId: NO_BRANCH, ipHash: "test-hash" });
  await test.db
    .insert(whatsappMessages)
    .values({ branchId: NO_BRANCH, bookingId: booking.id, type: "ready" });
  return branch;
}

async function snapshot() {
  const rows: Record<string, unknown> = {
    shops: await test.db.select().from(shops),
    branches: await test.db.select().from(branches),
  };
  for (const [name, table] of Object.entries(tables))
    rows[name] = await test.db.select().from(table);
  return rows;
}

function fakeStorage(onPut?: (key: string) => Promise<void>) {
  const objects = new Map<string, Buffer>();
  const storage: ObjectStorage = {
    put: vi.fn(async (key, body) => {
      await onPut?.(key);
      objects.set(key, body);
    }),
    get: vi.fn(async (key) => objects.get(key) ?? null),
    delete: vi.fn(async (key) => {
      objects.delete(key);
    }),
    exists: vi.fn(async (key) => objects.has(key)),
  };
  return { storage, objects };
}

it("crea el perfil recibido, enlaza la sucursal y completa las siete tablas", async () => {
  const branch = await seedLegacyRows();
  const result = await backfillFirstShop(test.db, input, now);
  expect(result).toEqual({
    ok: true,
    dryRun: false,
    shopCreated: true,
    branchesLinked: 1,
    filled: Object.fromEntries(Object.keys(tables).map((name) => [name, 1])),
    pending: 0,
    logoStored: false,
  });
  const [shop] = await test.db.select().from(shops);
  expect(shop).toMatchObject({
    ...VECTOR_BIKES_PROFILE,
    notifyEmail: input.notifyEmail,
    createdAt: now,
    updatedAt: now,
  });
  expect(await test.db.select().from(branches)).toMatchObject([
    { id: branch.id, shopId: shop?.id },
  ]);
  for (const table of Object.values(tables)) {
    expect(await test.db.select().from(table)).toMatchObject([{ branchId: branch.id }]);
  }
});

it("la segunda corrida no escribe filas ni cambia sus fechas", async () => {
  await seedLegacyRows();
  await backfillFirstShop(test.db, input, now);
  const before = await snapshot();
  const result = await backfillFirstShop(test.db, input, new Date("2026-11-19T12:00:00Z"));
  expect(result).toMatchObject({ ok: true, shopCreated: false, branchesLinked: 0, pending: 0 });
  expect(result.ok && Object.values(result.filled).every((count) => count === 0)).toBe(true);
  expect(await snapshot()).toEqual(before);
});

it("dry-run informa los conteos sin escribir ni subir el logo y no exige correo", async () => {
  await seedLegacyRows();
  const before = await snapshot();
  const { storage } = fakeStorage();
  const result = await backfillFirstShop(
    test.db,
    {
      profile: VECTOR_BIKES_PROFILE,
      dryRun: true,
      logo: Buffer.from("logo"),
      storage,
    },
    now,
  );
  expect(result).toMatchObject({
    ok: true,
    dryRun: true,
    shopCreated: true,
    branchesLinked: 1,
    pending: 8,
    logoStored: false,
  });
  expect(result.ok && Object.values(result.filled)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  expect(await snapshot()).toEqual(before);
  expect(storage.put).not.toHaveBeenCalled();
});

it("rechaza dos sucursales sin taller sin escribir ni subir un logo", async () => {
  await seedLegacyRows();
  await test.db.insert(branches).values({ name: "Segunda sucursal", shopId: NO_SHOP });
  const before = await snapshot();
  const { storage } = fakeStorage();
  expect(
    await backfillFirstShop(test.db, { ...input, logo: Buffer.from("logo"), storage }, now),
  ).toEqual({ ok: false, code: "ambiguous" });
  expect(await snapshot()).toEqual(before);
  expect(storage.put).not.toHaveBeenCalled();
});

it("no crea el taller inicial si ya existe otro taller", async () => {
  await seedShop(test.db, DEMO_SHOP_PROFILE);
  const before = await snapshot();
  expect(await backfillFirstShop(test.db, input, now)).toEqual({ ok: false, code: "ambiguous" });
  expect(await snapshot()).toEqual(before);
});

it("conserva las filas que ya tienen sucursal y el perfil existente", async () => {
  const shop = await seedShop(test.db, VECTOR_BIKES_PROFILE);
  const branch = await seedLegacyRows();
  await test.db.insert(bookingRequests).values({ branchId: branch.id, ipHash: "explicit" });
  const result = await backfillFirstShop(test.db, input, now);
  expect(result).toMatchObject({ ok: true, shopCreated: false, pending: 0 });
  expect(await test.db.select().from(shops)).toEqual([shop]);
  expect(await test.db.select().from(bookingRequests)).toHaveLength(2);
});

it.each([false, true])(
  "sube el logo antes de la transacción (taller existente: %s)",
  async (existing) => {
    if (existing) await seedShop(test.db, VECTOR_BIKES_PROFILE);
    await seedLegacyRows();
    let transactionOpen = false;
    const transaction = test.db.transaction.bind(test.db);
    vi.spyOn(test.db, "transaction").mockImplementation(async (callback, config) => {
      transactionOpen = true;
      try {
        return await transaction(callback, config);
      } finally {
        transactionOpen = false;
      }
    });
    const { storage, objects } = fakeStorage(async (key) => {
      expect(transactionOpen).toBe(false);
      expect(key).toMatch(/^shops\/[0-9a-f-]{36}\/logo\.png$/);
      const [shop] = await test.db.select().from(shops);
      expect(shop?.logoKey ?? null).toBeNull();
    });
    const result = await backfillFirstShop(
      test.db,
      { ...input, logo: Buffer.from("logo"), storage },
      now,
    );
    const [shop] = await test.db.select().from(shops);
    expect(result).toMatchObject({ ok: true, logoStored: true });
    expect(shop?.logoKey).toBe(`shops/${shop?.id}/logo.png`);
    expect(objects.get(shop?.logoKey ?? "")).toEqual(Buffer.from("logo"));
    expect(storage.delete).not.toHaveBeenCalled();
    const before = await snapshot();
    await backfillFirstShop(test.db, { ...input, logo: Buffer.from("otro"), storage }, now);
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(await snapshot()).toEqual(before);
  },
);

it("revierte todas las filas y elimina el logo si falla una escritura posterior", async () => {
  await seedLegacyRows();
  const before = await snapshot();
  // Restricción temporal solo de esta base de prueba: fuerza un error después de crear y enlazar.
  await test.db.execute(
    sql`alter table booking_requests add constraint test_backfill_failure check (branch_id is null)`,
  );
  const { storage, objects } = fakeStorage();
  await expect(
    backfillFirstShop(test.db, { ...input, logo: Buffer.from("logo"), storage }, now),
  ).rejects.toThrow();
  expect(await snapshot()).toEqual(before);
  expect(storage.put).toHaveBeenCalledTimes(1);
  expect(storage.delete).toHaveBeenCalledWith(vi.mocked(storage.put).mock.calls[0]?.[0]);
  expect(objects.size).toBe(0);
});

it("un fallo al subir el logo deja la base intacta", async () => {
  await seedLegacyRows();
  const before = await snapshot();
  const { storage } = fakeStorage(async () => {
    throw new Error("Falla de almacenamiento");
  });
  await expect(
    backfillFirstShop(test.db, { ...input, logo: Buffer.from("logo"), storage }, now),
  ).rejects.toThrow("Falla de almacenamiento");
  expect(await snapshot()).toEqual(before);
});
