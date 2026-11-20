import { VECTOR_BIKES_PROFILE } from "../../scripts/vector-bikes-profile.ts";
import { PLATFORM } from "../../src/lib/platform.ts";
import { bookingConfigFromShop } from "../../src/server/booking/config.ts";
import type { BookingConfig } from "../../src/server/booking/config.ts";
import type { GarageBrand } from "../../src/server/email/garage/templates.ts";
import type { EmailBrand } from "../../src/server/email/brand.ts";
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

/** Datos del taller. Única fuente de verdad para direcciones, contacto y enlaces. */
export const SITE = {
  name: "Vector Bikes",
  url: "https://vectorbikes.cl",
  logoPath: "/brand/vector-bikes-logo.png",
  certifications: [] as const as readonly string[],
  streetAddress: "Avenida Kennedy 7666",
  addressShort: "Av. Kennedy 7666, Vitacura",
  locality: "Vitacura",
  region: "Región Metropolitana",
  country: "CL",
  email: "info@vectorbikes.cl",
  phone: "+56985095780",
  phoneDisplay: "+56 9 8509 5780",
  instagramUrl: "https://instagram.com/vector.bikes",
  instagramHandle: "@vector.bikes",
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Avenida+Kennedy+7666+Vitacura",
} as const;

/** La marca de reserva del primer taller, con los valores de su siembra. */
export function vectorBikesBrand(): EmailBrand {
  return {
    shopName: VECTOR_BIKES_PROFILE.name,
    replyTo: VECTOR_BIKES_PROFILE.email,
    notifyEmail: VECTOR_BIKES_PROFILE.notifyEmail,
    phoneDisplay: VECTOR_BIKES_PROFILE.phoneDisplay,
    addressShort: VECTOR_BIKES_PROFILE.addressShort,
    logoPath: `/${VECTOR_BIKES_PROFILE.slug}/logo`,
    footerLine: PLATFORM.footerLine,
  };
}

export function vectorBikesGarageBrand(): GarageBrand {
  return {
    ...vectorBikesBrand(),
    streetAddress: VECTOR_BIKES_PROFILE.streetAddress,
    locality: VECTOR_BIKES_PROFILE.locality,
    receptionHours: VECTOR_BIKES_PROFILE.receptionHours,
    certifications: VECTOR_BIKES_PROFILE.certifications,
  };
}

/** La configuración de reserva del primer taller, con los valores de su siembra (BG-28). */
export const VECTOR_BIKES_BOOKING_CONFIG: BookingConfig = bookingConfigFromShop({
  ...VECTOR_BIKES_PROFILE,
  pickupComunas: [...VECTOR_BIKES_PROFILE.pickupComunas],
});
