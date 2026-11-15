import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import { isUniqueViolation } from "../db/client.ts";
import type { AppDb } from "../db/client.ts";
import { workOrders } from "../db/schema-orders.ts";
import { payments } from "../db/schema-payments.ts";
import { recordAudit } from "./audit.ts";
import { recordCashMovement, requireOpenCashSession, voidCashMovementFor } from "./cash.ts";
import type { AuditAction } from "./audit.ts";
import { FORM_PAYMENT_METHODS, PAYMENT_KINDS, POS_PROVIDERS, TERMINAL_STATUSES } from "./rules.ts";
import { canAccessOrder } from "./status.ts";

const clpInteger = z
  .union([
    z.number(),
    z
      .string()
      .trim()
      .regex(/^-?\d+$/),
  ])
  .transform(Number)
  .pipe(z.number().int().max(2_147_483_647));
const paymentInputSchema = z
  .strictObject({
    kind: z.enum(PAYMENT_KINDS),
    method: z.enum(FORM_PAYMENT_METHODS),
    amountClp: clpInteger,
    posProvider: z.enum(POS_PROVIDERS).optional(),
  })
  .refine((input) => input.method === "tarjeta" || input.posProvider === undefined, {
    path: ["posProvider"],
    message: "El proveedor es solo para pagos con POS.",
  });
/** El formulario exige monto positivo y, en POS, el proveedor (F2-D30). */
export const paymentFormSchema = paymentInputSchema
  .safeExtend({ amountClp: paymentInputSchema.shape.amountClp.pipe(z.number().positive()) })
  .refine((input) => input.method !== "tarjeta" || input.posProvider !== undefined, {
    path: ["posProvider"],
    message: "Elige el proveedor del POS.",
  });

function orderFilter(actor: SessionUser, orderId: string) {
  return and(
    eq(workOrders.branchId, actor.branchId),
    eq(workOrders.id, orderId),
    isNull(workOrders.voidedAt),
  );
}

async function accessibleOrder(db: AppDb, actor: SessionUser, orderId: string, lock = false) {
  const query = db.select().from(workOrders).where(orderFilter(actor, orderId));
  const [order] = await (lock ? query.for("update") : query);
  if (!order) return { ok: false, code: "not_found" } as const;
  if (!canAccessOrder(actor, order)) return { ok: false, code: "forbidden" } as const;
  return { ok: true, order } as const;
}

/** Recibe la transacción que registra o anula el pago. */
export async function recomputePaid(db: AppDb, orderId: string, now: Date) {
  const [order] = await db
    .select({ branchId: workOrders.branchId })
    .from(workOrders)
    .where(eq(workOrders.id, orderId));
  if (!order) return;
  const [total] = await db
    .select({
      paidClp: sql<number>`coalesce(sum(amount_clp), 0)`.mapWith(Number),
    })
    .from(payments)
    .where(
      and(
        eq(payments.branchId, order.branchId),
        eq(payments.workOrderId, orderId),
        isNull(payments.voidedAt),
      ),
    );
  if (!total) throw new Error("No se pudieron calcular los pagos.");
  await db
    .update(workOrders)
    .set({ paidClp: total.paidClp, updatedAt: now })
    .where(and(eq(workOrders.branchId, order.branchId), eq(workOrders.id, orderId)));
}

async function auditPayment(
  db: AppDb,
  actor: SessionUser,
  orderId: string,
  action: AuditAction,
  details: Record<string, unknown>,
  now: Date,
) {
  await recordAudit(
    db,
    {
      branchId: actor.branchId,
      actorUserId: actor.id,
      action,
      entity: "work_order",
      entityId: orderId,
      details,
    },
    now,
  );
}

/** Error centinela: el movimiento de caja falló después de escribir el pago. */
class CashMovementFailure extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function isDepositConflict(error: unknown): boolean {
  if (!isUniqueViolation(error)) return false;
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const detail = current as { constraint?: unknown; constraint_name?: unknown; cause?: unknown };
    if (
      detail.constraint === "uq_payments_one_abono" ||
      detail.constraint_name === "uq_payments_one_abono"
    )
      return true;
    current = detail.cause;
  }
  return false;
}

