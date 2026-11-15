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
} from "../../src/server/db/schema-library-catalog.ts";
import {
  compatibilityRuleMembers,
  compatibilityRules,
} from "../../src/server/db/schema-library-procedures.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { importLibraryPack, libraryPackSchema } from "../../src/server/library/content-pack.ts";
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
const page = () => import("../../src/pages/taller/biblioteca/compatibilidad.astro");
const NOW = new Date("2026-11-15T12:00:00Z");
const ORIGIN = "https://vectorbikes.cl";
const PATH = "/taller/biblioteca/compatibilidad";
const PASSWORD = "clave-compatibilidad-prueba";
const roles = ["shifter", "cambio", "cassette", "cadena", "plato", "nucleo"];
let test: TestDb;
let actor: SessionUser;
let values: Record<string, string>;

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
  const variants = await test.db.select().from(componentVariants);
  const shifter = variants.find((row) => row.code === "SL-M8100-R");
  const cambio = variants.find((row) => row.code === "RD-M8100-SGS");
  if (!shifter || !cambio) throw new Error("Faltan variantes");
  values = {
    shifter: shifter.id,
    cambio: cambio.id,
  };
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

async function render(token?: string, data?: Record<string, string>, origin?: string) {
  const { default: Page } = await page();
  const headers = new Headers(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {});
  if (origin) headers.set("origin", origin);
  const request = new Request(`${ORIGIN}${PATH}`, {
    method: data ? "POST" : "GET",
    headers,
    body: data ? new URLSearchParams(data) : undefined,
  });
  const container = await AstroContainer.create({ astroConfig: { site: ORIGIN } });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  return container.renderToResponse(Page, { request }).finally(() => vi.useRealTimers());
}

it("redirige 303 sin sesión", async () => {
  const response = await render();
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(`/admin/login?next=${encodeURIComponent(PATH)}`);
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it("exige library.view antes de leer el POST", async () => {
  const token = await login();
  const original = permissions.can;
  vi.spyOn(permissions, "can").mockImplementation((role, action) =>
    action === "library.view" ? false : original(role, action),
  );
  expect((await render(token, values, ORIGIN)).status).toBe(403);
});

it("GET ofrece seis selects con etiquetas, No incluir y un solo h1 sin islas", async () => {
  const response = await render(await login());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const html = await response.text();
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html.match(/<select\b/g)).toHaveLength(6);
  expect(html).toContain("<legend>Conjunto a comparar</legend>");
  expect(html).toContain('method="post"');
  expect(html).toContain("Comparar");
  for (const role of roles) {
    expect(html).toContain(`name="${role}"`);
    expect(html).toContain(`<label for="${role}">`);
  }
  expect(html.match(/>No incluir<\/option>/g)).toHaveLength(6);
  for (const code of ["SL-M8100-R", "RD-M8100-SGS", "CS-M8100-12", "CN-M8100", "FC-M8100-1"])
    expect(html).toContain(code);
  expect(html).not.toContain("astro-island");
});

it.each([undefined, "null", "https://otro.cl"])(
  "POST sin Origin permitido (%s) responde 403",
  async (origin) => {
    const response = await render(await login(), values, origin);
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
  },
);

it("POST sin reglas muestra No verificada, velocidades y repone las selecciones", async () => {
  const response = await render(await login(), values, ORIGIN);
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain("Resultado");
  expect(html).toContain('class="status status--no_verificada"');
  expect(html).toContain("No verificada");
  expect(html).toContain(
    "No hay evidencia verificada para esta combinación exacta. Que tengan la misma cantidad de velocidades no basta: identifique cada variante y consulte el manual.",
  );
  expect(html).toContain("Sin evidencia para:");
  for (const id of Object.values(values))
    expect(html).toMatch(new RegExp(`<option[^>]*value="${id}"[^>]*selected`));
  for (const heading of [
    "Rol",
    "Código",
    "Modelo",
    "Velocidades",
    "Relación",
    "Certeza",
    "Evidencia",
    "Condiciones/restricciones",
    "Fuente",
    "Revisado",
  ])
    expect(html).toContain(heading);
  expect(html).not.toContain("astro-island");
});

it.each<Record<string, string>>([{}, { shifter: "" }, { shifter: "una-variante" }])(
  "avisa con menos de dos componentes: %j",
  async (data) => {
    const response = await render(await login(), data, ORIGIN);
    expect(response.status).toBe(422);
    expect(await response.text()).toMatch(/role="alert"[^>]*>Elige al menos dos componentes\./);
  },
);

it("rechaza UUID inválido y conserva los campos válidos", async () => {
  const response = await render(await login(), { ...values, cambio: "mal" }, ORIGIN);
  expect(response.status).toBe(422);
  const html = await response.text();
  expect(html).toContain('role="alert"');
  expect(html).toContain('aria-invalid="true"');
  expect(html).not.toContain("No verificada");
});

it("muestra la evidencia, condiciones, restricciones, fuente y revisión escapadas", async () => {
  const [document] = await test.db.select().from(technicalDocuments);
  if (!document) throw new Error("Falta documento");
  const [rule] = await test.db
    .insert(compatibilityRules)
    .values({
      relation: "condicionada",
      certainty: "media",
      evidence: "<b>Evidencia de prueba</b>",
      conditions: "Usar adaptador",
      restrictions: "Revisar montaje",
      reviewedOn: "2026-11-15",
      sourceDocumentId: document.id,
    })
    .returning();
  if (!rule) throw new Error("Falta regla");
  await test.db
    .insert(compatibilityRuleMembers)
    .values(
      Object.entries(values).map(([role, variantId]) => ({ ruleId: rule.id, role, variantId })),
    );
  const response = await render(await login(), values, ORIGIN);
  expect(response.status).toBe(200);
  const html = await response.text();
  for (const text of [
    "Condicionada",
    "Compatible solo bajo las condiciones indicadas.",
    "Media",
    "&lt;b&gt;Evidencia de prueba&lt;/b&gt;",
    "Usar adaptador",
    "Revisar montaje",
    "2026-11-15",
    document.title,
  ])
    expect(html).toContain(text);
  expect(html).toContain(`href="/taller/biblioteca/documentos/${document.id}"`);
  expect(html).not.toContain("Sin evidencia para:");
});
