import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { ACTIONS, can, ROLES } from "../../src/server/auth/permissions.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { shops } from "../../src/server/db/schema-shops.ts";
import { users } from "../../src/server/db/schema.ts";
import { shopSettingsFromForm } from "../../src/server/shops/create-shop.ts";
import { myShop, updateMyShop, uploadMyShopLogo } from "../../src/server/shops/my-shop.ts";
import { handleLogoRequest } from "../../src/server/shops/profile.ts";
import { scopeBySlug } from "../../src/server/shops/scope.ts";
import type { ObjectStorage } from "../../src/server/storage/storage.ts";
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
vi.mock("../../src/server/auth/admin-auth.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/auth/admin-auth.ts")>()),
  requireAdmin: async () => holder.actor,
}));
const { default: MyShopPage } = await import("../../src/pages/taller/mi-taller.astro");

const NOW = new Date("2026-11-20T15:00:00.000Z");
const APP_URL = "https://llave15.cl";
let db: AppDb;
let seeded: Awaited<ReturnType<typeof seedTwoShops>>;

function memoryStorage(): ObjectStorage & { objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    put: async (key, body) => {
      objects.set(key, body);
    },
    get: async (key) => objects.get(key) ?? null,
    delete: async (key) => {
      objects.delete(key);
    },
    exists: async (key) => objects.has(key),
  };
}

/** El formulario de "Mi taller" del Taller Demo con los cambios de la prueba. */
function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const base: Record<string, string> = {
    name: "Taller Demo",
    email: "hola@tallerdemo.cl",
    notifyEmail: "nuevos-avisos@tallerdemo.cl",
    phone: "+56911112222",
    phoneDisplay: "+56 9 1111 2222",
    streetAddress: "Avenida Irarrázaval 1000",
    addressShort: "Av. Irarrázaval 1000, Ñuñoa",
    locality: "Ñuñoa",
    region: "Región Metropolitana",
    dailyCapacity: "3",
    blockMinutes: "60",
    minNoticeMinutes: "60",
    horizonDays: "14",
    pickupFeeClp: "12000",
    pickupComunas: "Ñuñoa, La Reina",
    pickupEnabled: "on",
    "recepcion-1-open": "09:00",
    "recepcion-1-close": "13:00",
    "retiro-1-open": "09:00",
    "retiro-1-close": "11:00",
    slug: "otro-slug",
    codePrefix: "XX",
    ...overrides,
  };
  for (const [name, value] of Object.entries(base)) data.set(name, value);
  return data;
}

async function staff(role: Role): Promise<SessionUser> {
  const [user] = await db
    .insert(users)
    .values({
      branchId: seeded.demo.branch.id,
      role,
      name: `Usuario ${role}`,
      email: `${role}-extra@taller-demo.example`,
      passwordHash: "hash",
    })
    .returning();
  if (!user) throw new Error("Falta usuario");
  return { id: user.id, branchId: user.branchId, role, name: user.name, email: user.email };
}

