import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// El setup del build pide cada archivo con `x-forwarded-host` de cada dominio.
function read(name: string): string {
  return readFileSync(`dist/test-pages/${name}`, "utf8");
}

describe("SEO de llave15.cl en el build", () => {
  it("robots.txt anuncia el sitemap de llave15.cl y nunca el del dominio heredado", () => {
    const robots = read("platform-robots.txt");
    expect(robots).toContain("Sitemap: https://llave15.cl/sitemap-index.xml");
    expect(robots).not.toContain("vectorbikes.cl");
    for (const path of [
      "/admin",
      "/taller",
      "/plataforma",
      "/seguimiento",
      "/informe",
      "/aprobacion",
    ]) {
      expect(robots).toContain(`Disallow: ${path}`);
    }
  });

  it("el sitemap lista solo la landing, /demo y el aviso de Llave 15", () => {
    expect(read("platform-sitemap-index.xml")).toContain(
      "<loc>https://llave15.cl/sitemap-0.xml</loc>",
    );
    const sitemap = read("platform-sitemap-0.xml");
    expect(sitemap).toContain("<loc>https://llave15.cl/</loc>");
    expect(sitemap).toContain("<loc>https://llave15.cl/demo</loc>");
    expect(sitemap).toContain("<loc>https://llave15.cl/aviso-de-privacidad</loc>");
    expect(sitemap.split("<loc>").length - 1).toBe(3);
    expect(sitemap).not.toContain("vectorbikes.cl");
  });

  it("el dominio heredado conserva su robots y su sitemap", () => {
    expect(read("legacy-robots.txt")).toContain(
      "Sitemap: https://vectorbikes.cl/sitemap-index.xml",
    );
    expect(read("legacy-sitemap-index.xml")).toContain(
      "<loc>https://vectorbikes.cl/sitemap-0.xml</loc>",
    );
  });

  it("la landing de Llave 15 declara su canonical en llave15.cl", () => {
    expect(read("platform-home.html")).toContain(
      '<link rel="canonical" href="https://llave15.cl/"',
    );
  });

  it("no quedan robots.txt ni sitemaps estáticos que tapen las rutas por dominio", () => {
    for (const file of ["robots.txt", "sitemap-index.xml", "sitemap-0.xml"]) {
      expect(existsSync(`dist/client/${file}`), file).toBe(false);
    }
  });

  it("la 404 no declara canonical ni og:url", () => {
    const notFound = readFileSync("dist/client/404.html", "utf8");
    expect(notFound).toContain('<meta name="robots" content="noindex"');
    expect(notFound).not.toContain('rel="canonical"');
    expect(notFound).not.toContain('property="og:url"');
  });
});
