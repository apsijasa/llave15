import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { ORDER_TABS } from "../../src/lib/taller-tabs.ts";
import { hashPassword, loginAdmin, SESSION_COOKIE } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { componentVariants } from "../../src/server/db/schema-library-catalog.ts";
import { articleVersions } from "../../src/server/db/schema-library-knowledge.ts";
import { aiInteractions, technicalDiagnoses } from "../../src/server/db/schema-library-private.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { bikeComponents } from "../../src/server/db/schema-payments.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { reindexAll } from "../../src/server/library/chunks.ts";
import { importLibraryPack, libraryPackSchema } from "../../src/server/library/content-pack.ts";
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
const PASSWORD = "clave-biblioteca-prueba";
let test: TestDb;
let owner: SessionUser;
let mechanic: SessionUser;
let outsider: SessionUser;
let orderId: string;
let componentId: string;
let variantId: string;

async function actor(branchId: string, role: Role): Promise<SessionUser> {
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

async function seedOrder() {
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: owner.branchId,
      name: "Cliente privado",
      phoneE164: "+56911112222",
    })
    .returning();
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: owner.branchId,
      customerId: customer?.id ?? "",
      brand: "Trek",
      model: "Marlin",
      bikeType: "mtb",
      year: 2024,
      size: "M",
    })
    .returning();
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: owner.branchId,
      number: 7,
      customerId: customer?.id ?? "",
      bikeId: bike?.id ?? "",
      requestedService: "Cadena salta bajo carga",
      status: "en_progreso",
      assignedMechanicId: owner.id,
      createdBy: owner.id,
    })
    .returning();
  orderId = order?.id ?? "";
  await seedComponent(bike?.id ?? "");
}

async function seedComponent(bikeId: string) {
  const [component] = await test.db
    .insert(bikeComponents)
    .values({
      branchId: owner.branchId,
      bikeId,
      workOrderId: orderId,
      componentType: "Cadena",
      brand: "Shimano",
      model: "CN-M8100",
      installedAt: "2026-11-01",
      createdBy: owner.id,
    })
    .returning();
  componentId = component?.id ?? "";
}

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  const [a, b] = await test.db
    .insert(branches)
    .values([{ name: "Vitacura" }, { name: "Otra" }])
    .returning();
  if (!a || !b) throw new Error("Faltan sucursales");
  owner = await actor(a.id, "owner");
  mechanic = await actor(a.id, "mechanic");
  outsider = await actor(b.id, "owner");
  const pack = libraryPackSchema.parse(
    JSON.parse(readFileSync("src/data/library/pack.json", "utf8")),
  );
  await importLibraryPack(test.db, null, pack, NOW, { dryRun: false });
  await reindexAll(test.db);
  const [variant] = await test.db.select().from(componentVariants).limit(1);
  variantId = variant?.id ?? "";
  await seedOrder();
  return async () => {
    vi.useRealTimers();
    holder.db = null;
    await test.close();
  };
});

