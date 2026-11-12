CREATE TABLE "order_tracking_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_tracking_tokens" ADD CONSTRAINT "order_tracking_tokens_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_tracking_tokens" ADD CONSTRAINT "order_tracking_tokens_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_order_tracking_tokens_order" ON "order_tracking_tokens" USING btree ("work_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_order_tracking_tokens_hash" ON "order_tracking_tokens" USING btree ("token_hash");