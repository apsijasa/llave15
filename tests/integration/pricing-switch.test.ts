import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { hashPassword, loginAdmin, SESSION_COOKIE } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { auditLog, bikes, customers, services } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import {
  allocateOrderNumber,
  getNewOrderPricingMode,
  setNewOrderPricingMode,
} from "../../src/server/taller/order-creation.ts";
import { openWarrantyOrder, startReception } from "../../src/server/taller/orders.ts";
import { PRICING_MODE_LABELS } from "../../src/server/taller/rules.ts";
import type { PricingMode } from "../../src/server/taller/rules.ts";
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
const { default: CatalogPage } = await import("../../src/pages/taller/catalogo/index.astro");

const NOW = new Date("2026-11-14T15:00:00Z");
const PASSWORD = "clave-regimen-de-prueba";
const SITE = "https://vectorbikes.cl";
let test: TestDb;
let owner: SessionUser;
let customerId: string;
let bikeId: string;

async function seedUser(
  role: SessionUser["role"],
  branchId = owner.branchId,
): Promise<SessionUser> {
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
  if (!row) throw new Error("Falta el usuario");
  return { ...row, role };
}

async function login(user = owner) {
  const result = await loginAdmin(test.db, {
    email: user.email,
    password: PASSWORD,
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!result.ok) throw new Error(`No se inició sesión: ${result.code}`);
  return result.token;
}

async function render(token?: string, body?: URLSearchParams, origin = SITE, query = "") {
  const headers = new Headers();
  if (token) headers.set("cookie", `${SESSION_COOKIE}=${token}`);
  if (body) headers.set("origin", origin);
  const request = new Request(`${SITE}/taller/catalogo${query}`, {
    method: body ? "POST" : "GET",
    headers,
    body,
  });
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  return container.renderToResponse(CatalogPage, { request }).finally(() => vi.useRealTimers());
}

async function receive() {
  const result = await startReception(
    test.db,
    owner,
    {
      customerId,
      bikeId,
      requestedService: "Revisión general",
    },
    NOW,
  );
  if (!result.ok) throw new Error(`No se creó la orden: ${result.code}`);
  return result.orderId;
}

async function readOrder(id: string) {
  const [order] = await test.db.select().from(workOrders).where(eq(workOrders.id, id));
  if (!order) throw new Error("Falta la orden");
  return order;
}

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta sucursal");
  owner = await seedUser("owner", branch.id);
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: branch.id,
      name: "Cliente prueba",
      phoneE164: "+56912345678",
    })
    .returning();
  if (!customer) throw new Error("Falta cliente");
  customerId = customer.id;
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: branch.id,
      customerId,
      brand: "Specialized",
      model: "Prueba",
      bikeType: "mtb",
    })
    .returning();
  if (!bike) throw new Error("Falta bicicleta");
  bikeId = bike.id;
  return async () => {
    holder.db = null;
    await test.close();
  };
});

it.each(["final", "neto"] as const)(
  "la recepción copia el régimen %s y asigna el número",
  async (mode) => {
    if (mode === "neto") await test.db.update(branches).set({ newOrderPricingMode: mode });
    expect(await readOrder(await receive())).toMatchObject({
      branchId: owner.branchId,
      number: 1,
      pricingMode: mode,
      subtotalClp: 0,
      vatClp: 0,
      totalClp: 0,
    });
  },
);

it.each(["final", "neto"] as const)(
  "la garantía usa el régimen actual %s, aunque el original tenga otro",
  async (mode) => {
    const originalId = await receive();
    await test.db
      .update(workOrders)
      .set({
        pricingMode: mode === "neto" ? "final" : "neto",
        status: "entregada",
        qcApprovedAt: NOW,
      })
      .where(eq(workOrders.id, originalId));
    const original = await readOrder(originalId);
    await test.db.update(branches).set({ newOrderPricingMode: mode });
    const result = await openWarrantyOrder(
      test.db,
      owner,
      originalId,
      { reason: "Revisar ajuste" },
      NOW,
    );
    if (!result.ok) throw new Error(`No se abrió garantía: ${result.code}`);
    expect(await readOrder(result.orderId)).toMatchObject({
      number: 2,
      pricingMode: mode,
      warrantyOfOrderId: originalId,
      subtotalClp: 0,
      vatClp: 0,
      totalClp: 0,
    });
    expect(await readOrder(originalId)).toEqual(original);
  },
);

it.each(["final", "neto"] as const)(
  "muestra el régimen %s seleccionado y las instrucciones",
  async (mode) => {
    await test.db.update(branches).set({ newOrderPricingMode: mode });
    const response = await render(await login());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const html = await response.text();
    for (const text of [
      "Régimen de precios de órdenes nuevas",
      "Guardar régimen",
      "Precios finales",
      "Precios netos + IVA",
      "Afecta solo a las órdenes creadas después del cambio. Antes de pasar a netos, confirma que los precios del catálogo y de los productos están cargados sin IVA.",
    ])
      expect(html).toContain(text);
    expect(html).toContain(`<input type="hidden" name="action" value="pricing"`);
    const radio = html.match(new RegExp(`<input\\b[^>]*value="${mode}"[^>]*>`))?.[0];
    expect(radio).toContain('type="radio"');
    expect(radio).toContain("checked");
    expect(html).toContain(PRICING_MODE_LABELS[mode]);
  },
);

