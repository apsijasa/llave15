import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { hashPassword, loginAdmin, SESSION_COOKIE } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import * as permissions from "../../src/server/auth/permissions.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import {
  knowledgeSources,
  technicalDocuments,
  technicalSpecifications,
} from "../../src/server/db/schema-library-catalog.ts";
import {
  articleVersions,
  knowledgeArticles,
} from "../../src/server/db/schema-library-knowledge.ts";
import {
  procedures,
  procedureSteps,
  procedureSpecs,
} from "../../src/server/db/schema-library-procedures.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { importLibraryPack, libraryPackSchema } from "../../src/server/library/content-pack.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null }));
vi.mock("../../src/server/db/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Base de prueba no inicializada");
    return holder.db;
  },
}));
const page = () => import("../../src/pages/taller/biblioteca/procedimientos/[id].astro");
const NOW = new Date("2026-11-15T12:00:00Z");
const ORIGIN = "https://vectorbikes.cl";
const BASE = "/taller/biblioteca/procedimientos";
const PASSWORD = "clave-procedimiento-prueba";
let test: TestDb;
let actor: SessionUser;
let procedure: typeof procedures.$inferSelect;

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  const [branch] = await test.db.insert(branches).values({ name: "Sucursal" }).returning();
  if (!branch) throw new Error("Falta sucursal");
  const [user] = await test.db
    .insert(users)
    .values({
      branchId: branch.id,
      name: "Revisor de prueba",
      email: "mecanico@ejemplo.cl",
      role: "mechanic",
      passwordHash: await hashPassword(PASSWORD),
    })
    .returning();
  if (!user) throw new Error("Falta usuario");
  actor = { ...user, role: "mechanic" };
  return async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    holder.db = null;
    await test.close();
  };
});

async function seed() {
  const pack = libraryPackSchema.parse(
    JSON.parse(readFileSync("src/data/library/pack.json", "utf8")),
  );
  await importLibraryPack(test.db, actor.id, pack, NOW, { dryRun: false });
  const [row] = await test.db.select().from(procedures);
  if (!row) throw new Error("Falta procedimiento importado");
  procedure = row;
}

