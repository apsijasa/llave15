import { addDays } from "../../lib/time.ts";
import { and, asc, between, eq, getTableColumns, inArray } from "drizzle-orm";
import { z } from "zod";
import { log } from "../../lib/log.ts";
import { normalizePhone } from "../api/handlers.ts";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import { readRange } from "../booking/availability.ts";
import type { BookingConfig } from "../booking/config.ts";
import { createBooking } from "../booking/create-booking.ts";
import type { BookingMode } from "../booking/rules.ts";
import { MAX_BIKES_PER_BOOKING } from "../booking/rules.ts";
import { computeDay } from "../booking/slots.ts";
import type { AppDb } from "../db/client.ts";
import { workOrders } from "../db/schema-orders.ts";
import { type Booking, bookings } from "../db/schema.ts";
import { notifyBookingCreated } from "../email/notifications.ts";
import type { BookingScope } from "../shops/scope.ts";
import { scopeForBranch, singleShopScope } from "../shops/scope.ts";
import { recordAudit } from "./audit.ts";

/** "Elige A o B." con las comunas del taller, como en la reserva en línea. */
function comunaMessage(comunas: readonly string[]): string {
  const options =
    comunas.length > 1
      ? `${comunas.slice(0, -1).join(", ")} o ${comunas.at(-1)}`
      : comunas.join("");
  return `Elige ${options}.`;
}

const manualBookingFields = z.strictObject({
  mode: z.enum(["taller", "retiro"], "Elige taller o retiro."),
  service_date: z.iso.date("Elige una fecha válida."),
  start: z.string().regex(/^(?:[01]\d|2[0-3]):(?:00|30)$/, "Elige un bloque."),
  nombre: z.string().trim().min(2, "Escribe el nombre.").max(80, "Máximo 80 caracteres."),
  telefono: z
    .string()
    .refine((value) => normalizePhone(value) !== null, "Faltan dígitos: son 8 después del +56 9."),
  correo: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.email("Escribe un correo válido.").max(254, "Máximo 254 caracteres.").optional(),
  ),
  bicicleta: z
    .string()
    .trim()
    .min(2, "Indica la marca y el tipo de bici.")
    .max(120, "Máximo 120 caracteres."),
  descripcion: z
    .string()
    .trim()
    .min(5, "Indica qué necesita la bici.")
    .max(1000, "Máximo 1000 caracteres."),
  bicis: z.coerce.number().int().min(1).max(MAX_BIKES_PER_BOOKING).default(1),
  bicicleta_2: z.string().trim().max(120, "Máximo 120 caracteres.").optional(),
  descripcion_2: z.string().trim().max(1000, "Máximo 1000 caracteres.").optional(),
  bicicleta_3: z.string().trim().max(120, "Máximo 120 caracteres.").optional(),
  descripcion_3: z.string().trim().max(1000, "Máximo 1000 caracteres.").optional(),
  comuna: z.string().nullish(),
  direccion: z
    .string()
    .trim()
    .min(5, "Escribe la dirección de retiro.")
    .max(200, "Máximo 200 caracteres.")
    .nullish(),
  source: z.enum(["telefono", "whatsapp", "presencial"], "Elige el origen de la reserva."),
  consentimiento: z.literal(true, "Confirma que el cliente aceptó el aviso de privacidad."),
});

/** Lo que el esquema necesita del taller; `pickupComunas: null` acepta cualquier comuna. */
type SchemaConfig = { pickupComunas: string[] | null; pickupEnabled: boolean };

function comunaField(comunas: string[] | null, message: string) {
  return comunas ? z.enum(comunas, message).nullish() : z.string().trim().min(1, message).nullish();
}

/** Comunas, tarifa y retiro salen de la configuración del taller (BG-12). */
export function manualBookingSchemaFor(config: SchemaConfig | BookingConfig) {
  const comunas = config.pickupComunas;
  const message = comunas ? comunaMessage(comunas) : "Escribe la comuna.";
  return manualBookingFields
    .extend({ comuna: comunaField(comunas, message) })
    .superRefine((value, ctx) => {
      for (const index of [2, 3] as const) {
        if (value.bicis < index) continue;
        if ((value[`bicicleta_${index}`]?.length ?? 0) < 2)
          ctx.addIssue({
            code: "custom",
            path: [`bicicleta_${index}`],
            message: "Indica la marca y el tipo de bici.",
          });
        if ((value[`descripcion_${index}`]?.length ?? 0) < 5)
          ctx.addIssue({
            code: "custom",
            path: [`descripcion_${index}`],
            message: "Indica qué necesita la bici.",
          });
      }
      if (value.mode === "retiro") {
        if (!config.pickupEnabled)
          ctx.addIssue({
            code: "custom",
            path: ["mode"],
            message: "El retiro no está disponible.",
          });
        if (!value.comuna) ctx.addIssue({ code: "custom", path: ["comuna"], message });
        if (!value.direccion)
          ctx.addIssue({
            code: "custom",
            path: ["direccion"],
            message: "Escribe la dirección de retiro.",
          });
      } else {
        if (value.comuna)
          ctx.addIssue({
            code: "custom",
            path: ["comuna"],
            message: "La comuna solo corresponde a un retiro.",
          });
        if (value.direccion)
          ctx.addIssue({
            code: "custom",
            path: ["direccion"],
            message: "La dirección solo corresponde a un retiro.",
          });
      }
    });
}

/**
 * Esquema sin taller (BG-28): cualquier comuna no vacía, como el CHECK de la base. La reserva real
 * se valida siempre con `manualBookingSchemaFor(scope.config)`.
 */
