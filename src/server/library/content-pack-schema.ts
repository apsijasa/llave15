import { z } from "zod";
import { ARTICLE_KINDS, LIBRARY_CATEGORIES, SPEC_KINDS, VALIDATION_STATUSES } from "./rules.ts";

const text = z.string().min(1);
const key = text.regex(/^[^/@]+$/);
const category = z.enum(LIBRARY_CATEGORIES);
const status = z.enum(["vigente", "descontinuado", "en_revision"]).optional();
const revision = z
  .string()
  .regex(/^[^/@]*$/)
  .default("");
const policy = z.enum(["enlace", "extracto_permitido", "copia_autorizada"]).optional();
const date = z.iso.date().optional();
const sourceReference = z.strictObject({
  document: z.url().optional(),
  source: z.url().optional(),
  note: z.string().optional(),
});
const manufacturerSchema = z.strictObject({
  slug: key,
  name: text,
  aliases: z.array(text).optional(),
  officialSiteUrl: z.url().optional(),
  status: z.enum(["activo", "inactivo"]).optional(),
});
const familySchema = z.strictObject({ manufacturer: key, slug: key, name: text, category });
const modelSchema = z.strictObject({
  family: text,
  code: key,
  name: text,
  componentType: text,
  generation: text.optional(),
  speeds: z.int().min(1).max(14).nullable().optional(),
  status,
});
const variantSchema = z.strictObject({
  model: text,
  code: key,
  revision,
  yearFrom: z.int().optional(),
  yearTo: z.int().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  status,
});
const sourceSchema = z.strictObject({
  url: z.url(),
  publisher: text,
  title: text,
  publishedOn: date,
  reviewedOn: date,
  authority: z.enum(["oficial", "comunidad_verificada", "comunidad", "historico"]),
  usagePolicy: policy,
  notes: z.string().optional(),
});
const documentSchema = z.strictObject({
  canonicalUrl: z.url(),
  revision,
  title: text,
  manufacturer: key.optional(),
  source: z.url().optional(),
  license: policy,
  docType: z.enum(["manual", "despiece", "boletin", "guia", "otro"]),
  language: text.optional(),
  variant: text.optional(),
  checksum: text.optional(),
  status: z.enum(["vigente", "desactualizado", "retirado"]).optional(),
});
const specificationSchema = z.strictObject({
  variant: text,
  kind: z.enum(SPEC_KINDS),
  label: text,
  valueText: z.string(),
  unit: text.optional(),
  tolerance: text.optional(),
  context: z.string().optional(),
  sourceDocument: z.url().optional(),
  validationStatus: z.enum(VALIDATION_STATUSES).optional(),
  reviewedOn: date,
});
const toolSchema = z.strictObject({
  code: key.optional(),
  name: text,
  kind: z.enum(["herramienta", "consumible"]),
  category,
  manufacturer: key.optional(),
  specification: z.string().optional(),
  usage: z.string().optional(),
  restrictions: z.string().optional(),
});
const articleSchema = z.strictObject({
  slug: key,
  title: text,
  category,
  topic: text.optional(),
  language: text.optional(),
  kind: z.enum(ARTICLE_KINDS),
  variants: z.array(text).optional(),
  version: z.strictObject({
    number: z.literal(1),
    contentMd: text,
    summary: z.string().optional(),
    sources: z.array(sourceReference).optional(),
    validFrom: date,
  }),
});
const packSchema = z.strictObject({
  version: z.literal(1),
  generatedAt: z.iso.datetime(),
  manufacturers: z.array(manufacturerSchema),
  families: z.array(familySchema),
  models: z.array(modelSchema),
  variants: z.array(variantSchema),
  sources: z.array(sourceSchema),
  documents: z.array(documentSchema),
  specifications: z.array(specificationSchema),
  tools: z.array(toolSchema),
  articles: z.array(articleSchema),
});
export type LibraryPack = z.infer<typeof packSchema>;

export function variantKey(row: LibraryPack["variants"][number]): string {
  return `${row.model}/${row.code}${row.revision ? `@${row.revision}` : ""}`;
}

function referenceChecker(ctx: z.RefinementCtx) {
  return (
    keys: Set<string>,
    value: string | undefined,
    path: (string | number)[],
    owner: string,
  ): void => {
    if (value !== undefined && !keys.has(value))
      ctx.addIssue({ code: "custom", path, message: `${owner}: referencia inexistente ${value}` });
  };
}

