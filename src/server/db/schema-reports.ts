import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
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
    nextMaintenanceDate: date("next_maintenance_date"),
    nextMaintenanceNote: text("next_maintenance_note"),
    maintenanceReminderSentAt: instant("maintenance_reminder_sent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_service_reports_order").on(t.workOrderId),
    uniqueIndex("uq_service_reports_share_token_hash").on(t.shareTokenHash),
    index("idx_service_reports_maintenance").on(t.nextMaintenanceDate, t.maintenanceReminderSentAt),
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

export const orderWhatsappNotices = pgTable(
  "order_whatsapp_notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "restrict" }),
    type: text("type").notNull(),
    status: text("status").notNull().default("pending"),
    metaMessageId: text("meta_message_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    claimedAt: instant("claimed_at"),
    sentAt: instant("sent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_order_whatsapp_notices_order_type").on(t.workOrderId, t.type),
    check("order_whatsapp_notices_type_check", sql`type in ('ready')`),
    check(
      "order_whatsapp_notices_status_check",
      sql`status in ('pending','sending','sent','failed','unknown')`,
    ),
  ],
);

export const reportTables = [serviceReports, orderTrackingTokens, orderWhatsappNotices] as const;
