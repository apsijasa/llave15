import { withLegacyStatuses } from "./rules.ts";
import { TIMEZONE, localToday } from "../../lib/time.ts";
import { and, asc, eq, inArray, isNull, lt, notInArray } from "drizzle-orm";
import { DateTime } from "luxon";
import { getEmailEnv } from "../../lib/env.ts";
import { log } from "../../lib/log.ts";
import type { AppDb } from "../db/client.ts";
import { orderPhotos, workOrders } from "../db/schema-orders.ts";
import { bikes, customers } from "../db/schema-taller.ts";
import { shops } from "../db/schema-shops.ts";
import { branches } from "../db/schema.ts";
import { senderFor } from "../email/brand.ts";
import { escapeHtml } from "../email/templates.ts";
import { createTransport } from "../email/transport.ts";
import type { EmailTransport } from "../email/transport.ts";
import { profileFromShop } from "../shops/profile.ts";
import type { ShopProfile } from "../shops/profile.ts";
import type { ObjectStorage } from "../storage/storage.ts";
import { lowStockProducts } from "./low-stock.ts";
import { formatOrderNumber } from "./orders.ts";
import { TERMINAL_STATUSES } from "./rules.ts";

async function overdueOrderRows(db: AppDb, now: Date) {
  const today = localToday(now);
  const rows = await db
    .select({
      branchId: workOrders.branchId,
      number: workOrders.number,
      customerName: customers.name,
      brand: bikes.brand,
      model: bikes.model,
      estimatedDeliveryDate: workOrders.estimatedDeliveryDate,
    })
    .from(workOrders)
    .innerJoin(customers, eq(customers.id, workOrders.customerId))
    .innerJoin(bikes, eq(bikes.id, workOrders.bikeId))
    .where(
      and(
        isNull(workOrders.voidedAt),
        lt(workOrders.estimatedDeliveryDate, today),
        notInArray(workOrders.status, withLegacyStatuses(TERMINAL_STATUSES)),
      ),
    )
    .orderBy(asc(workOrders.estimatedDeliveryDate), asc(workOrders.number));
  const localDay = DateTime.fromISO(today, { zone: TIMEZONE });
  return rows.map((row) => {
    if (!row.estimatedDeliveryDate) throw new Error("Falta la fecha prometida.");
    const promised = DateTime.fromISO(row.estimatedDeliveryDate, { zone: TIMEZONE });
    return {
      branchId: row.branchId,
      number: formatOrderNumber(row.number),
      customerName: row.customerName,
      bike: `${row.brand} ${row.model}`.trim(),
      estimatedDeliveryDate: row.estimatedDeliveryDate,
      daysLate: Math.round(localDay.diff(promised, "days").days),
    };
  });
}

export async function overdueOrders(db: AppDb, now: Date) {
  const rows = await overdueOrderRows(db, now);
  return rows.map(({ branchId: _branchId, ...order }) => order);
}

/** Conserva el conteo del resumen aunque el transporte rechace el envío. */
export class OverdueDigestError extends Error {
  readonly overdue: number;

  constructor(overdue: number, cause: unknown) {
    super("Falló el envío del resumen de órdenes atrasadas.", { cause });
    this.name = "OverdueDigestError";
    this.overdue = overdue;
  }
}

type OverdueOrder = Awaited<ReturnType<typeof overdueOrderRows>>[number];
type LowStockProduct = Awaited<ReturnType<typeof lowStockProducts>>[number];
type ShopDigest = { profile: ShopProfile; orders: OverdueOrder[]; products: LowStockProduct[] };

/** Sucursales de talleres `activo`: un taller suspendido no recibe el resumen (BG-36). */
async function activeBranchIds(db: AppDb): Promise<Set<string>> {
  const rows = await db
    .select({ id: branches.id })
    .from(branches)
    .innerJoin(shops, eq(shops.id, branches.shopId))
    .where(eq(shops.status, "activo"));
  return new Set(rows.map((row) => row.id));
}

