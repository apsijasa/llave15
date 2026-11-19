import { DateTime } from "luxon";
import { TIMEZONE } from "../../booking/rules.ts";
import type { WeekHours } from "../../db/schema-shops.ts";
import type { ShopProfile } from "../../shops/profile.ts";
import type { PricingMode } from "../../taller/rules.ts";
import { amountRows, pricingFromNet } from "../amounts.ts";
import type { OrderPricing } from "../amounts.ts";
import { emailBrand } from "../brand.ts";
import type { EmailBrand } from "../brand.ts";
import { formatClp, render } from "../templates.ts";
import type { RenderedEmail } from "../templates.ts";

type Row = readonly [label: string, value: string];

export type GarageBrand = EmailBrand & {
  streetAddress: string;
  locality: string;
  receptionHours: WeekHours;
  certifications: readonly string[];
};

export function garageBrand(profile: ShopProfile): GarageBrand {
  return {
    ...emailBrand(profile),
    streetAddress: profile.streetAddress,
    locality: profile.locality,
    receptionHours: profile.receptionHours,
    certifications: profile.certifications,
  };
}

export type ReadyForPickup = {
  orderNumber: string;
  customerName: string;
  bike: string;
  totalClp: number;
  paidClp: number;
  pricing?: OrderPricing;
  trackingUrl?: string | null;
};

export type ReceivedBike = {
  orderNumber: string;
  customerName: string;
  bike: string;
  requestedService: string;
  pricingMode?: PricingMode;
  items: { description: string; quantity: number; unitPriceClp: number }[];
  accessories: string[];
  estimatedDeliveryDate: string | null;
  warrantyOfNumber: string | null;
  trackingUrl?: string | null;
};

/** Horario de retiro del taller, agrupando los días seguidos que coinciden. */
function receptionHours(hours: WeekHours): string[] {
  const names = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  const label = (day: number) => {
    const schedule = hours[String(day)];
    return schedule ? `${schedule.open} a ${schedule.close}` : "cerrado";
  };
  const groups: { from: number; to: number; hours: string }[] = [];
  for (let day = 1; day <= 7; day++) {
    const hours = label(day);
    const last = groups.at(-1);
    if (last && last.hours === hours) last.to = day;
    else groups.push({ from: day, to: day, hours });
  }
  return groups.map(({ from, to, hours }) => {
    const first = names[from - 1] ?? "";
    const last = names[to - 1] ?? "";
    const span = from === to ? first : `${first} a ${last}`;
    return `${capitalize(span)}${hours === "cerrado" ? " y feriados" : ""}: ${hours}`;
  });
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function receivedRows(order: ReceivedBike): Row[] {
  const rows: Row[] = [
    ["Orden", order.orderNumber],
    ["Bicicleta", order.bike],
    ["Servicio solicitado", order.requestedService],
  ];
  if (order.items.length > 0) {
    for (const item of order.items) {
      rows.push([item.description, `${item.quantity} × ${formatClp(item.unitPriceClp)}`]);
    }
    const total = order.items.reduce((sum, item) => sum + item.quantity * item.unitPriceClp, 0);
    rows.push(
      ...amountRows(
        "Total cotizado",
        total,
        pricingFromNet(order.pricingMode ?? "final", total),
      ).map(([label, amount]): Row => [label, formatClp(amount)]),
    );
  }
  if (order.accessories.length > 0) rows.push(["Accesorios", order.accessories.join(", ")]);
  if (order.estimatedDeliveryDate !== null) {
    const date = DateTime.fromISO(order.estimatedDeliveryDate, { zone: TIMEZONE })
      .setLocale("es-CL")
      .toFormat("d 'de' LLLL 'de' yyyy");
    rows.push(["Entrega estimada", date]);
  }
  return rows;
}

/** Resumen al cliente después de finalizar la recepción, sin datos internos. */
export function receivedBikeEmail(brand: GarageBrand, order: ReceivedBike): RenderedEmail {
  const firstName = order.customerName.trim().split(/\s+/)[0] ?? "";
  const rows = receivedRows(order);
  const notes = [];
  if (order.items.length === 0) notes.push("Te enviaremos el presupuesto después del diagnóstico.");
  if (order.warrantyOfNumber !== null) notes.push(`Orden de garantía de ${order.warrantyOfNumber}`);
  notes.push(
    "Si encontramos algo que no estaba en lo que pediste, te contactamos antes de hacerlo.",
  );
  return render(
    `Recibimos tu bicicleta · ${order.orderNumber} · ${brand.shopName}`,
    {
      heading: "Recibimos tu bicicleta",
      intro: [`Hola ${firstName},`, "Tu bicicleta quedó registrada en el taller."],
      rows,
      notes,
      ...(order.trackingUrl
        ? { link: { label: "Ver el estado de tu bicicleta", href: order.trackingUrl } }
        : {}),
    },
    brand,
  );
}

/** Aviso al cliente después de aprobar el control de calidad. */
export function readyForPickupEmail(brand: GarageBrand, order: ReadyForPickup): RenderedEmail {
  const firstName = order.customerName.split(" ")[0] ?? order.customerName;
  const hours = receptionHours(brand.receptionHours);
  return render(
    `Tu bicicleta está lista para retirar · ${order.orderNumber} · ${brand.shopName}`,
    {
      heading: "Tu bicicleta está lista para retirar",
      intro: [`Hola ${firstName}, tu bicicleta ya pasó el control de calidad. Te esperamos.`],
      rows: [
        ["Orden", order.orderNumber],
        ["Bicicleta", order.bike],
        ...amountRows("Total", order.totalClp, order.pricing).map(
          ([label, amount]): Row => [label, formatClp(amount)],
        ),
        ["Abonado", formatClp(order.paidClp)],
        [
          "Saldo",
          order.paidClp >= order.totalClp ? "Pagado" : formatClp(order.totalClp - order.paidClp),
        ],
      ],
      notes: [
        `Dirección del taller: ${brand.streetAddress}, ${brand.locality}.`,
        `Horario de retiro: ${hours.join("; ")}.`,
        "Puedes pagar con efectivo, transferencia o tarjeta.",
        "Si coordinamos la devolución a domicilio, te llamaremos para acordar la hora.",
      ],
      ...(order.trackingUrl
        ? { link: { label: "Ver el estado de tu bicicleta", href: order.trackingUrl } }
        : {}),
    },
    brand,
  );
}
