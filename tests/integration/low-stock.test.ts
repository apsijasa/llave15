import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeEach, expect, it, vi } from "vitest";
import { getEmailEnv } from "../../src/lib/env.ts";
import { SITE } from "../../src/lib/site.ts";
import { handleAlertsTask } from "../../src/server/api/task-handlers.ts";
import { hashPassword, loginAdmin } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { ROLES } from "../../src/server/auth/permissions.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { products } from "../../src/server/db/schema-inventory.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import type { EmailMessage } from "../../src/server/email/transport.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null }));
vi.mock("../../src/server/db/client.ts", async (original) => ({
  ...(await original<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Base de prueba no inicializada");
    return holder.db;
  },
}));

const NOW = new Date("2026-11-13T15:00:00Z");
const SECRET = "test-low-stock-secret-0123456789abcdef";
const PASSWORD = "clave-stock-de-prueba";
let test: TestDb;
let owner: SessionUser;
let otherBranchId: string;
let passwordHash: string;

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
      passwordHash,
    })
    .returning();
  if (!row) throw new Error("Falta usuario");
  return { ...row, role };
}

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  const [branch, other] = await test.db
    .insert(branches)
    .values([{ name: "Sucursal principal" }, { name: "Otra sucursal" }])
    .returning();
  if (!branch || !other) throw new Error("Faltan sucursales");
  otherBranchId = other.id;
  passwordHash = await hashPassword(PASSWORD);
  owner = await seedUser("owner", branch.id);
  return async () => {
    holder.db = null;
    await test.close();
  };
});

async function seedProduct(sku: string, values: Partial<typeof products.$inferInsert> = {}) {
  await test.db.insert(products).values({
    branchId: owner.branchId,
    createdBy: owner.id,
    sku,
    name: `Producto ${sku}`,
    category: "repuesto",
    priceClp: 2000,
    costClp: 1234,
    stockQty: 1,
    minStock: 2,
    ...values,
  });
}

async function seedOverdueOrder() {
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: owner.branchId,
      name: "Ana Pérez",
      phoneE164: "+56912345678",
    })
    .returning();
  if (!customer) throw new Error("Falta cliente");
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: owner.branchId,
      customerId: customer.id,
      brand: "Scott",
      model: "Spark",
      bikeType: "mtb",
    })
    .returning();
  if (!bike) throw new Error("Falta bicicleta");
  await test.db.insert(workOrders).values({
    branchId: owner.branchId,
    customerId: customer.id,
    bikeId: bike.id,
    number: 1,
    requestedService: "Revisión",
    createdBy: owner.id,
    estimatedDeliveryDate: "2026-11-12",
  });
}

function alerts() {
  const messages: EmailMessage[] = [];
  const transport = {
    send: vi.fn(async (message: EmailMessage) => {
      messages.push(message);
    }),
  };
  const request = new Request(`${SITE.url}/api/tareas/alertas`, {
    method: "POST",
    headers: { authorization: `Bearer ${SECRET}` },
  });
  return {
    messages,
    transport,
    response: handleAlertsTask(request, test.db, NOW, { secret: SECRET, transport }),
  };
}

it("sin atrasos ni productos bajo mínimo conserva la respuesta exacta y no envía", async () => {
  await seedProduct("SIN-MINIMO", { stockQty: 0, minStock: 0 });
  await seedProduct("INACTIVO", { isActive: false });
  await seedProduct("SOBRE-MINIMO", { stockQty: 3 });
  const { response, transport } = alerts();
  const result = await response;
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ ok: true, overdue: 0, sent: false });
  expect(transport.send).not.toHaveBeenCalled();
});

it("envía stock bajo de todas las sucursales ordenado por SKU, incluyendo igualdad", async () => {
  await seedProduct("Z-01", { stockQty: 2 });
  await seedProduct("A-01", { branchId: otherBranchId, stockQty: 0, name: "Cadena <b>&" });
  await seedProduct("INACTIVO", { isActive: false });
  await seedProduct("SIN-MINIMO", { minStock: 0, stockQty: 0 });
  await seedProduct("SOBRE-MINIMO", { stockQty: 3 });
  const { response, messages } = alerts();
  const result = await response;
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ ok: true, overdue: 0, sent: true, lowStock: 2 });
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({
    to: getEmailEnv().SHOP_NOTIFY_EMAIL,
    subject: `Stock bajo mínimo: 2 · ${SITE.name}`,
    text: "Stock bajo mínimo:\nA-01 · Cadena <b>& · stock 0 (mínimo 2)\nZ-01 · Producto Z-01 · stock 2 (mínimo 2)",
  });
  expect(messages[0]?.html).toContain("Cadena &lt;b&gt;&amp;");
  expect(messages[0]?.html).not.toContain("<b>");
});

