import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getEmailEnv } from "../../src/lib/env.ts";
import { createBooking } from "../../src/server/booking/create-booking.ts";
import { shops } from "../../src/server/db/schema-shops.ts";
import {
  notifyBookingCancelled,
  notifyBookingCreated,
  notifyBookingRescheduled,
} from "../../src/server/email/notifications.ts";
import { sendReminders } from "../../src/server/email/reminders.ts";
import { consoleOutbox } from "../../src/server/email/transport.ts";
import type { BookingScope } from "../../src/server/shops/scope.ts";
import { createTestDb, type TestDb } from "../helpers/pglite.ts";
import { DEMO_SHOP_PROFILE, VECTOR_BIKES_PROFILE } from "../helpers/shops.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const NOW = new Date("2026-09-15T12:00:00Z");
const PREVIOUS = { serviceDate: "2026-09-15", start: "10:00" };
const ENV = {
  ...getEmailEnv(),
  EMAIL_FROM: "Vector Bikes <reservas@send.vectorbikes.cl>",
  SHOP_NOTIFY_EMAIL: "legacy@example.test",
};

async function reserve(db: TestDb["db"], scope: BookingScope, start: string) {
  const result = await createBooking(
    db,
    {
      mode: "taller",
      serviceDate: "2026-09-16",
      start,
      customerName: "Ana Pérez",
      phoneE164: "+56933334444",
      email: "ana@example.test",
      bike: "Trek Marlin",
      description: "Mantención",
      comuna: null,
      address: null,
      ipHash: null,
    },
    NOW,
    scope,
  );
  if (!result.ok) throw new Error(`Reserva de prueba: ${result.code}`);
  return result;
}

function calendar() {
  return (consoleOutbox[0]?.attachments?.[0]?.content ?? "").replace(/\r?\n[ \t]/g, "");
}

