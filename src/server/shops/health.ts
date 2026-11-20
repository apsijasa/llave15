import { and, eq, ne, sql } from "drizzle-orm";
import type { AppDb } from "../db/client.ts";
import { workOrders } from "../db/schema-orders.ts";
import { shops } from "../db/schema-shops.ts";
import { bookingBlocks, bookings, branches } from "../db/schema.ts";

/** Salud multi-taller (BG-39): solo conteos, nunca filas ni datos personales. */
export type PlatformHealth = {
  ok: boolean;
  shopsWithoutSingleBranch: number;
  blocksCrossBranch: number;
  ordersBookingCrossBranch: number;
};

const total = sql<number>`count(*)`.mapWith(Number);

/** Talleres activos con cero o más de una sucursal (un taller = una sucursal). */
async function shopsWithoutSingleBranch(db: AppDb): Promise<number> {
  const rows = await db
    .select({ id: shops.id, branchCount: sql<number>`count(${branches.id})`.mapWith(Number) })
    .from(shops)
    .leftJoin(branches, eq(branches.shopId, shops.id))
    .where(eq(shops.status, "activo"))
    .groupBy(shops.id);
  return rows.filter((row) => row.branchCount !== 1).length;
}

/** Bloques cuya sucursal no es la de su reserva. */
async function blocksCrossBranch(db: AppDb): Promise<number> {
  const [row] = await db
    .select({ total })
    .from(bookingBlocks)
    .innerJoin(bookings, eq(bookings.id, bookingBlocks.bookingId))
    .where(ne(bookingBlocks.branchId, bookings.branchId));
  return row?.total ?? 0;
}

/** Órdenes cuya reserva de origen es de otra sucursal. */
async function ordersBookingCrossBranch(db: AppDb): Promise<number> {
  const [row] = await db
    .select({ total })
    .from(workOrders)
    .innerJoin(bookings, eq(bookings.id, workOrders.bookingId))
    .where(and(ne(workOrders.branchId, bookings.branchId)));
  return row?.total ?? 0;
}

export async function platformHealth(db: AppDb): Promise<PlatformHealth> {
  const counts = {
    shopsWithoutSingleBranch: await shopsWithoutSingleBranch(db),
    blocksCrossBranch: await blocksCrossBranch(db),
    ordersBookingCrossBranch: await ordersBookingCrossBranch(db),
  };
  return { ok: Object.values(counts).every((count) => count === 0), ...counts };
}
