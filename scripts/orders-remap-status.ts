import { pathToFileURL } from "node:url";
import { and, count, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDbEnv } from "../src/lib/env.ts";
import type { AppDb } from "../src/server/db/client.ts";
import { workOrders } from "../src/server/db/schema-orders.ts";
import { branches } from "../src/server/db/schema.ts";
import { LEGACY_ORDER_STATUSES, LEGACY_STATUS_MAP } from "../src/server/taller/rules.ts";
import type { LegacyOrderStatus } from "../src/server/taller/rules.ts";

type Counts = Record<LegacyOrderStatus, number>;
function emptyCounts(): Counts {
  return Object.fromEntries(LEGACY_ORDER_STATUSES.map((status) => [status, 0])) as Counts;
}

/** Una transacción por taller; también incluye órdenes anuladas. Nunca reescribe historial. */
export async function remapBranchStatuses(db: AppDb, branchId: string, dryRun: boolean, now: Date) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: workOrders.id, status: workOrders.status })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.branchId, branchId),
          inArray(workOrders.status, [...LEGACY_ORDER_STATUSES]),
        ),
      )
      .for("update");
    const remapped = emptyCounts();
    for (const row of rows) remapped[row.status as LegacyOrderStatus] += 1;
    if (!dryRun) {
      for (const status of LEGACY_ORDER_STATUSES) {
        if (!remapped[status]) continue;
        await tx
          .update(workOrders)
          .set({ status: LEGACY_STATUS_MAP[status], updatedAt: now })
          .where(and(eq(workOrders.branchId, branchId), eq(workOrders.status, status)));
      }
    }
    return remapped;
  });
}

export async function runOrdersRemap(
  db: AppDb,
  dryRun: boolean,
  now: Date,
  write: (line: string) => void,
) {
  const remapped = emptyCounts();
  const scopes = await db.select({ id: branches.id }).from(branches);
  for (const scope of scopes) {
    const counts = await remapBranchStatuses(db, scope.id, dryRun, now);
    for (const status of LEGACY_ORDER_STATUSES) remapped[status] += counts[status];
  }
  let pending = dryRun ? Object.values(remapped).reduce((total, n) => total + n, 0) : 0;
  if (!dryRun) {
    for (const scope of scopes) {
      const [row] = await db
        .select({ count: count() })
        .from(workOrders)
        .where(
          and(
            eq(workOrders.branchId, scope.id),
            inArray(workOrders.status, [...LEGACY_ORDER_STATUSES]),
          ),
        );
      pending += row?.count ?? 0;
    }
  }
  write(JSON.stringify({ pending, remapped }));
  return pending > 0 ? 1 : 0;
}

async function main(args: string[]): Promise<number> {
  if (args.length > 1 || (args.length === 1 && args[0] !== "--dry-run")) {
    console.error(
      JSON.stringify({ code: "usage", message: "Uso: pnpm orders:remap-status [--dry-run]" }),
    );
    return 2;
  }
  let client: ReturnType<typeof postgres> | undefined;
  try {
    client = postgres(getDbEnv().DATABASE_URL, { max: 1, connect_timeout: 5 });
    await client`select 1`;
    return await runOrdersRemap(
      drizzle({ client }),
      args.includes("--dry-run"),
      new Date(),
      (line) => console.log(line),
    );
  } catch {
    console.error(
      JSON.stringify({
        code: "remap_failed",
        message: "No se pudo completar el traspaso de estados.",
      }),
    );
    return 2;
  } finally {
    await client?.end({ timeout: 1 }).catch(() => undefined);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
