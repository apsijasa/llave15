import { and, asc, desc, eq, getTableColumns, inArray, isNotNull, ne } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import type { AppDb } from "../db/client.ts";
import {
  componentFamilies,
  componentModels,
  componentVariants,
  manufacturers,
  technicalDocuments,
  technicalSpecifications,
} from "../db/schema-library-catalog.ts";
import type {
  ComponentModel,
  ComponentVariant,
  Manufacturer,
  TechnicalDocument,
  TechnicalSpecification,
} from "../db/schema-library-catalog.ts";
import {
  articleVariantLinks,
  articleVersions,
  knowledgeArticles,
} from "../db/schema-library-knowledge.ts";
import {
  compatibilityRuleMembers,
  compatibilityRules,
  procedures,
} from "../db/schema-library-procedures.ts";
import { users } from "../db/schema.ts";
import { canUseLibrary } from "./access.ts";
import { LIBRARY_CATEGORIES } from "./rules.ts";
import type { LibraryCategory } from "./rules.ts";

type ComponentFamily = typeof componentFamilies.$inferSelect;
export type VariantSheet = {
  manufacturer: Manufacturer;
  family: ComponentFamily;
  model: ComponentModel;
  variant: ComponentVariant;
  siblings: ComponentVariant[];
  specifications: (TechnicalSpecification & {
    sourceDocument: { id: string; title: string; canonicalUrl: string } | null;
  })[];
  documents: TechnicalDocument[];
  procedures: {
    procedureId: string;
    title: string;
    kind: string;
    risk: string;
    versionNumber: number;
    articleTitle: string;
  }[];
  compatibility: {
    ruleId: string;
    relation: string;
    certainty: string;
    evidence: string;
    conditions: string | null;
    restrictions: string | null;
    members: { variantId: string; role: string; code: string }[];
  }[];
  versions: {
    articleId: string;
    slug: string;
    title: string;
    kind: string;
    number: number;
    publishedAt: Date | null;
    reviewedByName: string | null;
  }[];
};

export async function listManufacturers(db: AppDb): Promise<Manufacturer[]> {
  return db
    .select()
    .from(manufacturers)
    .where(eq(manufacturers.status, "activo"))
    .orderBy(asc(manufacturers.name));
}

export async function listFamilies(
  db: AppDb,
  category?: LibraryCategory,
): Promise<(ComponentFamily & { manufacturerName: string })[]> {
  const parsed = z.enum(LIBRARY_CATEGORIES).optional().safeParse(category);
  if (!parsed.success) return [];
  return db
    .select({ ...getTableColumns(componentFamilies), manufacturerName: manufacturers.name })
    .from(componentFamilies)
    .innerJoin(manufacturers, eq(manufacturers.id, componentFamilies.manufacturerId))
    .where(parsed.data ? eq(componentFamilies.category, parsed.data) : undefined)
    .orderBy(asc(componentFamilies.name));
}

export async function listModels(db: AppDb, familyId: string): Promise<ComponentModel[]> {
  const parsed = z.uuid().safeParse(familyId);
  if (!parsed.success) return [];
  return db
    .select()
    .from(componentModels)
    .where(eq(componentModels.familyId, parsed.data))
    .orderBy(asc(componentModels.code));
}

async function variantHierarchy(db: AppDb, variantId: string) {
  const [row] = await db
    .select({
      variant: getTableColumns(componentVariants),
      model: getTableColumns(componentModels),
      family: getTableColumns(componentFamilies),
      manufacturer: getTableColumns(manufacturers),
    })
    .from(componentVariants)
    .innerJoin(componentModels, eq(componentModels.id, componentVariants.modelId))
    .innerJoin(componentFamilies, eq(componentFamilies.id, componentModels.familyId))
    .innerJoin(manufacturers, eq(manufacturers.id, componentFamilies.manufacturerId))
    .where(eq(componentVariants.id, variantId))
    .limit(1);
  return row;
}

