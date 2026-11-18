import { beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { listPayments, voidPayment } from "../../src/server/taller/payments.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

type Values = Record<string, string | number | null>;
type Row = Record<string, unknown> & { id: string };
type Table = "branches" | "users" | "customers" | "bikes" | "work_orders" | "sales" | "payments";
const NOW = new Date("2026-11-14T15:00:00.000Z");
let test: TestDb;
let owner: SessionUser;
let mechanic: SessionUser;
let orderId: string;
let saleId: string;

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
  if (!row) throw new Error("Falta la fila de prueba.");
  return row;
}

async function actor(branchId: string, role: SessionUser["role"]): Promise<SessionUser> {
  const email = `${role}@example.test`;
  const name = "Personal de prueba";
  const user = await insert("users", {
    branch_id: branchId,
    email,
    name,
    role,
    password_hash: "hash-de-prueba",
  });
  return { id: user.id, branchId, role, name, email };
}

async function createOrder() {
  const customer = await insert("customers", {
    branch_id: owner.branchId,
    name: "Cliente de prueba",
    phone_e164: "+56912345678",
  });
  const bike = await insert("bikes", {
    branch_id: owner.branchId,
    customer_id: customer.id,
    brand: "Specialized",
    model: "Rockhopper",
    bike_type: "mtb",
  });
  return insert("work_orders", {
    branch_id: owner.branchId,
    number: 1,
    customer_id: customer.id,
    bike_id: bike.id,
    assigned_mechanic_id: mechanic.id,
    status: "recibida",
    requested_service: "Revisión general",
    total_clp: 10000,
    created_by: owner.id,
  });
}

function payment(values: Values = {}) {
  return insert("payments", {
    branch_id: owner.branchId,
    work_order_id: orderId,
    kind: "final",
    method: "transferencia",
    amount_clp: 10000,
    received_by: owner.id,
    received_at: NOW.toISOString(),
    ...values,
  });
}

beforeEach(async () => {
  test = await createTestDb();
  const branch = await insert("branches", { name: "Sucursal de prueba" });
  owner = await actor(branch.id, "owner");
  mechanic = await actor(branch.id, "mechanic");
  orderId = (await createOrder()).id;
  saleId = (
    await insert("sales", {
      branch_id: branch.id,
      number: 1,
      subtotal_clp: 10000,
      vat_clp: 1900,
      total_clp: 11900,
      created_by: owner.id,
    })
  ).id;
  return () => test.close();
});

it("conserva los pagos de órdenes con comisión cero y nuevos campos nulos por defecto", async () => {
  expect(await payment()).toMatchObject({
    work_order_id: orderId,
    sale_id: null,
    external_id: null,
    fee_clp: 0,
    net_clp: null,
  });
});

it("admite un pago de venta sin orden y conserva la referencia externa", async () => {
  expect(
    await payment({ work_order_id: null, sale_id: saleId, external_id: "operacion-123" }),
  ).toMatchObject({ work_order_id: null, sale_id: saleId, external_id: "operacion-123" });
});

it.each(["ninguno", "ambos"])("rechaza destino %s con el CHECK de pagos", async (target) => {
  await expect(
    payment({
      work_order_id: target === "ambos" ? orderId : null,
      sale_id: target === "ambos" ? saleId : null,
    }),
  ).rejects.toMatchObject({ code: "23514", constraint: "payments_target_check" });
});

it.each([-1, 10001])("rechaza comisión %i fuera del monto del pago", async (fee) => {
  await expect(payment({ fee_clp: fee })).rejects.toMatchObject({
    code: "23514",
    constraint: "payments_fee_check",
  });
});

it.each([0, 10000])("admite comisión límite %i y su neto exacto", async (fee) => {
  expect(await payment({ fee_clp: fee, net_clp: 10000 - fee })).toMatchObject({
    fee_clp: fee,
    net_clp: 10000 - fee,
  });
});

it.each([9699, 9701, -1])("rechaza neto %i distinto de monto menos comisión", async (net) => {
  await expect(payment({ fee_clp: 300, net_clp: net })).rejects.toMatchObject({
    code: "23514",
    constraint: "payments_net_check",
  });
});

it("admite comisión con neto todavía desconocido", async () => {
  expect(await payment({ fee_clp: 300 })).toMatchObject({ fee_clp: 300, net_clp: null });
});

it("exige que la venta referenciada exista", async () => {
  await expect(
    payment({ work_order_id: null, sale_id: "00000000-0000-0000-0000-000000000001" }),
  ).rejects.toMatchObject({ code: "23503" });
});

it.each(["cheque"])("mantiene el CHECK de método: rechaza %s", async (method) => {
  await expect(payment({ method, external_id: "operacion-123" })).rejects.toMatchObject({
    code: "23514",
    constraint: "payments_method_check",
  });
});

it.each(["owner", "admin", "reception", "mechanic"] as const)(
  "listPayments limita las comisiones según el rol %s",
  async (role) => {
    const staff =
      role === "owner" ? owner : role === "mechanic" ? mechanic : await actor(owner.branchId, role);
    const paid = await payment({ fee_clp: 300, net_clp: 9700 });
    await payment({ voided_at: NOW.toISOString() });
    await payment({ work_order_id: null, sale_id: saleId });
    const rows = await listPayments(test.db, staff, orderId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: paid.id, workOrderId: orderId, amountClp: 10000 });
    if (role === "owner" || role === "admin") {
      expect(rows[0]).toMatchObject({ feeClp: 300, netClp: 9700 });
    } else {
      expect(rows[0]).not.toHaveProperty("feeClp");
      expect(rows[0]).not.toHaveProperty("netClp");
    }
  },
);

it("omite también el neto nulo y la comisión cero para recepción y mecánico", async () => {
  await payment();
  const reception = await actor(owner.branchId, "reception");
  for (const staff of [reception, mechanic]) {
    const rows = await listPayments(test.db, staff, orderId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("feeClp");
    expect(rows[0]).not.toHaveProperty("netClp");
  }
});

it("el flujo de órdenes no anula pagos de ventas ni deja escrituras", async () => {
  const paid = await payment({ work_order_id: null, sale_id: saleId });
  const before = await test.client.query("select * from payments");
  expect(await voidPayment(test.db, owner, paid.id, NOW)).toEqual({ ok: false, code: "not_found" });
  expect(await test.client.query("select * from payments")).toEqual(before);
  expect((await test.client.query("select * from audit_log")).rows).toEqual([]);
});
