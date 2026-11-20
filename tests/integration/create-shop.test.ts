import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { shops } from "../../src/server/db/schema-shops.ts";
import { servicePrices, services } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { createShop } from "../../src/server/shops/create-shop.ts";
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
  return { ...original, requireAdmin: async () => holder.actor, realLogin: original.loginAdmin };
});
const auth = (await import("../../src/server/auth/admin-auth.ts")) as unknown as {
  realLogin: typeof import("../../src/server/auth/admin-auth.ts").loginAdmin;
};
const { default: NewShopPage } = await import("../../src/pages/plataforma/talleres/nuevo.astro");

const NOW = new Date("2026-11-20T15:00:00.000Z");
const APP_URL = "https://llave15.cl";
const PASSWORD = "clave-inicial-segura-01";
const weekday = { open: "09:00", close: "18:00" };
const HOURS = {
  "1": weekday,
  "2": weekday,
  "3": weekday,
  "4": weekday,
  "5": weekday,
  "6": null,
  "7": null,
};

let db: AppDb;
let seeded: Awaited<ReturnType<typeof seedTwoShops>>;
let platform: SessionUser;

function input(overrides: Record<string, unknown> = {}) {
  return {
    name: "Taller Nuevo",
    legalName: null,
    rut: null,
    email: "hola@tallernuevo.cl",
    notifyEmail: "avisos@tallernuevo.cl",
    phone: "+56977778888",
    phoneDisplay: "+56 9 7777 8888",
    streetAddress: "Avenida Grecia 100",
    addressShort: "Av. Grecia 100, Ñuñoa",
    locality: "Macul",
    region: "Región Metropolitana",
    mapsUrl: null,
    instagramUrl: null,
    receptionHours: HOURS,
    pickupHours: HOURS,
    dailyCapacity: 3,
    blockMinutes: 45,
    minNoticeMinutes: 60,
    horizonDays: 21,
    pickupEnabled: true,
    pickupFeeClp: 8000,
    pickupComunas: ["Macul", "Peñalolén"],
    slug: "taller-nuevo",
    codePrefix: "TN",
    ownerName: "Dueña Nueva",
    ownerEmail: "duena@tallernuevo.cl",
    ownerPassword: PASSWORD,
    templateShopId: seeded.vector.shop.id,
    ...overrides,
  };
}

async function seedCatalog(branchId: string) {
  const [service] = await db
    .insert(services)
    .values({ branchId, name: "Mantención general", estimatedMinutes: 90 })
    .returning();
  if (!service) throw new Error("Falta servicio");
  await db.insert(servicePrices).values([
    { branchId, serviceId: service.id, bikeType: "mtb", priceClp: 35000 },
    { branchId, serviceId: service.id, bikeType: "ruta", priceClp: 32000 },
  ]);
  await db
    .insert(services)
    .values({ branchId, name: "Servicio retirado", estimatedMinutes: 30, isActive: false });
}

async function shopCount() {
  return (await db.select({ id: shops.id }).from(shops)).length;
}

