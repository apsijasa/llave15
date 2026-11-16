import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import { TIMEZONE } from "../booking/rules.ts";
import { localToday } from "../booking/slots.ts";
import type { AppDb } from "../db/client.ts";
import { aiInteractions } from "../db/schema-library-private.ts";
import { users } from "../db/schema.ts";
import { redactDetails } from "../taller/audit.ts";
import { AiProviderError } from "./ai-provider.ts";
import type { AiAnswer, AiProvider, AiSource } from "./ai-provider.ts";
import { retrieve } from "./retrieval.ts";
import type { PrivateContext, RetrievedChunk } from "./retrieval.ts";
import { AI_DAILY_QUOTA_PER_BRANCH, AI_PER_USER_PER_MINUTE, PROMPT_VERSION } from "./rules.ts";

export const askSchema = z
  .object({
    question: z.string().trim().min(3).max(2000),
    scope: z.enum(["biblioteca", "orden"]).default("biblioteca"),
    orderId: z.uuid().optional(),
  })
  .refine((input) => input.scope === "biblioteca" || input.orderId !== undefined);

export type AssistantCitation = {
  ref: string;
  chunkId: string;
  sourceKind: string;
  sourceId: string;
  label: string;
  href: string;
  versionNumber?: number;
};
export type AssistantResult =
  | {
      ok: true;
      interactionId: string;
      status: "respondida" | "sin_evidencia" | "error";
      answer: string;
      confidence: string;
      citations: AssistantCitation[];
      assumptions: string[];
      nextCheck: string;
    }
  | { ok: false; code: "forbidden" | "validation_error" | "quota" };

const UNIT = /(\d+(?:[.,]\d+)?)\s?(nm|n·m|mm|cm|bar|psi|ml|cc|kg|g)\b/giu;
const UNAVAILABLE =
  "El asistente no está disponible. Use la búsqueda de la biblioteca mientras tanto.";

function normalizedNumbers(text: string): Set<string> {
  return new Set(
    [...text.matchAll(UNIT)].map(
      (match) => `${(match[1] ?? "").replace(",", ".")}${(match[2] ?? "").toLowerCase()}`,
    ),
  );
}

/** Cifras con unidad de la respuesta que no aparecen en ninguna fuente citada. */
export function numericGuard(answer: string, sources: readonly AiSource[]) {
  const cited = new Set(sources.flatMap((source) => [...normalizedNumbers(source.text)]));
  const unsupported = [...normalizedNumbers(answer)].filter((value) => !cited.has(value));
  return { ok: unsupported.length === 0, unsupported };
}

function chunkLabel(chunk: RetrievedChunk): string {
  const title = typeof chunk.metadata.title === "string" ? chunk.metadata.title : chunk.sourceKind;
  const version =
    typeof chunk.metadata.versionNumber === "number"
      ? ` · versión ${chunk.metadata.versionNumber}`
      : "";
  return `${title}${version}${chunk.authority === "oficial" ? " · fuente oficial" : ""}`;
}

function chunkHref(chunk: RetrievedChunk): string {
  const slug = typeof chunk.metadata.slug === "string" ? chunk.metadata.slug : "";
  if (chunk.sourceKind === "specification")
    return `/taller/biblioteca/componentes/${chunk.sourceId}?seccion=especificaciones`;
  if (chunk.sourceKind === "procedure")
    return `/taller/biblioteca/procedimientos/${chunk.sourceId}`;
  if (chunk.sourceKind === "document") return `/taller/biblioteca/documentos/${chunk.sourceId}`;
  return `/taller/biblioteca/buscar?q=${encodeURIComponent(slug || chunkLabel(chunk))}`;
}

