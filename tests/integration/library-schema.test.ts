import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { eq, getTableColumns, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { technicalDocuments } from "../../src/server/db/schema-library-catalog.ts";
import {
  articleVersions,
  documentChunks,
  knowledgeArticles,
  libraryKnowledgeTables,
} from "../../src/server/db/schema-library-knowledge.ts";
import {
  aiInteractions,
  knowledgeProposals,
  libraryPrivateTables,
  technicalDiagnoses,
} from "../../src/server/db/schema-library-private.ts";
import {
  compatibilityRules,
  libraryProcedureTables,
  procedures,
  procedureSteps,
} from "../../src/server/db/schema-library-procedures.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

let test: TestDb;
const now = new Date("2026-11-15T12:00:00Z");
const tables = [...libraryKnowledgeTables, ...libraryProcedureTables, ...libraryPrivateTables];

beforeEach(async () => {
  test = await createTestDb();
});

afterEach(async () => {
  await test.close();
});

async function actor() {
  const [branch] = await test.db
    .insert(branches)
    .values({ name: "Sucursal de prueba" })
    .returning();
  if (!branch) throw new Error("Falta la sucursal de prueba");
  const [user] = await test.db
    .insert(users)
    .values({
      branchId: branch.id,
      email: "curador@ejemplo.cl",
      passwordHash: "test-hash",
      name: "Curador",
      role: "admin",
    })
    .returning();
  if (!user) throw new Error("Falta el usuario de prueba");
  return { branchId: branch.id, userId: user.id };
}

async function version() {
  const [article] = await test.db
    .insert(knowledgeArticles)
    .values({
      slug: "diagnostico-cambios",
      title: "Diagnóstico de cambios",
      category: "transmision",
      kind: "diagnostico",
    })
    .returning();
  if (!article) throw new Error("Falta el artículo de prueba");
  const [row] = await test.db
    .insert(articleVersions)
    .values({
      articleId: article.id,
      number: 1,
      contentMd: "Inspeccionar el cambio trasero",
      contentHash: "test-hash",
    })
    .returning();
  if (!row) throw new Error("Falta la versión de prueba");
  return row;
}

async function order() {
  const user = await actor();
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: user.branchId,
      name: "Cliente de prueba",
      phoneE164: "+56911111111",
    })
    .returning();
  if (!customer) throw new Error("Falta el cliente de prueba");
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: user.branchId,
      customerId: customer.id,
      brand: "Marca",
      model: "Modelo",
      bikeType: "mtb",
    })
    .returning();
  if (!bike) throw new Error("Falta la bicicleta de prueba");
  const [row] = await test.db
    .insert(workOrders)
    .values({
      branchId: user.branchId,
      customerId: customer.id,
      bikeId: bike.id,
      number: 1,
      requestedService: "Revisión",
      createdBy: user.userId,
    })
    .returning();
  if (!row) throw new Error("Falta la orden de prueba");
  return { ...user, workOrderId: row.id, bikeId: bike.id };
}

it("migra las 16 tablas de los tres arreglos con identificadores e instantes obligatorios", async () => {
  expect(libraryKnowledgeTables).toHaveLength(5);
  expect(libraryProcedureTables).toHaveLength(5);
  expect(libraryPrivateTables).toHaveLength(6);
  const present = await test.client.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public'",
  );
  expect(tables.map((table) => getTableConfig(table).name)).toEqual([
    "knowledge_articles",
    "article_versions",
    "article_variant_links",
    "diagnostic_rules",
    "document_chunks",
    "procedures",
    "procedure_steps",
    "procedure_specs",
    "compatibility_rules",
    "compatibility_rule_members",
    "knowledge_proposals",
    "proposal_reviews",
    "publication_events",
    "technical_diagnoses",
    "private_technical_notes",
    "ai_interactions",
  ]);
  for (const table of tables) {
    const name = getTableConfig(table).name;
    expect(present.rows).toContainEqual({ table_name: name });
    const columns = await test.client.query(
      "select column_name, is_nullable, data_type from information_schema.columns where table_schema = 'public' and table_name = $1",
      [name],
    );
    for (const column of ["id", "created_at", "updated_at"]) {
      expect(columns.rows).toContainEqual({
        column_name: column,
        is_nullable: "NO",
        data_type: column === "id" ? "uuid" : "timestamp with time zone",
      });
    }
    expect(getTableConfig(table).foreignKeys.every((fk) => fk.onDelete === "restrict")).toBe(true);
  }
});

