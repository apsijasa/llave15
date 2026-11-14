CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_clp" integer NOT NULL,
	"unit_cost_clp" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_items_quantity_check" CHECK (quantity > 0),
	CONSTRAINT "sale_items_amounts_check" CHECK (unit_price_clp >= 0 and unit_cost_clp >= 0)
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"customer_id" uuid,
	"status" text DEFAULT 'abierta' NOT NULL,
	"subtotal_clp" integer NOT NULL,
	"discount_clp" integer DEFAULT 0 NOT NULL,
	"discount_reason" text,
	"vat_clp" integer NOT NULL,
	"total_clp" integer NOT NULL,
	"paid_clp" integer DEFAULT 0 NOT NULL,
	"doc_type" text,
	"doc_number" text,
	"void_reason" text,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_number_check" CHECK (number >= 1),
	CONSTRAINT "sales_status_check" CHECK (status in ('abierta', 'pagada', 'anulada')),
	CONSTRAINT "sales_amounts_check" CHECK (subtotal_clp >= 0 and discount_clp >= 0 and vat_clp >= 0 and total_clp >= 0 and paid_clp >= 0),
	CONSTRAINT "sales_total_check" CHECK (total_clp = subtotal_clp + vat_clp),
	CONSTRAINT "sales_paid_check" CHECK (status <> 'pagada' or paid_clp = total_clp),
	CONSTRAINT "sales_discount_check" CHECK (discount_clp = 0 or discount_reason is not null),
	CONSTRAINT "sales_doc_type_check" CHECK (doc_type is null or doc_type in ('boleta', 'factura')),
	CONSTRAINT "sales_voided_check" CHECK ((status = 'anulada') = (voided_at is not null))
);
--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "next_sale_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sale_items_sale" ON "sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sales_branch_number" ON "sales" USING btree ("branch_id","number");--> statement-breakpoint
CREATE INDEX "idx_sales_branch_created" ON "sales" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_sales_customer" ON "sales" USING btree ("customer_id");--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_next_sale_number_check" CHECK (next_sale_number >= 1);