export const manualBookingSchema = manualBookingSchemaFor({
  pickupComunas: null,
  pickupEnabled: true,
});

export type ManualBookingInput = z.input<typeof manualBookingSchema>;
type ManualBookingDeps = { notify?: typeof notifyBookingCreated };

function declaredBikes(data: z.output<ReturnType<typeof manualBookingSchemaFor>>) {
  const bikes = [{ bike: data.bicicleta, description: data.descripcion }];
  for (const index of [2, 3] as const) {
    if (data.bicis >= index)
      bikes.push({
        bike: data[`bicicleta_${index}`] ?? "",
        description: data[`descripcion_${index}`] ?? "",
      });
  }
  return bikes;
}

/** Sin nombre, teléfono ni correo: solo lo que identifica la reserva en la agenda. */
async function auditBookingCreated(
  db: AppDb,
  actor: SessionUser,
  booking: Booking,
  start: string,
  now: Date,
) {
  await recordAudit(
    db,
    {
      branchId: actor.branchId,
      actorUserId: actor.id,
      action: "booking.created",
      entity: "booking",
      entityId: booking.id,
      details: {
        code: booking.code,
        serviceDate: booking.serviceDate,
        start,
        mode: booking.mode,
        bikeCount: booking.bikeCount,
        source: booking.source,
      },
    },
    now,
  );
}

export async function createManualBooking(
  db: AppDb,
  actor: SessionUser,
  input: unknown,
  now: Date,
  deps: ManualBookingDeps = {},
) {
  if (!can(actor.role, "bookings.manage")) return { ok: false, code: "forbidden" } as const;
  const scope = await scopeForBranch(db, actor.branchId);
  if (!scope) return { ok: false, code: "forbidden" } as const;
  const parsed = manualBookingSchemaFor(scope.config).safeParse(input);
  if (!parsed.success) return { ok: false, code: "validation_error" } as const;
  const data = parsed.data;
  const phone = normalizePhone(data.telefono);
  if (phone === null) return { ok: false, code: "validation_error" } as const;
  // `createBooking` conserva su firma y su propia transacción; dentro de esta, Drizzle la anida
  // como savepoint, así que la auditoría se escribe en la misma transacción que la reserva.
  const result = await db.transaction(async (tx) => {
    const created = await createBooking(
      tx,
      {
        mode: data.mode,
        serviceDate: data.service_date,
        start: data.start,
        customerName: data.nombre,
        phoneE164: phone,
        email: data.correo?.toLowerCase() ?? null,
        bike: data.bicicleta,
        description: data.descripcion,
        ...(data.bicis > 1 ? { bikes: declaredBikes(data) } : {}),
        comuna: data.comuna ?? null,
        address: data.direccion ?? null,
        ipHash: null,
        whatsappConsent: false,
        source: data.source,
      },
      now,
      scope,
    );
    if (created.ok) await auditBookingCreated(tx, actor, created.booking, data.start, now);
    return created;
  });
  if (result.ok) {
    try {
      const extra = declaredBikes(data)
        .slice(1)
        .map((bike, index) => ({ position: index + 2, ...bike }));
      await (deps.notify ?? notifyBookingCreated)(
        result.booking,
        result.cancelToken,
        {},
        extra,
        db,
      );
    } catch {
      log.error("email.failed", { kind: "manual_booking", code: result.booking.code });
    }
  }
  return result;
}

/**
 * Reservas próximas con las órdenes que ya se abrieron para cada una. Son dos consultas y no un
 * `leftJoin`: una reserva de tres bicis admite tres órdenes, y el join la repetiría una vez por
 * orden. Con `branchId`, solo las reservas de esa sucursal (BG-12).
 */
export async function listUpcomingBookings(db: AppDb, today: string, days = 14, branchId?: string) {
  const rows = await db
    .select(getTableColumns(bookings))
    .from(bookings)
    .where(
      and(
        between(bookings.serviceDate, today, addDays(today, days - 1)),
        inArray(bookings.status, ["confirmed", "ready_for_pickup"]),
        branchId === undefined ? undefined : eq(bookings.branchId, branchId),
      ),
    )
    .orderBy(asc(bookings.serviceDate), asc(bookings.startsAt), asc(bookings.id));
  if (rows.length === 0) return [];
  const orders = await db
    .select({
      id: workOrders.id,
      number: workOrders.number,
      bookingId: workOrders.bookingId,
      position: workOrders.bookingPosition,
    })
    .from(workOrders)
    .where(
      inArray(
        workOrders.bookingId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(workOrders.bookingPosition));
  return rows.map((row) => ({
    ...row,
    orders: orders
      .filter((order) => order.bookingId === row.id)
      .map(({ id, number, position }) => ({ id, number, position })),
  }));
}

/**
 * `excludeBookingId`: la reserva que se reprograma no se cuenta contra sí misma.
 * Con `branchId`, los bloques y horarios son los del taller de esa sucursal (BG-12).
 */
export async function freeBlocks(
  db: AppDb,
  date: string,
  mode: BookingMode,
  now: Date,
  bikeCount = 1,
  excludeBookingId?: string,
  branchId?: string,
) {
  const scope: BookingScope | null =
    branchId === undefined ? await singleShopScope(db) : await scopeForBranch(db, branchId);
  if (!scope) return [];
  const dayData = await readRange(db, date, date, excludeBookingId, scope.branchId);
  const config = scope.config;
  return computeDay({ date, mode, now, bikeCount, config, ...dayData(date) }).blocks.filter(
    (block) => block.state === "free",
  );
}
