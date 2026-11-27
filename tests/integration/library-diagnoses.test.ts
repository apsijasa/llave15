import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import {
  workOrderApprovals,
  workOrderItems,
  workOrderStatusHistory,
  workOrders,
} from "../../src/server/db/schema-orders.ts";
import { stockMovements } from "../../src/server/db/schema-inventory.ts";
import { componentVariants } from "../../src/server/db/schema-library-catalog.ts";
import { articleVersions } from "../../src/server/db/schema-library-knowledge.ts";
import { aiInteractions, technicalDiagnoses } from "../../src/server/db/schema-library-private.ts";
import { payments } from "../../src/server/db/schema-payments.ts";
import { auditLog, bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { importLibraryPack, libraryPackSchema } from "../../src/server/library/content-pack.ts";
import {
  confirmDiagnosis,
  listDiagnoses,
  saveDiagnosis,
  voidDiagnosis,
} from "../../src/server/library/diagnoses.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-15T15:00:00.000Z");
let test: TestDb;
let owner: SessionUser;
let mechanic: SessionUser;
let otherMechanic: SessionUser;
let outsider: SessionUser;
let orderId: string;
let versionId: string;
let variantId: string;

async function actor(branchId: string, role: Role): Promise<SessionUser> {
  const [row] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      name: `Usuario ${role}`,
      email: `${randomUUID()}@ejemplo.cl`,
      passwordHash: "hash",
    })
    .returning();
  if (!row) throw new Error("Falta el usuario");
  return { id: row.id, branchId, role, name: row.name, email: row.email };
}

async function order(
  branchId: string,
  createdBy: string,
  mechanicId: string | null,
  status = "en_progreso",
) {
  const [customer] = await test.db
    .insert(customers)
    .values({ branchId, name: "C", phoneE164: "+56911112222" })
    .returning();
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId,
      customerId: customer?.id ?? "",
      brand: "Trek",
      model: "Marlin",
      bikeType: "mtb",
    })
    .returning();
  const [row] = await test.db
    .insert(workOrders)
    .values({
      branchId,
      number: Math.floor(Math.random() * 90000) + 1,
      customerId: customer?.id ?? "",
      bikeId: bike?.id ?? "",
      status,
      requestedService: "Cadena salta",
      assignedMechanicId: mechanicId,
      createdBy,
      ...(status === "entregada" ? { qcApprovedAt: NOW, qcApprovedBy: createdBy } : {}),
    })
    .returning();
  if (!row) throw new Error("Falta la orden");
  return row.id;
}

const INPUT = () => ({
  symptoms: "Salta bajo carga en piñones chicos",
  inspections: [
    { key: "desgaste_cadena", label: "Medir desgaste de cadena", done: true, result: "0,75" },
  ],
  hypotheses: [{ text: "Cadena gastada", evidence: "Medición", confidence: "media" }],
  result: null,
  references: [
    { kind: "article_version", id: versionId },
    { kind: "variant", id: variantId },
  ],
});

async function counts() {
  const tables = [
    workOrderItems,
    payments,
    workOrderApprovals,
    stockMovements,
    workOrderStatusHistory,
  ];
  return Promise.all(tables.map(async (table) => (await test.db.select().from(table)).length));
}

beforeEach(async () => {
  test = await createTestDb();
  const [a, b] = await test.db
    .insert(branches)
    .values([{ name: "Vitacura" }, { name: "Otra" }])
    .returning();
  if (!a || !b) throw new Error("Faltan sucursales");
  owner = await actor(a.id, "owner");
  mechanic = await actor(a.id, "mechanic");
  otherMechanic = await actor(a.id, "mechanic");
  outsider = await actor(b.id, "owner");
  const pack = libraryPackSchema.parse(
    JSON.parse(readFileSync("src/data/library/pack.json", "utf8")),
  );
  await importLibraryPack(test.db, null, pack, NOW, { dryRun: false });
  const [version] = await test.db.select().from(articleVersions).limit(1);
  const [variant] = await test.db.select().from(componentVariants).limit(1);
  if (!version || !variant) throw new Error("Falta contenido");
  versionId = version.id;
  variantId = variant.id;
  orderId = await order(a.id, owner.id, mechanic.id);
  return () => test.close();
});

