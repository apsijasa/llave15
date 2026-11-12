import { DateTime } from "luxon";
import { SITE } from "../../lib/site.ts";
import { TIMEZONE } from "../booking/rules.ts";
import { formatClp, render } from "./templates.ts";
import type { EmailContent, RenderedEmail } from "./templates.ts";

export type QuoteEmail = {
  orderNumber: string;
  customerName: string;
  bike: string;
  items: { description: string; quantity: number; unitPriceClp: number }[];
  estimatedDeliveryDate: string | null;
  trackingUrl: string | null;
};

const EXTRA_WORK_NOTE =
  "El diagnóstico y los repuestos se cotizan en el taller. Si encontramos un problema extra, te llamamos antes de hacer cualquier trabajo que no estaba en tu descripción: te explicamos la solución y tú decides.";

export function quoteTotalClp(items: QuoteEmail["items"]): number {
  return items.reduce((total, item) => total + item.quantity * item.unitPriceClp, 0);
}

export function quoteEmail(input: QuoteEmail): RenderedEmail {
  const firstName = input.customerName.trim().split(/\s+/)[0] ?? "";
  const rows: EmailContent["rows"] = [
    ["Orden", input.orderNumber],
    ["Bicicleta", input.bike],
    ...input.items.map((item): EmailContent["rows"][number] => [
      item.description,
      `${item.quantity} × ${formatClp(item.unitPriceClp)}`,
    ]),
    ["Total", formatClp(quoteTotalClp(input.items))],
  ];
  if (input.estimatedDeliveryDate !== null) {
    const date = DateTime.fromISO(input.estimatedDeliveryDate, { zone: TIMEZONE })
      .setLocale("es-CL")
      .toFormat("d 'de' LLLL 'de' yyyy");
    rows.push(["Entrega estimada", date]);
  }
  // render aplica escapeHtml a las filas y al enlace una sola vez.
  return render(`Cotización · ${input.orderNumber} · ${SITE.name}`, {
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
  });
}
