import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { ROLES } from "../../src/server/auth/permissions.ts";
import {
  products,
  purchaseOrderItems,
  purchaseOrders,
  stockMovements,
  suppliers,
} from "../../src/server/db/schema-inventory.ts";
import { auditLog } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { createProduct } from "../../src/server/taller/products.ts";
import {
  addPurchaseItem,
  createPurchase,
  formatPurchaseNumber,
  getPurchase,
  listPurchases,
  receivePurchase,
  sendPurchase,
  voidPurchase,
} from "../../src/server/taller/purchases.ts";
import {
  PURCHASE_DOC_TYPES,
  PURCHASE_DOC_TYPE_LABELS,
  PURCHASE_STATUSES,
  PURCHASE_STATUS_LABELS,
} from "../../src/server/taller/rules.ts";
import {
  createSupplier,
  listSuppliers,
  supplierFormSchema,
  updateSupplier,
} from "../../src/server/taller/suppliers.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-14T15:00:00Z");
const LATER = new Date("2026-11-14T16:00:00Z");
const FORM = {
  name: "Proveedor de repuestos",
  rut: "12.345.678-5",
  phone: "+56912345678",
  email: "contacto@ejemplo.cl",
  notes: "Contacto contacto@ejemplo.cl",
};
let test: TestDb;
let actors: Record<(typeof ROLES)[number], SessionUser>;
let owner: SessionUser;
let other: SessionUser;
let supplierId: string;
let productId: string;

beforeEach(async () => {
  test = await createTestDb();
  const rows = await test.db
    .insert(branches)
    .values([{ name: "Principal" }, { name: "Otra" }])
    .returning();
  const branch = rows[0];
  const second = rows[1];
  if (!branch || !second) throw new Error("Faltan sucursales");
  actors = {} as typeof actors;
  for (const role of ROLES) {
    const [user] = await test.db
      .insert(users)
      .values({
        branchId: branch.id,
        role,
        name: role,
        email: `${role}@ejemplo.cl`,
        passwordHash: "hash-prueba",
      })
      .returning();
    if (!user) throw new Error("Falta usuario");
    actors[role] = { id: user.id, branchId: branch.id, role, name: user.name, email: user.email };
  }
  owner = actors.owner;
  other = { ...owner, branchId: second.id };
  const supplier = await createSupplier(test.db, owner, FORM, NOW);
  if (!supplier.ok) throw new Error("Falta proveedor");
  supplierId = supplier.supplierId;
  productId = await product("CAD-01");
});
afterEach(async () => {
  await test.close();
});

async function create(actor = owner, supplier = supplierId) {
  const input = { supplierId: supplier, notes: "Compra de prueba" };
  const result = await createPurchase(test.db, actor, input, NOW);
  if (!result.ok) throw new Error(`No se creó la compra: ${result.code}`);
  return result.purchaseId;
}
async function product(sku: string, actor = owner) {
  const input = { sku, name: "Cadena", category: "repuesto", priceClp: 2000 };
  const result = await createProduct(test.db, actor, input, NOW);
  if (!result.ok) throw new Error("Falta producto");
  return result.productId;
}
const add = (id: string, unitCostClp = 1000, product = productId) =>
  addPurchaseItem(test.db, owner, id, { productId: product, quantity: 5, unitCostClp }, NOW);
const receive = (id: string) =>
  receivePurchase(test.db, owner, id, { docType: "factura", docNumber: "F-123" }, LATER);
const send = (id: string, actor = owner) => sendPurchase(test.db, actor, id, NOW);
const cancel = (id: string, reason = "Duplicada", actor = owner) =>
  voidPurchase(test.db, actor, id, { reason }, LATER);
const supply = (input: unknown = FORM, actor = owner) => createSupplier(test.db, actor, input, NOW);
const edit = (id: string, input: unknown = FORM, actor = owner) =>
  updateSupplier(test.db, actor, id, input, LATER);
