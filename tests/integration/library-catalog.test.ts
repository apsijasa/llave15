import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
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
  compatibilityRuleMembers,
  compatibilityRules,
  procedures,
} from "../../src/server/db/schema-library-procedures.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import {
  listFamilies,
  listManufacturers,
  listModels,
  variantSheet,
} from "../../src/server/library/catalog.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

let test: TestDb;
let actor: SessionUser;
let ids: { manufacturer: string; family: string; model: string; variant: string; sibling: string };
const now = new Date("2026-11-15T12:00:00Z");
const previous = new Date("2026-11-14T12:00:00Z");

async function seedCatalog() {
  ids = {
    manufacturer: randomUUID(),
    family: randomUUID(),
    model: randomUUID(),
    variant: randomUUID(),
    sibling: randomUUID(),
  };
  await test.db
    .insert(manufacturers)
    .values({ id: ids.manufacturer, slug: "shimano", name: "Shimano" });
  await test.db.insert(componentFamilies).values({
    id: ids.family,
    manufacturerId: ids.manufacturer,
    slug: "xt",
    name: "Deore XT",
    category: "transmision",
  });
  await test.db.insert(componentModels).values({
    id: ids.model,
    familyId: ids.family,
    code: "RD-M8100-SGS",
    name: "Cambio trasero",
    componentType: "cambio_trasero",
    speeds: 12,
  });
  await test.db.insert(componentVariants).values([
    { id: ids.variant, modelId: ids.model, code: "RD-M8100-SGS" },
    { id: ids.sibling, modelId: ids.model, code: "RD-M8100-SGS", revision: "B" },
  ]);
}

beforeEach(async () => {
  test = await createTestDb();
  const branchId = randomUUID();
  await test.db.insert(branches).values({ id: branchId, name: "Sucursal de prueba" });
  actor = {
    id: randomUUID(),
    branchId,
    email: "mecanico@ejemplo.cl",
    name: "Revisor de prueba",
    role: "mechanic",
  };
  await test.db.insert(users).values({ ...actor, passwordHash: "test-hash" });
  await seedCatalog();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await test.close();
});

async function sheet() {
  const result = await variantSheet(test.db, actor, ids.variant);
  if (!result.ok) throw new Error(result.code);
  return result.sheet;
}

async function linkedVersion(
  articleId: string,
  number: number,
  publishedAt: Date | null,
  reviewedBy: string | null,
) {
  const id = randomUUID();
  await test.db.insert(articleVersions).values({
    id,
    articleId,
    number,
    contentMd: "Ajustar cable",
    contentHash: "hash",
    publishedAt,
    reviewedBy,
  });
  await test.db.insert(articleVariantLinks).values({ versionId: id, variantId: ids.variant });
  await test.db
    .insert(procedures)
    .values({ versionId: id, title: `Ajuste ${number}`, kind: "ajuste", risk: "bajo" });
  return id;
}

async function seedVersions() {
  const articleId = randomUUID();
  const draftId = randomUUID();
  await test.db.insert(knowledgeArticles).values([
    {
      id: articleId,
      slug: "ajuste",
      title: "Ajuste del cambio",
      category: "transmision",
      kind: "procedimiento",
      status: "publicado",
    },
    {
      id: draftId,
      slug: "borrador",
      title: "Borrador",
      category: "transmision",
      kind: "procedimiento",
    },
  ]);
  const old = await linkedVersion(articleId, 1, previous, actor.id);
  const current = await linkedVersion(articleId, 2, now, null);
  await linkedVersion(articleId, 3, null, null);
  const draft = await linkedVersion(draftId, 1, null, null);
  await test.db
    .update(knowledgeArticles)
    .set({ currentVersionId: current })
    .where(eq(knowledgeArticles.id, articleId));
  await test.db
    .update(knowledgeArticles)
    .set({ currentVersionId: draft })
    .where(eq(knowledgeArticles.id, draftId));
  return { articleId, old, current };
}

