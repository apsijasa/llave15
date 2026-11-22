CREATE TABLE "demo_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"shop_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"city" text NOT NULL,
	"mechanics" text,
	"message" text,
	"consent_at" timestamp with time zone NOT NULL,
	"ip_hash" text,
	"status" text DEFAULT 'nueva' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_requests_status_check" CHECK (status in ('nueva', 'contactada', 'descartada')),
	CONSTRAINT "demo_requests_mechanics_check" CHECK (mechanics is null or mechanics in ('1', '2-3', '4+'))
);
--> statement-breakpoint
CREATE INDEX "idx_demo_requests_ip_created" ON "demo_requests" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "idx_demo_requests_created" ON "demo_requests" USING btree ("created_at");