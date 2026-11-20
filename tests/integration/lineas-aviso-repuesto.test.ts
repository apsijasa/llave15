import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { SITE } from "../helpers/shops.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { products } from "../../src/server/db/schema-inventory.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { bikes, customers, servicePrices, services } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { consoleOutbox } from "../../src/server/email/transport.ts";
import { addPartItem } from "../../src/server/taller/items.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null, actor: null as SessionUser | null }));
vi.mock("../../src/server/db/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Falta la base de prueba.");
    return holder.db;
  },
}));
vi.mock("../../src/server/auth/admin-auth.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/auth/admin-auth.ts")>()),
  requireAdmin: async () => holder.actor,
}));
const { default: LinesPage } = await import("../../src/pages/taller/ordenes/[id]/lineas.astro");
const NOW = new Date("2026-11-16T15:00:00Z");
let test: TestDb;
let owner: SessionUser;
let orderId: string;

async function seedOrder() {
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: owner.branchId,
      name: "Ana Pérez",
      phoneE164: "+56912345678",
      email: "ana@example.test",
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
      number: 1,
      customerId: customer.id,
      bikeId: bike.id,
      status: "diagnostico",
      requestedService: "Revisión general",
      createdBy: owner.id,
    })
    .returning();
  if (!order) throw new Error("Falta la orden.");
  orderId = order.id;
}

async function render(data?: Record<string, string>, search = "") {
  const request = new Request(`${SITE.url}/taller/ordenes/${orderId}/lineas${search}`, {
    method: data ? "POST" : "GET",
    headers: data ? { origin: SITE.url, "content-type": "application/x-www-form-urlencoded" } : {},
    body: data ? new URLSearchParams(data) : undefined,
  });
  const container = await AstroContainer.create({ astroConfig: { site: SITE.url } });
  return container.renderToResponse(LinesPage, { request, params: { id: orderId } });
}

const part = {
  action: "part",
  description: "Pastillas de freno",
  part_quantity: "2",
  part_price: "5950",
};

beforeEach(async () => {
  consoleOutbox.length = 0;
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Red deshabilitada.");
    }),
  );
  test = await createTestDb();
  holder.db = test.db;
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta la sucursal.");
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
  if (!user) throw new Error("Falta el usuario.");
  owner = { ...user, role: "owner" };
  holder.actor = owner;
  await seedOrder();
  return async () => {
    holder.actor = null;
    holder.db = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    await test.close();
  };
});

it("redirige con avisado y muestra la confirmación del correo al agregar texto libre", async () => {
  const response = await render(part);
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    `/taller/ordenes/${orderId}/lineas?hecho=part&avisado=1`,
  );
  expect(consoleOutbox).toHaveLength(2);
  const html = await (await render(undefined, "?hecho=part&avisado=1")).text();
  expect(html).toContain("Repuesto agregado. Le avisamos al cliente por correo.");
});

it("en reservada agrega sin avisado ni correo", async () => {
  await test.db.update(workOrders).set({ status: "reservada" }).where(eq(workOrders.id, orderId));
  const response = await render(part);
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(`/taller/ordenes/${orderId}/lineas?hecho=part`);
  expect(consoleOutbox).toHaveLength(0);
});

it("el inventario también avisa y conserva su aviso de Líneas", async () => {
  const [product] = await test.db
    .insert(products)
    .values({
      branchId: owner.branchId,
      sku: "CAD-01",
      name: "Cadena",
      category: "repuesto",
      stockQty: 3,
      costClp: 2347,
      priceClp: 5000,
      createdBy: owner.id,
    })
    .returning();
  if (!product) throw new Error("Falta el producto.");
  const response = await render({
    action: "add_product",
    productId: product.id,
    product_quantity: "1",
  });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    `/taller/ordenes/${orderId}/lineas?hecho=add_product&avisado=1`,
  );
  expect(consoleOutbox).toHaveLength(2);
  const html = await (await render(undefined, "?hecho=add_product&avisado=1")).text();
  expect(html).toContain("Repuesto del inventario agregado. Le avisamos al cliente por correo.");
});

it("el aviso usa el total después de guardar los precios editados", async () => {
  const added = await addPartItem(
    test.db,
    owner,
    orderId,
    { description: "Cámara", quantity: 1, unitPriceClp: 1000 },
    NOW,
  );
  if (!added.ok) throw new Error("Falta la línea.");
  const response = await render({ ...part, [`price_${added.itemId}`]: "2000" });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    `/taller/ordenes/${orderId}/lineas?hecho=part&actualizados=1&avisado=1`,
  );
  expect(consoleOutbox[0]?.text).toContain("Nuevo total: $13.900");
  const html = await (await render(undefined, "?hecho=part&actualizados=1&avisado=1")).text();
  expect(html).toContain(
    "Repuesto agregado. Precios actualizados: 1. Le avisamos al cliente por correo.",
  );
});

it("un servicio de catálogo no dispara el aviso", async () => {
  const [service] = await test.db
    .insert(services)
    .values({ branchId: owner.branchId, name: "Ajuste de frenos", estimatedMinutes: 30 })
    .returning();
  if (!service) throw new Error("Falta el servicio.");
  await test.db
    .insert(servicePrices)
    .values({ branchId: owner.branchId, serviceId: service.id, bikeType: "mtb", priceClp: 18000 });
  const response = await render({
    action: "catalog",
    serviceId: service.id,
    catalog_quantity: "1",
  });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(`/taller/ordenes/${orderId}/lineas?hecho=catalog`);
  expect(consoleOutbox).toHaveLength(0);
});
