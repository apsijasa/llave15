import { and, asc, eq, getTableColumns } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import type { AppDb } from "../db/client.ts";
import type { ObjectStorage } from "../storage/storage.ts";
import {
  knowledgeSources,
  manufacturers,
  technicalDocuments,
} from "../db/schema-library-catalog.ts";
import type { TechnicalDocument } from "../db/schema-library-catalog.ts";
import { documentChunks } from "../db/schema-library-knowledge.ts";
import { canUseLibrary } from "./access.ts";
import type { DocumentHit } from "./search.ts";

type DocumentMetadata = TechnicalDocument & {
  manufacturerName: string | null;
  sourceTitle: string | null;
};
export type DocumentAccess =
  | { ok: true; mode: "enlace"; document: DocumentMetadata; href: string }
  | {
      ok: true;
      mode: "extracto";
      document: DocumentMetadata;
      href: string;
      excerpts: { chunkIndex: number; text: string }[];
    }
  | { ok: true; mode: "visor"; document: DocumentMetadata; href: string; mediaPath: string }
  | { ok: true; mode: "retirado"; document: DocumentMetadata }
  | { ok: false; code: "forbidden" | "not_found" };

const documentFilterSchema = z.object({
  manufacturerId: z.uuid().optional(),
  variantId: z.uuid().optional(),
});

async function documentMetadata(db: AppDb, id: string): Promise<DocumentMetadata | undefined> {
  const [document] = await db
    .select({
      ...getTableColumns(technicalDocuments),
      manufacturerName: manufacturers.name,
      sourceTitle: knowledgeSources.title,
    })
    .from(technicalDocuments)
    .leftJoin(manufacturers, eq(manufacturers.id, technicalDocuments.manufacturerId))
    .leftJoin(knowledgeSources, eq(knowledgeSources.id, technicalDocuments.sourceId))
    .where(eq(technicalDocuments.id, id))
    .limit(1);
  return document;
}

export async function documentAccess(
  db: AppDb,
  actor: SessionUser,
  id: string,
): Promise<DocumentAccess> {
  if (!canUseLibrary(actor)) return { ok: false, code: "forbidden" };
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, code: "not_found" };
  const document = await documentMetadata(db, parsed.data);
  if (!document) return { ok: false, code: "not_found" };
  if (document.status === "retirado") return { ok: true, mode: "retirado", document };
  const href = document.canonicalUrl;
  if (document.license === "copia_autorizada" && document.storageKey)
    return {
      ok: true,
      mode: "visor",
      document,
      href,
      mediaPath: documentFilePath(document.id),
    };
  if (document.license === "extracto_permitido") {
    const excerpts = await db
      .select({ chunkIndex: documentChunks.chunkIndex, text: documentChunks.text })
      .from(documentChunks)
      .where(
        and(eq(documentChunks.sourceKind, "document"), eq(documentChunks.sourceId, document.id)),
      )
      .orderBy(asc(documentChunks.chunkIndex));
    return { ok: true, mode: "extracto", document, href, excerpts };
  }
  return { ok: true, mode: "enlace", document, href };
}

/** Ruta interna del archivo autorizado: pasa por sesión y permiso, nunca por una URL del almacenamiento. */
export function documentFilePath(id: string): string {
  return `/taller/biblioteca/documentos/${id}/archivo`;
}

function fileError(status: 401 | 403 | 404, code: string): Response {
  return Response.json(
    { error: status === 404 ? "Documento no encontrado." : "No autorizado.", code },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function fileContentType(key: string): string {
  if (key.endsWith(".pdf")) return "application/pdf";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

/** Sirve el archivo de un documento con copia autorizada a un usuario con acceso a la biblioteca. */
export async function serveDocumentFile(
  db: AppDb,
  storage: ObjectStorage,
  actor: SessionUser | null,
  id: string,
): Promise<Response> {
  if (!actor) return fileError(401, "unauthorized");
  const access = await documentAccess(db, actor, id);
  if (!access.ok) return fileError(access.code === "forbidden" ? 403 : 404, access.code);
  if (access.mode !== "visor" || !access.document.storageKey) return fileError(404, "not_found");
  const body = await storage.get(access.document.storageKey);
  if (body === null) return fileError(404, "not_found");
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "content-type": fileContentType(access.document.storageKey),
      "content-disposition": "inline",
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function listDocuments(
  db: AppDb,
  actor: SessionUser,
  filter: { manufacturerId?: string; variantId?: string },
): Promise<DocumentHit[]> {
  if (!canUseLibrary(actor)) return [];
  const parsed = documentFilterSchema.safeParse(filter);
  if (!parsed.success) return [];
  return db
    .select({
      id: technicalDocuments.id,
      title: technicalDocuments.title,
      manufacturerName: manufacturers.name,
      docType: technicalDocuments.docType,
      language: technicalDocuments.language,
      revision: technicalDocuments.revision,
      license: technicalDocuments.license,
      status: technicalDocuments.status,
    })
    .from(technicalDocuments)
    .leftJoin(manufacturers, eq(manufacturers.id, technicalDocuments.manufacturerId))
    .where(
      and(
        parsed.data.manufacturerId
          ? eq(technicalDocuments.manufacturerId, parsed.data.manufacturerId)
          : undefined,
        parsed.data.variantId ? eq(technicalDocuments.variantId, parsed.data.variantId) : undefined,
      ),
    )
    .orderBy(asc(technicalDocuments.title));
}
