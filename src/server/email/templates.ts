import { DateTime } from "luxon";
import { SITE } from "../../lib/site.ts";
import { RECEPTION_HOURS, TIMEZONE } from "../booking/rules.ts";
import type { PricingMode } from "../taller/rules.ts";
import { amountRows, pricingFromNet } from "./amounts.ts";
import type { OrderPricing } from "./amounts.ts";
import type { EmailBrand } from "./brand.ts";

export type RenderedEmail = { subject: string; html: string; text: string };

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

type Row = readonly [label: string, value: string];

/** Contenido de un correo como datos: `render` escapa todo antes de armar el HTML. */
export type EmailContent = {
  heading: string;
  intro: string[];
  rows: Row[];
  notes: string[];
  link?: { label: string; href: string };
};

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export function formatClp(amount: number): string {
  return `$${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

export type BookingBikeLine = { position: number; bike: string; description: string };

type RenderBrand = EmailBrand & { certifications?: readonly string[] };

function renderHtml(content: EmailContent, brand?: RenderBrand): string {
  const name = brand?.shopName ?? SITE.name;
  const address = brand?.addressShort ?? SITE.addressShort;
  const email = brand?.replyTo ?? SITE.email;
  const certifications = brand ? (brand.certifications ?? []) : SITE.certifications;
  const paragraph = (text: string) =>
    `<p style="margin:0 0 12px;line-height:1.55">${escapeHtml(text)}</p>`;
  const rows = content.rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#5A5E63;font-size:12px;text-transform:uppercase;letter-spacing:.08em;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 0;vertical-align:top">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const link = content.link
    ? `<p style="margin:16px 0"><a href="${escapeHtml(content.link.href)}" style="color:#0C0D0E">${escapeHtml(content.link.label)}</a></p>`
    : "";
  return [
    '<!doctype html><html lang="es-CL"><body style="margin:0;background:#F6F6F4">',
    '<div style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#0C0D0E">',
    `<p style="margin:0 0 16px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#5A5E63">${escapeHtml(name)}</p>`,
    `<h1 style="margin:0 0 16px;font-size:22px;font-weight:600">${escapeHtml(content.heading)}</h1>`,
    content.intro.map(paragraph).join(""),
    `<table role="presentation" style="border-collapse:collapse;border-top:1px solid #D9D9D5;border-bottom:1px solid #D9D9D5;margin:16px 0;width:100%">${rows}</table>`,
    content.notes.map(paragraph).join(""),
    link,
    `<p style="margin:24px 0 0;font-size:13px;color:#5A5E63">${escapeHtml(`${name} · ${address} · ${email}`)}</p>`,
    certifications.length > 0 ? paragraph(`Certificaciones: ${certifications.join(" · ")}`) : "",
    brand ? paragraph(brand.footerLine) : "",
    "</div></body></html>",
  ].join("");
}

function renderText(content: EmailContent, brand?: RenderBrand): string {
  const lines = [content.heading, "", ...content.intro, ""];
  for (const [label, value] of content.rows) {
    lines.push(`${label}: ${value}`);
  }
  lines.push("", ...content.notes);
  if (content.link) {
    lines.push("", `${content.link.label}: ${content.link.href}`);
  }
  lines.push(
    "",
    `${brand?.shopName ?? SITE.name} · ${brand?.addressShort ?? SITE.addressShort} · ${brand?.replyTo ?? SITE.email}`,
  );
  if (brand) lines.push(brand.footerLine);
  return lines.join("\n");
}

export function render(subject: string, content: EmailContent, brand?: RenderBrand): RenderedEmail {
  return { subject, html: renderHtml(content, brand), text: renderText(content, brand) };
}

/** Horario de retiro desde `RECEPTION_HOURS`, agrupando los días seguidos que coinciden. */
function receptionHours(): string[] {
  const names = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  const label = (day: number) => {
    const schedule = RECEPTION_HOURS[day];
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

/** Resumen al cliente después de finalizar la recepción, sin datos internos. */
export function receivedBikeEmail(order: ReceivedBike): RenderedEmail {
  const firstName = order.customerName.trim().split(/\s+/)[0] ?? "";
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
  const notes = [];
  if (order.items.length === 0) notes.push("Te enviaremos el presupuesto después del diagnóstico.");
  if (order.warrantyOfNumber !== null) notes.push(`Orden de garantía de ${order.warrantyOfNumber}`);
  notes.push(
    "Si encontramos algo que no estaba en lo que pediste, te contactamos antes de hacerlo.",
  );
  return render(`Recibimos tu bicicleta · ${order.orderNumber} · ${SITE.name}`, {
    heading: "Recibimos tu bicicleta",
    intro: [`Hola ${firstName},`, "Tu bicicleta quedó registrada en el taller."],
    rows,
    notes,
    ...(order.trackingUrl
      ? { link: { label: "Ver el estado de tu bicicleta", href: order.trackingUrl } }
      : {}),
  });
}

/** Aviso al cliente después de aprobar el control de calidad. */
export function readyForPickupEmail(order: ReadyForPickup): RenderedEmail {
  const firstName = order.customerName.split(" ")[0] ?? order.customerName;
  const hours = receptionHours();
  return render(`Tu bicicleta está lista para retirar · ${order.orderNumber} · ${SITE.name}`, {
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
      `Dirección del taller: ${SITE.streetAddress}, ${SITE.locality}.`,
      `Horario de retiro: ${hours.join("; ")}.`,
      "Puedes pagar con efectivo, transferencia o tarjeta.",
      "Si coordinamos la devolución a domicilio, te llamaremos para acordar la hora.",
    ],
    ...(order.trackingUrl
      ? { link: { label: "Ver el estado de tu bicicleta", href: order.trackingUrl } }
      : {}),
  });
}
