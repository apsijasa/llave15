ALTER TABLE "bookings" DROP CONSTRAINT "bookings_fee_check";--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_retiro_address_check";--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_fee_check" CHECK ((mode = 'taller' and pickup_fee_clp = 0) or (mode = 'retiro' and pickup_fee_clp >= 0));--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_retiro_address_check" CHECK (mode = 'taller' or (length(trim(comuna)) > 0 and address is not null));