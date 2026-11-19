import { DateTime } from "luxon";
import { TIMEZONE } from "../../booking/rules.ts";
import type { Booking } from "../../db/schema.ts";
import type { EmailBrand } from "../brand.ts";
import { formatClp, render } from "../templates.ts";
import type { BookingBikeLine, RenderedEmail } from "../templates.ts";

type Row = readonly [label: string, value: string];

function local(instant: Date): DateTime {
  return DateTime.fromJSDate(instant).setZone(TIMEZONE).setLocale("es-CL");
}

function formatDate(instant: Date): string {
  return local(instant).toFormat("cccc d 'de' LLLL 'de' yyyy");
}

function formatRange(booking: Booking): string {
  return `${local(booking.startsAt).toFormat("HH:mm")} a ${local(booking.endsAt).toFormat("HH:mm")} hrs`;
}

function scheduleRows(brand: EmailBrand, booking: Booking): Row[] {
  const rows: Row[] = [
    ["Código", booking.code],
    ["Fecha", formatDate(booking.startsAt)],
    ["Horario", formatRange(booking)],
  ];
  if (booking.mode === "retiro") {
    rows.push(["Modalidad", "Retiro a domicilio"]);
    rows.push(["Dirección de retiro", `${booking.address ?? ""}, ${booking.comuna ?? ""}`]);
    rows.push(["Retiro y entrega", formatClp(booking.pickupFeeClp)]);
  } else {
    rows.push(["Modalidad", "Entrega en el taller"]);
    rows.push(["Dirección del taller", brand.addressShort]);
  }
  return rows;
}

/**
 * Con una bicicleta, las dos filas de siempre. Con dos o tres, cada una con su número, igual que
 * en la pantalla del taller. El recargo del retiro no se repite: es uno por reserva.
 */
function bikeRows(booking: Booking, extra: BookingBikeLine[] = []): Row[] {
  if (extra.length === 0) {
    return [
      ["Bicicleta", booking.bike],
      ["Qué necesita", booking.description],
    ];
  }
  const all = [{ position: 1, bike: booking.bike, description: booking.description }, ...extra];
  return all.flatMap(({ position, bike, description }): Row[] => [
    [`Bicicleta ${position}`, bike],
    [`Qué necesita la bici ${position}`, description],
  ]);
}

function rescheduledRows(
  brand: EmailBrand,
  booking: Booking,
  previous: { serviceDate: string; start: string },
): Row[] {
  const previousDate = DateTime.fromISO(previous.serviceDate, { zone: TIMEZONE }).toJSDate();
  return [
    ["Fecha anterior", formatDate(previousDate)],
    ["Horario anterior", `${previous.start} hrs`],
    ...scheduleRows(brand, booking).map(
      ([label, value]): Row => [
        label === "Fecha" ? "Nueva fecha" : label === "Horario" ? "Nuevo horario" : label,
        value,
      ],
    ),
  ];
}

const EXTRA_WORK_NOTE =
  "El diagnóstico y los repuestos se cotizan en el taller. Si encontramos un problema extra, te llamamos antes de hacer cualquier trabajo que no estaba en tu descripción: te explicamos la solución y tú decides.";

/** Confirmación al cliente, con el enlace de cancelación de un solo uso. */
export function customerConfirmationEmail(
  brand: EmailBrand,
  booking: Booking,
  cancelUrl: string,
  extra: BookingBikeLine[] = [],
): RenderedEmail {
  const firstName = booking.customerName.split(" ")[0] ?? booking.customerName;
  return render(
    `Reserva confirmada ${booking.code} · ${brand.shopName}`,
    {
      heading: "Tu reserva está confirmada",
      intro: [`Hola ${firstName}, te esperamos. Estos son los datos de tu reserva.`],
      rows: [...scheduleRows(brand, booking), ...bikeRows(booking, extra)],
      notes: [
        EXTRA_WORK_NOTE,
        "Adjuntamos la reserva para tu calendario. Si no puedes venir, cancélala con el enlace de abajo para liberar el horario.",
      ],
      link: { label: "Cancelar mi reserva", href: cancelUrl },
    },
    brand,
  );
}

