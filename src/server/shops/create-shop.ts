import { eq } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "../auth/admin-auth.ts";
import type { SessionUser } from "../auth/admin-auth.ts";
import { weekHoursSchema } from "../booking/config.ts";
import { type AppDb, isUniqueViolation } from "../db/client.ts";
import { shops } from "../db/schema-shops.ts";
import { branches, users } from "../db/schema.ts";
import { copyCatalog } from "./catalog-copy.ts";
import { slugSchema } from "./slugs.ts";

const DAYS = ["1", "2", "3", "4", "5", "6", "7"] as const;
const BLOCK_MINUTES = [15, 20, 30, 45, 60] as const;
const text = (max: number) => z.string().trim().min(1, "Completa este campo.").max(max);
const optionalText = (max: number) =>
  z.preprocess((value) => (value === "" ? null : value), z.string().trim().max(max).nullable());
const optionalUrl = z.preprocess((value) => (value === "" ? null : value), z.url().nullable());
const email = z.email("Ingresa un correo válido.").trim().toLowerCase();
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

/** Perfil y reservas del taller: lo comparten el alta (BG-42) y "Mi taller" (BG-44). */
export const shopSettingsSchema = z
  .object({
    name: text(80),
    legalName: optionalText(120),
    rut: optionalText(20),
    email,
    notifyEmail: email,
    phone: z
      .string()
      .trim()
      .regex(/^\+569\d{8}$/, "Usa el formato +569XXXXXXXX."),
    phoneDisplay: text(30),
    streetAddress: text(120),
    addressShort: text(80),
    locality: text(60),
    region: text(60),
    mapsUrl: optionalUrl,
    instagramUrl: optionalUrl,
    receptionHours: weekHoursSchema,
    pickupHours: weekHoursSchema,
    dailyCapacity: int(1, 20),
    blockMinutes: z.coerce
      .number()
      .refine((value) => (BLOCK_MINUTES as readonly number[]).includes(value), "Elige un bloque."),
    minNoticeMinutes: int(0, 10080),
    horizonDays: int(1, 120),
    pickupEnabled: z.boolean(),
    pickupFeeClp: int(0, 1_000_000),
    pickupComunas: z.array(z.string().trim().min(1).max(60)).max(20),
  })
  .refine((value) => !value.pickupEnabled || value.pickupComunas.length > 0, {
    message: "Indica al menos una comuna de retiro.",
    path: ["pickupComunas"],
  });

export const createShopSchema = z.intersection(
  shopSettingsSchema,
  z.object({
    slug: slugSchema,
    codePrefix: z
      .string()
      .trim()
      .regex(/^[A-Z]{2,4}$/, "Usa de 2 a 4 letras mayúsculas."),
    ownerName: text(80),
    ownerEmail: email,
    ownerPassword: z.string().min(12, "La clave debe tener al menos 12 caracteres.").max(1024),
    templateShopId: z.uuid("Elige el taller plantilla."),
  }),
);

export type CreateShopInput = z.infer<typeof createShopSchema>;
export type FieldErrors = Record<string, string>;
export type CreateShopResult =
  | { ok: true; shopId: string }
  | { ok: false; code: "forbidden" }
  | { ok: false; code: "validation_error"; fields: FieldErrors };

function weekHoursFromForm(form: FormData, prefix: string) {
  return Object.fromEntries(
    DAYS.map((day) => {
      const open = String(form.get(`${prefix}-${day}-open`) ?? "").trim();
      const close = String(form.get(`${prefix}-${day}-close`) ?? "").trim();
      return [day, open === "" && close === "" ? null : { open, close }];
    }),
  );
}

/** Los campos planos del formulario, con la forma que espera `shopSettingsSchema`. */
export function shopSettingsFromForm(form: FormData): Record<string, unknown> {
  const field = (name: string) => String(form.get(name) ?? "");
  const comunas = field("pickupComunas")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    ...Object.fromEntries(
      [
        "name",
        "legalName",
        "rut",
        "email",
        "notifyEmail",
        "phone",
        "phoneDisplay",
        "streetAddress",
        "addressShort",
        "locality",
        "region",
        "mapsUrl",
        "instagramUrl",
        "dailyCapacity",
        "blockMinutes",
        "minNoticeMinutes",
        "horizonDays",
        "pickupFeeClp",
      ].map((name) => [name, field(name)]),
    ),
    receptionHours: weekHoursFromForm(form, "recepcion"),
    pickupHours: weekHoursFromForm(form, "retiro"),
    pickupEnabled: form.get("pickupEnabled") === "on",
    pickupComunas: comunas,
  };
}

