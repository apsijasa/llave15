import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { hashPassword } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { shops } from "../../src/server/db/schema-shops.ts";
import { adminSessions, users } from "../../src/server/db/schema.ts";
import { scopeBySlug } from "../../src/server/shops/scope.ts";
import { setShopStatus, shopUsage } from "../../src/server/shops/platform-shops.ts";
import { createTestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null, actor: null as SessionUser | null }));
vi.mock("../../src/server/db/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Base de prueba no inicializada");
    return holder.db;
  },
}));
vi.mock("../../src/server/auth/admin-auth.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/server/auth/admin-auth.ts")>();
  return {
    ...original,
    requireAdmin: async () => holder.actor,
    realRequireAdmin: original.requireAdmin,
    realLogin: original.loginAdmin,
  };
});
const auth = (await import("../../src/server/auth/admin-auth.ts")) as unknown as {
  realRequireAdmin: typeof import("../../src/server/auth/admin-auth.ts").requireAdmin;
  realLogin: typeof import("../../src/server/auth/admin-auth.ts").loginAdmin;
};
const { default: ShopPage } = await import("../../src/pages/plataforma/talleres/[id].astro");

const NOW = new Date("2026-11-20T15:00:00.000Z");
const APP_URL = "https://llave15.cl";
const PASSWORD = "clave-del-taller-demo-01";
let db: AppDb;
let seeded: Awaited<ReturnType<typeof seedTwoShops>>;
let platform: SessionUser;

async function login(email: string) {
  return auth.realLogin(db, { email, password: PASSWORD, ipHash: "ip-de-prueba", now: NOW });
}

async function statusOf(shopId: string) {
  const [row] = await db.select({ status: shops.status }).from(shops).where(eq(shops.id, shopId));
  return row?.status;
}

beforeEach(async () => {
  vi.stubEnv("APP_URL", APP_URL);
  db = (await createTestDb()).db;
  holder.db = db;
  seeded = await seedTwoShops(db);
  platform = { ...seeded.vector.owner, isPlatformAdmin: true };
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(PASSWORD) })
    .where(eq(users.id, seeded.demo.owner.id));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("setShopStatus", () => {
  it("suspende el Taller Demo y revoca las sesiones abiertas de sus usuarios", async () => {
    const session = await login(seeded.demo.owner.email);
    if (!session.ok) throw new Error(session.code);
    expect(await auth.realRequireAdmin(db, session.token, NOW)).not.toBeNull();
    expect(await setShopStatus(db, platform, seeded.demo.shop.id, "suspendido", NOW)).toEqual({
      ok: true,
    });
    expect(await statusOf(seeded.demo.shop.id)).toBe("suspendido");
    const sessions = await db
      .select()
      .from(adminSessions)
      .where(eq(adminSessions.userId, seeded.demo.owner.id));
    expect(sessions.every((row) => row.revokedAt !== null)).toBe(true);
    expect(await auth.realRequireAdmin(db, session.token, NOW)).toBeNull();
  });

  it("rechaza el ingreso de un usuario de un taller suspendido como a uno inactivo", async () => {
    await setShopStatus(db, platform, seeded.demo.shop.id, "suspendido", NOW);
    expect(await login(seeded.demo.owner.email)).toEqual({ ok: false, code: "invalid" });
  });

  it("saca la página pública y la API del taller suspendido", async () => {
    await setShopStatus(db, platform, seeded.demo.shop.id, "suspendido", NOW);
    expect(await scopeBySlug(db, "taller-demo")).toBeNull();
    expect(await scopeBySlug(db, "vector-bikes")).not.toBeNull();
  });

  it("al reactivar, sus usuarios vuelven a entrar", async () => {
    await setShopStatus(db, platform, seeded.demo.shop.id, "suspendido", NOW);
    expect(await setShopStatus(db, platform, seeded.demo.shop.id, "activo", NOW)).toEqual({
      ok: true,
    });
    expect(await statusOf(seeded.demo.shop.id)).toBe("activo");
    expect(await login(seeded.demo.owner.email)).toMatchObject({ ok: true });
  });

  it("no suspende el taller del propio administrador ni actúa sin la marca", async () => {
    expect(await setShopStatus(db, platform, seeded.vector.shop.id, "suspendido", NOW)).toEqual({
      ok: false,
      code: "own_shop",
    });
    expect(
      await setShopStatus(db, seeded.vector.owner, seeded.demo.shop.id, "suspendido", NOW),
    ).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(await statusOf(seeded.demo.shop.id)).toBe("activo");
  });
});

describe("/plataforma/talleres/<id>", () => {
  async function render(actor: SessionUser, method = "GET", origin = APP_URL) {
    holder.actor = actor;
    const container = await AstroContainer.create();
    return container.renderToResponse(ShopPage, {
      params: { id: seeded.demo.shop.id },
      request: new Request(`${APP_URL}/plataforma/talleres/${seeded.demo.shop.id}`, {
        method,
        headers: { origin, "content-type": "application/x-www-form-urlencoded" },
        ...(method === "POST" ? { body: new URLSearchParams({ accion: "suspender" }) } : {}),
      }),
    });
  }

  it("muestra el uso del taller sin datos personales", async () => {
    expect(await shopUsage(db, platform, seeded.demo.shop.id, NOW)).toMatchObject({
      slug: "taller-demo",
      activeUsers: 2,
      openOrders: 0,
      recentBookings: 0,
      recentSales: 0,
    });
    const html = await (await render(platform)).text();
    expect(html).toContain("Usuarios activos");
    expect(html).toContain("Suspender");
    expect(html).not.toContain(seeded.demo.owner.email);
  });

  it("responde 403 a un POST sin la marca o con Origin ajeno, sin cambiar el estado", async () => {
    expect((await render(seeded.vector.owner, "POST")).status).toBe(403);
    expect((await render(platform, "POST", "https://ajeno.example")).status).toBe(403);
    expect(await statusOf(seeded.demo.shop.id)).toBe("activo");
  });

  it("suspende con el botón y redirige con el aviso", async () => {
    const response = await render(platform, "POST");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("?hecho=suspender");
    expect(await statusOf(seeded.demo.shop.id)).toBe("suspendido");
  });
});
