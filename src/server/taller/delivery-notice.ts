import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getEmailEnv, getSiteEnv } from "../../lib/env.ts";
import { log } from "../../lib/log.ts";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { auditLog } from "../db/schema-taller.ts";
import { emailBrand, senderFor } from "../email/brand.ts";
import { sendShopCopy } from "../email/notifications.ts";
import type { NotifyDeps } from "../email/notifications.ts";
import { deliveryDateChangedEmail } from "../email/order-templates.ts";
import { createTransport } from "../email/transport.ts";
import { profileForBranch } from "../shops/profile.ts";
import { recordAudit } from "./audit.ts";
import { confirmDeliveryDate } from "./delivery-date.ts";
import { formatOrderNumber, getOrderHeader } from "./orders.ts";
import { TERMINAL_STATUSES } from "./rules.ts";
import { canAccessOrder } from "./status.ts";
import { ensureTrackingLink } from "./tracking.ts";

type Header = NonNullable<Awaited<ReturnType<typeof getOrderHeader>>>;
type DateChange = { header: Header; date: string; previousDate: string | null };
type ChangeResult =
  | { ok: true; notified: boolean }
  | { ok: false; code: "forbidden" | "not_found" | "invalid_status" | "invalid_date" };

async function hasDeliveryNotice(db: AppDb, actor: SessionUser, orderId: string, date: string) {
  const [sent] = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.branchId, actor.branchId),
        eq(auditLog.entityId, orderId),
        eq(auditLog.action, "notify.delivery_date_changed"),
        sql`${auditLog.details}->>'date' = ${date}`,
      ),
    )
    .limit(1);
  return Boolean(sent);
}

async function recordDeliveryNotice(db: AppDb, actor: SessionUser, change: DateChange, now: Date) {
  await recordAudit(
    db,
    {
      branchId: actor.branchId,
      actorUserId: actor.id,
      action: "notify.delivery_date_changed",
      entity: "work_order",
      entityId: change.header.order.id,
      details: { date: change.date, previousDate: change.previousDate },
    },
    now,
  );
}

async function deliveryIdentity(db: AppDb, branchId: string, deps: NotifyDeps) {
  const profile = await profileForBranch(db, branchId);
  if (!profile) throw new Error("No se encontró el perfil del taller de la orden.");
  const brand = emailBrand(profile);
  const baseEnv = deps.env ?? getEmailEnv();
  const env = {
    ...baseEnv,
    EMAIL_FROM: senderFor(profile, baseEnv.EMAIL_FROM),
    EMAIL_REPLY_TO: brand.replyTo,
    SHOP_NOTIFY_EMAIL: brand.notifyEmail,
  };
  return { brand, env };
}

/** Se llama después del commit de confirmDeliveryDate; el correo nunca revierte la fecha. */
async function notifyDeliveryDateChanged(
  db: AppDb,
  actor: SessionUser,
  change: DateChange,
  now: Date,
  deps: NotifyDeps,
): Promise<boolean> {
  const {
    header: { order, customer, bike },
    date,
    previousDate,
  } = change;
  try {
    if (date === previousDate || order.status === "reservada" || customer.email === null)
      return false;
    if (await hasDeliveryNotice(db, actor, order.id, date)) return false;
    const siteUrl = deps.siteUrl ?? getSiteEnv().PUBLIC_SITE_URL;
    const tracking = await ensureTrackingLink(db, actor, order.id, siteUrl, now);
    const number = formatOrderNumber(order.number);
    const { brand, env } = await deliveryIdentity(db, actor.branchId, deps);
    const email = deliveryDateChangedEmail(brand, {
      orderNumber: number,
      customerName: customer.name,
      bike: `${bike.brand} ${bike.model}`.trim(),
      previousDate,
      newDate: date,
      trackingUrl: tracking.ok ? tracking.url : null,
    });
    const transport = deps.transport ?? createTransport(env);
    await transport.send({ to: customer.email, ...email });
    await sendShopCopy(transport, env, customer.email, email, number);
    await recordDeliveryNotice(db, actor, change, now);
    return true;
  } catch {
    log.error("email.failed", { kind: "delivery_date", orderId: order.id });
    return false;
  }
}

export async function changeDeliveryDate(
  db: AppDb,
  actor: SessionUser,
  orderId: string,
  date: string,
  now: Date,
  deps: NotifyDeps = {},
): Promise<ChangeResult> {
  if (!can(actor.role, "reception.perform")) return { ok: false, code: "forbidden" };
  if (!z.uuid().safeParse(orderId).success) return { ok: false, code: "not_found" };
  const header = await getOrderHeader(db, actor, orderId);
  if (!header || header.order.voidedAt) return { ok: false, code: "not_found" };
  if (!canAccessOrder(actor, header.order)) return { ok: false, code: "forbidden" };
  if ((TERMINAL_STATUSES as readonly string[]).includes(header.order.status))
    return { ok: false, code: "invalid_status" };
  const previousDate = header.order.estimatedDeliveryDate;
  const result = await confirmDeliveryDate(db, actor, orderId, date, now);
  if (!result.ok) return result;
  const notified = await notifyDeliveryDateChanged(
    db,
    actor,
    { header, date, previousDate },
    now,
    deps,
  );
  return { ok: true, notified };
}