it("guarda por POST, redirige con 303 y muestra el aviso", async () => {
  const token = await login();
  const response = await render(token, new URLSearchParams({ action: "pricing", mode: "neto" }));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/taller/catalogo?hecho=pricing");
  expect(response.headers.get("cache-control")).toBe("no-store");
  const [branch] = await test.db.select().from(branches);
  expect(branch?.newOrderPricingMode).toBe("neto");
  expect(await test.db.select().from(services)).toEqual([]);
  const html = await (await render(token, undefined, SITE, "?hecho=pricing")).text();
  expect(html).toMatch(/<p\b[^>]*role="status"[^>]*>Régimen de precios guardado\.<\/p>/);
});

it.each(["reception", "mechanic"] as const)(
  "oculta el formulario y rechaza POST de %s",
  async (role) => {
    const token = await login(await seedUser(role));
    expect(await (await render(token)).text()).not.toContain("Guardar régimen");
    const response = await render(token, new URLSearchParams({ action: "pricing", mode: "neto" }));
    expect(response.status).toBe(403);
    expect((await test.db.select().from(branches))[0]?.newOrderPricingMode).toBe("final");
    expect(await test.db.select().from(auditLog)).toEqual([]);
  },
);

it("rechaza un Origin ajeno y un régimen inválido sin cambiar datos", async () => {
  const token = await login();
  expect(
    (
      await render(
        token,
        new URLSearchParams({ action: "pricing", mode: "neto" }),
        "https://ajeno.test",
      )
    ).status,
  ).toBe(403);
  const response = await render(token, new URLSearchParams({ action: "pricing", mode: "otro" }));
  expect(response.status).toBe(422);
  expect(await response.text()).toContain("Selecciona un régimen de precios válido.");
  expect((await test.db.select().from(branches))[0]?.newOrderPricingMode).toBe("final");
  expect(await test.db.select().from(auditLog)).toEqual([]);
});

it.each(["final", "neto"] as const)(
  "cambia a %s sin modificar órdenes existentes y audita una sola vez",
  async (mode) => {
    const from: PricingMode = mode === "neto" ? "final" : "neto";
    await test.db.update(branches).set({ newOrderPricingMode: from });
    const id = await receive();
    await test.db
      .update(workOrders)
      .set({
        subtotalClp: from === "neto" ? 10000 : 0,
        vatClp: from === "neto" ? 1900 : 0,
        totalClp: 11900,
      })
      .where(eq(workOrders.id, id));
    const before = await readOrder(id);
    const [foreign] = await test.db.insert(branches).values({ name: "Otra sucursal" }).returning();
    expect(await setNewOrderPricingMode(test.db, owner, { mode }, NOW)).toEqual({
      ok: true,
      changed: true,
    });
    expect(await getNewOrderPricingMode(test.db, owner)).toBe(mode);
    expect(await readOrder(id)).toEqual(before);
    const audit = await test.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "pricing.mode_changed"));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      branchId: owner.branchId,
      actorUserId: owner.id,
      entityId: owner.branchId,
      details: { from, to: mode },
      createdAt: NOW,
    });
    expect(await setNewOrderPricingMode(test.db, owner, { mode }, NOW)).toEqual({
      ok: true,
      changed: false,
    });
    expect(
      await test.db.select().from(auditLog).where(eq(auditLog.action, "pricing.mode_changed")),
    ).toEqual(audit);
    expect(
      await test.db
        .select()
        .from(branches)
        .where(eq(branches.id, foreign?.id ?? "")),
    ).toEqual([foreign]);
    expect(await readOrder(await receive())).toMatchObject({ number: 2, pricingMode: mode });
  },
);

it.each(["reception", "mechanic"] as const)(
  "prohíbe el cambio por %s antes de validar",
  async (role) => {
    for (const mode of ["neto", "invalido"]) {
      expect(await setNewOrderPricingMode(test.db, { ...owner, role }, { mode }, NOW)).toEqual({
        ok: false,
        code: "forbidden",
      });
    }
    expect(await getNewOrderPricingMode(test.db, owner)).toBe("final");
    expect(await test.db.select().from(auditLog)).toEqual([]);
  },
);

it.each([{}, { mode: "otro" }, { mode: null }])("rechaza el régimen inválido %j", async (input) => {
  expect(await setNewOrderPricingMode(test.db, owner, input, NOW)).toEqual({
    ok: false,
    code: "validation_error",
  });
  expect(await getNewOrderPricingMode(test.db, owner)).toBe("final");
  expect(await test.db.select().from(auditLog)).toEqual([]);
});

it("administración puede cambiar el régimen y la numeración extraída conserva su contrato", async () => {
  const admin = await seedUser("admin");
  expect(await setNewOrderPricingMode(test.db, admin, { mode: "neto" }, NOW)).toEqual({
    ok: true,
    changed: true,
  });
  expect(await allocateOrderNumber(test.db, owner.branchId)).toBe(1);
  expect(await readOrder(await receive())).toMatchObject({ number: 2, pricingMode: "neto" });
});
