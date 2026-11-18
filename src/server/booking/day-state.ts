import type { AppDb } from "../db/client.ts";
import { readRange } from "./availability.ts";

type Tx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];

/** Estado de la fecha leído dentro de la transacción, ya con el lock tomado. */
export async function readDay(
  tx: Tx,
  serviceDate: string,
  excludeBookingId?: string,
  branchId?: string,
) {
  const range = await readRange(tx, serviceDate, serviceDate, excludeBookingId, branchId);
  return range(serviceDate);
}