async function login(user: SessionUser) {
  const result = await loginAdmin(test.db, {
    email: user.email,
    password: PASSWORD,
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!result.ok) throw new Error(result.code);
  return result.token;
}

async function render(token?: string, data?: URLSearchParams, origin = ORIGIN, id = orderId) {
  const { default: Page } = await import("../../src/pages/taller/ordenes/[id]/biblioteca.astro");
  const headers = new Headers(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {});
  if (data && origin) headers.set("origin", origin);
  const request = new Request(`${ORIGIN}/taller/ordenes/${id}/biblioteca`, {
    method: data ? "POST" : "GET",
    headers,
    body: data,
  });
  const container = await AstroContainer.create({ astroConfig: { site: ORIGIN } });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  return container
    .renderToResponse(Page, { request, params: { id } })
    .finally(() => vi.useRealTimers());
}

const post = (data: Record<string, string>) => new URLSearchParams(data);
const orderRow = () => test.db.select().from(workOrders).where(eq(workOrders.id, orderId));

it("redirige 303 sin sesión y no permite acceder a una orden ajena", async () => {
  const response = await render();
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toContain("/admin/login?next=");
  expect((await render(await login(mechanic))).status).toBe(403);
  expect((await render(await login(outsider))).status).toBe(404);
  expect((await render(await login(owner), undefined, ORIGIN, randomUUID())).status).toBe(404);
});

it("muestra contexto, pestaña activa, nota fija y formulario sin asistente", async () => {
  const response = await render(await login(owner));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const html = await response.text();
  expect(html).toMatch(/href="[^"]+\/biblioteca" aria-current="page"/);
  for (const text of [
    "Contexto técnico",
    "Trek",
    "Marlin",
    "2024",
    "CN-M8100",
    "Sin identificar",
    "Identificar",
    "Cadena salta bajo carga",
    "Diagnóstico sin asistente",
    "Diagnósticos de esta orden",
    'role="note"',
    "Los trabajos adicionales siguen necesitando",
  ])
    expect(html).toContain(text);
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html).not.toContain("astro-island");
  expect(html).not.toContain("Cliente privado");
  expect(html).not.toContain("+56911112222");
});

it("ask muestra respuesta y referencias marcadas sin crear diagnósticos ni cambiar la orden", async () => {
  const before = await orderRow();
  const response = await render(
    await login(owner),
    post({ action: "ask", question: "¿Cómo identifico el RD-M8100-SGS?" }),
  );
  expect(response.status).toBe(200);
  const html = await response.text();
  for (const text of [
    "Según las fuentes",
    "Confianza",
    "Agregar al diagnóstico",
    "Pruebas realizadas",
    'name="aiInteractionId"',
  ])
    expect(html).toContain(text);
  const [interaction] = await test.db.select().from(aiInteractions);
  expect(interaction).toMatchObject({ scope: "orden", workOrderId: orderId, provider: "none" });
  expect(interaction?.citations.length).toBeGreaterThan(0);
  for (const citation of interaction?.citations ?? []) {
    const kind = citation.sourceKind === "specification" ? "variant" : citation.sourceKind;
    expect(html).toContain(`name="ref" value="${kind}:${citation.sourceId}" checked`);
  }
  expect(await test.db.select().from(technicalDiagnoses)).toHaveLength(0);
  expect(await orderRow()).toEqual(before);
});

it("save conserva solo referencias marcadas y confirm confirma sin cambiar work_orders", async () => {
  const before = await orderRow();
  const token = await login(owner);
  await render(token, post({ action: "ask", question: "¿Cómo identifico el RD-M8100-SGS?" }));
  const [interaction] = await test.db.select().from(aiInteractions);
  const [version] = await test.db.select().from(articleVersions).limit(1);
  if (!interaction || !version) throw new Error("Faltan fuentes");
  const data = post({
    action: "save",
    symptoms: "Salta bajo carga",
    result: "Revisar cadena",
    aiInteractionId: interaction.id,
    inspection: "reproduccion",
  });
  data.append("ref", `article_version:${version.id}`);
  data.append("ref", `variant:${variantId}`);
  const response = await render(token, data);
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    `/taller/ordenes/${orderId}/biblioteca?hecho=diagnostico`,
  );
  const rows = await test.db.select().from(technicalDiagnoses);
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row).toMatchObject({
    status: "borrador",
    aiInteractionId: interaction.id,
    result: "Revisar cadena",
  });
  expect(row?.refs).toEqual([
    { kind: "article_version", id: version.id, versionNumber: version.number },
    { kind: "variant", id: variantId },
  ]);
  expect(row?.inspections).toContainEqual(
    expect.objectContaining({ key: "reproduccion", done: true }),
  );
  const draft = await (await render(token)).text();
  expect(draft).toContain("status--borrador");
  expect(draft).toContain("Confirmar diagnóstico");
  expect(draft).toContain("Reproducir el síntoma de forma segura");
  await confirmSavedDiagnosis(token, row?.id ?? "");
  expect(await orderRow()).toEqual(before);
});

