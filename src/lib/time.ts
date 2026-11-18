import { DateTime } from "luxon";

export const TIMEZONE = "America/Santiago";

/** Fecha local `YYYY-MM-DD` del instante dado. */
export function localToday(now: Date): string {
  return DateTime.fromJSDate(now).setZone(TIMEZONE).toFormat("yyyy-MM-dd");
}

/** Suma días sobre la fecha local, nunca sobre el instante. */
export function addDays(date: string, days: number): string {
  return DateTime.fromISO(date, { zone: TIMEZONE }).plus({ days }).toFormat("yyyy-MM-dd");
}

/** Instante de una hora local, o `null` si esa hora no existe (cambio de horario). */
export function localToInstant(date: string, hhmm: string): Date | null {
  const local = DateTime.fromISO(`${date}T${hhmm}`, { zone: TIMEZONE });
  if (!local.isValid || local.toFormat("HH:mm") !== hhmm) {
    return null;
  }
  return local.toJSDate();
}
