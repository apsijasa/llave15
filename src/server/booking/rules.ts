/**
 * Reglas genéricas de reserva. Los valores de cada taller (horarios, capacidad, antelación,
 * horizonte, retiro, tarifa, comunas y prefijo) viven en `shops` y llegan como `BookingConfig`.
 */

import type { BookingConfig } from "./config.ts";

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

/** Horario del día ISO de luxon (1 = lunes … 7 = domingo) para la modalidad, o `null`. */
export function hoursFor(config: BookingConfig, mode: BookingMode, weekday: number) {
  if (mode === "retiro" && !config.pickupEnabled) return null;
  const hours = mode === "retiro" ? config.pickupHours : config.receptionHours;
  return hours[String(weekday)] ?? null;
}
