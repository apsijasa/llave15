import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import * as permissions from "../../src/server/auth/permissions.ts";
import {
  componentFamilies,
  componentModels,
  componentVariants,
  manufacturers,
  technicalDocuments,
  technicalSpecifications,
} from "../../src/server/db/schema-library-catalog.ts";
import {
  articleVariantLinks,
  articleVersions,
  knowledgeArticles,
} from "../../src/server/db/schema-library-knowledge.ts";
import {
  procedures,
  procedureSteps,
  procedureSpecs,
} from "../../src/server/db/schema-library-procedures.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { importLibraryPack, libraryPackSchema } from "../../src/server/library/content-pack.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-15T12:00:00Z");
let test: TestDb;
let actor: SessionUser;
const api = () => import("../../src/server/library/procedures.ts");

beforeEach(async () => {
  test = await createTestDb();
  const [branch] = await test.db.insert(branches).values({ name: "Sucursal" }).returning();
  if (!branch) throw new Error("Falta sucursal");
  const [user] = await test.db
    .insert(users)
    .values({
      branchId: branch.id,
      name: "Revisor",
      email: "revisor@ejemplo.cl",
      role: "mechanic",
      passwordHash: "prueba",
    })
    .returning();
  if (!user) throw new Error("Falta usuario");
  actor = { ...user, role: "mechanic" };
  return async () => {
    vi.restoreAllMocks();
    await test.close();
  };
});

async function seedCatalog() {
  const manufacturerId = randomUUID(),
    familyId = randomUUID();
  const modelId = randomUUID(),
    variantId = randomUUID();
  await test.db
    .insert(manufacturers)
    .values({ id: manufacturerId, slug: "fabricante", name: "Fabricante" });
  await test.db.insert(componentFamilies).values({
    id: familyId,
    manufacturerId,
    slug: "serie",
    name: "Serie",
    category: "transmision",
  });
  await test.db.insert(componentModels).values({
    id: modelId,
    familyId,
    code: "CADENA",
    name: "Cadena de prueba",
    componentType: "cadena",
  });
  await test.db
    .insert(componentVariants)
    .values({ id: variantId, modelId, code: "CADENA", revision: "B" });
  return variantId;
}

async function seedProcedure() {
  const articleId = randomUUID(),
    versionId = randomUUID(),
    id = randomUUID();
  await test.db.insert(knowledgeArticles).values({
    id: articleId,
    slug: "revision",
    title: "Artículo de revisión",
    kind: "procedimiento",
    category: "transmision",
    status: "publicado",
  });
  await test.db.insert(articleVersions).values({
    id: versionId,
    articleId,
    number: 1,
    contentMd: "Revisar",
    contentHash: "hash",
    publishedAt: NOW,
    reviewedBy: actor.id,
  });
  await test.db
    .update(knowledgeArticles)
    .set({ currentVersionId: versionId })
    .where(eq(knowledgeArticles.id, articleId));
  await test.db.insert(procedures).values({
    id,
    versionId,
    title: "Revisión",
    kind: "mantenimiento",
    risk: "bajo",
    durationMinutes: 10,
    prerequisites: "Cadena limpia",
    finalChecks: "Registrar la lectura",
  });
  await test.db.insert(procedureSteps).values([
    {
      procedureId: id,
      sequence: 2,
      action: "Medir",
      tools: "Indicador",
      verification: "Consultar manual",
      warning: "Revisar bajo carga",
    },
    { procedureId: id, sequence: 1, action: "Limpiar", consumables: "Paño" },
  ]);
  return { id, articleId, versionId };
}

async function seedSpec(procedureId: string, variantId: string) {
  const documentId = randomUUID(),
    specificationId = randomUUID();
  await test.db.insert(technicalDocuments).values({
    id: documentId,
    title: "Manual de prueba",
    canonicalUrl: "https://ejemplo.cl/manual",
    docType: "manual",
  });
  await test.db.insert(technicalSpecifications).values({
    id: specificationId,
    variantId,
    kind: "torque",
    label: "Fijación de prueba",
    valueText: "Dato de prueba",
    unit: "Nm",
    validationStatus: "verificado",
    sourceDocumentId: documentId,
  });
  await test.db.insert(procedureSpecs).values({ procedureId, specificationId });
  return documentId;
}

function expectedSpec(documentId: string) {
  return {
    label: "Fijación de prueba",
    valueText: "Dato de prueba",
    unit: "Nm",
    validationStatus: "verificado",
    sourceDocument: {
      id: documentId,
      title: "Manual de prueba",
      canonicalUrl: "https://ejemplo.cl/manual",
    },
  };
}

it("devuelve requisitos, controles, pasos ordenados, alcance y especificaciones con fuente", async () => {
  const { id, versionId, articleId } = await seedProcedure();
  const variantId = await seedCatalog();
  await test.db.insert(articleVariantLinks).values({ versionId, variantId });
  const documentId = await seedSpec(id, variantId);
  const { procedureDetail } = await api();
  const result = await procedureDetail(test.db, actor, id);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.code);
  expect(result.detail).toMatchObject({
    procedure: {
      id,
      risk: "bajo",
      durationMinutes: 10,
      prerequisites: "Cadena limpia",
      finalChecks: "Registrar la lectura",
    },
    article: {
      id: articleId,
      slug: "revision",
      title: "Artículo de revisión",
      category: "transmision",
    },
    version: {
      id: versionId,
      number: 1,
      publishedAt: NOW,
      reviewedByName: actor.name,
      sources: [],
    },
    variants: [{ id: variantId, code: "CADENA", revision: "B", modelName: "Cadena de prueba" }],
    steps: [
      { sequence: 1, action: "Limpiar", consumables: "Paño" },
      {
        sequence: 2,
        action: "Medir",
        tools: "Indicador",
        verification: "Consultar manual",
        warning: "Revisar bajo carga",
      },
    ],
    specs: [expectedSpec(documentId)],
  });
});

