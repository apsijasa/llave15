import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { componentVariants } from "../../src/server/db/schema-library-catalog.ts";
import { bikeComponents } from "../../src/server/db/schema-payments.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { importLibraryPack, libraryPackSchema } from "../../src/server/library/content-pack.ts";
import {
  linkComponentVariant,
  orderTechnicalContext,
} from "../../src/server/library/technical-context.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-15T15:00:00.000Z");
let test: TestDb;
let owner: SessionUser;
let outsider: SessionUser;
let orderId: string;
let componentId: string;
let variantId: string;

async function actor(branchId: string, role: Role): Promise<SessionUser> {
  const [row] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      name: `Usuario ${role}`,
      email: `${randomUUID()}@ejemplo.cl`,
      passwordHash: "hash",
    })
    .returning();
  if (!row) throw new Error("Falta el usuario");
  return { id: row.id, branchId, role, name: row.name, email: row.email };
}

beforeEach(async () => {
  test = await createTestDb();
  const [a, b] = await test.db
    .insert(branches)
    .values([{ name: "Vitacura" }, { name: "Otra" }])
    .returning();
  if (!a || !b) throw new Error("Faltan sucursales");
  owner = await actor(a.id, "owner");
  outsider = await actor(b.id, "owner");
  const pack = libraryPackSchema.parse(
    JSON.parse(readFileSync("src/data/library/pack.json", "utf8")),
  );
  await importLibraryPack(test.db, null, pack, NOW, { dryRun: false });
  const [variant] = await test.db
    .select()
    .from(componentVariants)
    .where(eq(componentVariants.code, "CN-M8100"));
  variantId = variant?.id ?? "";
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: a.id,
      name: "Cliente Secreto",
      phoneE164: "+56911112222",
      email: "s@ejemplo.cl",
    })
    .returning();
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: a.id,
      customerId: customer?.id ?? "",
      brand: "Trek",
      model: "Marlin",
      bikeType: "mtb",
      size: "M",
    })
    .returning();
  const [row] = await test.db
    .insert(workOrders)
    .values({
      branchId: a.id,
      number: 7,
      customerId: customer?.id ?? "",
      bikeId: bike?.id ?? "",
      requestedService: "Revisión",
      createdBy: owner.id,
    })
    .returning();
  orderId = row?.id ?? "";
  const [part] = await test.db
    .insert(bikeComponents)
    .values({
      branchId: a.id,
      bikeId: bike?.id ?? "",
      workOrderId: orderId,
      componentType: "Cadena",
      brand: "Shimano",
      model: "CN-M8100",
      installedAt: "2026-11-01",
      createdBy: owner.id,
    })
    .returning();
  componentId = part?.id ?? "";
  return () => test.close();
});

it("liga un componente a su variante y el contexto la muestra sin datos del cliente", async () => {
  expect(await linkComponentVariant(test.db, owner, componentId, variantId, NOW)).toEqual({
    ok: true,
  });
  const result = await orderTechnicalContext(test.db, owner, orderId);
  if (!result.ok) throw new Error(result.code);
  expect(result.context.bike).toMatchObject({ brand: "Trek", size: "M" });
  expect(result.context.components[0]?.variant).toMatchObject({ id: variantId, code: "CN-M8100" });
  const json = JSON.stringify(result.context);
  for (const secret of ["Cliente Secreto", "+56911112222", "s@ejemplo.cl", "totalClp", "price"])
    expect(json).not.toContain(secret);
});

it("desliga y valida la variante", async () => {
  await linkComponentVariant(test.db, owner, componentId, variantId, NOW);
  expect(await linkComponentVariant(test.db, owner, componentId, null, NOW)).toEqual({ ok: true });
  const result = await orderTechnicalContext(test.db, owner, orderId);
  expect(result.ok && result.context.components[0]?.variant).toBeNull();
  expect(await linkComponentVariant(test.db, owner, componentId, randomUUID(), NOW)).toEqual({
    ok: false,
    code: "invalid_variant",
  });
});

it("otra sucursal no ve el contexto ni liga componentes", async () => {
  expect(await orderTechnicalContext(test.db, outsider, orderId)).toEqual({
    ok: false,
    code: "not_found",
  });
  expect(await linkComponentVariant(test.db, outsider, componentId, variantId, NOW)).toEqual({
    ok: false,
    code: "not_found",
  });
});
