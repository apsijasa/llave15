import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import {
  componentFamilies,
  componentModels,
  componentVariants,
  knowledgeSources,
  manufacturers,
  technicalDocuments,
} from "../../src/server/db/schema-library-catalog.ts";
import { documentChunks } from "../../src/server/db/schema-library-knowledge.ts";
import {
  documentAccess,
  listDocuments,
  serveDocumentFile,
} from "../../src/server/library/documents.ts";
import type { ObjectStorage } from "../../src/server/storage/storage.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

let test: TestDb;
const actor: SessionUser = {
  id: randomUUID(),
  branchId: randomUUID(),
  name: "Mecánico",
  email: "mecanico@ejemplo.cl",
  role: "mechanic",
};
type DocumentInput = Partial<typeof technicalDocuments.$inferInsert>;

async function seedDocument(input: DocumentInput = {}) {
  const [document] = await test.db
    .insert(technicalDocuments)
    .values({
      title: "Manual oficial",
      canonicalUrl: `https://ejemplo.cl/${randomUUID()}`,
      docType: "manual",
      ...input,
    })
    .returning();
  if (!document) throw new Error("Falta documento");
  return document;
}

beforeEach(async () => {
  test = await createTestDb();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await test.close();
});

it("devuelve enlace canónico y metadatos opcionales sin fabricante ni fuente", async () => {
  const document = await seedDocument();
  expect(await documentAccess(test.db, actor, document.id)).toEqual({
    ok: true,
    mode: "enlace",
    href: document.canonicalUrl,
    document: { ...document, manufacturerName: null, sourceTitle: null },
  });
});

it("une fabricante y fuente al documento sin exigir sucursal en el catálogo global", async () => {
  const [manufacturer] = await test.db
    .insert(manufacturers)
    .values({
      slug: "shimano",
      name: "Shimano",
    })
    .returning();
  const [source] = await test.db
    .insert(knowledgeSources)
    .values({
      publisher: "Editor",
      title: "Documentación oficial",
      url: "https://ejemplo.cl/fuente",
      authority: "oficial",
    })
    .returning();
  const document = await seedDocument({ manufacturerId: manufacturer?.id, sourceId: source?.id });
  expect(
    await documentAccess(test.db, { ...actor, branchId: randomUUID() }, document.id),
  ).toMatchObject({
    ok: true,
    document: { manufacturerName: "Shimano", sourceTitle: "Documentación oficial" },
  });
});

it("devuelve solo los extractos del documento, por índice y sin metadatos internos", async () => {
  const document = await seedDocument({ license: "extracto_permitido" });
  await test.db.insert(documentChunks).values([
    { sourceKind: "document", sourceId: document.id, chunkIndex: 2, text: "Segundo" },
    {
      sourceKind: "document",
      sourceId: document.id,
      chunkIndex: 0,
      text: "Primero",
      metadata: { internal: true },
    },
    { sourceKind: "article_version", sourceId: document.id, chunkIndex: 1, text: "Otro tipo" },
    { sourceKind: "document", sourceId: randomUUID(), chunkIndex: 1, text: "Otro documento" },
  ]);
  expect(await documentAccess(test.db, actor, document.id)).toEqual({
    ok: true,
    mode: "extracto",
    document: { ...document, manufacturerName: null, sourceTitle: null },
    href: document.canonicalUrl,
    excerpts: [
      { chunkIndex: 0, text: "Primero" },
      { chunkIndex: 2, text: "Segundo" },
    ],
  });
});

it("permite extractos vacíos", async () => {
  const document = await seedDocument({ license: "extracto_permitido" });
  expect(await documentAccess(test.db, actor, document.id)).toMatchObject({
    ok: true,
    mode: "extracto",
    href: document.canonicalUrl,
    excerpts: [],
  });
});

it("la copia autorizada usa exclusivamente una ruta interna para el visor", async () => {
  const document = await seedDocument({
    license: "copia_autorizada",
    storageKey: "library/manual.pdf",
  });
  const result = await documentAccess(test.db, actor, document.id);
  expect(result).toMatchObject({
    ok: true,
    mode: "visor",
    href: document.canonicalUrl,
    mediaPath: expect.stringMatching(/^\/taller\/biblioteca\/documentos\/[\da-f-]+\/archivo$/),
  });
  expect(result).not.toHaveProperty("excerpts");
});

it("sin archivo la copia autorizada vuelve al enlace", async () => {
  const document = await seedDocument({ license: "copia_autorizada" });
  const result = await documentAccess(test.db, actor, document.id);
  expect(result).toMatchObject({ ok: true, mode: "enlace", href: document.canonicalUrl });
  expect(result).not.toHaveProperty("mediaPath");
});

it.each(["enlace", "extracto_permitido", "copia_autorizada"])(
  "retirado prevalece sobre %s sin acciones ni extractos",
  async (license) => {
    const document = await seedDocument({
      license,
      status: "retirado",
      storageKey: license === "copia_autorizada" ? "library/manual.pdf" : null,
    });
    await test.db
      .insert(documentChunks)
      .values({ sourceKind: "document", sourceId: document.id, chunkIndex: 0, text: "Oculto" });
    expect(await documentAccess(test.db, actor, document.id)).toEqual({
      ok: true,
      mode: "retirado",
      document: { ...document, manufacturerName: null, sourceTitle: null },
    });
  },
);

