import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeEach, expect, it, vi } from "vitest";
import { hashPassword, loginAdmin, SESSION_COOKIE } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { knowledgeProposals } from "../../src/server/db/schema-library-private.ts";
import { knowledgeArticles } from "../../src/server/db/schema-library-knowledge.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { createProposal, submitProposal } from "../../src/server/library/proposals.ts";
import { reviewProposal } from "../../src/server/library/review.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null }));
vi.mock("../../src/server/db/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Falta base");
    return holder.db;
  },
}));
const NOW = new Date("2026-11-15T12:00:00Z");
const ORIGIN = "https://vectorbikes.cl";
const BASE = "/taller/biblioteca/revision";
const PASSWORD = "clave-propuestas-prueba";
const VALID = {
  kind: "diagnostico",
  title: "Cadena que salta en 12 velocidades",
  contentMd: "Medir desgaste de la cadena antes de ajustar el cambio trasero.",
  evidence: "",
  targetArticleId: "",
  targetVariantId: "",
};
let test: TestDb;
let mechanic: SessionUser & { email: string };
let curator: SessionUser & { email: string };
let owner: SessionUser & { email: string };
let outsider: SessionUser & { email: string };

async function actor(branchId: string, role: Role, libraryCurator = false) {
  const [row] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      libraryCurator,
      name: `Usuario ${role}`,
      email: `${randomUUID()}@ejemplo.cl`,
      passwordHash: await hashPassword(PASSWORD),
    })
    .returning();
  if (!row) throw new Error("Falta usuario");
  return { id: row.id, branchId, role, libraryCurator, name: row.name, email: row.email };
}

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  const [a, b] = await test.db
    .insert(branches)
    .values([{ name: "Vitacura" }, { name: "Otra" }])
    .returning();
  if (!a || !b) throw new Error("Faltan sucursales");
  mechanic = await actor(a.id, "mechanic");
  outsider = await actor(b.id, "owner");
  curator = await actor(a.id, "owner", true);
  owner = await actor(a.id, "owner");
  return async () => {
    vi.useRealTimers();
    holder.db = null;
    await test.close();
  };
});

async function login(user: { email: string }) {
  const result = await loginAdmin(test.db, {
    email: user.email,
    password: PASSWORD,
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!result.ok) throw new Error(result.code);
  return result.token;
}

type PageModule = { default: Parameters<AstroContainer["renderToResponse"]>[0] };

async function render(
  load: () => Promise<PageModule>,
  path: string,
  params: Record<string, string>,
  token?: string,
  data?: Record<string, string>,
  origin: string | undefined = ORIGIN,
) {
  const { default: Page } = await load();
  const headers = new Headers(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {});
  if (data && origin) headers.set("origin", origin);
  const request = new Request(`${ORIGIN}${path}`, {
    method: data ? "POST" : "GET",
    headers,
    body: data ? new URLSearchParams(data) : undefined,
  });
  const container = await AstroContainer.create({ astroConfig: { site: ORIGIN } });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  return container.renderToResponse(Page, { request, params }).finally(() => vi.useRealTimers());
}

const queuePage = () => import("../../src/pages/taller/biblioteca/revision/index.astro");
const reviewPage = () => import("../../src/pages/taller/biblioteca/revision/[id].astro");

async function submitted(by = outsider) {
  const created = await createProposal(test.db, by, VALID, NOW);
  if (!created.ok) throw new Error(created.code);
  await submitProposal(test.db, by, created.id, NOW);
  return created.id;
}

it("un dueño sin marca de curador recibe 403 en la cola y el detalle", async () => {
  const id = await submitted();
  const token = await login(owner);
  expect((await render(queuePage, BASE, {}, token)).status).toBe(403);
  expect((await render(reviewPage, `${BASE}/${id}`, { id }, token)).status).toBe(403);
});

it("el curador ve la cola de otras sucursales sin datos del taller", async () => {
  await submitted(outsider);
  const response = await render(queuePage, BASE, {}, await login(curator));
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain(VALID.title);
  expect(html).not.toContain(outsider.email);
  expect(html).not.toContain(outsider.id);
  expect(html).not.toContain(outsider.branchId);
});

it("el detalle muestra el contenido como diferencia y pedir cambios exige motivo", async () => {
  const id = await submitted();
  const token = await login(curator);
  const path = `${BASE}/${id}`;
  const html = await (await render(reviewPage, path, { id }, token)).text();
  expect(html).toMatch(/<ins>/);
  const missing = await render(reviewPage, path, { id }, token, {
    action: "decide",
    decision: "needs_changes",
    reason: "",
  });
  expect(missing.status).toBe(422);
  expect(await missing.text()).toContain("Escribe el motivo");
});

it("el curador aprueba y publica, y el artículo queda publicado", async () => {
  const id = await submitted();
  await reviewProposal(test.db, curator, id, { decision: "in_review" }, NOW);
  const token = await login(curator);
  const path = `${BASE}/${id}`;
  const approve = await render(reviewPage, path, { id }, token, {
    action: "decide",
    decision: "approved",
  });
  expect(approve.status).toBe(303);
  const publish = await render(reviewPage, path, { id }, token, {
    action: "publish",
    category: "transmision",
    justification: "Revisado",
  });
  expect(publish.status).toBe(303);
  expect(publish.headers.get("location")).toBe(`${BASE}?hecho=publicada`);
  const [article] = await test.db.select().from(knowledgeArticles);
  expect(article).toMatchObject({ status: "publicado", title: VALID.title });
  const [proposal] = await test.db
    .select()
    .from(knowledgeProposals)
    .where(eq(knowledgeProposals.id, id));
  expect(proposal?.status).toBe("published");
});

it("POST sin Origin permitido responde 403", async () => {
  const id = await submitted();
  const response = await render(
    reviewPage,
    `${BASE}/${id}`,
    { id },
    await login(curator),
    { action: "decide", decision: "in_review" },
    "https://otro.cl",
  );
  expect(response.status).toBe(403);
});
