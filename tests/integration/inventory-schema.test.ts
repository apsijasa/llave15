import { afterEach, beforeEach, expect, it } from "vitest";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

type Values = Record<string, string | number | boolean | null | undefined>;
type Row = Record<string, unknown> & { id: string };
type Table =
  | "branches"
  | "users"
  | "customers"
  | "bikes"
  | "work_orders"
  | "work_order_items"
  | "suppliers"
  | "products"
  | "stock_movements"
  | "purchase_orders"
  | "purchase_order_items";
let test: TestDb;
let branchId: string;
let userId: string;
let customerId: string;
let bikeId: string;

async function insert(table: Table, values: Values): Promise<Row> {
  const keys = Object.keys(values);
  const shopColumn = table === "branches" ? "shop_id, " : "";
  const shopValue =
    table === "branches" ? "(select id from shops where slug = 'vector-bikes'), " : "";
  const result = await test.client.query<Row>(
    `insert into ${table} (${shopColumn}${keys.join(", ")})
     values (${shopValue}${keys.map((_, index) => `$${index + 1}`).join(", ")}) returning *`,
    Object.values(values),
  );
  const row = result.rows[0];
  if (!row) throw new Error("Falta la fila de prueba");
  return row;
}

function product(values: Values = {}) {
  return insert("products", {
    branch_id: branchId,
    sku: "REP-01",
    name: "Cadena",
    category: "repuesto",
    price_clp: 10000,
    created_by: userId,
    ...values,
  });
}

function supplier(values: Values = {}) {
  return insert("suppliers", { branch_id: branchId, name: "Proveedor", ...values });
}

function order(values: Values = {}) {
  return insert("work_orders", {
    branch_id: branchId,
    number: 1,
    customer_id: customerId,
    bike_id: bikeId,
    requested_service: "Mantención",
    created_by: userId,
    ...values,
  });
}

function purchase(supplierId: string, values: Values = {}) {
  return insert("purchase_orders", {
    branch_id: branchId,
    supplier_id: supplierId,
    number: 1,
    created_by: userId,
    ...values,
  });
}

function movement(productId: string, values: Values = {}) {
  return insert("stock_movements", {
    branch_id: branchId,
    product_id: productId,
    kind: "compra",
    quantity: 1,
    created_by: userId,
    ...values,
  });
}

function orderItem(workOrderId: string, values: Values = {}) {
  return insert("work_order_items", {
    branch_id: branchId,
    work_order_id: workOrderId,
    kind: "repuesto",
    origin: "inicial",
    description: "Cadena",
    unit_price_clp: 10000,
    created_by: userId,
    ...values,
  });
}

beforeEach(async () => {
  test = await createTestDb();
  branchId = (await insert("branches", { name: "Sucursal de prueba" })).id;
  userId = (
    await insert("users", {
      branch_id: branchId,
      email: "owner@ejemplo.cl",
      password_hash: "test-hash",
      name: "Dueño",
      role: "owner",
    })
  ).id;
  customerId = (
    await insert("customers", {
      branch_id: branchId,
      name: "Cliente",
      phone_e164: "+56912345678",
    })
  ).id;
  bikeId = (
    await insert("bikes", {
      branch_id: branchId,
      customer_id: customerId,
      brand: "Marca",
      model: "Ruta",
      bike_type: "ruta",
    })
  ).id;
});

afterEach(async () => {
  await test.close();
});

it("crea las cinco tablas con sucursal obligatoria e instantes", async () => {
  const columns = await test.client.query<{
    table_name: string;
    column_name: string;
    is_nullable: string;
  }>(
    "select table_name, column_name, is_nullable from information_schema.columns where table_schema = 'public'",
  );
  for (const table of [
    "suppliers",
    "products",
    "stock_movements",
    "purchase_orders",
    "purchase_order_items",
  ]) {
    for (const column of ["id", "branch_id", "created_at", "updated_at"]) {
      expect(columns.rows).toContainEqual({
        table_name: table,
        column_name: column,
        is_nullable: "NO",
      });
    }
  }
});

