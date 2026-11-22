import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, instant, updatedAt } from "./schema.ts";

/**
 * Datos de la plataforma, no de un taller (BG-D51): por eso no llevan `branch_id`.
 * Solo los lee `/plataforma`, con la marca `is_platform_admin`.
 */
export const demoRequests = pgTable(
  "demo_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    shopName: text("shop_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    city: text("city").notNull(),
    mechanics: text("mechanics"),
    message: text("message"),
    consentAt: instant("consent_at").notNull(),
    ipHash: text("ip_hash"),
    status: text("status").notNull().default("nueva"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_demo_requests_ip_created").on(t.ipHash, t.createdAt),
    index("idx_demo_requests_created").on(t.createdAt),
    check("demo_requests_status_check", sql`status in ('nueva', 'contactada', 'descartada')`),
    check(
      "demo_requests_mechanics_check",
      sql`mechanics is null or mechanics in ('1', '2-3', '4+')`,
    ),
  ],
);

export const platformTables = [demoRequests] as const;
