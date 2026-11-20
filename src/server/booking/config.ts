import { z } from "zod";
import type { WeekHours, shops } from "../db/schema-shops.ts";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Ingresa una hora en HH:MM.");
const dayHoursSchema = z
  .strictObject({ open: timeSchema, close: timeSchema })
  .refine((hours) => hours.open < hours.close, {
    message: "La apertura debe ser anterior al cierre.",
    path: ["close"],
  })
  .nullable();

export const weekHoursSchema = z.strictObject({
  "1": dayHoursSchema,
  "2": dayHoursSchema,
  "3": dayHoursSchema,
  "4": dayHoursSchema,
  "5": dayHoursSchema,
  "6": dayHoursSchema,
  "7": dayHoursSchema,
});

export type BookingConfig = {
  blockMinutes: number;
  dailyCapacity: number;
  minNoticeMinutes: number;
  horizonDays: number;
  pickupEnabled: boolean;
  pickupFeeClp: number;
  pickupComunas: string[];
  receptionHours: WeekHours;
  pickupHours: WeekHours;
  codePrefix: string;
};

export function bookingConfigFromShop(
  row: Pick<typeof shops.$inferSelect, keyof BookingConfig>,
): BookingConfig {
  return {
    blockMinutes: row.blockMinutes,
    dailyCapacity: row.dailyCapacity,
    minNoticeMinutes: row.minNoticeMinutes,
    horizonDays: row.horizonDays,
    pickupEnabled: row.pickupEnabled,
    pickupFeeClp: row.pickupFeeClp,
    pickupComunas: [...row.pickupComunas],
    receptionHours: weekHoursSchema.parse(row.receptionHours),
    pickupHours: weekHoursSchema.parse(row.pickupHours),
    codePrefix: row.codePrefix,
  };
}
