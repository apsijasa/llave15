/** Reglas del negocio. Única fuente de verdad para horarios, capacidad y tarifas. */

import type { BookingConfig } from "./config.ts";

export { TIMEZONE } from "../../lib/time.ts";
export const BLOCK_MINUTES = 30;
export const DAILY_CAPACITY = 4;
export const MIN_NOTICE_MINUTES = 120;
export const HORIZON_DAYS = 30;
export const PICKUP_FEE_CLP = 15000;

export const PICKUP_COMUNAS = ["Vitacura", "Las Condes"] as const;

export const BLOCKS_PER_MODE = { taller: 1, retiro: 2 } as const;

export type BookingMode = keyof typeof BLOCKS_PER_MODE;

export const MAX_BIKES_PER_BOOKING = 3;

/**
 * Bloques que ocupa una reserva. El retiro son siempre dos, cuántas bicis sean: es un solo viaje
 * de ida y vuelta. En el taller cada bici necesita su bloque, y van seguidos.
 */
export function blocksFor(mode: BookingMode, bikeCount = 1): number {
  return mode === "retiro" ? BLOCKS_PER_MODE.retiro : Math.max(1, bikeCount);
}

/** Indexado por día ISO de luxon: 1 = lunes … 7 = domingo. */
export const RECEPTION_HOURS: Record<number, { open: string; close: string } | null> = {
  1: { open: "15:00", close: "20:00" },
  2: { open: "15:00", close: "20:00" },
  3: { open: "15:00", close: "20:00" },
  4: { open: "15:00", close: "20:00" },
  5: { open: "15:00", close: "20:00" },
  6: { open: "10:00", close: "14:00" },
  7: null,
};

export const PICKUP_HOURS: typeof RECEPTION_HOURS = {
  ...RECEPTION_HOURS,
  1: { open: "09:00", close: "20:00" },
  2: { open: "09:00", close: "20:00" },
  3: { open: "09:00", close: "20:00" },
  4: { open: "09:00", close: "20:00" },
  5: { open: "09:00", close: "20:00" },
};

export function hoursFor(mode: BookingMode, weekday: number, config?: BookingConfig) {
  if (mode === "retiro" && config?.pickupEnabled === false) return null;
  // Solo se importa el tipo: config.ts arma el legado con estas constantes sin ciclo en ejecución.
  const reception = config?.receptionHours ?? RECEPTION_HOURS;
  const pickup = config?.pickupHours ?? PICKUP_HOURS;
  return (mode === "retiro" ? pickup : reception)[weekday] ?? null;
}