describe("correos de reserva aislados por taller", () => {
  let test: TestDb;
  let seeded: Awaited<ReturnType<typeof seedTwoShops>>;

  beforeEach(async () => {
    consoleOutbox.length = 0;
    test = await createTestDb();
    seeded = await seedTwoShops(test.db);
    return () => test.close();
  });

  it("confirma con remitente, respuesta, cuerpo y calendario del Taller Demo", async () => {
    const { booking, cancelToken } = await reserve(test.db, seeded.demo.scope, "10:00");
    await notifyBookingCreated(booking, cancelToken, { env: ENV }, [], test.db);

    expect(consoleOutbox).toHaveLength(2);
    const customer = consoleOutbox[0];
    expect(customer?.from).toBe("Taller Demo · Llave 15 <reservas@send.vectorbikes.cl>");
    expect(customer?.replyTo).toBe(DEMO_SHOP_PROFILE.email);
    expect(customer?.to).toBe(booking.email);
    expect(customer?.subject).toBe(`Reserva confirmada ${booking.code} · Taller Demo`);
    for (const body of [customer?.text, customer?.html]) {
      expect(body).toContain(DEMO_SHOP_PROFILE.name);
      expect(body).toContain(DEMO_SHOP_PROFILE.addressShort);
      expect(body).toContain("Gestionado con Llave 15");
      expect(body).not.toContain(VECTOR_BIKES_PROFILE.name);
      expect(body).not.toContain(VECTOR_BIKES_PROFILE.addressShort);
    }
    expect(calendar()).toContain(`SUMMARY:Taller Demo · Reserva ${booking.code}`);
    expect(calendar()).toContain(
      `LOCATION:${DEMO_SHOP_PROFILE.streetAddress}\\, ${DEMO_SHOP_PROFILE.locality}`,
    );
    expect(calendar()).not.toContain(VECTOR_BIKES_PROFILE.streetAddress);
  });

  it("creación, cancelación y reprogramación copian solo al taller correspondiente", async () => {
    for (const [scope, start, profile] of [
      [seeded.demo.scope, "10:00", DEMO_SHOP_PROFILE],
      [seeded.vector.scope, "15:00", VECTOR_BIKES_PROFILE],
    ] as const) {
      const { booking, cancelToken } = await reserve(test.db, scope, start);
      consoleOutbox.length = 0;
      await notifyBookingCreated(booking, cancelToken, { env: ENV }, [], test.db);
      await notifyBookingCancelled({ ...booking, cancelledBy: "customer" }, { env: ENV }, test.db);
      await notifyBookingRescheduled(booking, PREVIOUS, { env: ENV }, [], test.db);
      expect(consoleOutbox.map((entry) => entry.to)).toEqual([
        booking.email,
        profile.notifyEmail,
        profile.notifyEmail,
        booking.email,
        profile.notifyEmail,
      ]);
      for (const entry of consoleOutbox) {
        expect(entry.replyTo).toBe(profile.email);
        expect(entry.from).toBe(`${profile.name} · Llave 15 <reservas@send.vectorbikes.cl>`);
        expect(entry.to).not.toBe(ENV.SHOP_NOTIFY_EMAIL);
      }
    }
  });

  it("conserva el asunto y texto de Vector Bikes y agrega solo el pie declarado", async () => {
    const { booking, cancelToken } = await reserve(test.db, seeded.vector.scope, "15:00");
    await notifyBookingCreated(booking, cancelToken, { env: ENV }, [], test.db);
    const customer = consoleOutbox[0];
    expect(customer?.subject).toBe(`Reserva confirmada ${booking.code} · Vector Bikes`);
    expect(customer?.text).toBe(
      [
        "Tu reserva está confirmada",
        "",
        "Hola Ana, te esperamos. Estos son los datos de tu reserva.",
        "",
        `Código: ${booking.code}`,
        "Fecha: miércoles 16 de septiembre de 2026",
        "Horario: 15:00 a 15:30 hrs",
        "Modalidad: Entrega en el taller",
        "Dirección del taller: Av. Kennedy 7666, Vitacura",
        "Bicicleta: Trek Marlin",
        "Qué necesita: Mantención",
        "",
        "El diagnóstico y los repuestos se cotizan en el taller. Si encontramos un problema extra, te llamamos antes de hacer cualquier trabajo que no estaba en tu descripción: te explicamos la solución y tú decides.",
        "Adjuntamos la reserva para tu calendario. Si no puedes venir, cancélala con el enlace de abajo para liberar el horario.",
        "",
        `Cancelar mi reserva: https://vectorbikes.cl/reservas/cancelar?token=${cancelToken}`,
        "",
        "Vector Bikes · Av. Kennedy 7666, Vitacura · info@vectorbikes.cl",
        "Vector Bikes · Gestionado con Llave 15",
      ].join("\n"),
    );
    expect(customer?.html).toContain('<table role="presentation"');
    expect(customer?.html).toContain("background:#F6F6F4");
    expect(customer?.html).toContain("Gestionado con Llave 15");
  });

  it("los recordatorios de cada sucursal usan su nombre y dirección", async () => {
    await reserve(test.db, seeded.demo.scope, "10:00");
    await reserve(test.db, seeded.vector.scope, "15:00");
    expect(await sendReminders(test.db, NOW)).toEqual({ sent: 2, failed: 0 });
    for (const [index, profile] of [DEMO_SHOP_PROFILE, VECTOR_BIKES_PROFILE].entries()) {
      const reminder = consoleOutbox[index];
      expect(reminder?.text).toContain(`Te recordamos tu reserva en ${profile.name}.`);
      expect(reminder?.text).toContain(profile.addressShort);
      expect(reminder?.html).toContain("Gestionado con Llave 15");
    }
    expect(consoleOutbox[0]?.text).not.toContain(VECTOR_BIKES_PROFILE.name);
  });

  it("sin perfil no manda una marca heredada para una sucursal desconocida", async () => {
    const { booking, cancelToken } = await reserve(test.db, seeded.demo.scope, "10:00");
    await expect(
      notifyBookingCreated(
        { ...booking, branchId: "00000000-0000-4000-8000-000000000000" },
        cancelToken,
        { env: ENV },
        [],
        test.db,
      ),
    ).rejects.toThrow();
    expect(consoleOutbox).toHaveLength(0);
  });

  it("el logo y las certificaciones ajenas no aparecen en el correo del Taller Demo", async () => {
    await test.db
      .update(shops)
      .set({
        logoKey: "shops/vector/logo.png",
        certifications: ["Certificación exclusiva Vector"],
      })
      .where(eq(shops.id, seeded.vector.shop.id));
    const { booking, cancelToken } = await reserve(test.db, seeded.demo.scope, "10:00");
    await notifyBookingCreated(booking, cancelToken, { env: ENV }, [], test.db);
    expect(consoleOutbox[0]?.html).not.toContain("Certificación exclusiva Vector");
    expect(consoleOutbox[0]?.html).not.toContain("/vector-bikes/logo");
  });
});