async function confirmSavedDiagnosis(token: string, diagnosisId: string) {
  const confirmed = await render(token, post({ action: "confirm", diagnosisId }));
  expect(confirmed.status).toBe(303);
  expect(confirmed.headers.get("location")).toContain("?hecho=confirmado");
  expect((await test.db.select().from(technicalDiagnoses))[0]).toMatchObject({
    status: "confirmado",
    confirmedBy: owner.id,
    confirmedAt: NOW,
  });
  const html = await (await render(token)).text();
  expect(html).toContain("status--confirmado");
  expect(html).not.toContain("Confirmar diagnóstico");
}

it("guarda sin asistente y sin referencias al desmarcarlas todas", async () => {
  const response = await render(
    await login(owner),
    post({ action: "save", symptoms: "Ruido al pedalear", result: "" }),
  );
  expect(response.status).toBe(303);
  const [row] = await test.db.select().from(technicalDiagnoses);
  expect(row).toMatchObject({ aiInteractionId: null, refs: [], result: null });
});

it("link identifica el componente y no modifica la orden", async () => {
  const before = await orderRow();
  const token = await login(owner);
  const response = await render(token, post({ action: "link", componentId, variantId }));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toContain("?hecho=identificado");
  expect((await test.db.select().from(bikeComponents))[0]?.componentVariantId).toBe(variantId);
  expect(await (await render(token)).text()).toContain(
    `href="/taller/biblioteca/componentes/${variantId}"`,
  );
  expect(await orderRow()).toEqual(before);
});

it("rechaza POST sin Origin permitido y formularios inválidos sin guardar", async () => {
  const token = await login(owner);
  const data = post({ action: "save", symptoms: "Síntoma" });
  expect((await render(token, data, "https://otro.cl")).status).toBe(403);
  expect((await render(token, data, "")).status).toBe(403);
  expect((await render(token, post({ action: "save", symptoms: "x" }))).status).toBe(422);
  expect((await render(token, post({ action: "ask", question: "x" }))).status).toBe(422);
  const invalid = post({ action: "save", symptoms: "Síntoma", ref: "variant:incorrecto" });
  expect((await render(token, invalid)).status).toBe(422);
  expect(await test.db.select().from(technicalDiagnoses)).toHaveLength(0);
  expect(await test.db.select().from(aiInteractions)).toHaveLength(0);
});

it("agrega Biblioteca inmediatamente después de Componentes con permiso library.ai", () => {
  const index = ORDER_TABS.findIndex((tab) => tab.suffix === "componentes");
  expect(ORDER_TABS[index + 1]).toEqual({
    suffix: "biblioteca",
    label: "Biblioteca",
    permission: "library.ai",
  });
});

it("conserva interacción y referencias seleccionadas al corregir un diagnóstico inválido", async () => {
  const token = await login(owner);
  await render(token, post({ action: "ask", question: "¿Cómo identifico el RD-M8100-SGS?" }));
  const [interaction] = await test.db.select().from(aiInteractions);
  const citation = interaction?.citations[0];
  if (!interaction || !citation) throw new Error("Falta consulta con fuentes");
  const kind = citation.sourceKind === "specification" ? "variant" : citation.sourceKind;
  const ref = `${kind}:${citation.sourceId}`;
  const response = await render(
    token,
    post({
      action: "save",
      symptoms: "x",
      result: "Revisar cadena",
      aiInteractionId: interaction.id,
      ref,
      inspection: "reproduccion",
    }),
  );
  expect(response.status).toBe(422);
  const html = await response.text();
  expect(html).toContain(`name="aiInteractionId" value="${interaction.id}"`);
  expect(html).toContain(`name="ref" value="${ref}" checked`);
  expect(html).toContain("Revisar cadena");
  expect(await test.db.select().from(technicalDiagnoses)).toHaveLength(0);
});
