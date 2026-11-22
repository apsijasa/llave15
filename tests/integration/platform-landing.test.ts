import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import preactRenderer from "@astrojs/preact/server.js";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { default: HomePage } = await import("../../src/pages/index.astro");

let previousAppUrl: string | undefined;

beforeEach(() => {
  previousAppUrl = process.env.APP_URL;
  process.env.APP_URL = "https://llave15.cl";
});

afterEach(() => {
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
});

async function home(host: string): Promise<{ status: number; html: string; vary: string | null }> {
  const container = await AstroContainer.create({
    astroConfig: { site: "https://vectorbikes.cl" },
  });
  container.addServerRenderer({ name: "@astrojs/preact", renderer: preactRenderer });
  const response = await container.renderToResponse(HomePage, {
    request: new Request(`https://${host}/`, { headers: { host } }),
  });
  return {
    status: response.status,
    html: await response.text(),
    vary: response.headers.get("vary"),
  };
}

describe("portada por dominio", () => {
  it("llave15.cl muestra la landing de Llave 15 con Ingresar y Solicitar demo", async () => {
    const { status, html, vary } = await home("llave15.cl");
    expect(status).toBe(200);
    expect(vary).toContain("Host");
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Cada bicicleta, del ingreso a la entrega.");
    expect(html).toContain('href="/admin/login"');
    expect(html).toContain('href="/demo"');
    expect(html).toContain('class="l15"');
    expect(html).not.toContain("application/ld+json");
    expect(html).not.toContain("Vector Bikes");
    expect(html).toContain("Datos de ejemplo.");
  });

  it("el dominio heredado sigue con la portada de Vector Bikes", async () => {
    const { status, html } = await home("vectorbikes.cl");
    expect(status).toBe(200);
    expect(html).toContain("application/ld+json");
    expect(html).not.toContain("Cada bicicleta, del ingreso a la entrega.");
  });

  it("sin APP_URL todo dominio ve la portada heredada", async () => {
    delete process.env.APP_URL;
    const { html } = await home("llave15.cl");
    expect(html).toContain("application/ld+json");
  });
});

describe("estilos del sitio de Llave 15", () => {
  it("no agregan colores hex: solo variables de tokens.css", () => {
    const css = readFileSync("src/styles/llave15-site.css", "utf8");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toContain("box-shadow");
    expect(css).not.toContain("!important");
  });

  it("los componentes de la landing no traen literales de un taller", () => {
    const files = readdirSync("src/components/llave15").map((file) =>
      join("src/components/llave15", file),
    );
    for (const file of files) {
      if (!statSync(file).isFile()) continue;
      expect(readFileSync(file, "utf8")).not.toMatch(/Vector Bikes|Vitacura|Kennedy/);
    }
  });
});
