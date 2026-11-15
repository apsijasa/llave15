import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { count, eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  manufacturers,
  componentFamilies,
  componentModels,
  componentVariants,
  knowledgeSources,
  technicalDocuments,
  technicalSpecifications,
  toolsConsumables,
} from "../../src/server/db/schema-library-catalog.ts";
import {
  knowledgeArticles,
  articleVersions,
  articleVariantLinks,
} from "../../src/server/db/schema-library-knowledge.ts";
import { publicationEvents } from "../../src/server/db/schema-library-private.ts";
import { procedures, procedureSteps } from "../../src/server/db/schema-library-procedures.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { LIBRARY_CATEGORIES } from "../../src/server/library/rules.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-15T15:00:00Z");
const tables = {
  manufacturers,
  families: componentFamilies,
  models: componentModels,
  variants: componentVariants,
  sources: knowledgeSources,
  documents: technicalDocuments,
  specifications: technicalSpecifications,
  tools: toolsConsumables,
  articles: knowledgeArticles,
  articleVersions,
  articleVariantLinks,
  publicationEvents,
};
const totals = {
  manufacturers: 3,
  families: 8,
  models: 6,
  variants: 6,
  sources: 2,
  documents: 4,
  specifications: 2,
  tools: 3,
  articles: 2,
  articleVersions: 2,
  articleVariantLinks: 2,
  publicationEvents: 0,
};
let test: TestDb;

beforeEach(async () => {
  test = await createTestDb();
});
afterEach(async () => {
  await test.close();
});

async function fixture() {
  const api = await import("../../src/server/library/content-pack.ts");
  const raw = JSON.parse(readFileSync("src/data/library/pack.json", "utf8"));
  return { ...api, pack: api.libraryPackSchema.parse(raw) };
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("Falta una fila de prueba");
  return row;
}

async function counts() {
  const result: Record<string, number> = {};
  for (const [key, table] of Object.entries(tables)) {
    const [row] = await test.db.select({ count: count() }).from(table);
    result[key] = row?.count ?? 0;
  }
  return result;
}

async function snapshots() {
  const result: Record<string, unknown> = {};
  for (const [key, table] of Object.entries(tables))
    result[key] = await test.db.select().from(table);
  return result;
}

it("valida el contenido exacto de la siembra sin valores técnicos inventados", async () => {
  const { pack } = await fixture();
  for (const key of [
    "manufacturers",
    "families",
    "models",
    "variants",
    "sources",
    "documents",
    "specifications",
    "tools",
    "articles",
  ] as const) {
    expect(pack[key]).toHaveLength(totals[key]);
  }
  expect(pack.manufacturers.map((row) => row.slug)).toEqual(["shimano", "sram", "fox"]);
  expect(pack.families.map((row) => row.category).sort()).toEqual([...LIBRARY_CATEGORIES].sort());
  expect(pack.models.map((row) => row.code)).toEqual([
    "RD-M8100-SGS",
    "CS-M8100-12",
    "CN-M8100",
    "SL-M8100-R",
    "FC-M8100-1",
    "BR-M8120",
  ]);
  expect(pack.variants.every((row) => row.revision === "")).toBe(true);
  expect(pack.documents.every((row) => row.license === "enlace" && !row.checksum)).toBe(true);
  expect(
    pack.specifications.every(
      (row) => row.validationStatus === "sin_dato_verificado" && row.valueText === "",
    ),
  ).toBe(true);
  expect(pack.articles[0]?.version.number).toBe(1);
  expect(pack.articles[0]?.version.contentMd.split(/\n\n/)).toHaveLength(4);
});

