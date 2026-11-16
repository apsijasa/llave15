import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { workOrders } from "../db/schema-orders.ts";
import {
  componentVariants,
  technicalDocuments,
  technicalSpecifications,
} from "../db/schema-library-catalog.ts";
import { articleVersions } from "../db/schema-library-knowledge.ts";
import { aiInteractions, technicalDiagnoses } from "../db/schema-library-private.ts";
import { procedures } from "../db/schema-library-procedures.ts";
import { users } from "../db/schema.ts";
import { recordAudit } from "../taller/audit.ts";
import type { AuditAction } from "../taller/audit.ts";
import { TERMINAL_STATUSES } from "../taller/rules.ts";
import { canAccessOrder } from "../taller/status.ts";
import { describeReferences } from "./diagnosis-references.ts";
import type { DescribedReference, Reference } from "./diagnosis-references.ts";
import { CONFIDENCE_LEVELS } from "./rules.ts";

type Failure<C extends string> = { ok: false; code: C };
const emptyToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

export const REFERENCE_KINDS = [
  "article_version",
  "specification",
  "procedure",
  "document",
  "variant",
] as const;
type ReferenceKind = (typeof REFERENCE_KINDS)[number];

/** Pruebas sugeridas para el checklist del diagnóstico guiado. */
export const DIAGNOSIS_INSPECTIONS = [
  { key: "desgaste_cadena", label: "Medir desgaste de cadena" },
  { key: "cassette_platos", label: "Revisar dientes de cassette y platos" },
  { key: "patilla", label: "Revisar alineación de la patilla" },
  { key: "ajuste_cambio", label: "Revisar ajuste de tensión e indexación" },
  { key: "reproduccion", label: "Reproducir el síntoma de forma segura" },
  { key: "frenos_pastillas", label: "Revisar pastillas y discos" },
  { key: "juego_direccion", label: "Revisar juego de dirección" },
  { key: "suspension_fugas", label: "Revisar fugas y recorrido de suspensión" },
] as const;

export const diagnosisFormSchema = z.strictObject({
  symptoms: z.string().trim().min(3).max(2000),
  inspections: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z0-9_]{2,40}$/),
        label: z.string().trim().min(2).max(120),
        done: z.boolean(),
        result: z.string().trim().max(500).default(""),
      }),
    )
    .max(20)
    .default([]),
  hypotheses: z
    .array(
      z.object({
        text: z.string().trim().min(3).max(500),
        evidence: z.string().trim().max(500).default(""),
        confidence: z.enum(CONFIDENCE_LEVELS),
      }),
    )
    .max(10)
    .default([]),
  result: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((value) => value || null),
  references: z
    .array(
      z.object({
        kind: z.enum(REFERENCE_KINDS),
        id: z.uuid(),
        versionNumber: z.int().positive().optional(),
      }),
    )
    .max(30)
    .default([]),
  aiInteractionId: z.preprocess(emptyToUndefined, z.uuid().optional()),
});
type DiagnosisInput = z.infer<typeof diagnosisFormSchema>;

async function loadOrder(db: AppDb, actor: SessionUser, orderId: string) {
  if (!z.uuid().safeParse(orderId).success) return { ok: false, code: "not_found" } as const;
  const [order] = await db
    .select()
    .from(workOrders)
    .where(
      and(
        eq(workOrders.branchId, actor.branchId),
        eq(workOrders.id, orderId),
        isNull(workOrders.voidedAt),
      ),
    );
  if (!order) return { ok: false, code: "not_found" } as const;
  if (!canAccessOrder(actor, order)) return { ok: false, code: "forbidden" } as const;
  return { ok: true, order } as const;
}

const REFERENCE_TABLES = {
  specification: technicalSpecifications,
  procedure: procedures,
  document: technicalDocuments,
  variant: componentVariants,
} as const;

