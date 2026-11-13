CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"unit" text DEFAULT 'unidad' NOT NULL,
	"cost_clp" integer DEFAULT 0 NOT NULL,
	"price_clp" integer NOT NULL,
	"stock_qty" integer DEFAULT 0 NOT NULL,
	"min_stock" integer DEFAULT 0 NOT NULL,
	"barcode" text,
	"serial_number" text,
	"supplier_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_stock_qty_check" CHECK (stock_qty >= 0),
	CONSTRAINT "products_amounts_check" CHECK (cost_clp >= 0 and price_clp >= 0 and min_stock >= 0),
	CONSTRAINT "products_category_check" CHECK (category in ('repuesto', 'accesorio', 'insumo', 'bicicleta_usada')),
	CONSTRAINT "products_used_bike_serial_check" CHECK (category <> 'bicicleta_usada' or serial_number is not null)
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost_clp" integer NOT NULL,
	"received_qty" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_items_quantity_check" CHECK (quantity > 0),
	CONSTRAINT "purchase_order_items_unit_cost_check" CHECK (unit_cost_clp >= 0),
	CONSTRAINT "purchase_order_items_received_qty_check" CHECK (received_qty between 0 and quantity)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" text DEFAULT 'borrador' NOT NULL,
	"doc_type" text,
	"doc_number" text,
	"notes" text,
	"received_at" timestamp with time zone,
	"received_by" uuid,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_number_check" CHECK (number >= 1),
	CONSTRAINT "purchase_orders_status_check" CHECK (status in ('borrador', 'enviada', 'recibida', 'anulada')),
	CONSTRAINT "purchase_orders_doc_type_check" CHECK (doc_type is null or doc_type in ('factura', 'boleta', 'guia')),
	CONSTRAINT "purchase_orders_received_check" CHECK (status <> 'recibida' or (received_at is not null and received_by is not null)),
	CONSTRAINT "purchase_orders_voided_check" CHECK ((status = 'anulada') = (voided_at is not null))
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost_clp" integer,
	"reference_kind" text,
	"reference_id" uuid,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_kind_check" CHECK (kind in ('compra', 'venta', 'consumo_orden', 'ajuste', 'devolucion', 'anulacion')),
	CONSTRAINT "stock_movements_quantity_check" CHECK (quantity <> 0),
	CONSTRAINT "stock_movements_sign_check" CHECK ((kind in ('compra', 'devolucion') and quantity > 0) or (kind in ('venta', 'consumo_orden') and quantity < 0) or kind in ('ajuste', 'anulacion')),
	CONSTRAINT "stock_movements_unit_cost_check" CHECK (unit_cost_clp is null or unit_cost_clp >= 0),
	CONSTRAINT "stock_movements_reference_kind_check" CHECK (reference_kind is null or reference_kind in ('purchase_order', 'work_order_item', 'sale', 'sale_refund', 'import')),
	CONSTRAINT "stock_movements_reference_check" CHECK ((reference_kind is null) = (reference_id is null)),
	CONSTRAINT "stock_movements_adjustment_note_check" CHECK (kind <> 'ajuste' or note is not null)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rut" text,
	"phone" text,
	"email" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_order_items" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "work_order_items" ADD COLUMN "unit_cost_clp" integer;--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "pricing_mode" text DEFAULT 'final' NOT NULL;--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "subtotal_clp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "vat_clp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "next_purchase_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "new_order_pricing_mode" text DEFAULT 'final' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_products_branch_sku" ON "products" USING btree ("branch_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_products_branch_barcode" ON "products" USING btree ("branch_id","barcode") WHERE barcode is not null;--> statement-breakpoint
CREATE INDEX "idx_products_branch_category" ON "products" USING btree ("branch_id","category");--> statement-breakpoint
CREATE INDEX "idx_purchase_order_items_order" ON "purchase_order_items" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_purchase_orders_branch_number" ON "purchase_orders" USING btree ("branch_id","number");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_product_created" ON "stock_movements" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_suppliers_branch_rut" ON "suppliers" USING btree ("branch_id","rut") WHERE rut is not null;--> statement-breakpoint
CREATE INDEX "idx_suppliers_branch_name" ON "suppliers" USING btree ("branch_id","name");--> statement-breakpoint
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_unit_cost_check" CHECK (unit_cost_clp is null or unit_cost_clp >= 0);--> statement-breakpoint
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_product_check" CHECK (product_id is null or (kind = 'repuesto' and unit_cost_clp is not null));--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_pricing_mode_check" CHECK (pricing_mode in ('final', 'neto'));--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_pricing_amounts_check" CHECK (subtotal_clp >= 0 and vat_clp >= 0);--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_pricing_total_check" CHECK (pricing_mode = 'final' or total_clp = subtotal_clp + vat_clp);--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_next_purchase_number_check" CHECK (next_purchase_number >= 1);--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_new_order_pricing_mode_check" CHECK (new_order_pricing_mode in ('final', 'neto'));