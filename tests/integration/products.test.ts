import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { ROLES } from "../../src/server/auth/permissions.ts";
import { products, stockMovements, suppliers } from "../../src/server/db/schema-inventory.ts";
import { auditLog } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import {
  adjustStock,
  createProduct,
  getProduct,
  listProducts,
  productFormSchema,
  updateProduct,
} from "../../src/server/taller/products.ts";
import { applyStockMovement } from "../../src/server/taller/stock.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-13T15:00:00Z");
const LATER = new Date("2026-11-13T15:01:00Z");
const FORM = { sku: "REP-01", name: "Cadena", category: "repuesto", costClp: 1000, priceClp: 2000 };
let test: TestDb;
let actors: Record<(typeof ROLES)[number], SessionUser>;
let otherBranchId: string;
let owner: SessionUser;

beforeEach(async () => {
  test = await createTestDb();
  const [branch, other] = await test.db
    .insert(branches)
    .values([{ name: "Sucursal principal" }, { name: "Otra sucursal" }])
    .returning();
  if (!branch || !other) throw new Error("Faltan sucursales");
  otherBranchId = other.id;
  actors = {} as typeof actors;
  for (const role of ROLES) {
    const [user] = await test.db
      .insert(users)
      .values({
        branchId: branch.id,
        role,
        name: `Usuario ${role}`,
        email: `${role}@ejemplo.cl`,
        passwordHash: "hash-de-prueba",
      })
      .returning();
    if (!user) throw new Error("Falta usuario");
    actors[role] = { id: user.id, branchId: branch.id, role, name: user.name, email: user.email };
  }
  owner = actors.owner;
});

afterEach(async () => {
  await test.close();
});

async function create(values: Record<string, unknown> = {}) {
  const result = await createProduct(test.db, owner, { ...FORM, ...values }, NOW);
  if (!result.ok) throw new Error(`No se creó el producto: ${result.code}`);
  return result.productId;
}

const movements = () => test.db.select().from(stockMovements);
const audits = () => test.db.select().from(auditLog);
const adjust = (id: string, quantity = 5, reason = "Conteo", actor = owner) =>
  adjustStock(test.db, actor, id, { quantity, reason }, LATER);

const update = (id: string, input: Record<string, unknown>, actor = owner) =>
  updateProduct(test.db, actor, id, { ...FORM, ...input }, LATER);

async function row(id: string) {
  const [product] = await test.db.select().from(products).where(eq(products.id, id));
  if (!product) throw new Error("Falta producto");
  return product;
}

it("registra ajuste, motivo y autor junto con auditoría", async () => {
  const id = await create();
  expect(await adjust(id, 5, "Conteo físico", actors.admin)).toMatchObject({
    ok: true,
    stockQty: 5,
  });
  expect(await row(id)).toMatchObject({ stockQty: 5, updatedAt: LATER });
  expect(await movements()).toMatchObject([
    {
      productId: id,
      branchId: owner.branchId,
      kind: "ajuste",
      quantity: 5,
      note: "Conteo físico",
      createdBy: actors.admin.id,
      createdAt: LATER,
      updatedAt: LATER,
    },
  ]);
  const audit = await audits().where(eq(auditLog.action, "stock.adjusted"));
  expect(audit).toMatchObject([
    {
      actorUserId: actors.admin.id,
      branchId: actors.admin.branchId,
      entityId: id,
      details: { productId: id, quantity: 5, reason: "Conteo físico" },
      createdAt: LATER,
    },
  ]);
});

