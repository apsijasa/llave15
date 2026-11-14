ALTER TABLE "payments" ADD COLUMN "cash_session_id" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "cash_session_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_payments_cash_session" ON "payments" USING btree ("cash_session_id");--> statement-breakpoint
CREATE INDEX "idx_sales_cash_session" ON "sales" USING btree ("cash_session_id");