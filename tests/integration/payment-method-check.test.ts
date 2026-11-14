import { beforeEach, describe, expect, it } from "vitest";
import { sales } from "../../src/server/db/schema-sales.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  RECORDABLE_PAYMENT_METHODS,
} from "../../src/server/taller/rules.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-14T15:00:00.000Z");

it("conserva los cuatro medios originales y agrega Mercado Pago solo a los registrables", () => {
  expect(PAYMENT_METHODS).toEqual(["transferencia", "tarjeta", "efectivo", "otro"]);
  expect(RECORDABLE_PAYMENT_METHODS).toEqual([
    "transferencia",
    "tarjeta",
    "efectivo",
    "otro",
    "mercadopago",
  ]);
  expect(PAYMENT_METHOD_LABELS).toEqual({
    transferencia: "Transferencia",
    tarjeta: "Tarjeta",
    efectivo: "Efectivo",
    otro: "Otro",
    mercadopago: "Mercado Pago",
  });
});

describe("CHECK de método de pago sobre las migraciones", () => {
  let test: TestDb;
  let branchId: string;
  let userId: string;
  let saleId: string;

  beforeEach(async () => {
    test = await createTestDb();
    const [branch] = await test.db
      .insert(branches)
      .values({ name: "Sucursal de prueba" })
      .returning();
    if (!branch) throw new Error("Falta sucursal");
    branchId = branch.id;
    const [user] = await test.db
      .insert(users)
      .values({
        branchId,
        name: "Personal de prueba",
        email: "owner@example.test",
        passwordHash: "hash-de-prueba",
        role: "owner",
      })
      .returning();
    if (!user) throw new Error("Falta usuario");
    userId = user.id;
    const [sale] = await test.db
      .insert(sales)
      .values({
        branchId,
        number: 1,
        subtotalClp: 10000,
        vatClp: 1900,
        totalClp: 11900,
        createdBy: userId,
      })
      .returning();
    if (!sale) throw new Error("Falta venta");
    saleId = sale.id;
    return () => test.close();
  });

  async function payment(method: string, externalId: string | null = null) {
    return test.client.query<{ method: string; external_id: string | null }>(
      `insert into payments
       (branch_id, sale_id, kind, method, amount_clp, external_id, received_by, received_at)
       values ($1, $2, 'final', $3, 11900, $4, $5, $6)
       returning method, external_id`,
      [branchId, saleId, method, externalId, userId, NOW.toISOString()],
    );
  }

  it("acepta Mercado Pago con referencia externa", async () => {
    const result = await payment("mercadopago", "operacion-123");
    expect(result.rows).toEqual([{ method: "mercadopago", external_id: "operacion-123" }]);
  });

  it("rechaza Mercado Pago sin referencia externa con 23514", async () => {
    await expect(payment("mercadopago")).rejects.toMatchObject({
      code: "23514",
      constraint: "payments_mercadopago_check",
    });
  });

  it("rechaza cheque incluso con referencia externa con 23514", async () => {
    await expect(payment("cheque", "operacion-123")).rejects.toMatchObject({
      code: "23514",
      constraint: "payments_method_check",
    });
  });

  it("sigue aceptando los cuatro medios originales sin referencia externa", async () => {
    for (const method of PAYMENT_METHODS) {
      const result = await payment(method);
      expect(result.rows).toEqual([{ method, external_id: null }]);
    }
  });
});
