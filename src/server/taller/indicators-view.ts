import { DateTime } from "luxon";
import { formatClp } from "../email/templates.ts";
import type { DashboardIndicators, Range } from "./indicators-dashboard.ts";
import type { FinanceIndicators } from "./indicators-finance.ts";
import type { Indicators } from "./indicators.ts";

export type DeltaView = {
  text: string;
  direction: "up" | "down" | "flat" | "none";
  caption: string;
};
type Tile = { label: string; value: string; delta?: DeltaView; detail?: string; lines?: string[] };
type Row = { label: string; value: number; text: string; status?: string };
export type DashboardView = {
  rangeLabel: string;
  overview: ReturnType<typeof overviewView>;
  finance: ReturnType<typeof financeView>;
  pulse: ReturnType<typeof pulseView>;
  opportunities: ReturnType<typeof opportunitiesView>;
  control: ReturnType<typeof controlView>;
};

export const pct = (value: number) => `${Math.round(value)}%`;
export const oneDecimal = (value: number) =>
  value.toLocaleString("es-CL", { maximumFractionDigits: 1 });
const ratio = (value: number, total: number) => (total > 0 ? (value * 100) / total : 0);
const row = (label: string, value: number): Row => ({ label, value, text: String(value) });
function dayLabel(iso: string) {
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(DateTime.fromISO(iso, { zone: "UTC" }).toJSDate())
    .replace(/\./g, "");
}
export function rangeLabel(range: Range): string {
  const from = dayLabel(range.from);
  const fromYear = range.from.slice(0, 4);
  const toYear = range.to.slice(0, 4);
  return `${from}${fromYear !== toYear ? ` ${fromYear}` : ""} – ${dayLabel(range.to)} ${toYear}`;
}
export function deltaView(deltaPct: number | null): DeltaView {
  if (deltaPct === null)
    return { text: "Sin período anterior comparable", direction: "none", caption: "" };
  const rounded = Math.round(deltaPct);
  return {
    text:
      rounded > 0 ? `▲ +${pct(rounded)}` : rounded < 0 ? `▼ −${pct(Math.abs(rounded))}` : "= 0%",
    direction: rounded > 0 ? "up" : rounded < 0 ? "down" : "flat",
    caption: "vs. período anterior",
  };
}
function overviewView(i: Indicators, d: DashboardIndicators) {
  const tile = (label: string, delta: DashboardIndicators["headline"]["income"]): Tile => ({
    label,
    value: formatClp(delta.currentClp),
    delta: deltaView(delta.deltaPct),
  });
  const primary: Tile[] = [
    tile("Ingresos", d.headline.income),
    tile("Ticket promedio", d.headline.averageTicket),
    {
      label: "Trabajos abiertos",
      value: String(d.headline.openOrders.count),
      detail: `${d.headline.openOrders.avgDaysToClose} días promedio para cerrar`,
    },
    tile("Balance neto", d.headline.netBalance),
  ];
  const secondary: Tile[] = [
    {
      label: "Ritmo del taller",
      value: `${oneDecimal(d.rhythm.ordersPerActiveDay)} trabajos por día activo`,
    },
    {
      label: "Top 3 servicios por ingreso",
      value: "",
      lines: i.topServices.byAmount
        .slice(0, 3)
        .map((s) => `${s.description} · ${formatClp(s.amountClp)}`),
      detail: i.topServices.byAmount.length ? undefined : "Sin servicios en el período",
    },
    {
      label: "Clientes recurrentes",
      value: pct(ratio(i.customers.returningCount, i.customers.served)),
      detail: `${i.customers.returningCount} de ${i.customers.served} atendidos`,
    },
    {
      label: "Monto por revisar",
      value: formatClp(d.rhythm.amountToReview.totalClp),
      detail: `${d.rhythm.amountToReview.count} órdenes abiertas con saldo`,
    },
  ];
  return { primary, secondary };
}
function lineView(d: DashboardIndicators) {
  const days = d.daily.days;
  return {
    title: "Evolución diaria",
    points: days.map((p) => ({
      label: dayLabel(p.date),
      income: p.incomeClp,
      expenses: p.expensesClp,
    })),
    formatted: days.map((p) => ({
      label: dayLabel(p.date),
      income: formatClp(p.incomeClp),
      expenses: formatClp(p.expensesClp),
    })),
    incomeLabel: `Ingresos ${formatClp(days.reduce((sum, p) => sum + p.incomeClp, 0))}`,
    expensesLabel: `Gastos ${formatClp(days.reduce((sum, p) => sum + p.expensesClp, 0))}`,
    firstLabel: dayLabel(d.range.from),
    lastLabel: dayLabel(d.range.to),
  };
}
function mixView(f: FinanceIndicators) {
  const amounts = [f.mix.servicesClp, f.mix.partsClp, f.mix.counterSalesClp];
  const total = amounts.reduce((sum, value) => sum + value, 0);
  const exact = amounts.map((value) => ratio(value, total));
  const percentages = exact.map(Math.floor);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  const remaining = total > 0 ? 100 - percentages.reduce((sum, value) => sum + value, 0) : 0;
  for (const item of order.slice(0, remaining))
    percentages[item.index] = (percentages[item.index] ?? 0) + 1;
  return {
    title: "Mix de ingresos",
    center: formatClp(total),
    centerCaption: "Total",
    segments: ["Servicios", "Repuestos", "Ventas de mostrador"].map((label, index) => ({
      label,
      value: amounts[index] ?? 0,
      text: `${formatClp(amounts[index] ?? 0)} · ${percentages[index]}%`,
    })),
  };
}
function financeView(f: FinanceIndicators, d: DashboardIndicators) {
  const balance = f.balanceClp < 0 ? `−${formatClp(-f.balanceClp)}` : formatClp(f.balanceClp);
  return {
    stats: [
      { label: "Promedio diario", value: formatClp(d.daily.averageDailyIncomeClp) },
      {
        label: "Mejor día",
        value: d.daily.bestDay
          ? `${dayLabel(d.daily.bestDay.date)} · ${formatClp(d.daily.bestDay.incomeClp)}`
          : "Sin ingresos",
      },
      { label: "Días con movimiento", value: String(d.daily.activeDays) },
    ],
    line: lineView(d),
    mix: mixView(f),
    result: {
      title: "Resultado del período",
      center: pct(Math.max(0, ratio(f.balanceClp, f.income.netClp))),
      centerCaption: "Retenido",
      segments: [
        { label: "Balance", value: f.balanceClp, text: balance },
        { label: "Devoluciones", value: f.income.refundsClp, text: formatClp(f.income.refundsClp) },
        { label: "Gastos", value: f.expenses.totalClp, text: formatClp(f.expenses.totalClp) },
      ],
      footer: [
        { label: "Ingresos netos", value: formatClp(f.income.netClp) },
        { label: "Gastos / ingresos", value: pct(f.expenseRatioPct) },
        { label: "Balance", value: balance },
      ],
    },
  };
}
function pulseView(i: Indicators, d: DashboardIndicators) {
  const ages = ["0–3 días", "4–7 días", "8–14 días", "15+ días"];
  return {
    services: {
      title: "Servicios más comunes",
      rows: i.topServices.byQuantity.slice(0, 6).map((s) => row(s.description, s.quantity)),
      empty: "No hay servicios en este período",
    },
    weekday: { title: "Trabajos por día", bars: d.weekday.map((day) => row(day.label, day.count)) },
    statuses: {
      title: "Trabajos por estado",
      eyebrow: `${d.headline.openOrders.count} abiertos`,
      rows: i.openNow.map((s) => ({ ...row(s.label, s.count), status: s.status })),
    },
    ages: {
      title: "Antigüedad de abiertos",
      bars: d.ages.map((age, index) => row(ages[index] ?? age.label, age.count)),
    },
  };
}
function coverageDonut(title: string, value: number, label: string, centerCaption?: string) {
  return {
    title,
    center: pct(value),
    centerCaption,
    segments: [
      { label, value, text: pct(value) },
      { label: "Restante", value: Math.max(0, 100 - value), text: pct(Math.max(0, 100 - value)) },
    ],
  };
}
function opportunitiesView(i: Indicators, d: DashboardIndicators) {
  const a = d.approvals;
  const b = i.bookings;
  return {
    approvals: {
      title: "Adicionales",
      eyebrow: `${pct(a.conversionPct)} conversión`,
      rows: [
        row("Creados", a.created),
        row("Pendientes", a.pending),
        row("Aprobados", a.approved),
        row("Rechazados", a.rejected),
      ],
      footer: `Valor aceptado ${formatClp(a.acceptedValueClp)}`,
    },
    bookings: {
      title: "Agendamiento",
      eyebrow: `${pct(b.conversionPct)} conversión`,
      rows: [
        row("Recibidas", b.received),
        row("Pendientes", d.bookingsPending),
        row("Convertidas", b.converted),
        row("Canceladas", b.cancelled),
        row("No asistió", b.noShow),
      ],
    },
    clients: [
      { label: "Atendidos", value: String(i.customers.served) },
      { label: "Nuevos", value: String(i.customers.newCount) },
      { label: "Recurrentes", value: String(i.customers.returningCount) },
      { label: "Nuevos que volvieron", value: String(d.returnedNewCount) },
    ],
    returning: coverageDonut(
      "Clientes",
      ratio(i.customers.returningCount, i.customers.served),
      "Recurrentes",
      "Recurrentes",
    ),
  };
}
function controlView(i: Indicators, f: FinanceIndicators, d: DashboardIndicators) {
  const c = i.coverage;
  const inventory: { label: string; value: string; status?: string }[] = [
    { label: "Activos", value: String(f.inventory.activeCount) },
    { label: "Bajo mínimo", value: String(f.inventory.lowStockCount), status: "bajo" },
    { label: "Sin stock", value: String(f.inventory.outOfStockCount), status: "sin-stock" },
  ];
  if (f.inventory.valueAtCostClp !== undefined)
    inventory.push({ label: "Valor a costo", value: formatClp(f.inventory.valueAtCostClp) });
  return {
    checklist: coverageDonut(
      "Checklist y calidad",
      c.checklistCompletePct,
      "Checklist de ingreso",
      `sobre ${c.receivedCount} órdenes recibidas`,
    ),
    coverage: [
      { label: "Checklist de ingreso", value: pct(c.checklistCompletePct) },
      { label: "Control de calidad", value: pct(c.qcApprovedPct) },
      { label: "Informes compartidos", value: pct(c.reportsPct) },
    ],
    inventory,
    payment: {
      ...coverageDonut(
        "Registro de pago",
        d.paymentQuality.completePct,
        "Con pago registrado",
        "Completo",
      ),
      footer: [
        { label: "Sin pago registrado", value: String(d.paymentQuality.withoutPaymentCount) },
        { label: "Monto por revisar", value: formatClp(d.paymentQuality.amountToReviewClp) },
      ],
    },
  };
}
export function dashboardView(
  indicators: Indicators,
  finance: FinanceIndicators,
  dashboard: DashboardIndicators,
): DashboardView {
  return {
    rangeLabel: rangeLabel(dashboard.range),
    overview: overviewView(indicators, dashboard),
    finance: financeView(finance, dashboard),
    pulse: pulseView(indicators, dashboard),
    opportunities: opportunitiesView(indicators, dashboard),
    control: controlView(indicators, finance, dashboard),
  };
}
