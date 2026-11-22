import { and, desc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import type { AppDb } from "../db/client.ts";
import { demoRequests } from "../db/schema-platform.ts";
import { users } from "../db/schema.ts";

export const DEMO_RATE_LIMIT_MAX = 3;
export const DEMO_RATE_LIMIT_MINUTES = 60;
const LIST_LIMIT = 200;

export const DEMO_MECHANICS = ["1", "2-3", "4+"] as const;
export const DEMO_MECHANICS_LABELS: Record<(typeof DEMO_MECHANICS)[number], string> = {
  "1": "1 mecánico",
  "2-3": "2 a 3 mecánicos",
  "4+": "4 o más",
};
export const DEMO_STATUSES = ["nueva", "contactada", "descartada"] as const;
export type DemoStatus = (typeof DEMO_STATUSES)[number];
export const DEMO_STATUS_LABELS: Record<DemoStatus, string> = {
  nueva: "Nueva",
  contactada: "Contactada",
  descartada: "Descartada",
};

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));

/** El formulario de `/demo` con los nombres de campo del HTML. */
export const demoRequestSchema = z
  .object({
    nombre: text(2, 80),
    taller: text(2, 80),
    correo: z.string().trim().toLowerCase().pipe(z.email().max(120)),
    telefono: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{8,20}$/),
    ciudad: text(2, 60),
    mecanicos: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.enum(DEMO_MECHANICS).optional(),
    ),
    mensaje: optionalText(1000).default(""),
    consentimiento: z.literal("on"),
  })
  .transform((value) => ({
    name: value.nombre,
    shopName: value.taller,
    email: value.correo,
    phone: value.telefono,
    city: value.ciudad,
    mechanics: value.mecanicos ?? null,
    message: value.mensaje,
  }));

export type DemoRequestInput = z.output<typeof demoRequestSchema>;
export type DemoRequestRow = typeof demoRequests.$inferSelect;
export type CreateDemoResult =
  | { ok: true; request: DemoRequestRow }
  | { ok: false; code: "rate_limited" };

async function recentFromIp(db: AppDb, ipHash: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - DEMO_RATE_LIMIT_MINUTES * 60_000);
  const [row] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(demoRequests)
    .where(and(eq(demoRequests.ipHash, ipHash), gt(demoRequests.createdAt, since)));
  return row?.total ?? 0;
}

/** Guarda una solicitud de demo; sin IP no hay límite que contar. */
export async function createDemoRequest(
  db: AppDb,
  input: DemoRequestInput,
  ipHash: string | null,
  now: Date,
): Promise<CreateDemoResult> {
  if (ipHash !== null && (await recentFromIp(db, ipHash, now)) >= DEMO_RATE_LIMIT_MAX) {
    return { ok: false, code: "rate_limited" };
  }
  const [request] = await db
    .insert(demoRequests)
    .values({ ...input, consentAt: now, ipHash, createdAt: now, updatedAt: now })
    .returning();
  if (!request) throw new Error("No se guardó la solicitud de demo");
  return { ok: true, request };
}

/** Correos de los administradores de plataforma activos: reciben el aviso de cada solicitud. */
export async function platformAdminEmails(db: AppDb): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.isPlatformAdmin, true), eq(users.isActive, true)))
    .orderBy(users.email);
  return rows.map((row) => row.email);
}

/** Las últimas solicitudes; `null` sin la marca de plataforma (regla 11). */
export async function listDemoRequests(
  db: AppDb,
  actor: SessionUser,
): Promise<DemoRequestRow[] | null> {
  if (actor.isPlatformAdmin !== true) return null;
  return db.select().from(demoRequests).orderBy(desc(demoRequests.createdAt)).limit(LIST_LIMIT);
}

export type SetDemoStatusResult =
  | { ok: true }
  | { ok: false; code: "forbidden" | "not_found" | "validation_error" };

export async function setDemoRequestStatus(
  db: AppDb,
  actor: SessionUser,
  id: string,
  status: string,
  now: Date,
): Promise<SetDemoStatusResult> {
  if (actor.isPlatformAdmin !== true) return { ok: false, code: "forbidden" };
  const parsed = z
    .object({ id: z.uuid(), status: z.enum(DEMO_STATUSES) })
    .safeParse({ id, status });
  if (!parsed.success) return { ok: false, code: "validation_error" };
  const updated = await db
    .update(demoRequests)
    .set({ status: parsed.data.status, updatedAt: now })
    .where(eq(demoRequests.id, parsed.data.id))
    .returning({ id: demoRequests.id });
  return updated.length === 0 ? { ok: false, code: "not_found" } : { ok: true };
}