async function shopDigests(db: AppDb, orders: OverdueOrder[], products: LowStockProduct[]) {
  const branchIds = [...new Set([...orders, ...products].map((row) => row.branchId))];
  const rows = await db
    .select({ branchId: branches.id, shop: shops })
    .from(branches)
    .innerJoin(shops, eq(shops.id, branches.shopId))
    .where(inArray(branches.id, branchIds));
  const profiles = new Map(rows.map((row) => [row.branchId, profileFromShop(row.shop)]));
  const groups = new Map<string, ShopDigest>();
  const groupForBranch = (branchId: string) => {
    const profile = profiles.get(branchId);
    if (!profile) throw new Error("No se encontró el perfil del taller del resumen.");
    let group = groups.get(profile.shopId);
    if (!group) {
      group = { profile, orders: [], products: [] };
      groups.set(profile.shopId, group);
    }
    return group;
  };
  for (const order of orders) groupForBranch(order.branchId).orders.push(order);
  for (const product of products) groupForBranch(product.branchId).products.push(product);
  return groups.values();
}

function digestMessage({ profile, orders, products }: ShopDigest) {
  const lines = orders.map((order) => {
    const date = DateTime.fromISO(order.estimatedDeliveryDate, { zone: TIMEZONE });
    return `${order.number} · ${order.customerName} · ${order.bike} · prometida ${date.toFormat("dd-MM-yyyy")} (${order.daysLate} días)`;
  });
  if (products.length > 0) {
    lines.push("Stock bajo mínimo:");
    lines.push(
      ...products.map(
        (product) =>
          `${product.sku} · ${product.name} · stock ${product.stockQty} (mínimo ${product.minStock})`,
      ),
    );
  }
  return {
    to: profile.notifyEmail,
    subject:
      orders.length > 0
        ? `Órdenes atrasadas: ${orders.length} · ${profile.name}`
        : `Stock bajo mínimo: ${products.length} · ${profile.name}`,
    text: lines.join("\n"),
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n"),
  };
}

export async function sendOverdueDigest(
  db: AppDb,
  now: Date,
  deps: { transport?: EmailTransport } = {},
): Promise<{ overdue: number; sent: boolean; lowStock?: number }> {
  const active = await activeBranchIds(db);
  const orders = (await overdueOrderRows(db, now)).filter((row) => active.has(row.branchId));
  const products = (await lowStockProducts(db)).filter((row) => active.has(row.branchId));
  if (orders.length === 0 && products.length === 0) return { overdue: 0, sent: false };
  const groups = await shopDigests(db, orders, products);
  const failures: unknown[] = [];
  let sent = false;
  for (const group of groups) {
    try {
      const baseEnv = getEmailEnv();
      const transport =
        deps.transport ??
        createTransport({
          ...baseEnv,
          EMAIL_FROM: senderFor(group.profile, baseEnv.EMAIL_FROM),
          EMAIL_REPLY_TO: group.profile.email,
        });
      await transport.send(digestMessage(group));
      sent = true;
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) throw new OverdueDigestError(orders.length, failures[0]);
  return {
    overdue: orders.length,
    sent,
    ...(products.length > 0 ? { lowStock: products.length } : {}),
  };
}

/**
 * El driver de Replit falla al borrar un objeto que ya no existe: si el borrado falla y la copia
 * completa ya no está, cuenta como purgada para no reintentarla (y responder 500) cada día.
 */
async function deleteFullCopy(storage: ObjectStorage, fullKey: string) {
  try {
    await storage.delete(fullKey);
  } catch (error) {
    if (await storage.exists(fullKey)) throw error;
  }
}

export async function purgeReceptionPhotos(db: AppDb, storage: ObjectStorage, now: Date) {
  const cutoff = DateTime.fromJSDate(now).setZone(TIMEZONE).minus({ months: 6 }).toJSDate();
  const photos = await db
    .select({ id: orderPhotos.id, fullKey: orderPhotos.fullKey })
    .from(orderPhotos)
    .where(
      and(
        eq(orderPhotos.stage, "recepcion"),
        eq(orderPhotos.retentionClass, "recepcion_6m"),
        isNull(orderPhotos.fullPurgedAt),
        lt(orderPhotos.createdAt, cutoff),
      ),
    );
  let purged = 0;
  let failed = 0;
  for (const photo of photos) {
    try {
      await deleteFullCopy(storage, photo.fullKey);
      const marked = await db
        .update(orderPhotos)
        .set({ fullPurgedAt: now, updatedAt: now })
        .where(and(eq(orderPhotos.id, photo.id), isNull(orderPhotos.fullPurgedAt)))
        .returning({ id: orderPhotos.id });
      purged += marked.length;
    } catch {
      failed += 1;
      log.error("tasks.retention_photo_failed");
    }
  }
  return { purged, failed };
}
