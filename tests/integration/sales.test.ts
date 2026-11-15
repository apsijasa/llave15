import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { ROLES } from "../../src/server/auth/permissions.ts";
import { products, stockMovements } from "../../src/server/db/schema-inventory.ts";
import { payments } from "../../src/server/db/schema-payments.ts";
import { saleItems, sales } from "../../src/server/db/schema-sales.ts";
import { auditLog, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { customerTimeline, sortTimeline } from "../../src/server/taller/history.ts";
import { SALE_STATUSES, SALE_STATUS_LABELS } from "../../src/server/taller/rules.ts";
import { voidSale } from "../../src/server/taller/sale-void.ts";
import {
  createSale,
  formatSaleNumber,
  listCustomerSales,
  listSales,
  previewSale,
  saleFormSchema,
} from "../../src/server/taller/sales.ts";
import * as stock from "../../src/server/taller/stock.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-14T15:00:00Z");
const LATER = new Date("2026-11-14T16:00:00Z");
const RANGE = { from: "2026-11-14", to: "2026-11-14" };
let test: TestDb;
let actors: Record<(typeof ROLES)[number], SessionUser>;
let productId: string;
let customerId: string;
const failure = (code: string) => ({ ok: false, code });
const input = () => ({ items: [{ productId, quantity: 2 }], method: "transferencia" });

beforeEach(async () => {
  test = await createTestDb();
  const branchId = randomUUID();
  await test.db.insert(branches).values({ id: branchId, name: "Sucursal" });
  actors = {} as typeof actors;
  for (const role of ROLES) {
    const user = { id: randomUUID(), branchId, role, name: role, email: `${role}@example.test` };
    await test.db.insert(users).values({ ...user, passwordHash: "hash" });
    actors[role] = user;
  }
  productId = await addProduct();
  customerId = randomUUID();
  await test.db
    .insert(customers)
    .values({ id: customerId, branchId, name: "Ana", phoneE164: "+56912345678" });
  return async () => {
    vi.restoreAllMocks();
    await test.close();
  };
});

async function addProduct(overrides: Partial<typeof products.$inferInsert> = {}) {
  const [product] = await test.db
    .insert(products)
    .values({
      branchId: actors.owner.branchId,
      sku: randomUUID(),
      name: "Cadena",
      category: "repuesto",
      priceClp: 5000,
      costClp: 3000,
      stockQty: 3,
      createdBy: actors.owner.id,
      ...overrides,
    })
    .returning();
  if (!product) throw new Error("Falta el producto.");
  return product.id;
}

async function recorded(overrides = {}) {
  const result = await createSale(test.db, actors.reception, { ...input(), ...overrides }, NOW);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.code);
  return result;
}

async function expectEmpty() {
  for (const table of [sales, saleItems, payments, stockMovements, auditLog])
    expect(await test.db.select().from(table)).toEqual([]);
  expect((await test.db.select().from(branches))[0]?.nextSaleNumber).toBe(1);
  expect(
    (await test.db.select().from(products).where(eq(products.id, productId)))[0]?.stockQty,
  ).toBe(3);
}

it("registra VM-00001 pagada, congela precio/costo, paga y descuenta stock en una transacción", async () => {
  const result = await recorded();
  expect(result).toEqual({
    ok: true,
    saleId: expect.any(String),
    number: "VM-00001",
    totalClp: 11900,
  });
  expect((await test.db.select().from(sales))[0]).toMatchObject({
    number: 1,
    customerId: null,
    status: "pagada",
    subtotalClp: 10000,
    vatClp: 1900,
    totalClp: 11900,
    paidClp: 11900,
  });
  expect((await test.db.select().from(saleItems))[0]).toMatchObject({
    saleId: result.saleId,
    productId,
    description: "Cadena",
    quantity: 2,
    unitPriceClp: 5000,
    unitCostClp: 3000,
  });
  expect((await test.db.select().from(payments))[0]).toMatchObject({
    saleId: result.saleId,
    workOrderId: null,
    kind: "final",
    method: "transferencia",
    amountClp: 11900,
    receivedBy: actors.reception.id,
    receivedAt: NOW,
  });
  expect((await test.db.select().from(products))[0]?.stockQty).toBe(1);
  expect((await test.db.select().from(stockMovements))[0]).toMatchObject({
    kind: "venta",
    quantity: -2,
    unitCostClp: 3000,
    referenceKind: "sale",
    referenceId: result.saleId,
  });
});