it("con atrasos conserva el asunto y agrega el stock al final de ambos cuerpos", async () => {
  await seedOverdueOrder();
  await seedProduct("REP-01");
  const { response, messages } = alerts();
  expect(await (await response).json()).toEqual({ ok: true, overdue: 1, sent: true, lowStock: 1 });
  expect(messages).toHaveLength(1);
  expect(messages[0]?.subject).toBe(`Órdenes atrasadas: 1 · ${SITE.name}`);
  expect(messages[0]?.text).toBe(
    [
      "OT-00001 · Ana Pérez · Scott Spark · prometida 12-11-2026 (1 días)",
      "Stock bajo mínimo:",
      "REP-01 · Producto REP-01 · stock 1 (mínimo 2)",
    ].join("\n"),
  );
  expect(messages[0]?.html).toContain(
    "<p>Stock bajo mínimo:</p>\n<p>REP-01 · Producto REP-01 · stock 1 (mínimo 2)</p>",
  );
});

it("sin stock bajo conserva el correo de atrasos y omite lowStock", async () => {
  await seedOverdueOrder();
  const { response, messages } = alerts();
  expect(await (await response).json()).toEqual({ ok: true, overdue: 1, sent: true });
  expect(messages[0]?.subject).toBe(`Órdenes atrasadas: 1 · ${SITE.name}`);
  expect(messages[0]?.text).toBe(
    "OT-00001 · Ana Pérez · Scott Spark · prometida 12-11-2026 (1 días)",
  );
  expect(messages[0]?.html).toBe(
    "<p>OT-00001 · Ana Pérez · Scott Spark · prometida 12-11-2026 (1 días)</p>",
  );
});

it.each(ROLES)(
  "branchLowStock acota la sucursal y el permiso de %s sin exponer costos",
  async (role) => {
    await seedProduct("Z-01");
    await seedProduct("A-01", { stockQty: 2 });
    await seedProduct("OTRA", { branchId: otherBranchId });
    await seedProduct("INACTIVO", { isActive: false });
    await seedProduct("SIN-MINIMO", { minStock: 0, stockQty: 0 });
    const { branchLowStock } = await import("../../src/server/taller/low-stock.ts");
    const rows = await branchLowStock(test.db, { ...owner, role });
    expect(rows).toEqual(
      role === "owner" || role === "admin"
        ? ["A-01", "Z-01"].map((sku) => ({
            branchId: owner.branchId,
            sku,
            name: `Producto ${sku}`,
            stockQty: sku === "A-01" ? 2 : 1,
            minStock: 2,
          }))
        : null,
    );
  },
);

async function renderDashboard(actor: SessionUser) {
  const login = await loginAdmin(test.db, {
    email: actor.email,
    password: PASSWORD,
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!login.ok) throw new Error("No se inició sesión");
  const { default: Dashboard } = await import("../../src/pages/taller/index.astro");
  const container = await AstroContainer.create({ astroConfig: { site: SITE.url } });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  try {
    return await container.renderToResponse(Dashboard, {
      request: new Request(`${SITE.url}/taller`, {
        headers: { cookie: `vb_admin_session=${login.token}` },
      }),
    });
  } finally {
    vi.useRealTimers();
  }
}

it.each(ROLES)("/taller muestra el aviso solo con compras permitidas para %s", async (role) => {
  await seedProduct("REP-01");
  await seedProduct("OTRA", { branchId: otherBranchId });
  const response = await renderDashboard(role === "owner" ? owner : await seedUser(role));
  expect(response.status).toBe(200);
  const html = await response.text();
  if (role === "owner" || role === "admin") {
    expect(html).toContain('class="status status--bajo"');
    expect(html).toContain("Bajo mínimo");
    expect(html).toContain("Producto REP-01");
    expect(html).toContain("stock 1 (mínimo 2)");
    expect(html).toContain('href="/taller/inventario?bajo=1"');
    expect(html.indexOf("Producto REP-01")).toBeLessThan(html.indexOf('class="dash-cols"'));
  } else {
    expect(html).not.toContain("Producto REP-01");
    expect(html).not.toContain("Bajo mínimo");
  }
  expect(html).not.toContain("Producto OTRA");
});

it("/taller omite el aviso cuando no hay productos bajo mínimo", async () => {
  const response = await renderDashboard(owner);
  expect(await response.text()).not.toContain("Bajo mínimo");
});