/** Aviso al taller de una reserva nueva, con los datos de contacto completos. */
export function shopNewBookingEmail(
  brand: EmailBrand,
  booking: Booking,
  extra: BookingBikeLine[] = [],
): RenderedEmail {
  return render(
    `Nueva reserva ${booking.code}`,
    {
      heading: "Nueva reserva",
      intro: ["Entró una reserva desde el sitio."],
      rows: [
        ...scheduleRows(brand, booking),
        ["Cliente", booking.customerName],
        ["Teléfono", booking.phoneE164],
        ["Correo", booking.email ?? "Sin correo"],
        ...bikeRows(booking, extra),
      ],
      notes: [],
    },
    brand,
  );
}

/** Cambio de horario al cliente, con la misma referencia y sin regenerar enlaces. */
export function bookingRescheduledEmail(
  brand: EmailBrand,
  booking: Booking,
  previous: { serviceDate: string; start: string },
  extra: BookingBikeLine[] = [],
): RenderedEmail {
  const firstName = booking.customerName.split(" ")[0] ?? booking.customerName;
  return render(
    `Cambiamos tu reserva · ${booking.code} · ${brand.shopName}`,
    {
      heading: "Cambiamos tu reserva",
      intro: [`Hola ${firstName}, estos son los datos actualizados de tu reserva.`],
      rows: [...rescheduledRows(brand, booking, previous), ...bikeRows(booking, extra)],
      notes: [
        EXTRA_WORK_NOTE,
        "Adjuntamos la reserva actualizada para tu calendario.",
        "Si no puedes venir, cancela con el enlace del correo de confirmación o responde este correo.",
      ],
    },
    brand,
  );
}

/** Aviso al taller del horario anterior, el nuevo y los datos de contacto. */
export function shopRescheduledEmail(
  brand: EmailBrand,
  booking: Booking,
  previous: { serviceDate: string; start: string },
  extra: BookingBikeLine[] = [],
): RenderedEmail {
  return render(
    `Reserva reprogramada ${booking.code}`,
    {
      heading: "Reserva reprogramada",
      intro: ["Se cambió la fecha o el horario de una reserva."],
      rows: [
        ...rescheduledRows(brand, booking, previous),
        ["Cliente", booking.customerName],
        ["Teléfono", booking.phoneE164],
        ["Correo", booking.email ?? "Sin correo"],
        ...bikeRows(booking, extra),
      ],
      notes: [],
    },
    brand,
  );
}

/** Recordatorio al cliente el día anterior. Sin enlace: el token solo existe en la confirmación. */
export function reminderEmail(
  brand: EmailBrand,
  booking: Booking,
  extra: BookingBikeLine[] = [],
): RenderedEmail {
  return render(
    `Recordatorio: tu reserva ${booking.code} es mañana · ${brand.shopName}`,
    {
      heading: "Te esperamos mañana",
      intro: [`Te recordamos tu reserva en ${brand.shopName}.`],
      rows: [...scheduleRows(brand, booking), ...bikeRows(booking, extra)],
      notes: [
        EXTRA_WORK_NOTE,
        "Si no puedes venir, cancela con el enlace del correo de confirmación o responde este correo.",
      ],
    },
    brand,
  );
}

/** Aviso al taller de una reserva cancelada. */
export function shopCancellationEmail(brand: EmailBrand, booking: Booking): RenderedEmail {
  const by = booking.cancelledBy === "admin" ? "el taller" : "el cliente";
  return render(
    `Reserva cancelada ${booking.code}`,
    {
      heading: "Reserva cancelada",
      intro: [`La reserva fue cancelada por ${by}. El horario quedó libre.`],
      rows: [
        ...scheduleRows(brand, booking),
        ["Cliente", booking.customerName],
        ["Teléfono", booking.phoneE164],
        ["Correo", booking.email ?? "Sin correo"],
      ],
      notes: [],
    },
    brand,
  );
}
