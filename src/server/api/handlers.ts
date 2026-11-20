import { TIMEZONE, addDays, localToday } from "../../lib/time.ts";
import { createHmac } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { z } from "zod";
import { getHashEnv, getSiteEnv, getTurnstileEnv } from "../../lib/env.ts";
import { errorMessage, log } from "../../lib/log.ts";
import { readRange } from "../booking/availability.ts";
import type { BookingConfig } from "../booking/config.ts";
import { createBooking } from "../booking/create-booking.ts";
import { computeDay } from "../booking/slots.ts";
import type { AppDb } from "../db/client.ts";
import type { Booking } from "../db/schema.ts";
import { bookingRequests } from "../db/schema.ts";
import type { BookingScope } from "../shops/scope.ts";
import { scopeBySlug, ShopScopeError, singleShopScope } from "../shops/scope.ts";
import { verifyTurnstile } from "./turnstile.ts";

export type HandlerContext = {
  db: AppDb;
  now: Date;
  ip: string | null;
  scope?: BookingScope;
  fetchFn?: typeof fetch;
  onCreated?: (booking: Booking, cancelToken: string) => Promise<void>;
};

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_MINUTES = 10;

const MESSAGES = {
  validation: "Revisa los datos del formulario.",
  turnstile: "No pudimos verificar que eres una persona. Vuelve a intentar.",
  slot: "El bloque ya no está disponible",
  phone:
    "Ya tienes una reserva próxima con este teléfono. Cancélala desde tu correo para reservar otra.",
  rate: "Demasiados intentos desde tu conexión. Vuelve a intentar en 10 minutos.",
  internal: "Algo falló de nuestro lado. Vuelve a intentar en unos minutos.",
  shop_not_found: "No encontramos ese taller.",
} as const;

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export function errorResponse(
  status: number,
  code: string,
  error: string,
  fields?: Record<string, string>,
  headers?: Record<string, string>,
): Response {
  return jsonResponse(status, fields ? { error, code, fields } : { error, code }, headers);
}

/** Origins aceptados: el de `PUBLIC_SITE_URL` y su variante con y sin `www.`, mismo esquema y puerto. */
function allowedOrigins(siteUrl: string): string[] {
  const site = new URL(siteUrl);
  const bare = site.hostname.replace(/^www\./, "");
  return [bare, `www.${bare}`].map((hostname) => {
    const variant = new URL(site.origin);
    variant.hostname = hostname;
    return variant.origin;
  });
}

/** Defensa CSRF ante el proxy de Replit: mismo esquema y puerto, con o sin `www.`. */
export function isAllowedOrigin(
  request: Request,
  siteUrl: string = getSiteEnv().PUBLIC_SITE_URL,
): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") {
    return false;
  }
  try {
    return allowedOrigins(siteUrl).includes(new URL(origin).origin);
  } catch {
    return false;
  }
}

/** Solo esquema, host y puerto del `Origin`, sin rutas, consultas ni datos personales. */
export function originForLog(request: Request): string {
  const origin = request.headers.get("origin");
  if (!origin) {
    return "ausente";
  }
  if (origin === "null") {
    return "null";
  }
  try {
    return new URL(origin).origin;
  } catch {
    return "no-valido";
  }
}

/** La IP nunca se guarda en claro. */
export function hashIp(ip: string | null): string | null {
  if (ip === null) {
    return null;
  }
  return createHmac("sha256", getHashEnv().SESSION_SECRET).update(ip).digest("hex");
}

