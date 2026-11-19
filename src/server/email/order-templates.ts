import { DateTime } from "luxon";
import { TIMEZONE } from "../booking/rules.ts";
import { grossOfNet, VAT_RATE_PERCENT } from "../taller/rules.ts";
import type { PricingMode } from "../taller/rules.ts";
import type { EmailBrand } from "./brand.ts";
import { amountRows, pricingFromNet } from "./amounts.ts";
import { formatClp, render } from "./templates.ts";
import type { EmailContent, RenderedEmail } from "./templates.ts";

export type QuoteEmail = {
  orderNumber: string;
  customerName: string;
  bike: string;
  pricingMode?: PricingMode;
  items: { description: string; quantity: number; unitPriceClp: number }[];
  estimatedDeliveryDate: string | null;
  trackingUrl: string | null;
};

const EXTRA_WORK_NOTE =
  "El diagnóstico y los repuestos se cotizan en el taller. Si encontramos un problema extra, te llamamos antes de hacer cualquier trabajo que no estaba en tu descripción: te explicamos la solución y tú decides.";

export function quoteTotalClp(items: QuoteEmail["items"], mode: PricingMode = "final"): number {
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPriceClp, 0);
  return mode === "neto" ? grossOfNet(total) : total;
}

export function quoteEmail(brand: EmailBrand, input: QuoteEmail): RenderedEmail {
  const firstName = input.customerName.trim().split(/\s+/)[0] ?? "";
  const total = quoteTotalClp(input.items);
  const rows: EmailContent["rows"] = [
    ["Orden", input.orderNumber],
    ["Bicicleta", input.bike],
    ...input.items.map((item): EmailContent["rows"][number] => [
      item.description,
      `${item.quantity} × ${formatClp(item.unitPriceClp)}`,
    ]),
    ...amountRows("Total", total, pricingFromNet(input.pricingMode ?? "final", total)).map(
      ([label, amount]): EmailContent["rows"][number] => [label, formatClp(amount)],
    ),
  ];
  if (input.estimatedDeliveryDate !== null) {
    const date = DateTime.fromISO(input.estimatedDeliveryDate, { zone: TIMEZONE })
      .setLocale("es-CL")
      .toFormat("d 'de' LLLL 'de' yyyy");
    rows.push(["Entrega estimada", date]);
  }
  // render aplica escapeHtml a las filas y al enlace una sola vez.
  return render(
    `Cotización · ${input.orderNumber} · ${brand.shopName}`,
    {
      heading: "Tu cotización",
      intro: [
        `Hola ${firstName},`,
        "Este es el presupuesto de tu bicicleta. Si estás de acuerdo, respóndenos por este correo o por WhatsApp y empezamos.",
      ],
      rows,
      notes: [EXTRA_WORK_NOTE],
      ...(input.trackingUrl
        ? { link: { label: "Ver el estado de tu bicicleta", href: input.trackingUrl } }
        : {}),
    },
    brand,
  );
}

export function maintenanceReminderEmail(
  brand: EmailBrand,
  input: {
    orderNumber: string;
    customerName: string;
    bike: string;
    nextMaintenanceDate: string;
    note: string | null;
    bookingUrl: string;
  },
): RenderedEmail {
  const firstName = input.customerName.trim().split(/\s+/)[0] ?? "";
  const date = DateTime.fromISO(input.nextMaintenanceDate, { zone: TIMEZONE })
    .setLocale("es-CL")
    .toFormat("d 'de' LLLL 'de' yyyy");
  const rows: EmailContent["rows"] = [
    ["Bicicleta", input.bike],
    ["Fecha sugerida", date],
  ];
  if (input.note) rows.push(["Nota", input.note]);
  rows.push(["Última orden", input.orderNumber]);
  return render(
    `Se acerca la mantención de tu bicicleta · ${brand.shopName}`,
    {
      heading: "Se acerca la mantención de tu bicicleta",
      intro: [
        `Hola ${firstName},`,
        "Cuando revisamos tu bicicleta sugerimos una próxima mantención. Se acerca la fecha.",
      ],
      rows,
      notes: ["Si no quieres recibir este aviso, responde este correo y lo quitamos."],
      link: { label: "Reservar hora", href: input.bookingUrl },
    },
    brand,
  );
}

export function deliveryDateChangedEmail(
  brand: EmailBrand,
  input: {
    orderNumber: string;
    customerName: string;
    bike: string;
    previousDate: string | null;
    newDate: string;
    trackingUrl: string | null;
  },
): RenderedEmail {
  const firstName = input.customerName.trim().split(/\s+/)[0] ?? "";
  const formatDate = (date: string) =>
    DateTime.fromISO(date, { zone: TIMEZONE }).setLocale("es-CL").toFormat("d 'de' LLLL 'de' yyyy");
  const rows: EmailContent["rows"] = [
    ["Orden", input.orderNumber],
    ["Bicicleta", input.bike],
  ];
  if (input.previousDate !== null) rows.push(["Fecha anterior", formatDate(input.previousDate)]);
  rows.push(["Nueva fecha", formatDate(input.newDate)]);
  return render(
    `Cambiamos la fecha de entrega · ${input.orderNumber} · ${brand.shopName}`,
    {
      heading: "Cambiamos la fecha de entrega",
      intro: [`Hola ${firstName},`, "Actualizamos la fecha estimada de entrega de tu bicicleta."],
      rows,
      notes: ["Si la nueva fecha no te acomoda, responde este correo."],
      ...(input.trackingUrl
        ? { link: { label: "Ver el estado de tu bicicleta", href: input.trackingUrl } }
        : {}),
    },
    brand,
  );
}

export function partAddedEmail(
  brand: EmailBrand,
  input: {
    orderNumber: string;
    customerName: string;
    bike: string;
    item: { description: string; quantity: number; unitPriceClp: number };
    pricingMode: "final" | "neto";
    subtotalClp: number;
    vatClp: number;
    totalClp: number;
    trackingUrl: string | null;
  },
): RenderedEmail {
  const firstName = input.customerName.trim().split(/\s+/)[0] ?? "";
  const rows: EmailContent["rows"] = [
    ["Orden", input.orderNumber],
    ["Bicicleta", input.bike],
    [input.item.description, `${input.item.quantity} × ${formatClp(input.item.unitPriceClp)}`],
  ];
  if (input.pricingMode === "neto") {
    rows.push(
      ["Neto", formatClp(input.subtotalClp)],
      [`IVA (${VAT_RATE_PERCENT}%)`, formatClp(input.vatClp)],
      ["Total", formatClp(input.totalClp)],
    );
  } else rows.push(["Nuevo total", formatClp(input.totalClp)]);
  return render(
    `Agregamos un repuesto a tu orden · ${input.orderNumber} · ${brand.shopName}`,
    {
      heading: "Agregamos un repuesto a tu orden",
      intro: [`Hola ${firstName},`, "Agregamos este repuesto al trabajo de tu bicicleta."],
      rows,
      notes: ["Si tienes dudas sobre este repuesto, responde este correo."],
      ...(input.trackingUrl
        ? { link: { label: "Ver el estado de tu bicicleta", href: input.trackingUrl } }
        : {}),
    },
    brand,
  );
}
