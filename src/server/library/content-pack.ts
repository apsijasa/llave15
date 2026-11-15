import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { InferInsertModel, SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type { AppDb } from "../db/client.ts";
import {
  manufacturers,
  componentFamilies,
  componentModels,
  componentVariants,
  knowledgeSources,
  technicalDocuments,
  technicalSpecifications,
  toolsConsumables,
} from "../db/schema-library-catalog.ts";
import {
  knowledgeArticles,
  articleVersions,
  articleVariantLinks,
} from "../db/schema-library-knowledge.ts";
import { publicationEvents } from "../db/schema-library-private.ts";
import { procedures, procedureSteps, procedureSpecs } from "../db/schema-library-procedures.ts";
import { libraryPackSchema, variantKey } from "./content-pack-schema.ts";
import type { LibraryPack } from "./content-pack-schema.ts";

export { libraryPackSchema };
export type { LibraryPack };
type Summary = { ok: true; created: Record<string, number>; skipped: Record<string, number> };
type ImportResult = Summary | { ok: false; code: "validation_error"; issues: string[] };
type Entity = (typeof entities)[number];
type Counters = Record<Entity, number>;
type Context = {
  tx: AppDb;
  now: Date;
  result: Summary & { created: Counters; skipped: Counters };
  ids: Record<Entity, Map<string, string>>;
};
const entities = [
  "manufacturers",
  "families",
  "models",
  "variants",
  "sources",
  "documents",
  "specifications",
  "tools",
  "articles",
  "articleVersions",
  "articleVariantLinks",
  "publicationEvents",
] as const;

class DryRunRollback extends Error {
  readonly result: Summary;
  constructor(result: Summary) {
    super("Importación de prueba revertida");
    this.result = result;
  }
}

function context(tx: AppDb, now: Date): Context {
  const zero = () => Object.fromEntries(entities.map((key) => [key, 0])) as Counters;
  return {
    tx,
    now,
    result: { ok: true, created: zero(), skipped: zero() },
    ids: Object.fromEntries(
      entities.map((key) => [key, new Map<string, string>()]),
    ) as Context["ids"],
  };
}

function id(ctx: Context, entity: Entity, key: string): string {
  const value = ctx.ids[entity]?.get(key);
  if (!value) throw new Error(`Referencia no resuelta: ${entity}`);
  return value;
}

function optionalId(ctx: Context, entity: Entity, key: string | undefined) {
  return key === undefined ? undefined : id(ctx, entity, key);
}

async function insertMissing<
  T extends PgTable & { id: AnyPgColumn<{ data: string; notNull: true }> },
>(
  ctx: Context,
  entity: Entity,
  table: T,
  key: string,
  where: SQL | undefined,
  values: InferInsertModel<T>,
) {
  const [existing] = await ctx.tx
    .select({ id: table.id })
    .from(table as PgTable)
    .where(where)
    .limit(1);
  if (existing) {
    ctx.ids[entity].set(key, existing.id);
    ctx.result.skipped[entity]++;
    return { id: existing.id, created: false };
  }
  const [row] = await ctx.tx.insert(table).values(values).returning({ id: table.id });
  if (!row) throw new Error(`No se pudo insertar: ${entity}`);
  ctx.ids[entity].set(key, row.id);
  ctx.result.created[entity]++;
  return { id: row.id, created: true };
}

function timestamps(ctx: Context) {
  return { createdAt: ctx.now, updatedAt: ctx.now };
}

async function importCatalog(ctx: Context, pack: LibraryPack) {
  for (const row of pack.manufacturers)
    await insertMissing(
      ctx,
      "manufacturers",
      manufacturers,
      row.slug,
      eq(manufacturers.slug, row.slug),
      { ...row, ...timestamps(ctx) },
    );
  for (const { manufacturer, ...row } of pack.families) {
    const manufacturerId = id(ctx, "manufacturers", manufacturer);
    await insertMissing(
      ctx,
      "families",
      componentFamilies,
      `${manufacturer}/${row.slug}`,
      and(
        eq(componentFamilies.manufacturerId, manufacturerId),
        eq(componentFamilies.slug, row.slug),
      ),
      { ...row, manufacturerId, ...timestamps(ctx) },
    );
  }
}

async function importModels(ctx: Context, pack: LibraryPack) {
  for (const { family, ...row } of pack.models) {
    const familyId = id(ctx, "families", family);
    await insertMissing(
      ctx,
      "models",
      componentModels,
      `${family}/${row.code}`,
      and(eq(componentModels.familyId, familyId), eq(componentModels.code, row.code)),
      { ...row, familyId, ...timestamps(ctx) },
    );
  }
  for (const variant of pack.variants) {
    const { model, ...row } = variant;
    const modelId = id(ctx, "models", model);
    await insertMissing(
      ctx,
      "variants",
      componentVariants,
      variantKey(variant),
      and(
        eq(componentVariants.modelId, modelId),
        eq(componentVariants.code, row.code),
        eq(componentVariants.revision, row.revision),
      ),
      { ...row, modelId, ...timestamps(ctx) },
    );
  }
}

async function importDocuments(ctx: Context, pack: LibraryPack) {
  for (const row of pack.sources)
    await insertMissing(
      ctx,
      "sources",
      knowledgeSources,
      row.url,
      eq(knowledgeSources.url, row.url),
      { ...row, ...timestamps(ctx) },
    );
  for (const { manufacturer, source, variant, ...row } of pack.documents) {
    const result = await insertMissing(
      ctx,
      "documents",
      technicalDocuments,
      JSON.stringify([row.canonicalUrl, row.revision]),
      and(
        eq(technicalDocuments.canonicalUrl, row.canonicalUrl),
        eq(technicalDocuments.revision, row.revision),
      ),
      {
        ...row,
        manufacturerId: optionalId(ctx, "manufacturers", manufacturer),
        sourceId: optionalId(ctx, "sources", source),
        variantId: optionalId(ctx, "variants", variant),
        ...timestamps(ctx),
      },
    );
    // Las referencias documentales del formato usan URL; la primera revisión de esa URL la resuelve.
    if (!ctx.ids.documents.has(row.canonicalUrl))
      ctx.ids.documents.set(row.canonicalUrl, result.id);
  }
}

async function importSpecifications(ctx: Context, pack: LibraryPack) {
  for (const { variant, sourceDocument, ...row } of pack.specifications) {
    const variantId = id(ctx, "variants", variant);
    await insertMissing(
      ctx,
      "specifications",
      technicalSpecifications,
      JSON.stringify([variant, row.kind, row.label]),
      and(
        eq(technicalSpecifications.variantId, variantId),
        eq(technicalSpecifications.kind, row.kind),
        eq(technicalSpecifications.label, row.label),
      ),
      {
        ...row,
        variantId,
        sourceDocumentId: optionalId(ctx, "documents", sourceDocument),
        ...timestamps(ctx),
      },
    );
  }
  for (const { manufacturer, ...row } of pack.tools)
    await insertMissing(
      ctx,
      "tools",
      toolsConsumables,
      JSON.stringify([row.name, row.kind]),
      and(eq(toolsConsumables.name, row.name), eq(toolsConsumables.kind, row.kind)),
      {
        ...row,
        manufacturerId: optionalId(ctx, "manufacturers", manufacturer),
        ...timestamps(ctx),
      },
    );
}

/** Solo se llama para la primera versión de un artículo recién creado. */
async function importPackProcedure(
  db: AppDb,
  versionId: string,
  input: LibraryPack["articles"][number]["procedure"],
  specificationIds: Map<string, string>,
  now: Date,
) {
  if (!input) return;
  const { steps, specs, ...procedure } = input;
  const timestamps = { createdAt: now, updatedAt: now };
  const [row] = await db
    .insert(procedures)
    .values({ ...procedure, versionId, ...timestamps })
    .returning({ id: procedures.id });
  if (!row) throw new Error("No se pudo crear el procedimiento");
  await db
    .insert(procedureSteps)
    .values(steps.map((step) => ({ ...step, procedureId: row.id, ...timestamps })));
  if (specs?.length)
    await db.insert(procedureSpecs).values(
      specs.map((spec) => {
        const specificationId = specificationIds.get(
          JSON.stringify([spec.variant, spec.kind, spec.label]),
        );
        if (!specificationId)
          throw new Error("Referencia no resuelta: especificación del procedimiento");
        return { procedureId: row.id, specificationId, ...timestamps };
      }),
    );
}

async function importVersion(
  ctx: Context,
  articleId: string,
  row: LibraryPack["articles"][number],
  actorId: string | null,
) {
  const { sources, ...version } = row.version;
  const [created] = await ctx.tx
    .insert(articleVersions)
    .values({
      ...version,
      articleId,
      sources: sources?.map(({ document, source, note }) => ({
        documentId: optionalId(ctx, "documents", document),
        sourceId: optionalId(ctx, "sources", source),
        note,
      })),
      contentHash: createHash("sha256").update(version.contentMd).digest("hex"),
      publishedAt: ctx.now,
      reviewedBy: actorId,
      ...timestamps(ctx),
    })
    .returning({ id: articleVersions.id });
  if (!created) throw new Error("No se pudo crear la versión");
  ctx.result.created.articleVersions++;
  // Única actualización: enlazar la versión del artículo que acaba de insertarse.
  await ctx.tx
    .update(knowledgeArticles)
    .set({ currentVersionId: created.id, updatedAt: ctx.now })
    .where(eq(knowledgeArticles.id, articleId));
  await importArticleLinks(ctx, articleId, created.id, row.variants ?? [], actorId);
  await importPackProcedure(ctx.tx, created.id, row.procedure, ctx.ids.specifications, ctx.now);
}

async function importArticleLinks(
  ctx: Context,
  articleId: string,
  versionId: string,
  variants: string[],
  actorId: string | null,
) {
  for (const variant of variants) {
    await ctx.tx.insert(articleVariantLinks).values({
      versionId,
      variantId: id(ctx, "variants", variant),
      ...timestamps(ctx),
    });
    ctx.result.created.articleVariantLinks++;
  }
  if (actorId !== null) {
    await ctx.tx.insert(publicationEvents).values({
      articleId,
      versionId,
      actorId,
      operation: "import",
      ...timestamps(ctx),
    });
    ctx.result.created.publicationEvents++;
  } else ctx.result.skipped.publicationEvents++;
}

async function importArticles(ctx: Context, pack: LibraryPack, actorId: string | null) {
  for (const row of pack.articles) {
    const { variants: _variants, version: _version, procedure: _procedure, ...article } = row;
    const result = await insertMissing(
      ctx,
      "articles",
      knowledgeArticles,
      row.slug,
      eq(knowledgeArticles.slug, row.slug),
      { ...article, status: "publicado", createdBy: actorId, ...timestamps(ctx) },
    );
    if (result.created) await importVersion(ctx, result.id, row, actorId);
    else {
      ctx.result.skipped.articleVersions++;
      ctx.result.skipped.articleVariantLinks += row.variants?.length ?? 0;
      ctx.result.skipped.publicationEvents++;
    }
  }
}

export async function importLibraryPack(
  db: AppDb,
  actorId: string | null,
  pack: LibraryPack,
  now: Date,
  options: { dryRun: boolean },
): Promise<ImportResult> {
  const parsed = libraryPackSchema.safeParse(pack);
  if (!parsed.success)
    return {
      ok: false,
      code: "validation_error",
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  try {
    return await db.transaction(async (tx) => {
      // Serializa importadores también para las claves sin índice único (especificaciones y herramientas).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"library-content-pack"}))`);
      const ctx = context(tx, now);
      await importCatalog(ctx, parsed.data);
      await importModels(ctx, parsed.data);
      await importDocuments(ctx, parsed.data);
      await importSpecifications(ctx, parsed.data);
      await importArticles(ctx, parsed.data, actorId);
      if (options.dryRun) throw new DryRunRollback(ctx.result);
      return ctx.result;
    });
  } catch (error) {
    if (error instanceof DryRunRollback) return error.result;
    throw error;
  }
}
