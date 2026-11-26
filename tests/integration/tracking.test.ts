import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { log } from "../../src/lib/log.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { orderTrackingTokens } from "../../src/server/db/schema-reports.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { recordStatusChange } from "../../src/server/taller/orders.ts";
import { STATUS_LABELS } from "../../src/server/taller/rules.ts";
import { hashShareToken, shareTokenSchema } from "../../src/server/taller/share-tokens.ts";
import {
  ensureTrackingLink,
  trackingLink,
  trackingTokenFor,
  viewTrackingByToken,
} from "../../src/server/taller/tracking.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-12T15:00:00Z");
const SITE = "https://vectorbikes.cl";
const PRIVATE = ["+56912345678", "ana@example.test", "12.345.678-5", "María", "Pérez"];
let test: TestDb;
let owner: SessionUser;
let orderId: string;
let tokens: string[];

async function seedOwner() {
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta sucursal");
  const [user] = await test.db
    .insert(users)
    .values({
      branchId: branch.id,
      role: "owner",
      name: "Dueño",
      email: "owner@example.test",
      passwordHash: "hash",
    })
    .returning();
  if (!user) throw new Error("Falta usuario");
  owner = { id: user.id, branchId: branch.id, role: "owner", name: user.name, email: user.email };
}

async function seedOrder(number = 1) {
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: owner.branchId,
      name: "  Ana María Pérez  ",
      phoneE164: PRIVATE[0]!,
      email: PRIVATE[1],
      // El RUT es único: solo el primer cliente lo lleva.
      rut: number === 1 ? PRIVATE[2] : null,
    })
    .returning();
  if (!customer) throw new Error("Falta cliente");
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: owner.branchId,
      customerId: customer.id,
      brand: "Trek",
      model: "Marlin",
      bikeType: "mtb",
    })
    .returning();
  if (!bike) throw new Error("Falta bicicleta");
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: owner.branchId,
      number,
      customerId: customer.id,
      bikeId: bike.id,
      status: "diagnostico",
      requestedService: "Mantención",
      diagnosis: "Diagnóstico privado",
      observations: "Observaciones privadas",
      notes: "Notas privadas",
      estimatedDeliveryDate: "2026-11-14",
      createdBy: owner.id,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning();
  if (!order) throw new Error("Falta orden");
  return order.id;
}

async function ensure(actor = owner, id = orderId) {
  const result = await ensureTrackingLink(test.db, actor, id, SITE, NOW);
  if (result.ok) tokens.push(result.token);
  return result;
}

beforeEach(async () => {
  tokens = [];
  for (const level of ["info", "warn", "error"] as const)
    vi.spyOn(log, level).mockImplementation(() => {});
  test = await createTestDb();
  await seedOwner();
  orderId = await seedOrder();
});

afterEach(async () => {
  try {
    for (const level of ["info", "warn", "error"] as const) {
      const calls = JSON.stringify(vi.mocked(log[level]).mock.calls);
      for (const secret of [...PRIVATE, ...tokens]) expect(calls).not.toContain(secret);
    }
  } finally {
    vi.restoreAllMocks();
    await test?.close();
  }
});

it("deriva un token determinista de 43 caracteres y cambia con el secreto o la orden", () => {
  const secret = "secreto-de-prueba-0123456789abcdef";
  const token = trackingTokenFor(orderId, secret);
  tokens.push(token);
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(shareTokenSchema.safeParse(token).success).toBe(true);
  expect(trackingTokenFor(orderId, secret)).toBe(token);
  expect(trackingTokenFor(orderId, `${secret}-otro`)).not.toBe(token);
  expect(trackingTokenFor(owner.id, secret)).not.toBe(token);
  expect(trackingLink(`${SITE}/otra/ruta`, token)).toBe(`${SITE}/seguimiento/${token}`);
});

it("crea una sola fila con hash, de forma perezosa e idempotente", async () => {
  expect(await test.db.select().from(orderTrackingTokens)).toEqual([]);
  const first = await ensure();
  const second = await ensure();
  expect(second).toEqual(first);
  if (!first.ok) throw new Error(first.code);
  expect(first.url).toBe(`${SITE}/seguimiento/${first.token}`);
  const rows = await test.db.select().from(orderTrackingTokens);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    branchId: owner.branchId,
    workOrderId: orderId,
    tokenHash: hashShareToken(first.token),
    createdAt: NOW,
    updatedAt: NOW,
  });
  expect(JSON.stringify(rows)).not.toContain(first.token);
});

