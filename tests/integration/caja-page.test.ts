import { randomUUID } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeEach, expect, it, vi } from "vitest";
import { hashPassword, loginAdmin } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { ROLES } from "../../src/server/auth/permissions.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { closeCashSession, openCashSession, setCashControl } from "../../src/server/taller/cash.ts";
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
const { default: CashPage } = await import("../../src/pages/taller/caja/index.astro");

const NOW = new Date("2026-11-14T15:00:00Z");
const LATER = new Date("2026-11-14T22:00:00Z");
const PASSWORD = "clave-caja-de-prueba";
const SITE = "https://vectorbikes.cl";
let test: TestDb;
let actors: Record<(typeof ROLES)[number], SessionUser>;

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  const branchId = randomUUID();
  await test.db.insert(branches).values({ id: branchId, name: "Sucursal" });
  actors = {} as typeof actors;
  const passwordHash = await hashPassword(PASSWORD);
  for (const role of ROLES) {
    const user = {
      id: randomUUID(),
      branchId,
      role,
      name: `Usuario ${role}`,
      email: `${role}@example.test`,
    };
    await test.db.insert(users).values({ ...user, passwordHash });
    actors[role] = user;
  }
  return async () => {
    holder.db = null;
    await test.close();
  };
});

async function render(user: SessionUser, query = "") {
  const login = await loginAdmin(test.db, {
    email: user.email,
    password: PASSWORD,
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!login.ok) throw new Error(login.code);
  const request = new Request(`${SITE}/taller/caja${query}`, {
    headers: { cookie: `vb_admin_session=${login.token}` },
  });
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  vi.useFakeTimers({ toFake: ["Date"], now: LATER });
  return container.renderToResponse(CashPage, { request }).finally(() => vi.useRealTimers());
}

async function enableCash() {
  expect(await setCashControl(test.db, actors.owner, { enabled: true }, NOW)).toMatchObject({
    ok: true,
  });
}

it("el mecánico recibe 403", async () => {
  expect((await render(actors.mechanic)).status).toBe(403);
});

it("recepción ve la apertura sin interruptor ni devolución", async () => {
  await enableCash();
  const response = await render(actors.reception);
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain(">Efectivo inicial</label>");
  expect(html).toContain("Abrir caja");
  expect(html).not.toContain("control de caja</button>");
  expect(html).not.toContain("Registrar devolución");
});

it("recepción ve el cierre de una caja abierta, sin devolución", async () => {
  await enableCash();
  await openCashSession(test.db, actors.reception, { openingCashClp: 10000 }, NOW);
  const html = await (await render(actors.reception)).text();
  for (const term of ["Abierta por", "Efectivo inicial", "Ingresos", "Egresos", "Esperado"])
    expect(html).toContain(`<dt>${term}</dt>`);
  expect(html).toContain("Usuario reception");
  expect(html).toContain("Movimientos de la sesión");
  expect(html).toContain("Otros medios del día");
  expect(html).toContain(">Efectivo contado</label>");
  expect(html).toContain("Cerrar caja");
  expect(html).not.toContain("Registrar devolución");
  expect(html).not.toContain("control de caja</button>");
});

it("el dueño ve el interruptor y, con la caja abierta, la devolución", async () => {
  const off = await (await render(actors.owner)).text();
  expect(off).toContain("Habilitar control de caja");
  await enableCash();
  await openCashSession(test.db, actors.owner, { openingCashClp: 0 }, NOW);
  const open = await (await render(actors.owner)).text();
  expect(open).toContain("Desactivar control de caja");
  for (const label of [
    "Venta",
    "Monto",
    "Motivo",
    "SKU devuelto (opcional)",
    "Unidades devueltas (opcional)",
  ])
    expect(open).toContain(`>${label}</label>`);
  expect(open).toContain("Registrar devolución");
});

it("una sesión cerrada con diferencia -1.000 aparece marcada con su signo", async () => {
  await enableCash();
  await openCashSession(test.db, actors.owner, { openingCashClp: 20000 }, NOW);
  expect(
    await closeCashSession(test.db, actors.owner, { countedCashClp: 19000 }, LATER),
  ).toMatchObject({ ok: true, differenceClp: -1000 });
  const html = await (await render(actors.owner)).text();
  expect(html).toMatch(/<span class="status status--diferencia"[^>]*>Diferencia -\$1\.000<\/span>/);
});

it("el aviso de cierre muestra la diferencia con su signo", async () => {
  const zero = await (await render(actors.owner, "?hecho=close&diferencia=0")).text();
  expect(zero).toContain("Caja cerrada. Diferencia: $0.");
  const short = await (await render(actors.owner, "?hecho=close&diferencia=-1000")).text();
  expect(short).toContain("Caja cerrada. Diferencia: -$1.000.");
});