beforeEach(async () => {
  vi.stubEnv("APP_URL", APP_URL);
  db = (await createTestDb()).db;
  holder.db = db;
  seeded = await seedTwoShops(db);
  platform = { ...seeded.vector.owner, isPlatformAdmin: true };
  await seedCatalog(seeded.vector.branch.id);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createShop", () => {
  it("crea en una transacción el taller, su sucursal, el dueño y el catálogo copiado", async () => {
    const result = await createShop(db, platform, input(), NOW);
    if (!result.ok) throw new Error(JSON.stringify(result));
    const [shop] = await db.select().from(shops).where(eq(shops.id, result.shopId));
    expect(shop).toMatchObject({
      slug: "taller-nuevo",
      status: "activo",
      codePrefix: "TN",
      blockMinutes: 45,
    });
    const [branch] = await db.select().from(branches).where(eq(branches.shopId, result.shopId));
    expect(branch?.name).toBe("Macul");
    const [owner] = await db.select().from(users).where(eq(users.email, "duena@tallernuevo.cl"));
    expect(owner).toMatchObject({ role: "owner", branchId: branch?.id, isPlatformAdmin: false });
    expect(owner?.passwordHash.startsWith("scrypt$")).toBe(true);
    const copied = await db
      .select()
      .from(services)
      .where(eq(services.branchId, branch?.id ?? ""));
    expect(copied.map((service) => service.name)).toEqual(["Mantención general"]);
    const prices = await db
      .select()
      .from(servicePrices)
      .where(eq(servicePrices.branchId, branch?.id ?? ""));
    expect(prices.map((price) => [price.bikeType, price.priceClp]).sort()).toEqual([
      ["mtb", 35000],
      ["ruta", 32000],
    ]);
    expect(prices.every((price) => price.serviceId === copied[0]?.id)).toBe(true);
    const login = await auth.realLogin(db, {
      email: "duena@tallernuevo.cl",
      password: PASSWORD,
      ipHash: "ip-de-prueba",
      now: NOW,
    });
    expect(login).toMatchObject({ ok: true, role: "owner" });
  });

  it.each([
    ["plataforma", "slug"],
    ["taller-demo", "slug"],
    ["Mal Slug", "slug"],
  ])("rechaza el slug %s sin escribir", async (slug, field) => {
    const before = await shopCount();
    const result = await createShop(db, platform, input({ slug }), NOW);
    expect(result).toMatchObject({ ok: false, code: "validation_error" });
    if (result.ok || result.code !== "validation_error") throw new Error("se esperaba un error");
    expect(result.fields[field]).toBeTruthy();
    expect(await shopCount()).toBe(before);
  });

  it("rechaza un prefijo que ya existe", async () => {
    const result = await createShop(db, platform, input({ codePrefix: "VB" }), NOW);
    expect(result).toMatchObject({
      ok: false,
      fields: { codePrefix: "Ese prefijo ya está en uso." },
    });
  });

  it("rechaza el correo de un dueño que ya tiene cuenta en otro taller", async () => {
    const before = await shopCount();
    const result = await createShop(
      db,
      platform,
      input({ ownerEmail: seeded.demo.owner.email }),
      NOW,
    );
    expect(result).toMatchObject({
      ok: false,
      fields: { ownerEmail: "Ese correo ya tiene cuenta." },
    });
    expect(await shopCount()).toBe(before);
  });

  it("rechaza una clave de menos de 12 caracteres", async () => {
    const result = await createShop(db, platform, input({ ownerPassword: "corta" }), NOW);
    expect(result).toMatchObject({ ok: false, code: "validation_error" });
    if (result.ok || result.code !== "validation_error") throw new Error("se esperaba un error");
    expect(result.fields.ownerPassword).toContain("12");
  });

  it("niega el alta a un usuario sin la marca", async () => {
    expect(await createShop(db, seeded.vector.owner, input(), NOW)).toEqual({
      ok: false,
      code: "forbidden",
    });
  });
});

describe("/plataforma/talleres/nuevo", () => {
  async function post(actor: SessionUser, origin: string) {
    holder.actor = actor;
    const body = new URLSearchParams({ name: "Otro", slug: "otro-taller" });
    const container = await AstroContainer.create();
    return container.renderToResponse(NewShopPage, {
      request: new Request(`${APP_URL}/plataforma/talleres/nuevo`, {
        method: "POST",
        headers: { origin, "content-type": "application/x-www-form-urlencoded" },
        body,
      }),
    });
  }

  it("responde 403 sin la marca y con un Origin ajeno, sin escribir", async () => {
    const before = await shopCount();
    expect((await post(seeded.vector.owner, APP_URL)).status).toBe(403);
    expect((await post(platform, "https://ajeno.example")).status).toBe(403);
    expect(await shopCount()).toBe(before);
  });

  it("responde 422 con los campos marcados cuando el formulario no es válido", async () => {
    const response = await post(platform, APP_URL);
    expect(response.status).toBe(422);
    expect(await response.text()).toContain("Revisa los campos marcados.");
  });
});
