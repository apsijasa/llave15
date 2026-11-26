import { randomUUID } from "node:crypto";
import { and, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { log } from "../../lib/log.ts";
import { localToday, TIMEZONE } from "../../lib/time.ts";
import { jsonResponse } from "../api/handlers.ts";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { purchaseImports } from "../db/schema-purchase-imports.ts";
import { InvalidImageError, processDocumentImage } from "../storage/images.ts";
import type { ObjectStorage } from "../storage/storage.ts";
import type { InvoiceDocument, InvoiceExtractor, ExtractOutcome } from "./invoice-extract.ts";
import { extractionSchema, isPdf, pdfPageCount } from "./invoice-normalize.ts";
import type { InvoiceExtraction } from "./invoice-normalize.ts";
import { matchLines, matchSupplier } from "./purchase-import-match.ts";
import type { LineView, SupplierMatch } from "./purchase-import-match.ts";
import {
  INVOICE_IMPORT_MAX_BYTES,
  INVOICE_IMPORT_MAX_PAGES,
  INVOICE_IMPORTS_PER_BRANCH_PER_DAY,
  INVOICE_PROMPT_VERSION,
} from "./rules.ts";

export function importKey(importId: string, type: "pdf" | "jpg"): string {
  return `purchases/imports/${z.uuid().parse(importId)}/documento.${type}`;
}
export type ImportStartResult =
  | { ok: true; importId: string }
  | {
      ok: false;
      code:
        | "forbidden"
        | "unavailable"
        | "invalid_file"
        | "too_large"
        | "too_many_pages"
        | "quota"
        | "extraction_failed";
    };
const permitted = (actor: SessionUser) =>
  can(actor.role, "purchases.manage") && can(actor.role, "costs.view");
const scope = (actor: SessionUser, id: string) =>
  and(eq(purchaseImports.branchId, actor.branchId), eq(purchaseImports.id, id));
async function prepare(
  bytes: Buffer,
): Promise<
  { doc: InvoiceDocument; pages: number | null } | { code: "invalid_file" | "too_many_pages" }
> {
  if (isPdf(bytes)) {
    const pages = pdfPageCount(bytes);
    return pages !== null && pages > INVOICE_IMPORT_MAX_PAGES
      ? { code: "too_many_pages" }
      : { doc: { type: "pdf", bytes }, pages };
  }
  try {
    const image = await processDocumentImage(bytes);
    return { doc: { type: "jpg", bytes: image.jpeg }, pages: null };
  } catch (error) {
    if (error instanceof InvalidImageError) return { code: "invalid_file" };
    throw error;
  }
}
async function quotaReached(db: AppDb, actor: SessionUser, now: Date) {
  const [row] = await db
    .select({ total: count() })
    .from(purchaseImports)
    .where(
      and(
        eq(purchaseImports.branchId, actor.branchId),
        sql`(created_at at time zone ${TIMEZONE})::date = ${localToday(now)}`,
      ),
    );
  return (row?.total ?? 0) >= INVOICE_IMPORTS_PER_BRANCH_PER_DAY;
}
async function saveExtraction(
  db: AppDb,
  actor: SessionUser,
  id: string,
  key: string,
  prepared: { doc: InvoiceDocument; pages: number | null },
  extractor: InvoiceExtractor,
  outcome: ExtractOutcome,
  now: Date,
) {
  const success = outcome.ok ? extractionSchema.parse(outcome.extraction) : null;
  await db.insert(purchaseImports).values({
    id,
    branchId: actor.branchId,
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
    status: outcome.ok ? "extraida" : "fallida",
    fileKey: outcome.ok ? key : null,
    fileType: prepared.doc.type,
    fileBytes: prepared.doc.bytes.length,
    pages: prepared.pages,
    provider: extractor.name,
    model: extractor.model,
    promptVersion: INVOICE_PROMPT_VERSION,
    tokensIn: outcome.ok ? outcome.tokensIn : 0,
    tokensOut: outcome.ok ? outcome.tokensOut : 0,
    extraction: success ?? {},
    warnings: success?.warnings ?? [],
    errorCode: outcome.ok ? null : outcome.code,
  });
}
export async function startPurchaseImport(
  db: AppDb,
  storage: ObjectStorage,
  actor: SessionUser,
  extractor: InvoiceExtractor,
  file: { bytes: Buffer; type: string },
  now: Date,
): Promise<ImportStartResult> {
  if (!permitted(actor)) return { ok: false, code: "forbidden" };
  if (extractor.name === "none") return { ok: false, code: "unavailable" };
  if (!file.bytes.length || file.bytes.length > INVOICE_IMPORT_MAX_BYTES)
    return { ok: false, code: "too_large" };
  const prepared = await prepare(file.bytes);
  if ("code" in prepared) return { ok: false, code: prepared.code };
  if (await quotaReached(db, actor, now)) return { ok: false, code: "quota" };
  const id = randomUUID();
  const key = importKey(id, prepared.doc.type);
  await storage.put(
    key,
    prepared.doc.bytes,
    prepared.doc.type === "pdf" ? "application/pdf" : "image/jpeg",
  );
  try {
    const outcome = await extractor.extract(prepared.doc);
    if (!outcome.ok) {
      await storage.delete(key);
      log.error("purchase_import.failed", { code: outcome.code });
    }
    await saveExtraction(db, actor, id, key, prepared, extractor, outcome, now);
    return outcome.ok ? { ok: true, importId: id } : { ok: false, code: "extraction_failed" };
  } catch (error) {
    await storage.delete(key);
    throw error;
  }
}
export type PurchaseImportView = {
  id: string;
  status: string;
  fileType: "pdf" | "jpg";
  documentUrl: string | null;
  createdAt: Date;
  extraction: InvoiceExtraction;
  warnings: string[];
  supplierMatch: SupplierMatch;
  lines: LineView[];
  purchaseOrderId: string | null;
  errorCode: string | null;
};
const documentUrl = (id: string) => `/taller/compras/factura/${id}/documento`;
export async function getPurchaseImport(
  db: AppDb,
  actor: SessionUser,
  id: string,
): Promise<PurchaseImportView | null> {
  if (!permitted(actor) || !z.uuid().safeParse(id).success) return null;
  const [row] = await db.select().from(purchaseImports).where(scope(actor, id));
  if (!row) return null;
  // Las fallidas guardan {} por diseño y no tienen revisión ni costos.
  if (row.status === "fallida") return null;
  const extraction = extractionSchema.parse(row.extraction);
  return {
    id: row.id,
    status: row.status,
    fileType: z.enum(["pdf", "jpg"]).parse(row.fileType),
    documentUrl: row.fileKey ? documentUrl(id) : null,
    createdAt: row.createdAt,
    extraction,
    warnings: row.warnings,
    supplierMatch: await matchSupplier(db, actor, extraction.supplier),
    lines: await matchLines(db, actor, extraction.lines),
    purchaseOrderId: row.purchaseOrderId,
    errorCode: row.errorCode,
  };
}
export async function getPurchaseImportForPurchase(
  db: AppDb,
  actor: SessionUser,
  purchaseId: string,
): Promise<{ id: string; documentUrl: string } | null> {
  if (!can(actor.role, "purchases.manage") || !z.uuid().safeParse(purchaseId).success) return null;
  const [row] = await db
    .select({ id: purchaseImports.id })
    .from(purchaseImports)
    .where(
      and(
        eq(purchaseImports.branchId, actor.branchId),
        eq(purchaseImports.purchaseOrderId, purchaseId),
      ),
    );
  return row ? { id: row.id, documentUrl: documentUrl(row.id) } : null;
}
export async function discardPurchaseImport(
  db: AppDb,
  actor: SessionUser,
  id: string,
  now: Date,
): Promise<{ ok: true } | { ok: false; code: "forbidden" | "not_found" | "invalid_status" }> {
  if (!permitted(actor)) return { ok: false, code: "forbidden" };
  if (!z.uuid().safeParse(id).success) return { ok: false, code: "not_found" };
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(purchaseImports).where(scope(actor, id)).for("update");
    if (!row) return { ok: false, code: "not_found" };
    if (row.status !== "extraida") return { ok: false, code: "invalid_status" };
    await tx
      .update(purchaseImports)
      .set({ status: "descartada", discardedAt: now, updatedAt: now })
      .where(scope(actor, id));
    return { ok: true };
  });
}
const documentError = (status: number, code: string) =>
  jsonResponse(status, { error: "No se pudo abrir el documento.", code });
export async function getImportDocument(
  db: AppDb,
  storage: ObjectStorage,
  actor: SessionUser | null,
  id: string,
): Promise<Response> {
  if (!actor) return documentError(401, "unauthorized");
  if (!permitted(actor)) return documentError(403, "forbidden");
  if (!z.uuid().safeParse(id).success) return documentError(404, "not_found");
  const [row] = await db.select().from(purchaseImports).where(scope(actor, id));
  if (!row?.fileKey) return documentError(404, "not_found");
  const bytes = await storage.get(row.fileKey);
  if (!bytes) return documentError(404, "not_found");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": row.fileType === "pdf" ? "application/pdf" : "image/jpeg",
      "content-disposition": `inline; filename="documento-${id}.${row.fileType}"`,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