it("audita autoría y conserva precio/costo aunque cambie el producto", async () => {
  const result = await recorded();
  const audits = await test.db.select().from(auditLog);
  expect(audits.map((row) => row.action).sort()).toEqual(["payment.recorded", "sale.created"]);
  const author = actors.reception.id;
  expect(
    audits.map(({ entity, entityId, actorUserId }) => [entity, entityId, actorUserId]),
  ).toEqual(Array(2).fill(["sale", result.saleId, author]));
  await test.db
    .update(products)
    .set({ priceClp: 7000, costClp: 4000 })
    .where(eq(products.id, productId));
  expect((await test.db.select().from(saleItems))[0]).toMatchObject({
    unitPriceClp: 5000,
    unitCostClp: 3000,
  });
});

it("rechaza falta de stock en cualquier línea sin consumir número ni escribir filas", async () => {
  const other = await addProduct();
  const data = {
    ...input(),
    items: [
      { productId, quantity: 1 },
      { productId: other, quantity: 4 },
    ],
  };
  expect(await previewSale(test.db, actors.reception, data)).toEqual(failure("out_of_stock"));
  expect(await createSale(test.db, actors.reception, data, NOW)).toEqual(failure("out_of_stock"));
  await expectEmpty();
});

it("revierte incluso las escrituras previas si applyStockMovement falla", async () => {
  const other = await addProduct();
  const apply = stock.applyStockMovement;
  vi.spyOn(stock, "applyStockMovement")
    .mockImplementationOnce(apply)
    .mockResolvedValueOnce({ ok: false, code: "out_of_stock" });
  expect(
    await createSale(
      test.db,
      actors.reception,
      {
        ...input(),
        items: [
          { productId, quantity: 1 },
          { productId: other, quantity: 1 },
        ],
      },
      NOW,
    ),
  ).toEqual(failure("out_of_stock"));
  await expectEmpty();
});

it("recepción no descuenta; dueño calcula IVA sobre el neto descontado y audita motivo", async () => {
  const data = { ...input(), discountClp: 1000, discountReason: "Cliente frecuente" };
  expect(await createSale(test.db, actors.reception, data, NOW)).toEqual(failure("forbidden"));
  await expectEmpty();
  expect(await createSale(test.db, actors.owner, data, NOW)).toMatchObject({
    ok: true,
    totalClp: 10710,
  });
  expect((await test.db.select().from(sales))[0]).toMatchObject({
    subtotalClp: 9000,
    vatClp: 1710,
    totalClp: 10710,
    discountClp: 1000,
  });
  expect(
    (await test.db.select().from(auditLog).where(eq(auditLog.action, "sale.discounted")))[0],
  ).toMatchObject({
    actorUserId: actors.owner.id,
    details: { amountClp: 1000, reason: "Cliente frecuente" },
  });
});

