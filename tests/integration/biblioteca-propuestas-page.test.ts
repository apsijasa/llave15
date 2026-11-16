import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeEach, expect, it, vi } from "vitest";
import { hashPassword, loginAdmin, SESSION_COOKIE } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { knowledgeProposals } from "../../src/server/db/schema-library-private.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { createProposal, submitProposal } from "../../src/server/library/proposals.ts";
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
const BASE = "/taller/biblioteca/propuestas";
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
let outsider: SessionUser & { email: string };

async function actor(branchId: string, role: Role) {
  const [row] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      name: `Usuario ${role}`,
      email: `${randomUUID()}@ejemplo.cl`,
      passwordHash: await hashPassword(PASSWORD),
    })
    .returning();
  if (!row) throw new Error("Falta usuario");
  return { id: row.id, branchId, role, name: row.name, email: row.email };
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

const newPage = () => import("../../src/pages/taller/biblioteca/propuestas/nueva.astro");
const detailPage = () => import("../../src/pages/taller/biblioteca/propuestas/[id].astro");
const listPage = () => import("../../src/pages/taller/biblioteca/propuestas/index.astro");

it("redirige 303 sin sesión", async () => {
  const response = await render(listPage, BASE, {});
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(`/admin/login?next=${encodeURIComponent(BASE)}`);
});

it("el formulario nuevo tiene sus campos, la nota y un solo h1", async () => {
  const response = await render(newPage, `${BASE}/nueva`, {}, await login(mechanic));
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  for (const field of [
    "kind",
    "title",
    "contentMd",
    "evidence",
    "targetArticleId",
    "targetVariantId",
  ])
    expect(html).toContain(`<label for="${field}">`);
  expect(html).toContain("No incluya nombres de clientes");
  expect(html).not.toContain("astro-island");
});

it("POST inválido responde 422 con mensajes por campo", async () => {
  const token = await login(mechanic);
  const response = await render(newPage, `${BASE}/nueva`, {}, token, { ...VALID, title: "x" });
  expect(response.status).toBe(422);
  const html = await response.text();
  expect(html).toContain("El título debe tener entre 5 y 160 caracteres.");
  expect(html).toMatch(/id="title"[^>]*aria-invalid="true"/);
});

it("POST válido crea el borrador y redirige al detalle", async () => {
  const response = await render(newPage, `${BASE}/nueva`, {}, await login(mechanic), VALID);
  expect(response.status).toBe(303);
  const [row] = await test.db.select().from(knowledgeProposals);
  expect(response.headers.get("location")).toBe(`${BASE}/${row?.id}?hecho=creada`);
  expect(row).toMatchObject({ status: "draft", authorId: mechanic.id });
});

it("POST sin Origin permitido responde 403 sin escribir", async () => {
  const response = await render(
    newPage,
    `${BASE}/nueva`,
    {},
    await login(mechanic),
    VALID,
    "https://otro.cl",
  );
  expect(response.status).toBe(403);
  expect(await test.db.select().from(knowledgeProposals)).toHaveLength(0);
});

it("el detalle muestra datos personales y permite enviar y retirar", async () => {
  const created = await createProposal(
    test.db,
    mechanic,
    { ...VALID, evidence: "Cliente al +56 9 1234 5678" },
    NOW,
  );
  if (!created.ok) throw new Error(created.code);
  await submitProposal(test.db, mechanic, created.id, NOW);
  const token = await login(mechanic);
  const path = `${BASE}/${created.id}`;
  const html = await (await render(detailPage, path, { id: created.id }, token)).text();
  expect(html).toContain("Se detectaron posibles datos personales");
  expect(html).toContain("Retirar");
  const withdraw = await render(detailPage, path, { id: created.id }, token, {
    action: "withdraw",
  });
  expect(withdraw.status).toBe(303);
  expect(withdraw.headers.get("location")).toBe(`${path}?hecho=retirada`);
  const [row] = await test.db
    .select()
    .from(knowledgeProposals)
    .where(eq(knowledgeProposals.id, created.id));
  expect(row?.status).toBe("withdrawn");
});

it("otra sucursal recibe 404 en el detalle", async () => {
  const created = await createProposal(test.db, mechanic, VALID, NOW);
  if (!created.ok) throw new Error(created.code);
  const response = await render(
    detailPage,
    `${BASE}/${created.id}`,
    { id: created.id },
    await login(outsider),
  );
  expect(response.status).toBe(404);
});

it("la lista muestra las propuestas de la sucursal con su estado", async () => {
  await createProposal(test.db, mechanic, VALID, NOW);
  const html = await (await render(listPage, BASE, {}, await login(mechanic))).text();
  expect(html).toContain(VALID.title);
  expect(html).toContain("status--draft");
  expect(html).toContain("Nueva propuesta");
});
