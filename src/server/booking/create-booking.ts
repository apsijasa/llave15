import { and, eq, gt, inArray, like, or, sql } from "drizzle-orm";
import type { AppDb } from "../db/client.ts";
import { isUniqueViolation } from "../db/client.ts";
import type { Booking } from "../db/schema.ts";
import { bookingBikes, bookingBlocks, bookingDays, bookings } from "../db/schema.ts";
import type { BookingScope } from "../shops/scope.ts";
import { singleShopScope } from "../shops/scope.ts";
import { readDay } from "./day-state.ts";
import { MAX_BIKES_PER_BOOKING } from "./rules.ts";
import type { BookingMode } from "./rules.ts";
import { checkStart } from "./slots.ts";
import { hashCancelToken, newCancelToken } from "./tokens.ts";

export type BookingSource = "web" | "telefono" | "whatsapp" | "presencial";

export type CreateBookingInput = {
  mode: BookingMode;
  serviceDate: string;
  start: string;
  customerName: string;
  phoneE164: string;
  email: string | null;
  bike: string;
  description: string;
  comuna: string | null;
  address: string | null;
  ipHash: string | null;
  whatsappConsent?: boolean;
  source?: BookingSource;
  /** De 1 a 3. Sin lista, la reserva es de una bici y se comporta como la de la web. */
  bikes?: { bike: string; description: string }[];
};

export type CreateBookingResult =
  | { ok: true; booking: Booking; cancelToken: string }
  | { ok: false; code: "slot_unavailable" | "phone_limit" };

type Tx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];

class BookingRejected extends Error {
  readonly code: "phone_limit" | "slot_unavailable";

  constructor(code: "phone_limit" | "slot_unavailable") {
    super(code);
    this.code = code;
  }
}

/** Prefijo del taller y sufijo `-n` por sucursal, incluidas las reservas canceladas. */
async function nextCode(tx: Tx, serviceDate: string, start: string, scope: BookingScope) {
  const base = `${scope.config.codePrefix}-${serviceDate.slice(2).replaceAll("-", "")}-${start.replace(":", "")}`;
  const [row] = await tx
    .select({ n: sql<number>`count(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.branchId, scope.branchId),
        or(eq(bookings.code, base), like(bookings.code, `${base}-%`)),
      ),
    );
  const n = Number(row?.n ?? 0);
  return n === 0 ? base : `${base}-${n + 1}`;
}

async function insertBooking(
  tx: Tx,
  input: CreateBookingInput,
  now: Date,
  slot: { blockStarts: string[]; startsAt: Date; endsAt: Date },
  cancelToken: string,
  scope: BookingScope,
): Promise<Booking> {
  const [booking] = await tx
    .insert(bookings)
    .values({
      branchId: scope.branchId,
      code: await nextCode(tx, input.serviceDate, input.start, scope),
      serviceDate: input.serviceDate,
      mode: input.mode,
      status: "confirmed",
      source: input.source ?? "web",
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      customerName: input.customerName,
      phoneE164: input.phoneE164,
      email: input.email,
      bikeCount: input.bikes?.length ?? 1,
      bike: input.bikes?.[0]?.bike ?? input.bike,
      description: input.bikes?.[0]?.description ?? input.description,
      comuna: input.comuna,
      address: input.address,
      pickupFeeClp: input.mode === "retiro" ? scope.config.pickupFeeClp : 0,
      consentAt: now,
      whatsappConsentAt: input.whatsappConsent === true ? now : null,
      cancelTokenHash: hashCancelToken(cancelToken),
      ipHash: input.ipHash,
    })
    .returning();

  if (!booking) {
    throw new Error("el insert de la reserva no devolvió fila");
  }

  await insertBookingChildren(tx, booking, input, slot.blockStarts, scope.branchId);
  return booking;
}

async function insertBookingChildren(
  tx: Tx,
  booking: Booking,
  input: CreateBookingInput,
  blockStarts: string[],
  branchId: string,
) {
  await tx.insert(bookingBlocks).values(
    blockStarts.map((blockStart) => ({
      branchId,
      bookingId: booking.id,
      serviceDate: input.serviceDate,
      blockStart: `${blockStart}:00`,
      isActive: true,
    })),
  );

  const extra = (input.bikes ?? []).slice(1);
  if (extra.length > 0) {
    await tx.insert(bookingBikes).values(
      extra.map((bike, index) => ({
        branchId,
        bookingId: booking.id,
        position: index + 2,
        bike: bike.bike,
        description: bike.description,
      })),
    );
  }
}

/**
 * Una lista vacía es lo mismo que no mandar lista: la reserva es de una bici, con los campos
 * sueltos. Más de `MAX_BIKES_PER_BOOKING` es un error de quien llama —la pantalla valida con zod
 * antes—, y conviene que se vea como tal y no como una violación de CHECK en medio del insert.
 */
function bikesOf(input: CreateBookingInput): CreateBookingInput["bikes"] {
  if (input.bikes === undefined || input.bikes.length === 0) return undefined;
  if (input.bikes.length > MAX_BIKES_PER_BOOKING) {
    throw new Error(`Una reserva lleva entre 1 y ${MAX_BIKES_PER_BOOKING} bicicletas.`);
  }
  return input.bikes;
}

async function lockDay(tx: Tx, serviceDate: string, branchId: string) {
  await tx.insert(bookingDays).values({ branchId, serviceDate }).onConflictDoNothing();
  await tx
    .select({ serviceDate: bookingDays.serviceDate })
    .from(bookingDays)
    .where(and(eq(bookingDays.branchId, branchId), eq(bookingDays.serviceDate, serviceDate)))
    .for("update");
}

async function checkPhone(tx: Tx, input: CreateBookingInput, now: Date, branchId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.phoneE164}))`);
  const [future] = await tx
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.branchId, branchId),
        eq(bookings.phoneE164, input.phoneE164),
        inArray(bookings.status, ["confirmed", "ready_for_pickup"]),
        gt(bookings.startsAt, now),
      ),
    )
    .limit(1);
  if (future) throw new BookingRejected("phone_limit");
}

