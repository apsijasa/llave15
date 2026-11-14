import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { normalizeRut } from "../../lib/rut.ts";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import { isUniqueViolation } from "../db/client.ts";
import type { AppDb } from "../db/client.ts";
import { suppliers } from "../db/schema-inventory.ts";
import { recordAudit } from "./audit.ts";

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);
}

export const supplierFormSchema = z.object({
  name: z.string().trim().min(2).max(120),
  rut: optionalText(30)
    .refine((value) => value === null || normalizeRut(value) !== null, "Ingresa un RUT válido.")
    .transform((value) => (value === null ? null : normalizeRut(value))),
  phone: optionalText(30),
  email: optionalText(254).pipe(z.email().nullable()),
  notes: optionalText(500),
  isActive: z.boolean().default(true),
});
type SupplierInput = z.infer<typeof supplierFormSchema>;
type SupplierResult =
  | { ok: true; supplierId: string }
  | { ok: false; code: "forbidden" | "validation_error" | "not_found" | "rut_exists" };

function supplierScope(actor: SessionUser, id: string) {
  return and(eq(suppliers.branchId, actor.branchId), eq(suppliers.id, id));
}

function supplierError(error: unknown): SupplierResult {
  if (!isUniqueViolation(error)) throw error;
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const detail = current as { constraint?: string; constraint_name?: string; cause?: unknown };
    if (
      detail.constraint === "uq_suppliers_branch_rut" ||
      detail.constraint_name === "uq_suppliers_branch_rut"
    )
      return { ok: false, code: "rut_exists" };
    current = detail.cause;
  }
  throw error;
}

async function saveSupplier(
  db: AppDb,
  actor: SessionUser,
  id: string | null,
  input: SupplierInput,
  now: Date,
): Promise<SupplierResult> {
  try {
    return await db.transaction(async (tx) => {
      const rows =
        id === null
          ? await tx
              .insert(suppliers)
              .values({
                ...input,
                branchId: actor.branchId,
                createdAt: now,
                updatedAt: now,
              })
              .returning({ id: suppliers.id })
          : await tx
              .update(suppliers)
              .set({ ...input, updatedAt: now })
              .where(supplierScope(actor, id))
              .returning({ id: suppliers.id });
      const [supplier] = rows;
      if (!supplier) return { ok: false, code: "not_found" };
      await recordAudit(
        tx,
        {
          branchId: actor.branchId,
          actorUserId: actor.id,
          action: id === null ? "supplier.created" : "supplier.updated",
          entity: "supplier",
          entityId: supplier.id,
          details: input,
        },
        now,
      );
      return { ok: true, supplierId: supplier.id };
    });
  } catch (error) {
    return supplierError(error);
  }
}

export async function createSupplier(
  db: AppDb,
  actor: SessionUser,
  input: unknown,
  now: Date,
): Promise<SupplierResult> {
  if (!can(actor.role, "purchases.manage")) return { ok: false, code: "forbidden" };
  const parsed = supplierFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "validation_error" };
  return saveSupplier(db, actor, null, parsed.data, now);
}

export async function updateSupplier(
  db: AppDb,
  actor: SessionUser,
  id: string,
  input: unknown,
  now: Date,
): Promise<SupplierResult> {
  if (!can(actor.role, "purchases.manage")) return { ok: false, code: "forbidden" };
  const parsed = supplierFormSchema.safeParse(input);
  if (!parsed.success || !z.uuid().safeParse(id).success)
    return { ok: false, code: "validation_error" };
  return saveSupplier(db, actor, id, parsed.data, now);
}

export async function listSuppliers(db: AppDb, actor: SessionUser) {
  if (!can(actor.role, "purchases.manage")) return [];
  return db
    .select()
    .from(suppliers)
    .where(eq(suppliers.branchId, actor.branchId))
    .orderBy(asc(suppliers.name), asc(suppliers.id));
}
