import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword, loginAdmin, requireAdmin } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import {
  aiInteractions,
  knowledgeProposals,
  privateTechnicalNotes,
  technicalDiagnoses,
} from "../../src/server/db/schema-library-private.ts";
import { bikeComponents } from "../../src/server/db/schema-payments.ts";
import { componentVariants } from "../../src/server/db/schema-library-catalog.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { adminSessions, branches, users } from "../../src/server/db/schema.ts";
import { noneProvider } from "../../src/server/library/ai-provider.ts";
import { askAssistant, recentInteractions } from "../../src/server/library/assistant.ts";
import { reindexAll } from "../../src/server/library/chunks.ts";
import { importLibraryPack, libraryPackSchema } from "../../src/server/library/content-pack.ts";
import {
  confirmDiagnosis,
  listDiagnoses,
  saveDiagnosis,
  voidDiagnosis,
} from "../../src/server/library/diagnoses.ts";
import {
  createProposal,
  listMyProposals,
  proposalDetail,
  submitProposal,
  updateProposal,
  withdrawProposal,
} from "../../src/server/library/proposals.ts";
import { retrieve } from "../../src/server/library/retrieval.ts";
import { reviewDetail, reviewQueue } from "../../src/server/library/review.ts";
import {
  linkComponentVariant,
  orderTechnicalContext,
} from "../../src/server/library/technical-context.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-15T15:00:00.000Z");
const SECRET = `secreto-${randomUUID()}`;
const PASSWORD = "clave-aislamiento-prueba";
let test: TestDb;
let ownerA: SessionUser;
let curatorA: SessionUser;
let ownerB: SessionUser;
let mechanicB: SessionUser;
let orderA: string;
let componentA: string;
let diagnosisA: string;
let proposalA: string;
let variantId: string;

async function actor(
  branchId: string,
  role: Role,
  libraryCurator = false,
): Promise<SessionUser & { email: string }> {
  const [row] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      libraryCurator,
      name: `Persona ${randomUUID().slice(0, 6)}`,
      email: `${randomUUID()}@ejemplo.cl`,
      passwordHash: await hashPassword(PASSWORD),
    })
    .returning();
  if (!row) throw new Error("Falta el usuario");
  return { id: row.id, branchId, role, libraryCurator, name: row.name, email: row.email };
}

async function seedBranchA(branchId: string) {
  const [customer] = await test.db
    .insert(customers)
    .values({ branchId, name: `Cliente ${SECRET}`, phoneE164: "+56911112222" })
    .returning();
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId,
      customerId: customer?.id ?? "",
      brand: "Trek",
      model: "Marlin",
      bikeType: "mtb",
    })
    .returning();
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId,
      number: 1,
      customerId: customer?.id ?? "",
      bikeId: bike?.id ?? "",
      requestedService: SECRET,
      createdBy: ownerA.id,
    })
    .returning();
  orderA = order?.id ?? "";
  const [part] = await test.db
    .insert(bikeComponents)
    .values({
      branchId,
      bikeId: bike?.id ?? "",
      workOrderId: orderA,
      componentType: "Cadena",
      brand: "Shimano",
      model: "CN-M8100",
      installedAt: "2026-11-01",
      createdBy: ownerA.id,
    })
    .returning();
  componentA = part?.id ?? "";
  const saved = await saveDiagnosis(
    test.db,
    ownerA,
    orderA,
    { symptoms: `Cadena salta ${SECRET}` },
    NOW,
  );
  if (!saved.ok) throw new Error(saved.code);
  diagnosisA = saved.id;
  await test.db.insert(privateTechnicalNotes).values({
    branchId,
    authorId: ownerA.id,
    workOrderId: orderA,
    contentMd: `Nota cadena ${SECRET}`,
  });
  const proposal = await createProposal(
    test.db,
    ownerA,
    {
      kind: "articulo",
      title: "Propuesta de la sucursal A",
      contentMd: `Contenido privado ${SECRET} de la propuesta`,
    },
    NOW,
  );
  if (!proposal.ok) throw new Error(proposal.code);
  proposalA = proposal.id;
  await askAssistant(test.db, ownerA, noneProvider, { question: `cadena salta ${SECRET}` }, NOW);
}

async function snapshot() {
  const tables = [
    technicalDiagnoses,
    privateTechnicalNotes,
    knowledgeProposals,
    aiInteractions,
    bikeComponents,
    workOrders,
  ];
  return Promise.all(tables.map((table) => test.db.select().from(table)));
}

beforeEach(async () => {
  test = await createTestDb();
  const [a, b] = await test.db
    .insert(branches)
    .values([{ name: "Vitacura" }, { name: "Otra" }])
    .returning();
  if (!a || !b) throw new Error("Faltan sucursales");
  ownerA = await actor(a.id, "owner");
  curatorA = await actor(a.id, "admin", true);
  ownerB = await actor(b.id, "owner", true);
  mechanicB = await actor(b.id, "mechanic");
  const pack = libraryPackSchema.parse(
    JSON.parse(readFileSync("src/data/library/pack.json", "utf8")),
  );
  await importLibraryPack(test.db, null, pack, NOW, { dryRun: false });
  await reindexAll(test.db);
  const [variant] = await test.db.select().from(componentVariants).limit(1);
  variantId = variant?.id ?? "";
  await seedBranchA(a.id);
  return () => test.close();
});

