import { createHash } from "node:crypto";
import { asc, eq, max } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import type { AppDb } from "../db/client.ts";
import {
  articleVariantLinks,
  articleVersions,
  knowledgeArticles,
} from "../db/schema-library-knowledge.ts";
import {
  knowledgeProposals,
  proposalReviews,
  publicationEvents,
} from "../db/schema-library-private.ts";
import { recordAudit } from "../taller/audit.ts";
import type { AuditAction } from "../taller/audit.ts";
import { canCurate } from "./access.ts";
import { reindexVersion, removeArticleChunks } from "./chunks.ts";
import { LIBRARY_CATEGORIES } from "./rules.ts";

type Failure<C extends string> = { ok: false; code: C };
type Proposal = typeof knowledgeProposals.$inferSelect;
type Indexer = (tx: AppDb, versionId: string) => Promise<number>;
type PublishFailure =
  | "forbidden"
  | "not_found"
  | "invalid_transition"
  | "validation_error"
  | "slug_taken"
  | "index_failed";

export const publishInputSchema = z.object({
  justification: z.string().trim().max(1000).default(""),
  slug: z
    .string()
    .regex(/^[a-z0-9-]{3,80}$/)
    .optional(),
  category: z.enum(LIBRARY_CATEGORIES).optional(),
});
type PublishInput = z.infer<typeof publishInputSchema>;

/** Se lanza dentro de la transacción para revertir la publicación cuando falla el índice. */
class IndexFailed extends Error {}

const ARTICLE_KIND: Record<string, string> = {
  articulo: "articulo",
  procedimiento: "procedimiento",
  diagnostico: "diagnostico",
  compatibilidad: "compatibilidad",
  especificacion: "articulo",
  correccion: "articulo",
};

