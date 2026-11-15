import { and, asc, desc, eq, ne, notInArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import type { AppDb } from "../db/client.ts";
import {
  componentFamilies,
  componentModels,
  componentVariants,
  manufacturers,
  technicalDocuments,
} from "../db/schema-library-catalog.ts";
import { articleVersions, knowledgeArticles } from "../db/schema-library-knowledge.ts";
import { canUseLibrary } from "./access.ts";
import { LIBRARY_CATEGORIES } from "./rules.ts";

export const librarySearchSchema = z.object({
  q: z.string().trim().min(1).max(120),
  category: z.enum(LIBRARY_CATEGORIES).optional(),
  manufacturerId: z.uuid().optional(),
  status: z.enum(["vigente", "descontinuado", "en_revision"]).optional(),
});
export type LibrarySearch = z.infer<typeof librarySearchSchema>;

export type ModelHit = {
  variantId: string;
  modelId: string;
  code: string;
  variantCode: string;
  revision: string;
  name: string;
  componentType: string;
  manufacturerName: string;
  familyName: string;
  category: string;
  status: string;
  speeds: number | null;
};
export type ArticleHit = {
  articleId: string;
  versionId: string;
  slug: string;
  title: string;
  category: string;
  kind: string;
  summary: string;
  versionNumber: number;
  publishedAt: Date | null;
  rank: number;
};
export type DocumentHit = {
  id: string;
  title: string;
  manufacturerName: string | null;
  docType: string;
  language: string;
  revision: string;
  license: string;
  status: string;
};
export type LibrarySearchResult = {
  exact: ModelHit[];
  models: ModelHit[];
  articles: ArticleHit[];
  documents: DocumentHit[];
};

const exactCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,3}-[A-Z0-9]{2,}(?:-[A-Z0-9]+){0,3}$/);

export function detectExactCode(q: string): string | null {
  const parsed = exactCodeSchema.safeParse(q);
  return parsed.success ? parsed.data : null;
}

function likePattern(q: string): string {
  return `%${q.replace(/[%_\\]/g, "\\$&")}%`;
}

function modelQuery(db: AppDb) {
  return db
    .select({
      variantId: componentVariants.id,
      modelId: componentModels.id,
      code: componentModels.code,
      variantCode: componentVariants.code,
      revision: componentVariants.revision,
      name: componentModels.name,
      componentType: componentModels.componentType,
      manufacturerName: manufacturers.name,
      familyName: componentFamilies.name,
      category: componentFamilies.category,
      status: componentModels.status,
      speeds: componentModels.speeds,
    })
    .from(componentVariants)
    .innerJoin(componentModels, eq(componentModels.id, componentVariants.modelId))
    .innerJoin(componentFamilies, eq(componentFamilies.id, componentModels.familyId))
    .innerJoin(manufacturers, eq(manufacturers.id, componentFamilies.manufacturerId));
}

function modelFilters(input: LibrarySearch): (SQL | undefined)[] {
  return [
    input.category ? eq(componentFamilies.category, input.category) : undefined,
    input.manufacturerId ? eq(manufacturers.id, input.manufacturerId) : undefined,
    input.status ? eq(componentModels.status, input.status) : undefined,
  ];
}

async function exactMatches(db: AppDb, input: LibrarySearch): Promise<ModelHit[]> {
  const code = detectExactCode(input.q);
  if (!code) return [];
  return modelQuery(db)
    .where(
      and(
        or(
          sql`upper(${componentVariants.code}) = ${code}`,
          sql`upper(${componentModels.code}) = ${code}`,
        ),
        ...modelFilters(input),
      ),
    )
    .orderBy(asc(componentVariants.revision));
}

