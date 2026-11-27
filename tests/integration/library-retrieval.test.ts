import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { documentChunks, knowledgeArticles } from "../../src/server/db/schema-library-knowledge.ts";
import {
  privateTechnicalNotes,
  technicalDiagnoses,
} from "../../src/server/db/schema-library-private.ts";
import { bikeComponents } from "../../src/server/db/schema-payments.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { reindexAll } from "../../src/server/library/chunks.ts";
import { importLibraryPack, libraryPackSchema } from "../../src/server/library/content-pack.ts";
import { createProposal, submitProposal } from "../../src/server/library/proposals.ts";
import { archiveArticle, publishProposal } from "../../src/server/library/publish.ts";
import { retrieve } from "../../src/server/library/retrieval.ts";
import { reviewProposal } from "../../src/server/library/review.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-15T15:00:00.000Z");
let test: TestDb;
let owner: SessionUser;
let curator: SessionUser;
let mechanic: SessionUser;
let otherMechanic: SessionUser;
let outsider: SessionUser;
let orderId: string;

async function actor(branchId: string, role: Role, libraryCurator = false): Promise<SessionUser> {
  const [row] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      libraryCurator,
      name: `Usuario ${role}`,
      email: `${randomUUID()}@ejemplo.cl`,
      passwordHash: "hash",
    })
    .returning();
  if (!row) throw new Error("Falta el usuario");
  return { id: row.id, branchId, role, libraryCurator, name: row.name, email: row.email };
}

async function seedOrder(branchId: string, createdBy: string, mechanicId: string | null) {
  const [customer] = await test.db
    .insert(customers)
    .values({ branchId, name: "Cliente Privado", phoneE164: "+56911112222", email: "c@ejemplo.cl" })
    .returning();
  if (!customer) throw new Error("Falta el cliente");
  const [bike] = await test.db
    .insert(bikes)
    .values({ branchId, customerId: customer.id, brand: "Trek", model: "Marlin", bikeType: "mtb" })
    .returning();
  if (!bike) throw new Error("Falta la bici");
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId,
      number: Math.floor(Math.random() * 90000) + 1,
      customerId: customer.id,
      bikeId: bike.id,
      status: "en_progreso",
      requestedService: "La cadena salta",
      assignedMechanicId: mechanicId,
      createdBy,
    })
    .returning();
  if (!order) throw new Error("Falta la orden");
  await test.db.insert(bikeComponents).values({
    branchId,
    bikeId: bike.id,
    workOrderId: order.id,
    componentType: "Cadena",
    brand: "Shimano",
    model: "CN-M8100",
    installedAt: "2026-11-01",
    createdBy,
  });
  await test.db.insert(technicalDiagnoses).values({
    branchId,
    workOrderId: order.id,
    bikeId: bike.id,
    symptoms: "Salta en piñones chicos",
    createdBy,
  });
  await test.db
    .insert(privateTechnicalNotes)
    .values({ branchId, authorId: createdBy, workOrderId: order.id, contentMd: "Nota del taller" });
  return order.id;
}

async function publish(title: string, contentMd: string) {
  const created = await createProposal(test.db, owner, { kind: "articulo", title, contentMd }, NOW);
  if (!created.ok) throw new Error(created.code);
  await submitProposal(test.db, owner, created.id, NOW);
  await reviewProposal(test.db, curator, created.id, { decision: "in_review" }, NOW);
  await reviewProposal(test.db, curator, created.id, { decision: "approved" }, NOW);
  const result = await publishProposal(
    test.db,
    curator,
    created.id,
    { category: "transmision" },
    NOW,
  );
  if (!result.ok) throw new Error(result.code);
  return result;
}

beforeEach(async () => {
  test = await createTestDb();
  const [a, b] = await test.db
    .insert(branches)
    .values([{ name: "Vitacura" }, { name: "Otra" }])
    .returning();
  if (!a || !b) throw new Error("Faltan sucursales");
  owner = await actor(a.id, "owner");
  curator = await actor(a.id, "owner", true);
  mechanic = await actor(a.id, "mechanic");
  otherMechanic = await actor(a.id, "mechanic");
  outsider = await actor(b.id, "owner");
  const pack = libraryPackSchema.parse(
    JSON.parse(readFileSync("src/data/library/pack.json", "utf8")),
  );
  await importLibraryPack(test.db, owner.id, pack, NOW, { dryRun: false });
  await reindexAll(test.db);
  orderId = await seedOrder(a.id, owner.id, mechanic.id);
  return () => test.close();
});