it("conserva los defaults de sucursal y orden en régimen final", async () => {
  const branches = await test.client.query(
    "select next_purchase_number, new_order_pricing_mode from branches",
  );
  expect(branches.rows).toEqual([{ next_purchase_number: 1, new_order_pricing_mode: "final" }]);
  expect(await order({ total_clp: 30000 })).toMatchObject({
    pricing_mode: "final",
    subtotal_clp: 0,
    vat_clp: 0,
    total_clp: 30000,
  });
});

it.each([
  { next_purchase_number: 0 },
  { next_purchase_number: -1 },
  { new_order_pricing_mode: "otro" },
])("rechaza configuración de sucursal inválida %j", async (values) => {
  await expect(insert("branches", { name: "Otra", ...values })).rejects.toMatchObject({
    code: "23514",
  });
});

it.each(["final", "neto"])("acepta el régimen %s", async (mode) => {
  expect(await insert("branches", { name: "Otra", new_order_pricing_mode: mode })).toMatchObject({
    new_order_pricing_mode: mode,
  });
  expect(
    await order({ pricing_mode: mode, subtotal_clp: 10000, vat_clp: 1900, total_clp: 11900 }),
  ).toMatchObject({ pricing_mode: mode });
});

it.each([
  { pricing_mode: "otro" },
  { subtotal_clp: -1 },
  { vat_clp: -1 },
  { pricing_mode: "neto", subtotal_clp: 10000, vat_clp: 1900, total_clp: 10000 },
])("rechaza precios de orden inválidos %j", async (values) => {
  await expect(order(values)).rejects.toMatchObject({ code: "23514" });
});

it("acepta productos sin código de barras y aplica sus defaults", async () => {
  expect(await product()).toMatchObject({
    unit: "unidad",
    cost_clp: 0,
    stock_qty: 0,
    min_stock: 0,
    barcode: null,
    is_active: true,
  });
  await product({ sku: "REP-02" });
});

it.each(["repuesto", "accesorio", "insumo", "bicicleta_usada"])(
  "acepta categoría %s",
  async (category) => {
    expect(
      await product({ category, serial_number: category === "bicicleta_usada" ? "SER-01" : null }),
    ).toMatchObject({ category });
  },
);

it.each([
  { stock_qty: -1 },
  { cost_clp: -1 },
  { price_clp: -1 },
  { min_stock: -1 },
  { category: "otro" },
  { category: "bicicleta_usada" },
])("rechaza producto inválido %j", async (values) => {
  await expect(product(values)).rejects.toMatchObject({ code: "23514" });
});

it("exige SKU y código de barras únicos por sucursal", async () => {
  await product({ barcode: "123" });
  await expect(product({ barcode: "456" })).rejects.toMatchObject({ code: "23505" });
  await expect(product({ sku: "REP-02", barcode: "123" })).rejects.toMatchObject({ code: "23505" });
  const other = await insert("branches", { name: "Otra" });
  await product({ branch_id: other.id, barcode: "123" });
});

it("exige RUT de proveedor único por sucursal, permite nulos y aplica defaults", async () => {
  expect(await supplier({ rut: "12345678-5" })).toMatchObject({ is_active: true });
  await expect(supplier({ rut: "12345678-5" })).rejects.toMatchObject({ code: "23505" });
  await supplier();
  await supplier();
  const other = await insert("branches", { name: "Otra" });
  await supplier({ branch_id: other.id, rut: "12345678-5" });
});

it.each([
  { kind: "compra", quantity: 1 },
  { kind: "devolucion", quantity: 1 },
  { kind: "venta", quantity: -1 },
  { kind: "consumo_orden", quantity: -1 },
  { kind: "ajuste", quantity: 1 },
  { kind: "ajuste", quantity: -1 },
  { kind: "anulacion", quantity: 1 },
  { kind: "anulacion", quantity: -1 },
])("acepta movimiento %j", async (values) => {
  expect(
    await movement((await product()).id, { ...values, note: "Conteo", unit_cost_clp: 0 }),
  ).toMatchObject(values);
});

