CREATE TABLE "order_whatsapp_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"meta_message_id" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_whatsapp_notices_type_check" CHECK (type in ('ready')),
	CONSTRAINT "order_whatsapp_notices_status_check" CHECK (status in ('pending','sending','sent','failed','unknown'))
);
--> statement-breakpoint
ALTER TABLE "order_whatsapp_notices" ADD CONSTRAINT "order_whatsapp_notices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_whatsapp_notices" ADD CONSTRAINT "order_whatsapp_notices_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_order_whatsapp_notices_order_type" ON "order_whatsapp_notices" USING btree ("work_order_id","type");