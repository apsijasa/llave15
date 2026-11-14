import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { hashPassword, loginAdmin, SESSION_COOKIE } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { products, stockMovements } from "../../src/server/db/schema-inventory.ts";
import { workOrderItems, workOrders } from "../../src/server/db/schema-orders.ts";
import { auditLog, bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { addPartItem, listItems, voidItem } from "../../src/server/taller/items.ts";
import { addProductPartItem } from "../../src/server/taller/part-stock.ts";
import type { PricingMode } from "../../src/server/taller/rules.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null }));
vi.mock("../../src/server/db/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Falta la base de prueba.");
    return holder.db;
  },
}));
const { default: LinesPage } = await import("../../src/pages/taller/ordenes/[id]/lineas.astro");
const NOW = new Date("2026-11-14T15:00:00Z");
const LATER = new Date("2026-11-14T16:00:00Z");
const PASSWORD = "clave-repuestos-de-prueba";
const SITE = "https://vectorbikes.cl";
let test: TestDb;
let actors: Record<SessionUser["role"], SessionUser>;
let owner: SessionUser;
let orderId: string;
let productId: string;

async function seedOrder() {
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: owner.branchId,
      name: "Cliente de prueba",
      phoneE164: "+56912345678",
    })
    .returning();
  if (!customer) throw new Error("Falta el cliente.");
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
  if (!bike) throw new Error("Falta la bicicleta.");
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: owner.branchId,
      customerId: customer.id,
      bikeId: bike.id,
      number: 1,
      pricingMode: "neto",
      status: "reservada",
      requestedService: "Revisión general",
      createdBy: owner.id,
    })
    .returning();
  if (!order) throw new Error("Falta la orden.");
  orderId = order.id;
}

async function seedProduct(overrides: Partial<typeof products.$inferInsert> = {}) {
  const [product] = await test.db
    .insert(products)
    .values({
      branchId: owner.branchId,
      sku: "CAD-01",
      name: "Cadena",
      category: "repuesto",
      stockQty: 5,
      costClp: 3000,
      priceClp: 5000,
      createdBy: owner.id,
      ...overrides,
    })
    .returning();
  if (!product) throw new Error("Falta el producto.");
  return product.id;
}

async function snapshot() {
  return {
    products: await test.db.select().from(products),
    items: await test.db.select().from(workOrderItems),
    movements: await test.db.select().from(stockMovements),
    orders: await test.db.select().from(workOrders),
    audits: await test.db.select().from(auditLog),
  };
}

async function screen(fields?: Record<string, string>, role: SessionUser["role"] = "owner") {
  const session = await loginAdmin(test.db, {
    email: actors[role].email,
    password: PASSWORD,
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!session.ok) throw new Error("Falta la sesión.");
  const request = new Request(`${SITE}/taller/ordenes/${orderId}/lineas`, {
    method: fields ? "POST" : "GET",
    headers: { cookie: `${SESSION_COOKIE}=${session.token}`, origin: SITE },
    ...(fields ? { body: new URLSearchParams(fields) } : {}),
  });
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  const response = await container
    .renderToResponse(LinesPage, {
      request,
      params: { id: orderId },
    })
    .finally(() => vi.useRealTimers());
  return { response, html: (await response.text()).replace(/>\s+</g, "><") };
}

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta la sucursal.");
  actors = {} as typeof actors;
  const passwordHash = await hashPassword(PASSWORD);
  for (const role of ["owner", "admin", "reception", "mechanic"] as const) {
    const [user] = await test.db
      .insert(users)
      .values({
        branchId: branch.id,
        role,
        name: "Personal de prueba",
        email: `${role}@example.test`,
        passwordHash,
      })
      .returning();
    if (!user) throw new Error("Falta el usuario.");
    actors[role] = { ...user, role };
  }
  owner = actors.owner;
  await seedOrder();
  productId = await seedProduct();
  return async () => {
    holder.db = null;
    await test.close();
  };
});

it.each(["owner", "admin", "reception", "mechanic"] as const)(
  "omite la clave de costo solo para roles sin costs.view: %s",
  async (role) => {
    expect(await add()).toMatchObject({ ok: true });
    const [item] = await listItems(test.db, actors[role], orderId);
    expect(item).toBeDefined();
    if (role === "owner" || role === "admin") expect(item).toHaveProperty("unitCostClp", 3000);
    else expect(item).not.toHaveProperty("unitCostClp");
  },
);

