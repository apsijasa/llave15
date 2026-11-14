import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import ReportView from "../../src/components/taller/ReportView.astro";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { serviceReports } from "../../src/server/db/schema-reports.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import type { ObjectStorage } from "../../src/server/storage/storage.ts";
import {
  generateReport,
  getReportForStaff,
  viewReportByToken,
} from "../../src/server/taller/reports.ts";
import type { ReportSnapshot } from "../../src/server/taller/reports.ts";
import { hashShareToken, newShareToken } from "../../src/server/taller/share-tokens.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-14T15:00:00Z");
const INPUT = { recommendations: "Lubricar la cadena", nextChecks: "Revisar en seis meses" };
const LEGACY: ReportSnapshot = {
  version: 1,
  orderNumber: "OT-00001",
  customerFirstName: "Ana",
  bike: {
    brand: "Trek",
    model: "Marlin",
    year: null,
    type: "mtb",
    size: null,
    color: null,
    serialNumber: null,
    kmNoted: null,
  },
  receivedAt: null,
  deliveredAt: null,
  diagnosis: null,
  workDone: [],
  problemsFound: [],
  componentsReplaced: [],
  photosBefore: [],
  photosAfter: [],
  ...INPUT,
  rejectedWork: [],
  totalClp: 11900,
};
const storage: ObjectStorage = {
  get: async () => null,
  put: vi.fn<ObjectStorage["put"]>(),
  delete: vi.fn<ObjectStorage["delete"]>(),
  exists: async () => false,
};
let test: TestDb;
let owner: SessionUser;
let customerId: string;
let bikeId: string;

async function seedIdentity() {
  owner = {
    id: randomUUID(),
    branchId: randomUUID(),
    role: "owner",
    name: "Dueño",
    email: "owner@example.test",
  };
  customerId = randomUUID();
  bikeId = randomUUID();
  await test.db.insert(branches).values({ id: owner.branchId, name: "Vitacura" });
  await test.db.insert(users).values({ ...owner, passwordHash: "hash" });
  await test.db.insert(customers).values({
    id: customerId,
    branchId: owner.branchId,
    name: "Ana Pérez",
    phoneE164: "+56912345678",
  });
  await test.db.insert(bikes).values({
    id: bikeId,
    branchId: owner.branchId,
    customerId,
    brand: "Trek",
    model: "Marlin",
    bikeType: "mtb",
  });
}

async function seedOrder(pricingMode: "neto" | "final", subtotalClp = 10000, vatClp = 1900) {
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: owner.branchId,
      number: 1,
      customerId,
      bikeId,
      status: "lista_para_retirar",
      requestedService: "Mantención",
      pricingMode,
      subtotalClp: pricingMode === "neto" ? subtotalClp : 0,
      vatClp: pricingMode === "neto" ? vatClp : 0,
      totalClp: subtotalClp + vatClp,
      qcApprovedAt: NOW,
      createdBy: owner.id,
    })
    .returning();
  if (!order) throw new Error("Falta la orden.");
  return order;
}

async function generate(orderId: string) {
  const result = await generateReport(test.db, owner, orderId, INPUT, NOW);
  if (!result.ok) throw new Error(result.code);
  const [row] = await test.db.select().from(serviceReports);
  if (!row) throw new Error("Falta el informe.");
  return { token: result.token, snapshot: row.snapshot };
}

async function render(snapshot: ReportSnapshot) {
  const container = await AstroContainer.create();
  return container.renderToString(ReportView, { props: { snapshot, photos: {} } });
}

function expectAmount(html: string, label: string, amount: number) {
  const value = `$${new Intl.NumberFormat("es-CL").format(amount)}`;
  expect(html).toMatch(new RegExp(`<dt[^>]*>${label}</dt>\\s*<dd[^>]*>\\${value}</dd>`));
}

function expectLegacyTotal(html: string) {
  const value = `$${new Intl.NumberFormat("es-CL").format(LEGACY.totalClp)}`;
  expect(html).toMatch(
    new RegExp(`<h2[^>]*>Total</h2>\\s*<p class="tabular-nums"[^>]*>\\${value}</p>`),
  );
  expect(html).not.toContain("Neto");
  expect(html).not.toContain("IVA (");
}