it.each(["inválido", "", randomUUID()])("id inválido o inexistente → not_found: %s", async (id) => {
  expect(await documentAccess(test.db, actor, id)).toEqual({ ok: false, code: "not_found" });
});

it("revisa permiso antes de validar o consultar en ambas funciones", async () => {
  const select = vi.spyOn(test.db, "select");
  const denied = { ...actor, role: "invalid" as Role };
  expect(await documentAccess(test.db, denied, "inválido")).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(await listDocuments(test.db, denied, {})).toEqual([]);
  expect(select).not.toHaveBeenCalled();
});

async function seedFilterCatalog() {
  const [manufacturer] = await test.db
    .insert(manufacturers)
    .values({ slug: "shimano", name: "Shimano" })
    .returning();
  if (!manufacturer) throw new Error("Falta fabricante");
  const [family] = await test.db
    .insert(componentFamilies)
    .values({ manufacturerId: manufacturer.id, slug: "xt", name: "XT", category: "transmision" })
    .returning();
  if (!family) throw new Error("Falta familia");
  const [model] = await test.db
    .insert(componentModels)
    .values({ familyId: family.id, code: "RD-M8100", name: "Cambio", componentType: "cambio" })
    .returning();
  if (!model) throw new Error("Falta modelo");
  const [variant] = await test.db
    .insert(componentVariants)
    .values({ modelId: model.id, code: "RD-M8100" })
    .returning();
  if (!variant) throw new Error("Falta variante");
  return { manufacturerId: manufacturer.id, variantId: variant.id };
}

it("lista metadatos por título, con filtros opcionales combinables y relaciones nulas", async () => {
  const filter = await seedFilterCatalog();
  const second = await seedDocument({ title: "B Manual", ...filter });
  const first = await seedDocument({ title: "A Boletín", manufacturerId: filter.manufacturerId });
  const third = await seedDocument({ title: "C Guía" });
  expect((await listDocuments(test.db, actor, {})).map((row) => row.id)).toEqual([
    first.id,
    second.id,
    third.id,
  ]);
  expect(
    (await listDocuments(test.db, actor, { manufacturerId: filter.manufacturerId })).map(
      (row) => row.id,
    ),
  ).toEqual([first.id, second.id]);
  expect(
    (await listDocuments(test.db, actor, { variantId: filter.variantId })).map((row) => row.id),
  ).toEqual([second.id]);
  expect(await listDocuments(test.db, actor, filter)).toEqual([
    {
      id: second.id,
      title: "B Manual",
      manufacturerName: "Shimano",
      docType: "manual",
      language: "es",
      revision: "",
      license: "enlace",
      status: "vigente",
    },
  ]);
  expect(
    await listDocuments(test.db, actor, {
      manufacturerId: randomUUID(),
      variantId: filter.variantId,
    }),
  ).toEqual([]);
  expect((await listDocuments(test.db, actor, {}))[2]?.manufacturerName).toBeNull();
});

it.each([{ manufacturerId: "inválido" }, { variantId: "inválido" }])(
  "filtros inválidos no consultan ni amplían la lista: %j",
  async (filter) => {
    const select = vi.spyOn(test.db, "select");
    expect(await listDocuments(test.db, actor, filter)).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  },
);

function memoryStorage(files: Record<string, string>): ObjectStorage {
  return {
    put: async () => undefined,
    get: async (key: string) => (key in files ? Buffer.from(files[key] ?? "") : null),
    delete: async () => undefined,
    exists: async (key: string) => key in files,
  };
}

it("el archivo autorizado se sirve solo con sesión y por la ruta de la biblioteca", async () => {
  const document = await seedDocument({
    license: "copia_autorizada",
    storageKey: "library/manual.pdf",
  });
  const storage = memoryStorage({ "library/manual.pdf": "%PDF-1.7 prueba" });
  expect((await serveDocumentFile(test.db, storage, null, document.id)).status).toBe(401);
  const served = await serveDocumentFile(test.db, storage, actor, document.id);
  expect(served.status).toBe(200);
  expect(served.headers.get("content-type")).toBe("application/pdf");
  expect(served.headers.get("cache-control")).toBe("private, max-age=300");
  expect(await served.text()).toBe("%PDF-1.7 prueba");
});

it("no sirve archivos de documentos solo enlace, retirados o ausentes", async () => {
  const linkOnly = await seedDocument({ license: "enlace" });
  const missing = await seedDocument({
    license: "copia_autorizada",
    storageKey: "library/no-existe.pdf",
  });
  const storage = memoryStorage({});
  expect((await serveDocumentFile(test.db, storage, actor, linkOnly.id)).status).toBe(404);
  expect((await serveDocumentFile(test.db, storage, actor, missing.id)).status).toBe(404);
  expect((await serveDocumentFile(test.db, storage, actor, "no-es-uuid")).status).toBe(404);
});
