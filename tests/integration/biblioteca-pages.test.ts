import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import TallerLayout from "../../src/layouts/TallerLayout.astro";
import { hashPassword, loginAdmin, SESSION_COOKIE } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import * as permissions from "../../src/server/auth/permissions.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import {
  componentFamilies,
  componentModels,
  componentVariants,
  manufacturers,
  technicalDocuments,
} from "../../src/server/db/schema-library-catalog.ts";
import {
  articleVersions,
  knowledgeArticles,
} from "../../src/server/db/schema-library-knowledge.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { LIBRARY_CATEGORIES } from "../../src/server/library/rules.ts";
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

const { default: LibraryHome } = await import("../../src/pages/taller/biblioteca/index.astro");
const { default: LibrarySearch } = await import("../../src/pages/taller/biblioteca/buscar.astro");

const NOW = new Date("2026-11-15T12:00:00Z");
const PASSWORD = "clave-biblioteca-de-prueba";
const ORIGIN = "https://vectorbikes.cl";
const PATH = "/taller/biblioteca";
let test: TestDb;
let owner: SessionUser;

async function seedUser(
  branchId: string,
  role: Role,
  libraryCurator = false,
): Promise<SessionUser> {
  const [row] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      libraryCurator,
      name: `Usuario ${role}`,
      email: `${randomUUID()}@ejemplo.cl`,
      passwordHash: await hashPassword(PASSWORD),
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning();
  if (!row) throw new Error("Falta usuario");
  return { ...row, role };
}

async function login(user = owner) {
  const result = await loginAdmin(test.db, {
    email: user.email,
    password: PASSWORD,
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!result.ok) throw new Error(`No se inició sesión: ${result.code}`);
  return result.token;
}

async function render(token?: string, suffix = "", search = false) {
  const Page = search ? LibrarySearch : LibraryHome;
  const request = new Request(`${ORIGIN}${PATH}${search ? "/buscar" : ""}${suffix}`, {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
  });
  const container = await AstroContainer.create({ astroConfig: { site: ORIGIN } });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  return container.renderToResponse(Page, { request }).finally(() => vi.useRealTimers());
}

async function seedCatalog(status = "vigente") {
  const manufacturerId = randomUUID();
  const familyId = randomUUID();
  const modelId = randomUUID();
  const variantId = randomUUID();
  await test.db
    .insert(manufacturers)
    .values({ id: manufacturerId, slug: "shimano", name: "Shimano" });
  await test.db.insert(componentFamilies).values([
    { id: familyId, manufacturerId, slug: "xt", name: "Deore XT", category: "transmision" },
    { manufacturerId, slug: "deore-frenos", name: "Frenos Deore", category: "frenos" },
  ]);
  await test.db.insert(componentModels).values({
    id: modelId,
    familyId,
    code: "RD-M8100-SGS",
    name: "Cambio trasero",
    componentType: "cambio_trasero",
    status,
  });
  await test.db
    .insert(componentVariants)
    .values({ id: variantId, modelId, code: "RD-M8100-SGS", revision: "B" });
  return { manufacturerId, variantId };
}

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta sucursal");
  owner = await seedUser(branch.id, "owner");
  return async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    holder.db = null;
    await test.close();
  };
});

it("agrega Conocimiento después de Gestión y exige la bandera de curador", async () => {
  const container = await AstroContainer.create({ astroConfig: { site: ORIGIN } });
  const props = {
    title: "Biblioteca",
    description: "Consulta técnica",
    path: `${PATH}/revision`,
    user: owner,
  };
  const ordinary = await container.renderToString(TallerLayout, { props });
  expect(ordinary).toContain("Conocimiento");
  expect(ordinary.indexOf("Conocimiento")).toBeGreaterThan(ordinary.indexOf("Gestión"));
  expect(ordinary).not.toContain(`href="${PATH}/revision"`);
  const curator = await container.renderToString(TallerLayout, {
    props: { ...props, user: { ...owner, libraryCurator: true } },
  });
  expect(curator).toMatch(new RegExp(`href="${PATH}/revision"[^>]*aria-current="page"`));
  expect(curator).not.toMatch(new RegExp(`href="${PATH}"[^>]*aria-current="page"`));
});