it("dueño anula con motivo, devuelve stock congelado y anula pagos una sola vez", async () => {
  const { saleId } = await recorded({ customerId });
  expect(
    await voidSale(test.db, actors.reception, saleId, { reason: "Error de venta" }, LATER),
  ).toEqual(failure("forbidden"));
  await test.db
    .update(products)
    .set({ costClp: 4000, isActive: false })
    .where(eq(products.id, productId));
  expect(
    await voidSale(test.db, actors.owner, saleId, { reason: "Error de venta" }, LATER),
  ).toMatchObject({ ok: true });
  expect((await test.db.select().from(sales))[0]).toMatchObject({
    status: "anulada",
    voidedAt: LATER,
    voidedBy: actors.owner.id,
    voidReason: "Error de venta",
  });
  expect((await test.db.select().from(products))[0]).toMatchObject({ stockQty: 3, costClp: 4000 });
  expect(
    (await test.db.select().from(stockMovements).where(eq(stockMovements.kind, "anulacion")))[0],
  ).toMatchObject({ quantity: 2, unitCostClp: 3000, referenceKind: "sale", referenceId: saleId });
  expect((await test.db.select().from(payments))[0]).toMatchObject({
    voidedAt: LATER,
    voidedBy: actors.owner.id,
  });
  const audits = await test.db.select().from(auditLog);
  for (const action of ["sale.voided", "payment.voided"])
    expect(audits.find((row) => row.action === action)).toMatchObject({
      actorUserId: actors.owner.id,
      entity: "sale",
      entityId: saleId,
    });
  expect(await voidSale(test.db, actors.owner, saleId, { reason: "Otra vez" }, LATER)).toEqual(
    failure("invalid_status"),
  );
  expect(await customerTimeline(test.db, actors.owner, customerId)).toEqual([]);
});

it("revierte anulación y pagos si falla la devolución de stock", async () => {
  const { saleId } = await recorded();
  vi.spyOn(stock, "applyStockMovement").mockResolvedValueOnce({ ok: false, code: "not_found" });
  expect(
    await voidSale(test.db, actors.owner, saleId, { reason: "Error de venta" }, LATER),
  ).toEqual(failure("not_found"));
  expect((await test.db.select().from(sales))[0]).toMatchObject({
    status: "pagada",
    voidedAt: null,
  });
  expect((await test.db.select().from(payments))[0]?.voidedAt).toBeNull();
  expect(await test.db.select().from(stockMovements)).toHaveLength(1);
  expect(await test.db.select().from(auditLog)).toHaveLength(2);
});

it("incluye venta en cliente sin órdenes y la ordena antes de pagos en el mismo instante", async () => {
  await recorded({ customerId });
  const events = await customerTimeline(test.db, actors.reception, customerId);
  expect(events).toEqual([
    { at: NOW.toISOString(), kind: "sale", title: "Venta VM-00001", detail: "$11.900" },
  ]);
  expect(
    sortTimeline([{ at: NOW.toISOString(), kind: "payment", title: "Pago" }, ...events]).map(
      (row) => row.kind,
    ),
  ).toEqual(["sale", "payment"]);
  expect(await listCustomerSales(test.db, actors.reception, customerId)).toHaveLength(1);
});

it("omite costos de listas y previsualización para recepción y mecánico; dueño/admin los ven", async () => {
  await recorded({ customerId, method: "tarjeta", posProvider: "getnet" });
  for (const role of ROLES) {
    const rows = await listSales(test.db, actors[role], RANGE);
    const history = await listCustomerSales(test.db, actors[role], customerId);
    const preview = await previewSale(test.db, actors[role], {
      ...input(),
      items: [{ productId, quantity: 1 }],
    });
    if (role === "mechanic") {
      expect(rows).toEqual([]);
      expect(history).toEqual([]);
      expect(preview).toEqual(failure("forbidden"));
    } else if (role === "reception") {
      for (const value of [rows, history, preview])
        expect(JSON.stringify(value)).not.toMatch(/unitCostClp|costClp|feeClp|netClp/);
    } else {
      expect(rows[0]?.items[0]).toHaveProperty("unitCostClp", 3000);
      expect(rows[0]?.payments[0]).toMatchObject({ posProvider: "getnet", feeClp: 0 });
      expect(rows[0]).toMatchObject({ method: "tarjeta", posProvider: "getnet" });
    }
  }
});

it("previsualiza sin escribir y rechaza montos nulos o descuento excesivo", async () => {
  expect(await previewSale(test.db, actors.reception, input())).toMatchObject({
    ok: true,
    subtotalClp: 10000,
    vatClp: 1900,
    totalClp: 11900,
    items: [{ productId, quantity: 2, unitPriceClp: 5000 }],
  });
  await expectEmpty();
  for (const data of [
    { discountClp: 10000, discountReason: "Descuento" },
    { discountClp: 10001, discountReason: "Descuento" },
  ]) {
    expect(await createSale(test.db, actors.owner, { ...input(), ...data }, NOW)).toEqual(
      failure("invalid_amount"),
    );
  }
  await expectEmpty();
});