it("importa dos veces sin modificar ninguna fila existente", async () => {
  const { pack, importLibraryPack } = await fixture();
  const first = await importLibraryPack(test.db, null, pack, NOW, { dryRun: false });
  expect(first).toMatchObject({ ok: true, created: totals });
  expect(await counts()).toEqual(totals);
  const importedProcedures = await test.db.select().from(procedures);
  const importedSteps = await test.db.select().from(procedureSteps);
  expect(importedProcedures).toHaveLength(1);
  expect(importedSteps).toHaveLength(4);
  const before = await snapshots();
  const second = await importLibraryPack(test.db, null, pack, NOW, { dryRun: false });
  expect(second).toMatchObject({
    ok: true,
    created: Object.fromEntries(Object.keys(totals).map((key) => [key, 0])),
    skipped: { ...totals, publicationEvents: 2 },
  });
  expect(await snapshots()).toEqual(before);
  expect(await test.db.select().from(procedures)).toEqual(importedProcedures);
  expect(await test.db.select().from(procedureSteps)).toEqual(importedSteps);
});

it("omite filas por sus claves aunque cambie el contenido del paquete", async () => {
  const { pack, importLibraryPack } = await fixture();
  await importLibraryPack(test.db, null, pack, NOW, { dryRun: false });
  const before = await snapshots();
  first(pack.manufacturers).name = "Otro nombre";
  first(pack.specifications).context = "Otro contexto";
  first(pack.tools).usage = "Otra indicación";
  first(pack.articles).version.contentMd = "Contenido corregido";
  expect(await importLibraryPack(test.db, null, pack, NOW, { dryRun: false })).toMatchObject({
    ok: true,
    created: Object.fromEntries(Object.keys(totals).map((key) => [key, 0])),
  });
  expect(await snapshots()).toEqual(before);
});

it("dryRun cuenta las altas reales y revierte todas las tablas", async () => {
  const { pack, importLibraryPack } = await fixture();
  expect(await importLibraryPack(test.db, null, pack, NOW, { dryRun: true })).toMatchObject({
    ok: true,
    created: totals,
    skipped: { publicationEvents: 2 },
  });
  expect(Object.values(await counts()).every((value) => value === 0)).toBe(true);
});

it("rechaza una variante con modelo inexistente antes de abrir una transacción", async () => {
  const { pack, importLibraryPack } = await fixture();
  first(pack.variants).model = "shimano/deore-xt/inexistente";
  const result = await importLibraryPack(test.db, null, pack, NOW, { dryRun: false });
  expect(result).toMatchObject({ ok: false, code: "validation_error" });
  if (result.ok) throw new Error("Falta el error de validación");
  expect(result.issues.join(" ")).toContain("RD-M8100-SGS");
  expect(Object.values(await counts()).every((value) => value === 0)).toBe(true);
});

it.each([
  "manufacturer",
  "family",
  "source",
  "document",
  "specification",
  "tool",
  "articleVariant",
  "articleSource",
  "articleDocument",
  "verified",
  "extra",
  "duplicate",
])("rechaza referencias o estructura inválida: %s", async (kind) => {
  const { pack, libraryPackSchema } = await fixture();
  const raw = JSON.parse(JSON.stringify(pack));
  if (kind === "manufacturer") raw.families[0].manufacturer = "ausente";
  if (kind === "family") raw.models[0].family = "ausente";
  if (kind === "source") raw.documents[0].source = "https://ausente.cl/";
  if (kind === "document") raw.specifications[0].sourceDocument = "https://ausente.cl/";
  if (kind === "specification") raw.specifications[0].variant = "ausente";
  if (kind === "tool") raw.tools[0].manufacturer = "ausente";
  if (kind === "articleVariant") raw.articles[0].variants = ["ausente"];
  if (kind === "articleSource")
    raw.articles[0].version.sources = [{ source: "https://ausente.cl/" }];
  if (kind === "articleDocument")
    raw.articles[0].version.sources = [{ document: "https://ausente.cl/" }];
  if (kind === "verified") raw.specifications[0].validationStatus = "verificado";
  if (kind === "extra") raw.models[0].unexpected = true;
  if (kind === "duplicate") raw.manufacturers.push(raw.manufacturers[0]);
  expect(libraryPackSchema.safeParse(raw).success).toBe(false);
});

