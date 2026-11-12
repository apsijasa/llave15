ALTER TABLE "service_reports" ADD COLUMN "next_maintenance_date" date;--> statement-breakpoint
ALTER TABLE "service_reports" ADD COLUMN "next_maintenance_note" text;--> statement-breakpoint
ALTER TABLE "service_reports" ADD COLUMN "maintenance_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_service_reports_maintenance" ON "service_reports" USING btree ("next_maintenance_date","maintenance_reminder_sent_at");