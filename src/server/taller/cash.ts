import { TIMEZONE } from "../../lib/time.ts";
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import { isUniqueViolation } from "../db/client.ts";
import type { AppDb } from "../db/client.ts";
import { cashMovements, cashSessions } from "../db/schema-cash.ts";
import { payments } from "../db/schema-payments.ts";
import { branches } from "../db/schema.ts";
import { recordAudit } from "./audit.ts";
import type { AuditAction } from "./audit.ts";
import { RECORDABLE_PAYMENT_METHODS } from "./rules.ts";

const failure = <T extends string>(code: T) => ({ ok: false, code }) as const;
const note = z.string().trim().max(1000).optional();
const cashAmount = z.number().int().min(0).max(10000000);
const openSchema = z.strictObject({ openingCashClp: cashAmount, note });
const closeSchema = z.strictObject({ countedCashClp: cashAmount, note });
const controlSchema = z.strictObject({ enabled: z.boolean() });
const referenceSchema = z.enum(["payment", "expense", "sale_refund", "order_refund"]);
const movementSchema = z.strictObject({
  sessionId: z.uuid(),
  kind: z.enum(["ingreso", "egreso"]),
  amountClp: z.number().int().positive().max(2147483647),
  referenceKind: referenceSchema,
  referenceId: z.uuid(),
  note,
});

function sessionScope(branchId: string) {
  return and(eq(cashSessions.branchId, branchId), isNull(cashSessions.closedAt));
}

async function openSession(db: AppDb, branchId: string, lock = false) {
  const query = db.select().from(cashSessions).where(sessionScope(branchId));
  const [session] = await (lock ? query.for("update") : query);
  return session;
}

async function auditCash(
  db: AppDb,
  actor: SessionUser,
  action: AuditAction,
  entityId: string,
  details: Record<string, unknown>,
  now: Date,
) {
  await recordAudit(
    db,
    {
      branchId: actor.branchId,
      actorUserId: actor.id,
      action,
      entity: action === "cash.control_changed" ? "branch" : "cash_session",
      entityId,
      details,
    },
    now,
  );
}

export async function setCashControl(db: AppDb, actor: SessionUser, input: unknown, now: Date) {
  if (!can(actor.role, "dashboard.finance")) return failure("forbidden");
  const parsed = controlSchema.safeParse(input);
  if (!parsed.success) return failure("validation_error");
  return db.transaction(async (tx) => {
    const [branch] = await tx
      .select()
      .from(branches)
      .where(eq(branches.id, actor.branchId))
      .for("no key update");
    if (!branch) return failure("not_found");
    const { enabled } = parsed.data;
    if (branch.cashControlEnabled === enabled) return { ok: true, changed: false } as const;
    if (!enabled && (await openSession(tx, actor.branchId, true)))
      return failure("cash_session_open");
    await tx
      .update(branches)
      .set({ cashControlEnabled: enabled, updatedAt: now })
      .where(eq(branches.id, actor.branchId));
    await auditCash(tx, actor, "cash.control_changed", actor.branchId, { enabled }, now);
    return { ok: true, changed: true } as const;
  });
}

function isOpenConflict(error: unknown): boolean {
  if (!isUniqueViolation(error)) return false;
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const detail = current as { constraint?: unknown; constraint_name?: unknown; cause?: unknown };
    if (
      detail.constraint === "uq_cash_sessions_open" ||
      detail.constraint_name === "uq_cash_sessions_open"
    )
      return true;
    current = detail.cause;
  }
  return false;
}

export async function openCashSession(db: AppDb, actor: SessionUser, input: unknown, now: Date) {
  if (!can(actor.role, "cash.open_close")) return failure("forbidden");
  const parsed = openSchema.safeParse(input);
  if (!parsed.success) return failure("validation_error");
  try {
    return await db.transaction(async (tx) => {
      const [branch] = await tx
        .select()
        .from(branches)
        .where(eq(branches.id, actor.branchId))
        .for("no key update");
      if (!branch) return failure("not_found");
      if (!branch.cashControlEnabled) return failure("cash_control_off");
      const [session] = await tx
        .insert(cashSessions)
        .values({
          ...parsed.data,
          branchId: actor.branchId,
          openedBy: actor.id,
          openedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: cashSessions.id });
      if (!session) throw new Error("No se pudo abrir la caja.");
      await auditCash(
        tx,
        actor,
        "cash.opened",
        session.id,
        { openingCashClp: parsed.data.openingCashClp },
        now,
      );
      return { ok: true, sessionId: session.id } as const;
    });
  } catch (error) {
    if (isOpenConflict(error)) return failure("cash_session_open");
    throw error;
  }
}

async function sessionMovements(db: AppDb, branchId: string, sessionId: string) {
  return db
    .select()
    .from(cashMovements)
    .where(and(eq(cashMovements.branchId, branchId), eq(cashMovements.cashSessionId, sessionId)))
    .orderBy(asc(cashMovements.createdAt), asc(cashMovements.id));
}

function sessionTotals(openingCashClp: number, movements: (typeof cashMovements.$inferSelect)[]) {
  let incomeClp = 0;
  let expenseClp = 0;
  for (const movement of movements) {
    if (movement.voidedAt !== null) continue;
    if (movement.kind === "ingreso") incomeClp += movement.amountClp;
    else expenseClp += movement.amountClp;
  }
  return { incomeClp, expenseClp, expectedCashClp: openingCashClp + incomeClp - expenseClp };
}