it("lista fabricantes activos por nombre y familias con fabricante y categoría", async () => {
  await test.db.insert(manufacturers).values([
    { slug: "a", name: "A fabricante" },
    { slug: "inactivo", name: "Inactivo", status: "inactivo" },
  ]);
  await test.db.insert(componentFamilies).values({
    manufacturerId: ids.manufacturer,
    slug: "freno",
    name: "A frenos",
    category: "frenos",
  });
  expect((await listManufacturers(test.db)).map((row) => row.name)).toEqual([
    "A fabricante",
    "Shimano",
  ]);
  expect((await listFamilies(test.db)).map((row) => row.name)).toEqual(["A frenos", "Deore XT"]);
  expect(await listFamilies(test.db, "transmision")).toEqual([
    expect.objectContaining({ id: ids.family, manufacturerName: "Shimano" }),
  ]);
});

it("lista solo los modelos de la familia solicitada por código", async () => {
  await test.db.insert(componentModels).values({
    familyId: ids.family,
    code: "CS-M8100-12",
    name: "Cassette",
    componentType: "cassette",
  });
  expect((await listModels(test.db, ids.family)).map((row) => row.code)).toEqual([
    "CS-M8100-12",
    "RD-M8100-SGS",
  ]);
  expect(await listModels(test.db, randomUUID())).toEqual([]);
  expect(await listModels(test.db, "inválido")).toEqual([]);
});

it("devuelve la jerarquía y otras revisiones sin incluir la variante misma", async () => {
  const result = await sheet();
  expect(result.manufacturer.id).toBe(ids.manufacturer);
  expect(result.family.id).toBe(ids.family);
  expect(result.model.id).toBe(ids.model);
  expect(result.variant.id).toBe(ids.variant);
  expect(result.siblings.map((row) => row.id)).toEqual([ids.sibling]);
  expect(result.specifications).toEqual([]);
  expect(result.documents).toEqual([]);
  expect(result.procedures).toEqual([]);
  expect(result.compatibility).toEqual([]);
  expect(result.versions).toEqual([]);
});

async function seedSpecifications() {
  const documentId = randomUUID();
  await test.db.insert(technicalDocuments).values([
    {
      id: documentId,
      title: "Manual oficial",
      canonicalUrl: "https://ejemplo.cl/manual",
      docType: "manual",
      variantId: ids.variant,
    },
    {
      title: "Otra revisión",
      canonicalUrl: "https://ejemplo.cl/otro",
      docType: "manual",
      variantId: ids.sibling,
    },
  ]);
  await test.db.insert(technicalSpecifications).values([
    {
      variantId: ids.variant,
      kind: "torque",
      label: "Sin fuente",
      valueText: "",
      validationStatus: "sin_dato_verificado",
    },
    {
      variantId: ids.variant,
      kind: "medida",
      label: "Con fuente",
      valueText: "Consultar manual",
      sourceDocumentId: documentId,
      validationStatus: "verificado",
      reviewedOn: "2026-11-15",
    },
    { variantId: ids.sibling, kind: "otro", label: "Ajena", valueText: "" },
  ]);
  return documentId;
}

it("incluye estado, fecha de revisión y fuente nullable de las especificaciones", async () => {
  const documentId = await seedSpecifications();
  const result = await sheet();
  expect(result.specifications).toHaveLength(2);
  expect(result.specifications).toContainEqual(
    expect.objectContaining({
      label: "Sin fuente",
      sourceDocument: null,
      validationStatus: "sin_dato_verificado",
      reviewedOn: null,
    }),
  );
  expect(result.specifications).toContainEqual(
    expect.objectContaining({
      label: "Con fuente",
      validationStatus: "verificado",
      reviewedOn: "2026-11-15",
      sourceDocument: {
        id: documentId,
        title: "Manual oficial",
        canonicalUrl: "https://ejemplo.cl/manual",
      },
    }),
  );
  expect(result.documents.map((row) => row.id)).toEqual([documentId]);
});

