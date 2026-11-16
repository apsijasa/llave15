import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { componentVariants } from "../db/schema-library-catalog.ts";
import { knowledgeArticles } from "../db/schema-library-knowledge.ts";
import { knowledgeProposals, proposalReviews } from "../db/schema-library-private.ts";
import { users } from "../db/schema.ts";
import { recordAudit } from "../taller/audit.ts";
import type { AuditAction } from "../taller/audit.ts";
import { detectPii } from "./pii.ts";
import type { PiiFinding } from "./pii.ts";
import { isProposalTransition, PROPOSAL_KINDS } from "./rules.ts";
import type { ProposalStatus } from "./rules.ts";

const emptyToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

export const proposalFormSchema = z.strictObject({
  kind: z.enum(PROPOSAL_KINDS),
  title: z.string().trim().min(5).max(160),
  contentMd: z.string().trim().min(20).max(20000),
  evidence: z.string().trim().max(4000).default(""),
  targetArticleId: z.preprocess(emptyToUndefined, z.uuid().optional()),
  targetVariantId: z.preprocess(emptyToUndefined, z.uuid().optional()),
});
type ProposalInput = z.infer<typeof proposalFormSchema>;
type Proposal = typeof knowledgeProposals.$inferSelect;
type Failure<C extends string> = { ok: false; code: C };

export type ProposalSummary = {
  id: string;
  kind: string;
  title: string;
  status: string;
  submittedAt: Date | null;
  updatedAt: Date;
  authorName: string;
};

function fail<C extends string>(code: C): Failure<C> {
  return { ok: false, code };
}

function ownProposal(actor: SessionUser, id: string) {
  return and(eq(knowledgeProposals.branchId, actor.branchId), eq(knowledgeProposals.id, id));
}

async function auditProposal(
  db: AppDb,
  actor: SessionUser,
  proposal: Pick<Proposal, "id" | "kind" | "title">,
  action: AuditAction,
  now: Date,
): Promise<void> {
  await recordAudit(
    db,
    {
      branchId: actor.branchId,
      actorUserId: actor.id,
      action,
      entity: "knowledge_proposal",
      entityId: proposal.id,
      details: { kind: proposal.kind, title: proposal.title },
    },
    now,
  );
}

async function targetsExist(db: AppDb, input: ProposalInput): Promise<boolean> {
  if (input.targetArticleId) {
    const [article] = await db
      .select({ id: knowledgeArticles.id })
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.id, input.targetArticleId));
    if (!article) return false;
  }
  if (input.targetVariantId) {
    const [variant] = await db
      .select({ id: componentVariants.id })
      .from(componentVariants)
      .where(eq(componentVariants.id, input.targetVariantId));
    if (!variant) return false;
  }
  return true;
}

function proposalValues(input: ProposalInput) {
  return {
    kind: input.kind,
    title: input.title,
    contentMd: input.contentMd,
    evidence: input.evidence,
    targetArticleId: input.targetArticleId ?? null,
    targetVariantId: input.targetVariantId ?? null,
  };
}

async function lockProposal(db: AppDb, actor: SessionUser, id: string) {
  if (!z.uuid().safeParse(id).success) return undefined;
  const [proposal] = await db
    .select()
    .from(knowledgeProposals)
    .where(ownProposal(actor, id))
    .for("update");
  return proposal;
}

export async function createProposal(
  db: AppDb,
  actor: SessionUser,
  input: unknown,
  now: Date,
): Promise<
  { ok: true; id: string } | Failure<"forbidden" | "validation_error" | "invalid_target">
> {
  if (!can(actor.role, "library.propose")) return fail("forbidden");
  const parsed = proposalFormSchema.safeParse(input);
  if (!parsed.success) return fail("validation_error");
  if (!(await targetsExist(db, parsed.data))) return fail("invalid_target");
  return db.transaction(async (tx) => {
    const [proposal] = await tx
      .insert(knowledgeProposals)
      .values({
        ...proposalValues(parsed.data),
        branchId: actor.branchId,
        authorId: actor.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!proposal) throw new Error("No se pudo crear la propuesta.");
    await auditProposal(tx, actor, proposal, "proposal.created", now);
    return { ok: true, id: proposal.id } as const;
  });
}

type UpdateFailure = "forbidden" | "validation_error" | "not_found" | "invalid_transition";

export async function updateProposal(
  db: AppDb,
  actor: SessionUser,
  id: string,
  input: unknown,
  now: Date,
): Promise<{ ok: true } | Failure<UpdateFailure | "invalid_target">> {
  if (!can(actor.role, "library.propose")) return fail("forbidden");
  const parsed = proposalFormSchema.safeParse(input);
  if (!parsed.success) return fail("validation_error");
  if (!(await targetsExist(db, parsed.data))) return fail("invalid_target");
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, actor, id);
    if (!proposal) return fail("not_found");
    if (proposal.authorId !== actor.id) return fail("forbidden");
    if (proposal.status !== "draft" && proposal.status !== "needs_changes")
      return fail("invalid_transition");
    await tx
      .update(knowledgeProposals)
      .set({ ...proposalValues(parsed.data), status: "draft", updatedAt: now })
      .where(ownProposal(actor, id));
    await auditProposal(tx, actor, { ...proposal, ...parsed.data }, "proposal.updated", now);
    return { ok: true } as const;
  });
}

async function moveProposal(
  db: AppDb,
  actor: SessionUser,
  id: string,
  to: ProposalStatus,
): Promise<
  { ok: true; proposal: Proposal } | Failure<"forbidden" | "not_found" | "invalid_transition">
