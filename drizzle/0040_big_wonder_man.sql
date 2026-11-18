CREATE TABLE "booking_days" (
	"branch_id" uuid NOT NULL,
	"service_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_days_branch_id_service_date_pk" PRIMARY KEY("branch_id","service_date")
);
--> statement-breakpoint
ALTER TABLE "booking_days" ADD CONSTRAINT "booking_days_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;