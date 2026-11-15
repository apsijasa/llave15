import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import {
  articleVersions,
  documentChunks,
  knowledgeArticles,
} from "../../src/server/db/schema-library-knowledge.ts";
import {
  knowledgeProposals,
  publicationEvents,
} from "../../src/server/db/schema-library-private.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { chunkText } from "../../src/server/library/chunks.ts";
import { createProposal, submitProposal } from "../../src/server/library/proposals.ts";
import { archiveArticle, publishProposal } from "../../src/server/library/publish.ts";
import { reviewProposal } from "../../src/server/library/review.ts";
import { searchLibrary } from "../../src/server/library/search.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-15T15:00:00.000Z");
const LATER = new Date("2026-11-16T15:00:00.000Z");
let test: TestDb;
let curator: SessionUser;
let mechanic: SessionUser;

async function actor(branchId: string, role: Role, libraryCurator = false): Promise<SessionUser> {
  const [row] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      libraryCurator,
      name: `Usuario ${role}`,
      email: `${randomUUID()}@ejemplo.cl`,
      passwordHash: "hash-de-prueba",
    })
    .returning();
  if (!row) throw new Error("Falta el usuario");
  return { id: row.id, branchId, role, libraryCurator, name: row.name, email: row.email };
}

async function approved(input: Record<string, unknown>): Promise<string> {
  const created = await createProposal(
    test.db,
    mechanic,
    { kind: "diagnostico", evidence: "Experiencia del taller", ...input },
    NOW,
  );
  if (!created.ok) throw new Error(created.code);
  await submitProposal(test.db, mechanic, created.id, NOW);
  await reviewProposal(test.db, curator, created.id, { decision: "in_review" }, NOW);
  const decision = await reviewProposal(
    test.db,
    curator,
    created.id,
    { decision: "approved" },
    NOW,
  );
  if (!decision.ok) throw new Error(decision.code);
  return created.id;
}

const FIRST = {
  title: "La cadena salta bajo carga",
  contentMd: "## Revisión\n\nMedir desgaste de cadena y revisar el cassette antes de ajustar.",
};

beforeEach(async () => {
  test = await createTestDb();
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta la sucursal");
  curator = await actor(branch.id, "owner", true);
  mechanic = await actor(branch.id, "mechanic");
  return () => test.close();
});

it("publicar una propuesta nueva crea artículo, versión 1, evento y trozos", async () => {
  const id = await approved(FIRST);
  const result = await publishProposal(test.db, curator, id, { category: "transmision" }, NOW);
  expect(result).toMatchObject({ ok: true, versionNumber: 1 });
  if (!result.ok) return;
  const [article] = await test.db.select().from(knowledgeArticles);
  expect(article).toMatchObject({
    slug: "la-cadena-salta-bajo-carga",
    status: "publicado",
    currentVersionId: result.versionId,
    kind: "diagnostico",
  });
  expect(await test.db.select().from(publicationEvents)).toMatchObject([{ operation: "publish" }]);
  const chunks = await test.db.select().from(documentChunks);
  expect(chunks.length).toBeGreaterThan(0);
  const [proposal] = await test.db.select().from(knowledgeProposals);
  expect(proposal).toMatchObject({ status: "published", publishedVersionId: result.versionId });
  const found = await searchLibrary(test.db, mechanic, { q: "cadena salta" });
  expect(found.ok && found.articles.map((hit) => hit.title)).toEqual([FIRST.title]);
});

it("una corrección crea la versión 2 y deja la 1 idéntica", async () => {
  const firstId = await approved(FIRST);
  const first = await publishProposal(test.db, curator, firstId, { category: "transmision" }, NOW);
  if (!first.ok) throw new Error(first.code);
  const [before] = await test.db
    .select()
    .from(articleVersions)
    .where(eq(articleVersions.id, first.versionId));
  const correctionId = await approved({
    kind: "correccion",
    title: "Corrección del diagnóstico de cadena",
    contentMd:
      "## Revisión\n\nMedir desgaste, revisar cassette y platos, y luego ajustar el cambio.",
    targetArticleId: first.articleId,
  });
  const second = await publishProposal(test.db, curator, correctionId, {}, LATER);
  expect(second).toMatchObject({ ok: true, versionNumber: 2, articleId: first.articleId });
  if (!second.ok) return;
  const [after] = await test.db
    .select()
    .from(articleVersions)
    .where(eq(articleVersions.id, first.versionId));
  expect(after).toEqual(before);
  const [article] = await test.db.select().from(knowledgeArticles);
  expect(article?.currentVersionId).toBe(second.versionId);
  const chunks = await test.db.select().from(documentChunks);
  expect(chunks.every((chunk) => chunk.sourceId === second.versionId)).toBe(true);
  const [version2] = await test.db
    .select()
    .from(articleVersions)
    .where(eq(articleVersions.id, second.versionId));
  expect(version2?.supersedesVersionId).toBe(first.versionId);
});

it("si falla el índice la propuesta sigue aprobada y no hay versión", async () => {
  const id = await approved(FIRST);
  const failing = async () => {
    throw new Error("índice caído");
  };
  expect(
    await publishProposal(test.db, curator, id, { category: "transmision" }, NOW, failing),
  ).toEqual({ ok: false, code: "index_failed" });
  expect(await test.db.select().from(articleVersions)).toHaveLength(0);
  expect(await test.db.select().from(knowledgeArticles)).toHaveLength(0);
  const [proposal] = await test.db.select().from(knowledgeProposals);
  expect(proposal?.status).toBe("approved");
});

it("valida permisos, estado, categoría y slug", async () => {
  const id = await approved(FIRST);
  expect(await publishProposal(test.db, mechanic, id, { category: "frenos" }, NOW)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(await publishProposal(test.db, curator, id, {}, NOW)).toEqual({
    ok: false,
    code: "validation_error",
  });
  await publishProposal(test.db, curator, id, { category: "transmision" }, NOW);
  expect(await publishProposal(test.db, curator, id, { category: "frenos" }, NOW)).toEqual({
    ok: false,
    code: "invalid_transition",
  });
  const again = await approved(FIRST);
  expect(await publishProposal(test.db, curator, again, { category: "transmision" }, NOW)).toEqual({
    ok: false,
    code: "slug_taken",
  });
});

it("archivar saca el artículo de la búsqueda y del índice", async () => {
  const id = await approved(FIRST);
  const published = await publishProposal(test.db, curator, id, { category: "transmision" }, NOW);
  if (!published.ok) throw new Error(published.code);
  expect(await archiveArticle(test.db, curator, published.articleId, "Obsoleto", LATER)).toEqual({
    ok: true,
  });
  expect(await test.db.select().from(documentChunks)).toHaveLength(0);
  const found = await searchLibrary(test.db, mechanic, { q: "cadena salta" });
  expect(found.ok && found.articles).toEqual([]);
  expect(await archiveArticle(test.db, curator, published.articleId, "", LATER)).toEqual({
    ok: false,
    code: "already_archived",
  });
  const events = await test.db.select().from(publicationEvents);
  expect(events.map((event) => event.operation).sort()).toEqual(["archive", "publish"]);
});

it("chunkText corta por encabezados y respeta el máximo", () => {
  const long = `# Uno\n\n${"palabra ".repeat(300)}\n\n## Dos\n\nTexto corto.`;
  const chunks = chunkText(long, 500);
  expect(chunks.every((chunk) => chunk.text.length <= 500)).toBe(true);
  expect(chunks.at(-1)).toMatchObject({ section: "Dos" });
  expect(chunks[0]?.section).toBe("Uno");
});