async function insertPayment(
  db: AppDb,
  actor: SessionUser,
  orderId: string,
  input: z.infer<typeof paymentInputSchema>,
  now: Date,
  cashSessionId: string | null = null,
) {
  const values = {
    kind: input.kind,
    method: input.method,
    amountClp: input.amountClp,
    ...(input.posProvider ? { posProvider: input.posProvider } : {}),
  };
  const [payment] = await db
    .insert(payments)
    .values({
      ...values,
      branchId: actor.branchId,
      workOrderId: orderId,
      cashSessionId,
      receivedBy: actor.id,
      receivedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: payments.id });
  if (!payment) throw new Error("No se pudo registrar el pago.");
  if (cashSessionId) {
    const movement = await recordCashMovement(
      db,
      actor,
      {
        sessionId: cashSessionId,
        kind: "ingreso",
        amountClp: input.amountClp,
        referenceKind: "payment",
        referenceId: payment.id,
      },
      now,
    );
    if (!movement.ok) throw new CashMovementFailure(movement.code);
  }
  await recomputePaid(db, orderId, now);
  await auditPayment(db, actor, orderId, "payment.recorded", values, now);
  return { ok: true, paymentId: payment.id } as const;
}

export async function recordPayment(
  db: AppDb,
  actor: SessionUser,
  orderId: string,
  input: unknown,
  now: Date,
) {
  if (!can(actor.role, "payments.record")) return { ok: false, code: "forbidden" } as const;
  const parsed = paymentInputSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      code: parsed.error.issues.every((issue) => issue.path[0] === "amountClp")
        ? "invalid_amount"
        : "validation_error",
    } as const;
  try {
    return await db.transaction(async (tx) => {
      const access = await accessibleOrder(tx, actor, orderId, true);
      if (!access.ok) return access;
      const { order } = access;
      if ((TERMINAL_STATUSES as readonly string[]).includes(order.status))
        return { ok: false, code: "invalid_status" } as const;
      if (parsed.data.amountClp <= 0 || parsed.data.amountClp > order.totalClp - order.paidClp)
        return { ok: false, code: "invalid_amount" } as const;
      let cashSessionId: string | null = null;
      if (parsed.data.method === "efectivo") {
        const cash = await requireOpenCashSession(tx, actor.branchId);
        if (cash.mode === "closed") return { ok: false, code: "cash_closed" } as const;
        if (cash.mode === "open") cashSessionId = cash.sessionId;
      }
      return insertPayment(tx, actor, orderId, parsed.data, now, cashSessionId);
    });
  } catch (error) {
    if (isDepositConflict(error)) return { ok: false, code: "deposit_exists" } as const;
    if (error instanceof CashMovementFailure) return { ok: false, code: error.code } as const;
    throw error;
  }
}

async function lockPayment(db: AppDb, actor: SessionUser, paymentId: string) {
  const scope = and(eq(payments.branchId, actor.branchId), eq(payments.id, paymentId));
  const [reference] = await db
    .select({ orderId: payments.workOrderId })
    .from(payments)
    .where(and(scope, isNull(payments.voidedAt)));
  if (!reference || reference.orderId === null) return { ok: false, code: "not_found" } as const;
  const access = await accessibleOrder(db, actor, reference.orderId, true);
  if (!access.ok) return access;
  const [payment] = await db
    .select()
    .from(payments)
    .where(and(scope, isNull(payments.voidedAt)))
    .for("update");
  if (!payment) return { ok: false, code: "not_found" } as const;
  if (access.order.status === "entregada") return { ok: false, code: "invalid_status" } as const;
  return { ok: true, payment } as const;
}

export async function voidPayment(db: AppDb, actor: SessionUser, paymentId: string, now: Date) {
  if (!can(actor.role, "payments.void")) return { ok: false, code: "forbidden" } as const;
  return db.transaction(async (tx) => {
    const access = await lockPayment(tx, actor, paymentId);
    if (!access.ok) return access;
    const { payment } = access;
    if (payment.workOrderId === null) return { ok: false, code: "not_found" } as const;
    if (payment.cashSessionId) {
      const cash = await voidCashMovementFor(tx, actor, "payment", paymentId, now);
      if (!cash.ok) return cash;
    }
    await tx
      .update(payments)
      .set({ voidedAt: now, voidedBy: actor.id, updatedAt: now })
      .where(and(eq(payments.branchId, actor.branchId), eq(payments.id, paymentId)));
    await recomputePaid(tx, payment.workOrderId, now);
    await auditPayment(
      tx,
      actor,
      payment.workOrderId,
      "payment.voided",
      {
        paymentId,
        kind: payment.kind,
        amountClp: payment.amountClp,
      },
      now,
    );
    return { ok: true } as const;
  });
}

export async function listPayments(db: AppDb, actor: SessionUser, orderId: string) {
  if (!(await accessibleOrder(db, actor, orderId)).ok) return [];
  const rows = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.branchId, actor.branchId),
        eq(payments.workOrderId, orderId),
        isNull(payments.voidedAt),
      ),
    )
    .orderBy(asc(payments.receivedAt), asc(payments.id));
  if (can(actor.role, "costs.view")) return rows;
  return rows.map(({ feeClp: _feeClp, netClp: _netClp, ...visible }) => visible);
}
