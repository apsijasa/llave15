import type { AppDb } from "../../src/server/db/client.ts";
import { shops } from "../../src/server/db/schema-shops.ts";
import { branches } from "../../src/server/db/schema.ts";

export { VECTOR_BIKES_PROFILE } from "../../scripts/vector-bikes-profile.ts";

const weekdays = { open: "10:00", close: "13:00" };
const demoHours = {
  "1": weekdays,
  "2": weekdays,
  "3": weekdays,
  "4": weekdays,
  "5": weekdays,
  "6": null,
  "7": null,
};

export const DEMO_SHOP_PROFILE = {
  slug: "taller-demo",
  name: "Taller Demo",
  legalName: null,
  rut: null,
  email: "hola@tallerdemo.cl",
  notifyEmail: "avisos@tallerdemo.cl",
  phone: "+56911112222",
  phoneDisplay: "+56 9 1111 2222",
  streetAddress: "Avenida Irarrázaval 1000",
  addressShort: "Av. Irarrázaval 1000, Ñuñoa",
  locality: "Ñuñoa",
  region: "Región Metropolitana",
  mapsUrl: null,
  instagramUrl: "https://instagram.com/tallerdemo",
  certifications: [],
  timezone: "America/Santiago",
  receptionHours: demoHours,
  pickupHours: demoHours,
  dailyCapacity: 2,
  blockMinutes: 60,
  minNoticeMinutes: 60,
  horizonDays: 14,
  pickupEnabled: true,
  pickupFeeClp: 9000,
  pickupComunas: ["Ñuñoa", "Providencia"],
  codePrefix: "TD",
  status: "activo",
} as const;

type ShopSeed = Omit<typeof shops.$inferInsert, "certifications" | "pickupComunas"> & {
  certifications: readonly string[];
  pickupComunas: readonly string[];
};

export async function seedShop(db: AppDb, profile: ShopSeed) {
  const [shop] = await db
    .insert(shops)
    .values({
      ...profile,
      certifications: [...profile.certifications],
      pickupComunas: [...profile.pickupComunas],
    })
    .returning();
  if (!shop) throw new Error("No se pudo sembrar el taller de prueba");
  return shop;
}

export async function insertBranchForShop(db: AppDb, shopId: string, name: string) {
  const [branch] = await db.insert(branches).values({ shopId, name }).returning();
  if (!branch) throw new Error("No se pudo sembrar la sucursal de prueba");
  return branch;
}
