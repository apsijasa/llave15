import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { PLATFORM } from "../../src/lib/platform.ts";

const expectedTokens = {
  "--ground": "#f5f4f1",
  "--surface": "#ffffff",
  "--ink": "#171c22",
  "--ink-2": "#515a64",
  "--steel": "#515a64",
  "--rule": "#d9d9d9",
  "--hatch": "#e3e3df",
  "--on-ink": "#ffffff",
  "--field-border": "#858e97",
  "--logo-filter": "none",
  "--accent": "#ae3718",
  "--accent-hover": "#8d2b13",
  "--brand-on-dark": "#ff774f",
  "--focus": "#195faf",
  "--status-neutral-bg": "#eceff2",
  "--status-neutral-ink": "#48525d",
  "--status-progress-bg": "#e6eef8",
  "--status-progress-ink": "#235285",
  "--status-waiting-bg": "#fff2d9",
  "--status-waiting-ink": "#734800",
  "--status-ready-bg": "#dfefe5",
  "--status-ready-ink": "#1a5d3b",
  "--status-blocking-bg": "#fbe5e2",
  "--status-blocking-ink": "#942b2b",
  "--radius-control": "8px",
  "--radius-card": "12px",
  "--display": '"Inter Variable", Arial, sans-serif',
  "--body": '"Inter Variable", Arial, sans-serif',
  "--mono": '"Inter Variable", Arial, sans-serif',
};
const addedColors =
  "#171c22 #195faf #1a5d3b #235285 #48525d #515a64 #734800 #858e97 #8d2b13 #942b2b #ae3718 #d9d9d9 #dfefe5 #e6eef8 #eceff2 #f5f4f1 #fbe5e2 #ff774f #fff2d9";

