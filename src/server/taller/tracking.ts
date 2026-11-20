import { createHmac } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getTrackingEnv } from "../../lib/env.ts";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { workOrders, workOrderStatusHistory } from "../db/schema-orders.ts";
import { orderTrackingTokens } from "../db/schema-reports.ts";
import { bikes, customers } from "../db/schema-taller.ts";
import { formatOrderNumber, getOrderHeader } from "./orders.ts";
import { STATUS_LABELS, TERMINAL_STATUSES } from "./rules.ts";
import type { OrderStatus } from "./rules.ts";
import { hashShareToken, shareTokenSchema } from "./share-tokens.ts";
import { canAccessOrder } from "./status.ts";

export type TrackingView = {
  orderNumber: string;
  customerFirstName: string;
  bike: string;
  status: OrderStatus;
  statusLabel: string;
  estimatedDeliveryDate: string | null;
  isReadyForPickup: boolean;
  isTerminal: boolean;
  timeline: { at: Date; status: OrderStatus; label: string }[];
};

type EnsureResult =
  | { ok: true; url: string; token: string }
  | { ok: false; code: "not_found" | "forbidden" };

/**
 * Token estable por orden: HMAC del id con un prefijo propio, para poder reemitirlo en cada correo
 * sin guardarlo en claro. Lo firma `TRACKING_TOKEN_SECRET` (BG-35); las órdenes cuyo enlace ya se
 * envió firmado con `CANCEL_TOKEN_SECRET` lo conservan hasta BG-DC2 (decisión 49).
 */
export function trackingTokenFor(
  orderId: string,
  secret: string = getTrackingEnv().TRACKING_TOKEN_SECRET,
): string {
  return createHmac("sha256", secret).update(`tracking:${orderId}`).digest().toString("base64url");
}

export function trackingLink(siteUrl: string, token: string): string {
  return new URL(`/seguimiento/${token}`, siteUrl).toString();
}

/**
 * Con fila: reemite el candidato (secreto propio o heredado) cuyo hash coincide, para no romper el
 * enlace ya enviado; si ninguno coincide (las dos claves rotaron), firma con el propio y actualiza
 * el hash. Sin fila: el del secreto propio.
 */
async function tokenForOrder(db: AppDb, orderId: string, now: Date): Promise<string> {
  const env = getTrackingEnv();
  const own = trackingTokenFor(orderId, env.TRACKING_TOKEN_SECRET);
  const [row] = await db
    .select({ tokenHash: orderTrackingTokens.tokenHash })
    .from(orderTrackingTokens)
    .where(eq(orderTrackingTokens.workOrderId, orderId))
    .limit(1);
  if (!row) return own;
  const legacy = trackingTokenFor(orderId, env.LEGACY_SECRET);
  const match = [own, legacy].find((candidate) => hashShareToken(candidate) === row.tokenHash);
  if (match) return match;
  await db
    .update(orderTrackingTokens)
    .set({ tokenHash: hashShareToken(own), updatedAt: now })
    .where(eq(orderTrackingTokens.workOrderId, orderId));
  return own;
}

/** Crea la fila la primera vez que alguien necesita el enlace; las siguientes, la reutiliza. */
export async function ensureTrackingLink(
  db: AppDb,
  actor: SessionUser,
  orderId: string,
  siteUrl: string,
  now: Date,
): Promise<EnsureResult> {
  if (!can(actor.role, "orders.edit")) return { ok: false, code: "forbidden" };
  const header = await getOrderHeader(db, actor, orderId);
  if (!header || header.order.voidedAt) return { ok: false, code: "not_found" };
  if (!canAccessOrder(actor, header.order)) return { ok: false, code: "forbidden" };
  const token = await tokenForOrder(db, orderId, now);
  await db
    .insert(orderTrackingTokens)
    .values({
      branchId: actor.branchId,
      workOrderId: orderId,
      tokenHash: hashShareToken(token),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: orderTrackingTokens.workOrderId });
  return { ok: true, url: trackingLink(siteUrl, token), token };
}

async function publicOrder(db: AppDb, token: string) {
  const [row] = await db
    .select({
      id: workOrders.id,
      branchId: workOrders.branchId,
      number: workOrders.number,
      status: workOrders.status,
      estimatedDeliveryDate: workOrders.estimatedDeliveryDate,
      createdAt: workOrders.createdAt,
      customerName: customers.name,
      brand: bikes.brand,
      model: bikes.model,
    })
    .from(orderTrackingTokens)
    .innerJoin(
      workOrders,
      and(
        eq(workOrders.id, orderTrackingTokens.workOrderId),
        eq(workOrders.branchId, orderTrackingTokens.branchId),
        isNull(workOrders.voidedAt),
      ),
    )
    .innerJoin(
      customers,
      and(eq(customers.id, workOrders.customerId), eq(customers.branchId, workOrders.branchId)),
    )
    .innerJoin(bikes, and(eq(bikes.id, workOrders.bikeId), eq(bikes.branchId, workOrders.branchId)))
    .where(eq(orderTrackingTokens.tokenHash, hashShareToken(token)))
    .limit(1);
  return row ?? null;
}

async function publicTimeline(db: AppDb, branchId: string, orderId: string) {
  const rows = await db
    .select({ at: workOrderStatusHistory.createdAt, status: workOrderStatusHistory.toStatus })
    .from(workOrderStatusHistory)
    .where(
      and(
        eq(workOrderStatusHistory.branchId, branchId),
        eq(workOrderStatusHistory.workOrderId, orderId),
      ),
    )
    .orderBy(asc(workOrderStatusHistory.createdAt), asc(workOrderStatusHistory.id));
  return rows.map(({ at, status }) => ({
    at,
    status: status as OrderStatus,
    label: STATUS_LABELS[status as OrderStatus],
  }));
}

/** Solo lo que el cliente puede ver; `null` para cualquier token que no lleve a una orden vigente. */
export async function viewTrackingByToken(db: AppDb, token: string): Promise<TrackingView | null> {
  const parsed = shareTokenSchema.safeParse(token);
  if (!parsed.success) return null;
  const order = await publicOrder(db, parsed.data);
  if (!order) return null;
  const status = order.status as OrderStatus;
  const timeline = await publicTimeline(db, order.branchId, order.id);
  return {
    orderNumber: formatOrderNumber(order.number),
    customerFirstName: order.customerName.trim().split(/\s+/)[0] ?? "",
    bike: `${order.brand} ${order.model}`.trim(),
    status,
    statusLabel: STATUS_LABELS[status],
    estimatedDeliveryDate: order.estimatedDeliveryDate,
    isReadyForPickup: status === "lista_para_retirar",
    isTerminal: (TERMINAL_STATUSES as readonly string[]).includes(status),
    timeline:
      timeline.length > 0 ? timeline : [{ at: order.createdAt, status, label: "Orden creada" }],
  };
}
