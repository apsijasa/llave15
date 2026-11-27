import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hashPassword, loginAdmin } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { purchaseImports } from "../../src/server/db/schema-purchase-imports.ts";
import { users } from "../../src/server/db/schema.ts";
import { normalizeInvoiceExtraction } from "../../src/server/taller/invoice-normalize.ts";
import { createProduct } from "../../src/server/taller/products.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null }));
vi.mock("../../src/server/db/client.ts", async (original) => ({
  ...(await original<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => holder.db,
}));
type Page = typeof import("../../src/pages/taller/indicadores.astro");
const pages = import.meta.glob<Page>(
  "../../src/pages/taller/{inventario,compras/factura,ventas}/**/*.astro",
);
const NOW = new Date("2026-11-28T15:00:00Z");
const SITE = "https://vectorbikes.cl";
let test: TestDb;
let shop: Awaited<ReturnType<typeof seedTwoShops>>["vector"];
let id: string;
let token: string;
async function session(role: "owner" | "mechanic") {
  const actor = shop[role];
  await test.db.update(users).set({ passwordHash: await hashPassword("clave-prueba") });
  const result = await loginAdmin(test.db, {
    email: actor.email,
    password: "clave-prueba",
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!result.ok) throw new Error("Sesión");
  return result.token;
}
beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  shop = (await seedTwoShops(test.db)).vector;
  token = await session("owner");
  const result = await createProduct(
    test.db,
    shop.owner,
    {
      sku: "LIM",
      name: "Limpiador sintético",
      category: "insumo",
      forSale: false,
      priceClp: 0,
      stockQty: 5,
    },
    NOW,
  );
  if (!result.ok) throw new Error(result.code);
  id = result.productId;
});
afterEach(async () => {
  vi.useRealTimers();
  await test.close();
});
async function render(file = "inventario/[id]", body?: FormData, auth = token, itemId = id) {
  const route = file.replace("[id]", itemId).replace("/index", "");
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  const load = pages[`../../src/pages/taller/${file}.astro`]!;
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  return container
    .renderToResponse((await load()).default, {
      params: { id: itemId },
      request: new Request(`${SITE}/taller/${route}`, {
        method: body ? "POST" : "GET",
        headers: { cookie: `vb_admin_session=${auth}`, ...(body ? { origin: SITE } : {}) },
        body,
      }),
    })
    .finally(() => vi.useRealTimers());
}
function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}
it("muestra uso solo al dueño para un producto interno", async () => {
  const html = await (await render()).text();
  expect(html).toContain("Registrar uso en taller");
  expect(html).toContain("Uso interno");
  expect(html).toMatch(/class="btn ghost"[^>]*>Registrar ajuste/);
  const mechanic = await session("mechanic");
  expect(await (await render(undefined, undefined, mechanic)).text()).not.toContain(
    "Registrar uso en taller",
  );
  const result = await createProduct(
    test.db,
    shop.owner,
    { sku: "VENTA", name: "Producto venta", category: "insumo", priceClp: 1000 },
    NOW,
  );
  if (!result.ok) throw new Error(result.code);
  expect(await (await render(undefined, undefined, token, result.productId)).text()).not.toContain(
    "Registrar uso en taller",
  );
});
it("POST use redirige, rechaza al mecánico y marca stock insuficiente", async () => {
  const body = form({ action: "use", quantity: "2", note: "limpieza" });
  const mechanic = await session("mechanic");
  expect((await render(undefined, body, mechanic)).status).toBe(403);
  const response = await render(undefined, body);
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(`/taller/inventario/${id}?hecho=use`);
  const failed = await render(undefined, form({ action: "use", quantity: "99" }));
  expect(failed.status).toBe(409);
  expect(await failed.text()).toContain("No hay stock suficiente para registrar ese uso.");
});
it("ofrece casilla en crear y editar; crea sin precio y explica el precio de venta faltante", async () => {
  expect(await (await render("inventario/nuevo")).text()).toMatch(/name="forSale"[^>]*checked/);
  const raw = {
    sku: "NUEVO",
    name: "Otro limpiador",
    category: "insumo",
    unit: "unidad",
    priceClp: "",
    stockQty: "5",
  };
  const missingPrice = await render("inventario/nuevo", form({ ...raw, forSale: "1" }));
  expect(missingPrice.status).toBe(422);
  expect(await missingPrice.text()).toContain("Ingresa el precio de venta neto.");
  const created = await render("inventario/nuevo", form(raw));
  expect(created.status).toBe(303);
  expect(created.headers.get("location")).toMatch(/hecho=create$/);
});
it("resume errores por sección con enlaces y marca el precio", async () => {
  const [row] = await test.db
    .insert(purchaseImports)
    .values({
      branchId: shop.branch.id,
      createdBy: shop.owner.id,
      fileKey: "documento.pdf",
      fileType: "pdf",
      fileBytes: 10,
      provider: "falso",
      model: "falso",
      promptVersion: "1",
      extraction: normalizeInvoiceExtraction({
        supplier: { name: "Proveedor", rut: null },
        document: { type: "factura", number: "42", date: null },
        pricesIncludeVat: false,
        lines: [
          {
            code: "NUEVO",
            description: "Limpiador",
            quantity: 1,
            unit: "unidad",
            unitPrice: 1000,
            lineTotal: null,
          },
        ],
        totals: { net: null, exempt: null, vat: null, total: null },
        confidence: "alta",
        warnings: [],
      }),
    })
    .returning();
  const response = await render(
    "compras/factura/[id]",
    form({
      action: "confirm",
      "supplier-mode": "create",
      "supplier-name": "x",
      docNumber: "x".repeat(81),
      "line-0-mode": "create",
      "line-0-sku": "NUEVO",
      "line-0-name": "Limpiador",
      "line-0-category": "insumo",
      "line-0-unit": "unidad",
      "line-0-quantity": "1",
      "line-0-unitCostClp": "1000",
      "line-0-priceClp": "",
      "line-0-forSale": "on",
      "line-0-forSalePresent": "1",
    }),
    token,
    row!.id,
  );
  expect(response.status).toBe(422);
  const html = await response.text();
  expect(html).toContain("Faltan datos o hay datos por corregir en:");
  for (const section of ["supplier", "document", "line-0"])
    expect(html).toContain(`href="#${section}"`);
  expect(html).toMatch(/name="line-0-priceClp"[^>]*aria-invalid="true"/);
  expect(html).toContain('class="field-error"');
});
it("oculta uso interno de las ventas y lo identifica en inventario", async () => {
  expect(await (await render("ventas/nueva")).text()).not.toContain("Limpiador sintético");
  const html = await (await render("inventario/index")).text();
  expect(html).toContain("Uso interno");
});

it("aplica el filtro vendible antes del límite de 300 productos del selector", async () => {
  await test.client.query(
    `insert into products (branch_id, sku, name, category, for_sale, price_clp, created_by)
     select $1, 'INT-' || i, 'A interno ' || i, 'insumo', false, 0, $2 from generate_series(1,300) i`,
    [shop.branch.id, shop.owner.id],
  );
  const result = await createProduct(
    test.db,
    shop.owner,
    {
      sku: "VENTA-LIMITE",
      name: "Z producto vendible",
      category: "repuesto",
      priceClp: 1000,
      stockQty: 1,
    },
    NOW,
  );
  if (!result.ok) throw new Error(result.code);
  expect(await (await render("ventas/nueva")).text()).toContain("Z producto vendible");
});
