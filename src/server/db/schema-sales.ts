import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { cashSessions } from "./schema-cash.ts";
import { products } from "./schema-inventory.ts";
import { customers } from "./schema-taller.ts";
import { branches, createdAt, instant, updatedAt, users } from "./schema.ts";

function branchReference() {
  return uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "restrict" });
}

export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: branchReference(),
    number: integer("number").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "restrict" }),
    cashSessionId: uuid("cash_session_id").references(() => cashSessions.id, {
      onDelete: "restrict",
    }),
    status: text("status").$type<"abierta" | "pagada" | "anulada">().notNull().default("abierta"),
    subtotalClp: integer("subtotal_clp").notNull(),
    discountClp: integer("discount_clp").notNull().default(0),
    discountReason: text("discount_reason"),
    vatClp: integer("vat_clp").notNull(),
    totalClp: integer("total_clp").notNull(),
    paidClp: integer("paid_clp").notNull().default(0),
    docType: text("doc_type").$type<"boleta" | "factura">(),
    docNumber: text("doc_number"),
    voidReason: text("void_reason"),
    voidedAt: instant("voided_at"),
    voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_sales_branch_number").on(t.branchId, t.number),
    index("idx_sales_branch_created").on(t.branchId, t.createdAt),
    index("idx_sales_customer").on(t.customerId),
    index("idx_sales_cash_session").on(t.cashSessionId),
    check("sales_number_check", sql`number >= 1`),
    check("sales_status_check", sql`status in ('abierta', 'pagada', 'anulada')`),
    check(
      "sales_amounts_check",
      sql`subtotal_clp >= 0 and discount_clp >= 0 and vat_clp >= 0 and total_clp >= 0 and paid_clp >= 0`,
    ),
    check("sales_total_check", sql`total_clp = subtotal_clp + vat_clp`),
    check("sales_paid_check", sql`status <> 'pagada' or paid_clp = total_clp`),
    check("sales_discount_check", sql`discount_clp = 0 or discount_reason is not null`),
    check("sales_doc_type_check", sql`doc_type is null or doc_type in ('boleta', 'factura')`),
    check("sales_voided_check", sql`(status = 'anulada') = (voided_at is not null)`),
  ],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: branchReference(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceClp: integer("unit_price_clp").notNull(),
    unitCostClp: integer("unit_cost_clp").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_sale_items_sale").on(t.saleId),
    check("sale_items_quantity_check", sql`quantity > 0`),
    check("sale_items_amounts_check", sql`unit_price_clp >= 0 and unit_cost_clp >= 0`),
  ],
);

export const saleTables = [sales, saleItems] as const;
