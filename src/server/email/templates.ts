import type { EmailBrand } from "./brand.ts";

export type RenderedEmail = { subject: string; html: string; text: string };

export type { ReadyForPickup, ReceivedBike } from "./garage/templates.ts";

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

function renderHtml(content: EmailContent, brand: RenderBrand): string {
  const name = brand.shopName;
  const address = brand.addressShort;
  const email = brand.replyTo;
  const certifications = brand.certifications ?? [];
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
    paragraph(`${brand.shopName} · ${brand.footerLine}`),
    "</div></body></html>",
  ].join("");
}

function renderText(content: EmailContent, brand: RenderBrand): string {
  const lines = [content.heading, "", ...content.intro, ""];
  for (const [label, value] of content.rows) {
    lines.push(`${label}: ${value}`);
  }
  lines.push("", ...content.notes);
  if (content.link) {
    lines.push("", `${content.link.label}: ${content.link.href}`);
  }
  lines.push("", `${brand.shopName} · ${brand.addressShort} · ${brand.replyTo}`);
  lines.push(`${brand.shopName} · ${brand.footerLine}`);
  return lines.join("\n");
}

export function render(subject: string, content: EmailContent, brand: RenderBrand): RenderedEmail {
  return { subject, html: renderHtml(content, brand), text: renderText(content, brand) };
}
