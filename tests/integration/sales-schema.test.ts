import { afterEach, beforeEach, expect, it } from "vitest";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

type Values = Record<string, string | number | null | undefined>;
type Row = Record<string, unknown> & { id: string };
type Table = "branches" | "users" | "customers" | "products" | "sales" | "sale_items";
const voidedAt = "2026-11-14T12:00:00Z";
const missingId = "00000000-0000-0000-0000-000000000001";
let test: TestDb;
let branchId: string;
let userId: string;
let productId: string;

async function insert(table: Table, values: Values): Promise<Row> {
  const keys = Object.keys(values);
  const result = await test.client.query<Row>(
    `insert into ${table} (${keys.join(", ")})
     values (${keys.map((_, index) => `$${index + 1}`).join(", ")}) returning *`,
    Object.values(values),
  );
  const row = result.rows[0];
  if (!row) throw new Error("Falta la fila de prueba");
  return row;
}

function sale(values: Values = {}) {
  return insert("sales", {
    branch_id: branchId,
    number: 1,
    subtotal_clp: 5000,
    vat_clp: 950,
    total_clp: 5950,
    created_by: userId,
    ...values,
  });
}

function item(saleId: string, values: Values = {}) {
  return insert("sale_items", {
    branch_id: branchId,
    sale_id: saleId,
    product_id: productId,
    description: "Cadena",
    quantity: 1,
    unit_price_clp: 5000,
    unit_cost_clp: 3000,
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
  productId = (
    await insert("products", {
      branch_id: branchId,
      sku: "REP-01",
      name: "Cadena",
      category: "repuesto",
      price_clp: 5000,
      cost_clp: 3000,
      created_by: userId,
    })
  ).id;
});

afterEach(async () => {
  await test.close();
});

it("crea ventas y líneas con sucursal obligatoria e instantes UTC", async () => {
  const result = await test.client.query(
    `select table_name, column_name, is_nullable, data_type from information_schema.columns
     where table_schema = 'public' and table_name in ('sales', 'sale_items')`,
  );
  for (const table of ["sales", "sale_items"]) {
    for (const column of ["id", "branch_id", "created_at", "updated_at"]) {
      expect(result.rows).toContainEqual({
        table_name: table,
        column_name: column,
        is_nullable: "NO",
        data_type: column.endsWith("_at") ? "timestamp with time zone" : "uuid",
      });
    }
  }
});

it("aplica contador inicial 1 y defaults de venta abierta sin cliente", async () => {
  const result = await test.client.query("select next_sale_number from branches");
  expect(result.rows).toEqual([{ next_sale_number: 1 }]);
  expect(await sale()).toMatchObject({
    status: "abierta",
    customer_id: null,
    discount_clp: 0,
    discount_reason: null,
    paid_clp: 0,
    doc_type: null,
    doc_number: null,
    void_reason: null,
    voided_at: null,
    voided_by: null,
  });
});

it.each([0, -1])("rechaza contador de venta %i", async (number) => {
  await expect(
    insert("branches", { name: "Otra", next_sale_number: number }),
  ).rejects.toMatchObject({ code: "23514" });
});

it.each([
  { number: 0 },
  { number: -1 },
  { status: "otro" },
  { subtotal_clp: -1, vat_clp: 1, total_clp: 0 },
  { vat_clp: -1, total_clp: 4999 },
  { subtotal_clp: 0, vat_clp: 0, total_clp: -1 },
  { discount_clp: -1, discount_reason: "Ajuste" },
  { paid_clp: -1 },
  { total_clp: 5000 },
  { status: "pagada", paid_clp: 5949 },
  { status: "pagada", paid_clp: 5951 },
  { discount_clp: 100 },
  { doc_type: "guia" },
  { status: "anulada" },
  { voided_at: voidedAt },
  { status: "pagada", paid_clp: 5950, voided_at: voidedAt },
])("rechaza venta inválida %j", async (values) => {
  await expect(sale(values)).rejects.toMatchObject({ code: "23514" });
});

it.each([
  { status: "pagada", paid_clp: 5950 },
  { status: "anulada", voided_at: voidedAt },
  { discount_clp: 100, discount_reason: "Descuento autorizado" },
  { doc_type: "boleta", doc_number: "B-001" },
  { doc_type: "factura", doc_number: "F-001" },
  { subtotal_clp: 0, vat_clp: 0, total_clp: 0, status: "pagada", paid_clp: 0 },
])("acepta venta válida %j", async (values) => {
  await sale(values);
});

it("vincula cliente y autor de anulación", async () => {
  const customer = await insert("customers", {
    branch_id: branchId,
    name: "Cliente",
    phone_e164: "+56912345678",
  });
  expect(
    await sale({
      customer_id: customer.id,
      status: "anulada",
      voided_at: voidedAt,
      voided_by: userId,
      void_reason: "Venta registrada por error",
    }),
  ).toMatchObject({ customer_id: customer.id, voided_by: userId });
});

it("exige número único por sucursal incluso en ventas anuladas", async () => {
  await sale({ status: "anulada", voided_at: voidedAt });
  await expect(sale()).rejects.toMatchObject({ code: "23505" });
});

it("permite repetir número en otra sucursal y avanzar en la misma", async () => {
  await sale();
  await sale({ number: 2 });
  const other = await insert("branches", { name: "Otra" });
  await sale({ branch_id: other.id });
});

it.each([{ quantity: 0 }, { quantity: -1 }, { unit_price_clp: -1 }, { unit_cost_clp: -1 }])(
  "rechaza línea inválida %j",
  async (values) => {
    await expect(item((await sale()).id, values)).rejects.toMatchObject({ code: "23514" });
  },
);

it("conserva precio y costo congelados al cambiar el producto y admite cero", async () => {
  const saleId = (await sale()).id;
  const line = await item(saleId, { quantity: 2 });
  await test.client.query("update products set price_clp = 6000, cost_clp = 4000 where id = $1", [
    productId,
  ]);
  const result = await test.client.query("select * from sale_items where id = $1", [line.id]);
  expect(result.rows[0]).toMatchObject({ quantity: 2, unit_price_clp: 5000, unit_cost_clp: 3000 });
  await item(saleId, { unit_price_clp: 0, unit_cost_clp: 0 });
});

it.each(["branch_id", "created_by", "customer_id", "voided_by"])(
  "exige referencia de venta existente: %s",
  async (column) => {
    await expect(sale({ [column]: missingId })).rejects.toMatchObject({ code: "23503" });
  },
);

it.each(["branch_id", "sale_id", "product_id"])(
  "exige referencia de línea existente: %s",
  async (column) => {
    await expect(item((await sale()).id, { [column]: missingId })).rejects.toMatchObject({
      code: "23503",
    });
  },
);
