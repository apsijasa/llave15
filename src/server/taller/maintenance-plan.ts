import { and, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import { TIMEZONE } from "../booking/rules.ts";
import { localToday } from "../booking/slots.ts";
import type { AppDb } from "../db/client.ts";
import { serviceReports } from "../db/schema-reports.ts";
import { recordAudit } from "./audit.ts";
import { MAINTENANCE_INTERVAL_MONTHS } from "./rules.ts";
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
