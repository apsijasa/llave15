import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, expect, it } from "vitest";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { technicalDiagnoses } from "../../src/server/db/schema-library-private.ts";
import { documentChunks } from "../../src/server/db/schema-library-knowledge.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { reindexAll } from "../../src/server/library/chunks.ts";
import { importLibraryPack, libraryPackSchema } from "../../src/server/library/content-pack.ts";
import { libraryIsolationHealth } from "../../src/server/library/isolation-health.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-15T15:00:00.000Z");
let test: TestDb;

beforeEach(async () => {
  test = await createTestDb();
  const pack = libraryPackSchema.parse(
    JSON.parse(readFileSync("src/data/library/pack.json", "utf8")),
  );
  await importLibraryPack(test.db, null, pack, NOW, { dryRun: false });
  await reindexAll(test.db);
  return () => test.close();
});

it("una base sana devuelve ok y todos los conteos en cero", async () => {
  expect(await libraryIsolationHealth(test.db)).toEqual({
    ok: true,
    diagnosesCrossBranch: 0,
    interactionsCrossBranch: 0,
    notesCrossBranch: 0,
    publishedWithoutVersion: 0,
    verifiedWithoutSource: 0,
    orphanChunks: 0,
  });
});

it("cuenta un diagnóstico cuya orden es de otra sucursal y un trozo huérfano", async () => {
  const [a, b] = await test.db
    .insert(branches)
    .values([{ name: "A" }, { name: "B" }])
    .returning();
  const [user] = await test.db
    .insert(users)
    .values({
      branchId: a?.id ?? "",
      role: "owner",
      name: "U",
      email: `${randomUUID()}@ejemplo.cl`,
      passwordHash: "h",
    })
    .returning();
  const [customer] = await test.db
    .insert(customers)
    .values({ branchId: a?.id ?? "", name: "C", phoneE164: "+56911112222" })
    .returning();
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: a?.id ?? "",
      customerId: customer?.id ?? "",
      brand: "B",
      model: "M",
      bikeType: "mtb",
    })
    .returning();
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: a?.id ?? "",
      number: 1,
      customerId: customer?.id ?? "",
      bikeId: bike?.id ?? "",
      requestedService: "x",
      createdBy: user?.id ?? "",
    })
    .returning();
  await test.db.insert(technicalDiagnoses).values({
    branchId: b?.id ?? "",
    workOrderId: order?.id ?? "",
    bikeId: bike?.id ?? "",
    symptoms: "x",
    createdBy: user?.id ?? "",
  });
  await test.db.insert(documentChunks).values({
    sourceKind: "article_version",
    sourceId: randomUUID(),
    chunkIndex: 0,
    text: "huérfano",
  });
  const health = await libraryIsolationHealth(test.db);
  expect(health).toMatchObject({ ok: false, diagnosesCrossBranch: 1, orphanChunks: 1 });
});
