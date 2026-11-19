import { and, asc, eq, gt, gte, isNotNull, isNull, lte, notExists } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DateTime } from "luxon";
import { z } from "zod";
import { getEmailEnv, getSiteEnv } from "../../lib/env.ts";
import { log } from "../../lib/log.ts";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import { TIMEZONE } from "../booking/rules.ts";
import { addDays, localToday } from "../booking/slots.ts";
import type { AppDb } from "../db/client.ts";
import { workOrders } from "../db/schema-orders.ts";
import { serviceReports } from "../db/schema-reports.ts";
import { bikes, customers } from "../db/schema-taller.ts";
import { emailBrand, senderFor } from "../email/brand.ts";
import { maintenanceReminderEmail } from "../email/order-templates.ts";
import { createTransport } from "../email/transport.ts";
import type { EmailTransport } from "../email/transport.ts";
import { profileForBranch } from "../shops/profile.ts";
import type { ShopProfile } from "../shops/profile.ts";
import { recordAudit } from "./audit.ts";
import { formatOrderNumber } from "./orders.ts";
import {
  MAINTENANCE_INTERVAL_MONTHS,
  MAINTENANCE_REMINDER_DAYS_BEFORE,
  MAINTENANCE_REMINDER_GRACE_DAYS,
} from "./rules.ts";
import { hashShareToken, shareTokenSchema } from "./share-tokens.ts";

export const maintenancePlanSchema = z.object({
  nextMaintenanceDate: z.iso.date().nullable(),
  nextMaintenanceNote: z.string().trim().max(300),
});
type MaintenancePlan = z.infer<typeof maintenancePlanSchema>;
type PlanResult =
  | { ok: true }
  | { ok: false; code: "forbidden" | "not_found" | "validation_error" };

/**
 * Valida la forma y que la fecha no sea anterior a hoy. La página la usa antes de generar el informe:
 * regenerarlo invalida el enlace anterior, así que un plan inválido no debe llegar a ese punto.
 */
export function parseMaintenancePlan(
  input: unknown,
  now: Date,
): { success: true; data: MaintenancePlan } | { success: false; fields: string[] } {
  const parsed = maintenancePlanSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, fields: parsed.error.issues.map((issue) => String(issue.path[0])) };
  const { nextMaintenanceDate } = parsed.data;
  if (nextMaintenanceDate !== null && nextMaintenanceDate < localToday(now))
    return { success: false, fields: ["nextMaintenanceDate"] };
  return { success: true, data: parsed.data };
}

export function suggestedMaintenanceDate(now: Date): string {
  return DateTime.fromISO(localToday(now), { zone: TIMEZONE })
    .plus({ months: MAINTENANCE_INTERVAL_MONTHS })
    .toFormat("yyyy-MM-dd");
}

function reportFilter(actor: SessionUser, orderId: string) {
  return and(eq(serviceReports.branchId, actor.branchId), eq(serviceReports.workOrderId, orderId));
}

async function savePlan(
  db: AppDb,
  actor: SessionUser,
  report: typeof serviceReports.$inferSelect,
  input: MaintenancePlan,
  now: Date,
) {
  await db
    .update(serviceReports)
    .set({
      ...input,
      updatedAt: now,
      ...(report.nextMaintenanceDate !== input.nextMaintenanceDate
        ? { maintenanceReminderSentAt: null }
        : {}),
    })
    .where(reportFilter(actor, report.workOrderId));
  await recordAudit(
    db,
    {
      branchId: actor.branchId,
      actorUserId: actor.id,
      action: "report.maintenance_planned",
      entity: "service_reports",
      entityId: report.id,
      details: { nextMaintenanceDate: input.nextMaintenanceDate },
    },
    now,
  );
}

export async function setMaintenancePlan(
  db: AppDb,
  actor: SessionUser,
  orderId: string,
  input: unknown,
  now: Date,
): Promise<PlanResult> {
  if (!can(actor.role, "reports.generate")) return { ok: false, code: "forbidden" };
  const parsed = parseMaintenancePlan(input, now);
  if (!parsed.success) return { ok: false, code: "validation_error" };
  if (!z.uuid().safeParse(orderId).success) return { ok: false, code: "not_found" };
  return db.transaction(async (tx) => {
    const filter = reportFilter(actor, orderId);
    const [report] = await tx.select().from(serviceReports).where(filter).for("update");
    if (!report) return { ok: false, code: "not_found" };
    await savePlan(tx, actor, report, parsed.data, now);
    return { ok: true };
  });
}

export async function getMaintenancePlan(
  db: AppDb,
  actor: SessionUser,
  orderId: string,
): Promise<MaintenancePlan | null> {
  if (!can(actor.role, "reports.generate") || !z.uuid().safeParse(orderId).success) return null;
  const [report] = await db
    .select({
      nextMaintenanceDate: serviceReports.nextMaintenanceDate,
      nextMaintenanceNote: serviceReports.nextMaintenanceNote,
    })
    .from(serviceReports)
    .where(reportFilter(actor, orderId));
  return report ? { ...report, nextMaintenanceNote: report.nextMaintenanceNote ?? "" } : null;
}