> {
  if (!can(actor.role, "library.propose")) return fail("forbidden");
  const proposal = await lockProposal(db, actor, id);
  if (!proposal) return fail("not_found");
  if (proposal.authorId !== actor.id) return fail("forbidden");
  if (!isProposalTransition(proposal.status as ProposalStatus, to))
    return fail("invalid_transition");
  return { ok: true, proposal };
}

export async function submitProposal(
  db: AppDb,
  actor: SessionUser,
  id: string,
  now: Date,
): Promise<
  { ok: true; piiFlags: PiiFinding[] } | Failure<"forbidden" | "not_found" | "invalid_transition">
> {
  return db.transaction(async (tx) => {
    const moved = await moveProposal(tx, actor, id, "submitted");
    if (!moved.ok) return moved;
    const { proposal } = moved;
    const piiFlags = detectPii(`${proposal.title}\n${proposal.contentMd}\n${proposal.evidence}`);
    await tx
      .update(knowledgeProposals)
      .set({ status: "submitted", submittedAt: now, piiFlags, updatedAt: now })
      .where(ownProposal(actor, id));
    await auditProposal(tx, actor, proposal, "proposal.submitted", now);
    return { ok: true, piiFlags } as const;
  });
}

export async function withdrawProposal(
  db: AppDb,
  actor: SessionUser,
  id: string,
  now: Date,
): Promise<{ ok: true } | Failure<"forbidden" | "not_found" | "invalid_transition">> {
  return db.transaction(async (tx) => {
    const moved = await moveProposal(tx, actor, id, "withdrawn");
    if (!moved.ok) return moved;
    await tx
      .update(knowledgeProposals)
      .set({ status: "withdrawn", withdrawnAt: now, updatedAt: now })
      .where(ownProposal(actor, id));
    await auditProposal(tx, actor, moved.proposal, "proposal.withdrawn", now);
    return { ok: true } as const;
  });
}

export async function listMyProposals(db: AppDb, actor: SessionUser): Promise<ProposalSummary[]> {
  if (!can(actor.role, "library.propose")) return [];
  return db
    .select({
      id: knowledgeProposals.id,
      kind: knowledgeProposals.kind,
      title: knowledgeProposals.title,
      status: knowledgeProposals.status,
      submittedAt: knowledgeProposals.submittedAt,
      updatedAt: knowledgeProposals.updatedAt,
      authorName: users.name,
    })
    .from(knowledgeProposals)
    .innerJoin(users, eq(users.id, knowledgeProposals.authorId))
    .where(eq(knowledgeProposals.branchId, actor.branchId))
    .orderBy(desc(knowledgeProposals.updatedAt), desc(knowledgeProposals.id))
    .limit(200);
}

export type ProposalReviewEntry = {
  decision: string;
  reason: string;
  createdAt: Date;
  reviewerName: string | null;
};

export async function proposalDetail(
  db: AppDb,
  actor: SessionUser,
  id: string,
): Promise<
  | { ok: true; proposal: Proposal; reviews: ProposalReviewEntry[]; authorName: string }
  | Failure<"not_found" | "forbidden">
> {
  if (!can(actor.role, "library.propose")) return fail("forbidden");
  if (!z.uuid().safeParse(id).success) return fail("not_found");
  const [row] = await db
    .select({ proposal: knowledgeProposals, authorName: users.name })
    .from(knowledgeProposals)
    .innerJoin(users, eq(users.id, knowledgeProposals.authorId))
    .where(ownProposal(actor, id));
  if (!row) return fail("not_found");
  const reviews = await db
    .select({
      decision: proposalReviews.decision,
      reason: proposalReviews.reason,
      createdAt: proposalReviews.createdAt,
      reviewerName: users.name,
    })
    .from(proposalReviews)
    .leftJoin(users, eq(users.id, proposalReviews.reviewerId))
    .where(eq(proposalReviews.proposalId, id))
    .orderBy(desc(proposalReviews.createdAt));
  return { ok: true, proposal: row.proposal, reviews, authorName: row.authorName };
}

export type ProposalTargets = {
  articles: { id: string; title: string }[];
  variants: { id: string; label: string }[];
};

/** Artículos publicados y variantes para los selects del formulario de propuesta. */
export async function proposalTargets(db: AppDb): Promise<ProposalTargets> {
  const articles = await db
    .select({ id: knowledgeArticles.id, title: knowledgeArticles.title })
    .from(knowledgeArticles)
    .where(eq(knowledgeArticles.status, "publicado"))
    .orderBy(asc(knowledgeArticles.title))
    .limit(200);
  const variants = await db
    .select({
      id: componentVariants.id,
      code: componentVariants.code,
      revision: componentVariants.revision,
    })
    .from(componentVariants)
    .orderBy(asc(componentVariants.code), asc(componentVariants.revision))
    .limit(200);
  return {
    articles,
    variants: variants.map((row) => ({
      id: row.id,
      label: row.revision ? `${row.code} · rev. ${row.revision}` : row.code,
    })),
  };
}

const FIELD_MESSAGES: Record<string, string> = {
  kind: "Elige un tipo de propuesta.",
  title: "El título debe tener entre 5 y 160 caracteres.",
  contentMd: "El contenido debe tener entre 20 y 20.000 caracteres.",
  evidence: "La evidencia puede tener hasta 4.000 caracteres.",
  targetArticleId: "Elige un artículo válido.",
  targetVariantId: "Elige una variante válida.",
};

/** Mensajes por campo para el formulario; vacío si la entrada es válida. */
export function proposalFieldErrors(input: unknown): Record<string, string> {
  const parsed = proposalFormSchema.safeParse(input);
  if (parsed.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "");
    errors[field] = FIELD_MESSAGES[field] ?? "Revisa este campo.";
  }
  return errors;
}
