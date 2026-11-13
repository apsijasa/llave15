import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { log } from "../../src/lib/log.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { createBooking } from "../../src/server/booking/create-booking.ts";
import {
  intakeChecks,
  payments,
  workOrderItems,
  workOrders,
} from "../../src/server/db/schema-orders.ts";
import { serviceReports } from "../../src/server/db/schema-reports.ts";
import { bikes, customers, servicePrices, services } from "../../src/server/db/schema-taller.ts";
import { bookings, branches, users } from "../../src/server/db/schema.ts";
import {
  defaultRange,
  indicatorsRangeSchema,
  workshopIndicators,
} from "../../src/server/taller/indicators.ts";
import { addCatalogItem, addPartItem } from "../../src/server/taller/items.ts";
import { startReception } from "../../src/server/taller/orders.ts";
import { recordPayment, voidPayment } from "../../src/server/taller/payments.ts";
import {
  INTAKE_CHECK_KEYS,
  PAYMENT_METHODS,
  STATUS_LABELS,
} from "../../src/server/taller/rules.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";
const NOW = new Date("2026-11-12T15:00:00Z");
const START = new Date("2026-11-01T03:00:00Z");
const END = new Date("2026-11-13T03:00:00Z");
const OLD = new Date("2026-10-31T15:00:00Z");
const RANGE = { from: "2026-11-01", to: "2026-11-12" };
const PRIVATE = { email: "cliente@example.test", phoneE164: "+56912345678", rut: "12345678-5" };
let test: TestDb;
let owner: SessionUser;
let staff: SessionUser[];
let orders: string[];
type Person = { id: string; bikeId: string };
type Method = (typeof PAYMENT_METHODS)[number];
let clients: Person[];
async function actor(branchId: string, role: SessionUser["role"]): Promise<SessionUser> {
  const [row] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      name: role,
      email: `${randomUUID()}@example.test`,
      passwordHash: "hash",
    })
    .returning();
  if (!row) throw new Error("Falta usuario");
  return { ...row, role };
}
async function client(index: number, user = owner) {
  const [row] = await test.db
    .insert(customers)
    .values({
      branchId: user.branchId,
      name: `Cliente ${index}`,
      ...PRIVATE,
      rut: index === 0 ? PRIVATE.rut : null,
    })
    .returning();
  if (!row) throw new Error("Falta cliente");
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: user.branchId,
      customerId: row.id,
      brand: "Vector",
      model: "Prueba",
      bikeType: "mtb",
    })
    .returning();
  if (!bike) throw new Error("Falta bici");
  return { id: row.id, bikeId: bike.id };
}
async function order(number: number, person: Person, createdAt: Date, user = owner) {
  const [row] = await test.db
    .insert(workOrders)
    .values({
      branchId: user.branchId,
      number,
      customerId: person.id,
      bikeId: person.bikeId,
      status: "recibida",
      requestedService: "Revisión",
      createdBy: user.id,
      createdAt,
      updatedAt: NOW,
    })
    .returning();
  if (!row) throw new Error("Falta orden");
  return row.id;
}
async function service(orderId: string, name: string, price: number, quantity: number) {
  const [row] = await test.db
    .insert(services)
    .values({
      branchId: owner.branchId,
      name,
      estimatedMinutes: 30,
    })
    .returning();
  if (!row) throw new Error("Falta servicio");
  await test.db
    .insert(servicePrices)
    .values({ branchId: owner.branchId, serviceId: row.id, bikeType: "mtb", priceClp: price });
  expect(
    (await addCatalogItem(test.db, owner, orderId, { serviceId: row.id, quantity }, NOW)).ok,
  ).toBe(true);
}
async function pay(id: string, amount: number, method: Method, at = NOW, user = owner) {
  const input = { kind: "final", method, amountClp: amount };
  const result = await recordPayment(test.db, user, id, input, at);
  if (!result.ok) throw new Error(result.code);
  return result.paymentId;
}
async function updateOrder(id: string, changes: Partial<typeof workOrders.$inferInsert>) {
  await test.db
    .update(workOrders)
    .set({ ...changes, updatedAt: NOW })
    .where(eq(workOrders.id, id));
}
async function seedBookings() {
  const ids: string[] = [];
  for (const start of ["15:00", "15:30"]) {
    const result = await createBooking(
      test.db,
      {
        mode: "taller",
        serviceDate: "2026-11-12",
        start,
        customerName: "Cliente reserva",
        phoneE164: start === "15:00" ? "+56911111111" : "+56922222222",
        email: null,
        bike: "Vector Prueba",
        description: "Revisión",
        comuna: null,
        address: null,
        ipHash: null,
      },
      OLD,
    );
    if (!result.ok) throw new Error(result.code);
    ids.push(result.booking.id);
  }
  const person = clients[2];
  if (!person) throw new Error("Falta cliente");
  const result = await startReception(
    test.db,
    owner,
    {
      bookingId: ids[0],
      customerId: person.id,
      bikeId: person.bikeId,
      requestedService: "Revisión",
    },
    NOW,
  );
  if (!result.ok) throw new Error(result.code);
  orders.push(result.orderId);
  await test.db
    .update(bookings)
    .set({ status: "cancelled", updatedAt: NOW })
    .where(eq(bookings.id, ids[1] ?? ""));
}
async function seedFinance() {
  const [old, delivered, open] = orders as [string, string, string];
  await service(old, "Fuera del rango", 10000, 1);
  await service(delivered, "Especial", 6001, 1);
  await service(open, "Habitual", 2500, 3);
  const part = { description: "Repuesto", quantity: 1, unitPriceClp: 1500 };
  expect((await addPartItem(test.db, owner, open, part, NOW)).ok).toBe(true);
  const voided = await pay(open, 700, "otro");
  expect(await voidPayment(test.db, owner, voided, NOW)).toEqual({ ok: true });
  await pay(old, 2000, "otro", new Date(START.getTime() - 1));
  await pay(old, 1000, "efectivo");
  await pay(old, 7000, "otro", END);
  await pay(delivered, 1000, "transferencia", START);
  await pay(delivered, 5001, "tarjeta", new Date(END.getTime() - 1));
  await pay(open, 500, "otro");
  for (const id of [old, delivered])
    await updateOrder(id, { status: "entregada", deliveredAt: NOW, qcApprovedAt: NOW });
}
async function seedCoverage() {
  for (const [index, id] of orders.slice(1, 3).entries()) {
    await updateOrder(id, { receivedAt: START });
    await test.db.insert(intakeChecks).values(
      INTAKE_CHECK_KEYS.slice(0, index === 0 ? 7 : 6).map((itemKey) => ({
        branchId: owner.branchId,
        workOrderId: id,
        itemKey,
        result: "ok",
        createdBy: owner.id,
      })),
    );
  }
  await test.db.insert(serviceReports).values({
    branchId: owner.branchId,
    workOrderId: orders[1] as string,
    generatedAt: NOW,
    generatedBy: owner.id,
    shareTokenHash: randomUUID(),
    snapshot: {},
  });
}
beforeEach(async () => {
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(log, level);
  test = await createTestDb();
  const [branch] = await test.db
    .insert(branches)
    .values({ name: "Vitacura", nextOrderNumber: 4 })
    .returning();
  if (!branch) throw new Error("Falta sucursal");
  owner = await actor(branch.id, "owner");
  staff = await Promise.all([
    actor(branch.id, "reception"),
    actor(branch.id, "mechanic"),
    actor(branch.id, "admin"),
  ]);
  clients = await Promise.all([client(0), client(1), client(2)]);
  orders = [];
  for (const [index, at] of [OLD, START, NOW].entries()) {
    const person = clients[index === 2 ? 1 : 0];
    if (!person || !at) throw new Error("Falta fixture");
    orders.push(await order(index + 1, person, at));
  }
  await seedBookings();
  await seedFinance();
  await seedCoverage();
  return () => test.close();
});
afterEach(() => {
  for (const level of ["info", "warn", "error"] as const) {
    const calls = JSON.stringify(vi.mocked(log[level]).mock.calls);
    for (const secret of [...Object.values(PRIVATE), owner?.email])
      if (secret) expect(calls).not.toContain(secret);
  }
  vi.restoreAllMocks();
});
it("recepción y mecánico reciben null sin ninguna consulta", async () => {
  const select = vi.spyOn(test.db, "select");
  for (const user of staff.slice(0, 2))
    expect(await workshopIndicators(test.db, user, RANGE, NOW)).toBeNull();
  expect(select).not.toHaveBeenCalled();
});
it("usa mes y día locales y valida hasta 366 fechas inclusivas", () => {
  expect(defaultRange(NOW)).toEqual(RANGE);
  for (const range of [
    { from: RANGE.to, to: RANGE.from },
    { from: "2025-11-11", to: RANGE.to },
    { from: "2026-02-30", to: RANGE.to },
  ])
    expect(indicatorsRangeSchema.safeParse(range).success).toBe(false);
  expect(indicatorsRangeSchema.safeParse({ from: "2025-11-12", to: RANGE.to }).success).toBe(true);
});
it("suma pagos vigentes por los cuatro medios y muestra detalle ordenado", async () => {
  const data = await workshopIndicators(test.db, owner, RANGE, NOW);
  expect(data?.range).toEqual(RANGE);
  expect(data?.income).toMatchObject({ totalClp: 7501, count: 4 });
  expect(
    data?.income.byMethod.map(({ method, amountClp, count }) => ({ method, amountClp, count })),
  ).toEqual([
    { method: "transferencia", amountClp: 1000, count: 1 },
    { method: "tarjeta", amountClp: 5001, count: 1 },
    { method: "efectivo", amountClp: 1000, count: 1 },
    { method: "otro", amountClp: 500, count: 1 },
  ]);
  expect(data?.payments).toHaveLength(4);
  expect(data?.payments[0]).toEqual({
    receivedAt: new Date(END.getTime() - 1),
    orderNumber: "OT-00002",
    kind: "final",
    method: "tarjeta",
    amountClp: 5001,
    receivedByName: owner.name,
  });
  expect(data?.payments.at(-1)?.receivedAt).toEqual(START);
});
it("promedia entregadas, agrupa creadas y cuenta abiertos fuera del rango", async () => {
  await updateOrder(orders[0] as string, { status: "diagnostico", deliveredAt: null });
  const data = await workshopIndicators(test.db, owner, RANGE, NOW);
  expect(data?.delivered).toEqual({ count: 1, totalClp: 6001, averageTicketClp: 6001 });
  expect(data?.ordersCreated).toEqual({
    count: 3,
    byStatus: [
      { status: "reservada", label: STATUS_LABELS.reservada, count: 1 },
      { status: "recibida", label: STATUS_LABELS.recibida, count: 1 },
      { status: "entregada", label: STATUS_LABELS.entregada, count: 1 },
    ],
  });
  expect(data?.openNow).toEqual([
    { status: "reservada", label: STATUS_LABELS.reservada, count: 1 },
    { status: "recibida", label: STATUS_LABELS.recibida, count: 1 },
    { status: "diagnostico", label: STATUS_LABELS.diagnostico, count: 1 },
  ]);
});
it("redondea ticket promedio a pesos enteros", async () => {
  expect((await workshopIndicators(test.db, owner, RANGE, NOW))?.delivered).toEqual({
    count: 2,
    totalClp: 16001,
    averageTicketClp: 8001,
  });
});
it("ordena servicios por cantidad y monto, excluyendo repuestos y líneas anuladas", async () => {
  await service(orders[2] as string, "Anulado", 99999, 1);
  await test.db
    .update(workOrderItems)
    .set({ voidedAt: NOW, updatedAt: NOW })
    .where(eq(workOrderItems.description, "Anulado"));
  const data = await workshopIndicators(test.db, owner, RANGE, NOW);
  expect(data?.topServices.byQuantity).toEqual([
    { description: "Habitual", quantity: 3, amountClp: 7500 },
    { description: "Especial", quantity: 1, amountClp: 6001 },
  ]);
  expect(data?.topServices.byAmount).toEqual(data?.topServices.byQuantity);
  await service(orders[2] as string, "Costoso", 8000, 1);
  expect(
    (await workshopIndicators(test.db, owner, RANGE, NOW))?.topServices.byAmount[0]?.description,
  ).toBe("Costoso");
});
it("reconoce clientes recurrentes, conversión sin canceladas y cobertura completa", async () => {
  const data = await workshopIndicators(test.db, owner, RANGE, NOW);
  expect(data?.customers).toEqual({ served: 3, newCount: 2, returningCount: 1 });
  expect(data?.bookings).toEqual({
    received: 2,
    cancelled: 1,
    noShow: 0,
    converted: 1,
    conversionPct: 100,
  });
  expect(data?.coverage).toEqual({
    receivedCount: 2,
    checklistCompletePct: 50,
    qcApprovedPct: 50,
    reportsPct: 50,
  });
  expect(await workshopIndicators(test.db, staff[2] as SessionUser, RANGE, NOW)).toEqual(data);
});
it("excluye órdenes anuladas y sus pagos, servicios y primera visita", async () => {
  await updateOrder(orders[0] as string, { voidedAt: NOW });
  const data = await workshopIndicators(test.db, owner, RANGE, NOW);
  expect(data?.income.totalClp).toBe(6501);
  expect(data?.delivered.count).toBe(1);
  expect(data?.customers).toEqual({ served: 3, newCount: 3, returningCount: 0 });
});
it("otra sucursal no aporta pagos ni órdenes; las reservas son globales", async () => {
  const [branch] = await test.db.insert(branches).values({ name: "Otra" }).returning();
  if (!branch) throw new Error("Falta sucursal");
  const outsider = await actor(branch.id, "owner");
  const person = await client(3, outsider);
  const id = await order(1, person, NOW, outsider);
  await updateOrder(id, { totalClp: 900000, receivedAt: NOW });
  await pay(id, 900000, "efectivo", NOW, outsider);
  const data = await workshopIndicators(test.db, owner, RANGE, NOW);
  expect(data?.income.totalClp).toBe(7501);
  expect(data?.ordersCreated.count).toBe(3);
  expect(data?.coverage.receivedCount).toBe(2);
  expect((await workshopIndicators(test.db, outsider, RANGE, NOW))?.bookings.converted).toBe(0);
});
it("período vacío devuelve ceros y los cuatro medios", async () => {
  const empty = { from: "2025-01-01", to: "2025-01-01" };
  const data = await workshopIndicators(test.db, owner, empty, NOW);
  expect(data?.income.byMethod.map(({ amountClp, count }) => [amountClp, count])).toEqual(
    PAYMENT_METHODS.map(() => [0, 0]),
  );
  expect(data?.delivered).toEqual({ count: 0, totalClp: 0, averageTicketClp: 0 });
  expect(data?.bookings.conversionPct).toBe(0);
  expect(data?.coverage.checklistCompletePct).toBe(0);
});
it("limita solo el detalle de pagos a 200 y top servicios a seis", async () => {
  await test.db.insert(payments).values(
    Array.from({ length: 201 }, (_, index) => ({
      branchId: owner.branchId,
      workOrderId: orders[2] as string,
      kind: "final" as const,
      method: "efectivo" as const,
      amountClp: 1,
      receivedBy: owner.id,
      receivedAt: new Date(NOW.getTime() + index + 1),
    })),
  );
  for (let index = 0; index < 7; index++)
    await service(orders[2] as string, `Servicio ${index}`, 1, 1);
  const data = await workshopIndicators(test.db, owner, RANGE, NOW);
  expect(data?.income.totalClp).toBe(7702);
  expect(data?.income.count).toBe(205);
  expect(data?.payments).toHaveLength(200);
  expect(data?.payments[1]?.receivedAt).toEqual(new Date(NOW.getTime() + 201));
  expect(data?.topServices.byQuantity).toHaveLength(6);
  expect(data?.topServices.byAmount).toHaveLength(6);
});