it("acepta solo el primer consumo y conserva un único movimiento de consumo", async () => {
  const id = await create({ stockQty: 1 });
  const consume = () =>
    test.db.transaction((tx) =>
      applyStockMovement(
        tx,
        actors.mechanic,
        {
          productId: id,
          kind: "consumo_orden",
          quantity: -1,
        },
        LATER,
      ),
    );
  expect(await consume()).toMatchObject({ ok: true, stockQty: 0 });
  expect(await consume()).toEqual({ ok: false, code: "out_of_stock" });
  expect((await row(id)).stockQty).toBe(0);
  expect(await movements().where(eq(stockMovements.kind, "consumo_orden"))).toHaveLength(1);
  expect(await adjust(id, -1)).toEqual({ ok: false, code: "out_of_stock" });
  expect(await audits().where(eq(auditLog.action, "stock.adjusted"))).toHaveLength(0);
});

it("la base rechaza stock negativo con 23514", async () => {
  const id = await create();
  await expect(
    test.client.query("update products set stock_qty = -1 where id = $1", [id]),
  ).rejects.toMatchObject({ code: "23514", constraint: "products_stock_qty_check" });
});

it.each([
  { stockQty: 5, costClp: 1000, quantity: 5, unitCostClp: 1300, expected: 1150 },
  { stockQty: 0, costClp: 900, quantity: 3, unitCostClp: 1300, expected: 1300 },
  { stockQty: 2, costClp: 1000, quantity: 1, unitCostClp: 1001, expected: 1000 },
  { stockQty: 5, costClp: 1000, quantity: 5, unitCostClp: 0, expected: 500 },
])("calcula costo promedio ponderado de compra %j", async (values) => {
  const id = await create({ stockQty: values.stockQty, costClp: values.costClp });
  const referenceId = randomUUID();
  const result = await test.db.transaction((tx) =>
    applyStockMovement(
      tx,
      owner,
      {
        productId: id,
        kind: "compra",
        quantity: values.quantity,
        unitCostClp: values.unitCostClp,
        referenceKind: "purchase_order",
        referenceId,
      },
      LATER,
    ),
  );
  expect(result).toMatchObject({
    ok: true,
    costClp: values.expected,
    stockQty: values.stockQty + values.quantity,
  });
  expect(await row(id)).toMatchObject({ costClp: values.expected, updatedAt: LATER });
  expect(await movements().where(eq(stockMovements.kind, "compra"))).toMatchObject([
    { unitCostClp: values.unitCostClp, referenceKind: "purchase_order", referenceId },
  ]);
});

it.each(ROLES)("omite o incluye las claves de costo para %s", async (role) => {
  const id = await create({ stockQty: 1 });
  const actor = actors[role];
  const list = await listProducts(test.db, actor, {});
  const detail = await getProduct(test.db, actor, id);
  expect(list).toHaveLength(1);
  expect(detail?.movements).toHaveLength(1);
  for (const product of [list[0], detail]) {
    expect(product).toBeTruthy();
    expect(Object.hasOwn(product ?? {}, "costClp")).toBe(role === "owner" || role === "admin");
  }
  const movement = detail?.movements[0];
  expect(Object.hasOwn(movement ?? {}, "unitCostClp")).toBe(role === "owner" || role === "admin");
  expect(movement).toMatchObject({ actorName: owner.name });
});

it.each(["reception", "mechanic"] as const)(
  "rechaza todas las escrituras de %s sin cambios",
  async (role) => {
    const id = await create();
    const before = await row(id);
    const actor = actors[role];
    expect(await createProduct(test.db, actor, { ...FORM, sku: "OTRO" }, NOW)).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(await update(id, { priceClp: 9999 }, actor)).toEqual({ ok: false, code: "forbidden" });
    expect(await adjust(id, 5, "Conteo", actor)).toEqual({ ok: false, code: "forbidden" });
    expect(await test.db.select().from(products)).toEqual([before]);
    expect(await movements()).toHaveLength(0);
    expect(await audits()).toHaveLength(1);
  },
);

