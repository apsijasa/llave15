import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { workOrderItems, workOrders } from "../../src/server/db/schema-orders.ts";
import { bikes, customers, servicePrices, services } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import {
  addCatalogItem,
  addPartItem,
  recomputeOrderTotals,
  voidItem,
} from "../../src/server/taller/items.ts";
import {
  grossOfNet,
  netOfGross,
  PRICING_MODE_LABELS,
  PRICING_MODES,
  VAT_RATE_PERCENT,
  vatOfNet,
} from "../../src/server/taller/rules.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-14T15:00:00.000Z");
const LATER = new Date("2026-11-14T16:00:00.000Z");
let test: TestDb;
let owner: SessionUser;
let customerId: string;
let bikeId: string;
let serviceId: string;

async function createCustomerAndBike() {
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: owner.branchId,
      name: "Cliente de prueba",
      phoneE164: "+56912345678",
    })
    .returning();
  if (!customer) throw new Error("Falta el cliente de prueba.");
  customerId = customer.id;
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: owner.branchId,
      customerId,
      brand: "Trek",
      model: "Marlin",
      bikeType: "mtb",
    })
    .returning();
  if (!bike) throw new Error("Falta la bicicleta de prueba.");
  bikeId = bike.id;
}

async function createService() {
  const [service] = await test.db
    .insert(services)
    .values({
      branchId: owner.branchId,
      name: "Ajuste de frenos",
      estimatedMinutes: 45,
    })
    .returning();
  if (!service) throw new Error("Falta el servicio de prueba.");
  serviceId = service.id;
  await test.db.insert(servicePrices).values({
    branchId: owner.branchId,
    serviceId,
    bikeType: "mtb",
    priceClp: 5000,
  });
}

async function createOrder(pricingMode?: "neto") {
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: owner.branchId,
      number: 1,
      customerId,
      bikeId,
      requestedService: "Revisión general",
      createdBy: owner.id,
      createdAt: NOW,
      updatedAt: NOW,
      ...(pricingMode ? { pricingMode } : {}),
    })
    .returning();
  if (!order) throw new Error("Falta la orden de prueba.");
  return order.id;
}

async function orderRow(orderId: string) {
  const [order] = await test.db.select().from(workOrders).where(eq(workOrders.id, orderId));
  if (!order) throw new Error("Falta la orden de prueba.");
  return order;
}