it("resuelve revisiones distintas y documentos citados", async () => {
  const { pack, importLibraryPack } = await fixture();
  const variant = { ...first(pack.variants), revision: "B" };
  pack.variants.push(variant);
  const key = `${variant.model}/${variant.code}@B`;
  first(pack.articles).variants = [key];
  first(pack.articles).version.sources = [{ document: first(pack.documents).canonicalUrl }];
  first(pack.specifications).sourceDocument = first(pack.documents).canonicalUrl;
  first(pack.specifications).validationStatus = "verificado";
  expect(await importLibraryPack(test.db, null, pack, NOW, { dryRun: false })).toMatchObject({
    ok: true,
    created: { variants: 7 },
  });
  const [linked] = await test.db
    .select()
    .from(articleVariantLinks)
    .innerJoin(componentVariants, eq(articleVariantLinks.variantId, componentVariants.id));
  expect(linked?.component_variants.revision).toBe("B");
  const [document] = await test.db
    .select()
    .from(technicalDocuments)
    .where(eq(technicalDocuments.canonicalUrl, first(pack.documents).canonicalUrl));
  expect((await test.db.select().from(articleVersions))[0]?.sources).toEqual([
    { documentId: document?.id },
  ]);
});

async function actor() {
  const [branch] = await test.db.insert(branches).values({ name: "Sucursal" }).returning();
  if (!branch) throw new Error("Falta sucursal");
  const [user] = await test.db
    .insert(users)
    .values({
      branchId: branch.id,
      name: "Curador",
      email: "curador@ejemplo.cl",
      role: "admin",
      passwordHash: "prueba",
    })
    .returning();
  if (!user) throw new Error("Falta usuario");
  return user.id;
}

it("publica la versión inicial, hash, vínculos y evento con autor real", async () => {
  const { pack, importLibraryPack } = await fixture();
  const actorId = await actor();
  const result = await importLibraryPack(test.db, actorId, pack, NOW, { dryRun: false });
  expect(result).toMatchObject({ ok: true, created: { publicationEvents: 2 } });
  expect(await test.db.select().from(articleVariantLinks)).toHaveLength(2);
  expect(await test.db.select().from(publicationEvents)).toHaveLength(2);
  const [article] = await test.db.select().from(knowledgeArticles);
  const [version] = await test.db.select().from(articleVersions);
  if (!version) throw new Error("Falta versión inicial");
  expect(article).toMatchObject({
    status: "publicado",
    createdBy: actorId,
    currentVersionId: version?.id,
    createdAt: NOW,
    updatedAt: NOW,
  });
  expect(version).toMatchObject({
    number: 1,
    articleId: article?.id,
    publishedAt: NOW,
    reviewedBy: actorId,
    contentHash: createHash("sha256").update(first(pack.articles).version.contentMd).digest("hex"),
  });
  expect(
    await test.db
      .select()
      .from(articleVariantLinks)
      .where(eq(articleVariantLinks.versionId, version.id)),
  ).toMatchObject([{ versionId: version?.id }]);
  expect(
    await test.db
      .select()
      .from(publicationEvents)
      .where(eq(publicationEvents.versionId, version.id)),
  ).toMatchObject([
    {
      articleId: article?.id,
      versionId: version?.id,
      actorId,
      operation: "import",
      createdAt: NOW,
    },
  ]);
  const before = await snapshots();
  await importLibraryPack(test.db, actorId, pack, NOW, { dryRun: false });
  expect(await snapshots()).toEqual(before);
});

it("revierte también la auditoría en dryRun y revierte ante un error de escritura", async () => {
  const { pack, importLibraryPack } = await fixture();
  const actorId = await actor();
  expect(await importLibraryPack(test.db, actorId, pack, NOW, { dryRun: true })).toMatchObject({
    ok: true,
    created: { publicationEvents: 2 },
  });
  expect(Object.values(await counts()).every((value) => value === 0)).toBe(true);
  await expect(
    importLibraryPack(test.db, randomUUID(), pack, NOW, { dryRun: false }),
  ).rejects.toThrow();
  expect(Object.values(await counts()).every((value) => value === 0)).toBe(true);
});
