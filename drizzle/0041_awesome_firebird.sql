DROP INDEX "uq_customers_rut";--> statement-breakpoint
DROP INDEX "uq_booking_blocks_active_slot";--> statement-breakpoint
DROP INDEX "uq_bookings_code";--> statement-breakpoint
DROP INDEX "uq_branches_name";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_customers_rut" ON "customers" USING btree ("branch_id","rut") WHERE rut is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_booking_blocks_active_slot" ON "booking_blocks" USING btree ("branch_id","service_date","block_start") WHERE is_active = true;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_bookings_code" ON "bookings" USING btree ("branch_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_branches_name" ON "branches" USING btree ("shop_id","name");