/** Comprueba cada referencia contra su tabla y completa el número de versión de los artículos. */
async function resolveReferences(
  db: AppDb,
  refs: readonly Reference[],
): Promise<Reference[] | null> {
  const versionIds = refs.filter((ref) => ref.kind === "article_version").map((ref) => ref.id);
  const versions = versionIds.length
    ? await db
        .select({ id: articleVersions.id, number: articleVersions.number })
        .from(articleVersions)
        .where(inArray(articleVersions.id, versionIds))
    : [];
  const numbers = new Map(versions.map((version) => [version.id, version.number]));
  const resolved: Reference[] = [];
  for (const ref of refs) {
    if (ref.kind === "article_version") {
      const number = numbers.get(ref.id);
      if (number === undefined) return null;
      resolved.push({ kind: ref.kind, id: ref.id, versionNumber: number });
      continue;
    }
    const table = REFERENCE_TABLES[ref.kind];
    const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, ref.id));
    if (!row) return null;
    resolved.push({ kind: ref.kind, id: ref.id });
  }
  return resolved;
}

async function interactionBelongs(db: AppDb, actor: SessionUser, id: string | undefined) {
  if (!id) return true;
  const [row] = await db
    .select({ id: aiInteractions.id })
    .from(aiInteractions)
    .where(and(eq(aiInteractions.id, id), eq(aiInteractions.branchId, actor.branchId)));
  return row !== undefined;
}

async function auditDiagnosis(
  db: AppDb,
  actor: SessionUser,
  id: string,
  action: AuditAction,
  orderId: string,
  now: Date,
) {
  await recordAudit(
    db,
    {
      branchId: actor.branchId,
      actorUserId: actor.id,
      action,
      entity: "technical_diagnosis",
      entityId: id,
      details: { orderId },
    },
    now,
  );
}

type SaveFailure =
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "invalid_reference"
  | "order_closed";

async function validatedInput(
  db: AppDb,
  actor: SessionUser,
  input: unknown,
): Promise<
  | { ok: true; data: DiagnosisInput; refs: Reference[] }
  | Failure<"validation_error" | "invalid_reference">
> {
  const parsed = diagnosisFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "validation_error" };
  const refs = await resolveReferences(db, parsed.data.references);
  if (!refs || !(await interactionBelongs(db, actor, parsed.data.aiInteractionId)))
    return { ok: false, code: "invalid_reference" };
  return { ok: true, data: parsed.data, refs };
}

/** Guarda un diagnóstico en borrador. Solo por acción explícita: nunca cambia la orden. */
export async function saveDiagnosis(
  db: AppDb,
  actor: SessionUser,
  orderId: string,
  input: unknown,
  now: Date,
): Promise<{ ok: true; id: string } | Failure<SaveFailure>> {
  if (!can(actor.role, "library.ai")) return { ok: false, code: "forbidden" };
  const access = await loadOrder(db, actor, orderId);
  if (!access.ok) return access;
  if ((TERMINAL_STATUSES as readonly string[]).includes(access.order.status))
    return { ok: false, code: "order_closed" };
  const checked = await validatedInput(db, actor, input);
  if (!checked.ok) return checked;
  const { data, refs } = checked;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(technicalDiagnoses)
      .values({
        branchId: actor.branchId,
        workOrderId: access.order.id,
        bikeId: access.order.bikeId,
        symptoms: data.symptoms,
        inspections: data.inspections,
        hypotheses: data.hypotheses,
        result: data.result,
        refs,
        aiInteractionId: data.aiInteractionId ?? null,
        createdBy: actor.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: technicalDiagnoses.id });
    if (!row) throw new Error("No se pudo guardar el diagnóstico.");
    await auditDiagnosis(tx, actor, row.id, "diagnosis.saved", access.order.id, now);
    return { ok: true, id: row.id } as const;
  });
}

