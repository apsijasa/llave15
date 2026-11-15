import { and, eq, inArray } from "drizzle-orm";
import type { AppDb } from "../db/client.ts";
import {
  articleVersions,
  documentChunks,
  knowledgeArticles,
} from "../db/schema-library-knowledge.ts";
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
        section: chunk.section,
      },
    })),
  );
  return chunks.length;
}
