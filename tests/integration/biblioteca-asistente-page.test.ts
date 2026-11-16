import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeEach, expect, it, vi } from "vitest";
import { hashPassword, loginAdmin, SESSION_COOKIE } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { readFileSync } from "node:fs";
import { aiInteractions } from "../../src/server/db/schema-library-private.ts";
import { reindexAll } from "../../src/server/library/chunks.ts";
import { importLibraryPack, libraryPackSchema } from "../../src/server/library/content-pack.ts";
import { AI_DAILY_QUOTA_PER_BRANCH } from "../../src/server/library/rules.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null }));
vi.mock("../../src/lib/env.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/env.ts")>()),
  getAiEnv: () => ({ AI_PROVIDER: "none", AI_MODEL: "claude-opus-5-5" }),
}));
vi.mock("../../src/server/db/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Falta base");
    return holder.db;
  },
}));
const NOW = new Date("2026-11-15T12:00:00Z");
const ORIGIN = "https://vectorbikes.cl";
const BASE = "/taller/biblioteca/asistente";
const PASSWORD = "clave-propuestas-prueba";
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
  const pack = libraryPackSchema.parse(
    JSON.parse(readFileSync("src/data/library/pack.json", "utf8")),
  );
  await importLibraryPack(test.db, null, pack, NOW, { dryRun: false });
  await reindexAll(test.db);
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

const page = () => import("../../src/pages/taller/biblioteca/asistente.astro");

it("redirige 303 sin sesión", async () => {
  const response = await render(page, BASE, {});
  expect(response.status).toBe(303);
});

it("GET muestra el formulario, el modo y un solo h1", async () => {
  const response = await render(page, BASE, {}, await login(mechanic));
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html).toContain('<label for="question">Pregunta</label>');
  expect(html).toContain("Modo: solo fuentes");
  expect(html).not.toContain("astro-island");
});

it("POST responde con fuentes enlazadas y tarjeta de confianza", async () => {
  const html = await (
    await render(page, BASE, {}, await login(mechanic), {
      question: "¿Cómo identifico el RD-M8100-SGS de 12 velocidades?",
    })
  ).text();
  expect(html).toContain("Según las fuentes");
  expect(html).toContain("Confianza");
  expect(html).toMatch(/href="\/taller\/biblioteca\/[^"]+">\[S1\]/);
  expect(await test.db.select().from(aiInteractions)).toHaveLength(1);
});

it("POST sin Origin permitido responde 403 sin guardar", async () => {
  const response = await render(
    page,
    BASE,
    {},
    await login(mechanic),
    { question: "cadena" },
    "https://otro.cl",
  );
  expect(response.status).toBe(403);
  expect(await test.db.select().from(aiInteractions)).toHaveLength(0);
});

it("con la cuota agotada muestra la alerta", async () => {
  await test.db.insert(aiInteractions).values(
    Array.from({ length: AI_DAILY_QUOTA_PER_BRANCH }, () => ({
      branchId: mechanic.branchId,
      userId: mechanic.id,
      scope: "biblioteca",
      question: "x",
      confidence: "no_verificada",
      provider: "none",
      promptVersion: "bt-1",
      status: "respondida",
      createdAt: NOW,
      updatedAt: NOW,
    })),
  );
  const response = await render(page, BASE, {}, await login(mechanic), {
    question: "cadena que salta",
  });
  expect(response.status).toBe(429);
  expect(await response.text()).toContain("Se alcanzó el límite de consultas");
});

it("las consultas recientes son solo de la sucursal", async () => {
  await render(page, BASE, {}, await login(mechanic), { question: "pregunta privada de vitacura" });
  const html = await (await render(page, BASE, {}, await login(outsider))).text();
  expect(html).not.toContain("pregunta privada de vitacura");
});

it(".env.example documenta las variables del asistente", () => {
  const env = readFileSync(".env.example", "utf8");
  expect(env).toContain("AI_PROVIDER=none");
  expect(env).toContain("ANTHROPIC_API_KEY=");
  expect(env).toContain("AI_MODEL=claude-opus-5-5");
});
