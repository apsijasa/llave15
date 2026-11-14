CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"cash_session_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_clp" integer NOT NULL,
	"reference_kind" text NOT NULL,
	"reference_id" uuid NOT NULL,
	"note" text,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_movements_kind_check" CHECK (kind in ('ingreso', 'egreso')),
	CONSTRAINT "cash_movements_amount_check" CHECK (amount_clp > 0),
	CONSTRAINT "cash_movements_reference_kind_check" CHECK (reference_kind in ('payment', 'expense', 'sale_refund', 'order_refund'))
);
--> statement-breakpoint
CREATE TABLE "cash_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"opened_by" uuid NOT NULL,
	"opening_cash_clp" integer NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"counted_cash_clp" integer,
	"expected_cash_clp" integer,
	"difference_clp" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_sessions_opening_cash_check" CHECK (opening_cash_clp >= 0),
	CONSTRAINT "cash_sessions_counted_cash_check" CHECK (counted_cash_clp is null or counted_cash_clp >= 0),
	CONSTRAINT "cash_sessions_closing_check" CHECK ((closed_at is null and closed_by is null and counted_cash_clp is null and expected_cash_clp is null and difference_clp is null)
        or (closed_at is not null and closed_by is not null and counted_cash_clp is not null and expected_cash_clp is not null and difference_clp is not null and difference_clp = counted_cash_clp - expected_cash_clp))
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"category" text NOT NULL,
	"amount_clp" integer NOT NULL,
	"expense_date" date NOT NULL,
	"description" text NOT NULL,
	"supplier_id" uuid,
	"method" text NOT NULL,
	"doc_type" text,
	"doc_number" text,
	"cash_session_id" uuid,
	"void_reason" text,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_category_check" CHECK (category in ('arriendo', 'sueldos', 'servicios', 'insumos', 'repuestos', 'otros')),
	CONSTRAINT "expenses_amount_check" CHECK (amount_clp > 0),
	CONSTRAINT "expenses_method_check" CHECK (method in ('efectivo', 'transferencia', 'tarjeta', 'otro')),
	CONSTRAINT "expenses_doc_type_check" CHECK (doc_type is null or doc_type in ('boleta', 'factura'))
);
--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "cash_control_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cash_movements_session_created" ON "cash_movements" USING btree ("cash_session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_cash_movements_reference" ON "cash_movements" USING btree ("reference_kind","reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cash_sessions_open" ON "cash_sessions" USING btree ("branch_id") WHERE closed_at is null;--> statement-breakpoint
CREATE INDEX "idx_cash_sessions_branch_opened" ON "cash_sessions" USING btree ("branch_id","opened_at");--> statement-breakpoint
CREATE INDEX "idx_expenses_branch_date" ON "expenses" USING btree ("branch_id","expense_date");