it("ofrece solo productos activos con stock y muestra el desglose neto", async () => {
  await seedProduct({ sku: "SIN-STOCK", name: "Sin existencias", stockQty: 0 });
  await seedProduct({ sku: "INACTIVO", name: "Producto inactivo", isActive: false });
  const { response, html } = await screen();
  expect(response.status).toBe(200);
  expect(html).toContain("Agregar repuesto del inventario");
  expect(html).toContain("CAD-01 · Cadena · stock 5 · $5.000");
  expect(html).not.toContain("SIN-STOCK");
  expect(html).not.toContain("INACTIVO");
  expect(html).toContain('<dt>Neto</dt><dd class="mono">$0</dd>');
  expect(html).toContain('<dt>IVA (19%)</dt><dd class="mono">$0</dd>');
});

async function add(quantity = 1, actor = owner) {
  return addProductPartItem(test.db, actor, orderId, { productId, quantity }, NOW);
}

it.each(["neto", "final"] as const)(
  "consume stock y congela precio y costo en %s",
  async (pricingMode: PricingMode) => {
    await test.db.update(workOrders).set({ pricingMode }).where(eq(workOrders.id, orderId));
    const result = await add();
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("No se agregó el repuesto.");
    const state = await snapshot();
    expect(state.products[0]).toMatchObject({ stockQty: 4, costClp: 3000 });
    expect(state.items).toMatchObject([
      {
        id: result.itemId,
        branchId: owner.branchId,
        workOrderId: orderId,
        productId,
        kind: "repuesto",
        origin: "inicial",
        description: "Cadena",
        quantity: 1,
        unitCostClp: 3000,
        unitPriceClp: pricingMode === "neto" ? 5000 : 5950,
      },
    ]);
    expect(state.movements).toMatchObject([
      {
        branchId: owner.branchId,
        productId,
        kind: "consumo_orden",
        quantity: -1,
        unitCostClp: 3000,
        referenceKind: "work_order_item",
        referenceId: result.itemId,
      },
    ]);
    expect(state.orders[0]).toMatchObject(
      pricingMode === "neto"
        ? { subtotalClp: 5000, vatClp: 950, totalClp: 5950 }
        : { subtotalClp: 0, vatClp: 0, totalClp: 5950 },
    );
    expect(state.audits).toMatchObject([{ action: "item.added", details: { productId } }]);
  },
);

it("anula una sola vez con el costo congelado y recalcula los totales", async () => {
  const result = await add(2);
  if (!result.ok) throw new Error("No se agregó el repuesto.");
  await test.db
    .update(products)
    .set({ costClp: 4000, priceClp: 6000, isActive: false })
    .where(eq(products.id, productId));
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(await voidItem(test.db, owner, result.itemId, LATER)).toEqual({ ok: true });
  }
  const state = await snapshot();
  expect(state.products[0]).toMatchObject({ stockQty: 5, costClp: 4000 });
  expect(state.items[0]).toMatchObject({ unitCostClp: 3000, unitPriceClp: 5000, voidedAt: LATER });
  expect(state.movements).toHaveLength(2);
  expect(state.movements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "anulacion",
        quantity: 2,
        unitCostClp: 3000,
        referenceId: result.itemId,
      }),
    ]),
  );
  expect(state.orders[0]).toMatchObject({ subtotalClp: 0, vatClp: 0, totalClp: 0 });
});

it("revierte todo si falta stock y permite consumir exactamente lo disponible", async () => {
  const before = await snapshot();
  expect(await add(6)).toEqual({ ok: false, code: "out_of_stock" });
  expect(await snapshot()).toEqual(before);
  expect(await add(5)).toMatchObject({ ok: true });
  const empty = await snapshot();
  expect(empty.products[0]?.stockQty).toBe(0);
  expect(await add()).toEqual({ ok: false, code: "out_of_stock" });
  expect(await snapshot()).toEqual(empty);
});

it("revierte línea, stock y movimiento si falla la auditoría", async () => {
  const before = await snapshot();
  await test.client.exec(
    "alter table audit_log add constraint reject_part check (action <> 'item.added')",
  );
  await expect(add()).rejects.toThrow();
  expect(await snapshot()).toEqual(before);
});

