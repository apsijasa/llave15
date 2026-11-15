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
} from "../../src/server/db/schema-library-catalog.ts";
import {
  articleVersions,
  knowledgeArticles,
} from "../../src/server/db/schema-library-knowledge.ts";
import { knowledgeProposals } from "../../src/server/db/schema-library-private.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { searchLibrary } from "../../src/server/library/search.ts";
import type { LibrarySearch } from "../../src/server/library/search.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

let test: TestDb;
let actor: SessionUser;
let manufacturerId: string;
let familyId: string;
let modelId: string;
let variantIds: string[];
const now = new Date("2026-11-15T12:00:00Z");

async function seedCatalog() {
  manufacturerId = randomUUID();
  familyId = randomUUID();
  modelId = randomUUID();
  variantIds = [randomUUID(), randomUUID()];
  await test.db
    .insert(manufacturers)
    .values({ id: manufacturerId, slug: "shimano", name: "Shimano" });
  await test.db.insert(componentFamilies).values({
    id: familyId,
    manufacturerId,
    slug: "xt",
    name: "Deore XT",
    category: "transmision",
  });
  await test.db.insert(componentModels).values({
    id: modelId,
    familyId,
    code: "RD-M8100-SGS",
    name: "Cambio trasero de 12 velocidades",
    componentType: "cambio_trasero",
    speeds: 12,
  });
  await test.db.insert(componentVariants).values([
    { id: variantIds[1], modelId, code: "RD-M8100-SGS", revision: "B" },
    { id: variantIds[0], modelId, code: "RD-M8100-SGS" },
  ]);
  const cassetteId = randomUUID();
  await test.db.insert(componentModels).values({
    id: cassetteId,
    familyId,
    code: "CS-M8100-12",
    name: "Cassette de 12 velocidades",
    componentType: "cassette",
    status: "descontinuado",
  });
  await test.db.insert(componentVariants).values({ modelId: cassetteId, code: "CS-M8100-12" });
}

beforeEach(async () => {
  test = await createTestDb();
  const branchId = randomUUID();
  const otherBranchId = randomUUID();
  await test.db.insert(branches).values([
    { id: branchId, name: "Sucursal A" },
    { id: otherBranchId, name: "Sucursal B" },
  ]);
  actor = {
    id: randomUUID(),
    branchId,
    email: "mecanico@ejemplo.cl",
    name: "Mecánico",
    role: "mechanic",
  };
  await test.db
    .insert(users)
    .values({ ...actor, branchId: otherBranchId, passwordHash: "test-hash" });
  await test.db.insert(knowledgeProposals).values({
    branchId: otherBranchId,
    authorId: actor.id,
    kind: "diagnostico",
    status: "submitted",
    title: "El cambio trasero salta bajo carga",
    contentMd: "Propuesta privada de cambio trasero que salta",
    submittedAt: now,
  });
  await seedCatalog();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await test.close();
});

async function article(
  title: string,
  contentMd: string,
  status = "publicado",
  category = "transmision",
) {
  const articleId = randomUUID();
  const versionId = randomUUID();
  await test.db.insert(knowledgeArticles).values({
    id: articleId,
    slug: articleId,
    title,
    category,
    kind: "diagnostico",
    status,
  });
  await test.db.insert(articleVersions).values({
    id: versionId,
    articleId,
    number: 1,
    contentMd,
    summary: "Diagnóstico",
    contentHash: "test-hash",
    publishedAt: now,
  });
  await test.db
    .update(knowledgeArticles)
    .set({ currentVersionId: versionId })
    .where(eq(knowledgeArticles.id, articleId));
  return { articleId, versionId };
}

async function search(input: LibrarySearch) {
  const result = await searchLibrary(test.db, actor, input);
  if (!result.ok) throw new Error(result.code);
  return result;
}

it("prioriza las dos revisiones exactas sin repetirlas en modelos", async () => {
  const result = await search({ q: "rd-m8100-sgs" });
  expect(result.exact.map((hit) => hit.variantId)).toEqual(variantIds);
  expect(result.exact.map((hit) => hit.revision)).toEqual(["", "B"]);
  expect(result.exact[0]).toMatchObject({
    modelId,
    code: "RD-M8100-SGS",
    variantCode: "RD-M8100-SGS",
    speeds: 12,
    manufacturerName: "Shimano",
    familyName: "Deore XT",
    category: "transmision",
    status: "vigente",
  });
  expect(result.models).toEqual([]);
  await test.db
    .update(componentVariants)
    .set({ code: "RD-M8100-ALT" })
    .where(eq(componentVariants.id, variantIds[1] as string));
  expect((await search({ q: "RD-M8100-SGS" })).exact).toHaveLength(2);
  expect((await search({ q: "rd-m8100-alt" })).exact.map((hit) => hit.variantId)).toEqual([
    variantIds[1],
  ]);
});

