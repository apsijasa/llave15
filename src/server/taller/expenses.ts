import { and, desc, eq, gte, lte } from "drizzle-orm";
import { DateTime } from "luxon";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { expenses } from "../db/schema-cash.ts";
import { suppliers } from "../db/schema-inventory.ts";
import { recordAudit } from "./audit.ts";
import type { AuditAction } from "./audit.ts";
import { recordCashMovement, requireOpenCashSession, voidCashMovementFor } from "./cash.ts";
import { EXPENSE_CATEGORIES, EXPENSE_METHODS, TAX_DOC_TYPES } from "./rules.ts";

export const expenseFormSchema = z.strictObject({
  category: z.enum(EXPENSE_CATEGORIES),
  amountClp: z.number().int().min(1).max(100_000_000),
  expenseDate: z.iso.date(),
  description: z.string().trim().min(2).max(200),
  supplierId: z.uuid().optional(),
  method: z.enum(EXPENSE_METHODS),
  docType: z.enum(TAX_DOC_TYPES).optional(),
  docNumber: z.string().trim().min(1).max(30).optional(),
});
const voidSchema = z.strictObject({ reason: z.string().trim().min(3).max(200) });
const rangeSchema = z
  .strictObject({ from: z.iso.date(), to: z.iso.date() })
  .refine(
    ({ from, to }) =>
      from <= to &&
      DateTime.fromISO(to, { zone: "UTC" }).diff(DateTime.fromISO(from, { zone: "UTC" }), "days")
        .days <= 366,
  );
type ExpenseCode = "cash_session_closed" | "forbidden" | "validation_error" | "not_found";

/** Error centinela: el movimiento de caja falló después de escribir el gasto. */
class ExpenseFailure extends Error {
  code: ExpenseCode;
  constructor(code: ExpenseCode) {
    super(code);
    this.code = code;
  }
}

async function auditExpense(
  tx: AppDb,
  actor: SessionUser,
  action: AuditAction,
  expenseId: string,
  details: Record<string, unknown>,
  now: Date,
) {
  const entry = { branchId: actor.branchId, actorUserId: actor.id, entity: "expense" };
  await recordAudit(tx, { ...entry, entityId: expenseId, action, details }, now);
}

async function supplierExists(tx: AppDb, actor: SessionUser, supplierId: string | undefined) {
  if (!supplierId) return true;
  const [supplier] = await tx
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.branchId, actor.branchId), eq(suppliers.id, supplierId)));
  return Boolean(supplier);
}

async function cashEgress(
  tx: AppDb,
  actor: SessionUser,
  sessionId: string,
  expense: { id: string; amountClp: number },
  now: Date,
) {
  const movement = await recordCashMovement(
    tx,
    actor,
    {
      sessionId,
      kind: "egreso",
      amountClp: expense.amountClp,
      referenceKind: "expense",
      referenceId: expense.id,
    },
    now,
  );
  if (!movement.ok) throw new ExpenseFailure(movement.code);
}

export async function recordExpense(db: AppDb, actor: SessionUser, input: unknown, now: Date) {
  if (!can(actor.role, "expenses.record")) return { ok: false, code: "forbidden" } as const;
  const parsed = expenseFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "validation_error" } as const;
  try {
    return await db.transaction(async (tx) => {
      if (!(await supplierExists(tx, actor, parsed.data.supplierId)))
        return { ok: false, code: "not_found" } as const;
      const cash =
        parsed.data.method === "efectivo" ? await requireOpenCashSession(tx, actor.branchId) : null;
      if (cash?.mode === "closed") return { ok: false, code: "cash_closed" } as const;
      const cashSessionId = cash?.mode === "open" ? cash.sessionId : null;
      const [expense] = await tx
        .insert(expenses)
        .values({
          ...parsed.data,
          branchId: actor.branchId,
          cashSessionId,
          createdBy: actor.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: expenses.id, amountClp: expenses.amountClp });
      if (!expense) throw new Error("No se pudo registrar el gasto.");
      if (cashSessionId) await cashEgress(tx, actor, cashSessionId, expense, now);
      const { category, amountClp, method, expenseDate } = parsed.data;
      const details = { category, amountClp, method, expenseDate };
      await auditExpense(tx, actor, "expense.recorded", expense.id, details, now);
      return { ok: true, expenseId: expense.id } as const;
    });
  } catch (error) {
    if (error instanceof ExpenseFailure) return { ok: false, code: error.code } as const;
    throw error;
  }
}

export async function voidExpense(
  db: AppDb,
  actor: SessionUser,
  expenseId: string,
  input: unknown,
  now: Date,
) {
  if (!can(actor.role, "expenses.record")) return { ok: false, code: "forbidden" } as const;
  const parsed = voidSchema.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(expenseId).success)
    return { ok: false, code: "validation_error" } as const;
  return db.transaction(async (tx) => {
    const [expense] = await tx
      .select()
      .from(expenses)
      .where(and(eq(expenses.branchId, actor.branchId), eq(expenses.id, expenseId)))
      .for("update");
    if (!expense || expense.voidedAt) return { ok: false, code: "not_found" } as const;
    if (expense.cashSessionId) {
      const cash = await voidCashMovementFor(tx, actor, "expense", expense.id, now);
      if (!cash.ok) return cash;
    }
    const { reason } = parsed.data;
    await tx
      .update(expenses)
      .set({ voidedAt: now, voidedBy: actor.id, voidReason: reason, updatedAt: now })
      .where(and(eq(expenses.branchId, actor.branchId), eq(expenses.id, expense.id)));
    const details = { amountClp: expense.amountClp, reason };
    await auditExpense(tx, actor, "expense.voided", expense.id, details, now);
    return { ok: true } as const;
  });
}

export async function listExpenses(
  db: AppDb,
  actor: SessionUser,
  range: { from: string; to: string },
) {
  if (!can(actor.role, "expenses.record")) return [];
  const parsed = rangeSchema.safeParse(range);
  if (!parsed.success) return [];
  return db
    .select({ expense: expenses, supplierName: suppliers.name })
    .from(expenses)
    .leftJoin(
      suppliers,
      and(eq(suppliers.id, expenses.supplierId), eq(suppliers.branchId, actor.branchId)),
    )
    .where(
      and(
        eq(expenses.branchId, actor.branchId),
        gte(expenses.expenseDate, parsed.data.from),
        lte(expenses.expenseDate, parsed.data.to),
      ),
    )
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
    .then((rows) => rows.map(({ expense, supplierName }) => ({ ...expense, supplierName })));
}