async function lockDiagnosis(db: AppDb, actor: SessionUser, id: string) {
  if (!z.uuid().safeParse(id).success) return undefined;
  const [row] = await db
    .select()
    .from(technicalDiagnoses)
    .where(and(eq(technicalDiagnoses.branchId, actor.branchId), eq(technicalDiagnoses.id, id)))
    .for("update");
  return row;
}

export async function confirmDiagnosis(
  db: AppDb,
  actor: SessionUser,
  diagnosisId: string,
  now: Date,
): Promise<{ ok: true } | Failure<"forbidden" | "not_found" | "already_confirmed">> {
  if (!can(actor.role, "library.ai")) return { ok: false, code: "forbidden" };
  return db.transaction(async (tx) => {
    const row = await lockDiagnosis(tx, actor, diagnosisId);
    if (!row || row.voidedAt) return { ok: false, code: "not_found" } as const;
    const access = await loadOrder(tx, actor, row.workOrderId);
    if (!access.ok) return access;
    if (row.status === "confirmado") return { ok: false, code: "already_confirmed" } as const;
    await tx
      .update(technicalDiagnoses)
      .set({ status: "confirmado", confirmedBy: actor.id, confirmedAt: now, updatedAt: now })
      .where(eq(technicalDiagnoses.id, row.id));
    await auditDiagnosis(tx, actor, row.id, "diagnosis.confirmed", row.workOrderId, now);
    return { ok: true } as const;
  });
}

export async function voidDiagnosis(
  db: AppDb,
  actor: SessionUser,
  diagnosisId: string,
  now: Date,
): Promise<{ ok: true } | Failure<"forbidden" | "not_found" | "already_voided">> {
  return db.transaction(async (tx) => {
    const row = await lockDiagnosis(tx, actor, diagnosisId);
    if (!row) return { ok: false, code: "not_found" } as const;
    const ownDraft = row.createdBy === actor.id && row.status === "borrador";
    if (!can(actor.role, "items.void") && !ownDraft)
      return { ok: false, code: "forbidden" } as const;
    if (row.voidedAt) return { ok: false, code: "already_voided" } as const;
    await tx
      .update(technicalDiagnoses)
      .set({ voidedAt: now, voidedBy: actor.id, updatedAt: now })
      .where(eq(technicalDiagnoses.id, row.id));
    await auditDiagnosis(tx, actor, row.id, "diagnosis.voided", row.workOrderId, now);
    return { ok: true } as const;
  });
}

export type DiagnosisItem = Omit<typeof technicalDiagnoses.$inferSelect, "refs"> & {
  refs: DescribedReference[];
  authorName: string;
  confirmedByName: string | null;
};

export async function listDiagnoses(
  db: AppDb,
  actor: SessionUser,
  orderId: string,
): Promise<{ ok: true; items: DiagnosisItem[] } | Failure<"forbidden" | "not_found">> {
  if (!can(actor.role, "library.ai")) return { ok: false, code: "forbidden" };
  const access = await loadOrder(db, actor, orderId);
  if (!access.ok) return access;
  const confirmer = alias(users, "confirmer");
  const rows = await db
    .select({
      diagnosis: technicalDiagnoses,
      authorName: users.name,
      confirmedByName: confirmer.name,
    })
    .from(technicalDiagnoses)
    .innerJoin(users, eq(users.id, technicalDiagnoses.createdBy))
    .leftJoin(confirmer, eq(confirmer.id, technicalDiagnoses.confirmedBy))
    .where(
      and(
        eq(technicalDiagnoses.branchId, actor.branchId),
        eq(technicalDiagnoses.workOrderId, orderId),
        isNull(technicalDiagnoses.voidedAt),
      ),
    )
    .orderBy(desc(technicalDiagnoses.createdAt));
  const items: DiagnosisItem[] = [];
  for (const row of rows) {
    const refs = await describeReferences(db, row.diagnosis.refs as Reference[]);
    items.push({
      ...row.diagnosis,
      refs,
      authorName: row.authorName,
      confirmedByName: row.confirmedByName,
    });
  }
  return { ok: true, items };
}
