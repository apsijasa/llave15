import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { componentVariants } from "./schema-library-catalog.ts";
import { articleVersions, knowledgeArticles } from "./schema-library-knowledge.ts";
import { workOrders } from "./schema-orders.ts";
import { bikes } from "./schema-taller.ts";
import { branches, createdAt, instant, updatedAt, users } from "./schema.ts";

function branchReference() {
  return uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "restrict" });
}

function creatorReference() {
  return uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" });
}

export const knowledgeProposals = pgTable(
  "knowledge_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: branchReference(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    contentMd: text("content_md").notNull(),
    evidence: text("evidence").notNull().default(""),
    targetArticleId: uuid("target_article_id").references(() => knowledgeArticles.id, {
      onDelete: "restrict",
    }),
    targetVariantId: uuid("target_variant_id").references(() => componentVariants.id, {
      onDelete: "restrict",
    }),
    status: text("status").notNull().default("draft"),
    submittedAt: instant("submitted_at"),
    withdrawnAt: instant("withdrawn_at"),
    publishedVersionId: uuid("published_version_id").references(() => articleVersions.id, {
      onDelete: "restrict",
    }),
    piiFlags: jsonb("pii_flags")
      .$type<{ kind: string; match: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_knowledge_proposals_branch_status").on(t.branchId, t.status),
    index("idx_knowledge_proposals_status_submitted").on(t.status, t.submittedAt),
    check(
      "knowledge_proposals_kind_check",
      sql`kind in ('articulo', 'procedimiento', 'diagnostico', 'compatibilidad', 'especificacion', 'correccion')`,
    ),
    check(
      "knowledge_proposals_status_check",
      sql`status in ('draft', 'submitted', 'needs_changes', 'in_review', 'approved', 'rejected', 'published', 'withdrawn')`,
    ),
    check(
      "knowledge_proposals_published_check",
      sql`(status = 'published') = (published_version_id is not null)`,
    ),
  ],
);

export const proposalReviews = pgTable(
  "proposal_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => knowledgeProposals.id, { onDelete: "restrict" }),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decision: text("decision").notNull(),
    reason: text("reason").notNull().default(""),
    checklist: jsonb("checklist")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_proposal_reviews_proposal").on(t.proposalId),
    check(
      "proposal_reviews_decision_check",
      sql`decision in ('in_review', 'needs_changes', 'approved', 'rejected', 'published')`,
    ),
  ],
);

export const publicationEvents = pgTable(
  "publication_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => knowledgeArticles.id, { onDelete: "restrict" }),
    versionId: uuid("version_id").references(() => articleVersions.id, { onDelete: "restrict" }),
    operation: text("operation").notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    justification: text("justification").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_publication_events_article").on(t.articleId),
    check(
      "publication_events_operation_check",
      sql`operation in ('publish', 'archive', 'rollback', 'import')`,
    ),
  ],
);

export const technicalDiagnoses = pgTable(
  "technical_diagnoses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: branchReference(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "restrict" }),
    bikeId: uuid("bike_id")
      .notNull()
      .references(() => bikes.id, { onDelete: "restrict" }),
    symptoms: text("symptoms").notNull(),
    inspections: jsonb("inspections").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    hypotheses: jsonb("hypotheses").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    result: text("result"),
    status: text("status").notNull().default("borrador"),
    confirmedBy: uuid("confirmed_by").references(() => users.id, { onDelete: "restrict" }),
    confirmedAt: instant("confirmed_at"),
    refs: jsonb("references")
      .$type<{ kind: string; id: string; versionNumber?: number }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    aiInteractionId: uuid("ai_interaction_id"),
    voidedAt: instant("voided_at"),
    voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "restrict" }),
    createdBy: creatorReference(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_technical_diagnoses_order_created").on(t.workOrderId, t.createdAt),
    check("technical_diagnoses_status_check", sql`status in ('borrador', 'confirmado')`),
    check(
      "technical_diagnoses_confirmed_check",
      sql`(status = 'confirmado') = (confirmed_at is not null)`,
    ),
  ],
);

export const privateTechnicalNotes = pgTable(
  "private_technical_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: branchReference(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    bikeId: uuid("bike_id").references(() => bikes.id, { onDelete: "restrict" }),
    workOrderId: uuid("work_order_id").references(() => workOrders.id, { onDelete: "restrict" }),
    contentMd: text("content_md").notNull(),
    scope: text("scope").notNull().default("taller"),
    voidedAt: instant("voided_at"),
    voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_private_technical_notes_branch_created").on(t.branchId, t.createdAt),
    check("private_technical_notes_scope_check", sql`scope in ('personal', 'taller')`),
  ],
);

export const aiInteractions = pgTable(
  "ai_interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: branchReference(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    scope: text("scope").notNull(),
    workOrderId: uuid("work_order_id").references(() => workOrders.id, { onDelete: "restrict" }),
    question: text("question").notNull(),
    answer: text("answer").notNull().default(""),
    confidence: text("confidence").notNull(),
    citations: jsonb("citations")
      .$type<{ chunkId: string; sourceKind: string; sourceId: string; versionNumber?: number }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    provider: text("provider").notNull(),
    model: text("model").notNull().default(""),
    promptVersion: text("prompt_version").notNull(),
    status: text("status").notNull(),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_ai_interactions_branch_created").on(t.branchId, t.createdAt),
    index("idx_ai_interactions_user_created").on(t.userId, t.createdAt),
    check("ai_interactions_scope_check", sql`scope in ('biblioteca', 'orden')`),
    check(
      "ai_interactions_confidence_check",
      sql`confidence in ('alta', 'media', 'baja', 'no_verificada')`,
    ),
    check(
      "ai_interactions_status_check",
      sql`status in ('respondida', 'sin_evidencia', 'error', 'cuota')`,
    ),
    check("ai_interactions_order_check", sql`scope <> 'orden' or work_order_id is not null`),
  ],
);

export const libraryPrivateTables = [
  knowledgeProposals,
  proposalReviews,
  publicationEvents,
  technicalDiagnoses,
  privateTechnicalNotes,
  aiInteractions,
] as const;
