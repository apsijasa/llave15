import { describe, expect, it } from "vitest";
import {
  robotsTxt,
  type SeoHost,
  sitemapIndexXml,
  sitemapXml,
} from "../../src/server/shops/site-seo.ts";

const LEGACY: SeoHost = {
  platform: false,
  appUrl: "https://llave15.cl",
  siteUrl: "https://vectorbikes.cl",
};
const PLATFORM: SeoHost = { ...LEGACY, platform: true };

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? "");
}

describe("robots.txt por dominio", () => {
  it.each([
    ["heredado", LEGACY],
    ["plataforma", PLATFORM],
  ])("en el dominio %s bloquea todas las rutas privadas", (_name, host) => {
    const robots = robotsTxt(host);
    for (const path of [
      "/admin",
      "/taller",
      "/plataforma",
      "/reservas/cancelar",
      "/aprobacion",
      "/informe",
      "/seguimiento",
    ]) {
      expect(robots).toContain(`Disallow: ${path}\n`);
    }
    expect(robots.startsWith("User-agent: *\n")).toBe(true);
  });

  it("el dominio heredado anuncia su propio sitemap", () => {
    expect(robotsTxt(LEGACY)).toContain("Sitemap: https://vectorbikes.cl/sitemap-index.xml\n");
    expect(robotsTxt(LEGACY)).not.toContain("llave15.cl");
  });

  it("llave15.cl anuncia su propio sitemap y nunca el de vectorbikes.cl", () => {
    expect(robotsTxt(PLATFORM)).toContain("Sitemap: https://llave15.cl/sitemap-index.xml\n");
    expect(robotsTxt(PLATFORM)).not.toContain("vectorbikes.cl");
  });
});

describe("sitemap por dominio", () => {
  it("el índice apunta al sitemap del mismo dominio", () => {
    expect(locs(sitemapIndexXml(LEGACY))).toEqual(["https://vectorbikes.cl/sitemap-0.xml"]);
    expect(locs(sitemapIndexXml(PLATFORM))).toEqual(["https://llave15.cl/sitemap-0.xml"]);
  });

  it("el dominio heredado lista solo la portada y la privacidad, como antes", () => {
    expect(locs(sitemapXml(LEGACY))).toEqual([
      "https://vectorbikes.cl/",
      "https://vectorbikes.cl/privacidad/",
    ]);
  });

  it("llave15.cl lista solo sus páginas comerciales", () => {
    expect(locs(sitemapXml(PLATFORM))).toEqual([
      "https://llave15.cl/",
      "https://llave15.cl/demo",
      "https://llave15.cl/aviso-de-privacidad",
    ]);
  });

  it("es XML de sitemaps válido en su encabezado y espacio de nombres", () => {
    for (const xml of [sitemapIndexXml(PLATFORM), sitemapXml(PLATFORM)]) {
      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
      expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    }
  });

  it("usa el origen sin ruta aunque APP_URL traiga una barra final", () => {
    const host = { ...PLATFORM, appUrl: "https://llave15.cl/" };
    expect(locs(sitemapIndexXml(host))).toEqual(["https://llave15.cl/sitemap-0.xml"]);
  });
});