function catalogReferences(pack: LibraryPack, ctx: z.RefinementCtx) {
  const check = referenceChecker(ctx);
  const manufacturers = new Set(pack.manufacturers.map((row) => row.slug));
  const families = new Set(pack.families.map((row) => `${row.manufacturer}/${row.slug}`));
  const models = new Set(pack.models.map((row) => `${row.family}/${row.code}`));
  pack.families.forEach((row, i) => {
    check(manufacturers, row.manufacturer, ["families", i, "manufacturer"], row.slug);
  });
  pack.models.forEach((row, i) => {
    check(families, row.family, ["models", i, "family"], row.code);
  });
  pack.variants.forEach((row, i) => {
    check(models, row.model, ["variants", i, "model"], variantKey(row));
    if (row.yearFrom !== undefined && row.yearTo !== undefined && row.yearTo < row.yearFrom)
      ctx.addIssue({
        code: "custom",
        path: ["variants", i, "yearTo"],
        message: `${row.code}: rango de años inválido`,
      });
  });
  pack.tools.forEach((row, i) => {
    check(manufacturers, row.manufacturer, ["tools", i, "manufacturer"], row.name);
  });
  pack.documents.forEach((row, i) => {
    check(manufacturers, row.manufacturer, ["documents", i, "manufacturer"], row.title);
    check(
      new Set(pack.sources.map((source) => source.url)),
      row.source,
      ["documents", i, "source"],
      row.title,
    );
    check(
      new Set(pack.variants.map(variantKey)),
      row.variant,
      ["documents", i, "variant"],
      row.title,
    );
  });
}

function knowledgeReferences(pack: LibraryPack, ctx: z.RefinementCtx) {
  const check = referenceChecker(ctx);
  const variants = new Set(pack.variants.map(variantKey));
  const documents = new Set(pack.documents.map((row) => row.canonicalUrl));
  const sources = new Set(pack.sources.map((row) => row.url));
  pack.specifications.forEach((row, i) => {
    check(variants, row.variant, ["specifications", i, "variant"], row.label);
    check(documents, row.sourceDocument, ["specifications", i, "sourceDocument"], row.label);
    if (row.validationStatus === "verificado" && !row.sourceDocument)
      ctx.addIssue({
        code: "custom",
        path: ["specifications", i, "sourceDocument"],
        message: `${row.label}: una especificación verificada exige documento`,
      });
  });
  pack.articles.forEach((row, i) => {
    row.variants?.forEach((value, j) => {
      check(variants, value, ["articles", i, "variants", j], row.slug);
    });
    row.version.sources?.forEach((value, j) => {
      check(
        documents,
        value.document,
        ["articles", i, "version", "sources", j, "document"],
        row.slug,
      );
      check(sources, value.source, ["articles", i, "version", "sources", j, "source"], row.slug);
    });
  });
}

function uniqueKeys(pack: LibraryPack, ctx: z.RefinementCtx) {
  const groups = {
    manufacturers: pack.manufacturers.map((r) => r.slug),
    families: pack.families.map((r) => `${r.manufacturer}/${r.slug}`),
    models: pack.models.map((r) => `${r.family}/${r.code}`),
    variants: pack.variants.map(variantKey),
    sources: pack.sources.map((r) => r.url),
    documents: pack.documents.map((r) => JSON.stringify([r.canonicalUrl, r.revision])),
    specifications: pack.specifications.map((r) => JSON.stringify([r.variant, r.kind, r.label])),
    tools: pack.tools.map((r) => JSON.stringify([r.name, r.kind])),
    articles: pack.articles.map((r) => r.slug),
  };
  for (const [group, keys] of Object.entries(groups)) {
    const seen = new Set<string>();
    keys.forEach((value, i) => {
      if (seen.has(value))
        ctx.addIssue({ code: "custom", path: [group, i], message: `Clave repetida: ${value}` });
      seen.add(value);
    });
  }
}

export const libraryPackSchema = packSchema.superRefine((pack, ctx) => {
  uniqueKeys(pack, ctx);
  catalogReferences(pack, ctx);
  knowledgeReferences(pack, ctx);
});