beforeEach(async () => {
  vi.stubEnv("APP_URL", APP_URL);
  db = (await createTestDb()).db;
  holder.db = db;
  seeded = await seedTwoShops(db);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("updateMyShop", () => {
  it("guarda horarios, capacidad, comunas, tarifa y correo, y la reserva pública los usa", async () => {
    const result = await updateMyShop(db, seeded.demo.owner, shopSettingsFromForm(form()), NOW);
    expect(result).toEqual({ ok: true });
    const shop = await myShop(db, seeded.demo.owner);
    expect(shop).toMatchObject({
      dailyCapacity: 3,
      pickupFeeClp: 12000,
      pickupComunas: ["Ñuñoa", "La Reina"],
      notifyEmail: "nuevos-avisos@tallerdemo.cl",
    });
    expect(shop?.receptionHours["1"]).toEqual({ open: "09:00", close: "13:00" });
    expect(shop?.receptionHours["2"]).toBeNull();
    const scope = await scopeBySlug(db, "taller-demo");
    expect(scope?.config).toMatchObject({ dailyCapacity: 3, pickupFeeClp: 12000 });
    expect(scope?.config.pickupComunas).toEqual(["Ñuñoa", "La Reina"]);
  });

  it("ignora otro slug y otro prefijo", async () => {
    await updateMyShop(db, seeded.demo.owner, shopSettingsFromForm(form()), NOW);
    const shop = await myShop(db, seeded.demo.owner);
    expect(shop).toMatchObject({ slug: "taller-demo", codePrefix: "TD" });
  });

  it("responde 422 cuando un horario abre después de cerrar, sin cambiar la fila", async () => {
    const before = await myShop(db, seeded.demo.owner);
    const result = await updateMyShop(
      db,
      seeded.demo.owner,
      shopSettingsFromForm(form({ "recepcion-1-open": "14:00", "recepcion-1-close": "10:00" })),
      NOW,
    );
    expect(result).toMatchObject({ ok: false, code: "validation_error" });
    if (result.ok || result.code !== "validation_error") throw new Error("se esperaba un error");
    expect(result.fields.receptionHours).toBeTruthy();
    expect(await myShop(db, seeded.demo.owner)).toEqual(before);
  });

  it("guarda el sitio web, lo vacía con un campo en blanco y rechaza lo que no es http(s)", async () => {
    const owner = seeded.demo.owner;
    const save = (websiteUrl: string) =>
      updateMyShop(db, owner, shopSettingsFromForm(form({ websiteUrl })), NOW);
    expect(await save("https://tallerdemo.cl")).toEqual({ ok: true });
    expect((await myShop(db, owner))?.websiteUrl).toBe("https://tallerdemo.cl");
    for (const bad of ["javascript:alert(1)", "ftp://tallerdemo.cl", "tallerdemo"]) {
      const result = await save(bad);
      expect(result, bad).toMatchObject({ ok: false, code: "validation_error" });
      if (result.ok || result.code !== "validation_error") throw new Error("se esperaba un error");
      expect(result.fields.websiteUrl, bad).toBeTruthy();
    }
    expect((await myShop(db, owner))?.websiteUrl).toBe("https://tallerdemo.cl");
    expect(await save("")).toEqual({ ok: true });
    expect((await myShop(db, owner))?.websiteUrl).toBeNull();
  });

  it("solo toca el taller del dueño", async () => {
    const vectorBefore = await myShop(db, seeded.vector.owner);
    await updateMyShop(db, seeded.demo.owner, shopSettingsFromForm(form()), NOW);
    expect(await myShop(db, seeded.vector.owner)).toEqual(vectorBefore);
  });
});

describe("permiso shop.manage y la página", () => {
  it("solo el dueño tiene shop.manage", () => {
    expect(ACTIONS).toContain("shop.manage");
    expect(ROLES.filter((role) => can(role, "shop.manage"))).toEqual(["owner"]);
  });

  it.each(["admin", "reception", "mechanic"] as const)("responde 403 a %s", async (role) => {
    holder.actor = await staff(role);
    const container = await AstroContainer.create();
    const response = await container.renderToResponse(MyShopPage, {
      request: new Request(`${APP_URL}/taller/mi-taller`),
    });
    expect(response.status).toBe(403);
    expect(await updateMyShop(db, holder.actor, shopSettingsFromForm(form()), NOW)).toEqual({
      ok: false,
      code: "forbidden",
    });
  });

  it("muestra el formulario al dueño con su slug y el enlace Mi taller en el menú", async () => {
    holder.actor = seeded.demo.owner;
    const container = await AstroContainer.create();
    const html = await (
      await container.renderToResponse(MyShopPage, {
        request: new Request(`${APP_URL}/taller/mi-taller`),
      })
    ).text();
    expect(html).toContain("/taller-demo/reservar");
    expect(html).toMatch(/<a href="\/taller\/mi-taller"[^>]*>\s*Mi taller\s*<\/a>/);
    expect(html).toContain('enctype="multipart/form-data"');
  });
});

describe("logo", () => {
  it("guarda primero el objeto y después logo_key, y /<slug>/logo lo sirve", async () => {
    const storage = memoryStorage();
    const bytes = await sharp({
      create: { width: 800, height: 400, channels: 3, background: "#ffffff" },
    })
      .jpeg()
      .toBuffer();
    const result = await uploadMyShopLogo(
      db,
      seeded.demo.owner,
      { bytes, type: "image/jpeg" },
      storage,
      NOW,
    );
    expect(result).toEqual({ ok: true, key: `shops/${seeded.demo.shop.id}/logo.png` });
    const [row] = await db.select().from(shops).where(eq(shops.id, seeded.demo.shop.id));
    expect(row?.logoKey).toBe(`shops/${seeded.demo.shop.id}/logo.png`);
    const stored = storage.objects.get(`shops/${seeded.demo.shop.id}/logo.png`);
    expect((await sharp(stored).metadata()).width).toBe(512);
    const response = await handleLogoRequest(db, storage, "taller-demo");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("rechaza un archivo de más de 2 MB o que no es imagen", async () => {
    const storage = memoryStorage();
    const big = Buffer.alloc(2 * 1024 * 1024 + 1);
    expect(
      await uploadMyShopLogo(
        db,
        seeded.demo.owner,
        { bytes: big, type: "image/png" },
        storage,
        NOW,
      ),
    ).toEqual({ ok: false, code: "invalid_logo" });
    expect(
      await uploadMyShopLogo(
        db,
        seeded.demo.owner,
        { bytes: Buffer.from("hola"), type: "image/png" },
        storage,
        NOW,
      ),
    ).toEqual({ ok: false, code: "invalid_logo" });
    expect(storage.objects.size).toBe(0);
  });
});
