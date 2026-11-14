import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { suppliers } from "./schema-inventory.ts";
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

export const cashSessions = pgTable(
  "cash_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: branchReference(),
    openedAt: instant("opened_at").notNull(),
    openedBy: uuid("opened_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    openingCashClp: integer("opening_cash_clp").notNull(),
    closedAt: instant("closed_at"),
    closedBy: uuid("closed_by").references(() => users.id, { onDelete: "restrict" }),
    countedCashClp: integer("counted_cash_clp"),
    expectedCashClp: integer("expected_cash_clp"),
    differenceClp: integer("difference_clp"),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_cash_sessions_open").on(t.branchId).where(sql`closed_at is null`),
    index("idx_cash_sessions_branch_opened").on(t.branchId, t.openedAt),
    check("cash_sessions_opening_cash_check", sql`opening_cash_clp >= 0`),
    check(
      "cash_sessions_counted_cash_check",
      sql`counted_cash_clp is null or counted_cash_clp >= 0`,
    ),
    check(
      "cash_sessions_closing_check",
      sql`(closed_at is null and closed_by is null and counted_cash_clp is null and expected_cash_clp is null and difference_clp is null)
        or (closed_at is not null and closed_by is not null and counted_cash_clp is not null and expected_cash_clp is not null and difference_clp is not null and difference_clp = counted_cash_clp - expected_cash_clp)`,
    ),
  ],
);

export const cashMovements = pgTable(
  "cash_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: branchReference(),
    cashSessionId: uuid("cash_session_id")
      .notNull()
      .references(() => cashSessions.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    amountClp: integer("amount_clp").notNull(),
    referenceKind: text("reference_kind").notNull(),
    referenceId: uuid("reference_id").notNull(),
    note: text("note"),
    voidedAt: instant("voided_at"),
    voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "restrict" }),
    createdBy: creatorReference(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_cash_movements_session_created").on(t.cashSessionId, t.createdAt),
    index("idx_cash_movements_reference").on(t.referenceKind, t.referenceId),
    check("cash_movements_kind_check", sql`kind in ('ingreso', 'egreso')`),
    check("cash_movements_amount_check", sql`amount_clp > 0`),
    check(
      "cash_movements_reference_kind_check",
      sql`reference_kind in ('payment', 'expense', 'sale_refund', 'order_refund')`,
    ),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: branchReference(),
    category: text("category").notNull(),
    amountClp: integer("amount_clp").notNull(),
    expenseDate: date("expense_date", { mode: "string" }).notNull(),
    description: text("description").notNull(),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "restrict" }),
    method: text("method").notNull(),
    docType: text("doc_type"),
    docNumber: text("doc_number"),
    cashSessionId: uuid("cash_session_id").references(() => cashSessions.id, {
      onDelete: "restrict",
    }),
    voidReason: text("void_reason"),
    voidedAt: instant("voided_at"),
    voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "restrict" }),
    createdBy: creatorReference(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_expenses_branch_date").on(t.branchId, t.expenseDate),
    check(
      "expenses_category_check",
      sql`category in ('arriendo', 'sueldos', 'servicios', 'insumos', 'repuestos', 'otros')`,
    ),
    check("expenses_amount_check", sql`amount_clp > 0`),
    check("expenses_method_check", sql`method in ('efectivo', 'transferencia', 'tarjeta', 'otro')`),
    check("expenses_doc_type_check", sql`doc_type is null or doc_type in ('boleta', 'factura')`),
  ],
);

export const cashTables = [cashSessions, cashMovements, expenses] as const;
