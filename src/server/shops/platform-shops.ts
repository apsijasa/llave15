import { withLegacyStatuses } from "../taller/rules.ts";
import { and, asc, eq, gte, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { SessionUser } from "../auth/admin-auth.ts";
import type { AppDb } from "../db/client.ts";
import { workOrders } from "../db/schema-orders.ts";
import { sales } from "../db/schema-sales.ts";
import { shops } from "../db/schema-shops.ts";
import { adminSessions, bookings, branches, users } from "../db/schema.ts";
import { TERMINAL_STATUSES } from "../taller/rules.ts";

/** Lo que `/plataforma` muestra de un taller: metadatos y conteos, nunca filas de clientes. */
export type ShopUsageRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  activeUsers: number;
  openOrders: number;
  recentBookings: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const USAGE_WINDOW_DAYS = 30;
const count = sql<number>`count(*)`.mapWith(Number);

async function first(query: Promise<{ total: number }[]>): Promise<number> {
  const [row] = await query;
  return row?.total ?? 0;
}

/** Usuarios activos, órdenes abiertas y reservas de los últimos 30 días de un taller. */
export async function usageCounts(db: AppDb, shopId: string, now: Date) {
  const since = new Date(now.getTime() - USAGE_WINDOW_DAYS * DAY_MS);
  const activeUsers = await first(
    db
      .select({ total: count })
      .from(users)
      .innerJoin(branches, eq(branches.id, users.branchId))
      .where(and(eq(branches.shopId, shopId), eq(users.isActive, true))),
  );
  const openOrders = await first(
    db
      .select({ total: count })
      .from(workOrders)
      .innerJoin(branches, eq(branches.id, workOrders.branchId))
      .where(
        and(
          eq(branches.shopId, shopId),
          isNull(workOrders.voidedAt),
          notInArray(workOrders.status, withLegacyStatuses(TERMINAL_STATUSES)),
        ),
      ),
  );
  const recentBookings = await first(
    db
      .select({ total: count })
      .from(bookings)
      .innerJoin(branches, eq(branches.id, bookings.branchId))
      .where(and(eq(branches.shopId, shopId), gte(bookings.createdAt, since))),
  );
  return { activeUsers, openOrders, recentBookings };
}

/** `null` sin la marca de plataforma; con ella, cada taller con sus conteos. */
export async function listShopsWithUsage(
  db: AppDb,
  actor: SessionUser,
  now: Date,
): Promise<ShopUsageRow[] | null> {
  if (actor.isPlatformAdmin !== true) return null;
  const rows = await db
    .select({ id: shops.id, slug: shops.slug, name: shops.name, status: shops.status })
    .from(shops)
    .orderBy(asc(shops.slug));
  const result: ShopUsageRow[] = [];
  for (const row of rows) {
    result.push({ ...row, ...(await usageCounts(db, row.id, now)) });
  }
  return result;
}

export type ShopStatus = "activo" | "suspendido";
export type ShopDetail = ShopUsageRow & { recentSales: number };
export type SetStatusResult =
  | { ok: true }
  | { ok: false; code: "forbidden" | "not_found" | "own_shop" };

async function shopOfBranch(db: AppDb, branchId: string): Promise<string | null> {
  const [row] = await db
    .select({ shopId: branches.shopId })
    .from(branches)
    .where(eq(branches.id, branchId))
    .limit(1);
  return row?.shopId ?? null;
}

/** Uso de un taller para `/plataforma/talleres/<id>`: solo conteos (BG-43). */
export async function shopUsage(
  db: AppDb,
  actor: SessionUser,
  shopId: string,
  now: Date,
): Promise<ShopDetail | null> {
  if (actor.isPlatformAdmin !== true) return null;
  const [shop] = await db
    .select({ id: shops.id, slug: shops.slug, name: shops.name, status: shops.status })
    .from(shops)
    .where(eq(shops.id, shopId))
    .limit(1);
  if (!shop) return null;
  const since = new Date(now.getTime() - USAGE_WINDOW_DAYS * DAY_MS);
  const recentSales = await first(
    db
      .select({ total: count })
      .from(sales)
      .innerJoin(branches, eq(branches.id, sales.branchId))
      .where(and(eq(branches.shopId, shopId), isNull(sales.voidedAt), gte(sales.createdAt, since))),
  );
  return { ...shop, ...(await usageCounts(db, shopId, now)), recentSales };
}

/**
 * Suspende o reactiva un taller (BG-43). Al suspender, revoca las sesiones abiertas de sus
 * usuarios. El administrador no puede suspender su propio taller: se quedaría sin acceso.
 */
export async function setShopStatus(
  db: AppDb,
  actor: SessionUser,
  shopId: string,
  status: ShopStatus,
  now: Date,
): Promise<SetStatusResult> {
  if (actor.isPlatformAdmin !== true) return { ok: false, code: "forbidden" };
  if (status === "suspendido" && (await shopOfBranch(db, actor.branchId)) === shopId) {
    return { ok: false, code: "own_shop" };
  }
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(shops)
      .set({ status, updatedAt: now })
      .where(eq(shops.id, shopId))
      .returning({ id: shops.id });
    if (updated.length === 0) return { ok: false, code: "not_found" } as const;
    if (status === "suspendido") {
      const members = tx
        .select({ id: users.id })
        .from(users)
        .innerJoin(branches, eq(branches.id, users.branchId))
        .where(eq(branches.shopId, shopId));
      await tx
        .update(adminSessions)
        .set({ revokedAt: now, updatedAt: now })
        .where(and(inArray(adminSessions.userId, members), isNull(adminSessions.revokedAt)));
    }
    return { ok: true } as const;
  });
}
