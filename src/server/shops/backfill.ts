import { randomUUID } from "node:crypto";
import { count, eq, isNull, sql } from "drizzle-orm";
import type { AppDb } from "../db/client.ts";
import { shops } from "../db/schema-shops.ts";
import {
  blockedPeriods,
  bookingBikes,
  bookingBlocks,
  bookingDays,
  bookingRequests,
  bookings,
  branches,
  whatsappMessages,
} from "../db/schema.ts";
import type { ObjectStorage } from "../storage/storage.ts";

const bookingTables = {
  bookings,
  bookingBikes,
  bookingBlocks,
  bookingDays,
  blockedPeriods,
  bookingRequests,
  whatsappMessages,
};
type Filled = Record<keyof typeof bookingTables, number>;
type Profile = Omit<
  typeof shops.$inferInsert,
  "id" | "notifyEmail" | "logoKey" | "createdAt" | "updatedAt" | "certifications" | "pickupComunas"
> & { certifications: readonly string[]; pickupComunas: readonly string[] };
type BackfillInput = {
  profile: Profile;
  notifyEmail?: string;
  logo?: Buffer;
  storage?: ObjectStorage;
  dryRun: boolean;
};
type Plan = {
  shop: typeof shops.$inferSelect | undefined;
  branch: { id: string; shopId: string | null } | undefined;
  branchesLinked: number;
  filled: Filled;
  pending: number;
};
type BackfillResult =
  | { ok: false; code: "ambiguous" }
  | {
      ok: true;
      dryRun: boolean;
      shopCreated: boolean;
      branchesLinked: number;
      filled: Filled;
      pending: number;
      logoStored: boolean;
    };
class AmbiguousBackfill extends Error {}

async function pendingCounts(db: AppDb): Promise<Filled> {
  const filled = {} as Filled;
  for (const name of Object.keys(bookingTables) as (keyof Filled)[]) {
    const table = bookingTables[name];
    const [row] = await db.select({ count: count() }).from(table).where(isNull(table.branchId));
    filled[name] = row?.count ?? 0;
  }
  return filled;
}

async function inspect(db: AppDb, slug: string): Promise<Plan> {
  // Excepción de migración: hay que contar todo el estado legado antes de asignarle alcance.
  const existingShops = await db.select().from(shops);
  const shop = existingShops.find((row) => row.slug === slug);
  if (!shop && existingShops.length > 0) throw new AmbiguousBackfill();
  const existingBranches = await db
    .select({ id: branches.id, shopId: branches.shopId })
    .from(branches);
  const branchesLinked = existingBranches.filter((row) => row.shopId === null).length;
  if (branchesLinked > 0 && existingBranches.length !== 1) throw new AmbiguousBackfill();
  const filled = await pendingCounts(db);
  const unscoped = Object.values(filled).reduce((sum, value) => sum + value, 0);
  const branch = existingBranches.length === 1 ? existingBranches[0] : undefined;
  // Nunca asignar reservas sin alcance a una sucursal de otro taller ni adivinar entre varias.
  if (unscoped > 0 && (!branch || (branch.shopId !== null && branch.shopId !== shop?.id))) {
    throw new AmbiguousBackfill();
  }
  return { shop, branch, branchesLinked, filled, pending: branchesLinked + unscoped };
}

function summary(plan: Plan, dryRun: boolean, logoStored = false): BackfillResult {
  return {
    ok: true,
    dryRun,
    shopCreated: !plan.shop,
    branchesLinked: plan.branchesLinked,
    filled: plan.filled,
    pending: dryRun ? plan.pending : 0,
    logoStored,
  };
}

async function writeShop(
  db: AppDb,
  input: BackfillInput,
  plan: Plan,
  id: string,
  logoKey: string | undefined,
  now: Date,
) {
  if (!input.notifyEmail) throw new Error("Falta el correo de avisos del taller");
  if (!plan.shop) {
    await db.insert(shops).values({
      ...input.profile,
      id,
      notifyEmail: input.notifyEmail,
      certifications: [...input.profile.certifications],
      pickupComunas: [...input.profile.pickupComunas],
      logoKey,
      createdAt: now,
      updatedAt: now,
    });
  } else if (logoKey) {
    await db.update(shops).set({ logoKey, updatedAt: now }).where(eq(shops.id, id));
  }
}

async function fillRows(db: AppDb, plan: Plan, shopId: string, now: Date) {
  if (plan.branch && plan.branchesLinked > 0) {
    await db
      .update(branches)
      .set({ shopId, updatedAt: now })
      .where(eq(branches.id, plan.branch.id));
  }
  for (const name of Object.keys(bookingTables) as (keyof Filled)[]) {
    if (!plan.branch || plan.filled[name] === 0) continue;
    const table = bookingTables[name];
    await db
      .update(table)
      .set({ branchId: plan.branch.id, ...("updatedAt" in table ? { updatedAt: now } : {}) })
      .where(isNull(table.branchId));
  }
}

async function commit(
  db: AppDb,
  input: BackfillInput,
  planned: Plan,
  shopId: string,
  logoKey: string | undefined,
  now: Date,
): Promise<BackfillResult> {
  return db.transaction(async (tx) => {
    // La ventana se ejecuta con el taller cerrado; los locks impiden cambios entre conteo y escritura.
    await tx.execute(sql`lock table ${shops}, ${branches}, ${bookings}, ${bookingBikes},
      ${bookingBlocks}, ${bookingDays}, ${blockedPeriods}, ${bookingRequests}, ${whatsappMessages}
      in share row exclusive mode`);
    const plan = await inspect(tx, input.profile.slug);
    if (logoKey && (plan.shop?.id !== planned.shop?.id || plan.shop?.logoKey)) {
      throw new AmbiguousBackfill();
    }
    const id = plan.shop?.id ?? shopId;
    await writeShop(tx, input, plan, id, logoKey, now);
    await fillRows(tx, plan, id, now);
    const pending = await pendingCounts(tx);
    return {
      ...summary(plan, false, !!logoKey),
      pending: Object.values(pending).reduce((sum, value) => sum + value, 0),
    };
  });
}

export async function backfillFirstShop(
  db: AppDb,
  input: BackfillInput,
  now: Date,
): Promise<BackfillResult> {
  let uploadedKey: string | undefined;
  try {
    const plan = await inspect(db, input.profile.slug);
    if (input.dryRun) return summary(plan, true);
    if (!input.notifyEmail) throw new Error("Falta el correo de avisos del taller");
    const shopId = plan.shop?.id ?? randomUUID();
    if (input.logo && !plan.shop?.logoKey) {
      if (!input.storage) throw new Error("Falta el almacenamiento para el logo");
      const key = `shops/${shopId}/logo.png`;
      await input.storage.put(key, input.logo, "image/png");
      uploadedKey = key;
    }
    return await commit(db, input, plan, shopId, uploadedKey, now);
  } catch (error) {
    if (uploadedKey) await input.storage?.delete(uploadedKey);
    if (error instanceof AmbiguousBackfill) return { ok: false, code: "ambiguous" };
    throw error;
  }
}
