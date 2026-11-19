import { createEvent } from "ics";
import { type EmailEnv, getEmailEnv, getSiteEnv } from "../../lib/env.ts";
import { errorMessage, log } from "../../lib/log.ts";
import { PLATFORM } from "../../lib/platform.ts";
import { SITE } from "../../lib/site.ts";
import type { AppDb } from "../db/client.ts";
import { profileForBranch } from "../shops/profile.ts";
import type { ShopProfile } from "../shops/profile.ts";
import { emailBrand, senderFor } from "./brand.ts";
import type { EmailBrand } from "./brand.ts";
import type { Booking } from "../db/schema.ts";
import type { OrderNoticeSender } from "../whatsapp/order-notices.ts";
import type { BookingBikeLine } from "./templates.ts";
import {
  bookingRescheduledEmail,
  customerConfirmationEmail,
  shopCancellationEmail,
  shopNewBookingEmail,
  shopRescheduledEmail,
} from "./booking/templates.ts";
import { escapeHtml } from "./templates.ts";
import type { RenderedEmail } from "./templates.ts";
import { type EmailMessage, type EmailTransport, createTransport } from "./transport.ts";

export type NotifyDeps = {
  env?: EmailEnv;
  transport?: EmailTransport;
  siteUrl?: string;
  whatsappSender?: OrderNoticeSender;
};

export const ICS_FILENAME = "reserva-vector-bikes.ics";

/**
 * El `.ics` original sale con `SEQUENCE: 0`. Para que el calendario mueva el evento en vez de
 * duplicarlo, cada reprogramación manda un número mayor: segundos desde una fecha fija, que crece
 * con el reloj y cabe de sobra en un entero de 32 bits. Dos reprogramaciones dentro del mismo
 * segundo compartirían el número, que es lo más cerca que se llega sin agregar una columna.
 */
const ICS_SEQUENCE_EPOCH_SECONDS = Date.UTC(2026, 0, 1) / 1000;

export function icsSequence(updatedAt: Date): number {
  return Math.max(1, Math.floor(updatedAt.getTime() / 1000 - ICS_SEQUENCE_EPOCH_SECONDS));
}

/** Evento de calendario en UTC; el cliente de correo lo muestra en la zona del usuario. */
export function buildIcs(
  booking: Booking,
  sequence = 0,
  profile?: Pick<ShopProfile, "name" | "streetAddress" | "locality">,
): string {
  const { error, value } = createEvent({
    uid: `${booking.code}@vectorbikes.cl`,
    sequence,
    productId: "vectorbikes/reservas",
    title: `${profile?.name ?? SITE.name} · Reserva ${booking.code}`,
    description: `Reserva ${booking.code}. Bicicleta: ${booking.bike}.`,
    location:
      booking.mode === "retiro"
        ? `${booking.address ?? ""}, ${booking.comuna ?? ""}`
        : `${profile?.streetAddress ?? SITE.streetAddress}, ${profile?.locality ?? SITE.locality}`,
    start: booking.startsAt.getTime(),
    startInputType: "utc",
    startOutputType: "utc",
    end: booking.endsAt.getTime(),
    endInputType: "utc",
    endOutputType: "utc",
    status: "CONFIRMED",
    busyStatus: "BUSY",
  });
  if (error || !value) {
    throw error ?? new Error("No se pudo generar el archivo de calendario.");
  }
  return value;
}

export function cancelUrlFor(cancelToken: string, siteUrl: string): string {
  const url = new URL("/reservas/cancelar", siteUrl);
  url.searchParams.set("token", cancelToken);
  return url.toString();
}

function message(to: string, email: RenderedEmail): EmailMessage {
  return { to, subject: email.subject, html: email.html, text: email.text };
}

/** Un correo que falla se registra y no impide enviar los demás. */
async function deliver(
  transport: EmailTransport,
  kind: string,
  code: string,
  outgoing: EmailMessage,
): Promise<void> {
  try {
    await transport.send(outgoing);
  } catch (error) {
    log.error("email.failed", { kind, code, message: errorMessage(error) });
  }
}

/**
 * Copia exacta al taller del correo que acaba de recibir el cliente: el mismo cuerpo, con una línea
 * que dice a quién se le envió. Va como mensaje aparte y no como CC, así el cliente no ve la
 * dirección del taller y la copia queda con su propio registro en el proveedor.
 *
 * Se llama solo después de que el envío al cliente salió bien. Un fallo acá se registra y no cambia
 * nada más: la operación ya está escrita y su auditoría depende del correo al cliente, no de esta
 * copia, que tampoco se reintenta.
 */
/**
 * La nota entra justo después de la apertura de `<body>`: `renderHtml` devuelve un documento
 * completo, así que anteponerla la dejaría antes del doctype, fuera del cuerpo y sin el estilo del
 * correo. Si algún día el cuerpo no trae `<body>`, se antepone, que es mejor que perderla.
 */
