import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { branches } from "../db/schema.ts";
import { recordAudit } from "./audit.ts";
import { PRICING_MODES } from "./rules.ts";
import type { PricingMode } from "./rules.ts";

export const pricingModeSchema = z.object({ mode: z.enum(PRICING_MODES) });

export async function allocateOrderNumber(db: AppDb, branchId: string): Promise<number> {
  const result = (await db.execute(sql`
    update branches set next_order_number = next_order_number + 1
    where id = ${branchId} returning next_order_number - 1 as number
  `)) as unknown as { number: number }[] | { rows: { number: number }[] };
  // postgres-js devuelve un arreglo; PGlite devuelve { rows }.
  const [row] = Array.isArray(result) ? result : result.rows;
  if (!row) throw new Error("No se encontró la sucursal para numerar la orden.");
  return row.number;
}

export async function allocateNewOrder(db: AppDb, branchId: string) {
  type Allocation = { number: number; pricing_mode: PricingMode };
  const result = (await db.execute(sql`
    update branches set next_order_number = next_order_number + 1
    where id = ${branchId}
    returning next_order_number - 1 as number, new_order_pricing_mode as pricing_mode
  `)) as unknown as Allocation[] | { rows: Allocation[] };
  const [row] = Array.isArray(result) ? result : result.rows;
  if (!row) throw new Error("No se encontró la sucursal para numerar la orden.");
  return { number: row.number, pricingMode: row.pricing_mode };
}

export async function getNewOrderPricingMode(db: AppDb, actor: SessionUser) {
  const [branch] = await db
    .select({ mode: branches.newOrderPricingMode })
    .from(branches)
    .where(eq(branches.id, actor.branchId))
    .limit(1);
  if (!branch) throw new Error("No se encontró la sucursal para consultar el régimen.");
  return z.enum(PRICING_MODES).parse(branch.mode);
}

export async function setNewOrderPricingMode(
  db: AppDb,
  actor: SessionUser,
  input: unknown,
  now: Date,
) {
  if (!can(actor.role, "catalog.edit")) return { ok: false, code: "forbidden" } as const;
  const parsed = pricingModeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "validation_error" } as const;
  return db.transaction(async (tx) => {
    const scope = eq(branches.id, actor.branchId);
    const [branch] = await tx.select().from(branches).where(scope).for("update");
    if (!branch) return { ok: false, code: "not_found" } as const;
    const from = branch.newOrderPricingMode;
    const to = parsed.data.mode;
    if (from === to) return { ok: true, changed: false } as const;
    await tx.update(branches).set({ newOrderPricingMode: to, updatedAt: now }).where(scope);
    await recordAudit(
      tx,
      {
        branchId: actor.branchId,
        actorUserId: actor.id,
        action: "pricing.mode_changed",
        entity: "branches",
        entityId: actor.branchId,
        details: { from, to },
      },
      now,
    );
    return { ok: true, changed: true } as const;
  });
}
