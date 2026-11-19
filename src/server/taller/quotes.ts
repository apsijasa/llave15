import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getEmailEnv, getSiteEnv } from "../../lib/env.ts";
import { log } from "../../lib/log.ts";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { auditLog } from "../db/schema-taller.ts";
import { emailBrand, senderFor } from "../email/brand.ts";
import { profileForBranch } from "../shops/profile.ts";
import { sendShopCopy } from "../email/notifications.ts";
import type { NotifyDeps } from "../email/notifications.ts";
import { quoteEmail, quoteTotalClp } from "../email/order-templates.ts";
import type { QuoteEmail } from "../email/order-templates.ts";
import { createTransport } from "../email/transport.ts";
import type { EmailTransport } from "../email/transport.ts";
import { recordAudit } from "./audit.ts";
import { listItems } from "./items.ts";
import { formatOrderNumber, getOrderHeader } from "./orders.ts";
import { PRICING_MODES, TERMINAL_STATUSES } from "./rules.ts";
import { canAccessOrder } from "./status.ts";
import { ensureTrackingLink } from "./tracking.ts";

type QuoteResult =
  | { ok: true; totalClp: number }
  | {
      ok: false;
      code: "forbidden" | "not_found" | "invalid_status" | "no_items" | "no_email" | "send_failed";
    };

function redactedTransport(transport: EmailTransport): EmailTransport {
  return {
    send: async (message) => {
      try {
        await transport.send(message);
      } catch {
        throw new Error("No se pudo enviar el correo de cotización.");
      }
    },
  };
}

async function quoteDelivery(db: AppDb, actor: SessionUser, input: QuoteEmail, deps: NotifyDeps) {
  const profile = await profileForBranch(db, actor.branchId);
  if (!profile) throw new Error("No se encontró el perfil del taller de la orden.");
  const brand = emailBrand(profile);
  const email = quoteEmail(brand, input);
  const baseEnv = deps.env ?? getEmailEnv();
  const env = {
    ...baseEnv,
    EMAIL_FROM: senderFor(profile, baseEnv.EMAIL_FROM),
    EMAIL_REPLY_TO: brand.replyTo,
    SHOP_NOTIFY_EMAIL: brand.notifyEmail,
  };
  const transport = redactedTransport(deps.transport ?? createTransport(env));
  return { email, env, transport };
}

async function deliverQuote(
  db: AppDb,
  actor: SessionUser,
  orderId: string,
  now: Date,
  input: QuoteEmail,
  customerEmail: string,
  deps: NotifyDeps,
): Promise<QuoteResult> {
  let delivery: Awaited<ReturnType<typeof quoteDelivery>>;
  try {
    delivery = await quoteDelivery(db, actor, input, deps);
    await delivery.transport.send({ to: customerEmail, ...delivery.email });
  } catch {
    log.error("email.failed", { kind: "quote", orderId });
    return { ok: false, code: "send_failed" };
  }
  const { transport, env, email } = delivery;
  await sendShopCopy(transport, env, customerEmail, email, input.orderNumber);
  const totalClp = quoteTotalClp(input.items, input.pricingMode);
  await recordAudit(
    db,
    {
      branchId: actor.branchId,
      actorUserId: actor.id,
      action: "notify.quote_sent",
      entity: "work_order",
      entityId: orderId,
      details: { totalClp, items: input.items },
    },
    now,
  );
  return { ok: true, totalClp };
}

export async function sendQuote(
  db: AppDb,
  actor: SessionUser,
  orderId: string,
  now: Date,
  deps: NotifyDeps = {},
): Promise<QuoteResult> {
  if (!can(actor.role, "approvals.create")) return { ok: false, code: "forbidden" };
  const header = await getOrderHeader(db, actor, orderId);
  if (!header || header.order.voidedAt) return { ok: false, code: "not_found" };
  const { order, customer, bike } = header;
  if (!canAccessOrder(actor, order)) return { ok: false, code: "forbidden" };
  if ((TERMINAL_STATUSES as readonly string[]).includes(order.status))
    return { ok: false, code: "invalid_status" };
  if (customer.email === null) return { ok: false, code: "no_email" };
  const items = (await listItems(db, actor, orderId)).map(
    ({ description, quantity, unitPriceClp }) => ({ description, quantity, unitPriceClp }),
  );
  if (items.length === 0) return { ok: false, code: "no_items" };
  const tracking = await ensureTrackingLink(
    db,
    actor,
    orderId,
    deps.siteUrl ?? getSiteEnv().PUBLIC_SITE_URL,
    now,
  );
  const input: QuoteEmail = {
    orderNumber: formatOrderNumber(order.number),
    pricingMode: z.enum(PRICING_MODES).parse(order.pricingMode),
    customerName: customer.name,
    bike: `${bike.brand} ${bike.model}`.trim(),
    items,
    estimatedDeliveryDate: order.estimatedDeliveryDate,
    trackingUrl: tracking.ok ? tracking.url : null,
  };
  return deliverQuote(db, actor, orderId, now, input, customer.email, deps);
}

export async function lastQuote(
  db: AppDb,
  actor: SessionUser,
  orderId: string,
): Promise<{ at: Date; totalClp: number } | null> {
  if (!can(actor.role, "approvals.create")) return null;
  const header = await getOrderHeader(db, actor, orderId);
  if (!header || header.order.voidedAt || !canAccessOrder(actor, header.order)) return null;
  const [row] = await db
    .select({ at: auditLog.createdAt, details: auditLog.details })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.branchId, actor.branchId),
        eq(auditLog.entity, "work_order"),
        eq(auditLog.entityId, orderId),
        eq(auditLog.action, "notify.quote_sent"),
      ),
    )
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(1);
  return row && typeof row.details.totalClp === "number"
    ? { at: row.at, totalClp: row.details.totalClp }
    : null;
}