it("crea stock inicial mediante un ajuste y edita precio y costo sin tocar stock", async () => {
  const id = await create({ stockQty: 5 });
  expect(await movements()).toMatchObject([
    {
      kind: "ajuste",
      quantity: 5,
      note: "Stock inicial",
      createdBy: owner.id,
    },
  ]);
  expect(
    await update(
      id,
      { stockQty: 99, priceClp: 3000, costClp: 1500, isActive: false },
      actors.admin,
    ),
  ).toMatchObject({ ok: true });
  expect(await row(id)).toMatchObject({
    stockQty: 5,
    priceClp: 3000,
    costClp: 1500,
    isActive: false,
  });
  expect(await movements()).toHaveLength(1);
  expect(await audits()).toMatchObject([
    { action: "product.created", actorUserId: owner.id },
    {
      action: "product.updated",
      actorUserId: actors.admin.id,
      details: {
        before: { priceClp: 2000, costClp: 1000 },
        after: { priceClp: 3000, costClp: 1500 },
      },
    },
  ]);
});

it("traduce duplicados y revierte la operación sin movimiento ni auditoría extra", async () => {
  const id = await create({ barcode: "123" });
  const second = await create({ sku: "REP-02" });
  expect(await createProduct(test.db, owner, { ...FORM, stockQty: 5 }, LATER)).toEqual({
    ok: false,
    code: "sku_exists",
  });
  expect(await update(second, FORM)).toEqual({ ok: false, code: "sku_exists" });
  expect(
    await createProduct(test.db, owner, { ...FORM, sku: "REP-03", barcode: "123" }, LATER),
  ).toEqual({ ok: false, code: "sku_exists" });
  expect((await row(second)).sku).toBe("REP-02");
  expect((await row(id)).stockQty).toBe(0);
  expect(await movements()).toHaveLength(0);
  expect(await audits()).toHaveLength(2);
});

it.each(["auditoría", "CHECK"])("revierte stock y movimiento si falla %s", async (failure) => {
  const id = await create();
  const constraint =
    failure === "CHECK"
      ? `alter table products drop constraint products_stock_qty_check;
       alter table products add constraint products_stock_qty_check check (stock_qty = 0)`
      : "alter table audit_log add constraint test_reject_adjustment check (action <> 'stock.adjusted')";
  await test.client.exec(constraint);
  if (failure === "CHECK") expect(await adjust(id)).toEqual({ ok: false, code: "out_of_stock" });
  else await expect(adjust(id)).rejects.toThrow();
  expect((await row(id)).stockQty).toBe(0);
  expect(await movements()).toHaveLength(0);
});

it("filtra búsqueda sin mayúsculas, categoría y activos bajo mínimo incluyendo igualdad", async () => {
  const id = await create({ stockQty: 2, minStock: 2, barcode: "COD-abc" });
  await create({ sku: "ACC-01", name: "Casco", category: "accesorio", minStock: 0 });
  const inactive = await create({ sku: "INA-01", minStock: 5 });
  await update(inactive, { sku: "INA-01", minStock: 5, isActive: false });
  for (const q of ["rep-01", "CADENA", "cod-ABC"]) {
    expect((await listProducts(test.db, owner, { q, lowOnly: true })).map((p) => p.id)).toEqual([
      id,
    ]);
  }
  expect(
    (await listProducts(test.db, owner, { category: "accesorio" })).map((p) => p.name),
  ).toEqual(["Casco"]);
  expect((await listProducts(test.db, owner, { lowOnly: true })).map((p) => p.id)).toEqual([id]);
});