function withNote(html: string, note: string): string {
  const paragraph = `<p style="margin:0 0 12px;line-height:1.55">${escapeHtml(note)}</p>`;
  const body = /<body[^>]*>/.exec(html);
  if (!body) return `${paragraph}${html}`;
  const at = body.index + body[0].length;
  return `${html.slice(0, at)}${paragraph}${html.slice(at)}`;
}

export async function sendShopCopy(
  transport: EmailTransport,
  env: EmailEnv,
  customerEmail: string,
  email: RenderedEmail,
  orderCode: string,
): Promise<void> {
  const note = `Copia del correo enviado a ${customerEmail}.`;
  try {
    await transport.send({
      to: env.SHOP_NOTIFY_EMAIL,
      subject: `Copia · ${email.subject}`,
      text: `${note}\n\n${email.text}`,
      html: withNote(email.html, note),
    });
  } catch (error) {
    log.error("email.shop_copy_failed", { code: orderCode, message: errorMessage(error) });
  }
}

/** Sin base, solo la compatibilidad de BG-D45; con base nunca se inventa un perfil. */
async function bookingIdentity(booking: Booking, env: EmailEnv, db?: AppDb) {
  if (!db) {
    const brand: EmailBrand & { certifications: readonly string[] } = {
      shopName: SITE.name,
      replyTo: env.EMAIL_REPLY_TO,
      notifyEmail: env.SHOP_NOTIFY_EMAIL,
      phoneDisplay: SITE.phoneDisplay,
      addressShort: SITE.addressShort,
      logoPath: SITE.logoPath,
      footerLine: PLATFORM.footerLine,
      certifications: SITE.certifications,
    };
    return { brand, env, profile: undefined };
  }
  const profile = await profileForBranch(db, booking.branchId);
  if (!profile) throw new Error("No se encontró el perfil del taller de la reserva.");
  const brand = { ...emailBrand(profile), certifications: profile.certifications };
  return {
    brand,
    profile,
    env: { ...env, EMAIL_FROM: senderFor(profile, env.EMAIL_FROM), EMAIL_REPLY_TO: brand.replyTo },
  };
}

/** Post-commit: confirmación al cliente (con .ics y enlace de cancelación) y aviso al taller. */
export async function notifyBookingCreated(
  booking: Booking,
  cancelToken: string,
  deps: NotifyDeps = {},
  bikes: BookingBikeLine[] = [],
  db?: AppDb,
): Promise<void> {
  const { brand, env, profile } = await bookingIdentity(booking, deps.env ?? getEmailEnv(), db);
  const transport = deps.transport ?? createTransport(env);
  const siteUrl = deps.siteUrl ?? getSiteEnv().PUBLIC_SITE_URL;

  if (booking.email !== null) {
    const confirmation = message(
      booking.email,
      customerConfirmationEmail(brand, booking, cancelUrlFor(cancelToken, siteUrl), bikes),
    );
    confirmation.attachments = [
      {
        filename: ICS_FILENAME,
        content: buildIcs(booking, 0, profile),
        contentType: "text/calendar",
      },
    ];
    await deliver(transport, "confirmation", booking.code, confirmation);
  }
  await deliver(
    transport,
    "shop_new_booking",
    booking.code,
    message(brand.notifyEmail, shopNewBookingEmail(brand, booking, bikes)),
  );
}

/** Post-commit: aviso al taller de una cancelación. */
export async function notifyBookingCancelled(
  booking: Booking,
  deps: NotifyDeps = {},
  db?: AppDb,
): Promise<void> {
  const { brand, env } = await bookingIdentity(booking, deps.env ?? getEmailEnv(), db);
  const transport = deps.transport ?? createTransport(env);
  await deliver(
    transport,
    "shop_cancellation",
    booking.code,
    message(brand.notifyEmail, shopCancellationEmail(brand, booking)),
  );
}

/** Post-commit: cambio al cliente (con calendario actualizado) y aviso al taller. */
export async function notifyBookingRescheduled(
  booking: Booking,
  previous: { serviceDate: string; start: string },
  deps: NotifyDeps = {},
  bikes: BookingBikeLine[] = [],
  db?: AppDb,
): Promise<void> {
  const { brand, env, profile } = await bookingIdentity(booking, deps.env ?? getEmailEnv(), db);
  const transport = deps.transport ?? createTransport(env);
  if (booking.email !== null) {
    const rescheduled = message(
      booking.email,
      bookingRescheduledEmail(brand, booking, previous, bikes),
    );
    rescheduled.attachments = [
      {
        filename: ICS_FILENAME,
        content: buildIcs(booking, icsSequence(booking.updatedAt), profile),
        contentType: "text/calendar",
      },
    ];
    await deliver(transport, "rescheduled", booking.code, rescheduled);
  }
  await deliver(
    transport,
    "shop_rescheduled",
    booking.code,
    message(brand.notifyEmail, shopRescheduledEmail(brand, booking, previous, bikes)),
  );
}