function contextText(context: PrivateContext | null): string | null {
  if (!context) return null;
  const parts = context.components.map(
    (part) => `${part.componentType}: ${part.brand} ${part.model}`,
  );
  const previous = context.diagnoses.map((item) => `${item.status}: ${item.symptoms}`);
  return [
    `Orden en estado ${context.status}. Servicio pedido: ${context.requestedService}.`,
    `Bicicleta: ${context.bike.brand} ${context.bike.model} (${context.bike.bikeType}${context.bike.year ? `, ${context.bike.year}` : ""}).`,
    parts.length ? `Componentes registrados: ${parts.join("; ")}.` : "Sin componentes registrados.",
    previous.length ? `Diagnósticos previos: ${previous.join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function overQuota(db: AppDb, actor: SessionUser, now: Date): Promise<boolean> {
  const [day] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(aiInteractions)
    .where(
      and(
        eq(aiInteractions.branchId, actor.branchId),
        sql`(${aiInteractions.createdAt} at time zone ${TIMEZONE})::date = ${localToday(now)}::date`,
      ),
    );
  if ((day?.count ?? 0) >= AI_DAILY_QUOTA_PER_BRANCH) return true;
  const [minute] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(aiInteractions)
    .where(
      and(
        eq(aiInteractions.userId, actor.id),
        gte(aiInteractions.createdAt, new Date(now.getTime() - 60_000)),
      ),
    );
  return (minute?.count ?? 0) >= AI_PER_USER_PER_MINUTE;
}

type Ask = z.infer<typeof askSchema>;
type Saved = Pick<AiAnswer, "answer" | "confidence" | "tokensIn" | "tokensOut"> & {
  status: "respondida" | "sin_evidencia" | "error" | "cuota";
  citations: AssistantCitation[];
  assumptions: string[];
  nextCheck: string;
};

async function saveInteraction(
  db: AppDb,
  actor: SessionUser,
  provider: AiProvider,
  input: Ask,
  saved: Saved,
  now: Date,
): Promise<string> {
  const [row] = await db
    .insert(aiInteractions)
    .values({
      branchId: actor.branchId,
      userId: actor.id,
      scope: input.scope,
      workOrderId: input.scope === "orden" ? (input.orderId ?? null) : null,
      question: String(redactDetails(input.question)),
      answer: String(redactDetails(saved.answer)),
      confidence: saved.confidence,
      citations: saved.citations.map(({ chunkId, sourceKind, sourceId, versionNumber }) => ({
        chunkId,
        sourceKind,
        sourceId,
        versionNumber,
      })),
      provider: provider.name,
      model: provider.model,
      promptVersion: PROMPT_VERSION,
      status: saved.status,
      tokensIn: saved.tokensIn,
      tokensOut: saved.tokensOut,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: aiInteractions.id });
  if (!row) throw new Error("No se pudo guardar la consulta.");
  return row.id;
}

async function callProvider(provider: AiProvider, request: Parameters<AiProvider["complete"]>[0]) {
  try {
    return await provider.complete(request);
  } catch (error) {
    if (error instanceof AiProviderError) return null;
    throw error;
  }
}

/**
 * Responde con fuentes de la biblioteca. Cuota antes de recuperar; recuperación con alcance
 * antes del modelo; ninguna llamada de red dentro de una transacción; nunca escribe en órdenes.
 */
export async function askAssistant(
  db: AppDb,
  actor: SessionUser,
  provider: AiProvider,
  input: unknown,
  now: Date,
): Promise<AssistantResult> {
  if (!can(actor.role, "library.ai")) return { ok: false, code: "forbidden" };
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "validation_error" };
  const ask = parsed.data;
  const orderId = ask.scope === "orden" ? ask.orderId : undefined;
  if (await overQuota(db, actor, now)) {
    await saveInteraction(db, actor, provider, ask, quotaSaved(), now);
    return { ok: false, code: "quota" };
  }
  const retrieved = await retrieve(db, actor, { question: ask.question, orderId });
  if (!retrieved.ok) return retrieved;
  const chunks = retrieved.global;
  const sources: AiSource[] = chunks.map((chunk, index) => ({
    ref: `S${index + 1}`,
    label: chunkLabel(chunk),
    text: chunk.text,
    official: chunk.authority === "oficial",
  }));
  const request = {
    question: ask.question,
    scope: ask.scope,
    sources,
    privateContext: contextText(retrieved.private),
  };
  const answer = await callProvider(provider, request);
  const saved = answer ? reviewed(answer, sources, chunks) : failedSaved();
  const interactionId = await saveInteraction(db, actor, provider, ask, saved, now);
  return {
    ok: true,
    interactionId,
    status: saved.status === "cuota" ? "error" : saved.status,
    answer: saved.answer,
    confidence: saved.confidence,
    citations: saved.citations,
    assumptions: saved.assumptions,
    nextCheck: saved.nextCheck,
  };
}

function emptySaved(answer: string): Saved {
  return {
    answer,
    confidence: "no_verificada",
    tokensIn: 0,
    tokensOut: 0,
    status: "error",
    citations: [],
    assumptions: [],
    nextCheck: "Consultar la biblioteca o el manual oficial.",
  };
}

function quotaSaved(): Saved {
  return { ...emptySaved(""), status: "cuota" };
}

function failedSaved(): Saved {
  return emptySaved(UNAVAILABLE);
}

function reviewed(answer: AiAnswer, sources: AiSource[], chunks: RetrievedChunk[]): Saved {
  const cited = sources.filter((source) => answer.citations.includes(source.ref));
  const guard = numericGuard(answer.answer, cited);
  const assumptions = guard.ok
    ? answer.assumptions
    : [...answer.assumptions, `Valor sin fuente verificada: ${guard.unsupported.join(", ")}`];
  const citations = cited.map((source) => {
    const chunk = chunks[Number(source.ref.slice(1)) - 1] as RetrievedChunk;
    const version = chunk.metadata.versionNumber;
    return {
      ref: source.ref,
      chunkId: chunk.chunkId,
      sourceKind: chunk.sourceKind,
      sourceId: chunk.sourceId,
      label: source.label,
      href: chunkHref(chunk),
      ...(typeof version === "number" ? { versionNumber: version } : {}),
    };
  });
  return {
    answer: answer.answer,
    confidence: guard.ok && sources.length > 0 ? answer.confidence : "no_verificada",
    tokensIn: answer.tokensIn,
    tokensOut: answer.tokensOut,
    status: sources.length === 0 ? "sin_evidencia" : "respondida",
    citations,
    assumptions,
    nextCheck: answer.nextCheck,
  };
}

export async function recentInteractions(db: AppDb, actor: SessionUser, limit = 10) {
  if (!can(actor.role, "library.ai")) return [];
  return db
    .select({
      id: aiInteractions.id,
      question: aiInteractions.question,
      confidence: aiInteractions.confidence,
      scope: aiInteractions.scope,
      createdAt: aiInteractions.createdAt,
      userName: users.name,
    })
    .from(aiInteractions)
    .innerJoin(users, eq(users.id, aiInteractions.userId))
    .where(
      and(eq(aiInteractions.branchId, actor.branchId), sql`${aiInteractions.status} <> 'cuota'`),
    )
    .orderBy(desc(aiInteractions.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
}
