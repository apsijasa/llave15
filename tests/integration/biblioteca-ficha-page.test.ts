import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { hashPassword, loginAdmin, SESSION_COOKIE } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import * as permissions from "../../src/server/auth/permissions.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import {
  componentFamilies,
  componentModels,
  componentVariants,
  manufacturers,
  technicalDocuments,
  technicalSpecifications,
} from "../../src/server/db/schema-library-catalog.ts";
import {
  articleVariantLinks,
  articleVersions,
  knowledgeArticles,
} from "../../src/server/db/schema-library-knowledge.ts";
import {
  compatibilityRuleMembers,
  compatibilityRules,
  procedures,
} from "../../src/server/db/schema-library-procedures.ts";
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

const { default: VariantPage } = await import(
  "../../src/pages/taller/biblioteca/componentes/[id].astro"
);
const NOW = new Date("2026-11-15T12:00:00Z");
const ORIGIN = "https://vectorbikes.cl";
const BASE = "/taller/biblioteca";
const PASSWORD = "clave-ficha-de-prueba";
const TABS = [
  ["resumen", "Resumen"],
  ["especificaciones", "Especificaciones"],
  ["compatibilidad", "Compatibilidad"],
  ["procedimientos", "Procedimientos"],
  ["documentos", "Documentos"],
  ["historial", "Historial"],
] as const;
let test: TestDb;
let actor: SessionUser;
let variantId: string;
let siblingId: string;
let modelId: string;
async function seedCatalog() {
  const manufacturerId = randomUUID();
  const familyId = randomUUID();
  modelId = randomUUID();
  variantId = randomUUID();
  siblingId = randomUUID();
  await test.db
    .insert(manufacturers)
    .values({ id: manufacturerId, slug: "shimano", name: "Shimano" });
  await test.db.insert(componentFamilies).values({
    id: familyId,
    manufacturerId,
    slug: "xt",
    name: "Deore XT",
    category: "transmision",
  });
  await test.db.insert(componentModels).values({
    id: modelId,
    familyId,
    code: "RD-M8100-SGS",
    name: "Cambio trasero",
    componentType: "Cambio trasero",
    generation: "M8100",
    speeds: 12,
  });
  await test.db.insert(componentVariants).values([
    {
      id: variantId,
      modelId,
      code: "RD-M8100-SGS",
      revision: "B",
      yearFrom: 2020,
      yearTo: 2026,
      attributes: { jaula: "Larga" },
    },
    { id: siblingId, modelId, code: "RD-M8100-SGS", revision: "A" },
  ]);
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
async function render(token?: string, section = "", id: string | undefined = variantId) {
  const path = `${BASE}/componentes/${id ?? ""}`;
  const request = new Request(`${ORIGIN}${path}${section}`, {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
  });
  const container = await AstroContainer.create({ astroConfig: { site: ORIGIN } });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  return container
    .renderToResponse(VariantPage, { request, params: { id } })
    .finally(() => vi.useRealTimers());
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
      name: "Revisor de prueba",
      email: "mecanico@ejemplo.cl",
      role: "mechanic",
      passwordHash: await hashPassword(PASSWORD),
    })
    .returning();
  if (!user) throw new Error("Falta usuario");
  actor = { ...user, role: "mechanic" };
  await seedCatalog();
  return async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    holder.db = null;
    await test.close();
  };
});

