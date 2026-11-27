import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { toCsv } from "../../src/lib/csv.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import * as permissions from "../../src/server/auth/permissions.ts";
import { cashMovements, cashSessions, expenses } from "../../src/server/db/schema-cash.ts";
import { workOrderItems, workOrders } from "../../src/server/db/schema-orders.ts";
import { payments } from "../../src/server/db/schema-payments.ts";
import { sales } from "../../src/server/db/schema-sales.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { dashboardIndicators } from "../../src/server/taller/indicators-dashboard.ts";
import { exportIndicatorsReport } from "../../src/server/taller/indicators-export.ts";
import type { ReportKind } from "../../src/server/taller/indicators-export.ts";
import { financeIndicators } from "../../src/server/taller/indicators-finance.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-20T15:00:00Z");
const RANGE = { from: "2026-11-01", to: "2026-11-30" };
const PRIVATE = {
  name: "Persona privada",
  phoneE164: "+56912345678",
  email: "privada@example.test",
  rut: "12345678-5",
};
let test: TestDb;
let owner: SessionUser;
let customerId: string;
let bikeId: string;
let number: number;
beforeEach(async () => {
  test = await createTestDb();
  const branchId = randomUUID();
  await test.db.insert(branches).values({ id: branchId, name: "Sucursal" });
  owner = { id: randomUUID(), branchId, role: "owner", name: "Dueña", email: "owner@example.test" };
  await test.db.insert(users).values({ ...owner, passwordHash: "hash" });
  customerId = randomUUID();
  bikeId = randomUUID();
  number = 0;
  await test.db.insert(customers).values({ id: customerId, branchId, ...PRIVATE });
  await test.db
    .insert(bikes)
    .values({ id: bikeId, branchId, customerId, brand: "Marca", model: "Modelo", bikeType: "mtb" });
  return async () => {
    vi.restoreAllMocks();
    await test.close();
  };
});
async function order(values: Partial<typeof workOrders.$inferInsert> = {}) {
  const id = randomUUID();
  await test.db.insert(workOrders).values({
    id,
    branchId: owner.branchId,
    number: ++number,
    customerId,
    bikeId,
    status: "diagnostico",
    requestedService: PRIVATE.name,
    createdBy: owner.id,
    createdAt: NOW,
    ...values,
  });
  return id;
}
async function pay(values: Partial<typeof payments.$inferInsert>) {
  await test.db.insert(payments).values({
    branchId: owner.branchId,
    kind: "final",
    method: "transferencia",
    amountClp: 10000,
    receivedBy: owner.id,
    receivedAt: NOW,
    ...values,
  });
}
async function report(kind: ReportKind, actor = owner) {
  const result = await exportIndicatorsReport(test.db, actor, kind, RANGE, NOW);
  if (!result.ok) throw new Error(result.code);
  return result;
}
function preview(kind: string, rows: Parameters<typeof toCsv>[0]) {
  process.stdout.write(`CSV_${kind}\n${toCsv(rows).split("\r\n").slice(0, 6).join("\r\n")}\n`);
}
it.each(["reception", "mechanic"] as const)("rechaza %s antes de consultar", async (role) => {
  const select = vi.spyOn(test.db, "select");
  expect(await exportIndicatorsReport(test.db, { ...owner, role }, "resumen", RANGE, NOW)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(select).not.toHaveBeenCalled();
});
async function seedLedgerIncome() {
  const workOrderId = await order();
  await pay({
    workOrderId,
    kind: "abono",
    receivedAt: new Date("2026-11-02T15:00:00Z"),
    feeClp: 100,
    netClp: 9900,
  });
  await pay({
    workOrderId,
    amountClp: 20000,
    method: "tarjeta",
    posProvider: "getnet",
    receivedAt: new Date("2026-11-03T15:00:00Z"),
  });
  await pay({ workOrderId, voidedAt: NOW });
  await pay({ workOrderId, receivedAt: new Date("2026-12-01T03:00:00Z") });
  const saleId = randomUUID();
  await test.db.insert(sales).values({
    id: saleId,
    branchId: owner.branchId,
    number: 1,
    subtotalClp: 10000,
    vatClp: 1900,
    totalClp: 11900,
    createdBy: owner.id,
  });
  await pay({ saleId, amountClp: 11900, receivedAt: new Date("2026-11-04T15:00:00Z") });
  return workOrderId;
}
async function seedLedgerOutflows(workOrderId: string) {
  const cashSessionId = randomUUID();
  await test.db.insert(cashSessions).values({
    id: cashSessionId,
    branchId: owner.branchId,
    openedAt: NOW,
    openedBy: owner.id,
    openingCashClp: 0,
  });
  await test.db.insert(cashMovements).values({
    branchId: owner.branchId,
    cashSessionId,
    kind: "egreso",
    amountClp: 5000,
    referenceKind: "order_refund",
    referenceId: workOrderId,
    createdBy: owner.id,
    createdAt: new Date("2026-11-05T15:00:00Z"),
  });
  for (const voidedAt of [null, NOW])
    await test.db.insert(expenses).values({
      branchId: owner.branchId,
      category: "insumos",
      amountClp: 3000,
      expenseDate: "2026-11-06",
      description: "Descripción privada",
      docType: "boleta",
      docNumber: "123",
      method: "tarjeta",
      createdBy: owner.id,
      voidedAt,
    });
}
it("exporta movimientos vigentes, ordenados, con signo y sin datos privados", async () => {
  await seedLedgerOutflows(await seedLedgerIncome());
  const { rows, filename } = await report("ingresos-egresos");
  expect(filename).toBe("indicadores-ingresos-egresos-2026-11-01-2026-11-30.csv");
  expect(rows[0]).toEqual([
    "Fecha",
    "Hora",
    "Tipo",
    "Documento",
    "Medio",
    "Detalle",
    "Monto",
    "Comisión",
    "Neto",
  ]);
  expect(rows.slice(1, 6).map((row) => row.slice(0, 7))).toEqual([
    ["2026-11-02", "12:00", "Ingreso", "OT-00001", "Transferencia", "Abono", 10000],
    ["2026-11-03", "12:00", "Ingreso", "OT-00001", "POS · Getnet", "Pago final", 20000],
    ["2026-11-04", "12:00", "Ingreso", "VM-00001", "Transferencia", "Pago final", 11900],
    ["2026-11-05", "12:00", "Devolución", "OT-00001", "Efectivo", "", -5000],
    ["2026-11-06", "", "Egreso", "Boleta 123", "Tarjeta", "Insumos", -3000],
  ]);
  expect(rows[1]?.slice(7)).toEqual([100, 9900]);
  expect(rows.slice(-5)).toEqual([
    [],
    ["Total ingresos", null, null, null, null, null, 41900, null, null],
    ["Total devoluciones", null, null, null, null, null, -5000, null, null],
    ["Total egresos", null, null, null, null, null, -3000, null, null],
    ["Movimiento neto", null, null, null, null, null, 33900, null, null],
  ]);
  expect(rows.at(-4)?.[6]).toBe(
    (await financeIndicators(test.db, owner, RANGE, NOW))?.income.grossClp,
  );
  for (const secret of [...Object.values(PRIVATE), "Descripción privada"])
    expect(JSON.stringify(rows)).not.toContain(secret);
  preview("ingresos-egresos", rows);
});
it.each([true, false])(
  "resumen coincide con el panel y compara base previa %s",
  async (previous) => {
    const workOrderId = await order({ totalClp: 20000 });
    await pay({ workOrderId, amountClp: 20000 });
    if (previous) await pay({ workOrderId, receivedAt: new Date("2026-10-20T15:00:00Z") });
    const { rows } = await report("resumen");
    const dashboard = await dashboardIndicators(test.db, owner, RANGE, NOW);
    const finance = await financeIndicators(test.db, owner, RANGE, NOW);
    expect(rows[0]).toEqual([
      "Sección",
      "Indicador",
      "Valor",
      "Unidad",
      "Período anterior",
      "Variación (%)",
    ]);
    expect(rows.slice(1, 3)).toEqual([
      ["Período", "Desde", RANGE.from],
      ["Período", "Hasta", RANGE.to],
    ]);
    expect(rows.find((row) => row[1] === "Ingresos")).toEqual([
      "Visión general",
      "Ingresos",
      dashboard?.headline.income.currentClp,
      "CLP",
      previous ? 10000 : 0,
      previous ? "100" : null,
    ]);
    expect(rows.find((row) => row[1] === "Trabajos abiertos")?.[2]).toBe(
      dashboard?.headline.openOrders.count,
    );
    expect(rows.find((row) => row[1] === "Monto por revisar")?.[2]).toBe(
      dashboard?.rhythm.amountToReview.totalClp,
    );
    expect(rows.find((row) => row[1] === "Gastos")?.[2]).toBe(finance?.expenses.totalClp);
    expect(rows.find((row) => row[1] === "Valor de inventario")?.[2]).toBe(
      finance?.inventory.valueAtCostClp,
    );
    if (previous) preview("resumen", rows);
  },
);
it("omite columnas y cifras de costos cuando se permite finanzas sin costs.view", async () => {
  const original = permissions.can;
  vi.spyOn(permissions, "can").mockImplementation((role, action) =>
    action === "costs.view" ? false : original(role, action),
  );
  await pay({ workOrderId: await order(), feeClp: 321, netClp: 9679 });
  const ledger = await report("ingresos-egresos");
  expect(ledger.rows[0]).not.toContain("Comisión");
  expect(ledger.rows[0]).not.toContain("Neto");
  expect(ledger.rows[1]).toHaveLength(7);
  const { rows } = await report("resumen");
  expect(
    rows.some((row) => row[1] === "Valor de inventario" || row[1] === "Margen de repuestos"),
  ).toBe(false);
});
async function seedMechanicDeliveries(mechanics: string[]) {
  for (const [index, assignedMechanicId] of [...mechanics, null].entries()) {
    const amount = 30000 - index * 10000;
    const workOrderId = await order({
      assignedMechanicId,
      status: "entregada",
      totalClp: amount,
      paidClp: amount,
      receivedAt: new Date("2026-11-17T03:00:00Z"),
      deliveredAt: NOW,
      qcApprovedAt: NOW,
    });
    await test.db.insert(workOrderItems).values({
      branchId: owner.branchId,
      workOrderId,
      kind: "servicio",
      origin: "inicial",
      description: PRIVATE.name,
      quantity: 2,
      unitPriceClp: 1000,
      createdBy: owner.id,
    });
    await test.db.insert(workOrderItems).values({
      branchId: owner.branchId,
      workOrderId,
      kind: "servicio",
      origin: "inicial",
      description: "Anulada",
      quantity: 1,
      unitPriceClp: 9999,
      createdBy: owner.id,
      voidedAt: NOW,
    });
  }
}
it("agrupa entregas, servicios y abiertas por mecánico sin anuladas", async () => {
  const mechanics = [randomUUID(), randomUUID()];
  for (const [index, id] of mechanics.entries())
    await test.db.insert(users).values({
      id,
      branchId: owner.branchId,
      role: "mechanic",
      name: `Mecánico ${index + 1}`,
      email: `${id}@example.test`,
      passwordHash: "hash",
    });
  await seedMechanicDeliveries(mechanics);
  await order({ assignedMechanicId: mechanics[0], createdAt: new Date("2026-10-01T15:00:00Z") });
  await order({ assignedMechanicId: mechanics[0], status: "cancelada" });
  await order({ assignedMechanicId: mechanics[0], voidedAt: NOW });
  const { rows } = await report("mecanicos");
  expect(rows.slice(1)).toEqual([
    ["Mecánico 1", 1, 30000, 2000, 4, 1],
    ["Mecánico 2", 1, 20000, 2000, 4, 0],
    ["Sin asignar", 1, 10000, 2000, 4, 0],
  ]);
  preview("mecanicos", rows);
});
it("incluye mecánico con solo abiertas y deja días vacíos sin entregas", async () => {
  await order({ assignedMechanicId: owner.id });
  expect((await report("mecanicos")).rows[1]).toEqual([owner.name, 0, 0, 0, null, 1]);
});
