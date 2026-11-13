import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { log } from "../../src/lib/log.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { orderWhatsappNotices } from "../../src/server/db/schema-reports.ts";
import { auditLog, bikes, customers } from "../../src/server/db/schema-taller.ts";
import { bookings, branches, users } from "../../src/server/db/schema.ts";
import { notifyOrderReadyByWhatsApp } from "../../src/server/whatsapp/order-notices.ts";
import { postTemplate } from "../../src/server/whatsapp/service.ts";
import { type TestDb, createTestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-12T15:00:00Z");
let test: TestDb;
let actor: SessionUser;
let orderId: string;
const sender = vi.fn(async () => "wamid.order");

async function seedBooking() {
  const [booking] = await test.db
    .insert(bookings)
    .values({
      code: "ORDER-READY",
      mode: "taller",
      serviceDate: "2026-11-12",
      startsAt: NOW,
      endsAt: new Date("2026-11-12T16:00:00Z"),
      customerName: "Ana Pérez",
      phoneE164: "+56912345678",
      email: "ana@example.cl",
      bike: "Otra bicicleta de reserva",
      description: "Mantención",
      consentAt: NOW,
      whatsappConsentAt: NOW,
      cancelTokenHash: "hash-order-ready",
    })
    .returning();
  if (!booking) throw new Error("Falta reserva");
  return booking.id;
}

async function seedOrder() {
  const bookingId = await seedBooking();
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: actor.branchId,
      name: "Ana Pérez",
      phoneE164: "+56912345678",
      email: "ana@example.cl",
      rut: "12.345.678-5",
    })
    .returning();
  if (!customer) throw new Error("Falta cliente");
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: actor.branchId,
      customerId: customer.id,
      brand: "Trek",
      model: "Marlin",
      bikeType: "mtb",
    })
    .returning();
  if (!bike) throw new Error("Falta bici");
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: actor.branchId,
      number: 1,
      customerId: customer.id,
      bikeId: bike.id,
      bookingId,
      status: "lista_para_retirar",
      requestedService: "Mantención",
      qcApprovedAt: NOW,
      qcApprovedBy: actor.id,
      createdBy: actor.id,
    })
    .returning();
  if (!order) throw new Error("Falta orden");
  return order.id;
}

beforeEach(async () => {
  vi.stubEnv("WHATSAPP_ENABLED", "true");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-only");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123456789");
  vi.stubEnv("WHATSAPP_REMINDER_TEMPLATE", "recordatorio_reserva");
  vi.stubEnv("WHATSAPP_READY_TEMPLATE", "bicicleta_lista");
  vi.spyOn(log, "error").mockImplementation(() => {});
  vi.spyOn(log, "info").mockImplementation(() => {});
  vi.spyOn(log, "warn").mockImplementation(() => {});
  sender.mockClear();
  test = await createTestDb();
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta sucursal");
  const [user] = await test.db
    .insert(users)
    .values({
      branchId: branch.id,
      name: "Dueño",
      role: "owner",
      email: "owner@example.cl",
      passwordHash: "test",
    })
    .returning();
  if (!user) throw new Error("Falta usuario");
  actor = { ...user, role: "owner" };
  orderId = await seedOrder();
});

afterEach(async () => {
  try {
    const logs = JSON.stringify(
      [log.info, log.warn, log.error].map((fn) => vi.mocked(fn).mock.calls),
    );
    for (const personal of ["56912345678", "ana@example.cl", "12.345.678-5", "Ana Pérez"])
      expect(logs).not.toContain(personal);
  } finally {
    await test?.close();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  }
});

const notify = (who = actor) => notifyOrderReadyByWhatsApp(test.db, who, orderId, NOW, sender);

