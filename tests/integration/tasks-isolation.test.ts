import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleAlertsTask, handleRemindersTask } from "../../src/server/api/task-handlers.ts";
import { type CreateBookingInput, createBooking } from "../../src/server/booking/create-booking.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { shops as shopsTable } from "../../src/server/db/schema-shops.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { whatsappMessages } from "../../src/server/db/schema.ts";
import { sendReminders } from "../../src/server/email/reminders.ts";
import type { EmailMessage } from "../../src/server/email/transport.ts";
import { activeShopScopes, type BookingScope } from "../../src/server/shops/scope.ts";
import { handleWhatsAppCron } from "../../src/server/whatsapp/cron.ts";
import { createTestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

/** Martes 2026-09-15, 12:00 hora local. */
const NOW = new Date("2026-09-15T15:00:00.000Z");
const MANANA = "2026-09-16";
const SECRET = "tareas-secreto-de-prueba-0123456789abcdef";
const CRON = "cron-secreto-de-prueba-0123456789abcdef";

let db: AppDb;
let shops: Awaited<ReturnType<typeof seedTwoShops>>;

function taskRequest(path: string): Request {
  return new Request(`https://llave15.cl/api/tareas/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${SECRET}` },
  });
}

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

async function seedOverdueOrder(branchId: string, ownerId: string, number: number) {
  const [customer] = await db
    .insert(customers)
    .values({ branchId, name: `Cliente ${number}`, phoneE164: `+5697000000${number}` })
    .returning();
  if (!customer) throw new Error("Falta cliente");
  const [bike] = await db
    .insert(bikes)
    .values({ branchId, customerId: customer.id, brand: "Trek", model: "FX", bikeType: "urbana" })
    .returning();
  if (!bike) throw new Error("Falta bicicleta");
  await db.insert(workOrders).values({
    branchId,
    number,
    customerId: customer.id,
    bikeId: bike.id,
    status: "en_progreso",
    requestedService: "Mantención",
    estimatedDeliveryDate: "2026-09-10",
    createdBy: ownerId,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function suspend(shopId: string) {
  await db.update(shopsTable).set({ status: "suspendido" }).where(eq(shopsTable.id, shopId));
}

function collector() {
  const sent: EmailMessage[] = [];
  return {
    sent,
    transport: {
      send: async (message: EmailMessage) => {
        sent.push(message);
      },
    },
  };
}

describe("tareas diarias por taller activo", () => {
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

  it("activeShopScopes devuelve un alcance por taller activo, ordenado por slug", async () => {
    const scopes = await activeShopScopes(db);
    expect(scopes.map((scope) => [scope.slug, scope.branchId])).toEqual([
      ["taller-demo", shops.demo.branch.id],
      ["vector-bikes", shops.vector.branch.id],
    ]);
    await suspend(shops.demo.shop.id);
    expect((await activeShopScopes(db)).map((scope) => scope.slug)).toEqual(["vector-bikes"]);
  });

  it("envía en una sola llamada los recordatorios de los dos talleres, cada uno con su marca", async () => {
    await seedBooking(shops.vector.scope, { email: "vector@ejemplo.cl" });
    await seedBooking(shops.demo.scope, { start: "10:00", email: "demo@ejemplo.cl" });
    const { sent, transport } = collector();
    const send: typeof sendReminders = (database, now, _deps, scope) =>
      sendReminders(database, now, { transport }, scope);
    const response = await handleRemindersTask(taskRequest("recordatorios"), db, NOW, {
      secret: SECRET,
      send,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, sent: 2 });
    const byRecipient = new Map(sent.map((message) => [message.to, message]));
    expect(byRecipient.get("vector@ejemplo.cl")?.html).toContain("Vector Bikes");
    expect(byRecipient.get("demo@ejemplo.cl")?.html).toContain("Taller Demo");
    expect(byRecipient.get("demo@ejemplo.cl")?.html).not.toContain("Vector Bikes");
  });

  it("omite los recordatorios de un taller suspendido", async () => {
    await seedBooking(shops.vector.scope, { email: "vector@ejemplo.cl" });
    await seedBooking(shops.demo.scope, { start: "10:00", email: "demo@ejemplo.cl" });
    await suspend(shops.demo.shop.id);
    const { sent, transport } = collector();
    const send: typeof sendReminders = (database, now, _deps, scope) =>
      sendReminders(database, now, { transport }, scope);
    const response = await handleRemindersTask(taskRequest("recordatorios"), db, NOW, {
      secret: SECRET,
      send,
    });
    expect(await response.json()).toEqual({ ok: true, sent: 1 });
    expect(sent.map((message) => message.to)).toEqual(["vector@ejemplo.cl"]);
  });

  it("envía a cada taller activo solo sus órdenes atrasadas y omite el suspendido", async () => {
    await seedOverdueOrder(shops.vector.branch.id, shops.vector.owner.id, 1);
    await seedOverdueOrder(shops.demo.branch.id, shops.demo.owner.id, 1);
    const both = collector();
    const first = await handleAlertsTask(taskRequest("alertas"), db, NOW, {
      secret: SECRET,
      transport: both.transport,
    });
    expect(await first.json()).toMatchObject({ ok: true, overdue: 2, sent: true });
    expect(both.sent).toHaveLength(2);
    for (const message of both.sent) expect(message.text).toContain("Cliente 1");
    await suspend(shops.demo.shop.id);
    const one = collector();
    const second = await handleAlertsTask(taskRequest("alertas"), db, NOW, {
      secret: SECRET,
      transport: one.transport,
    });
    expect(await second.json()).toMatchObject({ ok: true, overdue: 1, sent: true });
    expect(one.sent).toHaveLength(1);
  });

  it("el cron de WhatsApp procesa cada taller activo con su sucursal y omite el suspendido", async () => {
    const vector = await seedBooking(shops.vector.scope);
    const demo = await seedBooking(shops.demo.scope, { start: "10:00", phoneE164: "+56944444444" });
    // El aviso cubre las 24 horas siguientes: el cron corre a las 18:00 para alcanzar las dos.
    const cronNow = new Date("2026-09-15T21:00:00.000Z");
    const call = () =>
      handleWhatsAppCron(
        new Request("https://llave15.cl/api/internal/whatsapp-reminders", {
          method: "POST",
          headers: { Authorization: `Bearer ${CRON}` },
        }),
        db,
        cronNow,
        CRON,
        async () => "wamid.prueba",
      );
    await suspend(shops.demo.shop.id);
    const suspended = await call();
    expect(await suspended.json()).toEqual({ sent: 1, failed: 0, skipped: 0 });
    await db
      .update(shopsTable)
      .set({ status: "activo" })
      .where(eq(shopsTable.id, shops.demo.shop.id));
    const both = await call();
    // Vector Bikes ya tiene su aviso: se omite; el del Taller Demo sale ahora.
    expect(await both.json()).toEqual({ sent: 1, failed: 0, skipped: 1 });
    const rows = await db.select().from(whatsappMessages);
    expect(rows.map((row) => [row.bookingId, row.branchId]).sort()).toEqual(
      [
        [vector.id, shops.vector.branch.id],
        [demo.id, shops.demo.branch.id],
      ].sort(),
    );
  });
});
