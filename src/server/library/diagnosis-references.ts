import { eq } from "drizzle-orm";
import type { AppDb } from "../db/client.ts";
import {
  componentModels,
  componentVariants,
  technicalDocuments,
  technicalSpecifications,
} from "../db/schema-library-catalog.ts";
import { articleVersions, knowledgeArticles } from "../db/schema-library-knowledge.ts";
import { procedures } from "../db/schema-library-procedures.ts";

export type ReferenceKind =
  | "article_version"
  | "specification"
  | "procedure"
  | "document"
  | "variant";
export type Reference = { kind: ReferenceKind; id: string; versionNumber?: number };

export type DescribedReference = Reference & { label: string; href: string };
const REFERENCE_NOUNS: Record<ReferenceKind, string> = {
  article_version: "Artículo",
  specification: "Especificación",
  procedure: "Procedimiento",
  document: "Documento",
  variant: "Variante",
};

async function referenceTitle(db: AppDb, ref: Reference): Promise<{ title: string; href: string }> {
  if (ref.kind === "article_version") {
    const [row] = await db
      .select({ title: knowledgeArticles.title })
      .from(articleVersions)
      .innerJoin(knowledgeArticles, eq(knowledgeArticles.id, articleVersions.articleId))
      .where(eq(articleVersions.id, ref.id));
    const title = row?.title ?? "Artículo retirado";
    return { title, href: `/taller/biblioteca/buscar?q=${encodeURIComponent(title)}` };
  }
  if (ref.kind === "variant" || ref.kind === "specification") {
    const variantId = ref.kind === "variant" ? ref.id : await specificationVariant(db, ref.id);
    const [row] = variantId
      ? await db
          .select({ code: componentVariants.code, name: componentModels.name })
          .from(componentVariants)
          .innerJoin(componentModels, eq(componentModels.id, componentVariants.modelId))
          .where(eq(componentVariants.id, variantId))
      : [];
    return {
      title: row ? `${row.code} · ${row.name}` : "Componente",
      href: `/taller/biblioteca/componentes/${variantId ?? ""}`,
    };
  }
  if (ref.kind === "procedure") {
    const [row] = await db
      .select({ title: procedures.title })
      .from(procedures)
      .where(eq(procedures.id, ref.id));
    return {
      title: row?.title ?? "Procedimiento",
      href: `/taller/biblioteca/procedimientos/${ref.id}`,
    };
  }
  const [row] = await db
    .select({ title: technicalDocuments.title })
    .from(technicalDocuments)
    .where(eq(technicalDocuments.id, ref.id));
  return { title: row?.title ?? "Documento", href: `/taller/biblioteca/documentos/${ref.id}` };
}

async function specificationVariant(db: AppDb, id: string): Promise<string | null> {
  const [row] = await db
    .select({ variantId: technicalSpecifications.variantId })
    .from(technicalSpecifications)
    .where(eq(technicalSpecifications.id, id));
  return row?.variantId ?? null;
}

/** Título legible y enlace interno de cada referencia guardada; nunca muestra ids. */
export async function describeReferences(
  db: AppDb,
  refs: readonly Reference[],
): Promise<DescribedReference[]> {
  const described: DescribedReference[] = [];
  for (const ref of refs) {
    const { title, href } = await referenceTitle(db, ref);
    const version = ref.versionNumber ? ` · versión ${ref.versionNumber}` : "";
    described.push({ ...ref, label: `${REFERENCE_NOUNS[ref.kind]} · ${title}${version}`, href });
  }
  return described;
}
