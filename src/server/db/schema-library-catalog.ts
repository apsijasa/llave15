import { sql } from "drizzle-orm";
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
import { createdAt, updatedAt } from "./schema.ts";

export const manufacturers = pgTable(
  "manufacturers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    aliases: jsonb("aliases").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    officialSiteUrl: text("official_site_url"),
    status: text("status").notNull().default("activo"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_manufacturers_slug").on(t.slug),
    check("manufacturers_status_check", sql`status in ('activo', 'inactivo')`),
  ],
);

export const componentFamilies = pgTable(
  "component_families",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    manufacturerId: uuid("manufacturer_id")
      .notNull()
      .references(() => manufacturers.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_component_families_manufacturer_slug").on(t.manufacturerId, t.slug),
    index("idx_component_families_category").on(t.category),
    check(
      "component_families_category_check",
      sql`category in ('transmision', 'frenos', 'suspension', 'ruedas', 'direccion', 'pedalier', 'electronica', 'herramientas')`,
    ),
  ],
);

export const componentModels = pgTable(
  "component_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => componentFamilies.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    componentType: text("component_type").notNull(),
    generation: text("generation"),
    speeds: integer("speeds"),
    status: text("status").notNull().default("vigente"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_component_models_family_code").on(t.familyId, t.code),
    index("idx_component_models_code").on(t.code),
    check(
      "component_models_status_check",
      sql`status in ('vigente', 'descontinuado', 'en_revision')`,
    ),
    check("component_models_speeds_check", sql`speeds is null or speeds between 1 and 14`),
  ],
);

export const componentVariants = pgTable(
  "component_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => componentModels.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    revision: text("revision").notNull().default(""),
    yearFrom: integer("year_from"),
    yearTo: integer("year_to"),
    attributes: jsonb("attributes")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("vigente"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_component_variants_model_code_revision").on(t.modelId, t.code, t.revision),
    index("idx_component_variants_code").on(t.code),
    check(
      "component_variants_status_check",
      sql`status in ('vigente', 'descontinuado', 'en_revision')`,
    ),
    check(
      "component_variants_years_check",
      sql`year_to is null or year_from is null or year_to >= year_from`,
    ),
  ],
);

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publisher: text("publisher").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    publishedOn: date("published_on", { mode: "string" }),
    reviewedOn: date("reviewed_on", { mode: "string" }),
    authority: text("authority").notNull(),
    usagePolicy: text("usage_policy").notNull().default("enlace"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_knowledge_sources_url").on(t.url),
    check(
      "knowledge_sources_authority_check",
      sql`authority in ('oficial', 'comunidad_verificada', 'comunidad', 'historico')`,
    ),
    check(
      "knowledge_sources_usage_policy_check",
      sql`usage_policy in ('enlace', 'extracto_permitido', 'copia_autorizada')`,
    ),
  ],
);

export const technicalDocuments = pgTable(
  "technical_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    manufacturerId: uuid("manufacturer_id").references(() => manufacturers.id, {
      onDelete: "restrict",
    }),
    sourceId: uuid("source_id").references(() => knowledgeSources.id, { onDelete: "restrict" }),
    canonicalUrl: text("canonical_url").notNull(),
    license: text("license").notNull().default("enlace"),
    docType: text("doc_type").notNull(),
    language: text("language").notNull().default("es"),
    variantId: uuid("variant_id").references(() => componentVariants.id, { onDelete: "restrict" }),
    revision: text("revision").notNull().default(""),
    checksum: text("checksum"),
    storageKey: text("storage_key"),
    status: text("status").notNull().default("vigente"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_technical_documents_url_revision").on(t.canonicalUrl, t.revision),
    index("idx_technical_documents_variant").on(t.variantId),
    check(
      "technical_documents_license_check",
      sql`license in ('enlace', 'extracto_permitido', 'copia_autorizada')`,
    ),
    check(
      "technical_documents_doc_type_check",
      sql`doc_type in ('manual', 'despiece', 'boletin', 'guia', 'otro')`,
    ),
    check(
      "technical_documents_status_check",
      sql`status in ('vigente', 'desactualizado', 'retirado')`,
    ),
    check(
      "technical_documents_storage_check",
      sql`storage_key is null or license = 'copia_autorizada'`,
    ),
  ],
);

export const technicalSpecifications = pgTable(
  "technical_specifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => componentVariants.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    valueText: text("value_text").notNull(),
    unit: text("unit"),
    tolerance: text("tolerance"),
    context: text("context"),
    sourceDocumentId: uuid("source_document_id").references(() => technicalDocuments.id, {
      onDelete: "restrict",
    }),
    validationStatus: text("validation_status").notNull().default("en_revision"),
    reviewedOn: date("reviewed_on", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_technical_specifications_variant_kind").on(t.variantId, t.kind),
    check(
      "technical_specifications_kind_check",
      sql`kind in ('torque', 'medida', 'aceite', 'volumen', 'presion', 'peso', 'otro')`,
    ),
    check(
      "technical_specifications_validation_check",
      sql`validation_status in ('verificado', 'condicionado', 'desactualizado', 'en_revision', 'sin_dato_verificado')`,
    ),
    check(
      "technical_specifications_source_check",
      sql`validation_status <> 'verificado' or source_document_id is not null`,
    ),
  ],
);

export const toolsConsumables = pgTable(
  "tools_consumables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    manufacturerId: uuid("manufacturer_id").references(() => manufacturers.id, {
      onDelete: "restrict",
    }),
    code: text("code"),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    category: text("category").notNull(),
    specification: text("specification"),
    usage: text("usage"),
    restrictions: text("restrictions"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_tools_consumables_category_name").on(t.category, t.name),
    check("tools_consumables_kind_check", sql`kind in ('herramienta', 'consumible')`),
    check(
      "tools_consumables_category_check",
      sql`category in ('transmision', 'frenos', 'suspension', 'ruedas', 'direccion', 'pedalier', 'electronica', 'herramientas')`,
    ),
  ],
);

export const libraryCatalogTables = [
  manufacturers,
  componentFamilies,
  componentModels,
  componentVariants,
  knowledgeSources,
  technicalDocuments,
  technicalSpecifications,
  toolsConsumables,
] as const;

export type Manufacturer = typeof manufacturers.$inferSelect;
export type ComponentModel = typeof componentModels.$inferSelect;
export type ComponentVariant = typeof componentVariants.$inferSelect;
export type TechnicalSpecification = typeof technicalSpecifications.$inferSelect;
export type TechnicalDocument = typeof technicalDocuments.$inferSelect;