async function fails(result: Promise<unknown>, code = "invalid_status") {
  expect(await result).toEqual({ ok: false, code });
}
async function snapshot() {
  return {
    suppliers: await test.db.select().from(suppliers),
    orders: await test.db.select().from(purchaseOrders),
    items: await test.db.select().from(purchaseOrderItems),
    products: await test.db.select().from(products),
    movements: await test.db.select().from(stockMovements),
    audits: await test.db.select().from(auditLog),
    branches: await test.db.select().from(branches),
  };
}

it("recibe compra enviada, registra documento, stock, costo y auditoría en la misma transacción", async () => {
  const id = await create();
  expect(await add(id)).toMatchObject({ ok: true });
  expect(await send(id)).toMatchObject({ ok: true });
  expect(await receive(id)).toMatchObject({ ok: true });
  const data = await snapshot();
  expect(data.products).toMatchObject([{ stockQty: 5, costClp: 1000, updatedAt: LATER }]);
  expect(data.movements).toHaveLength(1);
  expect(data.movements[0]).toMatchObject({
    productId,
    kind: "compra",
    quantity: 5,
    unitCostClp: 1000,
    referenceKind: "purchase_order",
    referenceId: id,
  });
  expect(data.orders[0]).toMatchObject({
    status: "recibida",
    receivedAt: LATER,
    receivedBy: owner.id,
    docType: "factura",
    docNumber: "F-123",
  });
  expect(data.items).toMatchObject([{ receivedQty: 5, updatedAt: LATER }]);
  const audits = data.audits.filter((row) => row.entity === "purchase");
  expect(audits.map((row) => row.action)).toEqual([
    "purchase.created",
    "purchase.item_added",
    "purchase.sent",
    "purchase.received",
  ]);
  for (const audit of audits) {
    expect(audit).toMatchObject({ entityId: id, branchId: owner.branchId, actorUserId: owner.id });
  }
  const detail = await getPurchase(test.db, owner, id);
  expect(detail).toMatchObject({
    supplierName: FORM.name,
    items: [{ productId, productName: "Cadena", stockQty: 5, unitCostClp: 1000 }],
  });
  const list = await listPurchases(test.db, owner);
  expect(list).toMatchObject([{ id, totalClp: 5000, supplierName: FORM.name }]);
});

it("recibe también desde borrador y pondera la segunda compra a 1.150", async () => {
  for (const cost of [1000, 1300]) {
    const id = await create();
    await add(id, cost);
    expect(await receive(id)).toMatchObject({ ok: true });
  }
  expect((await snapshot()).products).toMatchObject([{ stockQty: 10, costClp: 1150 }]);
});

it("rechaza agregar fuera de borrador y recibir, enviar o anular una recibida sin cambiar filas", async () => {
  const id = await create();
  await add(id);
  await send(id);
  const sent = await snapshot();
  await fails(add(id));
  await fails(send(id));
  expect(await snapshot()).toEqual(sent);
  await receive(id);
  const before = await snapshot();
  await fails(add(id));
  await fails(receive(id));
  await fails(cancel(id));
  expect(await snapshot()).toEqual(before);
});

it("numera con el contador de la sucursal y muestra OC-00001 y OC-00002", async () => {
  await create();
  await create(actors.admin);
  expect((await snapshot()).orders.map((row) => formatPurchaseNumber(row.number))).toEqual([
    "OC-00001",
    "OC-00002",
  ]);
  expect(
    (await snapshot()).branches.find((row) => row.id === owner.branchId)?.nextPurchaseNumber,
  ).toBe(3);
  await test.db
    .update(branches)
    .set({ nextPurchaseNumber: 42 })
    .where(eq(branches.id, owner.branchId));
  const id = await create();
  expect(await getPurchase(test.db, owner, id)).toMatchObject({ number: 42 });
  expect(formatPurchaseNumber(123456)).toBe("OC-123456");
});