/** `569XXXXXXXX` u `9XXXXXXXX` → `+569XXXXXXXX`; cualquier otra forma es inválida. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("569")) {
    return `+${digits}`;
  }
  if (digits.length === 9 && digits.startsWith("9")) {
    return `+56${digits}`;
  }
  return null;
}

function fieldsOf(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "formulario");
    fields[key] ??= issue.message;
  }
  return fields;
}

const availabilitySchema = z.object({
  taller: z.string().optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige un día."),
  dias: z.coerce
    .number()
    .int("Pide entre 1 y 31 días.")
    .min(1, "Pide entre 1 y 31 días.")
    .max(31, "Pide entre 1 y 31 días.")
    .default(14),
  modo: z.enum(["taller", "retiro"], "Elige taller o retiro.").default("taller"),
});

const bookingFields = z.strictObject({
  taller: z.string().optional(),
  mode: z.enum(["taller", "retiro"], "Elige cómo nos entregas la bici."),
  service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige un día."),
  start: z.string().regex(/^\d{2}:(00|30)$/, "Elige un bloque."),
  nombre: z.string().trim().min(2, "Escribe tu nombre.").max(80, "Escribe tu nombre."),
  telefono: z
    .string()
    .refine((value) => normalizePhone(value) !== null, "Faltan dígitos: son 8 después del +56 9."),
  correo: z
    .email("Escribe un correo válido, por ejemplo nombre@correo.cl.")
    .max(254, "Escribe un correo válido, por ejemplo nombre@correo.cl."),
  bicicleta: z
    .string()
    .trim()
    .min(2, "Cuéntanos la marca y el tipo de bici.")
    .max(120, "Cuéntanos la marca y el tipo de bici."),
  descripcion: z
    .string()
    .trim()
    .min(5, "Cuéntanos qué necesita tu bici.")
    .max(1000, "Cuéntanos qué necesita tu bici."),
  direccion: z.string().trim().min(5).max(200).nullish(),
  consentimiento: z.literal(true, "Acepta el aviso de privacidad para confirmar."),
  whatsapp_consentimiento: z.boolean().default(false),
  turnstile_token: z.string().optional(),
});

function bookingSchemaFor(config: BookingConfig) {
  const comunas = config.pickupComunas;
  const options =
    comunas.length > 1
      ? `${comunas.slice(0, -1).join(", ")} o ${comunas.at(-1)}`
      : comunas.join("");
  const message = `Elige ${options}.`;
  return bookingFields
    .extend({ comuna: z.enum(comunas, message).nullish() })
    .superRefine((value, ctx) => {
      const isPickup = value.mode === "retiro";
      if (isPickup && !config.pickupEnabled) {
        ctx.addIssue({ code: "custom", path: ["mode"], message: "El retiro no está disponible." });
      }
      if (isPickup !== Boolean(value.comuna)) {
        ctx.addIssue({ code: "custom", path: ["comuna"], message });
      }
      if (isPickup !== Boolean(value.direccion)) {
        ctx.addIssue({
          code: "custom",
          path: ["direccion"],
          message: "Escribe la dirección de retiro.",
        });
      }
    });
}

type BookingData = z.infer<ReturnType<typeof bookingSchemaFor>>;

async function resolveScope(ctx: HandlerContext, raw: unknown): Promise<BookingScope | Response> {
  const parsed = z.object({ taller: z.string().optional() }).safeParse(raw ?? {});
  if (!parsed.success) {
    return errorResponse(422, "validation_error", MESSAGES.validation, fieldsOf(parsed.error));
  }
  try {
    const scope =
      parsed.data.taller === undefined
        ? (ctx.scope ?? (await singleShopScope(ctx.db)))
        : await scopeBySlug(ctx.db, parsed.data.taller);
    return scope ?? errorResponse(404, "shop_not_found", MESSAGES.shop_not_found);
  } catch (error) {
    if (!(error instanceof ShopScopeError)) throw error;
    return errorResponse(422, "validation_error", MESSAGES.validation, {
      taller: "Falta el taller.",
    });
  }
}

export async function handleAvailability(url: URL, ctx: HandlerContext): Promise<Response> {
  const query = {
    taller: url.searchParams.get("taller") ?? undefined,
    desde: url.searchParams.get("desde") ?? undefined,
    dias: url.searchParams.get("dias") ?? undefined,
    modo: url.searchParams.get("modo") ?? undefined,
  };
  const scope = await resolveScope(ctx, query);
  if (scope instanceof Response) return scope;
  const parsed = availabilitySchema.safeParse(query);
  if (!parsed.success) {
    return errorResponse(422, "validation_error", MESSAGES.validation, fieldsOf(parsed.error));
  }
  const { desde, dias, modo } = parsed.data;
  if (desde < localToday(ctx.now)) {
    return errorResponse(422, "validation_error", MESSAGES.validation, {
      desde: "Elige una fecha de hoy en adelante.",
    });
  }

  const { config } = scope;
  const dates = Array.from({ length: dias }, (_, index) => addDays(desde, index));
  const last = dates.at(-1) ?? desde;
  const dayData = await readRange(ctx.db, desde, last, undefined, scope.branchId);

  const days = dates.map((date) =>
    computeDay({ date, mode: modo, now: ctx.now, config, ...dayData(date) }),
  );

  return jsonResponse(200, { timezone: TIMEZONE, modo, capacity: config.dailyCapacity, days });
}

function rateLimitKey(ctx: HandlerContext): string | null {
  return hashIp(ctx.ip) ?? hashIp("sin-ip-conocida");
}

/** 429 por IP y, si se indica, sucursal; sin sucursal mantiene el límite global de los tokens. */
export async function checkRateLimit(
  ctx: HandlerContext,
  branchId?: string,
): Promise<Response | null> {
  const ipHash = rateLimitKey(ctx);
  if (ipHash === null) {
    return null;
  }
  const since = new Date(ctx.now.getTime() - RATE_LIMIT_MINUTES * 60_000);
  const [row] = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(bookingRequests)
    .where(
      and(
        eq(bookingRequests.ipHash, ipHash),
        gt(bookingRequests.createdAt, since),
        branchId === undefined ? undefined : eq(bookingRequests.branchId, branchId),
      ),
    );
  if (Number(row?.n ?? 0) >= RATE_LIMIT_MAX) {
    return errorResponse(429, "rate_limited", MESSAGES.rate, undefined, {
      "Retry-After": String(RATE_LIMIT_MINUTES * 60),
    });
  }
  return null;
}

