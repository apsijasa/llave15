import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import { knowledgeProposals, proposalReviews } from "../../src/server/db/schema-library-private.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { createProposal, submitProposal } from "../../src/server/library/proposals.ts";
import { reviewDetail, reviewProposal, reviewQueue } from "../../src/server/library/review.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-15T15:00:00.000Z");
let test: TestDb;
let curator: SessionUser;
let ownerWithoutFlag: SessionUser;
let mechanicA: SessionUser;
let mechanicB: SessionUser;

async function actor(branchId: string, role: Role, libraryCurator = false): Promise<SessionUser> {
  const [row] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      libraryCurator,
      name: `Usuario ${role}`,
      email: `${randomUUID()}@ejemplo.cl`,
      passwordHash: "hash-de-prueba",
    })
    .returning();
  if (!row) throw new Error("Falta el usuario");
  return { id: row.id, branchId, role, libraryCurator, name: row.name, email: row.email };
}

async function submitted(by: SessionUser, evidence = ""): Promise<string> {
  const created = await createProposal(
    test.db,
    by,
    {
      kind: "articulo",
      title: `Propuesta de ${by.role} ${randomUUID().slice(0, 4)}`,
      contentMd: "Contenido técnico suficiente para revisar en la biblioteca central.",
      evidence,
    },
    NOW,
  );
  if (!created.ok) throw new Error(created.code);
  await submitProposal(test.db, by, created.id, NOW);
  return created.id;
}

async function status(id: string) {
  const [row] = await test.db
    .select({ status: knowledgeProposals.status })
    .from(knowledgeProposals)
    .where(eq(knowledgeProposals.id, id));
  return row?.status;
}

beforeEach(async () => {
  test = await createTestDb();
  const [a, b] = await test.db
    .insert(branches)
    .values([{ name: "Vitacura" }, { name: "Otra" }])
    .returning();
  if (!a || !b) throw new Error("Faltan sucursales");
  curator = await actor(a.id, "owner", true);
  ownerWithoutFlag = await actor(a.id, "owner");
  mechanicA = await actor(a.id, "mechanic", true);
  mechanicB = await actor(b.id, "mechanic");
  return () => test.close();
});

it("solo el curador con marca ve la cola, el detalle y decide", async () => {
  const id = await submitted(mechanicA);
  for (const user of [ownerWithoutFlag, mechanicA]) {
    expect(await reviewQueue(test.db, user)).toEqual({ ok: false, code: "forbidden" });
    expect(await reviewDetail(test.db, user, id)).toEqual({ ok: false, code: "forbidden" });
    expect(await reviewProposal(test.db, user, id, { decision: "in_review" }, NOW)).toEqual({
      ok: false,
      code: "forbidden",
    });
  }
  expect(await status(id)).toBe("submitted");
});

it("la cola trae propuestas de todas las sucursales sin datos del taller", async () => {
  await submitted(mechanicA);
  await submitted(mechanicB);
  const queue = await reviewQueue(test.db, curator);
  if (!queue.ok) throw new Error(queue.code);
  expect(queue.items).toHaveLength(2);
  for (const item of queue.items) {
    expect(Object.keys(item).sort()).toEqual(
      ["id", "kind", "piiCount", "status", "submittedAt", "targetArticleTitle", "title"].sort(),
    );
  }
  const detail = await reviewDetail(test.db, curator, queue.items[0]?.id ?? "");
  expect(JSON.stringify(detail)).not.toMatch(/branchId|authorId/);
});

it("pedir cambios o rechazar exige motivo", async () => {
  const id = await submitted(mechanicA);
  expect(await reviewProposal(test.db, curator, id, { decision: "needs_changes" }, NOW)).toEqual({
    ok: false,
    code: "reason_required",
  });
  expect(
    await reviewProposal(
      test.db,
      curator,
      id,
      { decision: "needs_changes", reason: "Falta citar el manual" },
      NOW,
    ),
  ).toEqual({ ok: true });
  expect(await status(id)).toBe("needs_changes");
  const reviews = await test.db.select().from(proposalReviews);
  expect(reviews).toMatchObject([{ decision: "needs_changes", reason: "Falta citar el manual" }]);
});

it("aprobar con datos personales exige confirmar la revisión", async () => {
  const id = await submitted(mechanicA, "Cliente con patente BCDF12");
  await reviewProposal(test.db, curator, id, { decision: "in_review" }, NOW);
  expect(await reviewProposal(test.db, curator, id, { decision: "approved" }, NOW)).toEqual({
    ok: false,
    code: "pii_unresolved",
  });
  expect(
    await reviewProposal(
      test.db,
      curator,
      id,
      { decision: "approved", checklist: { piiRevisada: true } },
      NOW,
    ),
  ).toEqual({ ok: true });
  expect(await status(id)).toBe("approved");
});

it("rechaza transiciones inválidas y entradas mal formadas", async () => {
  const id = await submitted(mechanicA);
  expect(await reviewProposal(test.db, curator, id, { decision: "approved" }, NOW)).toEqual({
    ok: false,
    code: "invalid_transition",
  });
  expect(await reviewProposal(test.db, curator, id, { decision: "published" }, NOW)).toEqual({
    ok: false,
    code: "validation_error",
  });
  expect(
    await reviewProposal(test.db, curator, randomUUID(), { decision: "in_review" }, NOW),
  ).toEqual({ ok: false, code: "not_found" });
});
