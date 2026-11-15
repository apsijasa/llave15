CREATE TABLE "article_variant_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"content_md" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"reviewed_by" uuid,
	"published_at" timestamp with time zone,
	"valid_from" date,
	"valid_until" date,
	"supersedes_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_versions_number_check" CHECK (number >= 1)
);
--> statement-breakpoint
CREATE TABLE "diagnostic_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"symptom" text NOT NULL,
	"prerequisites" text,
	"tests_md" text NOT NULL,
	"causes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions_md" text NOT NULL,
	"valid_from" date,
	"valid_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_chunks_source_kind_check" CHECK (source_kind in ('article_version', 'document', 'specification', 'procedure')),
	CONSTRAINT "document_chunks_scope_check" CHECK (scope in ('global'))
);
--> statement-breakpoint
CREATE TABLE "knowledge_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"topic" text,
	"language" text DEFAULT 'es' NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'borrador' NOT NULL,
	"current_version_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_articles_category_check" CHECK (category in ('transmision', 'frenos', 'suspension', 'ruedas', 'direccion', 'pedalier', 'electronica', 'herramientas')),
	CONSTRAINT "knowledge_articles_kind_check" CHECK (kind in ('articulo', 'procedimiento', 'diagnostico', 'compatibilidad')),
	CONSTRAINT "knowledge_articles_status_check" CHECK (status in ('borrador', 'publicado', 'archivado'))
);
--> statement-breakpoint
CREATE TABLE "ai_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"work_order_id" uuid,
	"question" text NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"confidence" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider" text NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"prompt_version" text NOT NULL,
	"status" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_interactions_scope_check" CHECK (scope in ('biblioteca', 'orden')),
	CONSTRAINT "ai_interactions_confidence_check" CHECK (confidence in ('alta', 'media', 'baja', 'no_verificada')),
	CONSTRAINT "ai_interactions_status_check" CHECK (status in ('respondida', 'sin_evidencia', 'error', 'cuota')),
	CONSTRAINT "ai_interactions_order_check" CHECK (scope <> 'orden' or work_order_id is not null)
);
--> statement-breakpoint
CREATE TABLE "knowledge_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"content_md" text NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"target_article_id" uuid,
	"target_variant_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"published_version_id" uuid,
	"pii_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_proposals_kind_check" CHECK (kind in ('articulo', 'procedimiento', 'diagnostico', 'compatibilidad', 'especificacion', 'correccion')),
	CONSTRAINT "knowledge_proposals_status_check" CHECK (status in ('draft', 'submitted', 'needs_changes', 'in_review', 'approved', 'rejected', 'published', 'withdrawn')),
	CONSTRAINT "knowledge_proposals_published_check" CHECK ((status = 'published') = (published_version_id is not null))
);
--> statement-breakpoint
CREATE TABLE "private_technical_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"bike_id" uuid,
	"work_order_id" uuid,
	"content_md" text NOT NULL,
	"scope" text DEFAULT 'taller' NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_technical_notes_scope_check" CHECK (scope in ('personal', 'taller'))
);
--> statement-breakpoint
CREATE TABLE "proposal_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_reviews_decision_check" CHECK (decision in ('in_review', 'needs_changes', 'approved', 'rejected', 'published'))
);
--> statement-breakpoint
CREATE TABLE "publication_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"version_id" uuid,
	"operation" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"justification" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_events_operation_check" CHECK (operation in ('publish', 'archive', 'rollback', 'import'))
);
--> statement-breakpoint
CREATE TABLE "technical_diagnoses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"bike_id" uuid NOT NULL,
	"symptoms" text NOT NULL,
	"inspections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hypotheses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result" text,
	"status" text DEFAULT 'borrador' NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_interaction_id" uuid,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "technical_diagnoses_status_check" CHECK (status in ('borrador', 'confirmado')),
	CONSTRAINT "technical_diagnoses_confirmed_check" CHECK ((status = 'confirmado') = (confirmed_at is not null))
);
--> statement-breakpoint
CREATE TABLE "compatibility_rule_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compatibility_rule_members_role_check" CHECK (role in ('shifter', 'cambio', 'cassette', 'cadena', 'plato', 'nucleo', 'freno', 'disco', 'otro'))
);
--> statement-breakpoint
CREATE TABLE "compatibility_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid,
	"relation" text NOT NULL,
	"conditions" text,
	"restrictions" text,
	"evidence" text NOT NULL,
	"source_document_id" uuid,
	"certainty" text NOT NULL,
	"reviewed_on" date,
	"status" text DEFAULT 'vigente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compatibility_rules_relation_check" CHECK (relation in ('oficial_confirmada', 'condicionada', 'incompatible', 'no_verificada')),
	CONSTRAINT "compatibility_rules_certainty_check" CHECK (certainty in ('alta', 'media', 'baja')),
	CONSTRAINT "compatibility_rules_status_check" CHECK (status in ('vigente', 'archivada')),
	CONSTRAINT "compatibility_rules_source_check" CHECK (relation <> 'oficial_confirmada' or source_document_id is not null)
);
--> statement-breakpoint
CREATE TABLE "procedure_specs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"procedure_id" uuid NOT NULL,
	"specification_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procedure_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"procedure_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"action" text NOT NULL,
	"tools" text,
	"consumables" text,
	"verification" text,
	"warning" text,
	"image_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procedure_steps_sequence_check" CHECK (sequence >= 1)
);
--> statement-breakpoint
CREATE TABLE "procedures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"risk" text NOT NULL,
	"duration_minutes" integer,
	"prerequisites" text,
	"final_checks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procedures_kind_check" CHECK (kind in ('montaje', 'ajuste', 'mantenimiento', 'diagnostico', 'reparacion')),
	CONSTRAINT "procedures_risk_check" CHECK (risk in ('bajo', 'medio', 'alto', 'critico')),
	CONSTRAINT "procedures_duration_check" CHECK (duration_minutes is null or duration_minutes > 0)
);
--> statement-breakpoint
ALTER TABLE "article_variant_links" ADD CONSTRAINT "article_variant_links_version_id_article_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."article_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_variant_links" ADD CONSTRAINT "article_variant_links_variant_id_component_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."component_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_article_id_knowledge_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."knowledge_articles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_supersedes_version_id_article_versions_id_fk" FOREIGN KEY ("supersedes_version_id") REFERENCES "public"."article_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_rules" ADD CONSTRAINT "diagnostic_rules_version_id_article_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."article_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_current_version_id_article_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."article_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_proposals" ADD CONSTRAINT "knowledge_proposals_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_proposals" ADD CONSTRAINT "knowledge_proposals_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_proposals" ADD CONSTRAINT "knowledge_proposals_target_article_id_knowledge_articles_id_fk" FOREIGN KEY ("target_article_id") REFERENCES "public"."knowledge_articles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_proposals" ADD CONSTRAINT "knowledge_proposals_target_variant_id_component_variants_id_fk" FOREIGN KEY ("target_variant_id") REFERENCES "public"."component_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_proposals" ADD CONSTRAINT "knowledge_proposals_published_version_id_article_versions_id_fk" FOREIGN KEY ("published_version_id") REFERENCES "public"."article_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_technical_notes" ADD CONSTRAINT "private_technical_notes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_technical_notes" ADD CONSTRAINT "private_technical_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_technical_notes" ADD CONSTRAINT "private_technical_notes_bike_id_bikes_id_fk" FOREIGN KEY ("bike_id") REFERENCES "public"."bikes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_technical_notes" ADD CONSTRAINT "private_technical_notes_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_technical_notes" ADD CONSTRAINT "private_technical_notes_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_reviews" ADD CONSTRAINT "proposal_reviews_proposal_id_knowledge_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."knowledge_proposals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_reviews" ADD CONSTRAINT "proposal_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_events" ADD CONSTRAINT "publication_events_article_id_knowledge_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."knowledge_articles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_events" ADD CONSTRAINT "publication_events_version_id_article_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."article_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_events" ADD CONSTRAINT "publication_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_diagnoses" ADD CONSTRAINT "technical_diagnoses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_diagnoses" ADD CONSTRAINT "technical_diagnoses_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_diagnoses" ADD CONSTRAINT "technical_diagnoses_bike_id_bikes_id_fk" FOREIGN KEY ("bike_id") REFERENCES "public"."bikes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_diagnoses" ADD CONSTRAINT "technical_diagnoses_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_diagnoses" ADD CONSTRAINT "technical_diagnoses_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_diagnoses" ADD CONSTRAINT "technical_diagnoses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compatibility_rule_members" ADD CONSTRAINT "compatibility_rule_members_rule_id_compatibility_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."compatibility_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compatibility_rule_members" ADD CONSTRAINT "compatibility_rule_members_variant_id_component_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."component_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compatibility_rules" ADD CONSTRAINT "compatibility_rules_version_id_article_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."article_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compatibility_rules" ADD CONSTRAINT "compatibility_rules_source_document_id_technical_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."technical_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_specs" ADD CONSTRAINT "procedure_specs_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_specs" ADD CONSTRAINT "procedure_specs_specification_id_technical_specifications_id_fk" FOREIGN KEY ("specification_id") REFERENCES "public"."technical_specifications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_steps" ADD CONSTRAINT "procedure_steps_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_version_id_article_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."article_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_article_variant_links_version_variant" ON "article_variant_links" USING btree ("version_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_article_versions_article_number" ON "article_versions" USING btree ("article_id","number");--> statement-breakpoint
CREATE INDEX "idx_diagnostic_rules_version" ON "diagnostic_rules" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_document_chunks_source" ON "document_chunks" USING btree ("source_kind","source_id","chunk_index");--> statement-breakpoint
CREATE INDEX "idx_document_chunks_fts" ON "document_chunks" USING gin (to_tsvector('spanish', "text"));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_knowledge_articles_slug" ON "knowledge_articles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_knowledge_articles_category_status" ON "knowledge_articles" USING btree ("category","status");--> statement-breakpoint
CREATE INDEX "idx_ai_interactions_branch_created" ON "ai_interactions" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_interactions_user_created" ON "ai_interactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_knowledge_proposals_branch_status" ON "knowledge_proposals" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "idx_knowledge_proposals_status_submitted" ON "knowledge_proposals" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "idx_private_technical_notes_branch_created" ON "private_technical_notes" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_proposal_reviews_proposal" ON "proposal_reviews" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "idx_publication_events_article" ON "publication_events" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "idx_technical_diagnoses_order_created" ON "technical_diagnoses" USING btree ("work_order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_compatibility_rule_members_rule_variant" ON "compatibility_rule_members" USING btree ("rule_id","variant_id");--> statement-breakpoint
CREATE INDEX "idx_compatibility_rule_members_variant" ON "compatibility_rule_members" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_procedure_specs_pair" ON "procedure_specs" USING btree ("procedure_id","specification_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_procedure_steps_procedure_sequence" ON "procedure_steps" USING btree ("procedure_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_procedures_version" ON "procedures" USING btree ("version_id");