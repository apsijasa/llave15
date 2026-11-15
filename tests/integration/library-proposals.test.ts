import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import { knowledgeProposals } from "../../src/server/db/schema-library-private.ts";
import { auditLog } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import {
  createProposal,
  listMyProposals,
  proposalDetail,
  submitProposal,
  updateProposal,
  withdrawProposal,
} from "../../src/server/library/proposals.ts";
import { searchLibrary } from "../../src/server/library/search.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-15T15:00:00.000Z");
const INPUT = {
  kind: "diagnostico",
  title: "Cadena que salta bajo carga en 12 velocidades",
  contentMd: "Revisar desgaste de cadena y cassette antes de ajustar el cambio trasero.",
  evidence: "Caso del taller",
};
let test: TestDb;
let author: SessionUser;
let colleague: SessionUser;
let outsider: SessionUser;

async function actor(branchId: string, role: Role): Promise<SessionUser> {
  const [row] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      name: `Usuario ${role}`,
      email: `${randomUUID()}@ejemplo.cl`,
      passwordHash: "hash-de-prueba",
    })
    .returning();
  if (!row) throw new Error("Falta el usuario");
  return { id: row.id, branchId, role, name: row.name, email: row.email };
}

async function created(input: unknown = INPUT, by = author): Promise<string> {
  const result = await createProposal(test.db, by, input, NOW);
  if (!result.ok) throw new Error(`No se creó: ${result.code}`);
  return result.id;
}

async function row(id: string) {
  const [proposal] = await test.db
    .select()
    .from(knowledgeProposals)
    .where(eq(knowledgeProposals.id, id));
  if (!proposal) throw new Error("Falta la propuesta");
  return proposal;
}

beforeEach(async () => {
  test = await createTestDb();
  const [a, b] = await test.db
    .insert(branches)
    .values([{ name: "Vitacura" }, { name: "Otra" }])
    .returning();
  if (!a || !b) throw new Error("Faltan sucursales");
  author = await actor(a.id, "mechanic");
  colleague = await actor(a.id, "reception");
  outsider = await actor(b.id, "owner");
  return () => test.close();
});

it("crea un borrador de la sucursal del autor y lo audita", async () => {
  const id = await created();
  expect(await row(id)).toMatchObject({
    status: "draft",
    branchId: author.branchId,
    authorId: author.id,
    piiFlags: [],
  });
  const audits = await test.db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityId, id), eq(auditLog.action, "proposal.created")));
  expect(audits).toHaveLength(1);
});

it("rechaza entradas inválidas y destinos inexistentes", async () => {
  expect(await createProposal(test.db, author, { ...INPUT, title: "x" }, NOW)).toEqual({
    ok: false,
    code: "validation_error",
  });
  expect(
    await createProposal(test.db, author, { ...INPUT, targetVariantId: randomUUID() }, NOW),
  ).toEqual({ ok: false, code: "invalid_target" });
});

it("al enviar guarda los datos personales detectados", async () => {
  const id = await created({ ...INPUT, evidence: "Cliente al +56 9 1234 5678" });
  const result = await submitProposal(test.db, author, id, NOW);
  expect(result).toMatchObject({ ok: true, piiFlags: [{ kind: "telefono" }] });
  expect(await row(id)).toMatchObject({ status: "submitted", submittedAt: NOW });
});

it("solo el autor edita, y solo en borrador o con cambios pedidos", async () => {
  const id = await created();
  expect(await updateProposal(test.db, colleague, id, INPUT, NOW)).toEqual({
    ok: false,
    code: "forbidden",
  });
  await submitProposal(test.db, author, id, NOW);
  expect(await updateProposal(test.db, author, id, INPUT, NOW)).toEqual({
    ok: false,
    code: "invalid_transition",
  });
  await test.db
    .update(knowledgeProposals)
    .set({ status: "needs_changes" })
    .where(eq(knowledgeProposals.id, id));
  const edited = { ...INPUT, title: "Cadena que salta: corregido" };
  expect(await updateProposal(test.db, author, id, edited, NOW)).toEqual({ ok: true });
  expect(await row(id)).toMatchObject({ status: "draft", title: edited.title });
});

it("otra sucursal no ve ni toca la propuesta", async () => {
  const id = await created();
  expect(await proposalDetail(test.db, outsider, id)).toEqual({ ok: false, code: "not_found" });
  expect(await submitProposal(test.db, outsider, id, NOW)).toEqual({
    ok: false,
    code: "not_found",
  });
  expect(await withdrawProposal(test.db, outsider, id, NOW)).toEqual({
    ok: false,
    code: "not_found",
  });
  expect(await listMyProposals(test.db, outsider)).toEqual([]);
  expect((await row(id)).status).toBe("draft");
});

it("el autor retira su propuesta y no puede volver a enviarla", async () => {
  const id = await created();
  expect(await withdrawProposal(test.db, author, id, NOW)).toEqual({ ok: true });
  expect(await row(id)).toMatchObject({ status: "withdrawn", withdrawnAt: NOW });
  expect(await submitProposal(test.db, author, id, NOW)).toEqual({
    ok: false,
    code: "invalid_transition",
  });
});

it("una propuesta enviada nunca aparece en la búsqueda", async () => {
  const id = await created();
  await submitProposal(test.db, author, id, NOW);
  const result = await searchLibrary(test.db, author, { q: "cadena salta" });
  expect(JSON.stringify(result)).not.toContain(INPUT.title);
});

it("el detalle trae revisiones y nombre del autor, y la lista es de la sucursal", async () => {
  const id = await created();
  const detail = await proposalDetail(test.db, colleague, id);
  expect(detail).toMatchObject({ ok: true, authorName: "Usuario mechanic", reviews: [] });
  const list = await listMyProposals(test.db, colleague);
  expect(list.map((item) => item.id)).toEqual([id]);
});
