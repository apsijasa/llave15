import { and, asc, eq, getTableColumns, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import type { AppDb } from "../db/client.ts";
import {
  componentModels,
  componentVariants,
  knowledgeSources,
  technicalDocuments,
  technicalSpecifications,
} from "../db/schema-library-catalog.ts";
import type { TechnicalSpecification } from "../db/schema-library-catalog.ts";
import {
  articleVariantLinks,
  articleVersions,
  knowledgeArticles,
} from "../db/schema-library-knowledge.ts";
import { procedures, procedureSteps, procedureSpecs } from "../db/schema-library-procedures.ts";
import { users } from "../db/schema.ts";
import { canUseLibrary } from "./access.ts";

type Procedure = typeof procedures.$inferSelect;
type ProcedureStep = typeof procedureSteps.$inferSelect;
type ArticleVersion = typeof articleVersions.$inferSelect;
const sourcesSchema = z.array(
  z.object({
    documentId: z.uuid().optional(),
    sourceId: z.uuid().optional(),
    note: z.string().optional(),
  }),
);
export type ProcedureDetail = {
  procedure: Procedure;
  article: { id: string; slug: string; title: string; category: string };
  version: {
    id: string;
    number: number;
    publishedAt: Date | null;
    reviewedByName: string | null;
    sources: ArticleVersion["sources"];
  };
  variants: { id: string; code: string; revision: string; modelName: string }[];
  steps: ProcedureStep[];
  specs: (TechnicalSpecification & {
    sourceDocument: { id: string; title: string; canonicalUrl: string } | null;
  })[];
};

async function publishedProcedure(db: AppDb, id: string) {
  const [row] = await db
    .select({
      procedure: getTableColumns(procedures),
      article: {
        id: knowledgeArticles.id,
        slug: knowledgeArticles.slug,
        title: knowledgeArticles.title,
        category: knowledgeArticles.category,
      },
      version: {
        id: articleVersions.id,
        number: articleVersions.number,
        publishedAt: articleVersions.publishedAt,
        reviewedByName: users.name,
        sources: articleVersions.sources,
      },
    })
    .from(procedures)
    .innerJoin(articleVersions, eq(articleVersions.id, procedures.versionId))
    .innerJoin(
      knowledgeArticles,
      and(
        eq(knowledgeArticles.id, articleVersions.articleId),
        eq(knowledgeArticles.currentVersionId, articleVersions.id),
      ),
    )
    .leftJoin(users, eq(users.id, articleVersions.reviewedBy))
    .where(
      and(
        eq(procedures.id, id),
        eq(knowledgeArticles.status, "publicado"),
        isNotNull(articleVersions.publishedAt),
      ),
    )
    .limit(1);
  return row;
}

async function procedureVariants(
  db: AppDb,
  versionId: string,
): Promise<ProcedureDetail["variants"]> {
  return db
    .select({
      id: componentVariants.id,
      code: componentVariants.code,
      revision: componentVariants.revision,
      modelName: componentModels.name,
    })
    .from(articleVariantLinks)
    .innerJoin(componentVariants, eq(componentVariants.id, articleVariantLinks.variantId))
    .innerJoin(componentModels, eq(componentModels.id, componentVariants.modelId))
    .where(eq(articleVariantLinks.versionId, versionId))
    .orderBy(asc(componentVariants.code), asc(componentVariants.revision));
}

async function linkedSpecifications(db: AppDb, id: string): Promise<ProcedureDetail["specs"]> {
  return db
    .select({
      ...getTableColumns(technicalSpecifications),
      sourceDocument: {
        id: technicalDocuments.id,
        title: technicalDocuments.title,
        canonicalUrl: technicalDocuments.canonicalUrl,
      },
    })
    .from(procedureSpecs)
    .innerJoin(
      technicalSpecifications,
      eq(technicalSpecifications.id, procedureSpecs.specificationId),
    )
    .leftJoin(
      technicalDocuments,
      eq(technicalDocuments.id, technicalSpecifications.sourceDocumentId),
    )
    .where(eq(procedureSpecs.procedureId, id))
    .orderBy(asc(technicalSpecifications.label));
}

export async function procedureDetail(
  db: AppDb,
  actor: SessionUser,
  id: string,
): Promise<{ ok: true; detail: ProcedureDetail } | { ok: false; code: "forbidden" | "not_found" }> {
  if (!canUseLibrary(actor)) return { ok: false, code: "forbidden" };
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, code: "not_found" };
  const row = await publishedProcedure(db, parsed.data);
  if (!row) return { ok: false, code: "not_found" };
  const [variants, steps, specs] = await Promise.all([
    procedureVariants(db, row.version.id),
    db
      .select()
      .from(procedureSteps)
      .where(eq(procedureSteps.procedureId, parsed.data))
      .orderBy(asc(procedureSteps.sequence)),
    linkedSpecifications(db, parsed.data),
  ]);
  return { ok: true, detail: { ...row, variants, steps, specs } };
}

/** Resuelve las referencias de la versión sin llevar consultas SQL a la página. */
export async function procedureSourceItems(
  db: AppDb,
  actor: SessionUser,
  sources: ArticleVersion["sources"],
): Promise<{ title: string; href: string; detail?: string }[]> {
  if (!canUseLibrary(actor)) return [];
  const parsed = sourcesSchema.safeParse(sources);
  if (!parsed.success) return [];
  const [documents, references] = await Promise.all([
    db
      .select({ id: technicalDocuments.id, title: technicalDocuments.title })
      .from(technicalDocuments)
      .where(
        inArray(
          technicalDocuments.id,
          parsed.data.flatMap((row) => (row.documentId ? [row.documentId] : [])),
        ),
      ),
    db
      .select({ id: knowledgeSources.id, title: knowledgeSources.title, url: knowledgeSources.url })
      .from(knowledgeSources)
      .where(
        inArray(
          knowledgeSources.id,
          parsed.data.flatMap((row) => (row.sourceId ? [row.sourceId] : [])),
        ),
      ),
  ]);
  return parsed.data.flatMap((row) => {
    const document = documents.find((item) => item.id === row.documentId);
    const source = references.find((item) => item.id === row.sourceId);
    return [
      ...(document
        ? [
            {
              title: document.title,
              href: `/taller/biblioteca/documentos/${document.id}`,
              detail: row.note,
            },
          ]
        : []),
      ...(source ? [{ title: source.title, href: source.url, detail: row.note }] : []),
    ];
  });
}
