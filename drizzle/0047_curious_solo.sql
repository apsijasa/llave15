CREATE TABLE "cost_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"rent_clp" integer DEFAULT 0 NOT NULL,
	"utilities_clp" integer DEFAULT 0 NOT NULL,
	"wages_clp" integer DEFAULT 0 NOT NULL,
	"taxes_clp" integer DEFAULT 0 NOT NULL,
	"other_clp" integer DEFAULT 0 NOT NULL,
	"supplies_clp" integer DEFAULT 0 NOT NULL,
	"billable_hours_month" integer DEFAULT 0 NOT NULL,
	"target_margin_pct" integer DEFAULT 30 NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_profiles_amounts_check" CHECK (rent_clp >= 0 and utilities_clp >= 0 and wages_clp >= 0 and taxes_clp >= 0 and other_clp >= 0 and supplies_clp >= 0),
	CONSTRAINT "cost_profiles_hours_check" CHECK (billable_hours_month between 0 and 744),
	CONSTRAINT "cost_profiles_margin_check" CHECK (target_margin_pct between 0 and 90)
);
--> statement-breakpoint
ALTER TABLE "cost_profiles" ADD CONSTRAINT "cost_profiles_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_profiles" ADD CONSTRAINT "cost_profiles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cost_profiles_branch" ON "cost_profiles" USING btree ("branch_id");