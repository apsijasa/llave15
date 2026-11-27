import { expect, it } from "vitest";
import {
  DEFAULT_TARGET_MARGIN_PCT,
  MAX_MARGIN_PCT,
  MAX_BILLABLE_HOURS,
  PRICE_TABLE_MARGINS,
  monthlyTotal,
  hourlyCost,
  laborCost,
  serviceCost,
  priceForMargin,
  marginOfPrice,
  priceTable,
} from "../../src/server/taller/costing-rules.ts";

it("exporta los límites decididos y suma los seis gastos", () => {
  expect([DEFAULT_TARGET_MARGIN_PCT, MAX_MARGIN_PCT, MAX_BILLABLE_HOURS]).toEqual([30, 90, 744]);
  expect(PRICE_TABLE_MARGINS).toEqual([20, 30, 40, 50]);
  expect(
    monthlyTotal({
      rentClp: 250000,
      utilitiesClp: 50000,
      wagesClp: 0,
      taxesClp: 20000,
      otherClp: 30000,
      suppliesClp: 50000,
    }),
  ).toBe(400000);
});
it.each([
  [400000, 100, 4000],
  [400000, 120, 3334],
  [0, 100, 0],
  [400000, 0, null],
  [400000, -1, null],
])("costo hora (%s, %s)", (total, hours, expected) => {
  expect(hourlyCost(total, hours)).toBe(expected);
});
it.each([
  [90, 4000, 6000],
  [50, 4000, 3334],
])("mano de obra (%s, %s)", (minutes, hourly, expected) => {
  expect(laborCost(minutes, hourly)).toBe(expected);
});
it("suma mano de obra e insumos", () => {
  expect(serviceCost({ minutes: 90, hourlyCostClp: 4000, suppliesClp: 3000 })).toEqual({
    laborClp: 6000,
    suppliesClp: 3000,
    costClp: 9000,
  });
});
it.each([
  [1500, 30, 2143, 2550],
  [9000, 30, 12858, 15301],
  [7000, 40, 11667, 13884],
  [10000, 90, 100000, 119000],
  [1500, 0, 1500, 1785],
  [0, 30, 0, 0],
])("precio (%s, %s)", (cost, margin, netClp, grossClp) => {
  expect(priceForMargin(cost, margin)).toEqual({ netClp, grossClp });
});
it.each([100, 101, 30.5, Number.NaN])("rechaza el margen %s", (margin) => {
  expect(() => priceForMargin(1000, margin)).toThrow(RangeError);
});
it.each([
  [1500, 2143, 30],
  [1500, 2500, 40],
  [9000, 35000, 74],
  [2000, 1500, -33],
  [1500, 0, null],
])("margen (%s, %s)", (cost, price, expected) => {
  expect(marginOfPrice(cost, price)).toBe(expected);
});
it("tabla de cuatro precios en orden", () => {
  expect(priceTable(1500)).toEqual([
    { marginPct: 20, netClp: 1875, grossClp: 2231 },
    { marginPct: 30, netClp: 2143, grossClp: 2550 },
    { marginPct: 40, netClp: 2500, grossClp: 2975 },
    { marginPct: 50, netClp: 3000, grossClp: 3570 },
  ]);
  expect(priceTable(1000, [0])).toEqual([{ marginPct: 0, netClp: 1000, grossClp: 1190 }]);
});
it.each([1500, 9000, 12345].flatMap((cost) => [20, 30, 40, 50].map((margin) => [cost, margin])))(
  "ida y vuelta (%s, %s)",
  (cost, margin) => {
    expect(marginOfPrice(cost, priceForMargin(cost, margin).netClp)).toBe(margin);
  },
);
