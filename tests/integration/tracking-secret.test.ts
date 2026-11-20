import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EnvError, getTrackingEnv } from "../../src/lib/env.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { orderTrackingTokens } from "../../src/server/db/schema-reports.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { hashShareToken } from "../../src/server/taller/share-tokens.ts";
import {
  ensureTrackingLink,
  trackingTokenFor,
  viewTrackingByToken,
} from "../../src/server/taller/tracking.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-20T15:00:00Z");
const SITE = "https://llave15.cl";
const LEGACY = "secreto-de-cancelacion-0123456789abcdef";
const OWN = "secreto-propio-del-seguimiento-0123456789";
let test: TestDb;
let owner: SessionUser;

async function seedOrder(number: number): Promise<string> {
  const [customer] = await test.db
    .insert(customers)
    .values({ branchId: owner.branchId, name: "Ana Pérez", phoneE164: `+5691234567${number}` })
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
      createdBy: owner.id,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning();
  if (!order) throw new Error("Falta orden");
  return order.id;
}

beforeEach(async () => {
  vi.stubEnv("CANCEL_TOKEN_SECRET", LEGACY);
  vi.stubEnv("TRACKING_TOKEN_SECRET", OWN);
  test = await createTestDb();
  const [branch] = await test.db.insert(branches).values({ name: "Sucursal" }).returning();
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
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await test?.close();
});

it("getTrackingEnv usa el secreto propio y, sin él, el de cancelación", () => {
  expect(getTrackingEnv({ CANCEL_TOKEN_SECRET: LEGACY, TRACKING_TOKEN_SECRET: OWN })).toEqual({
    TRACKING_TOKEN_SECRET: OWN,
    LEGACY_SECRET: LEGACY,
  });
  for (const source of [
    { CANCEL_TOKEN_SECRET: LEGACY },
    { CANCEL_TOKEN_SECRET: LEGACY, TRACKING_TOKEN_SECRET: "" },
  ]) {
    expect(getTrackingEnv(source)).toEqual({
      TRACKING_TOKEN_SECRET: LEGACY,
      LEGACY_SECRET: LEGACY,
    });
  }
});

it("rechaza un TRACKING_TOKEN_SECRET de menos de 32 caracteres nombrándolo", () => {
  const short = () =>
    getTrackingEnv({ CANCEL_TOKEN_SECRET: LEGACY, TRACKING_TOKEN_SECRET: "corto" });
  expect(short).toThrow(EnvError);
  expect(short).toThrow("TRACKING_TOKEN_SECRET");
});

it("una orden sin fila recibe un token derivado del secreto propio", async () => {
  const orderId = await seedOrder(1);
  const result = await ensureTrackingLink(test.db, owner, orderId, SITE, NOW);
  if (!result.ok) throw new Error(result.code);
  expect(result.token).toBe(trackingTokenFor(orderId, OWN));
  expect(result.token).not.toBe(trackingTokenFor(orderId, LEGACY));
  expect(result.url).toBe(`${SITE}/seguimiento/${result.token}`);
});

it("una orden con un enlace ya enviado con el secreto viejo conserva ese token", async () => {
  const orderId = await seedOrder(2);
  const legacyToken = trackingTokenFor(orderId, LEGACY);
  await test.db.insert(orderTrackingTokens).values({
    branchId: owner.branchId,
    workOrderId: orderId,
    tokenHash: hashShareToken(legacyToken),
    createdAt: NOW,
    updatedAt: NOW,
  });
  const result = await ensureTrackingLink(test.db, owner, orderId, SITE, NOW);
  if (!result.ok) throw new Error(result.code);
  expect(result.token).toBe(legacyToken);
  const [row] = await test.db
    .select()
    .from(orderTrackingTokens)
    .where(eq(orderTrackingTokens.workOrderId, orderId));
  expect(row?.tokenHash).toBe(hashShareToken(legacyToken));
  expect(await viewTrackingByToken(test.db, legacyToken)).not.toBeNull();
});

it("sin TRACKING_TOKEN_SECRET se comporta como hoy", async () => {
  vi.stubEnv("TRACKING_TOKEN_SECRET", "");
  const orderId = await seedOrder(3);
  const result = await ensureTrackingLink(test.db, owner, orderId, SITE, NOW);
  if (!result.ok) throw new Error(result.code);
  expect(result.token).toBe(trackingTokenFor(orderId, LEGACY));
});

it(".env.example documenta TRACKING_TOKEN_SECRET", () => {
  const example = readFileSync(".env.example", "utf8");
  expect(example).toMatch(/^TRACKING_TOKEN_SECRET=/m);
  expect(example).toMatch(/#.*CANCEL_TOKEN_SECRET/);
});
