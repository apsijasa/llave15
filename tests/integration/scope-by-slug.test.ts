import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "../../src/server/db/client.ts";
import { shops as shopsTable } from "../../src/server/db/schema-shops.ts";
import { scopeBySlug } from "../../src/server/shops/scope.ts";
import { createTestDb } from "../helpers/pglite.ts";
import { DEMO_SHOP_PROFILE, insertBranchForShop, seedShop } from "../helpers/shops.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

let db: AppDb;
let close: () => Promise<void>;
let shops: Awaited<ReturnType<typeof seedTwoShops>>;

describe("alcance de reservas por slug con dos talleres", () => {
  beforeEach(async () => {
    const test = await createTestDb();
    db = test.db;
    close = test.close;
    shops = await seedTwoShops(db);
  });

  afterEach(async () => {
    await close();
  });

  it("resuelve el Taller Demo con su sucursal y su configuración, sin cruzar talleres", async () => {
    expect(await scopeBySlug(db, "taller-demo")).toEqual({
      shopId: shops.demo.shop.id,
      slug: "taller-demo",
      branchId: shops.demo.branch.id,
      config: {
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
      },
    });
    expect(await scopeBySlug(db, shops.vector.shop.slug)).toEqual(shops.vector.scope);
  });

  it("devuelve null para un taller desconocido", async () => {
    expect(await scopeBySlug(db, "no-existe")).toBeNull();
  });

  it("devuelve null para un slug reservado aunque exista un taller con ese slug", async () => {
    await db
      .update(shopsTable)
      .set({ slug: "taller" })
      .where(eq(shopsTable.id, shops.demo.shop.id));
    expect(await scopeBySlug(db, "taller")).toBeNull();
    expect(await scopeBySlug(db, "_astro")).toBeNull();
  });

  it("devuelve null sin lanzar para un slug inválido", async () => {
    for (const slug of ["Taller Demo", "ab", "-demo", "a".repeat(41)]) {
      expect(await scopeBySlug(db, slug)).toBeNull();
    }
  });

  it("devuelve null para un taller suspendido y conserva el alcance del otro", async () => {
    await db
      .update(shopsTable)
      .set({ status: "suspendido" })
      .where(eq(shopsTable.id, shops.demo.shop.id));
    expect(await scopeBySlug(db, "taller-demo")).toBeNull();
    expect(await scopeBySlug(db, shops.vector.shop.slug)).toEqual(shops.vector.scope);
  });

  it("devuelve null si el taller no tiene sucursal", async () => {
    await seedShop(db, { ...DEMO_SHOP_PROFILE, slug: "sin-sucursal", codePrefix: "SS" });
    expect(await scopeBySlug(db, "sin-sucursal")).toBeNull();
  });

  it("devuelve null sin elegir una sucursal si el alcance es ambiguo", async () => {
    await insertBranchForShop(db, shops.demo.shop.id, "Otra sucursal de prueba");
    expect(await scopeBySlug(db, "taller-demo")).toBeNull();
  });
});
