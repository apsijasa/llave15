import { and, asc, eq, gte, isNull, notInArray, sql } from "drizzle-orm";
import type { SessionUser } from "../auth/admin-auth.ts";
import type { AppDb } from "../db/client.ts";
import { workOrders } from "../db/schema-orders.ts";
import { shops } from "../db/schema-shops.ts";
import { bookings, branches, users } from "../db/schema.ts";
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
          notInArray(workOrders.status, [...TERMINAL_STATUSES]),
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
