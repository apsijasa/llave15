import { and, asc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import type { AppDb } from "../db/client.ts";
import {
  componentModels,
  componentVariants,
  manufacturers,
  technicalDocuments,
  technicalSpecifications,
  toolsConsumables,
} from "../db/schema-library-catalog.ts";
import { canUseLibrary } from "./access.ts";
import { SPEC_KINDS, SPEC_KIND_LABELS } from "./rules.ts";

export const specLookupSchema = z.object({
  variantId: z.uuid().optional(),
  kind: z.enum(SPEC_KINDS).optional(),
  operation: z.string().trim().min(2).max(120).optional(),
});
type SpecKind = (typeof SPEC_KINDS)[number];
export type SpecRow = {
  id: string | null;
  variantId: string;
  kind: string;
  label: string;
  valueText: string;
  unit: string | null;
  tolerance: string | null;
  context: string | null;
  validationStatus: string;
  reviewedOn: string | null;
  sourceDocument: { id: string; title: string; canonicalUrl: string } | null;
};
export type ToolRow = {
  id: string;
  name: string;
  code: string | null;
  kind: "herramienta" | "consumible";
  category: string;
  specification: string | null;
  usage: string | null;
  restrictions: string | null;
  manufacturerName: string | null;
};

export async function listSpecificationVariants(
  db: AppDb,
  actor: SessionUser,
): Promise<{ id: string; label: string }[]> {
  if (!canUseLibrary(actor)) return [];
  const rows = await db
    .select({
      id: componentVariants.id,
      code: componentVariants.code,
      revision: componentVariants.revision,
      modelName: componentModels.name,
    })
    .from(componentVariants)
    .innerJoin(componentModels, eq(componentModels.id, componentVariants.modelId))
    .orderBy(
      asc(componentVariants.code),
      asc(componentVariants.revision),
      asc(componentVariants.id),
    )
    .limit(200);
  return rows.map((row) => ({
    id: row.id,
    label: `${row.code}${row.revision ? ` rev. ${row.revision}` : ""} — ${row.modelName}`,
  }));
}

function missingSpecification(variantId: string, kind: SpecKind): SpecRow {
  return {
    id: null,
    variantId,
    kind,
    label: SPEC_KIND_LABELS[kind],
    valueText: "",
    unit: null,
    tolerance: null,
    context: null,
    validationStatus: "sin_dato_verificado",
    reviewedOn: null,
    sourceDocument: null,
  };
}

async function variantSpecifications(
  db: AppDb,
  variantId: string,
  kind?: SpecKind,
): Promise<SpecRow[]> {
  const rows = await db
    .select({
      id: technicalSpecifications.id,
      variantId: technicalSpecifications.variantId,
      kind: technicalSpecifications.kind,
      label: technicalSpecifications.label,
      valueText: technicalSpecifications.valueText,
      unit: technicalSpecifications.unit,
      tolerance: technicalSpecifications.tolerance,
      context: technicalSpecifications.context,
      validationStatus: technicalSpecifications.validationStatus,
      reviewedOn: technicalSpecifications.reviewedOn,
      sourceDocument: {
        id: technicalDocuments.id,
        title: technicalDocuments.title,
        canonicalUrl: technicalDocuments.canonicalUrl,
      },
    })
    .from(technicalSpecifications)
    .leftJoin(
      technicalDocuments,
      eq(technicalDocuments.id, technicalSpecifications.sourceDocumentId),
    )
    .where(
      and(
        eq(technicalSpecifications.variantId, variantId),
        kind ? eq(technicalSpecifications.kind, kind) : undefined,
      ),
    )
    .orderBy(asc(technicalSpecifications.label), asc(technicalSpecifications.id));
  if (!rows.length && kind) return [missingSpecification(variantId, kind)];
  return rows.map((row) => ({
    ...row,
    validationStatus: row.valueText ? row.validationStatus : "sin_dato_verificado",
  }));
}

async function operationTools(db: AppDb, operation: string): Promise<ToolRow[]> {
  const vector = sql`to_tsvector('spanish', ${toolsConsumables.name} || ' ' || coalesce(${toolsConsumables.usage}, '') || ' ' || coalesce(${toolsConsumables.specification}, ''))`;
  const query = sql`plainto_tsquery('spanish', ${operation})`;
  const pattern = `%${operation.replace(/[%_\\]/g, "\\$&")}%`;
  return db
    .select({
      id: toolsConsumables.id,
      name: toolsConsumables.name,
      code: toolsConsumables.code,
      kind: sql<ToolRow["kind"]>`${toolsConsumables.kind}`,
      category: toolsConsumables.category,
      specification: toolsConsumables.specification,
      usage: toolsConsumables.usage,
      restrictions: toolsConsumables.restrictions,
      manufacturerName: manufacturers.name,
    })
    .from(toolsConsumables)
    .leftJoin(manufacturers, eq(manufacturers.id, toolsConsumables.manufacturerId))
    .where(
      or(sql`${vector} @@ ${query}`, sql`${toolsConsumables.name} ilike ${pattern} escape ${"\\"}`),
    )
    .orderBy(asc(toolsConsumables.category), asc(toolsConsumables.name), asc(toolsConsumables.id))
    .limit(30);
}

export async function lookupSpecifications(
  db: AppDb,
  actor: SessionUser,
  input: unknown,
): Promise<
  | { ok: true; specs: SpecRow[]; tools: ToolRow[] }
  | { ok: false; code: "forbidden" | "validation_error" | "not_found" }
> {
  if (!canUseLibrary(actor)) return { ok: false, code: "forbidden" };
  const parsed = specLookupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "validation_error" };
  const { variantId, kind, operation } = parsed.data;
  if (variantId) {
    const [variant] = await db
      .select({ id: componentVariants.id })
      .from(componentVariants)
      .where(eq(componentVariants.id, variantId))
      .limit(1);
    if (!variant) return { ok: false, code: "not_found" };
  }
  const [specs, tools] = await Promise.all([
    variantId ? variantSpecifications(db, variantId, kind) : [],
    operation ? operationTools(db, operation) : [],
  ]);
  return { ok: true, specs, tools };
}