it("rechaza al mecánico sin acceso sin crear filas", async () => {
  const [mechanic] = await test.db
    .insert(users)
    .values({
      branchId: owner.branchId,
      role: "mechanic",
      name: "Mecánico",
      email: "mechanic@example.test",
      passwordHash: "hash",
    })
    .returning();
  if (!mechanic) throw new Error("Falta mecánico");
  await test.db
    .update(workOrders)
    .set({ assignedMechanicId: owner.id })
    .where(eq(workOrders.id, orderId));
  expect(await ensure({ ...owner, id: mechanic.id, role: "mechanic" })).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(await test.db.select().from(orderTrackingTokens)).toEqual([]);
});

it("oculta órdenes de otra sucursal o anuladas", async () => {
  const [branch] = await test.db.insert(branches).values({ name: "Otra" }).returning();
  if (!branch) throw new Error("Falta sucursal");
  expect(await ensure({ ...owner, branchId: branch.id })).toEqual({ ok: false, code: "not_found" });
  await test.db.update(workOrders).set({ voidedAt: NOW }).where(eq(workOrders.id, orderId));
  expect(await ensure()).toEqual({ ok: false, code: "not_found" });
  expect(await test.db.select().from(orderTrackingTokens)).toEqual([]);
});

it("devuelve solo datos públicos y el historial cronológico sin notas ni autores", async () => {
  const later = new Date("2026-11-12T16:00:00Z");
  const common = { branchId: owner.branchId, orderId, actorUserId: owner.id, note: "Nota privada" };
  expect(
    await recordStatusChange(test.db, { ...common, from: "creado", to: "diagnostico" }, later),
  ).toEqual({ ok: true });
  expect(await recordStatusChange(test.db, { ...common, from: null, to: "creado" }, NOW)).toEqual({
    ok: true,
  });
  const link = await ensure();
  if (!link.ok) throw new Error(link.code);
  const view = await viewTrackingByToken(test.db, link.token);
  expect(view).toEqual({
    orderNumber: "OT-00001",
    customerFirstName: "Ana",
    bike: "Trek Marlin",
    status: "diagnostico",
    statusLabel: STATUS_LABELS.diagnostico,
    estimatedDeliveryDate: "2026-11-14",
    isReadyForPickup: false,
    isTerminal: false,
    timeline: [
      { at: NOW, status: "creado", label: STATUS_LABELS.creado },
      { at: later, status: "diagnostico", label: STATUS_LABELS.diagnostico },
    ],
  });
  for (const secret of [
    ...PRIVATE,
    "Nota privada",
    owner.name,
    owner.id,
    "Diagnóstico privado",
    "Observaciones privadas",
    "Notas privadas",
    link.token,
  ])
    expect(JSON.stringify(view)).not.toContain(secret);
});

it("muestra Orden creada sin historial y refleja estados listos y terminales", async () => {
  const link = await ensure();
  if (!link.ok) throw new Error(link.code);
  expect((await viewTrackingByToken(test.db, link.token))?.timeline).toEqual([
    { at: NOW, status: "diagnostico", label: "Orden creada" },
  ]);
  await test.db
    .update(workOrders)
    .set({ status: "lista_para_retirar", qcApprovedAt: NOW })
    .where(eq(workOrders.id, orderId));
  expect(await viewTrackingByToken(test.db, link.token)).toMatchObject({
    isReadyForPickup: true,
    isTerminal: false,
  });
  await test.db.update(workOrders).set({ status: "entregada" }).where(eq(workOrders.id, orderId));
  expect(await viewTrackingByToken(test.db, link.token)).toMatchObject({
    isReadyForPickup: false,
    isTerminal: true,
  });
});

it("devuelve null con token desconocido, malformado, null o una orden anulada después", async () => {
  const otherId = await seedOrder(2);
  const link = await ensure(owner, otherId);
  if (!link.ok) throw new Error(link.code);
  await test.db.update(workOrders).set({ voidedAt: NOW }).where(eq(workOrders.id, otherId));
  for (const value of ["invalido", "a".repeat(43), link.token, null])
    expect(await viewTrackingByToken(test.db, value as string)).toBeNull();
});
