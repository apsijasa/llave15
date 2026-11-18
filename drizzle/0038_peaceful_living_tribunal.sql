CREATE TABLE "shops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"rut" text,
	"email" text NOT NULL,
	"notify_email" text NOT NULL,
	"phone" text NOT NULL,
	"phone_display" text NOT NULL,
	"street_address" text NOT NULL,
	"address_short" text NOT NULL,
	"locality" text NOT NULL,
	"region" text NOT NULL,
	"maps_url" text,
	"instagram_url" text,
	"logo_key" text,
	"certifications" text[] DEFAULT '{}'::text[] NOT NULL,
	"timezone" text DEFAULT 'America/Santiago' NOT NULL,
	"reception_hours" jsonb NOT NULL,
	"pickup_hours" jsonb NOT NULL,
	"daily_capacity" integer NOT NULL,
	"block_minutes" integer NOT NULL,
	"min_notice_minutes" integer NOT NULL,
	"horizon_days" integer NOT NULL,
	"pickup_enabled" boolean DEFAULT false NOT NULL,
	"pickup_fee_clp" integer DEFAULT 0 NOT NULL,
	"pickup_comunas" text[] DEFAULT '{}'::text[] NOT NULL,
	"code_prefix" text NOT NULL,
	"status" text DEFAULT 'activo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shops_status_check" CHECK (status in ('activo', 'suspendido')),
	CONSTRAINT "shops_slug_check" CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 40),
	CONSTRAINT "shops_capacity_check" CHECK (daily_capacity between 1 and 20),
	CONSTRAINT "shops_block_minutes_check" CHECK (block_minutes in (15, 20, 30, 45, 60)),
	CONSTRAINT "shops_notice_check" CHECK (min_notice_minutes between 0 and 10080),
	CONSTRAINT "shops_horizon_check" CHECK (horizon_days between 1 and 120),
	CONSTRAINT "shops_pickup_fee_check" CHECK (pickup_fee_clp >= 0),
	CONSTRAINT "shops_pickup_check" CHECK (not pickup_enabled or cardinality(pickup_comunas) > 0),
	CONSTRAINT "shops_code_prefix_check" CHECK (code_prefix ~ '^[A-Z]{2,4}$'),
	CONSTRAINT "shops_timezone_check" CHECK (timezone = 'America/Santiago')
);
--> statement-breakpoint
ALTER TABLE "blocked_periods" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "booking_bikes" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "booking_blocks" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "booking_days" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "shop_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_platform_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_shops_slug" ON "shops" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_shops_code_prefix" ON "shops" USING btree ("code_prefix");--> statement-breakpoint
ALTER TABLE "blocked_periods" ADD CONSTRAINT "blocked_periods_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_bikes" ADD CONSTRAINT "booking_bikes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_blocks" ADD CONSTRAINT "booking_blocks_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_days" ADD CONSTRAINT "booking_days_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_blocked_periods_branch_service_date" ON "blocked_periods" USING btree ("branch_id","service_date");--> statement-breakpoint
CREATE INDEX "idx_booking_blocks_branch_service_date" ON "booking_blocks" USING btree ("branch_id","service_date");--> statement-breakpoint
CREATE INDEX "idx_booking_requests_branch_ip_created" ON "booking_requests" USING btree ("branch_id","ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "idx_bookings_branch_service_date" ON "bookings" USING btree ("branch_id","service_date");