it.each([
  { kind: "otro" },
  { quantity: 0 },
  { kind: "compra", quantity: -1 },
  { kind: "devolucion", quantity: -1 },
  { kind: "venta", quantity: 1 },
  { kind: "consumo_orden", quantity: 1 },
  { unit_cost_clp: -1 },
  { reference_kind: "otro", reference_id: "00000000-0000-0000-0000-000000000001" },
  { reference_kind: "import" },
  { reference_id: "00000000-0000-0000-0000-000000000001" },
  { kind: "ajuste" },
])("rechaza movimiento inválido %j", async (values) => {
  await expect(movement((await product()).id, values)).rejects.toMatchObject({ code: "23514" });
});

it.each(["purchase_order", "work_order_item", "sale", "sale_refund", "import"])(
  "acepta referencia %s",
  async (referenceKind) => {
    expect(
      await movement((await product()).id, {
        reference_kind: referenceKind,
        reference_id: branchId,
      }),
    ).toMatchObject({ reference_kind: referenceKind, reference_id: branchId, unit_cost_clp: null });
  },
);

it("crea compras en borrador y exige número único por sucursal", async () => {
  const provider = await supplier();
  expect(await purchase(provider.id)).toMatchObject({
    status: "borrador",
    voided_at: null,
    received_at: null,
  });
  await expect(purchase(provider.id)).rejects.toMatchObject({ code: "23505" });
  const other = await insert("branches", { name: "Otra" });
  await purchase(provider.id, { branch_id: other.id });
});

it.each([
  { status: "enviada" },
  { doc_type: "factura" },
  { doc_type: "boleta" },
  { doc_type: "guia" },
  { status: "recibida", received_at: "2026-11-13T12:00:00Z" },
  { status: "anulada", voided_at: "2026-11-13T12:00:00Z" },
])("acepta compra válida %j", async (values) => {
  await purchase((await supplier()).id, { received_by: userId, voided_by: userId, ...values });
});

it.each([
  { number: 0 },
  { status: "otro" },
  { doc_type: "otro" },
  { status: "recibida" },
  { status: "recibida", received_at: "2026-11-13T12:00:00Z" },
  { status: "recibida", received_by: null },
  { status: "anulada" },
  { voided_at: "2026-11-13T12:00:00Z" },
])("rechaza compra inválida %j", async (values) => {
  const row = "received_by" in values ? { ...values, received_by: userId } : values;
  await expect(purchase((await supplier()).id, row)).rejects.toMatchObject({ code: "23514" });
});

it("aplica cantidad recibida cero y acepta recepción completa", async () => {
  const purchaseId = (await purchase((await supplier()).id)).id;
  const row = {
    branch_id: branchId,
    purchase_order_id: purchaseId,
    product_id: (await product()).id,
    quantity: 2,
    unit_cost_clp: 0,
  };
  expect(await insert("purchase_order_items", row)).toMatchObject({ received_qty: 0 });
  expect(await insert("purchase_order_items", { ...row, received_qty: 2 })).toMatchObject({
    received_qty: 2,
  });
});

it.each([
  { quantity: 0 },
  { quantity: -1 },
  { unit_cost_clp: -1 },
  { received_qty: -1 },
  { received_qty: 3 },
])("rechaza línea de compra inválida %j", async (values) => {
  const purchaseId = (await purchase((await supplier()).id)).id;
  await expect(
    insert("purchase_order_items", {
      branch_id: branchId,
      purchase_order_id: purchaseId,
      product_id: (await product()).id,
      quantity: 2,
      unit_cost_clp: 1000,
      ...values,
    }),
  ).rejects.toMatchObject({ code: "23514" });
});

it("permite líneas legadas y congela costo cero al vincular repuestos", async () => {
  const workOrderId = (await order()).id;
  expect(await orderItem(workOrderId, { kind: "servicio" })).toMatchObject({
    product_id: null,
    unit_cost_clp: null,
  });
  expect(
    await orderItem(workOrderId, { product_id: (await product()).id, unit_cost_clp: 0 }),
  ).toMatchObject({ unit_cost_clp: 0 });
});

it.each([{ unit_cost_clp: -1 }, { unit_cost_clp: null }, { kind: "servicio", unit_cost_clp: 0 }])(
  "rechaza vínculo de producto inválido %j",
  async (values) => {
    await expect(
      orderItem((await order()).id, { product_id: (await product()).id, ...values }),
    ).rejects.toMatchObject({ code: "23514" });
  },
);
