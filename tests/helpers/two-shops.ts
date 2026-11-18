import { eq } from "drizzle-orm";
import type { AppDb } from "../../src/server/db/client.ts";
import { shops } from "../../src/server/db/schema-shops.ts";
import { users } from "../../src/server/db/schema.ts";
import { scopeForBranch } from "../../src/server/shops/scope.ts";
import { DEMO_SHOP_PROFILE, insertBranchForShop, seedShop } from "./shops.ts";

async function seedStaff(db: AppDb, branchId: string, slug: string, role: "owner" | "mechanic") {
  const [user] = await db
    .insert(users)
    .values({
      branchId,
      role,
      name: role === "owner" ? "Dueña" : "Mecánico",
      email: `${role}@${slug}.example`,
      passwordHash: "hash-de-prueba",
    })
    .returning();
  if (!user) throw new Error("Falta el usuario de prueba.");
  return { id: user.id, branchId, role, name: user.name, email: user.email };
}

async function seedBranch(db: AppDb, shop: typeof shops.$inferSelect, name: string) {
  const branch = await insertBranchForShop(db, shop.id, name);
  const owner = await seedStaff(db, branch.id, shop.slug, "owner");
  const mechanic = await seedStaff(db, branch.id, shop.slug, "mechanic");
  const scope = await scopeForBranch(db, branch.id);
  if (!scope) throw new Error("Falta el alcance del taller de prueba.");
  return { shop, branch, owner, mechanic, scope };
}

/** `createTestDb` ya siembra el primer taller, sin sucursal ni personal. */
export async function seedTwoShops(db: AppDb) {
  const [shop] = await db.select().from(shops).where(eq(shops.slug, "vector-bikes"));
  if (!shop) throw new Error("Falta el primer taller de prueba.");
  const vector = await seedBranch(db, shop, "Vitacura");
  const demoShop = await seedShop(db, DEMO_SHOP_PROFILE);
  const demo = await seedBranch(db, demoShop, "Ñuñoa");
  return { vector, demo };
}