it("incluye procedimientos solo de la versión vigente publicada", async () => {
  await seedVersions();
  expect((await sheet()).procedures).toEqual([
    expect.objectContaining({
      title: "Ajuste 2",
      articleTitle: "Ajuste del cambio",
      kind: "ajuste",
      risk: "bajo",
      versionNumber: 2,
    }),
  ]);
  const unpublishedArticle = randomUUID();
  await test.db.insert(knowledgeArticles).values({
    id: unpublishedArticle,
    slug: "sin-publicar",
    title: "Sin publicar",
    category: "transmision",
    kind: "procedimiento",
    status: "publicado",
  });
  const version = await linkedVersion(unpublishedArticle, 1, null, null);
  await test.db
    .update(knowledgeArticles)
    .set({ currentVersionId: version })
    .where(eq(knowledgeArticles.id, unpublishedArticle));
  expect((await sheet()).procedures).toHaveLength(1);
});

it("muestra todas las versiones publicadas ligadas, ordenadas por fecha y con revisor nullable", async () => {
  const { articleId } = await seedVersions();
  expect((await sheet()).versions).toEqual([
    {
      articleId,
      slug: "ajuste",
      title: "Ajuste del cambio",
      kind: "procedimiento",
      number: 2,
      publishedAt: now,
      reviewedByName: null,
    },
    {
      articleId,
      slug: "ajuste",
      title: "Ajuste del cambio",
      kind: "procedimiento",
      number: 1,
      publishedAt: previous,
      reviewedByName: actor.name,
    },
  ]);
});

it("incluye todos los miembros de reglas vigentes y omite reglas archivadas o ajenas", async () => {
  const active = randomUUID();
  const archived = randomUUID();
  const unrelated = randomUUID();
  await test.db.insert(compatibilityRules).values(
    [active, archived, unrelated].map((id) => ({
      id,
      relation: "condicionada",
      certainty: "media",
      evidence: "Consultar documentación",
      conditions: "Misma generación",
      restrictions: "No mezclar",
      status: id === archived ? "archivada" : "vigente",
    })),
  );
  await test.db.insert(compatibilityRuleMembers).values([
    { ruleId: active, variantId: ids.variant, role: "cambio" },
    { ruleId: active, variantId: ids.sibling, role: "otro" },
    { ruleId: archived, variantId: ids.variant, role: "cambio" },
    { ruleId: unrelated, variantId: ids.sibling, role: "cambio" },
  ]);
  const result = await sheet();
  expect(result.compatibility).toHaveLength(1);
  expect(result.compatibility[0]).toMatchObject({
    ruleId: active,
    relation: "condicionada",
    certainty: "media",
    evidence: "Consultar documentación",
    conditions: "Misma generación",
    restrictions: "No mezclar",
  });
  expect(result.compatibility[0]?.members).toEqual(
    expect.arrayContaining([
      { variantId: ids.variant, role: "cambio", code: "RD-M8100-SGS" },
      { variantId: ids.sibling, role: "otro", code: "RD-M8100-SGS" },
    ]),
  );
  expect(result.compatibility[0]?.members).toHaveLength(2);
});

it("devuelve not_found para un id inexistente o inválido", async () => {
  expect(await variantSheet(test.db, actor, randomUUID())).toEqual({
    ok: false,
    code: "not_found",
  });
  const select = vi.spyOn(test.db, "select");
  expect(await variantSheet(test.db, actor, "inválido")).toEqual({ ok: false, code: "not_found" });
  expect(select).not.toHaveBeenCalled();
});

it("rechaza actores sin permiso antes de validar o consultar", async () => {
  const select = vi.spyOn(test.db, "select");
  const execute = vi.spyOn(test.db, "execute");
  expect(await variantSheet(test.db, { ...actor, role: "guest" as Role }, "inválido")).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(select).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});