it("acota todas las operaciones y proveedores a la sucursal del actor", async () => {
  const id = await create();
  const other = { ...owner, branchId: otherBranchId };
  expect(await listProducts(test.db, other, {})).toEqual([]);
  expect(await getProduct(test.db, other, id)).toBeNull();
  expect(await update(id, FORM, other)).toEqual({ ok: false, code: "not_found" });
  expect(await adjust(id, 1, "Conteo", other)).toEqual({ ok: false, code: "not_found" });
  expect(
    await test.db.transaction((tx) =>
      applyStockMovement(tx, other, { productId: id, kind: "venta", quantity: -1 }, LATER),
    ),
  ).toEqual({ ok: false, code: "not_found" });
  const [supplier] = await test.db
    .insert(suppliers)
    .values({ branchId: otherBranchId, name: "Proveedor" })
    .returning();
  if (!supplier) throw new Error("Falta proveedor");
  expect(
    await createProduct(test.db, owner, { ...FORM, sku: "OTRO", supplierId: supplier.id }, NOW),
  ).toEqual({ ok: false, code: "not_found" });
});

it("limita la lista a 300 y la ficha a los últimos 50 movimientos", async () => {
  const id = await create();
  await test.client.query(
    `insert into products (branch_id, sku, name, category, price_clp, created_by)
    select $1, 'P-' || i, 'Producto', 'repuesto', 0, $2 from generate_series(1,301) i`,
    [owner.branchId, owner.id],
  );
  await test.client.query(
    `insert into stock_movements
    (branch_id, product_id, kind, quantity, note, created_by, created_at)
    select $1, $2, 'anulacion', 1, 'Movimiento ' || i, $3,
      $4::timestamptz + i * interval '1 second' from generate_series(0,50) i`,
    [owner.branchId, id, owner.id, NOW.toISOString()],
  );
  expect(await listProducts(test.db, owner, {})).toHaveLength(300);
  const detail = await getProduct(test.db, owner, id);
  expect(detail?.movements).toHaveLength(50);
  expect(detail?.movements[0]?.note).toBe("Movimiento 50");
  expect(detail?.movements[49]?.note).toBe("Movimiento 1");
});

it("valida formulario, defaults y límites antes de escribir", async () => {
  expect(
    productFormSchema.parse({ ...FORM, barcode: "", serialNumber: "", supplierId: "" }),
  ).toMatchObject({
    unit: "unidad",
    stockQty: 0,
    minStock: 0,
    barcode: null,
    serialNumber: null,
    supplierId: null,
  });
  for (const invalid of [
    { sku: "A B" },
    { sku: "x".repeat(41) },
    { name: "x" },
    { name: "x".repeat(121) },
    { category: "otro" },
    { category: "bicicleta_usada", serialNumber: " " },
    { unit: "" },
    { unit: "x".repeat(21) },
    { costClp: -1 },
    { priceClp: 10_000_001 },
    { costClp: 1.5 },
    { priceClp: true },
    { priceClp: "" },
    { stockQty: 100_001 },
    { stockQty: -1 },
    { minStock: -1 },
    { minStock: 100_001 },
    { barcode: "x".repeat(65) },
    { serialNumber: "x".repeat(81) },
    { supplierId: "otro" },
  ]) {
    expect(await createProduct(test.db, owner, { ...FORM, ...invalid }, NOW)).toEqual({
      ok: false,
      code: "validation_error",
    });
  }
  expect(await test.db.select().from(products)).toHaveLength(0);
  expect(await audits()).toHaveLength(0);
});

it("rechaza ajustes inválidos y permite crear una bicicleta usada con serie", async () => {
  const id = await create({ category: "bicicleta_usada", serialNumber: "SER-01" });
  for (const invalid of [
    { quantity: 0, reason: "Conteo" },
    { quantity: 1.5, reason: "Conteo" },
    { quantity: -100_001, reason: "Conteo" },
    { quantity: 100_001, reason: "Conteo" },
    { quantity: 1, reason: "ab" },
    { quantity: 1, reason: "x".repeat(201) },
  ]) {
    expect(await adjustStock(test.db, owner, id, invalid, LATER)).toEqual({
      ok: false,
      code: "validation_error",
    });
  }
  expect(await update(id, { priceClp: -1 })).toEqual({ ok: false, code: "validation_error" });
  expect((await row(id)).stockQty).toBe(0);
  expect(await movements()).toHaveLength(0);
});
