import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { check, date, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { workOrderItems, workOrders } from "./schema-orders.ts";
import { sales } from "./schema-sales.ts";
import { bikes } from "./schema-taller.ts";
import { branches, createdAt, instant, updatedAt, users } from "./schema.ts";

function branchReference() {
  return uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "restrict" });
}

function creatorReference() {
  return uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" });
}

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: branchReference(),
    workOrderId: uuid("work_order_id").references(() => workOrders.id, { onDelete: "restrict" }),
    saleId: uuid("sale_id").references(() => sales.id, { onDelete: "restrict" }),
    kind: text("kind").$type<"abono" | "final">().notNull(),
    method: text("method")
      .$type<"transferencia" | "tarjeta" | "efectivo" | "otro" | "mercadopago">()
      .notNull(),
    amountClp: integer("amount_clp").notNull(),
    externalId: text("external_id"),
    feeClp: integer("fee_clp").notNull().default(0),
    netClp: integer("net_clp"),
    receivedBy: uuid("received_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    receivedAt: instant("received_at").notNull(),
    voidedAt: instant("voided_at"),
    voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_payments_one_abono")
      .on(t.workOrderId)
      .where(sql`kind = 'abono' and voided_at is null`),
    index("idx_payments_branch_received").on(t.branchId, t.receivedAt),
    index("idx_payments_sale").on(t.saleId),
    check("payments_kind_check", sql`kind in ('abono', 'final')`),
    check(
      "payments_method_check",
      sql`method in ('transferencia', 'tarjeta', 'efectivo', 'otro', 'mercadopago')`,
    ),
    check("payments_amount_check", sql`amount_clp > 0`),
    check("payments_target_check", sql`num_nonnulls(work_order_id, sale_id) = 1`),
    check("payments_fee_check", sql`fee_clp >= 0 and fee_clp <= amount_clp`),
    check("payments_net_check", sql`net_clp is null or net_clp = amount_clp - fee_clp`),
    check("payments_mercadopago_check", sql`method <> 'mercadopago' or external_id is not null`),
  ],
);

export const bikeComponents = pgTable(
  "bike_components",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: branchReference(),
    bikeId: uuid("bike_id")
      .notNull()
      .references(() => bikes.id, { onDelete: "restrict" }),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "restrict" }),
    workOrderItemId: uuid("work_order_item_id").references(() => workOrderItems.id, {
      onDelete: "restrict",
    }),
    componentType: text("component_type").notNull(),
    brand: text("brand").notNull(),
    model: text("model").notNull(),
    serialNumber: text("serial_number"),
    installedAt: date("installed_at", { mode: "string" }).notNull(),
    priceClp: integer("price_clp").notNull().default(0),
    replacedAt: date("replaced_at", { mode: "string" }),
    replacedByComponentId: uuid("replaced_by_component_id").references(
      (): AnyPgColumn => bikeComponents.id,
      { onDelete: "restrict" },
    ),
    voidedAt: instant("voided_at"),
    voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "restrict" }),
    createdBy: creatorReference(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_bike_components_bike_installed").on(t.bikeId, t.installedAt),
    index("idx_bike_components_order").on(t.workOrderId),
    check("bike_components_price_check", sql`price_clp >= 0`),
    check(
      "bike_components_replaced_date_check",
      sql`replaced_at is null or replaced_at >= installed_at`,
    ),
  ],
);

export const paymentTables = [payments, bikeComponents] as const;