it("valida el formulario: líneas únicas, límites, motivo, documento y proveedor del POS", async () => {
  expect(saleFormSchema.parse(input()).discountClp).toBe(0);
  for (const data of [
    { items: [] },
    { items: Array.from({ length: 6 }, () => ({ productId: randomUUID(), quantity: 1 })) },
    {
      items: [
        { productId, quantity: 1 },
        { productId, quantity: 2 },
      ],
    },
    ...[0, 101, 1.5].map((quantity) => ({ items: [{ productId, quantity }] })),
    { customerId: "inválido" },
    { discountClp: -1 },
    { discountClp: 1.5 },
    { discountClp: 1 },
    { discountClp: 1, discountReason: "  " },
    { method: "mercadopago", externalId: "MP" },
    { method: "tarjeta" },
    { method: "tarjeta", posProvider: "redcompra" },
    { posProvider: "getnet" },
    { docType: "guia" },
    { docNumber: "x".repeat(31) },
  ]) {
    expect(await createSale(test.db, actors.owner, { ...input(), ...data }, NOW)).toEqual(
      failure("validation_error"),
    );
  }
  expect(await createSale(test.db, actors.mechanic, input(), NOW)).toEqual(failure("forbidden"));
  await expectEmpty();
});

it("aísla productos, clientes, consultas y anulaciones por sucursal", async () => {
  const [branch] = await test.db.insert(branches).values({ name: "Otra" }).returning();
  if (!branch) throw new Error("Falta sucursal.");
  const outsider = { ...actors.owner, branchId: branch.id };
  expect(await createSale(test.db, outsider, input(), NOW)).toEqual(failure("not_found"));
  const [foreignCustomer] = await test.db
    .insert(customers)
    .values({ branchId: branch.id, name: "Otra", phoneE164: "+56912345679" })
    .returning();
  expect(
    await createSale(test.db, actors.owner, { ...input(), customerId: foreignCustomer?.id }, NOW),
  ).toEqual(failure("not_found"));
  await test.db.update(products).set({ isActive: false }).where(eq(products.id, productId));
  expect(await createSale(test.db, actors.owner, input(), NOW)).toEqual(failure("not_found"));
  await test.db.update(products).set({ isActive: true }).where(eq(products.id, productId));
  const { saleId } = await recorded({ customerId });
  expect(await listSales(test.db, outsider, RANGE)).toEqual([]);
  expect(await listCustomerSales(test.db, outsider, customerId)).toEqual([]);
  expect(await voidSale(test.db, outsider, saleId, { reason: "Error" }, LATER)).toEqual(
    failure("not_found"),
  );
  expect(await voidSale(test.db, actors.owner, saleId, { reason: "x" }, LATER)).toEqual(
    failure("validation_error"),
  );
});

it("filtra días locales completos y rechaza rangos de más de 31 días", async () => {
  const data = { ...input(), items: [{ productId, quantity: 1 }] };
  for (const at of ["2026-11-15T02:59:59Z", "2026-11-15T03:00:00Z"])
    expect(await createSale(test.db, actors.admin, data, new Date(at))).toMatchObject({ ok: true });
  expect(await listSales(test.db, actors.reception, RANGE)).toHaveLength(1);
  expect(
    await listSales(test.db, actors.reception, { from: "2026-11-01", to: "2026-12-01" }),
  ).toHaveLength(2);
  for (const range of [
    { from: "2026-11-01", to: "2026-12-02" },
    { from: "2026-11-15", to: "2026-11-14" },
    { from: "inválido", to: "2026-11-14" },
  ])
    expect(await listSales(test.db, actors.reception, range)).toEqual([]);
  expect(formatSaleNumber(1)).toBe("VM-00001");
  expect(SALE_STATUSES).toEqual(["abierta", "pagada", "anulada"]);
  expect(SALE_STATUS_LABELS).toEqual({ abierta: "Abierta", pagada: "Pagada", anulada: "Anulada" });
});
