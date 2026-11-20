import { addDays, localToday } from "../../lib/time.ts";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getEmailEnv } from "../../lib/env.ts";
import { errorMessage, log } from "../../lib/log.ts";
import type { AppDb } from "../db/client.ts";
import type { Booking } from "../db/schema.ts";
import { bookings } from "../db/schema.ts";
import { listBookingBikes } from "../booking/booking-bikes.ts";
import type { BookingScope } from "../shops/scope.ts";
import { profileForBranch } from "../shops/profile.ts";
import type { ShopProfile } from "../shops/profile.ts";
import { emailBrand, senderFor } from "./brand.ts";
import { reminderEmail } from "./booking/templates.ts";
import { createTransport, type EmailTransport } from "./transport.ts";

export type ReminderDeps = { transport: EmailTransport };

async function pendingReminders(db: AppDb, now: Date, scope?: BookingScope) {
  const tomorrow = addDays(localToday(now), 1);
  return db
    .select()
    .from(bookings)
    .where(
      and(
        inArray(bookings.status, ["confirmed", "ready_for_pickup"]),
        eq(bookings.serviceDate, tomorrow),
        isNull(bookings.reminderSentAt),
        isNotNull(bookings.email),
        scope === undefined ? undefined : eq(bookings.branchId, scope.branchId),
      ),
    )
    .orderBy(asc(bookings.startsAt));
}

async function reminderProfile(db: AppDb, branchId: string, cache: Map<string, ShopProfile>) {
  const cached = cache.get(branchId);
  if (cached) return cached;
  const profile = await profileForBranch(db, branchId);
  if (!profile) throw new Error("No se encontró el perfil del taller de la reserva.");
  cache.set(branchId, profile);
  return profile;
}

async function sendReminder(
  db: AppDb,
  booking: Booking,
  email: string,
  deps: ReminderDeps | undefined,
  profiles: Map<string, ShopProfile>,
) {
  const bikes = await listBookingBikes(db, booking.id);
  const profile = await reminderProfile(db, booking.branchId, profiles);
  const env = getEmailEnv();
  const transport =
    deps?.transport ??
    createTransport({
      ...env,
      EMAIL_FROM: senderFor(profile, env.EMAIL_FROM),
      EMAIL_REPLY_TO: profile.email,
    });
  const brand = { ...emailBrand(profile), certifications: profile.certifications };
  await transport.send({ to: email, ...reminderEmail(brand, booking, bikes) });
}

/** Recordatorios post-commit de mañana con la marca de cada sucursal, cacheada por corrida. */
export async function sendReminders(
  db: AppDb,
  now: Date,
  deps?: ReminderDeps,
  scope?: BookingScope,
): Promise<{ sent: number; failed: number }> {
  const pending = await pendingReminders(db, now, scope);
  const profiles = new Map<string, ShopProfile>();
  let sent = 0;
  let failed = 0;
  for (const booking of pending) {
    if (booking.email === null) {
      continue;
    }
    try {
      await sendReminder(db, booking, booking.email, deps, profiles);
    } catch (error) {
      failed += 1;
      log.error("email.failed", {
        kind: "reminder",
        code: booking.code,
        message: errorMessage(error),
      });
      continue;
    }
    await db
      .update(bookings)
      .set({ reminderSentAt: now })
      .where(and(eq(bookings.id, booking.id), isNull(bookings.reminderSentAt)));
    sent += 1;
  }
  return { sent, failed };
}