it("envía nombre, bici de la orden y número; guarda aceptación y auditoría", async () => {
  expect(await notify()).toEqual({ status: "sent" });
  expect(sender).toHaveBeenCalledExactlyOnceWith("56912345678", "bicicleta_lista", [
    "Ana",
    "Trek Marlin",
    "OT-00001",
  ]);
  expect(await test.db.select().from(orderWhatsappNotices)).toMatchObject([
    {
      branchId: actor.branchId,
      workOrderId: orderId,
      type: "ready",
      status: "sent",
      metaMessageId: "wamid.order",
      error: null,
      attempts: 1,
      claimedAt: NOW,
      sentAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
  const [audit] = await test.db.select().from(auditLog);
  expect(audit).toMatchObject({
    action: "notify.ready_whatsapp",
    entity: "work_order",
    entityId: orderId,
    actorUserId: actor.id,
  });
  expect(audit?.details).toEqual({ status: "sent" });
});

it("sin consentimiento omite el envío sin crear filas", async () => {
  await test.db.update(bookings).set({ whatsappConsentAt: null });
  expect(await notify()).toMatchObject({ status: "skipped" });
  expect(await test.db.select().from(orderWhatsappNotices)).toEqual([]);
  expect(sender).not.toHaveBeenCalled();
});

it("sin reserva omite el envío", async () => {
  await test.db.update(workOrders).set({ bookingId: null }).where(eq(workOrders.id, orderId));
  expect(await notify()).toMatchObject({ status: "skipped" });
  expect(await test.db.select().from(orderWhatsappNotices)).toEqual([]);
  expect(sender).not.toHaveBeenCalled();
});

it("deshabilitado no consulta la base", async () => {
  vi.stubEnv("WHATSAPP_ENABLED", "false");
  expect(await notifyOrderReadyByWhatsApp({} as AppDb, actor, orderId, NOW, sender)).toMatchObject({
    status: "skipped",
  });
  expect(sender).not.toHaveBeenCalled();
});

it.each(["en_reparacion", "control_calidad", "entregada"])(
  "omite orden en estado %s",
  async (status) => {
    await test.db.update(workOrders).set({ status }).where(eq(workOrders.id, orderId));
    expect(await notify()).toMatchObject({ status: "skipped" });
    expect(await test.db.select().from(orderWhatsappNotices)).toEqual([]);
    expect(sender).not.toHaveBeenCalled();
  },
);

it("omite otra sucursal, orden inexistente o anulada", async () => {
  expect(await notify({ ...actor, branchId: randomUUID() })).toMatchObject({ status: "skipped" });
  expect(await notifyOrderReadyByWhatsApp(test.db, actor, randomUUID(), NOW, sender)).toMatchObject(
    { status: "skipped" },
  );
  await test.db.update(workOrders).set({ voidedAt: NOW }).where(eq(workOrders.id, orderId));
  expect(await notify()).toMatchObject({ status: "skipped" });
  expect(await test.db.select().from(orderWhatsappNotices)).toEqual([]);
  expect(sender).not.toHaveBeenCalled();
});

it("rechazo HTTP 400 queda failed y puede reintentarse", async () => {
  const rejection = vi.fn(async () => {
    throw new Error("Meta rechazó la plantilla (HTTP 400)");
  });
  expect(await notifyOrderReadyByWhatsApp(test.db, actor, orderId, NOW, rejection)).toMatchObject({
    status: "failed",
  });
  expect(await test.db.select().from(orderWhatsappNotices)).toMatchObject([
    { status: "failed", attempts: 1 },
  ]);
  expect(log.error).toHaveBeenCalledWith("whatsapp.failed", {
    kind: "order_ready",
    orderId,
    message: "Meta rechazó la plantilla (HTTP 400)",
  });
  expect((await test.db.select().from(auditLog))[0]?.details).toEqual({ status: "failed" });
  expect(await notify()).toEqual({ status: "sent" });
  expect(await test.db.select().from(orderWhatsappNotices)).toMatchObject([
    { status: "sent", attempts: 2 },
  ]);
});

it.each([
  "connection reset",
  "Meta rechazó la plantilla (HTTP 500)",
  "Ana Pérez +56912345678 ana@example.cl 12.345.678-5",
])("con resultado incierto bloquea reintentos: %s", async (message) => {
  const failing = async () => {
    throw new Error(message);
  };
  expect(await notifyOrderReadyByWhatsApp(test.db, actor, orderId, NOW, failing)).toMatchObject({
    status: "failed",
    reason: expect.stringContaining("incierto"),
  });
  expect(await test.db.select().from(orderWhatsappNotices)).toMatchObject([
    { status: "unknown", attempts: 1 },
  ]);
  expect(await notify()).toMatchObject({ status: "skipped" });
  expect(sender).not.toHaveBeenCalled();
});

it("dos llamadas seguidas solo envían una vez", async () => {
  expect(await notify()).toEqual({ status: "sent" });
  expect(await notify()).toMatchObject({
    status: "skipped",
    reason: expect.stringContaining("Ya enviado"),
  });
  expect(sender).toHaveBeenCalledTimes(1);
  expect(await test.db.select().from(orderWhatsappNotices)).toHaveLength(1);
});

it("dos llamadas simultáneas solo reclaman un envío", async () => {
  const results = await Promise.all([notify(), notify()]);
  expect(results.map((r) => r.status).sort()).toEqual(["sent", "skipped"]);
  expect(sender).toHaveBeenCalledTimes(1);
  expect(await test.db.select().from(orderWhatsappNotices)).toMatchObject([{ attempts: 1 }]);
});

it("sending no se libera aunque claimed_at sea antiguo", async () => {
  await test.db.insert(orderWhatsappNotices).values({
    branchId: actor.branchId,
    workOrderId: orderId,
    type: "ready",
    status: "sending",
    attempts: 1,
    claimedAt: new Date("2026-11-11T15:00:00Z"),
  });
  expect(await notify()).toMatchObject({ status: "skipped" });
  expect(sender).not.toHaveBeenCalled();
});

it("postTemplate conserva el destinatario y los parámetros tal cual", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.meta" }] })));
  expect(
    await postTemplate("+56912345678", "bicicleta_lista", ["Ana", "Trek Marlin", "OT-00001"]),
  ).toBe("wamid.meta");
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  expect(String(url)).toBe("https://graph.facebook.com/v23.0/123456789/messages");
  expect(init?.headers).toMatchObject({ Authorization: "Bearer test-only" });
  const body = JSON.parse(String(init?.body));
  expect(body.to).toBe("+56912345678");
  expect(body.template.components[0].parameters).toEqual(
    ["Ana", "Trek Marlin", "OT-00001"].map((text) => ({ type: "text", text })),
  );
});
