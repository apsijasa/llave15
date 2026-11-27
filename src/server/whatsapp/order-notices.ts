import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getWhatsAppEnv } from "../../lib/env.ts";
import { errorMessage, log } from "../../lib/log.ts";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { workOrders } from "../db/schema-orders.ts";
import { orderWhatsappNotices } from "../db/schema-reports.ts";
import { bikes, customers } from "../db/schema-taller.ts";
import { bookings } from "../db/schema.ts";
import { recordAudit } from "../taller/audit.ts";
import { formatOrderNumber } from "../taller/orders.ts";
import { type NoticeResult, postTemplate } from "./service.ts";

export type OrderNoticeSender = (
  to: string,
  template: string,
  variables: string[],
) => Promise<string>;

async function readyOrder(db: AppDb, actor: SessionUser, orderId: string) {
  const [order] = await db
    .select({
      number: workOrders.number,
      name: customers.name,
      phoneE164: customers.phoneE164,
      brand: bikes.brand,
      model: bikes.model,
      bookingId: bookings.id,
      consentAt: bookings.whatsappConsentAt,
    })
    .from(workOrders)
    .innerJoin(
      customers,
      and(eq(customers.id, workOrders.customerId), eq(customers.branchId, actor.branchId)),
    )
    .innerJoin(bikes, and(eq(bikes.id, workOrders.bikeId), eq(bikes.branchId, actor.branchId)))
    .leftJoin(
      bookings,
      and(eq(bookings.id, workOrders.bookingId), eq(bookings.branchId, actor.branchId)),
    )
    .where(
      and(
        eq(workOrders.id, orderId),
        eq(workOrders.branchId, actor.branchId),
        isNull(workOrders.voidedAt),
        inArray(workOrders.status, ["lista_para_retirar", "pagado"]),
      ),
    );
  return order;
}

async function claimNotice(db: AppDb, actor: SessionUser, orderId: string, now: Date) {
  return db.transaction(async (tx) => {
    await tx
      .insert(orderWhatsappNotices)
      .values({
        branchId: actor.branchId,
        workOrderId: orderId,
        type: "ready",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
    const [claimed] = await tx
      .update(orderWhatsappNotices)
      .set({
        status: "sending",
        attempts: sql`${orderWhatsappNotices.attempts} + 1`,
        claimedAt: now,
        error: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(orderWhatsappNotices.branchId, actor.branchId),
          eq(orderWhatsappNotices.workOrderId, orderId),
          eq(orderWhatsappNotices.type, "ready"),
          inArray(orderWhatsappNotices.status, ["pending", "failed"]),
        ),
      )
      .returning();
    return claimed;
  });
}

async function deliverNotice(
  db: AppDb,
  claimed: typeof orderWhatsappNotices.$inferSelect,
  now: Date,
  send: () => Promise<string>,
): Promise<NoticeResult> {
  const fence = and(
    eq(orderWhatsappNotices.branchId, claimed.branchId),
    eq(orderWhatsappNotices.id, claimed.id),
    eq(orderWhatsappNotices.status, "sending"),
    eq(orderWhatsappNotices.attempts, claimed.attempts),
  );
  try {
    const metaMessageId = await send();
    await db
      .update(orderWhatsappNotices)
      .set({
        status: "sent",
        metaMessageId,
        sentAt: now,
        error: null,
        updatedAt: now,
      })
      .where(fence);
    return { status: "sent" };
  } catch (error) {
    const message = errorMessage(error);
    const rejected = /^Meta rechazó la plantilla \(HTTP 4\d\d\)$/.test(message);
    // Un error externo puede contener datos personales; solo se conserva el rechazo HTTP conocido.
    const reason = rejected ? message : "Resultado incierto; verificar en Meta antes de reintentar";
    await db
      .update(orderWhatsappNotices)
      .set({
        status: rejected ? "failed" : "unknown",
        error: reason,
        updatedAt: now,
      })
      .where(fence);
    log.error("whatsapp.failed", {
      kind: "order_ready",
      orderId: claimed.workOrderId,
      message: reason,
    });
    return { status: "failed", reason };
  }
}

/** Post-commit. Sent significa aceptación de Meta; unknown y sending nunca se liberan por tiempo. */
export async function notifyOrderReadyByWhatsApp(
  db: AppDb,
  actor: SessionUser,
  orderId: string,
  now: Date,
  sender: OrderNoticeSender = postTemplate,
): Promise<NoticeResult> {
  const env = getWhatsAppEnv();
  if (env.WHATSAPP_ENABLED !== "true" || !env.WHATSAPP_READY_TEMPLATE) {
    log.info("whatsapp.skipped", { kind: "order_ready", orderId });
    return { status: "skipped", reason: "WhatsApp no configurado" };
  }
  if (!can(actor.role, "qc.approve")) return { status: "skipped", reason: "Sin permiso" };
  const order = await readyOrder(db, actor, orderId);
  if (!order) return { status: "skipped", reason: "La orden no está lista" };
  if (!order.bookingId || !order.consentAt)
    return { status: "skipped", reason: "Sin consentimiento WhatsApp" };
  const claimed = await claimNotice(db, actor, orderId, now);
  if (!claimed)
    return { status: "skipped", reason: "Ya enviado, en curso o resultado de Meta incierto" };
  const template = env.WHATSAPP_READY_TEMPLATE;
  const result = await deliverNotice(db, claimed, now, () =>
    sender(order.phoneE164.replace(/^\+/, ""), template, [
      order.name.trim().split(/\s+/)[0] ?? "",
      `${order.brand} ${order.model}`.trim(),
      formatOrderNumber(order.number),
    ]),
  );
  await recordAudit(
    db,
    {
      branchId: actor.branchId,
      actorUserId: actor.id,
      action: "notify.ready_whatsapp",
      entity: "work_order",
      entityId: orderId,
      details: { status: result.status },
    },
    now,
  );
  return result;
}
