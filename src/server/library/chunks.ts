import { and, asc, eq, inArray } from "drizzle-orm";
import type { AppDb } from "../db/client.ts";
import {
  componentModels,
  componentVariants,
  knowledgeSources,
  technicalDocuments,
  technicalSpecifications,
} from "../db/schema-library-catalog.ts";
import {
  articleVersions,
  documentChunks,
  knowledgeArticles,
} from "../db/schema-library-knowledge.ts";
import { procedureSteps, procedures } from "../db/schema-library-procedures.ts";
import { CHUNK_MAX_CHARS } from "./rules.ts";

export type TextChunk = { index: number; text: string; section: string | null };

const HEADING = /^#{1,6}\s+(.+)$/;

/** Corta en el último límite de oración o de palabra antes de `max`. */
function splitLong(paragraph: string, max: number): string[] {
  const parts: string[] = [];
  let rest = paragraph.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "));
    const space = window.lastIndexOf(" ");
    const cut = sentence > max / 2 ? sentence + 1 : space > 0 ? space : max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

type Block = { text: string; section: string | null; heading: boolean };

function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  let section: string | null = null;
  for (const raw of text.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const paragraph = raw.trim();
    if (!paragraph) continue;
    const heading = HEADING.exec(paragraph.split("\n")[0] ?? "");
    if (heading) section = heading[1]?.trim() ?? section;
    blocks.push({ text: paragraph, section, heading: heading !== null });
  }
  return blocks;
}

