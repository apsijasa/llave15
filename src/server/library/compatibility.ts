import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import type { AppDb } from "../db/client.ts";
import {
  componentModels,
  componentVariants,
  technicalDocuments,
} from "../db/schema-library-catalog.ts";
import { compatibilityRuleMembers, compatibilityRules } from "../db/schema-library-procedures.ts";
import { canUseLibrary } from "./access.ts";
import type { COMPATIBILITY_RELATIONS } from "./rules.ts";
import { COMPATIBILITY_ROLES } from "./rules.ts";

type CompatibilityRelation = (typeof COMPATIBILITY_RELATIONS)[number];
type CompatibilityRole = (typeof COMPATIBILITY_ROLES)[number];
export const compatibilityCheckSchema = z.object({
  members: z
    .array(z.object({ role: z.enum(COMPATIBILITY_ROLES), variantId: z.uuid() }))
    .min(2)
    .max(8),
});
export type CompatibilityVerdict = {
  relation: CompatibilityRelation;
  members: {
    role: string;
    variantId: string;
    code: string;
    modelName: string;
    speeds: number | null;
  }[];
  rules: {
    ruleId: string;
    relation: string;
    certainty: string;
    evidence: string;
    conditions: string | null;
    restrictions: string | null;
    sourceDocument: { id: string; title: string; canonicalUrl: string } | null;
    reviewedOn: string | null;
    coveredVariantIds: string[];
  }[];
  uncovered: string[];
  explanation: string;
};

const explanations: Record<CompatibilityRelation, string> = {
  oficial_confirmada: "Combinación confirmada por documentación oficial.",
  condicionada: "Compatible solo bajo las condiciones indicadas.",
  incompatible: "La documentación indica que no son compatibles.",
  no_verificada:
    "No hay evidencia verificada para esta combinación exacta. Que tengan la misma cantidad de velocidades no basta: identifique cada variante y consulte el manual.",
};
const componentTypes: Partial<Record<CompatibilityRole, string>> = {
  shifter: "shifter",
  cambio: "cambio_trasero",
  cassette: "cassette",
  cadena: "cadena",
  plato: "biela",
  nucleo: "nucleo",
  freno: "freno_disco",
  disco: "disco",
};

export async function listVariantsForRole(
  db: AppDb,
  role: CompatibilityRole,
): Promise<{ id: string; label: string }[]> {
  const parsed = z.enum(COMPATIBILITY_ROLES).safeParse(role);
  const componentType = parsed.success ? componentTypes[parsed.data] : undefined;
  if (!componentType) return [];
  const rows = await db
    .select({
      id: componentVariants.id,
      code: componentVariants.code,
      revision: componentVariants.revision,
      modelName: componentModels.name,
    })
    .from(componentVariants)
    .innerJoin(componentModels, eq(componentModels.id, componentVariants.modelId))
    .where(eq(componentModels.componentType, componentType))
    .orderBy(
      asc(componentVariants.code),
      asc(componentVariants.revision),
      asc(componentVariants.id),
    );
  return rows.map((row) => ({
    id: row.id,
    label: `${row.code}${row.revision ? ` rev. ${row.revision}` : ""} — ${row.modelName}`,
  }));
}

async function requestedVariants(db: AppDb, ids: string[]) {
  return db
    .select({
      variantId: componentVariants.id,
      code: componentVariants.code,
      modelName: componentModels.name,
      speeds: componentModels.speeds,
    })
    .from(componentVariants)
    .innerJoin(componentModels, eq(componentModels.id, componentVariants.modelId))
    .where(inArray(componentVariants.id, ids));
}

async function candidateRules(db: AppDb, ids: string[]) {
  return db
    .select({
      ruleId: compatibilityRules.id,
      relation: compatibilityRules.relation,
      certainty: compatibilityRules.certainty,
      evidence: compatibilityRules.evidence,
      conditions: compatibilityRules.conditions,
      restrictions: compatibilityRules.restrictions,
      reviewedOn: compatibilityRules.reviewedOn,
      sourceDocument: {
        id: technicalDocuments.id,
        title: technicalDocuments.title,
        canonicalUrl: technicalDocuments.canonicalUrl,
      },
    })
    .from(compatibilityRules)
    .leftJoin(technicalDocuments, eq(technicalDocuments.id, compatibilityRules.sourceDocumentId))
    .where(
      and(
        eq(compatibilityRules.status, "vigente"),
        inArray(
          compatibilityRules.id,
          db
            .select({ id: compatibilityRuleMembers.ruleId })
            .from(compatibilityRuleMembers)
            .where(inArray(compatibilityRuleMembers.variantId, ids)),
        ),
      ),
    )
    .orderBy(asc(compatibilityRules.id));
}

async function applicableRules(db: AppDb, ids: string[]): Promise<CompatibilityVerdict["rules"]> {
  const rules = await candidateRules(db, ids);
  if (!rules.length) return [];
  // Leer TODOS los miembros, incluyendo los que no se pidieron, antes de decidir si aplica.
  const members = await db
    .select({
      ruleId: compatibilityRuleMembers.ruleId,
      variantId: compatibilityRuleMembers.variantId,
    })
    .from(compatibilityRuleMembers)
    .where(
      inArray(
        compatibilityRuleMembers.ruleId,
        rules.map((rule) => rule.ruleId),
      ),
    )
    .orderBy(asc(compatibilityRuleMembers.variantId));
  return rules.flatMap((rule) => {
    const coveredVariantIds = members
      .filter((member) => member.ruleId === rule.ruleId)
      .map((member) => member.variantId);
    return coveredVariantIds.length && coveredVariantIds.every((id) => ids.includes(id))
      ? [{ ...rule, coveredVariantIds }]
      : [];
  });
}

function resolveRelation(
  rules: CompatibilityVerdict["rules"],
  uncovered: string[],
): CompatibilityRelation {
  if (rules.some((rule) => rule.relation === "incompatible")) return "incompatible";
  if (!rules.length || uncovered.length) return "no_verificada";
  if (rules.every((rule) => rule.relation === "oficial_confirmada")) return "oficial_confirmada";
  if (rules.some((rule) => rule.relation === "condicionada")) return "condicionada";
  return "no_verificada";
}

export async function checkCompatibility(
  db: AppDb,
  actor: SessionUser,
  input: unknown,
): Promise<
  | { ok: true; verdict: CompatibilityVerdict }
  | { ok: false; code: "forbidden" | "validation_error" | "not_found" }
> {
  if (!canUseLibrary(actor)) return { ok: false, code: "forbidden" };
  const parsed = compatibilityCheckSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "validation_error" };
  const ids = [...new Set(parsed.data.members.map((member) => member.variantId))];
  const variants = await requestedVariants(db, ids);
  const byId = new Map(variants.map((variant) => [variant.variantId, variant]));
  if (ids.some((id) => !byId.has(id))) return { ok: false, code: "not_found" };
  const members = parsed.data.members.flatMap((member) => {
    const variant = byId.get(member.variantId);
    return variant ? [{ ...variant, role: member.role }] : [];
  });
  const rules = await applicableRules(db, ids);
  const covered = new Set(rules.flatMap((rule) => rule.coveredVariantIds));
  const uncovered = ids.filter((id) => !covered.has(id));
  const relation = resolveRelation(rules, uncovered);
  return {
    ok: true,
    verdict: { relation, members, rules, uncovered, explanation: explanations[relation] },
  };
}
