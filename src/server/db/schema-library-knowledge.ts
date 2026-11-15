import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { componentVariants } from "./schema-library-catalog.ts";
import { createdAt, instant, updatedAt, users } from "./schema.ts";

export const knowledgeArticles = pgTable(
  "knowledge_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    topic: text("topic"),
    language: text("language").notNull().default("es"),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("borrador"),
    currentVersionId: uuid("current_version_id").references((): AnyPgColumn => articleVersions.id, {
      onDelete: "restrict",
    }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_knowledge_articles_slug").on(t.slug),
    index("idx_knowledge_articles_category_status").on(t.category, t.status),
    check(
      "knowledge_articles_category_check",
      sql`category in ('transmision', 'frenos', 'suspension', 'ruedas', 'direccion', 'pedalier', 'electronica', 'herramientas')`,
    ),
    check(
      "knowledge_articles_kind_check",
      sql`kind in ('articulo', 'procedimiento', 'diagnostico', 'compatibilidad')`,
    ),
    check("knowledge_articles_status_check", sql`status in ('borrador', 'publicado', 'archivado')`),
  ],
);

export const articleVersions = pgTable(
  "article_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => knowledgeArticles.id, { onDelete: "restrict" }),
    number: integer("number").notNull(),
    contentMd: text("content_md").notNull(),
    summary: text("summary").notNull().default(""),
    sources: jsonb("sources")
      .$type<{ documentId?: string; sourceId?: string; note?: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    contentHash: text("content_hash").notNull(),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
    publishedAt: instant("published_at"),
    validFrom: date("valid_from", { mode: "string" }),
    validUntil: date("valid_until", { mode: "string" }),
    supersedesVersionId: uuid("supersedes_version_id").references(
      (): AnyPgColumn => articleVersions.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_article_versions_article_number").on(t.articleId, t.number),
    check("article_versions_number_check", sql`number >= 1`),
  ],
);

export const articleVariantLinks = pgTable(
  "article_variant_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => articleVersions.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => componentVariants.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("uq_article_variant_links_version_variant").on(t.versionId, t.variantId)],
);

export const diagnosticRules = pgTable(
  "diagnostic_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => articleVersions.id, { onDelete: "restrict" }),
    symptom: text("symptom").notNull(),
    prerequisites: text("prerequisites"),
    testsMd: text("tests_md").notNull(),
    causes: jsonb("causes")
      .$type<{ cause: string; evidence: string; likelihood: "alta" | "media" | "baja" }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    actionsMd: text("actions_md").notNull(),
    validFrom: date("valid_from", { mode: "string" }),
    validUntil: date("valid_until", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_diagnostic_rules_version").on(t.versionId)],
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceKind: text("source_kind").notNull(),
    sourceId: uuid("source_id").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    text: text("text").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    scope: text("scope").notNull().default("global"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_document_chunks_source").on(t.sourceKind, t.sourceId, t.chunkIndex),
    index("idx_document_chunks_fts").using("gin", sql`to_tsvector('spanish', ${t.text})`),
    check(
      "document_chunks_source_kind_check",
      sql`source_kind in ('article_version', 'document', 'specification', 'procedure')`,
    ),
    check("document_chunks_scope_check", sql`scope in ('global')`),
  ],
);

export const libraryKnowledgeTables = [
  knowledgeArticles,
  articleVersions,
  articleVariantLinks,
  diagnosticRules,
  documentChunks,
] as const;
