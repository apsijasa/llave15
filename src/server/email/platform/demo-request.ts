import { type EmailEnv, getEmailEnv } from "../../../lib/env.ts";
import { errorMessage, log } from "../../../lib/log.ts";
import { PLATFORM } from "../../../lib/platform.ts";
import type { AppDb } from "../../db/client.ts";
import {
  DEMO_MECHANICS_LABELS,
  type DemoRequestRow,
  platformAdminEmails,
} from "../../shops/demo-requests.ts";
import { platformSender } from "../brand.ts";
import { escapeHtml, type RenderedEmail } from "../templates.ts";
import { type EmailTransport, createTransport } from "../transport.ts";

type Row = readonly [label: string, value: string];

function renderPlain(subject: string, heading: string, intro: string[], rows: Row[]) {
  const paragraph = (text: string) =>
    `<p style="margin:0 0 12px;line-height:1.55">${escapeHtml(text)}</p>`;
  const table = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#515A64;font-size:12px;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 0;vertical-align:top">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const html = [
    '<!doctype html><html lang="es-CL"><body style="margin:0;background:#F5F4F1">',
    '<div style="max-width:560px;margin:0 auto;padding:24px;font-family:Inter,Arial,sans-serif;color:#171C22">',
    `<h1 style="font-size:20px;line-height:28px;margin:0 0 16px">${escapeHtml(heading)}</h1>`,
    intro.map(paragraph).join(""),
    rows.length > 0
      ? `<table role="presentation" style="border-collapse:collapse;border-top:1px solid #D9D9D9;border-bottom:1px solid #D9D9D9;margin:16px 0;width:100%">${table}</table>`
      : "",
    paragraph(`${PLATFORM.name} · ${PLATFORM.descriptor}`),
    "</div></body></html>",
  ].join("");
  const text = [heading, "", ...intro, "", ...rows.map(([l, v]) => `${l}: ${v}`), "", PLATFORM.name]
    .join("\n")
    .trim();
  return { subject, html, text } satisfies RenderedEmail;
}

function requestRows(request: DemoRequestRow): Row[] {
  const rows: Row[] = [
    ["Nombre", request.name],
    ["Taller", request.shopName],
    ["Ciudad", request.city],
    ["Correo", request.email],
    ["Teléfono", request.phone],
  ];
  if (request.mechanics) {
    rows.push([
      "Mecánicos",
      DEMO_MECHANICS_LABELS[request.mechanics as keyof typeof DEMO_MECHANICS_LABELS] ??
        request.mechanics,
    ]);
  }
  if (request.message) rows.push(["Mensaje", request.message]);
  return rows;
}

/** Aviso a los administradores de plataforma. */
export function demoRequestAdminEmail(request: DemoRequestRow, appUrl: string): RenderedEmail {
  return renderPlain(
    `Solicitud de demo: ${request.shopName}`,
    "Nueva solicitud de demo",
    [
      `${request.name} pidió una demo de ${PLATFORM.name}. Respóndele directo a este correo.`,
      `Lista completa: ${new URL("/plataforma/solicitudes", appUrl).href}`,
    ],
    requestRows(request),
  );
}

/** Acuse para quien pidió la demo. */
export function demoRequestAckEmail(request: DemoRequestRow): RenderedEmail {
  return renderPlain(
    `Recibimos tu solicitud · ${PLATFORM.name}`,
    "Recibimos tu solicitud",
    [
      `Hola ${request.name.split(" ")[0] ?? request.name}, gracias por tu interés en ${PLATFORM.name}.`,
      "Te contactaremos en los próximos días hábiles para coordinar la demo y contarte los planes.",
    ],
    [],
  );
}

export type DemoNotifyDeps = { env?: EmailEnv; transport?: EmailTransport; appUrl: string };

/**
 * Manda el aviso y el acuse después de guardar la solicitud (regla 6). Un fallo de envío se
 * registra y no se propaga: la solicitud ya quedó en `/plataforma/solicitudes`.
 */
export async function notifyDemoRequest(
  db: AppDb,
  request: DemoRequestRow,
  deps: DemoNotifyDeps,
): Promise<{ sent: number; failed: number }> {
  const env = deps.env ?? getEmailEnv();
  const admins = await platformAdminEmails(db);
  const from = platformSender(env.EMAIL_FROM);
  const adminTransport =
    deps.transport ?? createTransport({ ...env, EMAIL_FROM: from, EMAIL_REPLY_TO: request.email });
  const ackTransport =
    deps.transport ??
    createTransport({ ...env, EMAIL_FROM: from, EMAIL_REPLY_TO: PLATFORM.contactEmail });
  const jobs = [
    ...admins.map(
      (to) => () => adminTransport.send({ to, ...demoRequestAdminEmail(request, deps.appUrl) }),
    ),
    () => ackTransport.send({ to: request.email, ...demoRequestAckEmail(request) }),
  ];
  let sent = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await job();
      sent += 1;
    } catch (error) {
      failed += 1;
      log.error("demo_request.email_failed", { requestId: request.id, error: errorMessage(error) });
    }
  }
  if (admins.length === 0) log.warn("demo_request.no_platform_admin", { requestId: request.id });
  return { sent, failed };
}
