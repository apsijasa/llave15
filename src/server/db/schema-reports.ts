import { jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { workOrders } from "./schema-orders.ts";
import { branches, createdAt, instant, updatedAt, users } from "./schema.ts";

export const serviceReports = pgTable(
  "service_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "restrict" }),
    generatedAt: instant("generated_at").notNull(),
    generatedBy: uuid("generated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    snapshot: jsonb("snapshot").notNull(),
    shareTokenHash: text("share_token_hash").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_service_reports_order").on(t.workOrderId),
    uniqueIndex("uq_service_reports_share_token_hash").on(t.shareTokenHash),
  ],
);

export const orderTrackingTokens = pgTable(
  "order_tracking_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_order_tracking_tokens_order").on(t.workOrderId),
    uniqueIndex("uq_order_tracking_tokens_hash").on(t.tokenHash),
  ],
);

export const reportTables = [serviceReports, orderTrackingTokens] as const;