it("exige documento para una compatibilidad oficial y admite una regla con evidencia", async () => {
  const values = {
    relation: "oficial_confirmada",
    evidence: "Manual del fabricante",
    certainty: "alta",
  };
  await expect(test.db.insert(compatibilityRules).values(values)).rejects.toThrow();
  const [document] = await test.db
    .insert(technicalDocuments)
    .values({
      title: "Manual",
      canonicalUrl: "https://ejemplo.cl/manual",
      docType: "manual",
    })
    .returning();
  if (!document) throw new Error("Falta el documento de prueba");
  const [rule] = await test.db
    .insert(compatibilityRules)
    .values({
      ...values,
      sourceDocumentId: document.id,
    })
    .returning();
  expect(rule).toMatchObject({ status: "vigente", sourceDocumentId: document.id });
  await test.db.insert(compatibilityRules).values({ ...values, relation: "no_verificada" });
});

it("vincula la versión publicada exactamente al estado published de la propuesta", async () => {
  const user = await actor();
  const row = await version();
  const values = {
    branchId: user.branchId,
    authorId: user.userId,
    kind: "diagnostico",
    title: "Cambio trasero",
    contentMd: "Revisar cable",
  };
  await expect(
    test.db.insert(knowledgeProposals).values({ ...values, status: "published" }),
  ).rejects.toThrow();
  await expect(
    test.db.insert(knowledgeProposals).values({ ...values, publishedVersionId: row.id }),
  ).rejects.toThrow();
  const [draft] = await test.db.insert(knowledgeProposals).values(values).returning();
  expect(draft).toMatchObject({
    status: "draft",
    publishedVersionId: null,
    evidence: "",
    piiFlags: [],
  });
  const [published] = await test.db
    .insert(knowledgeProposals)
    .values({
      ...values,
      status: "published",
      publishedVersionId: row.id,
    })
    .returning();
  expect(published).toMatchObject({ status: "published", publishedVersionId: row.id });
});

it("exige orden para una interacción de IA en ese contexto y aplica los defaults", async () => {
  const row = await order();
  const values = {
    branchId: row.branchId,
    userId: row.userId,
    scope: "orden",
    question: "¿Qué revisar?",
    confidence: "no_verificada",
    provider: "prueba",
    promptVersion: "bt-1",
    status: "sin_evidencia",
  };
  await expect(test.db.insert(aiInteractions).values(values)).rejects.toThrow();
  const [interaction] = await test.db
    .insert(aiInteractions)
    .values({ ...values, workOrderId: row.workOrderId })
    .returning();
  expect(interaction).toMatchObject({
    answer: "",
    model: "",
    citations: [],
    tokensIn: 0,
    tokensOut: 0,
  });
  await test.db.insert(aiInteractions).values({ ...values, scope: "biblioteca" });
});

it("exige fecha de confirmación exactamente para un diagnóstico confirmado", async () => {
  const row = await order();
  const values = {
    branchId: row.branchId,
    createdBy: row.userId,
    workOrderId: row.workOrderId,
    bikeId: row.bikeId,
    symptoms: "Ruido al cambiar",
  };
  await expect(
    test.db.insert(technicalDiagnoses).values({ ...values, status: "confirmado" }),
  ).rejects.toThrow();
  await expect(
    test.db.insert(technicalDiagnoses).values({ ...values, confirmedAt: now }),
  ).rejects.toThrow();
  const [draft] = await test.db.insert(technicalDiagnoses).values(values).returning();
  expect(draft).toMatchObject({ status: "borrador", refs: [], voidedAt: null });
  const [confirmed] = await test.db
    .insert(technicalDiagnoses)
    .values({
      ...values,
      status: "confirmado",
      confirmedAt: now,
      confirmedBy: row.userId,
      refs: [{ kind: "article_version", id: randomUUID(), versionNumber: 1 }],
    })
    .returning();
  expect(confirmed).toMatchObject({ confirmedAt: now, confirmedBy: row.userId });
});