it("valida cantidad, producto y precio impuesto antes de escribir", async () => {
  const before = await snapshot();
  for (const input of [
    { productId: "inválido", quantity: 1 },
    { productId, quantity: 0 },
    { productId, quantity: 101 },
    { productId, quantity: 1.5 },
    { productId, quantity: 1, unitPriceClp: 1 },
  ])
    expect(await addProductPartItem(test.db, owner, orderId, input, NOW)).toEqual({
      ok: false,
      code: "validation_error",
    });
  expect(await snapshot()).toEqual(before);
});

it("rechaza al mecánico y conserva repuestos libres sin movimientos", async () => {
  const before = await snapshot();
  expect(await add(1, actors.mechanic)).toEqual({ ok: false, code: "forbidden" });
  expect(await snapshot()).toEqual(before);
  const result = await addPartItem(
    test.db,
    actors.reception,
    orderId,
    {
      description: "Repuesto libre",
      quantity: 2,
      unitPriceClp: 1000,
    },
    NOW,
  );
  if (!result.ok) throw new Error("No se agregó el repuesto libre.");
  expect((await snapshot()).items[0]).toMatchObject({
    productId: null,
    unitCostClp: null,
    unitPriceClp: 1000,
  });
  expect(await voidItem(test.db, owner, result.itemId, LATER)).toEqual({ ok: true });
  expect((await snapshot()).movements).toHaveLength(0);
});

it("rechaza productos inactivos, ajenos e inexistentes y órdenes cerradas", async () => {
  const [other] = await test.db.insert(branches).values({ name: "Otra sucursal" }).returning();
  if (!other) throw new Error("Falta la sucursal.");
  for (const patch of [{ isActive: false }, { isActive: true, branchId: other.id }]) {
    await test.db.update(products).set(patch).where(eq(products.id, productId));
    expect(await add()).toEqual({ ok: false, code: "not_found" });
  }
  expect(
    await addProductPartItem(
      test.db,
      owner,
      orderId,
      { productId: randomUUID(), quantity: 1 },
      NOW,
    ),
  ).toEqual({ ok: false, code: "not_found" });
  await test.db
    .update(products)
    .set({ branchId: owner.branchId })
    .where(eq(products.id, productId));
  for (const status of ["cancelada", "trabajo_rechazado", "entregada"] as const) {
    await test.db
      .update(workOrders)
      .set({ status, qcApprovedAt: NOW })
      .where(eq(workOrders.id, orderId));
    expect(await add()).toEqual({ ok: false, code: "invalid_status" });
  }
  expect((await snapshot()).items).toHaveLength(0);
});

it("agrega desde el formulario, redirige y responde 409 cuando falta stock", async () => {
  const { response } = await screen(
    { action: "add_product", productId, product_quantity: "1" },
    "reception",
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    `/taller/ordenes/${orderId}/lineas?hecho=add_product`,
  );
  const { response: conflict, html } = await screen({
    action: "add_product",
    productId,
    product_quantity: "5",
  });
  expect(conflict.status).toBe(409);
  expect(html).toContain("No hay stock suficiente de ese producto.");
  expect((await snapshot()).items).toHaveLength(1);
});

it("el mecánico recibe 403 y no ve el formulario de inventario", async () => {
  expect((await screen(undefined, "mechanic")).html).not.toContain(
    "Agregar repuesto del inventario",
  );
  const { response } = await screen(
    { action: "add_product", productId, product_quantity: "1" },
    "mechanic",
  );
  expect(response.status).toBe(403);
  expect((await snapshot()).items).toHaveLength(0);
});

it("conserva el total final y valida el formulario con error de campo", async () => {
  await test.db.update(workOrders).set({ pricingMode: "final" }).where(eq(workOrders.id, orderId));
  await add();
  const { html } = await screen();
  expect(html).toContain('<p>Total para el cliente: <span class="mono">$5.950</span></p>');
  expect(html).not.toContain("IVA (19%)");
  const invalid = await screen({ action: "add_product", productId, product_quantity: "0" });
  expect(invalid.response.status).toBe(422);
  expect(invalid.html).toMatch(/name="product_quantity"[^>]*aria-invalid="true"/);
});
