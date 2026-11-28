import { sql } from "drizzle-orm";
import { check, integer, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { branches, users, createdAt, updatedAt } from "./schema.ts";

/** Perfil de costos mensuales del taller (FX-08, BG-D57): una fila por sucursal. */
export const costProfiles = pgTable(
  "cost_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    rentClp: integer("rent_clp").notNull().default(0),
    utilitiesClp: integer("utilities_clp").notNull().default(0),
    wagesClp: integer("wages_clp").notNull().default(0),
    taxesClp: integer("taxes_clp").notNull().default(0),
    otherClp: integer("other_clp").notNull().default(0),
    suppliesClp: integer("supplies_clp").notNull().default(0),
    billableHoursMonth: integer("billable_hours_month").notNull().default(0),
    targetMarginPct: integer("target_margin_pct").notNull().default(30),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_cost_profiles_branch").on(t.branchId),
    check(
      "cost_profiles_amounts_check",
      sql`rent_clp >= 0 and utilities_clp >= 0 and wages_clp >= 0 and taxes_clp >= 0 and other_clp >= 0 and supplies_clp >= 0`,
    ),
    check("cost_profiles_hours_check", sql`billable_hours_month between 0 and 744`),
    check("cost_profiles_margin_check", sql`target_margin_pct between 0 and 90`),
  ],
);
export const costingTables = [costProfiles] as const;
