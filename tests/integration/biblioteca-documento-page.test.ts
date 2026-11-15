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
  manufacturers,
  technicalDocuments,
} from "../../src/server/db/schema-library-catalog.ts";
import { documentChunks } from "../../src/server/db/schema-library-knowledge.ts";
import { branches, users } from "../../src/server/db/schema.ts";
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
const { default: DocumentPage } = await import(
  "../../src/pages/taller/biblioteca/documentos/[id].astro"
);
const NOW = new Date("2026-11-15T12:00:00Z");
const ORIGIN = "https://ejemplo.cl";
const BASE = "/taller/biblioteca/documentos";
const PASSWORD = "clave-documento-de-prueba";
const ORIGINAL = "https://editor.cl/manual";
const FOOTER = "La documentación pertenece a su editor; se enlaza o se extracta solo con permiso.";
let test: TestDb;
let actor: SessionUser;
let documentId: string;

async function seedDocument() {
  const [manufacturer] = await test.db
    .insert(manufacturers)
    .values({ slug: "shimano", name: "Shimano" })
    .returning();
  const [source] = await test.db
    .insert(knowledgeSources)
    .values({
      publisher: "Editor",
      title: "Documentación oficial",
      url: "https://editor.cl",
      authority: "oficial",
    })
    .returning();
  documentId = randomUUID();
  await test.db.insert(technicalDocuments).values({
    id: documentId,
    title: "Manual del cambio",
    manufacturerId: manufacturer?.id,
    sourceId: source?.id,
    canonicalUrl: ORIGINAL,
    docType: "manual",
    language: "es",
    revision: "B",
  });
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
async function render(token?: string, id: string | undefined = documentId) {
  const request = new Request(`${ORIGIN}${BASE}/${id ?? ""}`, {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
  });
  const container = await AstroContainer.create({ astroConfig: { site: ORIGIN } });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  return container
    .renderToResponse(DocumentPage, { request, params: { id } })
    .finally(() => vi.useRealTimers());
}
async function updateDocument(input: Partial<typeof technicalDocuments.$inferInsert>) {
  await test.db.update(technicalDocuments).set(input).where(eq(technicalDocuments.id, documentId));
}

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta sucursal");
  const [user] = await test.db
    .insert(users)
    .values({
      branchId: branch.id,
      name: "Mecánico",
      email: "mecanico@ejemplo.cl",
      role: "mechanic",
      passwordHash: await hashPassword(PASSWORD),
    })
    .returning();
  if (!user) throw new Error("Falta usuario");
  actor = { ...user, role: "mechanic" };
  await seedDocument();
  return async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    holder.db = null;
    await test.close();
  };
});