async function addPart(orderId: string, unitPriceClp: number, quantity = 1) {
  const result = await addPartItem(
    test.db,
    owner,
    orderId,
    {
      description: "Repuesto de prueba",
      quantity,
      unitPriceClp,
    },
    NOW,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("No se agregó el repuesto.");
  return result.itemId;
}

async function addService(orderId: string) {
  const result = await addCatalogItem(test.db, owner, orderId, { serviceId, quantity: 2 }, NOW);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("No se agregó el servicio.");
  return result.itemId;
}

it("define la tasa y las etiquetas de los regímenes de precios", () => {
  expect(VAT_RATE_PERCENT).toBe(19);
  expect(PRICING_MODES).toEqual(["final", "neto"]);
  expect(PRICING_MODE_LABELS).toEqual({
    final: "Precios finales",
    neto: "Precios netos + IVA",
  });
});

it.each([
  [0, 0, 0],
  [50, 10, 60],
  [5000, 950, 5950],
  [10000, 1900, 11900],
  [10003, 1901, 11904],
])("neto %i calcula IVA %i y bruto %i en pesos enteros", (net, vat, gross) => {
  expect(vatOfNet(net)).toBe(vat);
  expect(grossOfNet(net)).toBe(gross);
  expect(netOfGross(gross)).toBe(net);
});

describe("totales por régimen en PGlite", () => {
  beforeEach(async () => {
    test = await createTestDb();
    const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
    if (!branch) throw new Error("Falta la sucursal de prueba.");
    const [user] = await test.db
      .insert(users)
      .values({
        branchId: branch.id,
        role: "owner",
        name: "Personal de prueba",
        email: "owner@example.test",
        passwordHash: "hash-de-prueba",
      })
      .returning();
    if (!user) throw new Error("Falta el usuario de prueba.");
    owner = { id: user.id, branchId: branch.id, role: "owner", name: user.name, email: user.email };
    await createCustomerAndBike();
    await createService();
    return () => test.close();
  });

  it("suma cantidad por precio de repuestos netos y agrega IVA al total", async () => {
    const orderId = await createOrder("neto");
    await addPart(orderId, 5000, 2);
    expect(await orderRow(orderId)).toMatchObject({
      pricingMode: "neto",
      subtotalClp: 10000,
      vatClp: 1900,
      totalClp: 11900,
      estimatedMinutes: 0,
    });
  });

  it("suma catálogo y repuestos y redondea el IVA de 10.003 a 1.901", async () => {
    const orderId = await createOrder("neto");
    await addService(orderId);
    await addPart(orderId, 3);
    expect(await orderRow(orderId)).toMatchObject({
      subtotalClp: 10003,
      vatClp: 1901,
      totalClp: 11904,
      estimatedMinutes: 90,
    });
  });

  it("redondea una sola vez sobre el neto del documento", async () => {
    const orderId = await createOrder("neto");
    await addPart(orderId, 50);
    await addPart(orderId, 50);
    expect(await orderRow(orderId)).toMatchObject({
      subtotalClp: 100,
      vatClp: 19,
      totalClp: 119,
    });
  });

  it("anula sin borrar y recalcula montos y minutos solo con las líneas vigentes", async () => {
    const orderId = await createOrder("neto");
    const serviceItemId = await addService(orderId);
    const partItemId = await addPart(orderId, 3);
    expect(await voidItem(test.db, owner, serviceItemId, LATER)).toEqual({ ok: true });
    expect(await orderRow(orderId)).toMatchObject({
      subtotalClp: 3,
      vatClp: 1,
      totalClp: 4,
      estimatedMinutes: 0,
      updatedAt: LATER,
    });
    const [item] = await test.db
      .select()
      .from(workOrderItems)
      .where(eq(workOrderItems.id, serviceItemId));
    expect(item).toMatchObject({ voidedAt: LATER, voidedBy: owner.id });
    expect(await voidItem(test.db, owner, partItemId, LATER)).toEqual({ ok: true });
    expect(await orderRow(orderId)).toMatchObject({
      subtotalClp: 0,
      vatClp: 0,
      totalClp: 0,
      estimatedMinutes: 0,
    });
  });

  it("conserva el cálculo y los ceros de subtotal e IVA de una orden final", async () => {
    const orderId = await createOrder();
    const serviceItemId = await addService(orderId);
    await addPart(orderId, 3);
    expect(await orderRow(orderId)).toMatchObject({
      pricingMode: "final",
      subtotalClp: 0,
      vatClp: 0,
      totalClp: 10003,
      estimatedMinutes: 90,
    });
    expect(await voidItem(test.db, owner, serviceItemId, LATER)).toEqual({ ok: true });
    expect(await orderRow(orderId)).toMatchObject({
      subtotalClp: 0,
      vatClp: 0,
      totalClp: 3,
      estimatedMinutes: 0,
      updatedAt: LATER,
    });
  });

  it("la reexportación no escribe subtotal ni IVA en una orden final", async () => {
    const orderId = await createOrder();
    await test.db
      .update(workOrders)
      .set({ subtotalClp: 7, vatClp: 2 })
      .where(eq(workOrders.id, orderId));
    await recomputeOrderTotals(test.db, orderId, LATER);
    expect(await orderRow(orderId)).toMatchObject({
      subtotalClp: 7,
      vatClp: 2,
      totalClp: 0,
      estimatedMinutes: 0,
      updatedAt: LATER,
    });
  });

  it("revierte la anulación y todos los totales netos si falla la auditoría", async () => {
    const orderId = await createOrder("neto");
    const itemId = await addService(orderId);
    const before = await orderRow(orderId);
    await test.db.execute(sql`alter table audit_log add constraint test_pricing_audit_check
      check (action <> 'item.voided')`);
    await expect(voidItem(test.db, owner, itemId, LATER)).rejects.toThrow();
    expect(await orderRow(orderId)).toEqual(before);
    const [item] = await test.db.select().from(workOrderItems).where(eq(workOrderItems.id, itemId));
    expect(item).toMatchObject({ voidedAt: null, voidedBy: null });
  });
});
