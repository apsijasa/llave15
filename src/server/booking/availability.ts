import type { SQL } from "drizzle-orm";
import { and, between, eq, ne, sql } from "drizzle-orm";
import type { AppDb } from "../db/client.ts";
import { blockedPeriods, bookingBlocks, bookings } from "../db/schema.ts";
import type { DayInput } from "./slots.ts";

export type DayData = Pick<DayInput, "activeBlockStarts" | "blocked" | "usedCount">;

const hhmm = (value: string | null) => (value === null ? null : value.slice(0, 5));

/**
 * Sin sucursal explícita: la única sucursal del único taller, resuelta dentro de cada consulta
 * para conservar las tres consultas fijas. Con dos talleres o dos sucursales no hay id y no
 * se lee ninguna fila: falla cerrada, nunca cruza talleres (BG-D41). `createBooking` sí lanza.
 */
const onlyBranch = sql`(select "id" from "branches" where (select count(*) from "shops") = 1 and (select count(*) from "branches") = 1)`;

type Branch = string | SQL;

function readBlocks(
  db: AppDb,
  from: string,
  to: string,
  branchId: Branch,
  excludeBookingId?: string,
) {
  return db
    .select({ serviceDate: bookingBlocks.serviceDate, blockStart: bookingBlocks.blockStart })
    .from(bookingBlocks)
    .where(
      and(
        eq(bookingBlocks.branchId, branchId),
        eq(bookingBlocks.isActive, true),
        between(bookingBlocks.serviceDate, from, to),
        excludeBookingId === undefined ? undefined : ne(bookingBlocks.bookingId, excludeBookingId),
      ),
    );
}

function readUsed(
  db: AppDb,
  from: string,
  to: string,
  branchId: Branch,
  excludeBookingId?: string,
) {
  return db
    .select({ serviceDate: bookings.serviceDate, n: sql<number>`sum(${bookings.bikeCount})` })
    .from(bookings)
    .where(
      and(
        eq(bookings.branchId, branchId),
        between(bookings.serviceDate, from, to),
        ne(bookings.status, "cancelled"),
        excludeBookingId === undefined ? undefined : ne(bookings.id, excludeBookingId),
      ),
    )
    .groupBy(bookings.serviceDate);
}

/**
 * Bloques activos, bloqueos y conteo de la sucursal en `[from, to]` en tres consultas fijas.
 * `excludeBookingId` deja fuera sus bloques y cupo para reprogramar la misma reserva.
 */
export async function readRange(
  db: AppDb,
  from: string,
  to: string,
  excludeBookingId?: string,
  branchId?: string,
): Promise<(date: string) => DayData> {
  const resolved: Branch = branchId ?? onlyBranch;
  const blocks = await readBlocks(db, from, to, resolved, excludeBookingId);
  const blocked = await db
    .select({
      serviceDate: blockedPeriods.serviceDate,
      startTime: blockedPeriods.startTime,
      endTime: blockedPeriods.endTime,
    })
    .from(blockedPeriods)
    .where(
      and(eq(blockedPeriods.branchId, resolved), between(blockedPeriods.serviceDate, from, to)),
    );
  const used = await readUsed(db, from, to, resolved, excludeBookingId);

  return (date) => ({
    activeBlockStarts: blocks
      .filter((row) => row.serviceDate === date)
      .map((row) => row.blockStart.slice(0, 5)),
    blocked: blocked
      .filter((row) => row.serviceDate === date)
      .map((row) => ({ startTime: hhmm(row.startTime), endTime: hhmm(row.endTime) })),
    usedCount: Number(used.find((row) => row.serviceDate === date)?.n ?? 0),
  });
}
