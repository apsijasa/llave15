import { asc, eq, inArray } from "drizzle-orm";
import type { AppDb } from "../db/client.ts";
import {
  componentFamilies,
  componentModels,
  componentVariants,
  knowledgeSources,
  manufacturers,
  technicalDocuments,
  technicalSpecifications,
  toolsConsumables,
} from "../db/schema-library-catalog.ts";
import {
  articleVariantLinks,
  articleVersions,
  knowledgeArticles,
} from "../db/schema-library-knowledge.ts";
import { procedureSpecs, procedureSteps, procedures } from "../db/schema-library-procedures.ts";
import { libraryPackSchema } from "./content-pack-schema.ts";
import type { LibraryPack } from "./content-pack-schema.ts";

/** `null` de la base → campo ausente en el paquete. */
function opt<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

type Keys = {
  manufacturers: Map<string, string>;
  families: Map<string, string>;
  models: Map<string, string>;
  variants: Map<string, string>;
  sources: Map<string, string>;
  documents: Map<string, string>;
};

function need(map: Map<string, string>, id: string): string {
  const key = map.get(id);
  if (!key) throw new Error("Referencia rota al exportar la biblioteca.");
  return key;
}

async function catalogRows(db: AppDb, keys: Keys) {
  const makers = await db.select().from(manufacturers).orderBy(asc(manufacturers.slug));
  for (const row of makers) keys.manufacturers.set(row.id, row.slug);
  const families = await db.select().from(componentFamilies).orderBy(asc(componentFamilies.slug));
  for (const row of families)
    keys.families.set(row.id, `${need(keys.manufacturers, row.manufacturerId)}/${row.slug}`);
  const models = await db.select().from(componentModels).orderBy(asc(componentModels.code));
  for (const row of models)
    keys.models.set(row.id, `${need(keys.families, row.familyId)}/${row.code}`);
  const variants = await db.select().from(componentVariants).orderBy(asc(componentVariants.code));
  for (const row of variants)
    keys.variants.set(
      row.id,
      `${need(keys.models, row.modelId)}/${row.code}${row.revision ? `@${row.revision}` : ""}`,
    );
  return { makers, families, models, variants };
}

async function exportCatalog(db: AppDb, keys: Keys) {
  const { makers, families, models, variants } = await catalogRows(db, keys);
  return {
    manufacturers: makers.map((row) => ({
      slug: row.slug,
      name: row.name,
      aliases: row.aliases,
      officialSiteUrl: opt(row.officialSiteUrl),
      status: row.status as "activo" | "inactivo",
    })),
    families: families.map((row) => ({
      manufacturer: need(keys.manufacturers, row.manufacturerId),
      slug: row.slug,
      name: row.name,
      category: row.category as LibraryPack["families"][number]["category"],
    })),
    models: models.map((row) => ({
      family: need(keys.families, row.familyId),
      code: row.code,
      name: row.name,
      componentType: row.componentType,
      generation: opt(row.generation),
      speeds: opt(row.speeds),
      status: row.status as LibraryPack["models"][number]["status"],
    })),
    variants: variants.map((row) => ({
      model: need(keys.models, row.modelId),
      code: row.code,
      revision: row.revision,
      yearFrom: opt(row.yearFrom),
      yearTo: opt(row.yearTo),
      attributes: row.attributes,
      status: row.status as LibraryPack["variants"][number]["status"],
    })),
  };
}

async function exportSources(db: AppDb, keys: Keys) {
  const sources = await db.select().from(knowledgeSources).orderBy(asc(knowledgeSources.url));
  for (const row of sources) keys.sources.set(row.id, row.url);
  // El paquete no lleva `storage_key`: el archivo autorizado se queda en esta instalación.
  const documents = await db
    .select()
    .from(technicalDocuments)
    .orderBy(asc(technicalDocuments.canonicalUrl));
  for (const row of documents) keys.documents.set(row.id, row.canonicalUrl);
  return {
    sources: sources.map((row) => ({
      url: row.url,
      publisher: row.publisher,
      title: row.title,
      publishedOn: opt(row.publishedOn),
      reviewedOn: opt(row.reviewedOn),
      authority: row.authority as LibraryPack["sources"][number]["authority"],
      usagePolicy: row.usagePolicy as LibraryPack["sources"][number]["usagePolicy"],
      notes: opt(row.notes),
    })),
    documents: documents.map((row) => ({
      canonicalUrl: row.canonicalUrl,
      revision: row.revision,
      title: row.title,
      manufacturer: row.manufacturerId ? keys.manufacturers.get(row.manufacturerId) : undefined,
      source: row.sourceId ? keys.sources.get(row.sourceId) : undefined,
      license: row.license as LibraryPack["documents"][number]["license"],
      docType: row.docType as LibraryPack["documents"][number]["docType"],
      language: row.language,
      variant: row.variantId ? keys.variants.get(row.variantId) : undefined,
      checksum: opt(row.checksum),
      status: row.status as LibraryPack["documents"][number]["status"],
    })),
  };
}

