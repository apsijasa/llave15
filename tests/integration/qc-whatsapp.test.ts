import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getEmailEnv } from "../../src/lib/env.ts";
import { log } from "../../src/lib/log.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { orderWhatsappNotices } from "../../src/server/db/schema-reports.ts";
import { auditLog, bikes, customers } from "../../src/server/db/schema-taller.ts";
import { bookings, branches, users } from "../../src/server/db/schema.ts";
import { submitQc } from "../../src/server/taller/qc.ts";
import { QC_CHECK_KEYS } from "../../src/server/taller/rules.ts";
import { type TestDb, createTestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-12T15:00:00Z");
let test: TestDb;
let actor: SessionUser;
let orderId: string;
const checks = Object.fromEntries(QC_CHECK_KEYS.map((key) => [key, { result: "ok", note: "" }]));
const emailSender = vi.fn(async () => {});
const whatsappSender = vi.fn(async () => "wamid.qc");

async function seedBooking() {
  const [booking] = await test.db
    .insert(bookings)
    .values({
      code: "QC-READY",
      mode: "taller",
      serviceDate: "2026-11-12",
      startsAt: NOW,
      endsAt: new Date("2026-11-12T16:00:00Z"),
      customerName: "Ana Pérez",
      phoneE164: "+56912345678",
      email: "ana@example.cl",
      bike: "Trek Marlin",
      description: "Mantención",
      consentAt: NOW,
      whatsappConsentAt: NOW,
      cancelTokenHash: "hash-qc",
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
      status: "en_progreso",
      requestedService: "Mantención",
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
  emailSender.mockClear();
  whatsappSender.mockClear();
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
    for (const personal of ["56912345678", "ana@example.cl", "Ana Pérez"])
      expect(logs).not.toContain(personal);
  } finally {
    await test?.close();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  }
});

const deps = () => ({
  transport: { send: emailSender },
  env: getEmailEnv(),
  siteUrl: "https://vectorbikes.cl",
  whatsappSender,
});

it("deshabilitado aprueba QC, envía correo y no crea avisos de WhatsApp", async () => {
  vi.stubEnv("WHATSAPP_ENABLED", "false");
  expect(await submitQc(test.db, actor, orderId, { checks }, NOW, deps())).toEqual({
    ok: true,
    status: "lista_para_retirar",
  });
  expect(emailSender).toHaveBeenCalledTimes(2);
  expect(whatsappSender).not.toHaveBeenCalled();
  expect(await test.db.select().from(orderWhatsappNotices)).toEqual([]);
  expect(log.info).toHaveBeenCalledWith(
    "whatsapp.skipped",
    expect.objectContaining({ kind: "order_ready", orderId }),
  );
});

it("habilitado envía WhatsApp después del commit y del correo", async () => {
  const sender = vi.fn(async () => {
    expect(emailSender).toHaveBeenCalledTimes(2);
    const [order] = await test.db.select().from(workOrders).where(eq(workOrders.id, orderId));
    expect(order).toMatchObject({ status: "lista_para_retirar", qcApprovedAt: NOW });
    const audit = await test.db.select().from(auditLog);
    expect(audit.map((row) => row.action)).toContain("notify.ready_for_pickup");
    return "wamid.qc";
  });
  expect(
    await submitQc(test.db, actor, orderId, { checks }, NOW, { ...deps(), whatsappSender: sender }),
  ).toEqual({ ok: true, status: "lista_para_retirar" });
  expect(sender).toHaveBeenCalledTimes(1);
  expect(await test.db.select().from(orderWhatsappNotices)).toMatchObject([
    { status: "sent", metaMessageId: "wamid.qc" },
  ]);
});

it("un fallo de WhatsApp conserva QC aprobado y el correo enviado", async () => {
  const sender = async () => {
    throw new Error("connection reset");
  };
  expect(
    await submitQc(test.db, actor, orderId, { checks }, NOW, { ...deps(), whatsappSender: sender }),
  ).toEqual({ ok: true, status: "lista_para_retirar" });
  const [order] = await test.db.select().from(workOrders).where(eq(workOrders.id, orderId));
  expect(order).toMatchObject({ status: "lista_para_retirar", qcApprovedAt: NOW });
  expect(emailSender).toHaveBeenCalledTimes(2);
  expect(await test.db.select().from(orderWhatsappNotices)).toMatchObject([{ status: "unknown" }]);
});

it("un error inesperado de persistencia del aviso tampoco cambia QC", async () => {
  await test.client.exec(
    "alter table order_whatsapp_notices add constraint test_reject_notice check (type <> 'ready')",
  );
  expect(await submitQc(test.db, actor, orderId, { checks }, NOW, deps())).toEqual({
    ok: true,
    status: "lista_para_retirar",
  });
  expect(emailSender).toHaveBeenCalledTimes(2);
  expect(whatsappSender).not.toHaveBeenCalled();
  expect(log.error).toHaveBeenCalledWith(
    "whatsapp.failed",
    expect.objectContaining({ kind: "order_ready", orderId }),
  );
});
