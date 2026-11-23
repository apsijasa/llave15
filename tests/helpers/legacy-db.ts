import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { AppDb } from "../../src/server/db/client.ts";
import type { TestDb } from "./pglite.ts";
import { seedShop, VECTOR_BIKES_PROFILE } from "./shops.ts";

/** Última migración antes del contract de V-BG3: `shop_id` y `branch_id` todavía nulables. */
const LEGACY_LAST_MIGRATION = "0038_peaceful_living_tribunal";
/**
 * Migraciones posteriores, solo aditivas, que agregan columnas a `shops`: Drizzle inserta todas
 * las columnas del esquema al sembrar el taller, así que la base heredada también las necesita.
 */
const LATER_SHOP_COLUMNS = ["0044_dizzy_tusk"] as const;

/**
 * Filas heredadas sin taller o sin sucursal. Solo caben en la base de `createLegacyTestDb()`:
 * desde BG-09 el esquema las declara NOT NULL (BG-D42).
 */
export const NO_SHOP = null as unknown as string;
export const NO_BRANCH = null as unknown as string;

type Journal = { entries: { idx: number; tag: string }[] };

async function legacyMigrations(): Promise<string> {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as Journal;
  const last = journal.entries.findIndex((entry) => entry.tag === LEGACY_LAST_MIGRATION);
  if (last < 0) throw new Error(`Falta la migración ${LEGACY_LAST_MIGRATION}`);
  const entries = journal.entries.slice(0, last + 1);
  const folder = await mkdtemp(join(tmpdir(), "legacy-drizzle-"));
  await mkdir(join(folder, "meta"));
  await writeFile(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  for (const entry of entries) {
    await copyFile(join("drizzle", `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
  }
  return folder;
}

/**
 * Base como la de producción antes de V-BG3 (migrada hasta `0038`), con el taller Vector Bikes
 * sembrado igual que `createTestDb()`. Solo para pruebas que necesitan filas sin taller o sin
 * sucursal (la migración de datos `bg:backfill` y el alcance de una sucursal huérfana).
 */
export async function createLegacyTestDb(): Promise<TestDb> {
  const folder = await legacyMigrations();
  const client = new PGlite();
  try {
    await migrate(drizzle({ client }), { migrationsFolder: folder });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
  for (const tag of LATER_SHOP_COLUMNS) {
    await client.exec(await readFile(join("drizzle", `${tag}.sql`), "utf8"));
  }
  const db = drizzle({ client }) as unknown as AppDb;
  await seedShop(db, VECTOR_BIKES_PROFILE);
  return { db, client, close: () => client.close() };
}
