import { and, eq, gt, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { AppDb } from "../db/client.ts";
import { cashSessions } from "../db/schema-cash.ts";
import { products } from "../db/schema-inventory.ts";
import { workOrders } from "../db/schema-orders.ts";
import { payments } from "../db/schema-payments.ts";
import { branches } from "../db/schema.ts";

export type Phase2Health = {
  ok: boolean;
  netoInconsistent: number;
  cashUnlinked: number;
  cashDifferenceOver: number;
  stockDrift: number;
};

/** Diferencia de caja sobre la que el cierre se considera anómalo (F2-D20). */
const CASH_DIFFERENCE_LIMIT_CLP = 5000;
const total = sql<number>`count(*)`.mapWith(Number);

/** Órdenes `neto` cuyo IVA no es `vatOfNet(subtotal)` (redondeo al entero, mitad hacia arriba). */
async function netoInconsistent(db: AppDb) {
  const [row] = await db
    .select({ total })
    .from(workOrders)
    .where(
      and(
        eq(workOrders.pricingMode, "neto"),
        sql`${workOrders.vatClp} <> (${workOrders.subtotalClp} * 19 + 50) / 100`,
      ),
    );
  return row?.total ?? 0;
}

/** Pagos en efectivo sin caja creados después del último cambio del interruptor, con la caja habilitada. */
async function cashUnlinked(db: AppDb) {
  const [row] = await db
    .select({ total })
    .from(payments)
    .innerJoin(branches, eq(branches.id, payments.branchId))
    .where(
      and(
        eq(branches.cashControlEnabled, true),
        eq(payments.method, "efectivo"),
        isNull(payments.voidedAt),
        isNull(payments.cashSessionId),
        sql`${payments.createdAt} > (
          select max(a.created_at) from audit_log a
          where a.branch_id = ${payments.branchId} and a.action = 'cash.control_changed'
        )`,
      ),
    );
  return row?.total ?? 0;
}

async function cashDifferenceOver(db: AppDb) {
  const [row] = await db
    .select({ total })
    .from(cashSessions)
    .where(
      and(
        isNotNull(cashSessions.closedAt),
        gt(sql`abs(${cashSessions.differenceClp})`, CASH_DIFFERENCE_LIMIT_CLP),
      ),
    );
  return row?.total ?? 0;
}

/** Productos cuyo stock no coincide con la suma de sus movimientos. */
async function stockDrift(db: AppDb) {
  const [row] = await db
    .select({ total })
    .from(products)
    .where(
      ne(
        products.stockQty,
        sql`coalesce((select sum(m.quantity) from stock_movements m where m.product_id = ${products.id}), 0)`,
      ),
    );
  return row?.total ?? 0;
}

/** Salud de la fase 2 en todas las sucursales: solo conteos, sin datos personales. */
export async function phase2Health(db: AppDb): Promise<Phase2Health> {
  const [neto, unlinked, difference, drift] = await Promise.all([
    netoInconsistent(db),
    cashUnlinked(db),
    cashDifferenceOver(db),
    stockDrift(db),
  ]);
  return {
    ok: neto === 0 && unlinked === 0 && difference === 0 && drift === 0,
    netoInconsistent: neto,
    cashUnlinked: unlinked,
    cashDifferenceOver: difference,
    stockDrift: drift,
  };
}
