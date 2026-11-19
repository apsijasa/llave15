import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";

const originalCss = execFileSync("git", ["show", "8bca898:src/styles/global.css"], {
  encoding: "utf8",
});
const originalTokens = `${originalCss.slice(
  originalCss.indexOf(":root {"),
  originalCss.indexOf("\n\n* {"),
)}\n`;
const profile = {
  name: "Taller Demo",
  logoPath: null,
  addressShort: "Calle de Prueba 123, Santiago",
  email: "contacto@tallerdemo.test",
};

function hexColors(css: string): string[] {
  return [...new Set(css.match(/#[0-9A-Fa-f]{6}/g))].sort();
}

function expectNoLandingContent(html: string): void {
  expect(html).not.toContain("application/ld+json");
  expect(html).not.toContain("FAQPage");
  expect(html).not.toContain("Preguntas frecuentes");
  expect(html).not.toContain("wordmark");
  expect(html).not.toContain("Vector Bikes");
  expect(html).not.toContain('property="og:');
}

describe("tokens de diseño", () => {
  it("copia literalmente los tres bloques originales y solo los reemplaza por el import", () => {
    const tokens = readFileSync("src/styles/tokens.css", "utf8");
    const global = readFileSync("src/styles/global.css", "utf8");

    expect(tokens).toBe(originalTokens);
    expect(global).toBe(
      originalCss
        .replace(`${originalTokens}\n`, "")
        .replace(
          '@import "tailwindcss/utilities.css" layer(utilities);',
          '@import "tailwindcss/utilities.css" layer(utilities);\n@import "./tokens.css";',
        ),
    );
  });

  it("conserva exactamente el conjunto de hex del CSS original", () => {
    const css = ["src/styles/global.css", "src/styles/tokens.css"]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(hexColors(css)).toEqual(hexColors(originalCss));
  });
});

describe("AppLayout", () => {
  it("renderiza la raíz, metadatos y contenido sin elementos de la portada", async () => {
    const { default: AppLayout } = await import("../../src/layouts/AppLayout.astro");
    const container = await AstroContainer.create();
    const html = await container.renderToString(AppLayout, {
      props: { title: "Órdenes — Llave 15", description: "Gestión del taller" },
      slots: { default: "<h1>Órdenes</h1>" },
      partial: false,
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="es-CL">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1"');
    expect(html).toContain('name="color-scheme" content="light dark"');
    expect(html).toContain("<title>Órdenes — Llave 15</title>");
    expect(html).toContain('name="description" content="Gestión del taller"');
    expect(html).toContain("archivo-latin-wght-normal.woff2");
    expect(html).toContain("michroma-latin-400-normal.woff2");
    expect(html.match(/rel="preload"/g)).toHaveLength(2);
    expect(html).toContain("<h1>Órdenes</h1>");
    expect(html).not.toContain('name="robots"');
    expectNoLandingContent(html);
  });

  it("permite noindex y omite la descripción cuando no viene", async () => {
    const { default: AppLayout } = await import("../../src/layouts/AppLayout.astro");
    const container = await AstroContainer.create();
    const html = await container.renderToString(AppLayout, {
      props: { title: "Ingreso — Llave 15", noindex: true },
    });

    expect(html).toContain('name="robots" content="noindex"');
    expect(html).not.toContain('name="description"');
  });
});

describe("PublicLayout", () => {
  it("muestra el perfil sin logo, el pie de plataforma y noindex por defecto", async () => {
    const { default: PublicLayout } = await import("../../src/layouts/PublicLayout.astro");
    const container = await AstroContainer.create();
    const html = await container.renderToString(PublicLayout, {
      props: { title: "Seguimiento — Taller Demo", description: "Estado de tu bici", profile },
      slots: { default: "<h1>Tu bicicleta</h1>" },
    });

    expect(html).toMatch(/<header\b[^>]*>[\s\S]*?Taller Demo[\s\S]*?<\/header>/);
    expect(html).not.toContain("<img");
    expect(html).toMatch(/<main\b[^>]*>\s*<h1>Tu bicicleta<\/h1>\s*<\/main>/);
    expect(html).toMatch(/<footer\b[^>]*>[\s\S]*?Taller Demo[\s\S]*?<\/footer>/);
    expect(html).toContain(profile.addressShort);
    expect(html).toContain(`href="mailto:${profile.email}"`);
    expect(html).toMatch(/<footer\b[^>]*>[\s\S]*?Gestionado con Llave 15[\s\S]*?<\/footer>/);
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).toContain("<title>Seguimiento — Taller Demo</title>");
    expect(html).toContain('name="description" content="Estado de tu bici"');
    expectNoLandingContent(html);
  });

  it("usa el logo del perfil con nombre accesible y permite desactivar noindex", async () => {
    const { default: PublicLayout } = await import("../../src/layouts/PublicLayout.astro");
    const container = await AstroContainer.create();
    const html = await container.renderToString(PublicLayout, {
      props: {
        title: "Reservar — Taller Demo",
        profile: { ...profile, logoPath: "/taller-demo/logo" },
        noindex: false,
      },
    });

    expect(html).toMatch(
      /<header\b[^>]*>[\s\S]*?<img[^>]*src="\/taller-demo\/logo"[^>]*alt="Taller Demo"/,
    );
    expect(html).not.toContain('name="robots"');
    expectNoLandingContent(html);
  });
});
