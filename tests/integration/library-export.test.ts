import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeEach, expect, it } from "vitest";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import {
  aiInteractions,
  knowledgeProposals,
  privateTechnicalNotes,
  technicalDiagnoses,
} from "../../src/server/db/schema-library-private.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { importLibraryPack, libraryPackSchema } from "../../src/server/library/content-pack.ts";
import { exportLibraryPack } from "../../src/server/library/content-pack-export.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-15T15:00:00.000Z");
const SECRET = `privado-${randomUUID()}`;
let test: TestDb;

function realPack() {
  return libraryPackSchema.parse(JSON.parse(readFileSync("src/data/library/pack.json", "utf8")));
}

async function seedPrivate(db: TestDb["db"]) {
  const [branch] = await db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta la sucursal");
  const [user] = await db
    .insert(users)
    .values({
      branchId: branch.id,
      role: "owner",
      name: "Dueño",
      email: `${randomUUID()}@ejemplo.cl`,
      passwordHash: "hash",
    })
    .returning();
  if (!user) throw new Error("Falta el usuario");
  const [customer] = await db
    .insert(customers)
    .values({ branchId: branch.id, name: "Cliente", phoneE164: "+56911112222" })
    .returning();
  if (!customer) throw new Error("Falta el cliente");
  const [bike] = await db
    .insert(bikes)
    .values({
      branchId: branch.id,
      customerId: customer.id,
      brand: "B",
      model: "M",
      bikeType: "mtb",
    })
    .returning();
  if (!bike) throw new Error("Falta la bici");
  const [order] = await db
    .insert(workOrders)
    .values({
      branchId: branch.id,
      number: 1,
      customerId: customer.id,
      bikeId: bike.id,
      requestedService: "Revisión",
      createdBy: user.id,
    })
    .returning();
  if (!order) throw new Error("Falta la orden");
  await db.insert(knowledgeProposals).values({
    branchId: branch.id,
    authorId: user.id,
    kind: "articulo",
    title: `Propuesta ${SECRET}`,
    contentMd: SECRET,
  });
  await db.insert(technicalDiagnoses).values({
    branchId: branch.id,
    workOrderId: order.id,
    bikeId: bike.id,
    symptoms: SECRET,
    createdBy: user.id,
  });
  await db.insert(privateTechnicalNotes).values({
    branchId: branch.id,
    authorId: user.id,
    contentMd: SECRET,
  });
  await db.insert(aiInteractions).values({
    branchId: branch.id,
    userId: user.id,
    scope: "biblioteca",
    question: SECRET,
    confidence: "no_verificada",
    provider: "none",
    promptVersion: "bt-1",
    status: "respondida",
  });
  return user.id;
}

beforeEach(async () => {
  test = await createTestDb();
  return () => test.close();
});

it("exporta un paquete válido que se vuelve a importar con los mismos conteos", async () => {
  const actorId = await seedPrivate(test.db);
  const first = await importLibraryPack(test.db, actorId, realPack(), NOW, { dryRun: false });
  if (!first.ok) throw new Error(first.code);
  const exported = await exportLibraryPack(test.db, NOW);
  expect(libraryPackSchema.safeParse(exported).success).toBe(true);
  const other = await createTestDb();
  try {
    const second = await importLibraryPack(other.db, null, exported, NOW, { dryRun: false });
    if (!second.ok) throw new Error(second.code);
    const { publicationEvents: _first, ...firstCreated } = first.created;
    const { publicationEvents: _second, ...secondCreated } = second.created;
    expect(secondCreated).toEqual(firstCreated);
  } finally {
    await other.close();
  }
});

it("no incluye propuestas, diagnósticos, notas ni consultas de ningún taller", async () => {
  const actorId = await seedPrivate(test.db);
  await importLibraryPack(test.db, actorId, realPack(), NOW, { dryRun: false });
  const json = JSON.stringify(await exportLibraryPack(test.db, NOW));
  expect(json).not.toContain(SECRET);
  expect(json).not.toMatch(/branchId|branch_id|authorId|storageKey/);
});

it("un artículo archivado no viaja en el paquete", async () => {
  await importLibraryPack(test.db, null, realPack(), NOW, { dryRun: false });
  const { knowledgeArticles } = await import("../../src/server/db/schema-library-knowledge.ts");
  await test.db.update(knowledgeArticles).set({ status: "archivado" });
  expect((await exportLibraryPack(test.db, NOW)).articles).toEqual([]);
});