it("redirige sin sesión conservando id y sección, antes de validar", async () => {
  const response = await render(undefined, "?seccion=historial", "no-uuid");
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    `/admin/login?next=${encodeURIComponent(`${BASE}/componentes/no-uuid?seccion=historial`)}`,
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it("rechaza sin library.view antes de validar el id", async () => {
  const token = await login();
  const original = permissions.can;
  vi.spyOn(permissions, "can").mockImplementation((role, action) =>
    action === "library.view" ? false : original(role, action),
  );
  const response = await render(token, "", "no-uuid");
  expect(response.status).toBe(403);
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it.each(["no-uuid", randomUUID(), ""])(
  "responde 404 para id inválido o inexistente: %s",
  async (id) => {
    const response = await render(await login(), "", id);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("Componente no encontrado.");
  },
);

it.each(["", "?seccion=invalida"])(
  "muestra el resumen al mecánico con seis pestañas: %s",
  async (query) => {
    const response = await render(await login(), query);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const html = await response.text();
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    for (const text of [
      "RD-M8100-SGS · rev. B",
      "Shimano · Deore XT · Cambio trasero",
      "M8100",
      "12",
      "2020",
      "2026",
      "jaula",
      "Larga",
    ])
      expect(html).toContain(text);
    const nav =
      html.match(/<nav[^>]*aria-label="Secciones de la ficha"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
    expect(nav.match(/<a\b/g)).toHaveLength(6);
    for (const [key, label] of TABS) {
      expect(nav).toContain(`href="${BASE}/componentes/${variantId}?seccion=${key}"`);
      expect(nav).toContain(label);
    }
    expect(nav).toMatch(/seccion=resumen"[^>]*aria-current="page"/);
    expect(nav.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('class="status status--vigente"');
    expect(html).toContain('role="note"');
    expect(html).toContain(
      "Los valores de ajuste, torque y compatibilidad valen solo para la variante exacta y con la fuente indicada.",
    );
    expect(html).toContain(`href="${BASE}/componentes/${siblingId}"`);
    expect(html).not.toContain("astro-island");
  },
);

it("muestra Sin dato cuando faltan velocidades, generación y años", async () => {
  await test.db
    .update(componentModels)
    .set({ speeds: null, generation: null })
    .where(eq(componentModels.id, modelId));
  await test.db
    .update(componentVariants)
    .set({ yearFrom: null, yearTo: null })
    .where(eq(componentVariants.id, variantId));
  const html = await (await render(await login())).text();
  expect(html.match(/Sin dato/g)?.length).toBeGreaterThanOrEqual(3);
});

async function seedSpecifications() {
  const id = randomUUID();
  await test.db.insert(technicalDocuments).values({
    id,
    title: "Manual oficial",
    canonicalUrl: "https://ejemplo.cl/manual",
    docType: "manual",
    variantId,
  });
  await test.db.insert(technicalSpecifications).values([
    {
      variantId,
      kind: "torque",
      label: "Tornillo de fijación",
      valueText: "",
      validationStatus: "sin_dato_verificado",
      sourceDocumentId: id,
      reviewedOn: "2026-11-15",
    },
    {
      variantId,
      kind: "medida",
      label: "Largo",
      valueText: "10",
      unit: "mm",
      tolerance: "±1",
      context: "En frío",
      validationStatus: "verificado",
      sourceDocumentId: id,
    },
    { variantId, kind: "otro", label: "Sin fuente", valueText: "" },
  ]);
  return id;
}

it("muestra especificaciones con estado, fecha, valor vacío y fuente enlazada", async () => {
  await seedSpecifications();
  const html = await (await render(await login(), "?seccion=especificaciones")).text();
  for (const text of [
    "Tipo",
    "Dato",
    "Valor",
    "Unidad",
    "Tolerancia",
    "Contexto",
    "Estado",
    "Revisado",
    "Fuente",
    "Torque",
    "Medida",
    "Tornillo de fijación",
    "Sin dato verificado",
    "2026-11-15",
    "mm",
    "±1",
    "En frío",
    "—",
  ])
    expect(html).toContain(text);
  expect(html).toContain('class="dense"');
  expect(html).toContain('class="status status--sin_dato_verificado"');
  expect(html).toMatch(
    /href="https:\/\/ejemplo.cl\/manual"[^>]*target="_blank"[^>]*rel="noopener"/,
  );
  expect(html).toContain("Manual oficial");
  expect(html).toMatch(/seccion=especificaciones"[^>]*aria-current="page"/);
  expect(html).not.toContain('role="note"');
});

it("declara compatibilidad No verificada cuando no hay reglas", async () => {
  const html = await (await render(await login(), "?seccion=compatibilidad")).text();
  expect(html).toContain("No hay reglas de compatibilidad registradas para esta variante: estado");
  expect(html).toContain('class="status status--no_verificada"');
  expect(html).toContain("No verificada");
});

it("presenta relación, certeza, evidencia, condiciones y miembros enlazados", async () => {
  const ruleId = randomUUID();
  await test.db.insert(compatibilityRules).values({
    id: ruleId,
    relation: "condicionada",
    certainty: "media",
    evidence: "Manual de la generación",
    conditions: "Misma generación",
    restrictions: "No mezclar revisiones",
  });
  await test.db.insert(compatibilityRuleMembers).values([
    { ruleId, variantId, role: "cambio" },
    { ruleId, variantId: siblingId, role: "shifter" },
  ]);
  const html = await (await render(await login(), "?seccion=compatibilidad")).text();
  for (const text of [
    "Condicionada",
    "Media",
    "Manual de la generación",
    "Misma generación",
    "No mezclar revisiones",
    "Cambio",
    "Mando de cambios",
  ])
    expect(html).toContain(text);
  expect(html).toContain('class="status status--condicionada"');
  expect(html).toContain(`href="${BASE}/componentes/${siblingId}"`);
});

async function seedVersion() {
  const articleId = randomUUID();
  const versionId = randomUUID();
  const procedureId = randomUUID();
  await test.db.insert(knowledgeArticles).values({
    id: articleId,
    slug: "ajuste-cambio",
    title: "Ajuste del cambio",
    category: "transmision",
    kind: "procedimiento",
    status: "publicado",
  });
  await test.db.insert(articleVersions).values({
    id: versionId,
    articleId,
    number: 1,
    contentMd: "Ajustar cable",
    contentHash: "hash",
    publishedAt: NOW,
    reviewedBy: actor.id,
  });
  await test.db.insert(articleVariantLinks).values({ versionId, variantId });
  await test.db
    .update(knowledgeArticles)
    .set({ currentVersionId: versionId })
    .where(eq(knowledgeArticles.id, articleId));
  await test.db.insert(procedures).values({
    id: procedureId,
    versionId,
    title: "Ajuste del cable",
    kind: "ajuste",
    risk: "medio",
  });
  return procedureId;
}

it("enlaza procedimientos aunque su página corresponda a un paso posterior", async () => {
  const id = await seedVersion();
  const html = await (await render(await login(), "?seccion=procedimientos")).text();
  expect(html).toContain(`href="${BASE}/procedimientos/${id}"`);
  for (const text of ["Ajuste del cable", "Ajuste", "Medio", "Versión 1"])
    expect(html).toContain(text);
});

it("enlaza documentos a su página con estado", async () => {
  const id = await seedSpecifications();
  const html = await (await render(await login(), "?seccion=documentos")).text();
  expect(html).toContain(`href="${BASE}/documentos/${id}"`);
  expect(html).toContain("Manual oficial");
  expect(html).toContain('class="status status--vigente"');
});

it("lista la versión publicada 1, artículo, fecha y nombre del revisor", async () => {
  await seedVersion();
  const html = await (await render(await login(), "?seccion=historial")).text();
  for (const text of [
    "Versión",
    "Artículo",
    "Fecha",
    "Revisor",
    "Ajuste del cambio",
    "2026-11-15",
    actor.name,
  ])
    expect(html).toContain(text);
  expect(html).toMatch(/<t[dh][^>]*>\s*1\s*<\/t[dh]>/);
  expect(html).toMatch(/seccion=historial"[^>]*aria-current="page"/);
});