function hexColors(css: string): Set<string> {
  return new Set((css.match(/#[0-9a-f]{6}/gi) ?? []).map((color) => color.toLowerCase()));
}

describe("tokens y tipografía Llave 15 (BG-47)", () => {
  it("declara exactamente el mapa de tokens en un único bloque :root.l15", () => {
    const css = readFileSync("src/styles/tokens.css", "utf8");
    const blocks = [...css.matchAll(/:root\.l15\s*\{([^}]+)\}/g)];
    expect(blocks).toHaveLength(1);
    const declarations = (blocks[0]?.[1] ?? "")
      .split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => declaration.split(/:\s*/));
    expect(declarations).toHaveLength(Object.keys(expectedTokens).length);
    expect(Object.fromEntries(declarations)).toEqual(expectedTokens);
  });

  it("excluye Llave 15 de los dos bloques oscuros", () => {
    const css = readFileSync("src/styles/tokens.css", "utf8");
    expect(css).toMatch(
      /@media\s*\(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\):not\(\.l15\)\s*\{/,
    );
    expect(css).toContain(':root[data-theme="dark"]:not(.l15) {');
    expect(css.match(/:not\(\.l15\)/g)).toHaveLength(2);
    expect(css).not.toMatch(/:root(?::not\(\[data-theme="light"\]\)|\[data-theme="dark"\])\s*\{/);
  });

  it("conserva los hex originales y suma exactamente los 19 de la paleta", () => {
    const old = hexColors(
      execFileSync("git", ["show", "8bca898:src/styles/global.css"], { encoding: "utf8" }),
    );
    const current = hexColors(
      readFileSync("src/styles/tokens.css", "utf8") + readFileSync("src/styles/global.css", "utf8"),
    );
    expect([...old].filter((color) => !current.has(color))).toEqual([]);
    expect(
      [...current]
        .filter((color) => !old.has(color))
        .sort()
        .join(" "),
    ).toBe(addedColors);
  });

  it("carga y precarga Inter local sin las fuentes del monocromo", () => {
    const layout = readFileSync("src/layouts/AppLayout.astro", "utf8");
    expect(layout).toContain('import "@fontsource-variable/inter/index.css";');
    expect(layout).toContain(
      'import interLatin from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";',
    );
    expect(layout).toContain(
      '<link rel="preload" as="font" type="font/woff2" crossorigin href={interLatin} />',
    );
    expect(layout).not.toMatch(
      /@fontsource\/michroma|@fontsource-variable\/archivo|@fontsource\/ibm-plex-mono/,
    );
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.dependencies["@fontsource-variable/inter"]).toBe("5.3.0");
    expect(
      existsSync("node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"),
    ).toBe(true);
  });

  it("renderiza la raíz l15, el preload y los cuatro íconos", async () => {
    const { default: AppLayout } = await import("../../src/layouts/AppLayout.astro");
    const container = await AstroContainer.create();
    const html = await container.renderToString(AppLayout, {
      props: { title: "Llave 15" },
      partial: false,
    });
    expect(html).toContain('<html lang="es-CL" class="l15">');
    expect(html).toContain("inter-latin-wght-normal.woff2");
    expect(html.match(/rel="preload"/g)).toHaveLength(1);
    expect(html).toContain(
      '<link rel="icon" type="image/svg+xml" href="/brand/llave15-distintivo.svg">',
    );
    expect(html).toContain(
      '<link rel="icon" type="image/svg+xml" sizes="16x16" href="/brand/llave15-favicon-16.svg">',
    );
    expect(html).toContain(
      '<link rel="icon" type="image/png" sizes="32x32" href="/brand/llave15-favicon-32.png">',
    );
    expect(html).toContain(
      '<link rel="apple-touch-icon" href="/brand/llave15-apple-touch-icon.png">',
    );
    expect(html).not.toContain('href="/favicon.svg"');
    expect(html).not.toContain("/brand/apple-touch-icon.png");
  });

  it("ofrece el descriptor acordado para la plataforma", () => {
    expect(PLATFORM).toHaveProperty(
      "descriptor",
      "Software de gestión para talleres de bicicletas",
    );
  });
});

describe("favicon simplificado de Llave 15", () => {
  it("usa trazos, nombre accesible y solo los dos colores permitidos", () => {
    const svg = readFileSync("public/brand/llave15-favicon-16.svg", "utf8");
    const root = svg.match(/^\s*<svg\b([^>]*)>/)?.[1] ?? "";
    expect(root).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(root).toContain('viewBox="0 0 16 16"');
    expect(root).toContain('role="img"');
    expect(root).toContain('aria-label="Llave 15"');
    expect(svg).toMatch(/^\s*<svg\b[^>]*>\s*<title>Llave 15<\/title>/);
    expect(svg).toMatch(/<path\s[^>]*\bd="[^"]+"/);
    expect(svg).not.toMatch(/<text|<image|<style|<script|font-family/i);
    expect(svg).not.toMatch(/\bhref\s*=|\burl\s*\(|<!DOCTYPE|<!ENTITY|<\?/i);
    const elements = [...svg.matchAll(/<\/?([a-z][\w:-]*)\b/gi)].map((match) => match[1] ?? "");
    expect(elements.every((element) => ["svg", "title", "g", "path"].includes(element))).toBe(true);
    const colors = svg.match(/#[\da-f]+/gi) ?? [];
    expect(new Set(colors)).toEqual(new Set(["#ae3718", "#ffffff"]));
  });

  it("rasteriza un PNG de 16 × 16 píxeles", async () => {
    const svg = readFileSync("public/brand/llave15-favicon-16.svg");
    const png = await sharp(svg).resize({ width: 16 }).png().toBuffer();
    const metadata = await sharp(png).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(16);
    expect(metadata.height).toBe(16);
  });
});

describe("íconos PNG e imagen para compartir de Llave 15", () => {
  it.each([
    ["llave15-favicon-32.png", 32, 32],
    ["llave15-apple-touch-icon.png", 180, 180],
    ["llave15-og.png", 1200, 630],
  ])("%s es un PNG de %i × %i", async (file, width, height) => {
    const metadata = await sharp(readFileSync(`public/brand/${file}`)).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(width);
    expect(metadata.height).toBe(height);
  });

  it("el ícono de inicio de iPhone es opaco", async () => {
    const { isOpaque } = await sharp(
      readFileSync("public/brand/llave15-apple-touch-icon.png"),
    ).stats();
    expect(isOpaque).toBe(true);
  });

  it("solo emite Open Graph cuando el layout recibe la imagen", async () => {
    const { default: AppLayout } = await import("../../src/layouts/AppLayout.astro");
    const container = await AstroContainer.create();
    const image = "https://llave15.cl/brand/llave15-og.png";
    const html = await container.renderToString(AppLayout, {
      props: {
        title: "Llave 15",
        description: "Software de gestión para talleres de bicicletas",
        canonical: "https://llave15.cl/",
        ogImage: image,
      },
      partial: false,
    });
    expect(html).toContain('<meta property="og:type" content="website">');
    expect(html).toContain(`<meta property="og:site_name" content="${PLATFORM.name}">`);
    expect(html).toContain('<meta property="og:title" content="Llave 15">');
    expect(html).toContain('<meta property="og:url" content="https://llave15.cl/">');
    expect(html).toContain(`<meta property="og:image" content="${image}">`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');

    const hidden = await container.renderToString(AppLayout, {
      props: { title: "Llave 15", ogImage: image, noindex: true },
      partial: false,
    });
    expect(hidden).not.toContain('property="og:');
  });
});
