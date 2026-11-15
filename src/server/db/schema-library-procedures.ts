import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  componentVariants,
  technicalDocuments,
  technicalSpecifications,
} from "./schema-library-catalog.ts";
import { articleVersions } from "./schema-library-knowledge.ts";
import { createdAt, updatedAt } from "./schema.ts";

export const procedures = pgTable(
  "procedures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => articleVersions.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    kind: text("kind").notNull(),
    risk: text("risk").notNull(),
    durationMinutes: integer("duration_minutes"),
    prerequisites: text("prerequisites"),
    finalChecks: text("final_checks"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_procedures_version").on(t.versionId),
    check(
      "procedures_kind_check",
      sql`kind in ('montaje', 'ajuste', 'mantenimiento', 'diagnostico', 'reparacion')`,
    ),
    check("procedures_risk_check", sql`risk in ('bajo', 'medio', 'alto', 'critico')`),
    check("procedures_duration_check", sql`duration_minutes is null or duration_minutes > 0`),
  ],
);

export const procedureSteps = pgTable(
  "procedure_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    procedureId: uuid("procedure_id")
      .notNull()
      .references(() => procedures.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    action: text("action").notNull(),
    tools: text("tools"),
    consumables: text("consumables"),
    verification: text("verification"),
    warning: text("warning"),
    imageKey: text("image_key"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_procedure_steps_procedure_sequence").on(t.procedureId, t.sequence),
    check("procedure_steps_sequence_check", sql`sequence >= 1`),
  ],
);

export const procedureSpecs = pgTable(
  "procedure_specs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    procedureId: uuid("procedure_id")
      .notNull()
      .references(() => procedures.id, { onDelete: "restrict" }),
    specificationId: uuid("specification_id")
      .notNull()
      .references(() => technicalSpecifications.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("uq_procedure_specs_pair").on(t.procedureId, t.specificationId)],
);

export const compatibilityRules = pgTable(
  "compatibility_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id").references(() => articleVersions.id, { onDelete: "restrict" }),
    relation: text("relation").notNull(),
    conditions: text("conditions"),
    restrictions: text("restrictions"),
    evidence: text("evidence").notNull(),
    sourceDocumentId: uuid("source_document_id").references(() => technicalDocuments.id, {
      onDelete: "restrict",
    }),
    certainty: text("certainty").notNull(),
    reviewedOn: date("reviewed_on", { mode: "string" }),
    status: text("status").notNull().default("vigente"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [
    check(
      "compatibility_rules_relation_check",
      sql`relation in ('oficial_confirmada', 'condicionada', 'incompatible', 'no_verificada')`,
    ),
    check("compatibility_rules_certainty_check", sql`certainty in ('alta', 'media', 'baja')`),
    check("compatibility_rules_status_check", sql`status in ('vigente', 'archivada')`),
    check(
      "compatibility_rules_source_check",
      sql`relation <> 'oficial_confirmada' or source_document_id is not null`,
    ),
  ],
);

export const compatibilityRuleMembers = pgTable(
  "compatibility_rule_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => compatibilityRules.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => componentVariants.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_compatibility_rule_members_rule_variant").on(t.ruleId, t.variantId),
    index("idx_compatibility_rule_members_variant").on(t.variantId),
    check(
      "compatibility_rule_members_role_check",
      sql`role in ('shifter', 'cambio', 'cassette', 'cadena', 'plato', 'nucleo', 'freno', 'disco', 'otro')`,
    ),
  ],
);

export const libraryProcedureTables = [
  procedures,
  procedureSteps,
  procedureSpecs,
  compatibilityRules,
  compatibilityRuleMembers,
] as const;
