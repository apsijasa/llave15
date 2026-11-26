import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hashPassword, loginAdmin } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { normalizeInvoiceExtraction } from "../../src/server/taller/invoice-normalize.ts";
import { memoryStorage } from "../helpers/memory-storage.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({
  db: null as AppDb | null,
  storage: null as ReturnType<typeof memoryStorage>["storage"] | null,
  none: false,
}));
vi.mock("../../src/server/db/client.ts", async (original) => ({
  ...(await original<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => holder.db,
}));
vi.mock("../../src/server/storage/storage.ts", async (original) => ({
  ...(await original<typeof import("../../src/server/storage/storage.ts")>()),
  getStorage: async () => holder.storage,
}));
vi.mock("../../src/lib/env.ts", async (original) => ({
  ...(await original<typeof import("../../src/lib/env.ts")>()),
  getAiEnv: () => ({
    AI_PROVIDER: holder.none ? "none" : "anthropic",
    AI_MODEL: "falso",
    ANTHROPIC_API_KEY: "falsa",
  }),
}));
vi.mock("../../src/server/taller/invoice-extract.ts", async (original) => {
  const module = await original<typeof import("../../src/server/taller/invoice-extract.ts")>();
  return {
    ...module,
    extractorFromEnv: () =>
      holder.none
        ? module.noneInvoiceExtractor
        : {
            name: "anthropic",
            model: "falso",
            async extract() {
              return {
                ok: true,
                extraction: normalizeInvoiceExtraction({
                  supplier: { name: "Proveedor sintético", rut: null },
                  document: { type: "factura", number: "123", date: null },
                  pricesIncludeVat: false,
                  lines: [
                    {
                      code: "CAD",
                      description: "Cadena",
                      quantity: 3,
                      unit: "unidad",
                      unitPrice: 6500,
                      lineTotal: null,
                    },
                  ],
                  totals: { net: null, exempt: null, vat: null, total: null },
                  confidence: "alta",
                  warnings: [],
                }),
                tokensIn: 1,
                tokensOut: 2,
              };
            },
          },
  };
});
type Page = typeof import("../../src/pages/taller/indicadores.astro");
const pages = import.meta.glob<Page>("../../src/pages/taller/{compras,inventario}/**/*.astro");
const NOW = new Date("2026-11-26T15:00:00Z");
const SITE = "https://vectorbikes.cl";
let test: TestDb;
let token: string;
let branchId: string;
async function session(role: "owner" | "admin" | "reception" | "mechanic") {
  const [user] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      name: role,
      email: `${randomUUID()}@example.test`,
      passwordHash: await hashPassword("clave-prueba"),
    })
    .returning();
  const auth = await loginAdmin(test.db, {
    email: user!.email,
    password: "clave-prueba",
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!auth.ok) throw new Error("Sesión");
  return auth.token;
}
beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  holder.storage = memoryStorage().storage;
  holder.none = false;
  const [branch] = await test.db.insert(branches).values({ name: "Principal" }).returning();
  branchId = branch!.id;
  token = await session("owner");
});
afterEach(async () => {
  vi.useRealTimers();
  await test.close();
});
async function render(
  path = "/taller/compras/factura",
  body?: FormData,
  auth = token,
  origin = SITE,
) {
  const parts = path.split("?")[0]!.split("/");
  const file =
    parts[3] === "factura"
      ? `compras/factura/${parts[4] ? "[id]" : "index"}`
      : parts[3]
        ? "compras/[id]"
        : `${parts[2]}/index`;
  const load = pages[`../../src/pages/taller/${file}.astro`];
  expect(load).toBeTypeOf("function");
  const request = new Request(SITE + path, {
    method: body ? "POST" : "GET",
    headers: { cookie: `vb_admin_session=${auth}`, ...(body && origin ? { origin } : {}) },
    body,
  });
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  return container
    .renderToResponse((await load!()).default, { request, params: { id: parts[4] ?? parts[3] } })
    .finally(() => vi.useRealTimers());
}
function upload() {
  const form = new FormData();
  form.set(
    "documento",
    new File(["%PDF- /Type /Page"], "factura.pdf", { type: "application/pdf" }),
  );
  return form;
}
async function start() {
  const response = await render(undefined, upload());
  expect(response.status).toBe(303);
  return response.headers.get("location")!;
}
function confirmation() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    action: "confirm",
    "supplier-mode": "create",
    "supplier-name": "Proveedor sintético",
    docType: "factura",
    docNumber: "123",
    receiveNow: "on",
    "line-0-mode": "create",
    "line-0-sku": "CAD",
    "line-0-name": "Cadena",
    "line-0-category": "repuesto",
    "line-0-unit": "unidad",
    "line-0-priceClp": "9000",
    "line-0-quantity": "3",
    "line-0-unitCostClp": "6500",
  }))
    form.set(key, value);
  return form;
}
it("muestra carga con accept/capture y none la deshabilita", async () => {
  const html = await (await render()).text();
  expect(html).toContain('accept="image/jpeg,image/png,image/webp,application/pdf"');
  expect(html).toContain('capture="environment"');
  expect(html).toContain("Leer factura");
  holder.none = true;
  const disabled = await (await render()).text();
  expect(disabled).toContain("La lectura de facturas no está disponible");
  expect(disabled).toMatch(/<button[^>]*disabled/);
});
it("rechaza POST sin origin y valida el archivo con aria-invalid", async () => {
  expect((await render(undefined, upload(), token, "")).status).toBe(403);
  const response = await render(undefined, new FormData());
  expect(response.status).toBe(422);
  expect(await response.text()).toContain('aria-invalid="true"');
});
it("sube, revisa, confirma y abre la compra con aviso y documento", async () => {
  const path = await start();
  const html = await (await render(path)).text();
  for (const text of [
    "Proveedor",
    "Línea 1 ·",
    "Recibir ahora",
    "Confirmar compra",
    "Descartar",
    "Ver documento",
    'value="6500"',
    'value="3"',
  ])
    expect(html).toContain(text);
  expect(html).toMatch(/name="receiveNow"[^>]*checked/);
  const result = await render(path, confirmation());
  expect(result.status).toBe(303);
  const location = result.headers.get("location")!;
  expect(location).toMatch(/^\/taller\/compras\/.+\?hecho=importada$/);
  const detail = await (await render(location)).text();
  expect(detail).toContain("Compra creada desde la factura.");
  expect(detail).toContain("Ver documento");
});
it("conserva valores y señala campo inválido al confirmar", async () => {
  const path = await start();
  const form = confirmation();
  form.set("line-0-priceClp", "");
  const response = await render(path, form);
  expect(response.status).toBe(422);
  const html = await response.text();
  expect(html).toMatch(/name="line-0-priceClp"[^>]*aria-invalid="true"/);
  expect(html).toContain('value="6500"');
});
it("descarta y redirige con aviso", async () => {
  const path = await start();
  const form = new FormData();
  form.set("action", "discard");
  const result = await render(path, form);
  expect(result.headers.get("location")).toBe("/taller/compras?hecho=descartada");
  expect(await (await render("/taller/compras?hecho=descartada")).text()).toContain(
    "Lectura descartada.",
  );
});
it.each(["owner", "admin", "reception", "mechanic"] as const)(
  "enlaces y acceso dependen del rol %s",
  async (role) => {
    const auth = await session(role);
    const allowed = role === "owner" || role === "admin";
    expect((await render(undefined, undefined, auth)).status).toBe(allowed ? 200 : 403);
    for (const path of ["/taller/inventario", "/taller/compras"]) {
      const html = await (await render(path, undefined, auth)).text();
      expect(html.includes("Cargar por factura")).toBe(allowed);
    }
  },
);