async function login() {
  const result = await loginAdmin(test.db, {
    email: actor.email,
    password: PASSWORD,
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!result.ok) throw new Error(result.code);
  return result.token;
}

async function render(token?: string, id = procedure?.id ?? "no-uuid") {
  const { default: ProcedurePage } = await page();
  const request = new Request(`${ORIGIN}${BASE}/${id}`, {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
  });
  const container = await AstroContainer.create({ astroConfig: { site: ORIGIN } });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  return container
    .renderToResponse(ProcedurePage, { request, params: { id } })
    .finally(() => vi.useRealTimers());
}

it("redirige 303 sin sesión antes de validar el id", async () => {
  const response = await render(undefined, "no-uuid");
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    `/admin/login?next=${encodeURIComponent(`${BASE}/no-uuid`)}`,
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it("comprueba library.view antes del id", async () => {
  const token = await login();
  const original = permissions.can;
  vi.spyOn(permissions, "can").mockImplementation((role, action) =>
    action === "library.view" ? false : original(role, action),
  );
  const response = await render(token, "no-uuid");
  expect(response.status).toBe(403);
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it.each(["no-uuid", randomUUID(), ""])("responde 404 para %s", async (id) => {
  const response = await render(await login(), id);
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).toContain("Procedimiento no encontrado.");
});

it("muestra pasos, advertencia, alcance y fuentes con panel lateral sin torques", async () => {
  await seed();
  const response = await render(await login());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const html = await response.text();
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html).toContain("Revisión de desgaste de cadena de 12 velocidades");
  const steps = html.match(/<ol[^>]*class="proc-steps"[^>]*>([\s\S]*?)<\/ol>/)?.[1] ?? "";
  expect(steps.match(/<li\b/g)).toHaveLength(4);
  expect(steps).toContain("Comprobación:");
  expect(steps).toMatch(
    /<p[^>]*role="note"[^>]*class="proc-warning"[^>]*>\s*Una cadena muy gastada puede saltar bajo carga en el cassette nuevo\s*<\/p>/,
  );
  expect(html).toContain('<aside aria-label="Herramientas y torques"');
  expect(html).toContain(
    "Este procedimiento no tiene torques registrados: consulte el manual del fabricante.",
  );
  for (const text of [
    "Riesgo bajo",
    "Mantenimiento",
    "10 min",
    "Versión 1",
    "2026-11-15",
    actor.name,
    "Bicicleta en el soporte, cadena limpia",
    "Registrar la medición en la orden y comparar con el límite del fabricante",
    "Alcance",
    "Fuentes",
  ])
    expect(html).toContain(text);
  expect(html).toMatch(/href="\/taller\/biblioteca\/componentes\/[^"]+"/);
  expect(html).toMatch(
    /href="https:\/\/www.sheldonbrown.com\/"[^>]*target="_blank"[^>]*rel="noopener"/,
  );
  expect(html).not.toContain("astro-island");
});

it("lista herramientas sin repetir y muestra consumibles, torque con estado y documento", async () => {
  await seed();
  await test.db.insert(procedureSteps).values({
    procedureId: procedure.id,
    sequence: 5,
    action: "Comprobación de prueba",
    tools: "Indicador de desgaste de cadena",
    consumables: "Paño limpio",
  });
  const [spec] = await test.db.select().from(technicalSpecifications);
  const [document] = await test.db.select().from(technicalDocuments);
  if (!spec || !document) throw new Error("Falta contenido");
  await test.db
    .update(technicalSpecifications)
    .set({ sourceDocumentId: document.id })
    .where(eq(technicalSpecifications.id, spec.id));
  await test.db
    .insert(procedureSpecs)
    .values({ procedureId: procedure.id, specificationId: spec.id });
  await test.db
    .update(articleVersions)
    .set({ sources: [{ documentId: document.id }] })
    .where(eq(articleVersions.id, procedure.versionId));
  const html = await (await render(await login())).text();
  const aside =
    html.match(/<aside aria-label="Herramientas y torques"[^>]*>([\s\S]*?)<\/aside>/)?.[1] ?? "";
  expect(aside.match(/Indicador de desgaste de cadena/g)).toHaveLength(1);
  for (const text of [
    "Dato",
    "Valor",
    "Unidad",
    "Estado",
    "Fuente",
    spec.label,
    "Nm",
    "Sin dato verificado",
    document.title,
  ])
    expect(aside).toContain(text);
  expect(aside).toContain(`href="/taller/biblioteca/documentos/${document.id}"`);
  expect(html).toContain("Consumibles:");
  expect(html).toContain("Paño limpio");
});

it.each(["bajo", "medio", "alto", "critico"])(
  "etiqueta el riesgo %s con su estado",
  async (risk) => {
    await seed();
    await test.db
      .update(procedures)
      .set({ risk, durationMinutes: null })
      .where(eq(procedures.id, procedure.id));
    const html = await (await render(await login())).text();
    expect(html).toContain(`class="status status--${risk}"`);
    expect(html).toContain(`Riesgo ${risk === "critico" ? "crítico" : risk}`);
    expect(html).toContain("Sin dato");
  },
);

it("no expone un procedimiento archivado", async () => {
  await seed();
  const [version] = await test.db
    .select()
    .from(articleVersions)
    .where(eq(articleVersions.id, procedure.versionId));
  if (!version) throw new Error("Falta versión");
  await test.db
    .update(knowledgeArticles)
    .set({ status: "archivado" })
    .where(eq(knowledgeArticles.id, version.articleId));
  expect((await render(await login())).status).toBe(404);
});

it("escapa texto de las acciones y las fuentes", async () => {
  await seed();
  await test.db
    .update(procedureSteps)
    .set({ action: '<script>alert("prueba")</script>' })
    .where(eq(procedureSteps.procedureId, procedure.id));
  await test.db.update(knowledgeSources).set({ title: "<b>Fuente</b>" });
  const html = await (await render(await login())).text();
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("&lt;b&gt;Fuente&lt;/b&gt;");
  expect(html).not.toContain('<script>alert("prueba")</script>');
});