async function exportSpecsAndTools(db: AppDb, keys: Keys) {
  const specs = await db
    .select()
    .from(technicalSpecifications)
    .orderBy(asc(technicalSpecifications.label));
  const tools = await db.select().from(toolsConsumables).orderBy(asc(toolsConsumables.name));
  return {
    specifications: specs.map((row) => ({
      variant: need(keys.variants, row.variantId),
      kind: row.kind as LibraryPack["specifications"][number]["kind"],
      label: row.label,
      valueText: row.valueText,
      unit: opt(row.unit),
      tolerance: opt(row.tolerance),
      context: opt(row.context),
      sourceDocument: row.sourceDocumentId ? keys.documents.get(row.sourceDocumentId) : undefined,
      validationStatus:
        row.validationStatus as LibraryPack["specifications"][number]["validationStatus"],
      reviewedOn: opt(row.reviewedOn),
    })),
    tools: tools.map((row) => ({
      code: opt(row.code),
      name: row.name,
      kind: row.kind as "herramienta" | "consumible",
      category: row.category as LibraryPack["tools"][number]["category"],
      manufacturer: row.manufacturerId ? keys.manufacturers.get(row.manufacturerId) : undefined,
      specification: opt(row.specification),
      usage: opt(row.usage),
      restrictions: opt(row.restrictions),
    })),
  };
}

type PackProcedure = NonNullable<LibraryPack["articles"][number]["procedure"]>;

async function exportProcedure(
  db: AppDb,
  keys: Keys,
  versionId: string,
): Promise<PackProcedure | undefined> {
  const [procedure] = await db.select().from(procedures).where(eq(procedures.versionId, versionId));
  if (!procedure) return undefined;
  const steps = await db
    .select()
    .from(procedureSteps)
    .where(eq(procedureSteps.procedureId, procedure.id))
    .orderBy(asc(procedureSteps.sequence));
  const specs = await db
    .select({ spec: technicalSpecifications })
    .from(procedureSpecs)
    .innerJoin(
      technicalSpecifications,
      eq(technicalSpecifications.id, procedureSpecs.specificationId),
    )
    .where(eq(procedureSpecs.procedureId, procedure.id));
  return {
    title: procedure.title,
    kind: procedure.kind as PackProcedure["kind"],
    risk: procedure.risk as PackProcedure["risk"],
    durationMinutes: opt(procedure.durationMinutes),
    prerequisites: opt(procedure.prerequisites),
    finalChecks: opt(procedure.finalChecks),
    steps: steps.map((step) => ({
      sequence: step.sequence,
      action: step.action,
      tools: opt(step.tools),
      consumables: opt(step.consumables),
      verification: opt(step.verification),
      warning: opt(step.warning),
    })),
    specs: specs.map(({ spec }) => ({
      variant: need(keys.variants, spec.variantId),
      kind: spec.kind as LibraryPack["specifications"][number]["kind"],
      label: spec.label,
    })),
  };
}

function exportReference(
  keys: Keys,
  reference: { documentId?: string; sourceId?: string; note?: string },
) {
  return {
    document: reference.documentId ? keys.documents.get(reference.documentId) : undefined,
    source: reference.sourceId ? keys.sources.get(reference.sourceId) : undefined,
    note: reference.note,
  };
}

async function exportArticles(db: AppDb, keys: Keys): Promise<LibraryPack["articles"]> {
  const rows = await db
    .select({ article: knowledgeArticles, version: articleVersions })
    .from(knowledgeArticles)
    .innerJoin(articleVersions, eq(articleVersions.id, knowledgeArticles.currentVersionId))
    .where(eq(knowledgeArticles.status, "publicado"))
    .orderBy(asc(knowledgeArticles.slug));
  const versionIds = rows.map((row) => row.version.id);
  const links = versionIds.length
    ? await db
        .select()
        .from(articleVariantLinks)
        .where(inArray(articleVariantLinks.versionId, versionIds))
    : [];
  const articles: LibraryPack["articles"] = [];
  for (const { article, version } of rows) {
    articles.push({
      slug: article.slug,
      title: article.title,
      category: article.category as LibraryPack["articles"][number]["category"],
      topic: opt(article.topic),
      language: article.language,
      kind: article.kind as LibraryPack["articles"][number]["kind"],
      variants: links
        .filter((link) => link.versionId === version.id)
        .map((link) => need(keys.variants, link.variantId)),
      procedure: await exportProcedure(db, keys, version.id),
      version: {
        number: 1,
        contentMd: version.contentMd,
        summary: version.summary,
        sources: version.sources.map((reference) => exportReference(keys, reference)),
        validFrom: opt(version.validFrom),
      },
    });
  }
  return articles;
}

/**
 * Paquete del conocimiento global publicado. Solo lee tablas globales: nunca propuestas,
 * diagnósticos, notas ni consultas al asistente de ningún taller.
 */
export async function exportLibraryPack(db: AppDb, now: Date): Promise<LibraryPack> {
  const keys: Keys = {
    manufacturers: new Map(),
    families: new Map(),
    models: new Map(),
    variants: new Map(),
    sources: new Map(),
    documents: new Map(),
  };
  const catalog = await exportCatalog(db, keys);
  const sources = await exportSources(db, keys);
  const rest = await exportSpecsAndTools(db, keys);
  const articles = await exportArticles(db, keys);
  const pack = {
    version: 1,
    generatedAt: now.toISOString(),
    ...catalog,
    ...sources,
    ...rest,
    articles,
  };
  return libraryPackSchema.parse(JSON.parse(JSON.stringify(pack)));
}