it("oculta una versión que dejó de ser la vigente", async () => {
  const { id, articleId } = await seedProcedure();
  const [version] = await test.db
    .insert(articleVersions)
    .values({
      articleId,
      number: 2,
      contentMd: "Nueva revisión",
      contentHash: "nuevo",
      publishedAt: NOW,
    })
    .returning();
  if (!version) throw new Error("Falta versión");
  await test.db
    .update(knowledgeArticles)
    .set({ currentVersionId: version.id })
    .where(eq(knowledgeArticles.id, articleId));
  expect(await (await api()).procedureDetail(test.db, actor, id)).toEqual({
    ok: false,
    code: "not_found",
  });
});

it.each(["archivado", "borrador"])("oculta un artículo %s", async (status) => {
  const { id, articleId } = await seedProcedure();
  await test.db
    .update(knowledgeArticles)
    .set({ status })
    .where(eq(knowledgeArticles.id, articleId));
  expect(await (await api()).procedureDetail(test.db, actor, id)).toEqual({
    ok: false,
    code: "not_found",
  });
});

it("oculta una versión sin publicar", async () => {
  const { id, versionId } = await seedProcedure();
  await test.db
    .update(articleVersions)
    .set({ publishedAt: null })
    .where(eq(articleVersions.id, versionId));
  expect(await (await api()).procedureDetail(test.db, actor, id)).toEqual({
    ok: false,
    code: "not_found",
  });
});

it.each(["no-uuid", randomUUID()])("responde not_found para %s", async (id) => {
  expect(await (await api()).procedureDetail(test.db, actor, id)).toEqual({
    ok: false,
    code: "not_found",
  });
});

it("revisa permiso antes de validar el id", async () => {
  vi.spyOn(permissions, "can").mockReturnValue(false);
  expect(await (await api()).procedureDetail(test.db, actor, "invalido")).toEqual({
    ok: false,
    code: "forbidden",
  });
});

function packFixture() {
  return libraryPackSchema.parse(JSON.parse(readFileSync("src/data/library/pack.json", "utf8")));
}

it("importa el procedimiento real con cuatro pasos sin duplicar ni modificar al repetir", async () => {
  const pack = packFixture();
  expect(await importLibraryPack(test.db, actor.id, pack, NOW, { dryRun: false })).toMatchObject({
    ok: true,
  });
  const rows = await test.db.select().from(procedures);
  expect(rows).toHaveLength(1);
  const procedure = rows[0];
  if (!procedure) throw new Error("Falta procedimiento");
  const result = await (await api()).procedureDetail(test.db, actor, procedure.id);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.code);
  expect(result.detail.article.slug).toBe("cadena-12v-revision-desgaste");
  expect(result.detail.variants[0]?.code).toBe("CN-M8100");
  expect(result.detail.steps).toHaveLength(4);
  expect(result.detail.steps[2]?.verification).toBe(
    "Usar el límite del manual del fabricante; no usar un valor genérico",
  );
  expect(result.detail.steps[3]?.warning).toBe(
    "Una cadena muy gastada puede saltar bajo carga en el cassette nuevo",
  );
  expect(result.detail.specs).toEqual([]);
  const before = await test.db.select().from(procedureSteps);
  const article = pack.articles.find((row) => row.procedure);
  if (!article?.procedure) throw new Error("Falta procedimiento del paquete");
  article.procedure.title = "Título cambiado";
  expect(await importLibraryPack(test.db, actor.id, pack, NOW, { dryRun: false })).toMatchObject({
    ok: true,
  });
  expect(await test.db.select().from(procedures)).toEqual(rows);
  expect(await test.db.select().from(procedureSteps)).toEqual(before);
});

it("resuelve referencias de especificación e importa pasos y torques en la misma transacción", async () => {
  const pack = packFixture();
  const article = pack.articles.find((row) => row.procedure);
  const spec = pack.specifications[0];
  if (!article?.procedure || !spec) throw new Error("Falta contenido");
  article.procedure.specs = [{ variant: spec.variant, kind: spec.kind, label: spec.label }];
  await importLibraryPack(test.db, actor.id, pack, NOW, { dryRun: true });
  expect(await test.db.select().from(procedures)).toEqual([]);
  expect(await test.db.select().from(procedureSteps)).toEqual([]);
  expect(await test.db.select().from(procedureSpecs)).toEqual([]);
  await importLibraryPack(test.db, actor.id, pack, NOW, { dryRun: false });
  const before = await test.db.select().from(procedureSpecs);
  expect(before).toHaveLength(1);
  await importLibraryPack(test.db, actor.id, pack, NOW, { dryRun: false });
  expect(await test.db.select().from(procedureSpecs)).toEqual(before);
});

it.each(["reference", "sequence", "risk", "duration"])(
  "valida el procedimiento antes de importar: %s",
  async (kind) => {
    const raw = JSON.parse(readFileSync("src/data/library/pack.json", "utf8"));
    const procedure = raw.articles.find((row: { procedure?: unknown }) => row.procedure)?.procedure;
    expect(procedure).toBeDefined();
    if (kind === "reference")
      procedure.specs = [{ variant: "ausente", kind: "torque", label: "Dato" }];
    if (kind === "sequence") procedure.steps[1].sequence = procedure.steps[0].sequence;
    if (kind === "risk") procedure.risk = "desconocido";
    if (kind === "duration") procedure.durationMinutes = 0;
    expect(libraryPackSchema.safeParse(raw).success).toBe(false);
  },
);
