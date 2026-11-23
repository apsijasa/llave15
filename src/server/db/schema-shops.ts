import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Cabeza de la cadena: no importa otros archivos de esquema (BG-D1).
const instant = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => instant("created_at").notNull().defaultNow();
const updatedAt = () =>
  instant("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export type WeekHours = Record<string, { open: string; close: string } | null>;

export const shops = pgTable(
  "shops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    rut: text("rut"),
    email: text("email").notNull(),
    notifyEmail: text("notify_email").notNull(),
    phone: text("phone").notNull(),
    phoneDisplay: text("phone_display").notNull(),
    streetAddress: text("street_address").notNull(),
    addressShort: text("address_short").notNull(),
    locality: text("locality").notNull(),
    region: text("region").notNull(),
    mapsUrl: text("maps_url"),
    instagramUrl: text("instagram_url"),
    websiteUrl: text("website_url"),
    logoKey: text("logo_key"),
    certifications: text("certifications").array().notNull().default(sql`'{}'::text[]`),
    timezone: text("timezone").notNull().default("America/Santiago"),
    receptionHours: jsonb("reception_hours").$type<WeekHours>().notNull(),
    pickupHours: jsonb("pickup_hours").$type<WeekHours>().notNull(),
    dailyCapacity: integer("daily_capacity").notNull(),
    blockMinutes: integer("block_minutes").notNull(),
    minNoticeMinutes: integer("min_notice_minutes").notNull(),
    horizonDays: integer("horizon_days").notNull(),
    pickupEnabled: boolean("pickup_enabled").notNull().default(false),
    pickupFeeClp: integer("pickup_fee_clp").notNull().default(0),
    pickupComunas: text("pickup_comunas").array().notNull().default(sql`'{}'::text[]`),
    codePrefix: text("code_prefix").notNull(),
    status: text("status").notNull().default("activo"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_shops_slug").on(t.slug),
    uniqueIndex("uq_shops_code_prefix").on(t.codePrefix),
    check("shops_status_check", sql`status in ('activo', 'suspendido')`),
    check(
      "shops_slug_check",
      sql`slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 40`,
    ),
    check("shops_capacity_check", sql`daily_capacity between 1 and 20`),
    check("shops_block_minutes_check", sql`block_minutes in (15, 20, 30, 45, 60)`),
    check("shops_notice_check", sql`min_notice_minutes between 0 and 10080`),
    check("shops_horizon_check", sql`horizon_days between 1 and 120`),
    check("shops_pickup_fee_check", sql`pickup_fee_clp >= 0`),
    check("shops_pickup_check", sql`not pickup_enabled or cardinality(pickup_comunas) > 0`),
    check("shops_code_prefix_check", sql`code_prefix ~ '^[A-Z]{2,4}$'`),
    check("shops_timezone_check", sql`timezone = 'America/Santiago'`),
  ],
);

export const shopTables = [shops] as const;

/** BG-D3: con exactamente un taller, una sucursal sin shopId se enlaza a él; con dos, queda null. */
export const onlyShopId = () =>
  sql`(select "id" from "shops" where (select count(*) from "shops") = 1)`;