/**
 * Registra el intento; solo cuentan los que pasaron la validación (un 422 no suma).
 * Con `branchId` queda en la sucursal del taller; sin él, la única sucursal (BG-D3).
 */
export async function recordAttempt(ctx: HandlerContext, branchId?: string): Promise<void> {
  const ipHash = rateLimitKey(ctx);
  if (ipHash !== null) {
    await ctx.db
      .insert(bookingRequests)
      .values({ ipHash, createdAt: ctx.now, ...(branchId === undefined ? {} : { branchId }) });
  }
}

function localHhmm(instant: Date): string {
  return DateTime.fromJSDate(instant).setZone(TIMEZONE).toFormat("HH:mm");
}

function parseBooking(raw: unknown, config: BookingConfig): BookingData | Response {
  if (raw === undefined) {
    return errorResponse(422, "validation_error", MESSAGES.validation, {
      formulario: "No pudimos leer el formulario.",
    });
  }
  const parsed = bookingSchemaFor(config).safeParse(raw);
  return parsed.success
    ? parsed.data
    : errorResponse(422, "validation_error", MESSAGES.validation, fieldsOf(parsed.error));
}

export async function handleCreateBooking(
  request: Request,
  ctx: HandlerContext,
): Promise<Response> {
  try {
    const raw: unknown = await request.json().catch(() => undefined);
    const scope = await resolveScope(ctx, raw);
    if (scope instanceof Response) return scope;
    const limited = await checkRateLimit(ctx, scope.branchId);
    if (limited) return limited;

    const data = parseBooking(raw, scope.config);
    if (data instanceof Response) return data;
    const phone = normalizePhone(data.telefono)!;
    await recordAttempt(ctx, scope.branchId);

    const token = data.turnstile_token ?? "";
    const human =
      token.length > 0 &&
      (await verifyTurnstile({
        token,
        ip: ctx.ip,
        secret: getTurnstileEnv().TURNSTILE_SECRET_KEY,
        fetchFn: ctx.fetchFn,
      }));
    if (!human || !human.success || (human.cdata !== null && human.cdata !== scope.slug)) {
      return errorResponse(403, "turnstile_failed", MESSAGES.turnstile);
    }
    return await createValidatedBooking(data, phone, ctx, scope);
  } catch (error) {
    log.error("reservas.internal_error", { message: errorMessage(error) });
    return errorResponse(500, "internal_error", MESSAGES.internal);
  }
}

async function createValidatedBooking(
  data: BookingData,
  phone: string,
  ctx: HandlerContext,
  scope: BookingScope,
): Promise<Response> {
  const result = await createBooking(
    ctx.db,
    {
      mode: data.mode,
      serviceDate: data.service_date,
      start: data.start,
      customerName: data.nombre,
      phoneE164: phone,
      email: data.correo.toLowerCase(),
      bike: data.bicicleta,
      description: data.descripcion,
      comuna: data.comuna ?? null,
      address: data.direccion ?? null,
      ipHash: hashIp(ctx.ip),
      whatsappConsent: data.whatsapp_consentimiento,
    },
    ctx.now,
    scope,
  );
  if (!result.ok) {
    const message = result.code === "phone_limit" ? MESSAGES.phone : MESSAGES.slot;
    return errorResponse(409, result.code, message);
  }
  const { booking } = result;
  try {
    await ctx.onCreated?.(booking, result.cancelToken);
  } catch (error) {
    log.error("email.failed", { code: booking.code, message: errorMessage(error) });
  }
  return jsonResponse(201, {
    code: booking.code,
    service_date: booking.serviceDate,
    start: localHhmm(booking.startsAt),
    end: localHhmm(booking.endsAt),
    mode: booking.mode,
    fee: booking.pickupFeeClp,
  });
}