beforeEach(async () => {
  test = await createTestDb();
  await seedIdentity();
  return () => test.close();
});

it("congela neto, IVA y tasa al generar y conserva el desglose en las lecturas interna y pública", async () => {
  const order = await seedOrder("neto");
  const { token, snapshot } = await generate(order.id);
  expect(snapshot).toMatchObject({
    version: 1,
    subtotalClp: 10000,
    vatClp: 1900,
    vatRatePercent: 19,
    totalClp: 11900,
  });
  await test.db
    .update(workOrders)
    .set({ subtotalClp: 20000, vatClp: 3800, totalClp: 23800 })
    .where(eq(workOrders.id, order.id));
  const staff = await getReportForStaff(test.db, owner, order.id);
  const publicReport = await viewReportByToken(test.db, storage, token);
  expect(staff?.snapshot).toEqual(snapshot);
  expect(publicReport?.snapshot).toEqual(snapshot);
  for (const report of [staff, publicReport]) {
    if (!report) throw new Error("Falta el informe guardado.");
    const html = await render(report.snapshot);
    expectAmount(html, "Neto", 10000);
    expectAmount(html, "IVA \\(19%\\)", 1900);
    expectAmount(html, "Total", 11900);
  }
});

it("muestra las tres filas incluso cuando el IVA y el neto son cero", async () => {
  const order = await seedOrder("neto", 0, 0);
  await generate(order.id);
  const report = await getReportForStaff(test.db, owner, order.id);
  if (!report) throw new Error("Falta el informe.");
  const html = await render(report.snapshot);
  expectAmount(html, "Neto", 0);
  expectAmount(html, "IVA \\(19%\\)", 0);
  expectAmount(html, "Total", 0);
});

it("renderiza el desglose y la tasa guardados en el snapshot", async () => {
  const snapshot = {
    ...LEGACY,
    subtotalClp: 10000,
    vatClp: 700,
    vatRatePercent: 7,
    totalClp: 10700,
  };
  const html = await render(snapshot);
  expectAmount(html, "Neto", 10000);
  expectAmount(html, "IVA \\(7%\\)", 700);
  expectAmount(html, "Total", 10700);
});

it("genera informes final sin claves de desglose y mantiene el marcado del total", async () => {
  const order = await seedOrder("final");
  const { snapshot } = await generate(order.id);
  for (const key of ["subtotalClp", "vatClp", "vatRatePercent"])
    expect(snapshot).not.toHaveProperty(key);
  const report = await getReportForStaff(test.db, owner, order.id);
  if (!report) throw new Error("Falta el informe.");
  expectLegacyTotal(await render(report.snapshot));
});

it("valida un snapshot v1 antiguo sin agregar campos opcionales", async () => {
  const { snapshotSchema } = await import("../../src/server/taller/report-snapshot.ts");
  expect(snapshotSchema.parse(LEGACY)).toEqual(LEGACY);
  for (const key of ["subtotalClp", "vatClp", "vatRatePercent"])
    expect(snapshotSchema.safeParse({ ...LEGACY, [key]: 1.5 }).success).toBe(false);
});

it("abre un informe v1 guardado antes del cambio y conserva su total sin desglose", async () => {
  const order = await seedOrder("neto");
  const token = newShareToken();
  await test.db.insert(serviceReports).values({
    branchId: owner.branchId,
    workOrderId: order.id,
    snapshot: LEGACY,
    shareTokenHash: hashShareToken(token),
    generatedAt: NOW,
    generatedBy: owner.id,
  });
  const staff = await getReportForStaff(test.db, owner, order.id);
  const publicReport = await viewReportByToken(test.db, storage, token);
  for (const report of [staff, publicReport]) {
    expect(report?.snapshot).toEqual(LEGACY);
    if (!report) throw new Error("Falta el informe antiguo.");
    expectLegacyTotal(await render(report.snapshot));
  }
  expect((await test.db.select().from(serviceReports))[0]?.snapshot).toEqual(LEGACY);
});