it.each(["reception", "mechanic"] as const)(
  "rechaza todas las escrituras y oculta compras y costos a %s",
  async (role) => {
    const id = await create();
    await add(id);
    const before = await snapshot();
    const actor = actors[role];
    await fails(supply(FORM, actor), "forbidden");
    await fails(edit(supplierId, FORM, actor), "forbidden");
    await fails(createPurchase(test.db, actor, { supplierId }, NOW), "forbidden");
    const item = { productId, quantity: 1, unitCostClp: 1 };
    await fails(addPurchaseItem(test.db, actor, id, item, NOW), "forbidden");
    await fails(send(id, actor), "forbidden");
    await fails(receivePurchase(test.db, actor, id, {}, NOW), "forbidden");
    await fails(cancel(id, "Duplicada", actor), "forbidden");
    expect(await listSuppliers(test.db, actor)).toEqual([]);
    expect(await listPurchases(test.db, actor)).toEqual([]);
    expect(await getPurchase(test.db, actor, id)).toBeNull();
    expect(await snapshot()).toEqual(before);
  },
);

it("normaliza RUT, traduce duplicados al crear y editar y permite el mismo RUT en otra sucursal", async () => {
  expect(await listSuppliers(test.db, owner)).toMatchObject([{ rut: "12345678-5" }]);
  const before = await snapshot();
  await fails(supply({ ...FORM, rut: "12.345.678-9" }), "validation_error");
  await fails(supply({ ...FORM, rut: "123456785" }), "rut_exists");
  expect(await snapshot()).toEqual(before);
  const second = await createSupplier(test.db, owner, { name: "Otro proveedor" }, NOW);
  if (!second.ok) throw new Error("Falta proveedor");
  const snapshotBeforeUpdate = await snapshot();
  await fails(edit(second.supplierId), "rut_exists");
  expect(await snapshot()).toEqual(snapshotBeforeUpdate);
  expect(await supply(FORM, other)).toMatchObject({ ok: true });
});

it("edita proveedor sin filtrar datos personales a la auditoría", async () => {
  const input = { ...FORM, name: "Proveedor actualizado", isActive: false };
  expect(await edit(supplierId, input, actors.admin)).toMatchObject({ ok: true });
  expect(await listSuppliers(test.db, owner)).toMatchObject([
    { name: "Proveedor actualizado", isActive: false, updatedAt: LATER },
  ]);
  const audits = (await snapshot()).audits.filter((row) => row.entity === "supplier");
  expect(audits.map((row) => row.action)).toEqual(["supplier.created", "supplier.updated"]);
  const text = JSON.stringify(audits);
  for (const value of [FORM.phone, FORM.email, FORM.rut, "12345678-5"])
    expect(text).not.toContain(value);
});

it.each(["borrador", "enviada"])(
  "anula %s sin borrar filas ni mover stock y conserva autor y motivo redactado",
  async (status) => {
    const id = await create();
    await add(id);
    if (status === "enviada") await send(id);
    expect(await cancel(id, "Duplicada contacto@ejemplo.cl")).toMatchObject({ ok: true });
    const data = await snapshot();
    expect(data.orders).toMatchObject([{ status: "anulada", voidedAt: LATER, voidedBy: owner.id }]);
    expect(data.items).toHaveLength(1);
    expect(data.movements).toHaveLength(0);
    expect(data.audits.find((row) => row.action === "purchase.voided")?.details).toMatchObject({
      reason: "Duplicada [redactado]",
    });
    const before = await snapshot();
    await fails(add(id));
    await fails(receive(id));
    await fails(send(id));
    await fails(cancel(id));
    expect(await snapshot()).toEqual(before);
  },
);

it("exige al menos una línea para recibir", async () => {
  const id = await create();
  const before = await snapshot();
  await fails(receive(id));
  expect(await snapshot()).toEqual(before);
});

it("valida proveedores antes de escribir", async () => {
  const before = await snapshot();
  expect(
    supplierFormSchema.parse({ name: "Proveedor", rut: "", phone: "", email: "", notes: "" }),
  ).toMatchObject({ rut: null, phone: null, email: null, notes: null });
  for (const input of [
    { name: "x" },
    { name: "x".repeat(121) },
    { phone: "x".repeat(31) },
    { email: "correo" },
    { notes: "x".repeat(501) },
  ]) {
    await fails(supply({ ...FORM, ...input }), "validation_error");
    await fails(edit(supplierId, { ...FORM, ...input }), "validation_error");
  }
  await fails(edit("otro"), "validation_error");
  expect(await snapshot()).toEqual(before);
});