export function createShopFromForm(form: FormData): Record<string, unknown> {
  const field = (name: string) => String(form.get(name) ?? "");
  return {
    ...shopSettingsFromForm(form),
    slug: field("slug").trim(),
    codePrefix: field("codePrefix").trim().toUpperCase(),
    ownerName: field("ownerName"),
    ownerEmail: field("ownerEmail"),
    ownerPassword: field("ownerPassword"),
    templateShopId: field("templateShopId"),
  };
}

/** Primer mensaje por campo; los horarios se agrupan en su campo de primer nivel. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fields[key] ??= issue.message;
  }
  return fields;
}

async function conflicts(db: AppDb, input: CreateShopInput): Promise<FieldErrors> {
  const fields: FieldErrors = {};
  const [slug] = await db.select({ id: shops.id }).from(shops).where(eq(shops.slug, input.slug));
  if (slug) fields.slug = "Ya existe un taller con ese nombre.";
  const [prefix] = await db
    .select({ id: shops.id })
    .from(shops)
    .where(eq(shops.codePrefix, input.codePrefix));
  if (prefix) fields.codePrefix = "Ese prefijo ya está en uso.";
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.ownerEmail));
  if (owner) fields.ownerEmail = "Ese correo ya tiene cuenta.";
  return fields;
}

async function templateBranch(db: AppDb, shopId: string): Promise<string | null> {
  const rows = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.shopId, shopId))
    .limit(2);
  return rows.length === 1 && rows[0] ? rows[0].id : null;
}

/** Restricción única → campo del formulario, para la carrera entre la revisión y el insert. */
function uniqueField(error: unknown): FieldErrors {
  const text = String((error as { cause?: { constraint?: string } })?.cause?.constraint ?? error);
  if (text.includes("uq_shops_slug")) return { slug: "Ya existe un taller con ese nombre." };
  if (text.includes("uq_shops_code_prefix")) return { codePrefix: "Ese prefijo ya está en uso." };
  return { ownerEmail: "Ese correo ya tiene cuenta." };
}

/**
 * Alta de un taller (BG-42), solo con la marca de plataforma: en una transacción, el taller
 * `activo`, su sucursal, el primer dueño y la copia del catálogo del taller plantilla.
 */
export async function createShop(
  db: AppDb,
  actor: SessionUser,
  raw: unknown,
  now: Date,
): Promise<CreateShopResult> {
  if (actor.isPlatformAdmin !== true) return { ok: false, code: "forbidden" };
  const parsed = createShopSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: "validation_error", fields: fieldErrors(parsed.error) };
  }
  const input = parsed.data;
  const taken = await conflicts(db, input);
  const fromBranchId = await templateBranch(db, input.templateShopId);
  if (fromBranchId === null) taken.templateShopId = "Elige el taller plantilla.";
  if (Object.keys(taken).length > 0 || fromBranchId === null) {
    return { ok: false, code: "validation_error", fields: taken };
  }
  // scrypt fuera de la transacción: nada de esperas largas con locks tomados (regla 6).
  const passwordHash = await hashPassword(input.ownerPassword);
  const {
    slug,
    codePrefix,
    ownerName,
    ownerEmail,
    templateShopId: _t,
    ownerPassword: _p,
    ...settings
  } = input;
  try {
    const shopId = await db.transaction(async (tx) => {
      const [shop] = await tx
        .insert(shops)
        .values({ ...settings, slug, codePrefix, status: "activo", createdAt: now, updatedAt: now })
        .returning({ id: shops.id });
      if (!shop) throw new Error("No se pudo crear el taller.");
      const [branch] = await tx
        .insert(branches)
        .values({ shopId: shop.id, name: settings.locality, createdAt: now, updatedAt: now })
        .returning({ id: branches.id });
      if (!branch) throw new Error("No se pudo crear la sucursal.");
      await tx.insert(users).values({
        branchId: branch.id,
        email: ownerEmail,
        passwordHash,
        name: ownerName,
        role: "owner",
        createdAt: now,
        updatedAt: now,
      });
      await copyCatalog(tx, fromBranchId, branch.id, now);
      return shop.id;
    });
    return { ok: true, shopId };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, code: "validation_error", fields: uniqueField(error) };
    }
    throw error;
  }
}