it("busca las raíces de palabras en español y mantiene únicos los trozos por fuente", async () => {
  const values = {
    sourceKind: "document",
    sourceId: randomUUID(),
    chunkIndex: 0,
    text: "Revisar el cambio trasero",
  };
  const [chunk] = await test.db.insert(documentChunks).values(values).returning();
  await test.db
    .insert(documentChunks)
    .values({ ...values, chunkIndex: 1, text: "Inspeccionar frenos y discos" });
  const found = await test.db
    .select()
    .from(documentChunks)
    .where(
      sql`to_tsvector('spanish', ${documentChunks.text}) @@ plainto_tsquery('spanish', ${"cambios traseros"})`,
    );
  expect(found).toEqual([chunk]);
  expect(chunk).toMatchObject({ scope: "global", metadata: {} });
  await expect(test.db.insert(documentChunks).values(values)).rejects.toThrow();
  await expect(
    test.db.insert(documentChunks).values({ ...values, chunkIndex: 2, scope: "privado" }),
  ).rejects.toThrow();
  await expect(
    test.db.insert(documentChunks).values({ ...values, sourceKind: "otro" }),
  ).rejects.toThrow();
});

it("genera una sola migración aditiva con el índice GIN de expresión en español", async () => {
  const files = readdirSync("drizzle").filter((file) => /^0036_.*\.sql$/.test(file));
  expect(files).toHaveLength(1);
  const migration = readFileSync(`drizzle/${files[0]}`, "utf8");
  expect(migration).toMatch(
    /CREATE INDEX "idx_document_chunks_fts".*USING gin \(to_tsvector\('spanish',/,
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    expect(statement.trim()).toMatch(
      /^(CREATE TABLE |CREATE (UNIQUE )?INDEX |ALTER TABLE "[a-z_]+" ADD CONSTRAINT "[a-z_]+" FOREIGN KEY )/,
    );
  }
  const index = await test.client.query<{ indexdef: string }>(
    "select indexdef from pg_indexes where indexname = 'idx_document_chunks_fts'",
  );
  expect(index.rows[0]?.indexdef).toMatch(
    /USING gin \(to_tsvector\('spanish'::regconfig, text\)\)/,
  );
});

it("limita branch_id NOT NULL a las cuatro tablas privadas", async () => {
  const privateNames = [
    "knowledge_proposals",
    "technical_diagnoses",
    "private_technical_notes",
    "ai_interactions",
  ];
  for (const table of tables) {
    const name = getTableConfig(table).name;
    const column = Object.values(getTableColumns(table)).find(
      (column) => column.name === "branch_id",
    );
    const columns = await test.client.query(
      "select is_nullable from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = 'branch_id'",
      [name],
    );
    if (privateNames.includes(name)) {
      expect(column?.notNull).toBe(true);
      expect(columns.rows).toEqual([{ is_nullable: "NO" }]);
    } else {
      expect(column).toBeUndefined();
      expect(columns.rows).toEqual([]);
    }
  }
});

it("enlaza versiones actuales y anteriores y exige número positivo único por artículo", async () => {
  const row = await version();
  expect(row).toMatchObject({ sources: [], summary: "" });
  const values = {
    articleId: row.articleId,
    number: 2,
    contentMd: "Nueva revisión",
    contentHash: "otro-hash",
    supersedesVersionId: row.id,
  };
  const [next] = await test.db.insert(articleVersions).values(values).returning();
  if (!next) throw new Error("Falta la revisión de prueba");
  await test.db
    .update(knowledgeArticles)
    .set({ currentVersionId: next.id })
    .where(eq(knowledgeArticles.id, row.articleId));
  const [article] = await test.db
    .select()
    .from(knowledgeArticles)
    .where(eq(knowledgeArticles.id, row.articleId));
  expect(article).toMatchObject({ currentVersionId: next.id, language: "es", status: "borrador" });
  await expect(test.db.insert(articleVersions).values(values)).rejects.toThrow();
  await expect(test.db.insert(articleVersions).values({ ...values, number: 0 })).rejects.toThrow();
});

it("exige procedimiento único por versión y secuencias y duraciones positivas", async () => {
  const row = await version();
  const values = { versionId: row.id, title: "Ajustar cambio", kind: "ajuste", risk: "bajo" };
  await expect(
    test.db.insert(procedures).values({ ...values, durationMinutes: 0 }),
  ).rejects.toThrow();
  const [procedure] = await test.db.insert(procedures).values(values).returning();
  if (!procedure) throw new Error("Falta el procedimiento de prueba");
  await expect(test.db.insert(procedures).values(values)).rejects.toThrow();
  const step = { procedureId: procedure.id, sequence: 1, action: "Inspeccionar cable" };
  await test.db.insert(procedureSteps).values(step);
  await expect(test.db.insert(procedureSteps).values(step)).rejects.toThrow();
  await expect(test.db.insert(procedureSteps).values({ ...step, sequence: 0 })).rejects.toThrow();
});
