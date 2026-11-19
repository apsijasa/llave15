import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CreateBookingInput, createBooking } from "../../src/server/booking/create-booking.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { whatsappMessages } from "../../src/server/db/schema.ts";
import { sendReminders } from "../../src/server/email/reminders.ts";
import type { EmailMessage } from "../../src/server/email/transport.ts";
import type { BookingScope } from "../../src/server/shops/scope.ts";
import { listNotices, sendPendingReminders } from "../../src/server/whatsapp/service.ts";
import { createTestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

/** Martes 2026-09-15, 12:00 hora local. */
const NOW = new Date("2026-09-15T15:00:00.000Z");
const MANANA = "2026-09-16";

let db: AppDb;
let shops: Awaited<ReturnType<typeof seedTwoShops>>;

async function seedBooking(scope: BookingScope, overrides: Partial<CreateBookingInput> = {}) {
  const result = await createBooking(
    db,
    {
      mode: "taller",
      serviceDate: MANANA,
      start: "16:30",
      customerName: "Cliente",
      phoneE164: "+56933333333",
      email: null,
      bike: "Ruta Giant",
      description: "Mantención general",
      comuna: null,
      address: null,
      ipHash: null,
      whatsappConsent: true,
      ...overrides,
    },
    NOW,
    scope,
  );
  if (!result.ok) throw new Error(`no se creó la reserva: ${result.code}`);
  return result.booking;
}

describe("recordatorios y WhatsApp por sucursal", () => {
  beforeEach(async () => {
    const test = await createTestDb();
    db = test.db;
    shops = await seedTwoShops(db);
    vi.stubEnv("WHATSAPP_ENABLED", "true");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-only");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123456789");
    vi.stubEnv("WHATSAPP_REMINDER_TEMPLATE", "recordatorio_reserva");
    vi.stubEnv("WHATSAPP_READY_TEMPLATE", "bicicleta_lista");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("envía con el alcance de Vector Bikes solo los recordatorios de sus reservas de mañana", async () => {
    const { vector, demo } = shops;
    await seedBooking(vector.scope, { email: "vector@ejemplo.cl" });
    await seedBooking(demo.scope, { start: "10:00", email: "demo@ejemplo.cl" });
    const sent: EmailMessage[] = [];
    const transport = {
      send: async (message: EmailMessage) => {
        sent.push(message);
      },
    };
    expect(await sendReminders(db, NOW, { transport }, vector.scope)).toEqual({
      sent: 1,
      failed: 0,
    });
    expect(sent.map((message) => message.to)).toEqual(["vector@ejemplo.cl"]);
  });

  it("crea los avisos de WhatsApp del Taller Demo solo para sus reservas y con su sucursal", async () => {
    const { vector, demo } = shops;
    await seedBooking(vector.scope);
    const own = await seedBooking(demo.scope, { start: "10:00", phoneE164: "+56944444444" });
    const sender = async () => "wamid.prueba";
    const totals = await sendPendingReminders(db, NOW, sender, demo.scope);
    expect(totals).toEqual({ sent: 1, failed: 0, skipped: 0 });
    const rows = await db.select().from(whatsappMessages);
    expect(rows.map((row) => [row.bookingId, row.branchId])).toEqual([[own.id, demo.branch.id]]);
  });

  it("no devuelve avisos de una reserva de otro taller", async () => {
    const { vector, demo } = shops;
    const foreign = await seedBooking(demo.scope, { start: "10:00" });
    await sendPendingReminders(db, NOW, async () => "wamid.prueba", demo.scope);
    expect(await listNotices(db, foreign.id, demo.branch.id)).toHaveLength(1);
    expect(await listNotices(db, foreign.id, vector.branch.id)).toEqual([]);
  });
});
