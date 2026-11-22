import { execFileSync } from "node:child_process";
import preactRenderer from "@astrojs/preact/server.js";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IslandShop } from "../../src/components/islands/booking-state.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { shops } from "../../src/server/db/schema-shops.ts";
import { VECTOR_BIKES_SITE } from "../../web/vector-bikes/src/content/site.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { createTestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null }));
vi.mock("../../src/server/db/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Base de prueba no inicializada");
    return holder.db;
  },
}));

type Page = "reservar" | "privacidad";
type SerializedValue = [number, unknown];

function revive([tag, value]: SerializedValue): unknown {
  if (tag === 1) return (value as SerializedValue[]).map(revive);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, revive(entry as SerializedValue)]),
    );
  }
  return value;
}

function islandProps(html: string): { siteKey: string; shop: IslandShop } {
  const islands = html.match(/<astro-island\b[^>]*>/g) ?? [];
  expect(islands).toHaveLength(1);
  const island = islands[0]!;
  expect(island).toContain('client="visible"');
  expect(island).toContain("BookingIsland.tsx");
  const encoded = island.match(/\bprops="([^"]*)"/)?.[1];
  expect(encoded).toBeDefined();
  const serialized = JSON.parse(
    encoded!.replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&amp;", "&"),
  );
  return revive([0, serialized]) as { siteKey: string; shop: IslandShop };
}

async function render(page: Page, slug: string): Promise<Response> {
  const { default: component } =
    page === "reservar"
      ? await import("../../src/pages/[slug]/reservar.astro")
      : await import("../../src/pages/[slug]/privacidad.astro");
  const container = await AstroContainer.create();
  container.addServerRenderer({ name: "@astrojs/preact", renderer: preactRenderer });
  container.addClientRenderer({ name: "@astrojs/preact", entrypoint: "@astrojs/preact/client.js" });
  return container.renderToResponse(component, {
    request: new Request(`https://llave15.cl/${slug}/${page}`),
    params: { slug },
    partial: false,
  });
}

describe("páginas públicas de reserva y privacidad por taller", () => {
  let test: TestDb;
  let seeded: Awaited<ReturnType<typeof seedTwoShops>>;

  beforeEach(async () => {
    test = await createTestDb();
    holder.db = test.db;
    seeded = await seedTwoShops(test.db);
    return async () => {
      holder.db = null;
      await test.close();
    };
  });

  it("responde 200 con PublicLayout, un h1 y la isla del Taller Demo", async () => {
    const response = await render("reservar", "taller-demo");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>Reservar — Taller Demo</title>");
    expect(html.match(/<h1\b[^>]*>/g)).toHaveLength(1);
    expect(html).toMatch(/<h1\b[^>]*>[^<]*Taller Demo[^<]*<\/h1>/);
    expect(html).toMatch(/<header\b[^>]*>[\s\S]*?Taller Demo[\s\S]*?<\/header>/);
    expect(html).toMatch(/<main\b[^>]*\bid="contenido"[^>]*>/);
    expect(html).toMatch(/<footer\b[^>]*>[\s\S]*?Taller Demo · Gestionado con Llave 15/);
    expect(islandProps(html)).toEqual({
      siteKey: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? "",
      shop: {
        slug: "taller-demo",
        name: "Taller Demo",
        addressShort: "Av. Irarrázaval 1000, Ñuñoa",
        email: "hola@tallerdemo.cl",
        pickupEnabled: true,
        pickupComunas: ["Ñuñoa", "Providencia"],
        pickupFeeClp: 9000,
        horizonDays: 14,
        blockMinutes: 60,
        codePrefix: "TD",
        privacyHref: "/taller-demo/privacidad",
      },
    });
    expect(html).not.toMatch(/Vector Bikes|Vitacura|Kennedy/);
  });

  it.each<Page>(["reservar", "privacidad"])("oculta talleres desconocidos en %s", async (page) => {
    const response = await render(page, "no-existe");
    expect(response.status).toBe(404);
    expect(await response.text()).not.toMatch(/Taller Demo|Vector Bikes|astro-island/);
  });

  it.each<Page>(["reservar", "privacidad"])("oculta talleres suspendidos en %s", async (page) => {
    await test.db
      .update(shops)
      .set({ status: "suspendido" })
      .where(eq(shops.id, seeded.demo.shop.id));
    const response = await render(page, "taller-demo");
    expect(response.status).toBe(404);
    expect(await response.text()).not.toMatch(/Taller Demo|Vector Bikes|astro-island/);
  });

  it("conserva las props de Vector Bikes salvo el enlace de privacidad", async () => {
    const response = await render("reservar", "vector-bikes");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(islandProps(html)).toEqual({
      siteKey: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? "",
      shop: { ...VECTOR_BIKES_SITE.islandShop, privacyHref: "/vector-bikes/privacidad" },
    });
    expect(html).not.toContain("Taller Demo");
  });

  it("limita los días solicitados al horizonte de un taller menor a 14", async () => {
    await test.db.update(shops).set({ horizonDays: 7 }).where(eq(shops.id, seeded.demo.shop.id));
    const html = await (await render("reservar", "taller-demo")).text();
    expect(islandProps(html).shop.horizonDays).toBe(7);
  });

  it("publica el aviso original con los datos del Taller Demo y noindex", async () => {
    const response = await render("privacidad", "taller-demo");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("<title>Aviso de privacidad — Taller Demo</title>");
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).toContain("Taller Demo, Av. Irarrázaval 1000, Ñuñoa. Contacto:");
    expect(html).toMatch(
      /<a\b[^>]*href="mailto:hola@tallerdemo\.cl"[^>]*>hola@tallerdemo\.cl<\/a>/,
    );
    expect(html).not.toMatch(/Vector Bikes|Vitacura|Kennedy|astro-island/);
    const original = execFileSync("git", ["show", "8bca898:src/pages/privacidad.astro"], {
      encoding: "utf8",
    });
    const article = (text: string) => text.match(/<article\b[^>]*>([\s\S]*?)<\/article>/)![1]!;
    const plainText = (text: string) =>
      text
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const expected = article(original)
      .replaceAll("{SITE.name}", "Taller Demo")
      .replaceAll("{SITE.addressShort}", "Av. Irarrázaval 1000, Ñuñoa")
      .replaceAll("{SITE.email}", "hola@tallerdemo.cl");
    expect(plainText(article(html))).toBe(plainText(expected));
  });

  it("mantiene reservar indexable y sin caché", async () => {
    const response = await render("reservar", "taller-demo");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain('name="robots"');
  });

  it("declara su canonical en el dominio de Llave 15, sin barra ni parámetros", async () => {
    vi.stubEnv("APP_URL", "https://llave15.cl");
    try {
      const html = await (await render("reservar", "taller-demo")).text();
      expect(html).toContain(
        '<link rel="canonical" href="https://llave15.cl/taller-demo/reservar">',
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("la privacidad del taller lleva noindex y ningún canonical", async () => {
    const html = await (await render("privacidad", "taller-demo")).text();
    expect(html).not.toContain('rel="canonical"');
  });
});
