import { eq } from "drizzle-orm";
import sharp from "sharp";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { shops } from "../db/schema-shops.ts";
import { branches } from "../db/schema.ts";
import type { ObjectStorage } from "../storage/storage.ts";
import { type FieldErrors, fieldErrors, shopSettingsSchema } from "./create-shop.ts";

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_SIZE_PX = 512;
const LOGO_TYPES = ["image/jpeg", "image/png"] as const;

export type MyShop = typeof shops.$inferSelect;
export type UpdateResult =
  | { ok: true }
  | { ok: false; code: "forbidden" | "not_found" }
  | { ok: false; code: "validation_error"; fields: FieldErrors };
export type LogoResult =
  | { ok: true; key: string }
  | { ok: false; code: "forbidden" | "not_found" | "invalid_logo" };

async function shopIdOf(db: AppDb, branchId: string): Promise<string | null> {
  const [row] = await db
    .select({ shopId: branches.shopId })
    .from(branches)
    .where(eq(branches.id, branchId))
    .limit(1);
  return row?.shopId ?? null;
}

/** La fila del taller del dueño (BG-44); `null` sin `shop.manage`. */
export async function myShop(db: AppDb, actor: SessionUser): Promise<MyShop | null> {
  if (!can(actor.role, "shop.manage")) return null;
  const shopId = await shopIdOf(db, actor.branchId);
  if (!shopId) return null;
  const [shop] = await db.select().from(shops).where(eq(shops.id, shopId)).limit(1);
  return shop ?? null;
}

/**
 * Guarda el perfil y la configuración de reservas del taller del dueño. `slug` y `code_prefix`
 * no se editan después del alta (BG-D27): el esquema no los conoce y zod los descarta.
 */
export async function updateMyShop(
  db: AppDb,
  actor: SessionUser,
  raw: unknown,
  now: Date,
): Promise<UpdateResult> {
  if (!can(actor.role, "shop.manage")) return { ok: false, code: "forbidden" };
  const parsed = shopSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: "validation_error", fields: fieldErrors(parsed.error) };
  }
  const shopId = await shopIdOf(db, actor.branchId);
  if (!shopId) return { ok: false, code: "not_found" };
  await db
    .update(shops)
    .set({ ...parsed.data, updatedAt: now })
    .where(eq(shops.id, shopId));
  return { ok: true };
}

async function logoPng(bytes: Buffer): Promise<Buffer | null> {
  try {
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== "jpeg" && metadata.format !== "png") return null;
    return await sharp(bytes, { failOn: "error" })
      .rotate()
      .resize({ width: LOGO_SIZE_PX, height: LOGO_SIZE_PX, fit: "inside" })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * Logo del taller: JPG o PNG de hasta 2 MB → PNG de 512 px → almacenamiento
 * `shops/<id>/logo.png` → recién entonces `logo_key` (regla 12). Si la fila falla y antes no
 * había logo, se borra el objeto.
 */
export async function uploadMyShopLogo(
  db: AppDb,
  actor: SessionUser,
  file: { bytes: Buffer; type: string },
  storage: ObjectStorage,
  now: Date,
): Promise<LogoResult> {
  if (!can(actor.role, "shop.manage")) return { ok: false, code: "forbidden" };
  const allowed = (LOGO_TYPES as readonly string[]).includes(file.type);
  if (!allowed || file.bytes.length === 0 || file.bytes.length > LOGO_MAX_BYTES) {
    return { ok: false, code: "invalid_logo" };
  }
  const shop = await myShop(db, actor);
  if (!shop) return { ok: false, code: "not_found" };
  const png = await logoPng(file.bytes);
  if (!png) return { ok: false, code: "invalid_logo" };
  const key = `shops/${shop.id}/logo.png`;
  await storage.put(key, png, "image/png");
  try {
    await db.update(shops).set({ logoKey: key, updatedAt: now }).where(eq(shops.id, shop.id));
  } catch (error) {
    if (shop.logoKey === null) await storage.delete(key);
    throw error;
  }
  return { ok: true, key };
}