async function variantSpecifications(
  db: AppDb,
  variantId: string,
): Promise<VariantSheet["specifications"]> {
  return db
    .select({
      ...getTableColumns(technicalSpecifications),
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
    .where(eq(technicalSpecifications.variantId, variantId))
    .orderBy(asc(technicalSpecifications.label));
}

async function variantProcedures(
  db: AppDb,
  variantId: string,
): Promise<VariantSheet["procedures"]> {
  return db
    .select({
      procedureId: procedures.id,
      title: procedures.title,
      kind: procedures.kind,
      risk: procedures.risk,
      versionNumber: articleVersions.number,
      articleTitle: knowledgeArticles.title,
    })
    .from(articleVariantLinks)
    .innerJoin(articleVersions, eq(articleVersions.id, articleVariantLinks.versionId))
    .innerJoin(
      knowledgeArticles,
      and(
        eq(knowledgeArticles.id, articleVersions.articleId),
        eq(knowledgeArticles.currentVersionId, articleVersions.id),
      ),
    )
    .innerJoin(procedures, eq(procedures.versionId, articleVersions.id))
    .where(
      and(
        eq(articleVariantLinks.variantId, variantId),
        eq(knowledgeArticles.status, "publicado"),
        isNotNull(articleVersions.publishedAt),
      ),
    )
    .orderBy(asc(procedures.title));
}

async function variantCompatibility(
  db: AppDb,
  variantId: string,
): Promise<VariantSheet["compatibility"]> {
  const rules = await db
    .select({
      ruleId: compatibilityRules.id,
      relation: compatibilityRules.relation,
      certainty: compatibilityRules.certainty,
      evidence: compatibilityRules.evidence,
      conditions: compatibilityRules.conditions,
      restrictions: compatibilityRules.restrictions,
    })
    .from(compatibilityRules)
    .where(
      and(
        eq(compatibilityRules.status, "vigente"),
        inArray(
          compatibilityRules.id,
          db
            .select({ id: compatibilityRuleMembers.ruleId })
            .from(compatibilityRuleMembers)
            .where(eq(compatibilityRuleMembers.variantId, variantId)),
        ),
      ),
    )
    .orderBy(asc(compatibilityRules.id));
  if (!rules.length) return [];
  const members = await compatibilityMembers(
    db,
    rules.map((rule) => rule.ruleId),
  );
  return rules.map((rule) => ({
    ...rule,
    members: members
      .filter((member) => member.ruleId === rule.ruleId)
      .map(({ variantId, role, code }) => ({ variantId, role, code })),
  }));
}

async function compatibilityMembers(db: AppDb, ruleIds: string[]) {
  return db
    .select({
      ruleId: compatibilityRuleMembers.ruleId,
      variantId: compatibilityRuleMembers.variantId,
      role: compatibilityRuleMembers.role,
      code: componentVariants.code,
    })
    .from(compatibilityRuleMembers)
    .innerJoin(componentVariants, eq(componentVariants.id, compatibilityRuleMembers.variantId))
    .where(inArray(compatibilityRuleMembers.ruleId, ruleIds))
    .orderBy(asc(componentVariants.code), asc(componentVariants.revision));
}

async function variantVersions(db: AppDb, variantId: string): Promise<VariantSheet["versions"]> {
  return db
    .select({
      articleId: knowledgeArticles.id,
      slug: knowledgeArticles.slug,
      title: knowledgeArticles.title,
      kind: knowledgeArticles.kind,
      number: articleVersions.number,
      publishedAt: articleVersions.publishedAt,
      reviewedByName: users.name,
    })
    .from(articleVariantLinks)
    .innerJoin(articleVersions, eq(articleVersions.id, articleVariantLinks.versionId))
    .innerJoin(knowledgeArticles, eq(knowledgeArticles.id, articleVersions.articleId))
    .leftJoin(users, eq(users.id, articleVersions.reviewedBy))
    .where(
      and(eq(articleVariantLinks.variantId, variantId), isNotNull(articleVersions.publishedAt)),
    )
    .orderBy(desc(articleVersions.publishedAt));
}

export async function variantSheet(
  db: AppDb,
  actor: SessionUser,
  variantId: string,
): Promise<{ ok: true; sheet: VariantSheet } | { ok: false; code: "forbidden" | "not_found" }> {
  if (!canUseLibrary(actor)) return { ok: false, code: "forbidden" };
  const parsed = z.uuid().safeParse(variantId);
  if (!parsed.success) return { ok: false, code: "not_found" };
  const hierarchy = await variantHierarchy(db, parsed.data);
  if (!hierarchy) return { ok: false, code: "not_found" };
  const [siblings, specifications, documents, procedures, compatibility, versions] =
    await Promise.all([
      db
        .select()
        .from(componentVariants)
        .where(
          and(
            eq(componentVariants.modelId, hierarchy.model.id),
            ne(componentVariants.id, parsed.data),
          ),
        )
        .orderBy(asc(componentVariants.code), asc(componentVariants.revision)),
      variantSpecifications(db, parsed.data),
      db
        .select()
        .from(technicalDocuments)
        .where(eq(technicalDocuments.variantId, parsed.data))
        .orderBy(asc(technicalDocuments.title)),
      variantProcedures(db, parsed.data),
      variantCompatibility(db, parsed.data),
      variantVersions(db, parsed.data),
    ]);
  return {
    ok: true,
    sheet: {
      ...hierarchy,
      siblings,
      specifications,
      documents,
      procedures,
      compatibility,
      versions,
    },
  };
}
