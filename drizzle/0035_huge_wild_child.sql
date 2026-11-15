CREATE TABLE "component_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manufacturer_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "component_families_category_check" CHECK (category in ('transmision', 'frenos', 'suspension', 'ruedas', 'direccion', 'pedalier', 'electronica', 'herramientas'))
);
--> statement-breakpoint
CREATE TABLE "component_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"component_type" text NOT NULL,
	"generation" text,
	"speeds" integer,
	"status" text DEFAULT 'vigente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "component_models_status_check" CHECK (status in ('vigente', 'descontinuado', 'en_revision')),
	CONSTRAINT "component_models_speeds_check" CHECK (speeds is null or speeds between 1 and 14)
);
--> statement-breakpoint
CREATE TABLE "component_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"code" text NOT NULL,
	"revision" text DEFAULT '' NOT NULL,
	"year_from" integer,
	"year_to" integer,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'vigente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "component_variants_status_check" CHECK (status in ('vigente', 'descontinuado', 'en_revision')),
	CONSTRAINT "component_variants_years_check" CHECK (year_to is null or year_from is null or year_to >= year_from)
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"published_on" date,
	"reviewed_on" date,
	"authority" text NOT NULL,
	"usage_policy" text DEFAULT 'enlace' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_sources_authority_check" CHECK (authority in ('oficial', 'comunidad_verificada', 'comunidad', 'historico')),
	CONSTRAINT "knowledge_sources_usage_policy_check" CHECK (usage_policy in ('enlace', 'extracto_permitido', 'copia_autorizada'))
);
--> statement-breakpoint
CREATE TABLE "manufacturers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"official_site_url" text,
	"status" text DEFAULT 'activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manufacturers_status_check" CHECK (status in ('activo', 'inactivo'))
);
--> statement-breakpoint
CREATE TABLE "technical_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"manufacturer_id" uuid,
	"source_id" uuid,
	"canonical_url" text NOT NULL,
	"license" text DEFAULT 'enlace' NOT NULL,
	"doc_type" text NOT NULL,
	"language" text DEFAULT 'es' NOT NULL,
	"variant_id" uuid,
	"revision" text DEFAULT '' NOT NULL,
	"checksum" text,
	"storage_key" text,
	"status" text DEFAULT 'vigente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "technical_documents_license_check" CHECK (license in ('enlace', 'extracto_permitido', 'copia_autorizada')),
	CONSTRAINT "technical_documents_doc_type_check" CHECK (doc_type in ('manual', 'despiece', 'boletin', 'guia', 'otro')),
	CONSTRAINT "technical_documents_status_check" CHECK (status in ('vigente', 'desactualizado', 'retirado')),
	CONSTRAINT "technical_documents_storage_check" CHECK (storage_key is null or license = 'copia_autorizada')
);
--> statement-breakpoint
CREATE TABLE "technical_specifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"value_text" text NOT NULL,
	"unit" text,
	"tolerance" text,
	"context" text,
	"source_document_id" uuid,
	"validation_status" text DEFAULT 'en_revision' NOT NULL,
	"reviewed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "technical_specifications_kind_check" CHECK (kind in ('torque', 'medida', 'aceite', 'volumen', 'presion', 'peso', 'otro')),
	CONSTRAINT "technical_specifications_validation_check" CHECK (validation_status in ('verificado', 'condicionado', 'desactualizado', 'en_revision', 'sin_dato_verificado')),
	CONSTRAINT "technical_specifications_source_check" CHECK (validation_status <> 'verificado' or source_document_id is not null)
);
--> statement-breakpoint
CREATE TABLE "tools_consumables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manufacturer_id" uuid,
	"code" text,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"specification" text,
	"usage" text,
	"restrictions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tools_consumables_kind_check" CHECK (kind in ('herramienta', 'consumible')),
	CONSTRAINT "tools_consumables_category_check" CHECK (category in ('transmision', 'frenos', 'suspension', 'ruedas', 'direccion', 'pedalier', 'electronica', 'herramientas'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "library_curator" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "component_families" ADD CONSTRAINT "component_families_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_models" ADD CONSTRAINT "component_models_family_id_component_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."component_families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_variants" ADD CONSTRAINT "component_variants_model_id_component_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."component_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_documents" ADD CONSTRAINT "technical_documents_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_documents" ADD CONSTRAINT "technical_documents_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_documents" ADD CONSTRAINT "technical_documents_variant_id_component_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."component_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_specifications" ADD CONSTRAINT "technical_specifications_variant_id_component_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."component_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_specifications" ADD CONSTRAINT "technical_specifications_source_document_id_technical_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."technical_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools_consumables" ADD CONSTRAINT "tools_consumables_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_component_families_manufacturer_slug" ON "component_families" USING btree ("manufacturer_id","slug");--> statement-breakpoint
CREATE INDEX "idx_component_families_category" ON "component_families" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_component_models_family_code" ON "component_models" USING btree ("family_id","code");--> statement-breakpoint
CREATE INDEX "idx_component_models_code" ON "component_models" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_component_variants_model_code_revision" ON "component_variants" USING btree ("model_id","code","revision");--> statement-breakpoint
CREATE INDEX "idx_component_variants_code" ON "component_variants" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_knowledge_sources_url" ON "knowledge_sources" USING btree ("url");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_manufacturers_slug" ON "manufacturers" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_technical_documents_url_revision" ON "technical_documents" USING btree ("canonical_url","revision");--> statement-breakpoint
CREATE INDEX "idx_technical_documents_variant" ON "technical_documents" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "idx_technical_specifications_variant_kind" ON "technical_specifications" USING btree ("variant_id","kind");--> statement-breakpoint
CREATE INDEX "idx_tools_consumables_category_name" ON "tools_consumables" USING btree ("category","name");