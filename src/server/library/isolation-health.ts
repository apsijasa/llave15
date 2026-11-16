import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import type { AppDb } from "../db/client.ts";
import { workOrders } from "../db/schema-orders.ts";
import { technicalSpecifications } from "../db/schema-library-catalog.ts";
import { documentChunks, knowledgeArticles } from "../db/schema-library-knowledge.ts";
import {
  aiInteractions,
  privateTechnicalNotes,
  technicalDiagnoses,
} from "../db/schema-library-private.ts";
import { bikes } from "../db/schema-taller.ts";
import { users } from "../db/schema.ts";

export type LibraryHealth = {
  ok: boolean;
  diagnosesCrossBranch: number;
  interactionsCrossBranch: number;
  notesCrossBranch: number;
  publishedWithoutVersion: number;
  verifiedWithoutSource: number;
  orphanChunks: number;
};

const total = sql<number>`count(*)`.mapWith(Number);

/** Diagnósticos cuya orden o bici pertenece a otra sucursal. */
async function diagnosesCrossBranch(db: AppDb) {
  const [row] = await db
    .select({ total })
    .from(technicalDiagnoses)
    .innerJoin(workOrders, eq(workOrders.id, technicalDiagnoses.workOrderId))
    .innerJoin(bikes, eq(bikes.id, technicalDiagnoses.bikeId))
    .where(
      or(
        ne(workOrders.branchId, technicalDiagnoses.branchId),
        ne(bikes.branchId, technicalDiagnoses.branchId),
      ),
    );
  return row?.total ?? 0;
}

/** Consultas al asistente cuyo usuario u orden pertenece a otra sucursal. */
async function interactionsCrossBranch(db: AppDb) {
  const [row] = await db
    .select({ total })
    .from(aiInteractions)
    .innerJoin(users, eq(users.id, aiInteractions.userId))
    .leftJoin(workOrders, eq(workOrders.id, aiInteractions.workOrderId))
    .where(
      or(
        ne(users.branchId, aiInteractions.branchId),
        and(sql`${workOrders.id} is not null`, ne(workOrders.branchId, aiInteractions.branchId)),
      ),
    );
  return row?.total ?? 0;
}

/** Notas privadas ligadas a una orden o bici de otra sucursal. */
async function notesCrossBranch(db: AppDb) {
  const [row] = await db
    .select({ total })
    .from(privateTechnicalNotes)
    .leftJoin(workOrders, eq(workOrders.id, privateTechnicalNotes.workOrderId))
    .leftJoin(bikes, eq(bikes.id, privateTechnicalNotes.bikeId))
    .where(
      or(
        and(
          sql`${workOrders.id} is not null`,
          ne(workOrders.branchId, privateTechnicalNotes.branchId),
        ),
        and(sql`${bikes.id} is not null`, ne(bikes.branchId, privateTechnicalNotes.branchId)),
      ),
    );
  return row?.total ?? 0;
}

async function publishedWithoutVersion(db: AppDb) {
  const [row] = await db
    .select({ total })
    .from(knowledgeArticles)
    .where(
      and(eq(knowledgeArticles.status, "publicado"), isNull(knowledgeArticles.currentVersionId)),
    );
  return row?.total ?? 0;
}

async function verifiedWithoutSource(db: AppDb) {
  const [row] = await db
    .select({ total })
    .from(technicalSpecifications)
    .where(
      and(
        eq(technicalSpecifications.validationStatus, "verificado"),
        isNull(technicalSpecifications.sourceDocumentId),
      ),
    );
  return row?.total ?? 0;
}

/** Trozos de artículos que ya no son la versión vigente de un artículo publicado. */
async function orphanChunks(db: AppDb) {
  const [row] = await db
    .select({ total })
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.sourceKind, "article_version"),
        sql`not exists (select 1 from knowledge_articles a
          where a.current_version_id = ${documentChunks.sourceId} and a.status = 'publicado')`,
      ),
    );
  return row?.total ?? 0;
}

/**
 * Conteos de anomalías de aislamiento e integridad de la biblioteca. Solo números:
 * nunca devuelve ids, textos ni datos de un taller.
 */
export async function libraryIsolationHealth(db: AppDb): Promise<LibraryHealth> {
  const counts = {
    diagnosesCrossBranch: await diagnosesCrossBranch(db),
    interactionsCrossBranch: await interactionsCrossBranch(db),
    notesCrossBranch: await notesCrossBranch(db),
    publishedWithoutVersion: await publishedWithoutVersion(db),
    verifiedWithoutSource: await verifiedWithoutSource(db),
    orphanChunks: await orphanChunks(db),
  };
  return { ok: Object.values(counts).every((value) => value === 0), ...counts };
}