export async function maintenancePlanByToken(
  db: AppDb,
  token: string,
): Promise<{ nextMaintenanceDate: string; nextMaintenanceNote: string } | null> {
  const parsed = shareTokenSchema.safeParse(token);
  if (!parsed.success) return null;
  // Lectura pública: el token determina el informe y su sucursal, sin sesión.
  const [report] = await db
    .select({
      nextMaintenanceDate: serviceReports.nextMaintenanceDate,
      nextMaintenanceNote: serviceReports.nextMaintenanceNote,
    })
    .from(serviceReports)
    .where(eq(serviceReports.shareTokenHash, hashShareToken(parsed.data)));
  if (!report?.nextMaintenanceDate) return null;
  return {
    nextMaintenanceDate: report.nextMaintenanceDate,
    nextMaintenanceNote: report.nextMaintenanceNote ?? "",
  };
}

function laterOrdersForBike(db: AppDb) {
  const later = alias(workOrders, "later_order");
  return db
    .select({ id: later.id })
    .from(later)
    .where(
      and(
        eq(later.branchId, workOrders.branchId),
        eq(later.bikeId, workOrders.bikeId),
        gt(later.createdAt, workOrders.createdAt),
        isNull(later.voidedAt),
      ),
    );
}

function pendingMaintenanceFilter(db: AppDb, now: Date) {
  const today = localToday(now);
  return and(
    gte(serviceReports.nextMaintenanceDate, addDays(today, -MAINTENANCE_REMINDER_GRACE_DAYS)),
    lte(serviceReports.nextMaintenanceDate, addDays(today, MAINTENANCE_REMINDER_DAYS_BEFORE)),
    isNull(serviceReports.maintenanceReminderSentAt),
    isNull(workOrders.voidedAt),
    isNotNull(customers.email),
    notExists(laterOrdersForBike(db)),
  );
}

/** Tarea global: cada informe determina la sucursal de todas sus relaciones. */
export async function dueMaintenanceReminders(db: AppDb, now: Date) {
  return db
    .select({
      reportId: serviceReports.id,
      branchId: serviceReports.branchId,
      orderId: workOrders.id,
      number: workOrders.number,
      customerName: customers.name,
      email: customers.email,
      brand: bikes.brand,
      model: bikes.model,
      nextMaintenanceDate: serviceReports.nextMaintenanceDate,
      note: serviceReports.nextMaintenanceNote,
    })
    .from(serviceReports)
    .innerJoin(
      workOrders,
      and(
        eq(workOrders.id, serviceReports.workOrderId),
        eq(workOrders.branchId, serviceReports.branchId),
      ),
    )
    .innerJoin(
      customers,
      and(eq(customers.id, workOrders.customerId), eq(customers.branchId, workOrders.branchId)),
    )
    .innerJoin(bikes, and(eq(bikes.id, workOrders.bikeId), eq(bikes.branchId, workOrders.branchId)))
    .where(pendingMaintenanceFilter(db, now))
    .orderBy(asc(serviceReports.nextMaintenanceDate), asc(workOrders.number));
}

type MaintenanceReminder = Awaited<ReturnType<typeof dueMaintenanceReminders>>[number];

async function markMaintenanceReminderSent(db: AppDb, reminder: MaintenanceReminder, now: Date) {
  await db
    .update(serviceReports)
    .set({ maintenanceReminderSentAt: now })
    .where(
      and(
        eq(serviceReports.id, reminder.reportId),
        eq(serviceReports.branchId, reminder.branchId),
        isNull(serviceReports.maintenanceReminderSentAt),
      ),
    );
}

function maintenanceTransport(profile: ShopProfile, transport?: EmailTransport) {
  if (transport) return transport;
  const baseEnv = getEmailEnv();
  return createTransport({
    ...baseEnv,
    EMAIL_FROM: senderFor(profile, baseEnv.EMAIL_FROM),
    EMAIL_REPLY_TO: profile.email,
  });
}

export async function sendMaintenanceReminders(
  db: AppDb,
  now: Date,
  deps: { transport?: EmailTransport; siteUrl?: string } = {},
): Promise<{ sent: number; failed: number }> {
  const pending = await dueMaintenanceReminders(db, now);
  const bookingUrl = new URL("/#reserva", deps.siteUrl ?? getSiteEnv().PUBLIC_SITE_URL).toString();
  const profiles = new Map<string, ShopProfile | null>();
  let sent = 0;
  let failed = 0;
  for (const reminder of pending) {
    if (reminder.email === null || reminder.nextMaintenanceDate === null) continue;
    try {
      if (!profiles.has(reminder.branchId))
        profiles.set(reminder.branchId, await profileForBranch(db, reminder.branchId));
      const profile = profiles.get(reminder.branchId);
      if (!profile) throw new Error("No se encontró el perfil del taller de la orden.");
      const transport = maintenanceTransport(profile, deps.transport);
      await transport.send({
        to: reminder.email,
        ...maintenanceReminderEmail(emailBrand(profile), {
          orderNumber: formatOrderNumber(reminder.number),
          customerName: reminder.customerName,
          bike: `${reminder.brand} ${reminder.model}`,
          nextMaintenanceDate: reminder.nextMaintenanceDate,
          note: reminder.note,
          bookingUrl,
        }),
      });
    } catch {
      failed += 1;
      log.error("email.failed", { kind: "maintenance", orderId: reminder.orderId });
      continue;
    }
    await markMaintenanceReminderSent(db, reminder, now);
    sent += 1;
  }
  return { sent, failed };
}
