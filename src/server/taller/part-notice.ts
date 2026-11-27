import { and, eq, isNull } from "drizzle-orm";
import { getEmailEnv, getAppEnv } from "../../lib/env.ts";
import { log } from "../../lib/log.ts";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { workOrderItems } from "../db/schema-orders.ts";
import { emailBrand, senderFor } from "../email/brand.ts";
import { profileForBranch } from "../shops/profile.ts";
import { sendShopCopy } from "../email/notifications.ts";
import type { NotifyDeps } from "../email/notifications.ts";
import { partAddedEmail } from "../email/order-templates.ts";
import { createTransport } from "../email/transport.ts";
import type { EmailTransport } from "../email/transport.ts";
import { recordAudit } from "./audit.ts";
import { formatOrderNumber, getOrderHeader } from "./orders.ts";
import { TERMINAL_STATUSES } from "./rules.ts";
import { canAccessOrder } from "./status.ts";
import { ensureTrackingLink } from "./tracking.ts";

type Header = NonNullable<Awaited<ReturnType<typeof getOrderHeader>>>;
type Part = { id: string; description: string; quantity: number; unitPriceClp: number };

async function findPart(db: AppDb, actor: SessionUser, orderId: string, itemId: string) {
  const [item] = await db
    .select({
      id: workOrderItems.id,
      description: workOrderItems.description,
      quantity: workOrderItems.quantity,
      unitPriceClp: workOrderItems.unitPriceClp,
    })
    .from(workOrderItems)
    .where(
      and(
        eq(workOrderItems.id, itemId),
        eq(workOrderItems.workOrderId, orderId),
        eq(workOrderItems.branchId, actor.branchId),
        eq(workOrderItems.kind, "repuesto"),
        isNull(workOrderItems.voidedAt),
      ),
    )
    .limit(1);
  return item;
}

/** sendShopCopy registra el mensaje del error: el transporte nunca le entrega datos personales. */
function privateTransport(transport: EmailTransport): EmailTransport {
  return {
    send: async (message) => {
      try {
        await transport.send(message);
      } catch {
        throw new Error("No se pudo enviar el correo.");
      }
    },
  };
}

async function recordPartNotice(
  db: AppDb,
  actor: SessionUser,
  orderId: string,
  itemId: string,
  totalClp: number,
  now: Date,
) {
  await recordAudit(
    db,
    {
      branchId: actor.branchId,
      actorUserId: actor.id,
      action: "notify.part_added",
      entity: "work_order",
      entityId: orderId,
      details: { itemId, totalClp },
    },
    now,
  );
}

async function sendPartNotice(
  db: AppDb,
  actor: SessionUser,
  header: Header,
  item: Part,
  now: Date,
  deps: NotifyDeps,
) {
  const { order, customer, bike } = header;
  if (customer.email === null) return false;
  const siteUrl = deps.siteUrl ?? getAppEnv().APP_URL;
  const tracking = await ensureTrackingLink(db, actor, order.id, siteUrl, now);
  const number = formatOrderNumber(order.number);
  const profile = await profileForBranch(db, actor.branchId);
  if (!profile) throw new Error("No se encontró el perfil del taller de la orden.");
  const brand = emailBrand(profile);
  const email = partAddedEmail(brand, {
    orderNumber: number,
    customerName: customer.name,
    bike: `${bike.brand} ${bike.model}`.trim(),
    item,
    pricingMode: order.pricingMode === "neto" ? "neto" : "final",
    subtotalClp: order.subtotalClp,
    vatClp: order.vatClp,
    totalClp: order.totalClp,
    trackingUrl: tracking.ok ? tracking.url : null,
  });
  const baseEnv = deps.env ?? getEmailEnv();
  const env = {
    ...baseEnv,
    EMAIL_FROM: senderFor(profile, baseEnv.EMAIL_FROM),
    EMAIL_REPLY_TO: brand.replyTo,
    SHOP_NOTIFY_EMAIL: brand.notifyEmail,
  };
  const transport = privateTransport(deps.transport ?? createTransport(env));
  await transport.send({ to: customer.email, ...email });
  await sendShopCopy(transport, env, customer.email, email, number);
  await recordPartNotice(db, actor, order.id, item.id, order.totalClp, now);
  return true;
}

/** Solo después del commit de la línea; un fallo del aviso nunca deshace el repuesto. */
export async function notifyPartAdded(
  db: AppDb,
  actor: SessionUser,
  orderId: string,
  itemId: string,
  now: Date,
  deps: NotifyDeps = {},
): Promise<boolean> {
  try {
    if (!can(actor.role, "items.add_part")) return false;
    const header = await getOrderHeader(db, actor, orderId);
    if (!header || header.order.voidedAt || header.customer.email === null) return false;
    if (!canAccessOrder(actor, header.order)) return false;
    if (
      (header.order.status === "creado" && header.order.receivedAt === null) ||
      (TERMINAL_STATUSES as readonly string[]).includes(header.order.status)
    )
      return false;
    const item = await findPart(db, actor, orderId, itemId);
    if (!item) return false;
    return await sendPartNotice(db, actor, header, item, now, deps);
  } catch {
    log.error("email.failed", { kind: "part_added", orderId });
    return false;
  }
}
