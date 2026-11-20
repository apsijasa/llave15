import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import {
  addDays,
  localToday,
  localToInstant,
  TIMEZONE,
  TIMEZONE as bookingTimezone,
  addDays as bookingAddDays,
  localToday as bookingLocalToday,
  localToInstant as bookingLocalToInstant,
} from "../../src/lib/time.ts";

function firstMissingHour(): { date: string; hhmm: string } | null {
  const september = DateTime.utc(2026, 9, 1);
  for (let day = 0; day < 30; day += 1) {
    const date = september.plus({ days: day }).toFormat("yyyy-MM-dd");
    for (let hour = 0; hour < 24; hour += 1) {
      const hhmm = `${String(hour).padStart(2, "0")}:00`;
      const candidate = `${date}T${hhmm}`;
      const local = DateTime.fromISO(candidate, { zone: "America/Santiago" });
      if (!local.isValid || local.toFormat("yyyy-MM-dd'T'HH:mm") !== candidate) {
        return { date, hhmm };
      }
    }
  }
  return null;
}

describe("helpers de tiempo compartidos", () => {
  it("exporta la zona y las tres funciones", () => {
    expect(TIMEZONE).toBe("America/Santiago");
    expect(localToday).toBeTypeOf("function");
    expect(addDays).toBeTypeOf("function");
    expect(localToInstant).toBeTypeOf("function");
  });

  it("obtiene la fecha local del instante aunque UTC ya esté en el día siguiente", () => {
    expect(localToday(new Date("2026-10-05T02:30:00Z"))).toBe("2026-10-04");
  });

  it("rechaza la primera hora local inexistente que Luxon encuentra en septiembre de 2026", () => {
    const missing = firstMissingHour();
    expect(missing).not.toBeNull();
    if (missing === null) {
      throw new Error("Luxon no encontró una hora local inexistente en septiembre de 2026");
    }
    console.info(`Hora local inexistente encontrada: ${missing.date} ${missing.hhmm}`);
    expect(localToInstant(missing.date, missing.hhmm)).toBeNull();
  });

  it("conserva la identidad de los reexportados del motor de reservas", () => {
    expect(bookingTimezone).toBe(TIMEZONE);
    expect(bookingLocalToday).toBe(localToday);
    expect(bookingAddDays).toBe(addDays);
    expect(bookingLocalToInstant).toBe(localToInstant);
  });
});
