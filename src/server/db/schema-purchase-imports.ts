import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { purchaseOrders } from "./schema-inventory.ts";
import { branches, createdAt, instant, updatedAt, users } from "./schema.ts";

export const purchaseImports = pgTable(
  "purchase_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("extraida"),
    fileKey: text("file_key"),
    fileType: text("file_type").notNull(),
    fileBytes: integer("file_bytes").notNull(),
    pages: integer("pages"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    extraction: jsonb("extraction")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    warnings: jsonb("warnings").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    errorCode: text("error_code"),
    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id, {
      onDelete: "restrict",
    }),
    confirmedAt: instant("confirmed_at"),
    confirmedBy: uuid("confirmed_by").references(() => users.id, { onDelete: "restrict" }),
    discardedAt: instant("discarded_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_purchase_imports_branch_created").on(t.branchId, t.createdAt),
    uniqueIndex("uq_purchase_imports_purchase_order")
      .on(t.purchaseOrderId)
      .where(sql`purchase_order_id is not null`),
    check(
      "purchase_imports_status_check",
      sql`status in ('extraida', 'confirmada', 'descartada', 'fallida')`,
    ),
    check("purchase_imports_file_type_check", sql`file_type in ('pdf', 'jpg')`),
    check("purchase_imports_file_check", sql`(file_key is null) = (status = 'fallida')`),
    check("purchase_imports_error_check", sql`status <> 'fallida' or error_code is not null`),
    check(
      "purchase_imports_confirmed_check",
      sql`(status = 'confirmada') = (purchase_order_id is not null and confirmed_at is not null and confirmed_by is not null)`,
    ),
    check(
      "purchase_imports_discarded_check",
      sql`(status = 'descartada') = (discarded_at is not null)`,
    ),
    check(
      "purchase_imports_numbers_check",
      sql`file_bytes >= 0 and tokens_in >= 0 and tokens_out >= 0 and (pages is null or pages between 1 and 5)`,
    ),
  ],
);
export const purchaseImportTables = [purchaseImports] as const;
