import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import type { AppDb } from "../db/client.ts";
import { workOrders } from "../db/schema-orders.ts";
import { documentChunks } from "../db/schema-library-knowledge.ts";
import { privateTechnicalNotes, technicalDiagnoses } from "../db/schema-library-private.ts";
import { bikeComponents } from "../db/schema-payments.ts";
import { bikes } from "../db/schema-taller.ts";
import { canAccessOrder } from "../taller/status.ts";
import { canUseLibrary } from "./access.ts";
import { detectExactCode } from "./search.ts";

export type RetrievedChunk = {
  chunkId: string;
  sourceKind: string;
  sourceId: string;
  text: string;
  rank: number;
  metadata: Record<string, unknown>;
  authority: "oficial" | "comunidad_verificada" | "comunidad" | "historico" | null;
  exactCode: boolean;
};

export type PrivateContext = {
  orderId: string;
  orderNumber: number;
  status: string;
  requestedService: string;
  bike: { brand: string; model: string; bikeType: string; year: number | null };
  components: { componentType: string; brand: string; model: string; variantId: string | null }[];
  diagnoses: {
    id: string;
    symptoms: string;
    result: string | null;
    status: string;
    createdAt: Date;
  }[];
  notes: { contentMd: string; createdAt: Date }[];
};

export const retrieveSchema = z.object({
  question: z.string().trim().min(3).max(2000),
  orderId: z.uuid().optional(),
  limit: z.int().min(1).max(12).default(8),
});

const AUTHORITIES = new Set(["oficial", "comunidad_verificada", "comunidad", "historico"]);
const WORD = /[a-záéíóúüñ0-9]{3,}/giu;

/** `a | b | c` con solo letras y dígitos: seguro para `to_tsquery`. */
export function orQuery(question: string): string | null {
  const words = [...new Set((question.toLowerCase().match(WORD) ?? []).slice(0, 24))];
  return words.length ? words.join(" | ") : null;
}

export function questionCodes(question: string): string[] {
  const tokens = question.split(/[\s,;:()¿?¡!"']+/);
  return [...new Set(tokens.flatMap((token) => detectExactCode(token.replace(/\.$/, "")) ?? []))];
}

/** Solo contenido global vigente: versión actual publicada, variantes, procedimientos vigentes, documentos no retirados. */
const visibleSource = sql`(
  (${documentChunks.sourceKind} = 'article_version' and exists (
    select 1 from knowledge_articles a
    where a.current_version_id = ${documentChunks.sourceId} and a.status = 'publicado'))
  or (${documentChunks.sourceKind} = 'specification' and exists (
    select 1 from component_variants v where v.id = ${documentChunks.sourceId}))
  or (${documentChunks.sourceKind} = 'procedure' and exists (
    select 1 from procedures p join knowledge_articles a on a.current_version_id = p.version_id
    where p.id = ${documentChunks.sourceId} and a.status = 'publicado'))
  or (${documentChunks.sourceKind} = 'document' and exists (
    select 1 from technical_documents d
    where d.id = ${documentChunks.sourceId} and d.status <> 'retirado'))
)`;

function codeMatch(codes: readonly string[]): SQL {
  if (codes.length === 0) return sql`false`;
  return sql.join(
    codes.map(
      (code) =>
        sql`${documentChunks.text} ilike ${`%${code.replace(/[%_\\]/g, "\\$&")}%`} escape ${"\\"}`,
    ),
    sql` or `,
  );
}

async function globalChunks(db: AppDb, question: string, limit: number): Promise<RetrievedChunk[]> {
  const terms = orQuery(question);
  const codes = questionCodes(question);
  if (!terms && codes.length === 0) return [];
  const vector = sql`to_tsvector('spanish', ${documentChunks.text})`;
  const query = terms ? sql`to_tsquery('spanish', ${terms})` : sql`to_tsquery('spanish', '')`;
  const exact = sql<boolean>`(${codeMatch(codes)})`;
  const rank = sql<number>`ts_rank(${vector}, ${query})`.mapWith(Number);
  const rows = await db
    .select({
      chunkId: documentChunks.id,
      sourceKind: documentChunks.sourceKind,
      sourceId: documentChunks.sourceId,
      text: documentChunks.text,
      metadata: documentChunks.metadata,
      rank,
      exactCode: exact,
    })
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.scope, "global"),
        visibleSource,
        terms ? sql`(${vector} @@ ${query} or ${exact})` : exact,
      ),
    )
    .orderBy(
      ...(codes.length ? [desc(exact)] : []),
      sql`(${documentChunks.metadata}->>'authority' = 'oficial') desc nulls last`,
      desc(rank),
      desc(documentChunks.createdAt),
    )
    .limit(limit);
  return rows.map((row) => {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const authority =
      typeof metadata.authority === "string" && AUTHORITIES.has(metadata.authority)
        ? (metadata.authority as RetrievedChunk["authority"])
        : null;
    return { ...row, metadata, authority, exactCode: Boolean(row.exactCode) };
  });
}

