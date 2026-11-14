ALTER TABLE "payments" ALTER COLUMN "work_order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "sale_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "fee_clp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "net_clp" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_payments_sale" ON "payments" USING btree ("sale_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_target_check" CHECK (num_nonnulls(work_order_id, sale_id) = 1);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_fee_check" CHECK (fee_clp >= 0 and fee_clp <= amount_clp);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_net_check" CHECK (net_clp is null or net_clp = amount_clp - fee_clp);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_mercadopago_check" CHECK (method <> 'mercadopago' or external_id is not null);