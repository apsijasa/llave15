import { expect, it } from "vitest";
import { dashboardView, deltaView, rangeLabel } from "../../src/server/taller/indicators-view.ts";
import type { Indicators } from "../../src/server/taller/indicators.ts";
import type { FinanceIndicators } from "../../src/server/taller/indicators-finance.ts";
import type { DashboardIndicators } from "../../src/server/taller/indicators-dashboard.ts";

const range = { from: "2026-11-01", to: "2026-11-26" };
const indicators: Indicators = {
  range,
  income: { totalClp: 0, count: 0, byMethod: [] },
  payments: [],
  delivered: { count: 0, totalClp: 0, averageTicketClp: 0 },
  ordersCreated: { count: 0, byStatus: [] },
  openNow: [],
  topServices: { byQuantity: [], byAmount: [] },
  customers: { served: 4, newCount: 3, returningCount: 1 },
  bookings: { received: 0, cancelled: 0, noShow: 0, converted: 0, conversionPct: 0 },
  coverage: { receivedCount: 0, checklistCompletePct: 0, qcApprovedPct: 0, reportsPct: 0 },
};
const finance: FinanceIndicators = {
  range,
  income: { grossClp: 0, netClp: 0, refundsClp: 0 },
  pos: [],
  expenses: { totalClp: 0, byCategory: [] },
  balanceClp: 0,
  expenseRatioPct: 0,
  mix: { servicesClp: 1, partsClp: 1, counterSalesClp: 1 },
  inventory: { activeCount: 0, lowStockCount: 0, outOfStockCount: 0 },
};
const delta = { currentClp: 0, previousClp: 0, deltaPct: null };
const dashboard: DashboardIndicators = {
  range,
  previous: { from: "2026-10-06", to: "2026-10-31" },
  headline: {
    income: delta,
    averageTicket: delta,
    netBalance: delta,
    openOrders: { count: 0, avgDaysToClose: 0 },
  },
  rhythm: { activeDays: 2, ordersPerActiveDay: 1.5, amountToReview: { count: 0, totalClp: 0 } },
  daily: { days: [], averageDailyIncomeClp: 0, bestDay: null, activeDays: 0 },
  weekday: [],
  ages: [],
  approvals: {
    created: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    acceptedValueClp: 0,
    conversionPct: 0,
  },
  bookingsPending: 0,
  returnedNewCount: 0,
  paymentQuality: {
    deliveredCount: 0,
    withoutPaymentCount: 0,
    completePct: 0,
    amountToReviewClp: 0,
  },
};

it.each([
  [19, "▲ +19%", "up"],
  [-5, "▼ −5%", "down"],
  [0, "= 0%", "flat"],
  [0.3, "= 0%", "flat"],
  [-0.3, "= 0%", "flat"],
  [null, "Sin período anterior comparable", "none"],
] as const)("presenta delta %s con texto y dirección", (value, text, direction) => {
  expect(deltaView(value)).toEqual({
    text,
    direction,
    caption: value === null ? "" : "vs. período anterior",
  });
});

it("formatea el rango y el ritmo en español y protege el denominador cero", () => {
  const view = dashboardView(indicators, finance, dashboard);
  expect(rangeLabel(range)).toBe("1 nov – 26 nov 2026");
  expect(view.overview.secondary[0]?.value).toBe("1,5 trabajos por día activo");
  expect(view.finance.result.center).toBe("0%");
  expect(view.overview.secondary[2]?.detail).toBe("1 de 4 atendidos");
});

it("distribuye los porcentajes del mix hasta sumar 100 y usa cero sin ingresos", () => {
  const mix = dashboardView(indicators, finance, dashboard).finance.mix;
  expect(
    mix.segments.reduce((sum, segment) => sum + Number(segment.text.match(/(\d+)%/)?.[1]), 0),
  ).toBe(100);
  const empty = dashboardView(
    indicators,
    { ...finance, mix: { servicesClp: 0, partsClp: 0, counterSalesClp: 0 } },
    dashboard,
  );
  expect(empty.finance.mix.segments.every((segment) => segment.text.endsWith("0%"))).toBe(true);
});

function keys(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...keys(child)]);
}

it("omite costos no recibidos y solo presenta el valor autorizado del inventario", () => {
  const view = dashboardView(indicators, finance, dashboard);
  expect(keys(view).filter((key) => /cost|fee|net_clp/i.test(key))).toEqual([]);
  expect(view.control.inventory.some((row) => row.label === "Valor a costo")).toBe(false);
  const authorized = dashboardView(
    indicators,
    { ...finance, inventory: { ...finance.inventory, valueAtCostClp: 11900 } },
    dashboard,
  );
  expect(authorized.control.inventory).toContainEqual({ label: "Valor a costo", value: "$11.900" });
});

it.each([10000, 0, -10000])(
  "acota el retenido en pérdida con neto %s y conserva el saldo con signo Unicode",
  (netClp) => {
    const loss = dashboardView(
      indicators,
      {
        ...finance,
        income: { ...finance.income, netClp },
        balanceClp: -5000,
        expenses: { ...finance.expenses, totalClp: 15000 },
      },
      dashboard,
    ).finance.result;
    expect(loss.center).toBe("0%");
    expect(loss.footer).toContainEqual({ label: "Balance", value: "−$5.000" });
  },
);
