import { afterEach, beforeEach, expect, it } from "vitest";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

type Values = Record<string, string | number | boolean | null | undefined>;
type Row = Record<string, unknown> & { id: string };
type Table = "branches" | "users" | "suppliers" | "cash_sessions" | "cash_movements" | "expenses";
const openedAt = "2026-11-14T12:00:00Z";
const closedAt = "2026-11-14T20:00:00Z";
const missingId = "00000000-0000-0000-0000-000000000001";
let test: TestDb;
let branchId: string;
let userId: string;

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

function session(values: Values = {}) {
  return insert("cash_sessions", {
    branch_id: branchId,
    opened_at: openedAt,
    opened_by: userId,
    opening_cash_clp: 20000,
    ...values,
  });
}

function closing(): Values {
  return {
    closed_at: closedAt,
    closed_by: userId,
    counted_cash_clp: 31000,
    expected_cash_clp: 32000,
    difference_clp: -1000,
  };
}

function movement(sessionId: string, values: Values = {}) {
  return insert("cash_movements", {
    branch_id: branchId,
    cash_session_id: sessionId,
    kind: "ingreso",
    amount_clp: 15000,
    reference_kind: "payment",
    reference_id: missingId,
    created_by: userId,
    ...values,
  });
}

function expense(values: Values = {}) {
  return insert("expenses", {
    branch_id: branchId,
    category: "insumos",
    amount_clp: 3000,
    expense_date: "2026-11-14",
    description: "Materiales de limpieza",
    method: "efectivo",
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
});

afterEach(async () => {
  await test.close();
});

it("crea las tres tablas con sucursal obligatoria e instantes UTC", async () => {
  const result = await test.client.query(
    `select table_name, column_name, is_nullable, data_type from information_schema.columns
     where table_schema = 'public' and table_name in ('cash_sessions', 'cash_movements', 'expenses')`,
  );
  for (const table of ["cash_sessions", "cash_movements", "expenses"]) {
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

it("deja el control de caja deshabilitado por defecto y permite habilitarlo", async () => {
  const result = await test.client.query("select cash_control_enabled from branches");
  expect(result.rows).toEqual([{ cash_control_enabled: false }]);
  expect(await insert("branches", { name: "Otra", cash_control_enabled: true })).toMatchObject({
    cash_control_enabled: true,
  });
  await expect(
    insert("branches", { name: "Inválida", cash_control_enabled: null }),
  ).rejects.toMatchObject({ code: "23502" });
});

it("acepta apertura en cero sin datos de cierre y rechaza otra abierta en la misma sucursal", async () => {
  expect(await session({ opening_cash_clp: 0 })).toMatchObject({
    ...Object.fromEntries(Object.keys(closing()).map((key) => [key, null])),
    note: null,
  });
  await expect(session()).rejects.toMatchObject({ code: "23505" });
  const other = await insert("branches", { name: "Otra" });
  await session({ branch_id: other.id });
});

it("permite reabrir la sucursal después de un cierre completo con diferencia negativa", async () => {
  await session(closing());
  await session();
});

it.each([
  { opening_cash_clp: -1 },
  { closed_at: closedAt },
  { closed_by: "user" },
  { counted_cash_clp: 0 },
  { expected_cash_clp: 0 },
  { difference_clp: 0 },
])("rechaza apertura inválida o cierre aislado %j", async (values) => {
  const input = "closed_by" in values ? { closed_by: userId } : values;
  await expect(session(input)).rejects.toMatchObject({ code: "23514" });
});

it.each(["closed_at", "closed_by", "counted_cash_clp", "expected_cash_clp", "difference_clp"])(
  "rechaza cierre al que le falta %s, incluso si el CHECK produciría NULL",
  async (column) => {
    await expect(session({ ...closing(), [column]: null })).rejects.toMatchObject({
      code: "23514",
    });
  },
);

it.each([{ difference_clp: 0 }, { counted_cash_clp: -1, difference_clp: -32001 }])(
  "rechaza cierre con montos inválidos %j",
  async (values) => {
    await expect(session({ ...closing(), ...values })).rejects.toMatchObject({ code: "23514" });
  },
);

it.each([0, 1000])("acepta cierre con diferencia %i", async (difference) => {
  await session({ ...closing(), counted_cash_clp: 32000 + difference, difference_clp: difference });
});

it.each([
  { amount_clp: 0 },
  { amount_clp: -1 },
  { category: "otra" },
  { method: "cheque" },
  { doc_type: "guia" },
])("rechaza gasto inválido %j", async (values) => {
  await expect(expense(values)).rejects.toMatchObject({ code: "23514" });
});

it.each(["arriendo", "sueldos", "servicios", "insumos", "repuestos", "otros"])(
  "acepta categoría de gasto %s sin proveedor, documento ni caja",
  async (category) => {
    expect(await expense({ category })).toMatchObject({
      category,
      supplier_id: null,
      cash_session_id: null,
      doc_type: null,
      doc_number: null,
      void_reason: null,
      voided_at: null,
      voided_by: null,
    });
  },
);

it.each(["efectivo", "transferencia", "tarjeta", "otro"])(
  "acepta medio de gasto %s",
  async (method) => {
    await expense({ method });
  },
);

it.each(["boleta", "factura"])(
  "acepta documento de gasto %s y referencias válidas",
  async (docType) => {
    const supplier = await insert("suppliers", { branch_id: branchId, name: "Proveedor" });
    const cashSession = await session();
    expect(
      await expense({
        supplier_id: supplier.id,
        cash_session_id: cashSession.id,
        doc_type: docType,
        doc_number: "001",
        voided_at: closedAt,
        voided_by: userId,
        void_reason: "Registro duplicado",
      }),
    ).toMatchObject({
      supplier_id: supplier.id,
      cash_session_id: cashSession.id,
      voided_by: userId,
    });
  },
);

it.each([{ amount_clp: 0 }, { amount_clp: -1 }, { kind: "otro" }, { reference_kind: "sale" }])(
  "rechaza movimiento inválido %j",
  async (values) => {
    await expect(movement((await session()).id, values)).rejects.toMatchObject({ code: "23514" });
  },
);

it.each(["payment", "expense", "sale_refund", "order_refund"])(
  "acepta origen de movimiento %s",
  async (referenceKind) => {
    const sessionId = (await session()).id;
    expect(await movement(sessionId, { reference_kind: referenceKind })).toMatchObject({
      note: null,
      voided_at: null,
      voided_by: null,
    });
    await movement(sessionId, {
      kind: "egreso",
      reference_kind: referenceKind,
      note: "Devolución",
      voided_at: closedAt,
      voided_by: userId,
    });
  },
);

it.each(["branch_id", "opened_by", "closed_by"])(
  "exige referencia de sesión existente: %s",
  async (column) => {
    await expect(session({ ...closing(), [column]: missingId })).rejects.toMatchObject({
      code: "23503",
    });
  },
);

it.each(["branch_id", "cash_session_id", "created_by", "voided_by"])(
  "exige referencia de movimiento existente: %s",
  async (column) => {
    await expect(movement((await session()).id, { [column]: missingId })).rejects.toMatchObject({
      code: "23503",
    });
  },
);

it.each(["branch_id", "supplier_id", "cash_session_id", "created_by", "voided_by"])(
  "exige referencia de gasto existente: %s",
  async (column) => {
    await expect(expense({ [column]: missingId })).rejects.toMatchObject({ code: "23503" });
  },
);

it.each(["branch_id", "opened_at", "opened_by", "opening_cash_clp"])(
  "exige campo de sesión %s",
  async (column) => {
    await expect(session({ [column]: null })).rejects.toMatchObject({ code: "23502" });
  },
);

it.each([
  "branch_id",
  "cash_session_id",
  "kind",
  "amount_clp",
  "reference_kind",
  "reference_id",
  "created_by",
])("exige campo de movimiento %s", async (column) => {
  await expect(movement((await session()).id, { [column]: null })).rejects.toMatchObject({
    code: "23502",
  });
});

it.each([
  "branch_id",
  "category",
  "amount_clp",
  "expense_date",
  "description",
  "method",
  "created_by",
])("exige campo de gasto %s", async (column) => {
  await expect(expense({ [column]: null })).rejects.toMatchObject({ code: "23502" });
});
