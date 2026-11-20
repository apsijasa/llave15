import { createHash } from "node:crypto";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { createBooking } from "../../src/server/booking/create-booking.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { shops as shopsTable } from "../../src/server/db/schema-shops.ts";
import { adminSessions, users } from "../../src/server/db/schema.ts";
import { canCurate } from "../../src/server/library/access.ts";
import { listShopsWithUsage } from "../../src/server/shops/platform-shops.ts";
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
  };
});
const auth = (await import("../../src/server/auth/admin-auth.ts")) as unknown as {
  realRequireAdmin: typeof import("../../src/server/auth/admin-auth.ts").requireAdmin;
};
const { default: PlatformPage } = await import("../../src/pages/plataforma/index.astro");

/** Martes 2026-09-15, 12:00 hora local. */
const NOW = new Date("2026-09-15T15:00:00.000Z");
const PRIVATE = ["Camila Soto", "+56933333333", "camila@ejemplo.cl"];
let db: AppDb;
let seeded: Awaited<ReturnType<typeof seedTwoShops>>;

async function render(actor: SessionUser | null): Promise<Response> {
  holder.actor = actor;
  const container = await AstroContainer.create();
  return container.renderToResponse(PlatformPage, {
    request: new Request("https://llave15.cl/plataforma"),
  });
}

async function markPlatformAdmin(userId: string) {
  await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, userId));
}

async function sessionFor(userId: string): Promise<string> {
  const token = "t".repeat(43);
  await db.insert(adminSessions).values({
    userId,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(NOW.getTime() + 60_000),
    createdAt: NOW,
  });
  return token;
}

beforeEach(async () => {
  db = (await createTestDb()).db;
  holder.db = db;
  seeded = await seedTwoShops(db);
  const result = await createBooking(
    db,
    {
      mode: "taller",
      serviceDate: "2026-09-16",
      start: "10:00",
      customerName: PRIVATE[0] ?? "",
      phoneE164: PRIVATE[1] ?? "",
      email: PRIVATE[2] ?? null,
      bike: "Ruta Giant",
      description: "Mantención general",
      comuna: null,
      address: null,
      ipHash: null,
    },
    NOW,
    seeded.demo.scope,
  );
  if (!result.ok) throw new Error(result.code);
});

describe("requireAdmin y la marca de plataforma", () => {
  it("devuelve el objeto de siempre a un usuario sin la marca", async () => {
    const owner = seeded.vector.owner;
    const user = await auth.realRequireAdmin(db, await sessionFor(owner.id), NOW);
    expect(user).toEqual({ ...owner, libraryCurator: false });
    expect(user).not.toHaveProperty("isPlatformAdmin");
  });

  it("agrega isPlatformAdmin y lo trata como curador de la biblioteca", async () => {
    const owner = seeded.vector.owner;
    await markPlatformAdmin(owner.id);
    const user = await auth.realRequireAdmin(db, await sessionFor(owner.id), NOW);
    expect(user).toMatchObject({ isPlatformAdmin: true, libraryCurator: true });
    if (!user) throw new Error("Falta la sesión");
    expect(canCurate(user)).toBe(true);
  });
});

describe("/plataforma", () => {
  it("lista cada taller con sus conteos y sin datos de clientes", async () => {
    const actor = { ...seeded.vector.owner, isPlatformAdmin: true as const };
    const rows = await listShopsWithUsage(db, actor, NOW);
    expect(rows?.map((row) => [row.slug, row.status, row.activeUsers, row.recentBookings])).toEqual(
      [
        ["taller-demo", "activo", 2, 1],
        ["vector-bikes", "activo", 2, 0],
      ],
    );
    const response = await render(actor);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("taller-demo");
    expect(html).toContain("Taller Demo");
    expect(html).toContain("status--activo");
    for (const value of PRIVATE) expect(html).not.toContain(value);
  });

  it("responde 403 sin la marca y 303 al ingreso sin sesión", async () => {
    expect(await listShopsWithUsage(db, seeded.vector.owner, NOW)).toBeNull();
    expect((await render(seeded.vector.owner)).status).toBe(403);
    const anonymous = await render(null);
    expect(anonymous.status).toBe(303);
    expect(anonymous.headers.get("location")).toContain("/admin/login");
  });

  it("muestra Suspendido para un taller suspendido", async () => {
    await db
      .update(shopsTable)
      .set({ status: "suspendido" })
      .where(eq(shopsTable.id, seeded.demo.shop.id));
    const html = await (await render({ ...seeded.vector.owner, isPlatformAdmin: true })).text();
    expect(html).toContain("status--suspendido");
    expect(html).toContain("Suspendido");
  });

  it("el menú muestra Plataforma solo con la marca", async () => {
    const withFlag = await (await render({ ...seeded.vector.owner, isPlatformAdmin: true })).text();
    expect(withFlag).toMatch(/<a href="\/plataforma"[^>]*>\s*Plataforma\s*<\/a>/);
    holder.actor = seeded.vector.owner;
    const container = await AstroContainer.create();
    const { default: TallerHome } = await import("../../src/pages/taller/index.astro");
    const plain = await (
      await container.renderToResponse(TallerHome, {
        request: new Request("https://llave15.cl/taller"),
      })
    ).text();
    expect(plain).not.toContain('href="/plataforma"');
  });
});