it("recupera trozos publicados y no los de un borrador", async () => {
  const [draft] = await test.db
    .insert(knowledgeArticles)
    .values({
      slug: "borrador-x",
      title: "Borrador cadena salta",
      category: "transmision",
      kind: "articulo",
    })
    .returning();
  if (!draft) throw new Error("Falta el borrador");
  await test.db.insert(documentChunks).values({
    sourceKind: "article_version",
    sourceId: randomUUID(),
    chunkIndex: 0,
    text: "Borrador: la cadena salta por un motivo inventado",
  });
  const result = await retrieve(test.db, mechanic, {
    question: "¿por qué la cadena salta bajo carga?",
  });
  if (!result.ok) throw new Error(result.code);
  expect(result.global.length).toBeGreaterThan(0);
  expect(result.global.some((chunk) => chunk.text.includes("motivo inventado"))).toBe(false);
  expect(result.private).toBeNull();
});

it("solo la versión vigente y nunca un artículo archivado", async () => {
  const first = await publish(
    "Salto de cadena viejo",
    "La cadena salta: texto de la primera versión.",
  );
  const correction = await createProposal(
    test.db,
    owner,
    {
      kind: "correccion",
      title: "Salto de cadena corregido",
      contentMd: "La cadena salta: texto de la segunda versión con medición.",
      targetArticleId: first.articleId,
    },
    NOW,
  );
  if (!correction.ok) throw new Error(correction.code);
  await submitProposal(test.db, owner, correction.id, NOW);
  await reviewProposal(test.db, curator, correction.id, { decision: "in_review" }, NOW);
  await reviewProposal(test.db, curator, correction.id, { decision: "approved" }, NOW);
  await publishProposal(test.db, curator, correction.id, {}, NOW);
  let result = await retrieve(test.db, mechanic, { question: "cadena salta versión" });
  if (!result.ok) throw new Error(result.code);
  const texts = result.global.map((chunk) => chunk.text).join(" ");
  expect(texts).toContain("segunda versión");
  expect(texts).not.toContain("primera versión");
  await archiveArticle(test.db, curator, first.articleId, "", NOW);
  result = await retrieve(test.db, mechanic, { question: "cadena salta versión" });
  if (!result.ok) throw new Error(result.code);
  expect(result.global.map((chunk) => chunk.text).join(" ")).not.toContain("segunda versión");
});

it("un código exacto en la pregunta va primero", async () => {
  const result = await retrieve(test.db, mechanic, {
    question: "¿qué especificaciones tiene el rd-m8100-sgs?",
  });
  if (!result.ok) throw new Error(result.code);
  expect(result.global[0]?.exactCode).toBe(true);
  expect(result.global[0]?.text).toContain("RD-M8100-SGS");
});

it("una orden de otra sucursal o ajena al mecánico responde forbidden", async () => {
  expect(await retrieve(test.db, outsider, { question: "cadena salta", orderId })).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(await retrieve(test.db, otherMechanic, { question: "cadena salta", orderId })).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(
    await retrieve(test.db, owner, { question: "cadena salta", orderId: randomUUID() }),
  ).toEqual({ ok: false, code: "forbidden" });
});

it("con una orden accesible trae contexto técnico sin datos del cliente", async () => {
  const result = await retrieve(test.db, mechanic, { question: "cadena salta", orderId });
  if (!result.ok) throw new Error(result.code);
  expect(result.private).toMatchObject({
    orderId,
    bike: { brand: "Trek", model: "Marlin" },
    components: [{ componentType: "Cadena", model: "CN-M8100" }],
    diagnoses: [{ symptoms: "Salta en piñones chicos" }],
    notes: [{ contentMd: "Nota del taller" }],
  });
  const json = JSON.stringify(result.private);
  for (const forbidden of [
    "Cliente Privado",
    "+56911112222",
    "c@ejemplo.cl",
    "customer",
    "phone",
    "email",
    "rut",
  ])
    expect(json).not.toContain(forbidden);
});

it("reindexAll es idempotente y valida la entrada", async () => {
  const before = (await test.db.select().from(documentChunks)).length;
  await reindexAll(test.db);
  expect((await test.db.select().from(documentChunks)).length).toBe(before);
  expect(await retrieve(test.db, mechanic, { question: "x" })).toEqual({
    ok: false,
    code: "validation_error",
  });
  const voided = await test.db.select().from(workOrders).where(eq(workOrders.id, orderId));
  expect(voided).toHaveLength(1);
});
