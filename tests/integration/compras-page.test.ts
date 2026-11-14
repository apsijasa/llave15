import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { hashPassword, loginAdmin } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import {
  products,
  purchaseOrderItems,
  purchaseOrders,
  stockMovements,
  suppliers,
} from "../../src/server/db/schema-inventory.ts";
import { auditLog } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null }));
vi.mock("../../src/server/db/client.ts", async (original) => ({
  ...(await original<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => holder.db,
}));
type Page = typeof import("../../src/pages/taller/indicadores.astro");
const pages = import.meta.glob<Page>("../../src/pages/taller/{compras,proveedores}/*.astro");
const NOW = new Date("2026-11-14T15:00:00Z");
const SITE = "https://vectorbikes.cl";
const PASSWORD = "clave-compras-de-prueba";
const ROUTES = ["/taller/compras", "/taller/compras/detalle", "/taller/proveedores"];
let test: TestDb;
let owner: SessionUser;
let token: string;
let supplierId: string;
let productId: string;
let purchaseId: string;

async function session(branchId: string, role: SessionUser["role"]) {
  const [user] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      name: `Usuario ${role}`,
      email: `${randomUUID()}@example.test`,
      passwordHash: await hashPassword(PASSWORD),
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning();
  if (!user) throw new Error("Falta usuario");
  const result = await loginAdmin(test.db, {
    email: user.email,
    password: PASSWORD,
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!result.ok) throw new Error("Falta sesión");
  return { user: { ...user, role }, token: result.token };
}

async function render(route: string, data?: Record<string, string>, auth = token, origin = SITE) {
  const detail = route.startsWith("/taller/compras/");
  const path = route.replace("detalle", purchaseId);
  const file = detail
    ? "compras/[id]"
    : `${new URL(`${SITE}${route}`).pathname.split("/")[2]}/index`;
  const load = pages[`../../src/pages/taller/${file}.astro`];
  expect(load, `Falta la página ${file}`).toBeTypeOf("function");
  if (!load) throw new Error("Falta página");
  const request = new Request(`${SITE}${path}`, {
    method: data ? "POST" : "GET",
    headers: {
      cookie: `vb_admin_session=${auth}`,
      ...(data ? { origin, "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: data ? new URLSearchParams(data) : undefined,
  });
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  const page = (await load()).default;
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  return container
    .renderToResponse(page, {
      request,
      params: detail ? { id: path.split("/")[3]?.split("?")[0] } : {},
    })
    .finally(() => vi.useRealTimers());
}

const line = () => ({ action: "add", productId, quantity: "3", unitCostClp: "6500" });
const receipt = { action: "receive", docType: "factura", docNumber: "F-123" };
function expectRedirect(response: Response, location: string) {
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(location);
  expect(response.headers.get("cache-control")).toBe("no-store");
}
async function snapshot() {
  return {
    purchases: await test.db.select().from(purchaseOrders),
    items: await test.db.select().from(purchaseOrderItems),
    suppliers: await test.db.select().from(suppliers),
    movements: await test.db.select().from(stockMovements),
    products: await test.db.select().from(products),
    audits: await test.db.select().from(auditLog),
  };
}

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta sucursal");
  const auth = await session(branch.id, "owner");
  owner = auth.user;
  token = auth.token;
  supplierId = randomUUID();
  productId = randomUUID();
  purchaseId = randomUUID();
  await test.db
    .insert(suppliers)
    .values({ id: supplierId, branchId: branch.id, name: "Distribuidora Sur" });
  await test.db.insert(products).values({
    id: productId,
    branchId: branch.id,
    sku: "CAD-01",
    name: "Cadena de prueba",
    category: "repuesto",
    priceClp: 12000,
    stockQty: 4,
    costClp: 5000,
    createdBy: owner.id,
  });
  await test.db.insert(purchaseOrders).values({
    id: purchaseId,
    branchId: branch.id,
    supplierId,
    number: 10,
    createdBy: owner.id,
  });
  return async () => {
    holder.db = null;
    await test.close();
  };
});

it("crea un borrador por POST y lo enlaza desde el listado", async () => {
  const response = await render("/taller/compras", { supplierId, notes: "Reposición" });
  const rows = await test.db.select().from(purchaseOrders).where(eq(purchaseOrders.number, 1));
  expect(rows).toHaveLength(1);
  const created = rows[0];
  expect(created).toMatchObject({
    status: "borrador",
    supplierId,
    notes: "Reposición",
    branchId: owner.branchId,
  });
  expectRedirect(response, `/taller/compras/${created?.id}`);
  const html = await (await render("/taller/compras")).text();
  for (const text of [
    "OC-00001",
    "Distribuidora Sur",
    "Borrador",
    "Nueva compra",
    "Proveedor",
    "Notas",
  ])
    expect(html).toContain(text);
});

it("agrega una línea, recibe con documento y muestra el stock nuevo", async () => {
  expectRedirect(
    await render("/taller/compras/detalle", line()),
    `/taller/compras/${purchaseId}?hecho=add`,
  );
  const list = await (await render("/taller/compras")).text();
  expect(list).toContain("$19.500");
  const before = await (await render("/taller/compras/detalle?hecho=add")).text();
  for (const label of [
    "Línea agregada.",
    "Producto",
    "Cantidad",
    "Costo unitario neto",
    "Agregar línea",
    "Tipo de documento",
    "Folio",
    "Motivo",
  ])
    expect(before).toContain(label);
  expectRedirect(
    await render("/taller/compras/detalle", receipt),
    `/taller/compras/${purchaseId}?hecho=receive`,
  );
  const html = await (await render("/taller/compras/detalle?hecho=receive")).text();
  for (const label of [
    "Recibida",
    "Compra recibida.",
    "Stock actual",
    "Cadena de prueba",
    "F-123",
    "Factura",
  ])
    expect(html).toContain(label);
  expect(html).toMatch(/<td\b[^>]*>7<\/td>/);
  expect(html).not.toContain("Agregar línea");
  expect(html).not.toContain('value="receive"');
  const saved = await snapshot();
  expect(saved.products[0]?.stockQty).toBe(7);
  expect(saved.purchases[0]).toMatchObject({
    status: "recibida",
    docType: "factura",
    docNumber: "F-123",
  });
  expect(saved.movements).toHaveLength(1);
  expect((await render("/taller/compras/detalle", receipt)).status).toBe(409);
  expect((await snapshot()).movements).toHaveLength(1);
});

it("marca enviada, oculta el alta de líneas y permite recibir", async () => {
  await render("/taller/compras/detalle", line());
  expectRedirect(
    await render("/taller/compras/detalle", { action: "send" }),
    `/taller/compras/${purchaseId}?hecho=send`,
  );
  const html = await (await render("/taller/compras/detalle?hecho=send")).text();
  expect(html).toContain("Compra enviada.");
  expect(html).toContain("Enviada");
  expect(html).not.toContain("Agregar línea");
  expect((await render("/taller/compras/detalle", line())).status).toBe(409);
  expectRedirect(
    await render("/taller/compras/detalle", receipt),
    `/taller/compras/${purchaseId}?hecho=receive`,
  );
});

it("anula con motivo sin borrar la compra ni mover stock", async () => {
  expect((await render("/taller/compras/detalle", { action: "void", reason: "" })).status).toBe(
    422,
  );
  expectRedirect(
    await render("/taller/compras/detalle", { action: "void", reason: "Pedido duplicado" }),
    `/taller/compras/${purchaseId}?hecho=void`,
  );
  const html = await (await render("/taller/compras/detalle?hecho=void")).text();
  expect(html).toContain("Compra anulada.");
  expect(html).toContain("Anulada");
  const saved = await snapshot();
  expect(saved.purchases).toHaveLength(1);
  expect(saved.purchases[0]?.voidedAt).not.toBeNull();
  expect(saved.movements).toEqual([]);
  expect(saved.audits.some((row) => row.details?.reason === "Pedido duplicado")).toBe(true);
});

it("crea y edita proveedores en línea conservando datos inválidos", async () => {
  const input = {
    name: "Proveedor Nuevo",
    rut: "12.345.678-5",
    phone: "+56911112222",
    email: "ventas@example.test",
    notes: "Entrega los lunes",
  };
  expectRedirect(await render("/taller/proveedores", input), "/taller/proveedores?hecho=create");
  const [supplier] = await test.db.select().from(suppliers).where(eq(suppliers.name, input.name));
  if (!supplier) throw new Error("Falta proveedor creado");
  const edit = {
    ...input,
    action: "update",
    supplierId: supplier.id,
    name: "Proveedor Editado",
    isActive: "false",
  };
  expectRedirect(await render("/taller/proveedores", edit), "/taller/proveedores?hecho=update");
  const html = await (await render("/taller/proveedores?hecho=update")).text();
  for (const label of [
    "Proveedor guardado.",
    "Guardar proveedor",
    "Nombre",
    "RUT",
    "Teléfono",
    "Correo",
    "Notas",
    "Proveedor Editado",
    "Inactivo",
  ])
    expect(html).toContain(label);
  const invalid = await render("/taller/proveedores", { ...edit, email: "incorrecto" });
  expect(invalid.status).toBe(422);
  const invalidHtml = await invalid.text();
  expect(invalidHtml).toContain('value="incorrecto"');
  expect(invalidHtml).toContain('aria-invalid="true"');
  expect(invalidHtml).toContain("aria-describedby=");
  expect(
    (await test.db.select().from(suppliers).where(eq(suppliers.id, supplier.id)))[0],
  ).toMatchObject({ name: edit.name, email: input.email, isActive: false });
});

it.each(["reception", "mechanic"] as const)(
  "deniega GET y POST a %s en las tres páginas",
  async (role) => {
    const auth = await session(owner.branchId, role);
    const before = await snapshot();
    for (const route of ROUTES) {
      for (const data of [undefined, { action: "receive" }]) {
        const response = await render(route, data, auth.token);
        expect(response.status).toBe(403);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.text()).not.toContain("6500");
      }
    }
    expect(await snapshot()).toEqual(before);
  },
);

it.each(ROUTES)("rechaza Origin ajeno y ausente sin escribir en %s", async (route) => {
  const before = await snapshot();
  const data: Record<string, string> = route.endsWith("detalle")
    ? line()
    : route.endsWith("proveedores")
      ? { name: "Intruso" }
      : { supplierId };
  for (const origin of ["https://otro.cl", ""])
    expect((await render(route, data, token, origin)).status).toBe(403);
  expect(await snapshot()).toEqual(before);
});

it.each(ROUTES)(
  "exige sesión, admite administración y entrega HTML sin caché en %s",
  async (route) => {
    const path = route.replace("detalle", purchaseId);
    expectRedirect(
      await render(route, undefined, ""),
      `/admin/login?next=${encodeURIComponent(path)}`,
    );
    const admin = await session(owner.branchId, "admin");
    const response = await render(route, undefined, admin.token);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const html = await response.text();
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("noindex");
    expect(html).not.toContain("astro-island");
  },
);

it("valida entradas de compra antes de escribir", async () => {
  const before = await snapshot();
  expect((await render("/taller/compras", { supplierId: "invalido" })).status).toBe(422);
  const inputs: Record<string, string>[] = [
    { ...line(), quantity: "0" },
    { ...line(), unitCostClp: "1.5" },
    { action: "receive", docType: "otro", docNumber: "123" },
    { action: "desconocida" },
  ];
  for (const input of inputs)
    expect((await render("/taller/compras/detalle", input)).status).toBe(422);
  expect((await render("/taller/compras/detalle", receipt)).status).toBe(409);
  expect(await snapshot()).toEqual(before);
});

it("no encuentra compras inválidas ni de otra sucursal", async () => {
  expect((await render("/taller/compras/invalido")).status).toBe(404);
  const [branch] = await test.db.insert(branches).values({ name: "Otra sucursal" }).returning();
  if (!branch) throw new Error("Falta sucursal");
  const other = await session(branch.id, "owner");
  const before = await snapshot();
  expect((await render("/taller/compras/detalle", undefined, other.token)).status).toBe(404);
  expect((await render("/taller/compras/detalle", receipt, other.token)).status).toBe(404);
  expect((await render("/taller/compras", { supplierId }, other.token)).status).toBe(404);
  expect(
    (
      await render(
        "/taller/proveedores",
        { action: "update", supplierId, name: "Cambio ajeno" },
        other.token,
      )
    ).status,
  ).toBe(404);
  expect(await snapshot()).toEqual(before);
});

it("agrega ambos enlaces con purchases.manage en Inventario y caja", () => {
  const layout = readFileSync(
    new URL("../../src/layouts/TallerLayout.astro", import.meta.url),
    "utf8",
  );
  const group = layout.slice(layout.indexOf('label: "Inventario y caja"'));
  for (const path of ["proveedores", "compras"])
    expect(group).toMatch(new RegExp(`href: "/taller/${path}", action: "purchases.manage"`));
});
