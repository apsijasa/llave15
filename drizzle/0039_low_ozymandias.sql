ALTER TABLE "booking_days" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "booking_days" CASCADE;--> statement-breakpoint
ALTER TABLE "blocked_periods" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_bikes" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_blocks" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_requests" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "branch_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ALTER COLUMN "shop_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ALTER COLUMN "branch_id" SET NOT NULL;