export function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function plainSummary(markdown: string): string {
  return markdown
    .replace(/[#*_`>[\]()|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

async function audit(
  tx: AppDb,
  curator: SessionUser,
  action: AuditAction,
  articleId: string,
  details: Record<string, unknown>,
  now: Date,
) {
  await recordAudit(
    tx,
    {
      branchId: curator.branchId,
      actorUserId: curator.id,
      action,
      entity: "knowledge_article",
      entityId: articleId,
      details,
    },
    now,
  );
}

type Target = { articleId: string; number: number; supersedes: string | null };

async function existingTarget(tx: AppDb, articleId: string): Promise<Target | null> {
  const [article] = await tx
    .select()
    .from(knowledgeArticles)
    .where(eq(knowledgeArticles.id, articleId))
    .for("update");
  if (!article) return null;
  const [last] = await tx
    .select({ number: max(articleVersions.number) })
    .from(articleVersions)
    .where(eq(articleVersions.articleId, articleId));
  return { articleId, number: (last?.number ?? 0) + 1, supersedes: article.currentVersionId };
}

async function newTarget(
  tx: AppDb,
  curator: SessionUser,
  proposal: Proposal,
  input: PublishInput,
  now: Date,
): Promise<Target | Failure<"slug_taken" | "validation_error">> {
  if (!input.category) return { ok: false, code: "validation_error" };
  const slug = input.slug ?? slugify(proposal.title);
  if (slug.length < 3) return { ok: false, code: "validation_error" };
  const [taken] = await tx
    .select({ id: knowledgeArticles.id })
    .from(knowledgeArticles)
    .where(eq(knowledgeArticles.slug, slug));
  if (taken) return { ok: false, code: "slug_taken" };
  const [article] = await tx
    .insert(knowledgeArticles)
    .values({
      slug,
      title: proposal.title,
      category: input.category,
      kind: ARTICLE_KIND[proposal.kind] ?? "articulo",
      status: "borrador",
      createdBy: curator.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: knowledgeArticles.id });
  if (!article) throw new Error("No se pudo crear el artículo.");
  return { articleId: article.id, number: 1, supersedes: null };
}

async function insertVersion(
  tx: AppDb,
  curator: SessionUser,
  proposal: Proposal,
  target: Target,
  now: Date,
): Promise<string> {
  const [version] = await tx
    .insert(articleVersions)
    .values({
      articleId: target.articleId,
      number: target.number,
      contentMd: proposal.contentMd,
      summary: plainSummary(proposal.contentMd),
      sources: proposal.evidence ? [{ note: proposal.evidence }] : [],
      contentHash: createHash("sha256").update(proposal.contentMd).digest("hex"),
      reviewedBy: curator.id,
      publishedAt: now,
      supersedesVersionId: target.supersedes,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: articleVersions.id });
  if (!version) throw new Error("No se pudo crear la versión.");
  await tx
    .update(knowledgeArticles)
    .set({ currentVersionId: version.id, status: "publicado", updatedAt: now })
    .where(eq(knowledgeArticles.id, target.articleId));
  if (proposal.targetVariantId)
    await tx.insert(articleVariantLinks).values({
      versionId: version.id,
      variantId: proposal.targetVariantId,
      createdAt: now,
      updatedAt: now,
    });
  return version.id;
}

async function closeProposal(
  tx: AppDb,
  curator: SessionUser,
  proposal: Proposal,
  versionId: string,
  now: Date,
) {
  await tx.insert(proposalReviews).values({
    proposalId: proposal.id,
    reviewerId: curator.id,
    decision: "published",
    createdAt: now,
    updatedAt: now,
  });
  await tx
    .update(knowledgeProposals)
    .set({ status: "published", publishedVersionId: versionId, updatedAt: now })
    .where(eq(knowledgeProposals.id, proposal.id));
}

async function reindexArticle(tx: AppDb, articleId: string, versionId: string, indexer: Indexer) {
  try {
    await removeArticleChunks(tx, articleId);
    await indexer(tx, versionId);
  } catch {
    throw new IndexFailed();
  }
}

type Published = { ok: true; articleId: string; versionId: string; versionNumber: number };

async function publishInTransaction(
  tx: AppDb,
  curator: SessionUser,
  proposalId: string,
  input: PublishInput,
  now: Date,
  indexer: Indexer,
): Promise<Published | Failure<PublishFailure>> {
  const [proposal] = await tx
    .select()
    .from(knowledgeProposals)
    .where(eq(knowledgeProposals.id, proposalId))
    .for("update");
  if (!proposal) return { ok: false, code: "not_found" };
  if (proposal.status !== "approved") return { ok: false, code: "invalid_transition" };
  const target = proposal.targetArticleId
    ? await existingTarget(tx, proposal.targetArticleId)
    : await newTarget(tx, curator, proposal, input, now);
  if (!target) return { ok: false, code: "not_found" };
  if ("ok" in target) return target;
  const versionId = await insertVersion(tx, curator, proposal, target, now);
  await tx.insert(publicationEvents).values({
    articleId: target.articleId,
    versionId,
    operation: "publish",
    actorId: curator.id,
    justification: input.justification,
    createdAt: now,
    updatedAt: now,
  });
  await closeProposal(tx, curator, proposal, versionId, now);
  await reindexArticle(tx, target.articleId, versionId, indexer);
  await audit(
    tx,
    curator,
    "library.published",
    target.articleId,
    { versionNumber: target.number },
    now,
  );
  return { ok: true, articleId: target.articleId, versionId, versionNumber: target.number };
}

/** Publica una propuesta aprobada como versión nueva; la anterior queda intacta. */
export async function publishProposal(
  db: AppDb,
  curator: SessionUser,
  proposalId: string,
  input: unknown,
  now: Date,
  indexer: Indexer = reindexVersion,
): Promise<Published | Failure<PublishFailure>> {
  if (!canCurate(curator)) return { ok: false, code: "forbidden" };
  const parsed = publishInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "validation_error" };
  if (!z.uuid().safeParse(proposalId).success) return { ok: false, code: "not_found" };
  try {
    return await db.transaction((tx) =>
      publishInTransaction(tx, curator, proposalId, parsed.data, now, indexer),
    );
  } catch (error) {
    if (error instanceof IndexFailed) return { ok: false, code: "index_failed" };
    throw error;
  }
}

export async function archiveArticle(
  db: AppDb,
  curator: SessionUser,
  articleId: string,
  justification: string,
  now: Date,
): Promise<{ ok: true } | Failure<"forbidden" | "not_found" | "already_archived">> {
  if (!canCurate(curator)) return { ok: false, code: "forbidden" };
  if (!z.uuid().safeParse(articleId).success) return { ok: false, code: "not_found" };
  return db.transaction(async (tx) => {
    const [article] = await tx
      .select()
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.id, articleId))
      .for("update");
    if (!article) return { ok: false, code: "not_found" } as const;
    if (article.status === "archivado") return { ok: false, code: "already_archived" } as const;
    await tx
      .update(knowledgeArticles)
      .set({ status: "archivado", updatedAt: now })
      .where(eq(knowledgeArticles.id, articleId));
    await removeArticleChunks(tx, articleId);
    await tx.insert(publicationEvents).values({
      articleId,
      versionId: article.currentVersionId,
      operation: "archive",
      actorId: curator.id,
      justification: justification.trim().slice(0, 1000),
      createdAt: now,
      updatedAt: now,
    });
    await audit(tx, curator, "library.archived", articleId, { slug: article.slug }, now);
    return { ok: true } as const;
  });
}

export async function listArticleVersions(db: AppDb, articleId: string) {
  return db
    .select({
      id: articleVersions.id,
      number: articleVersions.number,
      publishedAt: articleVersions.publishedAt,
      contentHash: articleVersions.contentHash,
    })
    .from(articleVersions)
    .where(eq(articleVersions.articleId, articleId))
    .orderBy(asc(articleVersions.number));
}
