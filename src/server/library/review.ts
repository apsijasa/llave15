import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import type { AppDb } from "../db/client.ts";
import { articleVersions, knowledgeArticles } from "../db/schema-library-knowledge.ts";
import { knowledgeProposals, proposalReviews } from "../db/schema-library-private.ts";
import { users } from "../db/schema.ts";
import { recordAudit } from "../taller/audit.ts";
import { canCurate } from "./access.ts";
import { isProposalTransition } from "./rules.ts";
import type { ProposalStatus } from "./rules.ts";

type Failure<C extends string> = { ok: false; code: C };
const QUEUE_STATUSES = ["submitted", "in_review", "approved"] as const;
const REASON_REQUIRED = new Set(["needs_changes", "rejected"]);

export type ReviewQueueItem = {
  id: string;
  kind: string;
  title: string;
  status: string;
  submittedAt: Date | null;
  piiCount: number;
  targetArticleTitle: string | null;
};

export const reviewDecisionSchema = z.object({
  decision: z.enum(["in_review", "needs_changes", "approved", "rejected"]),
  reason: z.string().trim().max(2000).default(""),
  checklist: z.record(z.string(), z.boolean()).default({}),
});

/** Cola de revisión de todas las sucursales, sin sucursal, autor ni datos del taller. */
export async function reviewQueue(
  db: AppDb,
  curator: SessionUser,
): Promise<{ ok: true; items: ReviewQueueItem[] } | Failure<"forbidden">> {
  if (!canCurate(curator)) return { ok: false, code: "forbidden" };
  const items = await db
    .select({
      id: knowledgeProposals.id,
      kind: knowledgeProposals.kind,
      title: knowledgeProposals.title,
      status: knowledgeProposals.status,
      submittedAt: knowledgeProposals.submittedAt,
      piiCount: sql<number>`jsonb_array_length(${knowledgeProposals.piiFlags})`.mapWith(Number),
      targetArticleTitle: knowledgeArticles.title,
    })
    .from(knowledgeProposals)
    .leftJoin(knowledgeArticles, eq(knowledgeArticles.id, knowledgeProposals.targetArticleId))
    .where(inArray(knowledgeProposals.status, [...QUEUE_STATUSES]))
    .orderBy(asc(knowledgeProposals.submittedAt), asc(knowledgeProposals.id))
    .limit(200);
  return { ok: true, items };
}

export type ReviewDetail = {
  proposal: {
    id: string;
    kind: string;
    title: string;
    status: string;
    contentMd: string;
    evidence: string;
    piiFlags: { kind: string; match: string }[];
    submittedAt: Date | null;
    targetArticleId: string | null;
    targetVariantId: string | null;
  };
  current: { versionId: string; number: number; contentMd: string } | null;
  reviews: { decision: string; reason: string; createdAt: Date; reviewerName: string | null }[];
};

async function currentVersion(db: AppDb, articleId: string | null) {
  if (!articleId) return null;
  const [row] = await db
    .select({
      versionId: articleVersions.id,
      number: articleVersions.number,
      contentMd: articleVersions.contentMd,
    })
    .from(knowledgeArticles)
    .innerJoin(articleVersions, eq(articleVersions.id, knowledgeArticles.currentVersionId))
    .where(eq(knowledgeArticles.id, articleId));
  return row ?? null;
}

export async function reviewDetail(
  db: AppDb,
  curator: SessionUser,
  id: string,
): Promise<({ ok: true } & ReviewDetail) | Failure<"forbidden" | "not_found">> {
  if (!canCurate(curator)) return { ok: false, code: "forbidden" };
  if (!z.uuid().safeParse(id).success) return { ok: false, code: "not_found" };
  const [proposal] = await db
    .select({
      id: knowledgeProposals.id,
      kind: knowledgeProposals.kind,
      title: knowledgeProposals.title,
      status: knowledgeProposals.status,
      contentMd: knowledgeProposals.contentMd,
      evidence: knowledgeProposals.evidence,
      piiFlags: knowledgeProposals.piiFlags,
      submittedAt: knowledgeProposals.submittedAt,
      targetArticleId: knowledgeProposals.targetArticleId,
      targetVariantId: knowledgeProposals.targetVariantId,
    })
    .from(knowledgeProposals)
    .where(eq(knowledgeProposals.id, id));
  if (!proposal) return { ok: false, code: "not_found" };
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
  return {
    ok: true,
    proposal,
    current: await currentVersion(db, proposal.targetArticleId),
    reviews,
  };
}

type DecisionFailure =
  | "forbidden"
  | "not_found"
  | "invalid_transition"
  | "validation_error"
  | "reason_required"
  | "pii_unresolved";
type Decision = z.infer<typeof reviewDecisionSchema>;

function decisionProblem(decision: Decision, piiCount: number): DecisionFailure | null {
  if (REASON_REQUIRED.has(decision.decision) && decision.reason.length < 5)
    return "reason_required";
  if (decision.decision === "approved" && piiCount > 0 && decision.checklist.piiRevisada !== true)
    return "pii_unresolved";
  return null;
}

export async function reviewProposal(
  db: AppDb,
  curator: SessionUser,
  id: string,
  input: unknown,
  now: Date,
): Promise<{ ok: true } | Failure<DecisionFailure>> {
  if (!canCurate(curator)) return { ok: false, code: "forbidden" };
  const parsed = reviewDecisionSchema.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(id).success)
    return { ok: false, code: parsed.success ? "not_found" : "validation_error" };
  const decision = parsed.data;
  return db.transaction(async (tx) => {
    const [proposal] = await tx
      .select()
      .from(knowledgeProposals)
      .where(eq(knowledgeProposals.id, id))
      .for("update");
    if (!proposal) return { ok: false, code: "not_found" } as const;
    if (!isProposalTransition(proposal.status as ProposalStatus, decision.decision))
      return { ok: false, code: "invalid_transition" } as const;
    const problem = decisionProblem(decision, proposal.piiFlags.length);
    if (problem) return { ok: false, code: problem } as const;
    await tx.insert(proposalReviews).values({
      proposalId: id,
      reviewerId: curator.id,
      decision: decision.decision,
      reason: decision.reason,
      checklist: decision.checklist,
      createdAt: now,
      updatedAt: now,
    });
    await tx
      .update(knowledgeProposals)
      .set({ status: decision.decision, updatedAt: now })
      .where(eq(knowledgeProposals.id, id));
    await recordAudit(
      tx,
      {
        branchId: curator.branchId,
        actorUserId: curator.id,
        action: "proposal.reviewed",
        entity: "knowledge_proposal",
        entityId: id,
        details: { decision: decision.decision, from: proposal.status },
      },
      now,
    );
    return { ok: true } as const;
  });
}
