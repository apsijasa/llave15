import { grossOfNet } from "./rules.ts";

export const DEFAULT_TARGET_MARGIN_PCT = 30;
export const MAX_MARGIN_PCT = 90;
export const MAX_BILLABLE_HOURS = 744;
export const PRICE_TABLE_MARGINS = [20, 30, 40, 50] as const;
export type MonthlyCosts = {
  rentClp: number;
  utilitiesClp: number;
  wagesClp: number;
  taxesClp: number;
  otherClp: number;
  suppliesClp: number;
};
export type PriceRow = { marginPct: number; netClp: number; grossClp: number };

export function monthlyTotal(costs: MonthlyCosts): number {
  return (
    costs.rentClp +
    costs.utilitiesClp +
    costs.wagesClp +
    costs.taxesClp +
    costs.otherClp +
    costs.suppliesClp
  );
}
export function hourlyCost(totalClp: number, billableHours: number): number | null {
  return billableHours <= 0 ? null : Math.ceil(totalClp / billableHours);
}
export function laborCost(minutes: number, hourlyCostClp: number): number {
  return Math.ceil((minutes * hourlyCostClp) / 60);
}
export function serviceCost(input: {
  minutes: number;
  hourlyCostClp: number;
  suppliesClp: number;
}) {
  const laborClp = laborCost(input.minutes, input.hourlyCostClp);
  return { laborClp, suppliesClp: input.suppliesClp, costClp: laborClp + input.suppliesClp };
}
export function priceForMargin(costClp: number, marginPct: number) {
  if (!Number.isInteger(marginPct) || marginPct >= 100) throw new RangeError("Margen inválido");
  const netClp = Math.ceil((costClp * 100) / (100 - marginPct));
  return { netClp, grossClp: grossOfNet(netClp) };
}
export function marginOfPrice(costClp: number, priceNetClp: number): number | null {
  return priceNetClp <= 0 ? null : Math.round(((priceNetClp - costClp) * 100) / priceNetClp);
}
export function priceTable(
  costClp: number,
  margins: readonly number[] = PRICE_TABLE_MARGINS,
): PriceRow[] {
  return margins.map((marginPct) => ({ marginPct, ...priceForMargin(costClp, marginPct) }));
}
