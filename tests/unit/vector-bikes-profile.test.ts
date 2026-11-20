import { describe, expect, it } from "vitest";
import { VECTOR_BIKES_PROFILE } from "../../scripts/vector-bikes-profile.ts";
import { VECTOR_BIKES_SITE } from "../../web/vector-bikes/src/content/site.ts";
import { shops } from "../../src/server/db/schema-shops.ts";
import { branches } from "../../src/server/db/schema.ts";
import { createBookingTestDb, createTestDb } from "../helpers/pglite.ts";
import { DEMO_SHOP_PROFILE, insertBranchForShop, seedShop } from "../helpers/shops.ts";

describe("perfil de Vector Bikes", () => {
  it("conserva los datos de contacto, direcciones y enlaces del sitio", () => {
    expect(VECTOR_BIKES_PROFILE).toMatchObject({
      name: VECTOR_BIKES_SITE.name,
      email: VECTOR_BIKES_SITE.email,
      notifyEmail: VECTOR_BIKES_SITE.email,
      phone: VECTOR_BIKES_SITE.phone,
      phoneDisplay: VECTOR_BIKES_SITE.phoneDisplay,
      streetAddress: VECTOR_BIKES_SITE.streetAddress,
      addressShort: VECTOR_BIKES_SITE.addressShort,
      locality: VECTOR_BIKES_SITE.locality,
      region: VECTOR_BIKES_SITE.region,
      mapsUrl: VECTOR_BIKES_SITE.mapsUrl,
      instagramUrl: VECTOR_BIKES_SITE.instagramUrl,
      certifications: VECTOR_BIKES_SITE.certifications,
      codePrefix: VECTOR_BIKES_SITE.islandShop.codePrefix,
    });
  });

  it("conserva los horarios, la capacidad y las reglas de reserva y retiro", () => {
    expect(VECTOR_BIKES_PROFILE).toMatchObject({
      timezone: "America/Santiago",
      receptionHours: {
        "1": { open: "15:00", close: "20:00" },
        "2": { open: "15:00", close: "20:00" },
        "3": { open: "15:00", close: "20:00" },
        "4": { open: "15:00", close: "20:00" },
        "5": { open: "15:00", close: "20:00" },
        "6": { open: "10:00", close: "14:00" },
        "7": null,
      },
      pickupHours: {
        "1": { open: "09:00", close: "20:00" },
        "2": { open: "09:00", close: "20:00" },
        "3": { open: "09:00", close: "20:00" },
        "4": { open: "09:00", close: "20:00" },
        "5": { open: "09:00", close: "20:00" },
        "6": { open: "10:00", close: "14:00" },
        "7": null,
      },
      dailyCapacity: 4,
      blockMinutes: VECTOR_BIKES_SITE.islandShop.blockMinutes,
      minNoticeMinutes: 120,
      horizonDays: 30,
      pickupEnabled: VECTOR_BIKES_SITE.islandShop.pickupEnabled,
      pickupFeeClp: VECTOR_BIKES_SITE.islandShop.pickupFeeClp,
      pickupComunas: VECTOR_BIKES_SITE.islandShop.pickupComunas,
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