async function createScopedBooking(
  tx: Tx,
  input: CreateBookingInput,
  now: Date,
  scope: BookingScope,
  cancelToken: string,
): Promise<CreateBookingResult> {
  await lockDay(tx, input.serviceDate, scope.branchId);
  await checkPhone(tx, input, now, scope.branchId);
  const day = await readDay(tx, input.serviceDate, undefined, scope.branchId);
  const slot = checkStart({
    date: input.serviceDate,
    mode: input.mode,
    now,
    start: input.start,
    bikeCount: input.bikes?.length ?? 1,
    config: scope.config,
    ...day,
  });
  if (!slot.ok) throw new BookingRejected("slot_unavailable");
  const booking = await insertBooking(tx, input, now, slot, cancelToken, scope);
  return { ok: true, booking, cancelToken };
}

/**
 * Escribe una reserva revalidando todas las reglas dentro de la transacción.
 * Orden de locks fijo: `booking_days` FOR UPDATE → advisory lock por teléfono.
 * Nada de red ni correos aquí dentro: se notifica después del commit.
 */
export async function createBooking(
  db: AppDb,
  input: CreateBookingInput,
  now: Date,
  scope?: BookingScope,
): Promise<CreateBookingResult> {
  const bikes = bikesOf(input);
  const booking = { ...input, bikes };
  const resolved = scope ?? (await singleShopScope(db));
  const cancelToken = newCancelToken();
  try {
    return await db.transaction((tx) =>
      createScopedBooking(tx, booking, now, resolved, cancelToken),
    );
  } catch (error) {
    if (error instanceof BookingRejected) return { ok: false, code: error.code };
    if (isUniqueViolation(error)) {
      return { ok: false, code: "slot_unavailable" };
    }
    throw error;
  }
}
