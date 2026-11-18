import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { AppDb } from "../../src/server/db/client.ts";
import { shops } from "../../src/server/db/schema-shops.ts";
import { VECTOR_BIKES_PROFILE, insertBranchForShop, seedShop } from "./shops.ts";

export type TestDb = { db: AppDb; client: PGlite; close: () => Promise<void> };

export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const pgliteDb = drizzle({ client });
  await migrate(pgliteDb, { migrationsFolder: "drizzle" });
  const db = pgliteDb as unknown as AppDb;
  await seedShop(db, VECTOR_BIKES_PROFILE);
  return { db, client, close: () => client.close() };
}

export async function createBookingTestDb(): Promise<TestDb> {
  const test = await createTestDb();
  const [shop] = await test.db.select({ id: shops.id }).from(shops);
  if (!shop) throw new Error("Falta el taller de prueba");
  await insertBranchForShop(test.db, shop.id, "Vitacura");
  return test;
}
