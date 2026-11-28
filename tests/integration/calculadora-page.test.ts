import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { costProfiles } from "../../src/server/db/schema-costing.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { recordExpense } from "../../src/server/taller/expenses.ts";
import { createTestDb, type TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null, actor: null as SessionUser | null }));
vi.mock("../../src/server/db/client.ts", async (original) => ({
  ...(await original<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => holder.db,
}));
vi.mock("../../src/server/auth/admin-auth.ts", async (original) => ({
  ...(await original<typeof import("../../src/server/auth/admin-auth.ts")>()),
  requireAdmin: async () => holder.actor,
}));
const { default: Calculator } = await import("../../src/pages/taller/calculadora.astro");
const SITE = "https://vectorbikes.cl";
const NOW = new Date("2026-11-14T15:00:00Z");
let test: TestDb;
let owner: SessionUser;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  test = await createTestDb();
  holder.db = test.db;
  const branchId = randomUUID();
  await test.db.insert(branches).values({ id: branchId, name: "Sucursal" });
  owner = { id: randomUUID(), branchId, role: "owner", name: "Dueña", email: "owner@example.test" };
  await test.db.insert(users).values({ ...owner, passwordHash: "hash-de-prueba" });
  holder.actor = owner;
  return async () => {
    holder.db = null;
    holder.actor = null;
    vi.useRealTimers();
    await test.close();
  };
});
async function render(
  data?: Record<string, string>,
  origin: string | null = SITE,
  method?: string,
  search = "",
) {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  if (data) headers.set("content-type", "application/x-www-form-urlencoded");
  const request = new Request(`${SITE}/taller/calculadora${search}`, {
    method: method ?? (data ? "POST" : "GET"),
    headers,
    body: data ? new URLSearchParams(data) : undefined,
  });
  return (await AstroContainer.create({ astroConfig: { site: SITE } })).renderToResponse(
    Calculator,
    { request },
  );
}
it.each(["mechanic", "reception"] as const)("%s recibe 403", async (role) => {
  holder.actor = { ...owner, role };
  expect((await render()).status).toBe(403);
});
it("sin sesión redirige al ingreso y rechaza otros métodos", async () => {
  expect((await render(undefined, null, "PUT")).status).toBe(405);
  holder.actor = null;
  const response = await render();
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toContain("/admin/login?next=");
});
it("muestra tres formularios con etiquetas accesibles y estado guardado", async () => {
  const response = await render(undefined, SITE, undefined, "?hecho=gastos");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const html = await response.text();
  for (const text of [
    "Arriendo",
    "Horas facturables al mes",
    "Producto del inventario",
    "Guardar gastos",
    "Calcular servicio",
    "Calcular producto",
    "Gastos mensuales guardados.",
  ])
    expect(html).toContain(text);
  expect(html.match(/<form\b[^>]*action="\/taller\/calculadora"/g)).toHaveLength(3);
  expect(html).not.toMatch(/<script/);
});
it.each([null, "https://otro.example"])("rechaza el origen %s", async (origin) => {
  expect((await render({ action: "save" }, origin)).status).toBe(403);
  expect(await test.db.select().from(costProfiles)).toEqual([]);
});
it("guardar redirige y los inválidos conservan valores y errores por campo", async () => {
  const invalid = await render({ action: "save", rentClp: "abc" });
  expect(invalid.status).toBe(422);
  const html = await invalid.text();
  expect(html).toContain('value="abc"');
  expect(html).toContain('aria-invalid="true"');
  expect(html).toContain("Escribe un número entero en pesos.");
  const response = await render({ action: "save", rentClp: "400000", billableHoursMonth: "100" });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/taller/calculadora?hecho=gastos");
});
it("calcula producto manual y exige horas para servicio", async () => {
  const response = await render({ action: "product", costClp: "1500" });
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain("$2.143");
  expect(html).toContain("$2.550");
  const service = await render({ action: "service", minutes: "90" });
  expect(service.status).toBe(422);
  expect(await service.text()).toContain("Guarda primero las horas facturables del mes.");
});
it("sugerir rellena gastos sin escribir el perfil", async () => {
  await recordExpense(
    test.db,
    owner,
    {
      category: "arriendo",
      amountClp: 250000,
      expenseDate: "2026-10-10",
      description: "Arriendo mensual",
      method: "transferencia",
    },
    NOW,
  );
  const response = await render({ action: "suggest", billableHoursMonth: "100" });
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('value="250000"');
  expect(html).toContain("Octubre: $250.000");
  expect(await test.db.select().from(costProfiles)).toEqual([]);
});
it("acciones e ids inválidos responden con el estado correspondiente", async () => {
  expect((await render({ action: "inventada" })).status).toBe(422);
  const response = await render({ action: "product", productId: randomUUID() });
  expect(response.status).toBe(404);
  expect(await response.text()).toContain("No se encontró ese producto en tu taller.");
});
