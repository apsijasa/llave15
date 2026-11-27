ALTER TABLE "work_orders" DROP CONSTRAINT "work_orders_status_check";--> statement-breakpoint
ALTER TABLE "work_orders" DROP CONSTRAINT "work_orders_delivered_paid_check";--> statement-breakpoint
ALTER TABLE "work_orders" DROP CONSTRAINT "work_orders_qc_check";--> statement-breakpoint
ALTER TABLE "work_orders" ALTER COLUMN "status" SET DEFAULT 'creado';--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_status_check" CHECK (status in ('creado', 'en_progreso', 'en_pausa', 'pagado', 'reservada', 'recibida', 'diagnostico', 'esperando_aprobacion', 'esperando_repuesto', 'en_reparacion', 'control_calidad', 'lista_para_retirar', 'entregada', 'cancelada', 'trabajo_rechazado'));--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_delivered_paid_check" CHECK (status not in ('pagado', 'entregada') or paid_clp = total_clp);--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_qc_check" CHECK (status not in ('lista_para_retirar', 'pagado', 'entregada') or qc_approved_at is not null);