it("sin sesión redirige antes de validar el id", async () => {
  const response = await render(undefined, "no-uuid");
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    `/admin/login?next=${encodeURIComponent(`${BASE}/no-uuid`)}`,
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it("sin permiso responde 403 antes de validar el id", async () => {
  const token = await login();
  const original = permissions.can;
  vi.spyOn(permissions, "can").mockImplementation((role, action) =>
    action === "library.view" ? false : original(role, action),
  );
  const response = await render(token, "no-uuid");
  expect(response.status).toBe(403);
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it.each(["no-uuid", "", randomUUID()])("id inválido o ausente → 404: %s", async (id) => {
  const response = await render(await login(), id);
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).toContain("Documento no encontrado.");
});

it("el mecánico ve los metadatos, un solo h1, licencia y acción al original", async () => {
  const response = await render(await login());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const html = await response.text();
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  const data = html.match(/<dl class="data">([\s\S]*?)<\/dl>/)?.[1] ?? "";
  for (const label of [
    "Título",
    "Fabricante",
    "Fuente",
    "Tipo",
    "Idioma",
    "Revisión",
    "Checksum",
    "Estado",
    "Licencia",
  ])
    expect(data).toContain(`<dt>${label}</dt>`);
  for (const text of [
    "Manual del cambio",
    "Shimano",
    "Documentación oficial",
    "Manual",
    "es",
    "B",
    "Sin checksum",
    "Vigente",
    "Solo enlace",
  ])
    expect(data).toContain(text);
  expect(data).toContain('class="status status--vigente"');
  expect(html).toMatch(
    /<a[^>]*class="btn"[^>]*href="https:\/\/editor.cl\/manual"[^>]*target="_blank"[^>]*rel="noopener"[^>]*>\s*Abrir el original\s*<\/a>/,
  );
  expect(html).toContain(FOOTER);
  expect(html).not.toMatch(/<iframe\b|<blockquote\b|astro-island/);
});

it("presenta checksum y estado desactualizado", async () => {
  await updateDocument({ checksum: "sha256:prueba", status: "desactualizado" });
  const html = await (await render(await login())).text();
  expect(html).toContain("sha256:prueba");
  expect(html).toContain('class="status status--desactualizado"');
  expect(html).toContain("Desactualizado");
});

it("tolera metadatos opcionales ausentes", async () => {
  await updateDocument({ manufacturerId: null, sourceId: null, revision: "" });
  const response = await render(await login());
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("Sin checksum");
});

it("muestra extractos ordenados, escapados y en blockquote, conservando el original", async () => {
  await updateDocument({ license: "extracto_permitido" });
  await test.db.insert(documentChunks).values([
    { sourceKind: "document", sourceId: documentId, chunkIndex: 1, text: "Segundo extracto" },
    {
      sourceKind: "document",
      sourceId: documentId,
      chunkIndex: 0,
      text: "Primero <script>alert(1)</script>",
    },
  ]);
  const html = await (await render(await login())).text();
  expect(html).toContain("Extracto permitido");
  expect(html).toContain("Extractos permitidos");
  expect(html.match(/<blockquote\b/g)).toHaveLength(2);
  expect(html).toContain("&lt;script&gt;");
  expect(html.indexOf("Primero")).toBeLessThan(html.indexOf("Segundo extracto"));
  expect(html).toContain(`href="${ORIGINAL}"`);
  expect(html).not.toMatch(/<iframe\b/);
});

it("renderiza la card de extractos aunque no haya trozos", async () => {
  await updateDocument({ license: "extracto_permitido" });
  const html = await (await render(await login())).text();
  expect(html).toContain("Extractos permitidos");
  expect(html).not.toMatch(/<blockquote\b|<iframe\b/);
});

it("solo la copia autorizada con archivo incluye iframe interno con título", async () => {
  await updateDocument({ license: "copia_autorizada", storageKey: "library/manual.pdf" });
  const html = await (await render(await login())).text();
  expect(html).toContain("Copia autorizada");
  expect(html.match(/<iframe\b/g)).toHaveLength(1);
  expect(html).toMatch(
    /<iframe[^>]*title="Manual del cambio"[^>]*src="\/taller\/biblioteca\/documentos\/[\da-f-]+\/archivo"/,
  );
  expect(html).toContain(`href="${ORIGINAL}"`);
  expect(html).not.toMatch(/src="https?:/);
});

it("copia autorizada sin archivo muestra solo enlace", async () => {
  await updateDocument({ license: "copia_autorizada" });
  const html = await (await render(await login())).text();
  expect(html).toContain("Copia autorizada");
  expect(html).toContain("Abrir el original");
  expect(html).not.toMatch(/<iframe\b/);
});

it.each(["enlace", "extracto_permitido", "copia_autorizada"])(
  "retirado con licencia %s muestra alerta sin enlace ni contenido",
  async (license) => {
    await updateDocument({
      license,
      status: "retirado",
      storageKey: license === "copia_autorizada" ? "library/manual.pdf" : null,
    });
    const html = await (await render(await login())).text();
    expect(html).toContain('class="status status--incompatible"');
    expect(html).toContain("Retirado");
    expect(html).toMatch(
      /role="alert"[^>]*>\s*Documento retirado por el curador: no se enlaza al original\./,
    );
    expect(html).not.toContain(ORIGINAL);
    expect(html).not.toContain("Abrir el original");
    expect(html).not.toMatch(/<iframe\b|<blockquote\b/);
    expect(html).toContain(FOOTER);
  },
);

it("la página usa tokens, sin hex ni islas", () => {
  const source = readFileSync(
    new URL("../../src/pages/taller/biblioteca/documentos/[id].astro", import.meta.url),
    "utf8",
  );
  expect(source).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  expect(source).not.toMatch(/client:|set:html/);
});