export async function closeCashSession(db: AppDb, actor: SessionUser, input: unknown, now: Date) {
  if (!can(actor.role, "cash.open_close")) return failure("forbidden");
  const parsed = closeSchema.safeParse(input);
  if (!parsed.success) return failure("validation_error");
  return db.transaction(async (tx) => {
    const session = await openSession(tx, actor.branchId, true);
    if (!session) return failure("not_found");
    const movements = await sessionMovements(tx, actor.branchId, session.id);
    const { expectedCashClp } = sessionTotals(session.openingCashClp, movements);
    const { countedCashClp } = parsed.data;
    const differenceClp = countedCashClp - expectedCashClp;
    const totals = { expectedCashClp, countedCashClp, differenceClp };
    await tx
      .update(cashSessions)
      .set({
        ...parsed.data,
        ...totals,
        closedAt: now,
        closedBy: actor.id,
        updatedAt: now,
      })
      .where(and(eq(cashSessions.branchId, actor.branchId), eq(cashSessions.id, session.id)));
    await auditCash(tx, actor, "cash.closed", session.id, totals, now);
    return { ok: true, sessionId: session.id, ...totals } as const;
  });
}

export async function currentCashSession(db: AppDb, actor: SessionUser) {
  if (!can(actor.role, "cash.open_close")) return failure("forbidden");
  const session = await openSession(db, actor.branchId);
  if (!session) return null;
  const movements = await sessionMovements(db, actor.branchId, session.id);
  return { ...session, movements, ...sessionTotals(session.openingCashClp, movements) };
}

export async function listCashSessions(db: AppDb, actor: SessionUser) {
  if (!can(actor.role, "cash.open_close")) return failure("forbidden");
  return db
    .select()
    .from(cashSessions)
    .where(eq(cashSessions.branchId, actor.branchId))
    .orderBy(desc(cashSessions.openedAt), desc(cashSessions.id))
    .limit(30);
}

/** Solo en la transacción del llamador, que ya comprobó el permiso de la operación. */
export async function requireOpenCashSession(tx: AppDb, branchId: string) {
  const [branch] = await tx
    .select({ enabled: branches.cashControlEnabled })
    .from(branches)
    .where(eq(branches.id, branchId))
    .for("share");
  if (!branch?.enabled) return { mode: "off" } as const;
  const session = await openSession(tx, branchId, true);
  return session
    ? ({ mode: "open", sessionId: session.id } as const)
    : ({ mode: "closed" } as const);
}

/** Solo en la transacción del llamador. Si ya escribió, debe lanzar ante un fallo. */
export async function recordCashMovement(tx: AppDb, actor: SessionUser, input: unknown, now: Date) {
  if (!can(actor.role, "cash.open_close")) return failure("forbidden");
  const parsed = movementSchema.safeParse(input);
  if (!parsed.success) return failure("validation_error");
  const { sessionId, ...values } = parsed.data;
  const [session] = await tx
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.branchId, actor.branchId), eq(cashSessions.id, sessionId)))
    .for("update");
  if (!session) return failure("not_found");
  if (session.closedAt !== null) return failure("cash_session_closed");
  const [movement] = await tx
    .insert(cashMovements)
    .values({
      ...values,
      branchId: actor.branchId,
      cashSessionId: sessionId,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: cashMovements.id });
  if (!movement) throw new Error("No se pudo registrar el movimiento de caja.");
  return { ok: true, movementId: movement.id } as const;
}

/** Solo en la transacción del llamador. Revisa todas las sesiones antes de escribir. */
export async function voidCashMovementFor(
  tx: AppDb,
  actor: SessionUser,
  referenceKind: string,
  referenceId: string,
  now: Date,
) {
  if (!can(actor.role, "cash.open_close")) return failure("forbidden");
  if (!referenceSchema.safeParse(referenceKind).success || !z.uuid().safeParse(referenceId).success)
    return failure("validation_error");
  const scope = and(
    eq(cashMovements.branchId, actor.branchId),
    eq(cashMovements.referenceKind, referenceKind),
    eq(cashMovements.referenceId, referenceId),
    isNull(cashMovements.voidedAt),
  );
  const movements = await tx.select().from(cashMovements).where(scope);
  if (!movements.length) return { ok: true } as const;
  const sessionIds = [...new Set(movements.map((row) => row.cashSessionId))].sort();
  const sessions = await tx
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.branchId, actor.branchId), inArray(cashSessions.id, sessionIds)))
    .orderBy(asc(cashSessions.id))
    .for("update");
  if (sessions.some((session) => session.closedAt !== null)) return failure("cash_session_closed");
  await tx
    .update(cashMovements)
    .set({ voidedAt: now, voidedBy: actor.id, updatedAt: now })
    .where(and(scope, inArray(cashMovements.cashSessionId, sessionIds)));
  return { ok: true } as const;
}

export async function dayPaymentsSummary(db: AppDb, actor: SessionUser, now: Date) {
  if (!can(actor.role, "cash.open_close")) return failure("forbidden");
  const start = DateTime.fromJSDate(now).setZone(TIMEZONE).startOf("day");
  const rows = await db
    .select({
      method: payments.method,
      amountClp: sql<number>`sum(${payments.amountClp})`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(payments)
    .where(
      and(
        eq(payments.branchId, actor.branchId),
        isNull(payments.voidedAt),
        gte(payments.receivedAt, start.toJSDate()),
        lt(payments.receivedAt, start.plus({ days: 1 }).toJSDate()),
        inArray(payments.method, RECORDABLE_PAYMENT_METHODS),
      ),
    )
    .groupBy(payments.method);
  return RECORDABLE_PAYMENT_METHODS.map((method) => {
    const row = rows.find((row) => row.method === method);
    return { method, amountClp: row?.amountClp ?? 0, count: row?.count ?? 0 };
  });
}