it("busca artículos con raíces españolas, rank y sin propuestas privadas", async () => {
  const current = await article(
    "El cambio trasero salta bajo carga",
    "Revisar cambios traseros que saltan bajo carga",
  );
  await article("Diagnóstico general", "Los cambios traseros saltan y requieren inspección");
  const result = await search({ q: "cambio trasero salta" });
  expect(result.articles[0]).toMatchObject({ ...current, versionNumber: 1, publishedAt: now });
  expect(result.articles).toHaveLength(2);
  expect(result.articles.every((hit) => hit.rank > 0)).toBe(true);
  expect(result.articles[0]?.rank).toBeGreaterThanOrEqual(result.articles[1]?.rank ?? 0);
  expect(result.exact).toEqual([]);
  expect(JSON.stringify(result)).not.toContain("Propuesta privada");
  expect((await search({ q: "cambio trasero salta", category: "frenos" })).articles).toEqual([]);
});

it("consulta solo la versión vigente de artículos publicados y permite coincidencia por título", async () => {
  await article("Cambio trasero salta borrador", "cambio trasero salta", "borrador");
  await article("Cambio trasero salta archivado", "cambio trasero salta", "archivado");
  const current = await article("Ajuste", "contenido nuevo");
  await test.db.insert(articleVersions).values({
    articleId: current.articleId,
    number: 2,
    contentMd: "cambio trasero salta",
    contentHash: "old",
  });
  expect((await search({ q: "cambio trasero salta" })).articles).toEqual([]);
  const title = await article("Identificación AB%_\\12", "sin términos");
  expect((await search({ q: "AB%_\\12" })).articles.map((hit) => hit.articleId)).toEqual([
    title.articleId,
  ]);
});

it("filtra modelos por categoría, fabricante y estado y ordena por código", async () => {
  expect((await search({ q: "M8100" })).models.map((hit) => hit.code)).toEqual([
    "CS-M8100-12",
    "RD-M8100-SGS",
    "RD-M8100-SGS",
  ]);
  expect((await search({ q: "M8100", category: "frenos" })).models).toEqual([]);
  expect((await search({ q: "M8100", manufacturerId: randomUUID() })).models).toEqual([]);
  const result = await search({ q: "M8100", manufacturerId, status: "descontinuado" });
  expect(result.models.map((hit) => hit.code)).toEqual(["CS-M8100-12"]);
  expect((await search({ q: "trasero" })).models).toHaveLength(2);
});

it("escapa comodines y barra inversa en ILIKE", async () => {
  await test.db
    .update(componentModels)
    .set({ name: "Ajuste 50%_\\ especial" })
    .where(eq(componentModels.id, modelId));
  expect((await search({ q: "%_\\" })).models).toHaveLength(2);
  expect((await search({ q: "50XYZ" })).models).toEqual([]);
  expect((await search({ q: "%' OR true --" })).models).toEqual([]);
});

it("omite documentos retirados, conserva fabricante nullable y filtra por fabricante", async () => {
  const docs = ["vigente", "desactualizado", "retirado"].map((status) => ({
    title: "Manual de cambio",
    canonicalUrl: `https://ejemplo.cl/${status}`,
    docType: "manual",
    manufacturerId,
    status,
  }));
  await test.db.insert(technicalDocuments).values([
    ...docs,
    {
      title: "Manual sin fabricante",
      canonicalUrl: "https://ejemplo.cl/global",
      docType: "guia",
    },
  ]);
  const found = await search({ q: "Manual" });
  expect(found.documents).toHaveLength(3);
  expect(found.documents).toContainEqual(
    expect.objectContaining({
      manufacturerName: null,
      docType: "guia",
      license: "enlace",
      language: "es",
      revision: "",
    }),
  );
  expect((await search({ q: "Manual", manufacturerId })).documents).toHaveLength(2);
  expect((await search({ q: "Manual", manufacturerId: randomUUID() })).documents).toEqual([]);
});

it("limita cada lista parcial a veinte resultados", async () => {
  await test.db
    .insert(componentVariants)
    .values(Array.from({ length: 25 }, (_, i) => ({ modelId, code: `XX-${100 + i}` })));
  await test.db.insert(technicalDocuments).values(
    Array.from({ length: 25 }, (_, i) => ({
      title: `Coincidencia ${i}`,
      docType: "manual",
      canonicalUrl: `https://ejemplo.cl/${i}`,
    })),
  );
  for (let i = 0; i < 21; i++) await article(`Coincidencia ${i}`, "Coincidencia");
  expect((await search({ q: "XX-" })).models).toHaveLength(20);
  const result = await search({ q: "Coincidencia" });
  expect(result.articles).toHaveLength(20);
  expect(result.documents).toHaveLength(20);
});

it("rechaza el rol desconocido y entradas inválidas sin consultar", async () => {
  const select = vi.spyOn(test.db, "select");
  const execute = vi.spyOn(test.db, "execute");
  expect(
    await searchLibrary(test.db, { ...actor, role: "guest" as Role }, { q: "cambio" }),
  ).toEqual({ ok: false, code: "forbidden" });
  expect(await search({ q: " " })).toEqual({
    ok: true,
    exact: [],
    models: [],
    articles: [],
    documents: [],
  });
  expect(select).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});
