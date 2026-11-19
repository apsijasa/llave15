import { and, eq, sql } from "drizzle-orm";
import type { SessionUser } from "../auth/admin-auth.ts";
import type { AppDb } from "../db/client.ts";
import { workOrders } from "../db/schema-orders.ts";
import { bookings, branches } from "../db/schema.ts";

/**
 * Reservas de cualquier sucursal del taller de quien atiende (BG-D44): el prellenado de la
 * recepción las lee por taller, no por sucursal, como en la fase 1 entre sucursales del mismo taller.
 */
export function bookingInActorShop(actor: SessionUser) {
  return sql`${bookings.branchId} in (select ${branches.id} from ${branches} where ${branches.shopId} = (select ${branches.shopId} from ${branches} where ${branches.id} = ${actor.branchId}))`;
}

/**
 * Qué bici de la reserva toca recibir, o `null` si ya están todas. El join es a la izquierda: una
 * reserva sin ninguna orden todavía también tiene una bici pendiente, la primera.
 */
export async function nextBookingReception(db: AppDb, actor: SessionUser, bookingId: string) {
  const [booking] = await db
    .select({
      id: bookings.id,
      bikeCount: bookings.bikeCount,
      created: sql<number>`count(${workOrders.id})`,
    })
    .from(bookings)
    .leftJoin(
      workOrders,
      and(eq(workOrders.bookingId, bookings.id), eq(workOrders.branchId, actor.branchId)),
    )
    .where(and(eq(bookings.id, bookingId), eq(bookings.branchId, actor.branchId)))
    .groupBy(bookings.id, bookings.bikeCount);
  if (!booking || Number(booking.created) >= booking.bikeCount) return null;
  return { bookingId: booking.id, position: Number(booking.created) + 1, total: booking.bikeCount };
}