describe("la sucursal B no alcanza nada privado de la sucursal A", () => {
  it("ninguna función privada responde ni escribe", async () => {
    const before = await snapshot();
    for (const user of [ownerB, mechanicB]) {
      expect(await proposalDetail(test.db, user, proposalA)).toEqual({
        ok: false,
        code: "not_found",
      });
      expect(
        await updateProposal(
          test.db,
          user,
          proposalA,
          {
            kind: "articulo",
            title: "Cambio ajeno",
            contentMd: "Contenido ajeno suficiente para validar",
          },
          NOW,
        ),
      ).toEqual({ ok: false, code: "not_found" });
      expect(await submitProposal(test.db, user, proposalA, NOW)).toEqual({
        ok: false,
        code: "not_found",
      });
      expect(await withdrawProposal(test.db, user, proposalA, NOW)).toEqual({
        ok: false,
        code: "not_found",
      });
      expect(await saveDiagnosis(test.db, user, orderA, { symptoms: "ajeno" }, NOW)).toEqual({
        ok: false,
        code: "not_found",
      });
      expect(await confirmDiagnosis(test.db, user, diagnosisA, NOW)).toEqual({
        ok: false,
        code: "not_found",
      });
      expect(await voidDiagnosis(test.db, user, diagnosisA, NOW)).toEqual({
        ok: false,
        code: "not_found",
      });
      expect(await listDiagnoses(test.db, user, orderA)).toEqual({ ok: false, code: "not_found" });
      expect(await orderTechnicalContext(test.db, user, orderA)).toEqual({
        ok: false,
        code: "not_found",
      });
      expect(await retrieve(test.db, user, { question: "cadena salta", orderId: orderA })).toEqual({
        ok: false,
        code: "forbidden",
      });
      expect(
        await askAssistant(
          test.db,
          user,
          noneProvider,
          { question: "cadena salta", scope: "orden", orderId: orderA },
          NOW,
        ),
      ).toEqual({ ok: false, code: "forbidden" });
    }
    expect(await linkComponentVariant(test.db, ownerB, componentA, variantId, NOW)).toEqual({
      ok: false,
      code: "not_found",
    });
    expect(await snapshot()).toEqual(before);
  });

  it("las listas de la sucursal B no muestran nada de A", async () => {
    expect(await listMyProposals(test.db, ownerB)).toEqual([]);
    expect(await recentInteractions(test.db, ownerB)).toEqual([]);
    const answer = await askAssistant(
      test.db,
      ownerB,
      noneProvider,
      { question: "cadena salta nota" },
      NOW,
    );
    expect(JSON.stringify(answer)).not.toContain(SECRET);
    const retrieved = await retrieve(test.db, ownerB, { question: "cadena salta nota" });
    expect(JSON.stringify(retrieved)).not.toContain(SECRET);
  });
});

describe("el curador central", () => {
  it("no recibe filas privadas de otra sucursal", async () => {
    await submitProposal(test.db, ownerA, proposalA, NOW);
    const queue = await reviewQueue(test.db, ownerB);
    expect(queue.ok).toBe(true);
    const detail = await reviewDetail(test.db, ownerB, proposalA);
    const json = JSON.stringify({ queue, detail });
    expect(json).not.toContain(ownerA.id);
    expect(json).not.toContain(ownerA.branchId);
    expect(json).not.toContain(ownerA.name);
    expect(await orderTechnicalContext(test.db, ownerB, orderA)).toEqual({
      ok: false,
      code: "not_found",
    });
    expect(await listDiagnoses(test.db, ownerB, orderA)).toEqual({ ok: false, code: "not_found" });
  });

  it("dentro de su propia sucursal solo ve lo que su rol permite", async () => {
    const context = await orderTechnicalContext(test.db, curatorA, orderA);
    expect(context.ok).toBe(true);
    expect(JSON.stringify(context)).not.toContain(`Cliente ${SECRET}`);
  });
});

describe("acceso revocado", () => {
  it("un usuario desactivado o con sesión revocada pierde la sesión", async () => {
    const user = await actor(ownerA.branchId, "mechanic");
    const login = await loginAdmin(test.db, {
      email: user.email,
      password: PASSWORD,
      ipHash: "a".repeat(64),
      now: NOW,
    });
    if (!login.ok) throw new Error(login.code);
    expect(await requireAdmin(test.db, login.token, NOW)).not.toBeNull();
    await test.db.update(users).set({ isActive: false }).where(eq(users.id, user.id));
    expect(await requireAdmin(test.db, login.token, NOW)).toBeNull();
    await test.db.update(users).set({ isActive: true }).where(eq(users.id, user.id));
    await test.db
      .update(adminSessions)
      .set({ revokedAt: NOW })
      .where(eq(adminSessions.userId, user.id));
    expect(await requireAdmin(test.db, login.token, NOW)).toBeNull();
  });
});