async function orderContext(
  db: AppDb,
  actor: SessionUser,
  orderId: string,
): Promise<PrivateContext | null> {
  const [row] = await db
    .select({ order: workOrders, bike: bikes })
    .from(workOrders)
    .innerJoin(bikes, eq(bikes.id, workOrders.bikeId))
    .where(
      and(
        eq(workOrders.branchId, actor.branchId),
        eq(workOrders.id, orderId),
        isNull(workOrders.voidedAt),
      ),
    );
  if (!row || !canAccessOrder(actor, row.order)) return null;
  const { order, bike } = row;
  return {
    orderId: order.id,
    orderNumber: order.number,
    status: order.status,
    requestedService: order.requestedService,
    bike: { brand: bike.brand, model: bike.model, bikeType: bike.bikeType, year: bike.year },
    components: await bikeParts(db, actor, bike.id),
    diagnoses: await orderDiagnoses(db, actor, order.id),
    notes: await orderNotes(db, actor, order.id),
  };
}

async function bikeParts(db: AppDb, actor: SessionUser, bikeId: string) {
  const rows = await db
    .select({
      componentType: bikeComponents.componentType,
      brand: bikeComponents.brand,
      model: bikeComponents.model,
    })
    .from(bikeComponents)
    .where(
      and(
        eq(bikeComponents.branchId, actor.branchId),
        eq(bikeComponents.bikeId, bikeId),
        isNull(bikeComponents.voidedAt),
        isNull(bikeComponents.replacedAt),
      ),
    )
    .orderBy(desc(bikeComponents.installedAt));
  return rows.map((part) => ({ ...part, variantId: null }));
}

async function orderDiagnoses(db: AppDb, actor: SessionUser, orderId: string) {
  return db
    .select({
      id: technicalDiagnoses.id,
      symptoms: technicalDiagnoses.symptoms,
      result: technicalDiagnoses.result,
      status: technicalDiagnoses.status,
      createdAt: technicalDiagnoses.createdAt,
    })
    .from(technicalDiagnoses)
    .where(
      and(
        eq(technicalDiagnoses.branchId, actor.branchId),
        eq(technicalDiagnoses.workOrderId, orderId),
        isNull(technicalDiagnoses.voidedAt),
      ),
    )
    .orderBy(desc(technicalDiagnoses.createdAt))
    .limit(10);
}

async function orderNotes(db: AppDb, actor: SessionUser, orderId: string) {
  return db
    .select({
      contentMd: privateTechnicalNotes.contentMd,
      createdAt: privateTechnicalNotes.createdAt,
    })
    .from(privateTechnicalNotes)
    .where(
      and(
        eq(privateTechnicalNotes.branchId, actor.branchId),
        eq(privateTechnicalNotes.workOrderId, orderId),
        eq(privateTechnicalNotes.scope, "taller"),
        isNull(privateTechnicalNotes.voidedAt),
      ),
    )
    .orderBy(desc(privateTechnicalNotes.createdAt))
    .limit(10);
}

/**
 * Recupera fuentes para el asistente. El alcance se filtra aquí, antes de que nada llegue al
 * modelo: global solo publicado; privado solo de una orden de la sucursal que el actor puede ver.
 * Una orden ajena o inexistente responde lo mismo (`forbidden`) para no revelar que existe.
 */
export async function retrieve(
  db: AppDb,
  actor: SessionUser,
  input: unknown,
): Promise<
  | { ok: true; global: RetrievedChunk[]; private: PrivateContext | null }
  | { ok: false; code: "forbidden" | "validation_error" }
> {
  if (!canUseLibrary(actor)) return { ok: false, code: "forbidden" };
  const parsed = retrieveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "validation_error" };
  const { question, orderId, limit } = parsed.data;
  let privateContext: PrivateContext | null = null;
  if (orderId) {
    privateContext = await orderContext(db, actor, orderId);
    if (!privateContext) return { ok: false, code: "forbidden" };
  }
  return { ok: true, global: await globalChunks(db, question, limit), private: privateContext };
}