async function modelMatches(
  db: AppDb,
  input: LibrarySearch,
  exact: ModelHit[],
): Promise<ModelHit[]> {
  const pattern = likePattern(input.q);
  return modelQuery(db)
    .where(
      and(
        or(
          sql`${componentVariants.code} ilike ${pattern} escape ${"\\"}`,
          sql`${componentModels.code} ilike ${pattern} escape ${"\\"}`,
          sql`${componentModels.name} ilike ${pattern} escape ${"\\"}`,
        ),
        ...modelFilters(input),
        exact.length
          ? notInArray(
              componentVariants.id,
              exact.map((hit) => hit.variantId),
            )
          : undefined,
      ),
    )
    .orderBy(
      asc(componentModels.code),
      asc(componentVariants.code),
      asc(componentVariants.revision),
    )
    .limit(20);
}

async function articleMatches(db: AppDb, input: LibrarySearch): Promise<ArticleHit[]> {
  const vector = sql`to_tsvector('spanish', ${knowledgeArticles.title} || ' ' || ${articleVersions.summary} || ' ' || ${articleVersions.contentMd})`;
  const query = sql`plainto_tsquery('spanish', ${input.q})`;
  const rank = sql<number>`ts_rank(${vector}, ${query})`.mapWith(Number);
  return db
    .select({
      articleId: knowledgeArticles.id,
      versionId: articleVersions.id,
      slug: knowledgeArticles.slug,
      title: knowledgeArticles.title,
      category: knowledgeArticles.category,
      kind: knowledgeArticles.kind,
      summary: articleVersions.summary,
      versionNumber: articleVersions.number,
      publishedAt: articleVersions.publishedAt,
      rank,
    })
    .from(knowledgeArticles)
    .innerJoin(
      articleVersions,
      and(
        eq(articleVersions.id, knowledgeArticles.currentVersionId),
        eq(articleVersions.articleId, knowledgeArticles.id),
      ),
    )
    .where(
      and(
        eq(knowledgeArticles.status, "publicado"),
        or(
          sql`${vector} @@ ${query}`,
          sql`${knowledgeArticles.title} ilike ${likePattern(input.q)} escape ${"\\"}`,
        ),
        input.category ? eq(knowledgeArticles.category, input.category) : undefined,
      ),
    )
    .orderBy(desc(rank), asc(knowledgeArticles.title))
    .limit(20);
}

async function documentMatches(db: AppDb, input: LibrarySearch): Promise<DocumentHit[]> {
  return db
    .select({
      id: technicalDocuments.id,
      title: technicalDocuments.title,
      manufacturerName: manufacturers.name,
      docType: technicalDocuments.docType,
      language: technicalDocuments.language,
      revision: technicalDocuments.revision,
      license: technicalDocuments.license,
      status: technicalDocuments.status,
    })
    .from(technicalDocuments)
    .leftJoin(manufacturers, eq(manufacturers.id, technicalDocuments.manufacturerId))
    .where(
      and(
        ne(technicalDocuments.status, "retirado"),
        sql`${technicalDocuments.title} ilike ${likePattern(input.q)} escape ${"\\"}`,
        input.manufacturerId
          ? eq(technicalDocuments.manufacturerId, input.manufacturerId)
          : undefined,
      ),
    )
    .orderBy(asc(technicalDocuments.title))
    .limit(20);
}

export async function searchLibrary(
  db: AppDb,
  actor: SessionUser,
  input: LibrarySearch,
): Promise<({ ok: true } & LibrarySearchResult) | { ok: false; code: "forbidden" }> {
  if (!canUseLibrary(actor)) return { ok: false, code: "forbidden" };
  const parsed = librarySearchSchema.safeParse(input);
  if (!parsed.success) return { ok: true, exact: [], models: [], articles: [], documents: [] };
  const exact = await exactMatches(db, parsed.data);
  const [models, articles, documents] = await Promise.all([
    modelMatches(db, parsed.data, exact),
    articleMatches(db, parsed.data),
    documentMatches(db, parsed.data),
  ]);
  return { ok: true, exact, models, articles, documents };
}
