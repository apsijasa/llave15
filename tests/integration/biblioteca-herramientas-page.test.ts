import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeEach, expect, it, vi } from "vitest";
import { hashPassword, loginAdmin, SESSION_COOKIE } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import * as permissions from "../../src/server/auth/permissions.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import {
  componentVariants,
  technicalDocuments,
  technicalSpecifications,
  toolsConsumables,
} from "../../src/server/db/schema-library-catalog.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { importLibraryPack, libraryPackSchema } from "../../src/server/library/content-pack.ts";
import { SPEC_KIND_LABELS } from "../../src/server/library/rules.ts";
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
const page = () => import("../../src/pages/taller/biblioteca/herramientas.astro");
const NOW = new Date("2026-11-15T12:00:00Z");
const ORIGIN = "https://vectorbikes.cl";
const PATH = "/taller/biblioteca/herramientas";
const PASSWORD = "clave-herramientas-prueba";
const WARNING =
  "Un torque, una presión o un aceite solo valen para la variante exacta y con su fuente. Si dice Sin dato verificado, consulte el manual oficial antes de ajustar.";
let test: TestDb;
let actor: SessionUser;
let variantId: string;

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  const [branch] = await test.db.insert(branches).values({ name: "Sucursal" }).returning();
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
  const pack = libraryPackSchema.parse(
    JSON.parse(readFileSync("src/data/library/pack.json", "utf8")),
  );
  await importLibraryPack(test.db, actor.id, pack, NOW, { dryRun: false });
  const variant = (await test.db.select().from(componentVariants)).find(
    (row) => row.code === "CN-M8100",
  );
  if (!variant) throw new Error("Falta variante");
  variantId = variant.id;
  return async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    holder.db = null;
    await test.close();
  };
});

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

async function render(token?: string, params: Record<string, string> = {}, method = "GET") {
  const { default: Page } = await page();
  const query = new URLSearchParams(params).toString();
  const request = new Request(`${ORIGIN}${PATH}${query ? `?${query}` : ""}`, {
    method,
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
  });
  const container = await AstroContainer.create({ astroConfig: { site: ORIGIN } });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  return container.renderToResponse(Page, { request }).finally(() => vi.useRealTimers());
}

