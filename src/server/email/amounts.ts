import { VAT_RATE_PERCENT, vatOfNet } from "../taller/rules.ts";
import type { PricingMode } from "../taller/rules.ts";

export type OrderPricing = { mode: PricingMode; subtotalClp: number; vatClp: number };

export function pricingFromNet(mode: PricingMode, netClp: number): OrderPricing {
  return { mode, subtotalClp: netClp, vatClp: vatOfNet(netClp) };
}

export function amountRows(
  totalLabel: string,
  totalClp: number,
  pricing?: OrderPricing,
): [label: string, amountClp: number][] {
  if (pricing?.mode !== "neto") return [[totalLabel, totalClp]];
  return [
    ["Neto", pricing.subtotalClp],
    [`IVA (${VAT_RATE_PERCENT}%)`, pricing.vatClp],
    [totalLabel, pricing.subtotalClp + pricing.vatClp],
  ];
}
