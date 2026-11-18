import { describe, expect, it } from "vitest";
import { VECTOR_BIKES_PROFILE } from "../../scripts/vector-bikes-profile.ts";
import { SITE } from "../../src/lib/site.ts";
import {
  BLOCK_MINUTES,
  DAILY_CAPACITY,
  HORIZON_DAYS,
  MIN_NOTICE_MINUTES,
  PICKUP_COMUNAS,
  PICKUP_FEE_CLP,
  PICKUP_HOURS,
  RECEPTION_HOURS,
  TIMEZONE,
} from "../../src/server/booking/rules.ts";
import { shops } from "../../src/server/db/schema-shops.ts";
import { branches } from "../../src/server/db/schema.ts";
import { createBookingTestDb, createTestDb } from "../helpers/pglite.ts";
import { DEMO_SHOP_PROFILE, insertBranchForShop, seedShop } from "../helpers/shops.ts";

describe("perfil de Vector Bikes", () => {
  it("conserva los datos de contacto, direcciones y enlaces del sitio", () => {
    expect(VECTOR_BIKES_PROFILE).toMatchObject({
      name: SITE.name,
      email: SITE.email,
      notifyEmail: SITE.email,
      phone: SITE.phone,
      phoneDisplay: SITE.phoneDisplay,
      streetAddress: SITE.streetAddress,
      addressShort: SITE.addressShort,
      locality: SITE.locality,
      region: SITE.region,
      mapsUrl: SITE.mapsUrl,
      instagramUrl: SITE.instagramUrl,
      certifications: SITE.certifications,
      codePrefix: "VB",
    });
  });

  it("conserva los horarios, la capacidad y las reglas de reserva y retiro", () => {
    expect(VECTOR_BIKES_PROFILE).toMatchObject({
      timezone: TIMEZONE,
      receptionHours: RECEPTION_HOURS,
      pickupHours: PICKUP_HOURS,
      dailyCapacity: DAILY_CAPACITY,
      blockMinutes: BLOCK_MINUTES,
      minNoticeMinutes: MIN_NOTICE_MINUTES,
      horizonDays: HORIZON_DAYS,
      pickupEnabled: true,
      pickupFeeClp: PICKUP_FEE_CLP,
      pickupComunas: PICKUP_COMUNAS,
    });
  });
});

describe("siembra de talleres", () => {
  it("crea exactamente Vector Bikes con su perfil y ninguna sucursal", async () => {
    const test = await createTestDb();
    try {
      const rows = await test.db.select().from(shops);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject(VECTOR_BIKES_PROFILE);
      expect(await test.db.select().from(branches)).toEqual([]);
    } finally {
      await test.close();
    }
  });

  it("crea una sola sucursal Vitacura enlazada a Vector Bikes para reservas", async () => {
    const test = await createBookingTestDb();
    try {
      const rows = await test.db.select().from(shops);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject(VECTOR_BIKES_PROFILE);
      const branchRows = await test.db.select().from(branches);
      expect(branchRows).toHaveLength(1);
      expect(branchRows[0]).toMatchObject({ name: "Vitacura", shopId: rows[0]?.id });
    } finally {
      await test.close();
    }
  });

  it("siembra el Taller Demo y enlaza explícitamente su sucursal con dos talleres", async () => {
    const test = await createTestDb();
    try {
      const demo = await seedShop(test.db, DEMO_SHOP_PROFILE);
      const branch = await insertBranchForShop(test.db, demo.id, "Ñuñoa");
      expect(demo).toMatchObject(DEMO_SHOP_PROFILE);
      expect(await test.db.select().from(shops)).toHaveLength(2);
      expect(branch).toMatchObject({ name: "Ñuñoa", shopId: demo.id });
      expect(await test.db.select().from(branches)).toEqual([branch]);
    } finally {
      await test.close();
    }
  });
});