it("redirige sin sesión conservando la consulta y no almacena la respuesta", async () => {
  const response = await render(undefined, { operation: "cadena" });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    `/admin/login?next=${encodeURIComponent(`${PATH}?operation=cadena`)}`,
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it("revisa library.view antes de validar la consulta", async () => {
  const token = await login();
  const original = permissions.can;
  vi.spyOn(permissions, "can").mockImplementation((role, action) =>
    action === "library.view" ? false : original(role, action),
  );
  expect((await render(token, { variantId: "mal" })).status).toBe(403);
});

it("GET 200 muestra formulario etiquetado, aviso fijo, tablas y un h1 sin islas", async () => {
  const response = await render(await login());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const html = await response.text();
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html.match(/<select\b/g)).toHaveLength(2);
  expect(html).toContain('method="get"');
  for (const [name, label] of Object.entries({
    operation: "Operación o componente",
    variantId: "Variante",
    kind: "Tipo de dato",
  })) {
    expect(html).toContain(`<label for="${name}">${label}</label>`);
    expect(html).toContain(`name="${name}"`);
  }
  for (const label of Object.values(SPEC_KIND_LABELS)) expect(html).toContain(label);
  expect(html).toMatch(/<fieldset\b/);
  expect(html).toMatch(/<legend>/);
  expect(html).toContain("CN-M8100");
  expect(html).toMatch(new RegExp(`role="note"[^>]*>${WARNING}</p>`));
  expect(html).toContain("Especificaciones");
  expect(html).toContain("Herramientas y consumibles");
  expect(html).toContain("Buscar");
  expect(html).not.toContain("astro-island");
});

it("muestra fila sintética con raya y etiqueta de estado y conserva filtros", async () => {
  const response = await render(await login(), { variantId, kind: "torque", operation: "" });
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('class="status status--sin_dato_verificado">Sin dato verificado</span>');
  expect(html).toMatch(/<td>—<\/td>/);
  expect(html).toMatch(new RegExp(`<option[^>]*value="${variantId}"[^>]*selected`));
  expect(html).toMatch(/<option[^>]*value="torque"[^>]*selected/);
});

it("renderiza valor y unidad, tolerancia, contexto y fuente; un valor vacío pierde Verificado", async () => {
  const [document] = await test.db.select().from(technicalDocuments);
  if (!document) throw new Error("Falta documento");
  await test.db.insert(technicalSpecifications).values([
    {
      variantId,
      kind: "torque",
      label: "Dato de prueba",
      valueText: "4",
      unit: "N·m",
      tolerance: "±0,5",
      context: "<b>Solo prueba</b>",
      validationStatus: "verificado",
      sourceDocumentId: document.id,
    },
    {
      variantId,
      kind: "torque",
      label: "Vacío",
      valueText: "",
      validationStatus: "verificado",
      sourceDocumentId: document.id,
    },
  ]);
  const response = await render(await login(), { variantId, kind: "torque" });
  expect(response.status).toBe(200);
  const html = await response.text();
  for (const text of [
    "Dato de prueba",
    "<td>4</td>",
    "N·m",
    "±0,5",
    "&lt;b&gt;Solo prueba&lt;/b&gt;",
    "Sin dato verificado",
    "Verificado",
  ])
    expect(html).toContain(text);
  expect(html).toContain(`href="/taller/biblioteca/documentos/${document.id}"`);
  for (const label of ["Dato", "Valor", "Unidad", "Tolerancia", "Contexto", "Estado", "Fuente"])
    expect(html).toContain(`<th scope="col">${label}</th>`);
});

it("busca herramientas y consumibles mostrando código, tipo, uso, tamaños y restricciones", async () => {
  await test.db.insert(toolsConsumables).values([
    {
      name: "Alicate de prueba",
      code: "TL-CN10-PRUEBA",
      kind: "herramienta",
      category: "transmision",
      usage: "Abrir cadenas",
      specification: "11 y 12 velocidades",
      restrictions: "<b>Revisar cierre</b>",
    },
    {
      name: "Lubricante de prueba",
      kind: "consumible",
      category: "transmision",
      specification: "Para cadenas",
    },
  ]);
  const response = await render(await login(), { operation: "cadena" });
  expect(response.status).toBe(200);
  const html = await response.text();
  for (const text of [
    "TL-CN10-PRUEBA",
    "Lubricante de prueba",
    "Herramienta",
    "Consumible",
    "Abrir cadenas",
    "11 y 12 velocidades",
    "&lt;b&gt;Revisar cierre&lt;/b&gt;",
  ])
    expect(html).toContain(text);
  expect(html).toMatch(/<input[^>]*name="operation"[^>]*value="cadena"/);
  for (const label of ["Nombre", "Código", "Tipo", "Uso", "Especificación", "Restricciones"])
    expect(html).toContain(`<th scope="col">${label}</th>`);
});

it.each<Record<string, string>>([
  { operation: "a" },
  { variantId: "mal" },
  { kind: "inventado" },
  { operation: "a".repeat(121) },
])("rechaza filtros inválidos con aviso accesible: %j", async (params) => {
  const response = await render(await login(), params);
  expect(response.status).toBe(422);
  const html = await response.text();
  expect(html).toContain('role="alert"');
  expect(html).toContain('aria-invalid="true"');
  expect(html).toContain('aria-describedby="spec-error"');
  expect(html).toContain(WARNING);
});

it("variante inexistente responde 404", async () => {
  const response = await render(await login(), { variantId: randomUUID(), kind: "torque" });
  expect(response.status).toBe(404);
  expect(await response.text()).toContain("No se encontró la variante seleccionada.");
});

it("rechaza métodos distintos de GET", async () => {
  const response = await render(await login(), {}, "POST");
  expect(response.status).toBe(405);
  expect(response.headers.get("allow")).toBe("GET");
  expect(response.headers.get("cache-control")).toBe("no-store");
});
