import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const variants = [
  {
    name: "distintivo",
    viewBox: "0 0 40 40",
    colors: ["#ae3718", "#ffffff"],
    width: 24,
  },
  {
    name: "firma",
    viewBox: "0 0 176 40",
    colors: ["#ae3718", "#ffffff", "#171c22"],
    width: 132,
  },
  {
    name: "firma-invertida",
    viewBox: "0 0 176 40",
    colors: ["#ff774f", "#171c22", "#ffffff"],
    width: 132,
  },
  {
    name: "firma-mono",
    viewBox: "0 0 176 40",
    colors: ["#171c22", "#ffffff"],
    width: 132,
  },
];

function readMark(name: string) {
  return readFileSync(new URL(`../../public/brand/llave15-${name}.svg`, import.meta.url), "utf8");
}

describe.each(variants)("marca de Llave 15: $name", ({ name, viewBox, colors, width }) => {
  it("declara el lienzo y el nombre accesible, con el título como primer hijo", () => {
    const svg = readMark(name);
    const root = svg.match(/^\s*<svg\b([^>]*)>/)?.[1] ?? "";
    expect(root).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(root).toContain(`viewBox="${viewBox}"`);
    expect(root).toContain('role="img"');
    expect(root).toContain('aria-label="Llave 15"');
    expect(svg).toMatch(/^\s*<svg\b[^>]*>\s*<title>Llave 15<\/title>/);
  });

  it("dibuja las letras en trazos sin fuentes, imágenes ni referencias externas", () => {
    const svg = readMark(name);
    expect(svg).toMatch(/<path\s[^>]*\bd="[^"]+"/);
    expect(svg).not.toMatch(/<text|<image|<style|<script|font-family/i);
    expect(svg).not.toMatch(/\bhref\s*=|\burl\s*\(|<!DOCTYPE|<!ENTITY|<\?/i);
    const elements = [...svg.matchAll(/<\/?([a-z][\w:-]*)\b/gi)].map((match) => match[1] ?? "");
    expect(elements.every((element) => ["svg", "title", "g", "path"].includes(element))).toBe(true);
  });

  it("usa únicamente los hex en minúsculas de su variante", () => {
    const hex = readMark(name).match(/#[\da-f]+/gi) ?? [];
    expect(hex.length).toBeGreaterThan(0);
    for (const color of hex) {
      expect(color).toBe(color.toLowerCase());
      expect(colors).toContain(color);
    }
    expect(new Set(hex)).toEqual(new Set(colors));
  });

  it("rasteriza un PNG al ancho mínimo de uso", async () => {
    const png = await sharp(Buffer.from(readMark(name)))
      .resize({ width })
      .png()
      .toBuffer();
    const metadata = await sharp(png).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(width);
    expect(metadata.height).toBe(width === 24 ? 24 : 30);
  });
});