/** Trozos de hasta `max` caracteres, cortados en encabezados y párrafos. */
export function chunkText(text: string, max = CHUNK_MAX_CHARS): TextChunk[] {
  const chunks: TextChunk[] = [];
  let current = "";
  let section: string | null = null;
  const flush = () => {
    if (current.trim()) chunks.push({ index: chunks.length, text: current.trim(), section });
    current = "";
  };
  for (const block of blocksOf(text)) {
    if (block.heading) flush();
    if (block.heading || !current) section = block.section;
    for (const piece of splitLong(block.text, max)) {
      if (current && current.length + piece.length + 2 > max) {
        flush();
        section = block.section;
      }
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  flush();
  return chunks;
}

/** Quita los trozos indexados de todas las versiones de un artículo (índice derivado, se regenera). */
export async function removeArticleChunks(tx: AppDb, articleId: string): Promise<void> {
  const versions = await tx
    .select({ id: articleVersions.id })
    .from(articleVersions)
    .where(eq(articleVersions.articleId, articleId));
  if (versions.length === 0) return;
  await tx.delete(documentChunks).where(
    and(
      eq(documentChunks.sourceKind, "article_version"),
      inArray(
        documentChunks.sourceId,
        versions.map((version) => version.id),
      ),
    ),
  );
}

type VersionSource = { documentId?: string; sourceId?: string };
const AUTHORITY_ORDER = ["oficial", "comunidad_verificada", "comunidad", "historico"];

/** La autoridad más alta entre las fuentes citadas por la versión; `null` si no cita ninguna. */
async function versionAuthority(
  tx: AppDb,
  sources: readonly VersionSource[],
): Promise<string | null> {
  const sourceIds = sources.flatMap((source) => (source.sourceId ? [source.sourceId] : []));
  const documentIds = sources.flatMap((source) => (source.documentId ? [source.documentId] : []));
  if (documentIds.length) {
    const docs = await tx
      .select({ sourceId: technicalDocuments.sourceId })
      .from(technicalDocuments)
      .where(inArray(technicalDocuments.id, documentIds));
    for (const doc of docs) if (doc.sourceId) sourceIds.push(doc.sourceId);
  }
  if (sourceIds.length === 0) return null;
  const rows = await tx
    .select({ authority: knowledgeSources.authority })
    .from(knowledgeSources)
    .where(inArray(knowledgeSources.id, sourceIds));
  const ranks = rows
    .map((row) => AUTHORITY_ORDER.indexOf(row.authority))
    .filter((rank) => rank >= 0);
  return ranks.length ? (AUTHORITY_ORDER[Math.min(...ranks)] ?? null) : null;
}

/** Vuelve a crear los trozos de una versión; devuelve cuántos quedaron. */
export async function reindexVersion(tx: AppDb, versionId: string): Promise<number> {
  const [row] = await tx
    .select({ version: articleVersions, article: knowledgeArticles })
    .from(articleVersions)
    .innerJoin(knowledgeArticles, eq(knowledgeArticles.id, articleVersions.articleId))
    .where(eq(articleVersions.id, versionId));
  if (!row) throw new Error("Versión inexistente al indexar.");
  await tx
    .delete(documentChunks)
    .where(
      and(eq(documentChunks.sourceKind, "article_version"), eq(documentChunks.sourceId, versionId)),
    );
  const { version, article } = row;
  const authority = await versionAuthority(tx, version.sources);
  const body = [`# ${article.title}`, version.summary, version.contentMd]
    .filter(Boolean)
    .join("\n\n");
  const chunks = chunkText(body);
  if (chunks.length === 0) return 0;
  await tx.insert(documentChunks).values(
    chunks.map((chunk) => ({
      sourceKind: "article_version",
      sourceId: versionId,
      chunkIndex: chunk.index,
      text: chunk.text,
      metadata: {
        articleId: article.id,
        slug: article.slug,
        title: article.title,
        category: article.category,
        kind: article.kind,
        versionNumber: version.number,
        authority,
        section: chunk.section,
      },
    })),
  );
  return chunks.length;
}

type ChunkRow = typeof documentChunks.$inferInsert;

async function replaceChunks(
  tx: AppDb,
  sourceKind: "specification" | "procedure" | "document",
  sourceId: string,
  text: string,
  metadata: Record<string, unknown>,
): Promise<number> {
  await tx
    .delete(documentChunks)
    .where(and(eq(documentChunks.sourceKind, sourceKind), eq(documentChunks.sourceId, sourceId)));
  const rows: ChunkRow[] = chunkText(text).map((chunk) => ({
    sourceKind,
    sourceId,
    chunkIndex: chunk.index,
    text: chunk.text,
    metadata: { ...metadata, section: chunk.section },
  }));
  if (rows.length > 0) await tx.insert(documentChunks).values(rows);
  return rows.length;
}

/** Un trozo por variante con sus especificaciones, cada una con su estado. */
export async function reindexSpecifications(tx: AppDb, variantId: string): Promise<number> {
  const [variant] = await tx
    .select({
      code: componentVariants.code,
      revision: componentVariants.revision,
      modelName: componentModels.name,
    })
    .from(componentVariants)
    .innerJoin(componentModels, eq(componentModels.id, componentVariants.modelId))
    .where(eq(componentVariants.id, variantId));
  if (!variant) throw new Error("Variante inexistente al indexar.");
  const specs = await tx
    .select()
    .from(technicalSpecifications)
    .where(eq(technicalSpecifications.variantId, variantId))
    .orderBy(asc(technicalSpecifications.kind), asc(technicalSpecifications.label));
  if (specs.length === 0) return replaceChunks(tx, "specification", variantId, "", {});
  const lines = specs.map((spec) => {
    const value = spec.valueText
      ? `${spec.valueText}${spec.unit ? ` ${spec.unit}` : ""}`
      : "sin dato";
    return `- ${spec.label}: ${value} (${spec.validationStatus})`;
  });
  const title = `${variant.code}${variant.revision ? ` rev. ${variant.revision}` : ""} — ${variant.modelName}`;
  return replaceChunks(
    tx,
    "specification",
    variantId,
    `# Especificaciones ${title}\n\n${lines.join("\n")}`,
    {
      variantId,
      code: variant.code,
      modelName: variant.modelName,
      title,
    },
  );
}

/** Título, requisitos, pasos numerados y controles finales de un procedimiento. */
export async function reindexProcedure(tx: AppDb, procedureId: string): Promise<number> {
  const [procedure] = await tx.select().from(procedures).where(eq(procedures.id, procedureId));
  if (!procedure) throw new Error("Procedimiento inexistente al indexar.");
  const steps = await tx
    .select()
    .from(procedureSteps)
    .where(eq(procedureSteps.procedureId, procedureId))
    .orderBy(asc(procedureSteps.sequence));
  const body = [
    `# ${procedure.title}`,
    procedure.prerequisites ? `Requisitos: ${procedure.prerequisites}` : "",
    steps
      .map((step) =>
        [
          `${step.sequence}. ${step.action}`,
          step.verification ? `Comprobación: ${step.verification}` : "",
          step.warning ? `Advertencia: ${step.warning}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      )
      .join("\n"),
    procedure.finalChecks ? `Controles finales: ${procedure.finalChecks}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return replaceChunks(tx, "procedure", procedureId, body, {
    procedureId,
    title: procedure.title,
    risk: procedure.risk,
  });
}

/** Extracto permitido por la licencia del documento, ingresado por el curador. */
export async function reindexDocumentExcerpt(
  tx: AppDb,
  documentId: string,
  excerpt: string,
): Promise<number> {
  const [document] = await tx
    .select({ title: technicalDocuments.title, license: technicalDocuments.license })
    .from(technicalDocuments)
    .where(eq(technicalDocuments.id, documentId));
  if (!document) throw new Error("Documento inexistente al indexar.");
  if (document.license === "enlace")
    throw new Error("El documento solo se enlaza: no admite extractos.");
  return replaceChunks(tx, "document", documentId, excerpt, { documentId, title: document.title });
}

/** Regenera el índice de todo el contenido global publicado; es idempotente. */
export async function reindexAll(db: AppDb): Promise<number> {
  return db.transaction(async (tx) => {
    let total = 0;
    const published = await tx
      .select({ versionId: knowledgeArticles.currentVersionId })
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.status, "publicado"));
    const currentVersions = published.flatMap((row) => (row.versionId ? [row.versionId] : []));
    for (const versionId of currentVersions) total += await reindexVersion(tx, versionId);
    const variants = await tx
      .selectDistinct({ id: technicalSpecifications.variantId })
      .from(technicalSpecifications);
    for (const variant of variants) total += await reindexSpecifications(tx, variant.id);
    const current = currentVersions.length
      ? await tx
          .select({ id: procedures.id })
          .from(procedures)
          .where(inArray(procedures.versionId, currentVersions))
      : [];
    for (const procedure of current) total += await reindexProcedure(tx, procedure.id);
    return total;
  });
}