it("valida entradas de compras antes de escribir", async () => {
  const id = await create();
  const before = await snapshot();
  for (const input of [
    { quantity: 0 },
    { quantity: 10001 },
    { quantity: 1.5 },
    { quantity: true },
    { unitCostClp: -1 },
    { unitCostClp: 10000001 },
    { unitCostClp: "" },
    { productId: "otro" },
  ]) {
    const item = { productId, quantity: 1, unitCostClp: 1, ...input };
    await fails(addPurchaseItem(test.db, owner, id, item, NOW), "validation_error");
  }
  await fails(createPurchase(test.db, owner, { supplierId: "otro" }, NOW), "validation_error");
  await fails(receivePurchase(test.db, owner, id, { docType: "otro" }, NOW), "validation_error");
  await fails(cancel(id, "ab"), "validation_error");
  await fails(cancel(id, "x".repeat(201)), "validation_error");
  await fails(send("otro"), "validation_error");
  expect(await snapshot()).toEqual(before);
});

it("acota proveedores, productos y cada operación de compra a la sucursal", async () => {
  const id = await create();
  const foreignSupplier = await createSupplier(test.db, other, FORM, NOW);
  if (!foreignSupplier.ok) throw new Error("Falta proveedor");
  const foreignProduct = await product("OTRO", other);
  const before = await snapshot();
  const input = { supplierId: foreignSupplier.supplierId };
  await fails(createPurchase(test.db, owner, input, NOW), "not_found");
  await fails(add(id, 1000, foreignProduct), "not_found");
  await fails(edit(supplierId, FORM, other), "not_found");
  const item = { productId, quantity: 1, unitCostClp: 1 };
  await fails(addPurchaseItem(test.db, other, id, item, NOW), "not_found");
  await fails(send(id, other), "not_found");
  await fails(receivePurchase(test.db, other, id, {}, NOW), "not_found");
  await fails(cancel(id, "Duplicada", other), "not_found");
  expect(await listPurchases(test.db, other)).toEqual([]);
  expect(await getPurchase(test.db, other, id)).toBeNull();
  expect(await getPurchase(test.db, owner, randomUUID())).toBeNull();
  expect(await getPurchase(test.db, owner, "otro")).toBeNull();
  expect(await snapshot()).toEqual(before);
});

it("revierte líneas, stock, estado y movimiento si falla la auditoría de recepción", async () => {
  const id = await create();
  await add(id);
  await test.client.exec(
    "alter table audit_log add constraint reject_receipt check (action <> 'purchase.received')",
  );
  const before = await snapshot();
  await expect(receive(id)).rejects.toThrow();
  expect(await snapshot()).toEqual(before);
});

it("revierte la primera línea si un movimiento posterior falla con un centinela", async () => {
  const second = await product("CAD-02");
  const id = await create();
  const ids = [productId, second].sort();
  for (const product of ids) await add(id, 1000, product);
  await test.client.query("alter table products drop constraint products_stock_qty_check");
  await test.client.exec(
    `alter table products add constraint products_stock_qty_check check (id <> '${ids[1]}' or stock_qty = 0)`,
  );
  const before = await snapshot();
  expect(await receive(id)).toEqual({ ok: false, code: "out_of_stock" });
  expect(await snapshot()).toEqual(before);
});

it("revierte numeración y creación cuando falla su auditoría", async () => {
  await test.client.exec(
    "alter table audit_log add constraint reject_creation check (action <> 'purchase.created')",
  );
  const before = await snapshot();
  await expect(create()).rejects.toThrow();
  expect(await snapshot()).toEqual(before);
});

it("centraliza estados, documentos y rótulos", () => {
  const statuses = PURCHASE_STATUSES.map((status) => PURCHASE_STATUS_LABELS[status]);
  const types = PURCHASE_DOC_TYPES.map((type) => PURCHASE_DOC_TYPE_LABELS[type]);
  expect(statuses).toEqual(["Borrador", "Enviada", "Recibida", "Anulada"]);
  expect(types).toEqual(["Factura", "Boleta", "Guía de despacho"]);
});