it("guarda un borrador con referencias versionadas sin tocar la orden", async () => {
  const [before] = await test.db.select().from(workOrders).where(eq(workOrders.id, orderId));
  const others = await counts();
  const result = await saveDiagnosis(test.db, mechanic, orderId, INPUT(), NOW);
  if (!result.ok) throw new Error(result.code);
  const [row] = await test.db.select().from(technicalDiagnoses);
  expect(row).toMatchObject({
    status: "borrador",
    createdBy: mechanic.id,
    branchId: mechanic.branchId,
  });
  expect(row?.refs).toEqual([
    { kind: "article_version", id: versionId, versionNumber: 1 },
    { kind: "variant", id: variantId },
  ]);
  const [after] = await test.db.select().from(workOrders).where(eq(workOrders.id, orderId));
  expect(after).toEqual(before);
  expect(await counts()).toEqual(others);
  const audits = await test.db
    .select()
    .from(auditLog)
    .where(eq(auditLog.action, "diagnosis.saved"));
  expect(audits).toHaveLength(1);
});

it("rechaza referencias inexistentes y consultas de otra sucursal", async () => {
  const bad = { ...INPUT(), references: [{ kind: "procedure", id: randomUUID() }] };
  expect(await saveDiagnosis(test.db, mechanic, orderId, bad, NOW)).toEqual({
    ok: false,
    code: "invalid_reference",
  });
  const [foreign] = await test.db
    .insert(aiInteractions)
    .values({
      branchId: outsider.branchId,
      userId: outsider.id,
      scope: "biblioteca",
      question: "x",
      confidence: "baja",
      provider: "none",
      promptVersion: "bt-1",
      status: "respondida",
    })
    .returning();
  const withForeign = { ...INPUT(), aiInteractionId: foreign?.id };
  expect(await saveDiagnosis(test.db, mechanic, orderId, withForeign, NOW)).toEqual({
    ok: false,
    code: "invalid_reference",
  });
});

it("respeta sucursal, acceso del mecánico y órdenes cerradas", async () => {
  expect(await saveDiagnosis(test.db, outsider, orderId, INPUT(), NOW)).toEqual({
    ok: false,
    code: "not_found",
  });
  expect(await saveDiagnosis(test.db, otherMechanic, orderId, INPUT(), NOW)).toEqual({
    ok: false,
    code: "forbidden",
  });
  const closed = await order(owner.branchId, owner.id, mechanic.id, "entregada");
  expect(await saveDiagnosis(test.db, owner, closed, INPUT(), NOW)).toEqual({
    ok: false,
    code: "order_closed",
  });
  expect(await test.db.select().from(technicalDiagnoses)).toHaveLength(0);
});

it("confirma una vez, lista y anula", async () => {
  const saved = await saveDiagnosis(test.db, mechanic, orderId, INPUT(), NOW);
  if (!saved.ok) throw new Error(saved.code);
  expect(await confirmDiagnosis(test.db, mechanic, saved.id, NOW)).toEqual({ ok: true });
  expect(await confirmDiagnosis(test.db, mechanic, saved.id, NOW)).toEqual({
    ok: false,
    code: "already_confirmed",
  });
  const list = await listDiagnoses(test.db, owner, orderId);
  expect(list.ok && list.items[0]).toMatchObject({
    status: "confirmado",
    confirmedByName: "Usuario mechanic",
    authorName: "Usuario mechanic",
  });
  expect(await voidDiagnosis(test.db, mechanic, saved.id, NOW)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(await voidDiagnosis(test.db, owner, saved.id, NOW)).toEqual({ ok: true });
  const after = await listDiagnoses(test.db, owner, orderId);
  expect(after.ok && after.items).toEqual([]);
  expect(await listDiagnoses(test.db, outsider, orderId)).toEqual({ ok: false, code: "not_found" });
});

it("la lista describe cada referencia con su título y un enlace, sin ids a la vista", async () => {
  const saved = await saveDiagnosis(test.db, mechanic, orderId, INPUT(), NOW);
  if (!saved.ok) throw new Error(saved.code);
  const list = await listDiagnoses(test.db, mechanic, orderId);
  if (!list.ok) throw new Error(list.code);
  const [article, variant] = list.items[0]?.refs ?? [];
  expect(article?.label).toMatch(/^Artículo · .+ · versión 1$/);
  expect(article?.label).not.toContain(versionId);
  expect(article?.href).toMatch(/^\/taller\/biblioteca\/buscar\?q=/);
  expect(variant?.href).toBe(`/taller/biblioteca/componentes/${variantId}`);
});