it.each([false, true])("redirige sin sesión conservando la ruta (buscar=%s)", async (search) => {
  const response = await render(undefined, "", search);
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    `/admin/login?next=${encodeURIComponent(PATH + (search ? "/buscar" : ""))}`,
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it("muestra ocho categorías, buscador y accesos rápidos al mecánico sin Revisión", async () => {
  const mechanic = await seedUser(owner.branchId, "mechanic", true);
  const response = await render(await login(mechanic));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const html = await response.text();
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html).toContain("<h1>Biblioteca</h1>");
  expect(html.match(/class="lib-category"/g)).toHaveLength(8);
  for (const category of LIBRARY_CATEGORIES)
    expect(html).toContain(`href="${PATH}/buscar?categoria=${category}"`);
  expect(html).toContain(
    '<label for="library-q">Fabricante, modelo, código, síntoma o palabra técnica</label>',
  );
  expect(html).toContain('aria-label="Accesos rápidos"');
  for (const destination of ["asistente", "compatibilidad", "herramientas", "propuestas"])
    expect(html).toContain(`href="${PATH}/${destination}"`);
  expect(html).not.toContain(`href="${PATH}/revision"`);
  expect(html).not.toMatch(/astro-island/);
});

it("muestra Revisión al dueño con library_curator en la sesión real", async () => {
  const curator = await seedUser(owner.branchId, "owner", true);
  const html = await (await render(await login(curator))).text();
  expect(html).toContain(`href="${PATH}/revision"`);
});

it.each([false, true])(
  "rechaza sin library.view antes de consultar el catálogo (buscar=%s)",
  async (search) => {
    const token = await login();
    const original = permissions.can;
    vi.spyOn(permissions, "can").mockImplementation((role, action) =>
      action === "library.view" ? false : original(role, action),
    );
    const response = await render(token, "?q=RD-M8100-SGS&fabricante=invalido", search);
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
  },
);

it("pone la coincidencia exacta antes de Modelos con código, revisión, fabricante y ficha", async () => {
  const { variantId, manufacturerId } = await seedCatalog();
  const response = await render(
    await login(),
    `?q=RD-M8100-SGS&categoria=transmision&fabricante=${manufacturerId}&estado=vigente`,
    true,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const html = await response.text();
  const exact = html.slice(html.indexOf("Coincidencia exacta"), html.indexOf("Modelos"));
  for (const value of [
    "RD-M8100-SGS",
    "B",
    "Shimano",
    "Vigente",
    `href="${PATH}/componentes/${variantId}"`,
  ])
    expect(exact).toContain(value);
  expect(exact).toContain('class="dense"');
  expect(html).toContain('method="get"');
  expect(html).toContain("<legend>Filtros</legend>");
  for (const name of ["q", "categoria", "fabricante", "estado"])
    expect(html).toContain(`name="${name}"`);
  expect(html).toMatch(new RegExp(`<option[^>]*value="${manufacturerId}"[^>]*selected`));
  expect(html).toMatch(new RegExp(`href="${PATH}"[^>]*aria-current="page"`));
});

it.each([
  ["vigente", "vigente", "Vigente"],
  ["en_revision", "en_revision", "En revisión"],
  ["descontinuado", "desactualizado", "Descontinuado"],
])("muestra forma y etiqueta del estado de modelo %s", async (status, css, label) => {
  await seedCatalog(status);
  const html = await (await render(await login(), "?q=RD-M8100-SGS", true)).text();
  expect(html).toContain(`class="status status--${css}"`);
  expect(html).toContain(label);
});

it("lista solo familias de frenos cuando la categoría es el único filtro", async () => {
  await seedCatalog();
  const html = await (await render(await login(), "?categoria=frenos", true)).text();
  expect(html).toContain("Frenos Deore");
  expect(html).not.toContain("Deore XT");
  expect(html).not.toContain("Coincidencia exacta");
});

it.each([
  "",
  "?q=",
  `?q=${"x".repeat(121)}`,
  "?q=RD-M8100-SGS&categoria=invalida",
  "?q=RD-M8100-SGS&fabricante=no-uuid",
  "?q=RD-M8100-SGS&estado=invalido",
])("mantiene el formulario sin resultados con consulta ausente o inválida: %s", async (query) => {
  await seedCatalog();
  const html = await (await render(await login(), query, true)).text();
  expect(html).toContain("<legend>Filtros</legend>");
  expect(html).not.toContain("Coincidencia exacta");
  expect(html).not.toContain("Cambio trasero");
});

it("muestra Sin resultados cuando una búsqueda válida no tiene coincidencias", async () => {
  const html = await (await render(await login(), "?q=inexistente", true)).text();
  expect(html).toContain('<p class="muted">Sin resultados.</p>');
});

it("presenta artículos con categoría, versión y fecha, y documentos enlazados", async () => {
  const articleId = randomUUID();
  const versionId = randomUUID();
  const documentId = randomUUID();
  await test.db.insert(knowledgeArticles).values({
    id: articleId,
    slug: "ajuste-cambio",
    title: "Ajuste del cambio",
    category: "transmision",
    kind: "articulo",
    status: "publicado",
  });
  await test.db.insert(articleVersions).values({
    id: versionId,
    articleId,
    number: 2,
    contentMd: "Ajuste del cambio",
    summary: "Ajuste",
    contentHash: "hash",
    publishedAt: NOW,
  });
  await test.db
    .update(knowledgeArticles)
    .set({ currentVersionId: versionId })
    .where(eq(knowledgeArticles.id, articleId));
  await test.db.insert(technicalDocuments).values({
    id: documentId,
    title: "Manual de ajuste",
    docType: "manual",
    canonicalUrl: "https://ejemplo.cl/manual",
  });
  const html = await (await render(await login(), "?q=ajuste", true)).text();
  for (const value of [
    "Artículos",
    "Ajuste del cambio",
    "Transmisión",
    "Versión 2",
    "2026-11-15",
    "Documentos",
    "Manual de ajuste",
    `href="${PATH}/documentos/${documentId}"`,
  ])
    expect(html).toContain(value);
});

it("usa tokens y estados con forma en los archivos nuevos", () => {
  for (const file of [
    "src/pages/taller/biblioteca/index.astro",
    "src/pages/taller/biblioteca/buscar.astro",
    "src/components/taller/library/CategoryIcon.astro",
    "src/components/taller/library/LibraryStatus.astro",
  ]) {
    expect(readFileSync(file, "utf8").replace(/href="#/g, "")).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  }
  const css = readFileSync("src/styles/taller-components.css", "utf8");
  for (const status of [
    "verificado",
    "condicionado",
    "desactualizado",
    "en_revision",
    "sin_dato_verificado",
    "alta",
    "media",
    "baja",
    "no_verificada",
    "oficial_confirmada",
    "condicionada",
    "incompatible",
  ])
    expect(css).toContain(`.status--${status}::before`);
});
