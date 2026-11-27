CREATE TABLE "purchase_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"status" text DEFAULT 'extraida' NOT NULL,
	"file_key" text,
	"file_type" text NOT NULL,
	"file_bytes" integer NOT NULL,
	"pages" integer,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"extraction" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_code" text,
	"purchase_order_id" uuid,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid,
	"discarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_imports_status_check" CHECK (status in ('extraida', 'confirmada', 'descartada', 'fallida')),
	CONSTRAINT "purchase_imports_file_type_check" CHECK (file_type in ('pdf', 'jpg')),
	CONSTRAINT "purchase_imports_file_check" CHECK ((file_key is null) = (status = 'fallida')),
	CONSTRAINT "purchase_imports_error_check" CHECK (status <> 'fallida' or error_code is not null),
	CONSTRAINT "purchase_imports_confirmed_check" CHECK ((status = 'confirmada') = (purchase_order_id is not null and confirmed_at is not null and confirmed_by is not null)),
	CONSTRAINT "purchase_imports_discarded_check" CHECK ((status = 'descartada') = (discarded_at is not null)),
	CONSTRAINT "purchase_imports_numbers_check" CHECK (file_bytes >= 0 and tokens_in >= 0 and tokens_out >= 0 and (pages is null or pages between 1 and 5))
);
--> statement-breakpoint
ALTER TABLE "purchase_imports" ADD CONSTRAINT "purchase_imports_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_imports" ADD CONSTRAINT "purchase_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_imports" ADD CONSTRAINT "purchase_imports_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_imports" ADD CONSTRAINT "purchase_imports_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_purchase_imports_branch_created" ON "purchase_imports" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_purchase_imports_purchase_order" ON "purchase_imports" USING btree ("purchase_order_id") WHERE purchase_order_id is not null;