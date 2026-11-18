import { afterEach, beforeEach, expect, it } from "vitest";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

type Values = Record<string, string | number | null>;
type Row = Record<string, unknown> & { id: string };
type Table = "branches" | "users" | "cash_sessions" | "sales" | "payments";
const linkedTables = ["payments", "sales"] as const;
const now = "2026-11-14T15:00:00Z";
const missingId = "00000000-0000-0000-0000-000000000001";
let test: TestDb;
let branchId: string;
let userId: string;

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

async function linkedRow(table: (typeof linkedTables)[number], values: Values = {}) {
  if (table === "sales") return sale(values);
  return insert("payments", {
    branch_id: branchId,
    sale_id: (await sale()).id,
    kind: "final",
    method: "efectivo",
    amount_clp: 5950,
    received_by: userId,
    received_at: now,
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
});

afterEach(async () => {
  await test.close();
});

it.each(linkedTables)("agrega cash_session_id UUID nullable a %s", async (table) => {
  const result = await test.client.query(
    `select data_type, is_nullable from information_schema.columns
     where table_schema = 'public' and table_name = $1 and column_name = 'cash_session_id'`,
    [table],
  );
  expect(result.rows).toEqual([{ data_type: "uuid", is_nullable: "YES" }]);
});

it.each(linkedTables)("rechaza sesión inexistente en %s con 23503", async (table) => {
  await expect(linkedRow(table, { cash_session_id: missingId })).rejects.toMatchObject({
    code: "23503",
  });
});

it.each(linkedTables)("acepta sesión válida en %s y conserva el vínculo", async (table) => {
  const session = await insert("cash_sessions", {
    branch_id: branchId,
    opened_at: now,
    opened_by: userId,
    opening_cash_clp: 20000,
  });
  const row = await linkedRow(table, { cash_session_id: session.id });
  const result = await test.client.query(`select cash_session_id from ${table} where id = $1`, [
    row.id,
  ]);
  expect(result.rows).toEqual([{ cash_session_id: session.id }]);
});

it.each(linkedTables)("permite omitir la sesión en %s y guarda NULL", async (table) => {
  expect(await linkedRow(table)).toMatchObject({ cash_session_id: null });
});

it.each(linkedTables)("acepta sesión explícitamente NULL en %s", async (table) => {
  expect(await linkedRow(table, { cash_session_id: null })).toMatchObject({
    cash_session_id: null,
  });
});

it.each(linkedTables)("indexa cash_session_id en %s", async (table) => {
  const result = await test.client.query<{ indexdef: string }>(
    "select indexdef from pg_indexes where schemaname = 'public' and tablename = $1",
    [table],
  );
  expect(result.rows.some(({ indexdef }) => /\(cash_session_id\)$/.test(indexdef))).toBe(true);
});
