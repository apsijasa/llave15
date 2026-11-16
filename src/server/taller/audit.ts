import { desc, eq } from "drizzle-orm";
import type { AppDb } from "../db/client.ts";
import { auditLog } from "../db/schema-taller.ts";
import { users } from "../db/schema.ts";

export type AuditAction =
  | "booking.created"
  | "booking.cancelled"
  | "booking.rescheduled"
  | "user.created"
  | "user.deactivated"
  | "user.activated"
  | "user.role_changed"
  | "user.password_reset"
  | "catalog.service_created"
  | "catalog.service_updated"
  | "catalog.price_changed"
  | "order.created"
  | "order.updated"
  | "order.status_changed"
  | "order.assigned"
  | "order.tax_document"
  | "order.delivery_date_confirmed"
  | "order.warranty_opened"
  | "order.delivered"
  | "item.added"
  | "item.price_changed"
  | "item.voided"
  | "approval.created"
  | "approval.link_regenerated"
  | "approval.decided"
  | "qc.approved"
  | "qc.rejected"
  | "notify.ready_for_pickup"
  | "notify.ready_whatsapp"
  | "notify.received"
  | "notify.quote_sent"
  | "payment.recorded"
  | "payment.voided"
  | "component.installed"
  | "component.voided"
  | "report.generated"
  | "report.maintenance_planned"
  | "product.created"
  | "product.updated"
  | "stock.adjusted"
  | "inventory.imported"
  | "supplier.created"
  | "supplier.updated"
  | "purchase.created"
  | "purchase.item_added"
  | "purchase.sent"
  | "purchase.received"
  | "purchase.voided"
  | "pricing.mode_changed"
  | "sale.created"
  | "sale.discounted"
  | "sale.voided"
  | "cash.control_changed"
  | "cash.opened"
  | "cash.closed"
  | "cash.refund"
  | "expense.recorded"
  | "expense.voided"
  | "proposal.created"
  | "proposal.updated"
  | "proposal.submitted"
  | "proposal.withdrawn"
  | "proposal.reviewed"
  | "library.published"
  | "library.archived"
  | "diagnosis.saved"
  | "diagnosis.confirmed"
  | "diagnosis.voided"
  | "component.variant_linked";

const sensitiveKey = /email|correo|phone|telefono|rut|token|password|clave/i;
const uuidPattern = /\b[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\b/i;
export const emailPattern = /[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/;
export const rutPattern = /(?<![\w.])(?:\d{7,8}|\d{1,2}(?:\.\d{3}){2})-[\dk](?!\w)/i;
export const phonePattern = /(?<![\w+.-])(?:\+?56[ .-]*)?9(?:[ .-]*\d){8}(?!\w|[.-]\d)/;
const sensitiveContent = new RegExp(
  `${emailPattern.source}|(${uuidPattern.source})|${rutPattern.source}|${phonePattern.source}`,
  "gi",
);

export function redactDetails(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(sensitiveContent, (match, uuid: string | undefined) =>
      uuid ? match : "[redactado]",
    );
  }
  if (Array.isArray(value)) return value.map(redactDetails);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, detail]) => [
        key,
        sensitiveKey.test(key) ? "[redactado]" : redactDetails(detail),
      ]),
    );
  }
  return value;
}

type AuditEntry = {
  branchId: string;
  actorUserId: string | null;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  details: Record<string, unknown>;
};

/** Debe recibir la transacción que escribe el cambio auditado. */
export async function recordAudit(db: AppDb, entry: AuditEntry, now: Date): Promise<void> {
  await db.insert(auditLog).values({
    ...entry,
    details: redactDetails(entry.details) as Record<string, unknown>,
    createdAt: now,
    updatedAt: now,
  });
}

export async function listAudit(db: AppDb, branchId: string, limit = 100) {
  return db
    .select({
      id: auditLog.id,
      actorUserId: auditLog.actorUserId,
      actorName: users.name,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      details: auditLog.details,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(eq(auditLog.branchId, branchId))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit);
}
