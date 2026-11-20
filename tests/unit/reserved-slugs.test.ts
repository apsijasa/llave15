import { readdirSync } from "node:fs";
import { extname } from "node:path";
import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS, slugSchema } from "../../src/server/shops/slugs.ts";

const expectedReservedSlugs = [
  "taller",
  "admin",
  "api",
  "seguimiento",
  "informe",
  "aprobacion",
  "reservas",
  "privacidad",
  "plataforma",
  "brand",
  "_astro",
  "_image",
  "_server-islands",
  "favicon",
  "robots",
  "sitemap-index",
  "sitemap-0",
  "404",
  "500",
  "index",
  "www",
  "app",
  "send",
  "mail",
  "logo",
  "ingresar",
];

describe("slugs reservados", () => {
  it("reserva exactamente la lista del blueprint", () => {
    expect(RESERVED_SLUGS).toEqual(expectedReservedSlugs);
  });

  it.each(expectedReservedSlugs)("rechaza %s con el mensaje de reservado", (slug) => {
    const result = slugSchema.safeParse(slug);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Se aceptó un slug reservado.");
    expect(result.error.issues[0]?.message).toBe("Ese nombre está reservado.");
  });

  it.each([
    "Taller Demo",
    "ab",
    "-demo",
    "demo-",
    "taller--demo",
    "demo_taller",
    "ábc",
    "",
    "a".repeat(41),
  ])("rechaza el formato o largo inválido: %s", (slug) => {
    expect(slugSchema.safeParse(slug).success).toBe(false);
  });

  it.each(["taller-demo", "abc", "123", "demo-123", "a".repeat(40)])("acepta %s", (slug) => {
    expect(slugSchema.parse(slug)).toBe(slug);
  });

  it.each(["src/pages/", "public/"])(
    "reserva todas las entradas de primer nivel de %s",
    (directory) => {
      const entries = readdirSync(new URL(`../../${directory}`, import.meta.url));
      for (const entry of entries) {
        if (directory === "src/pages/" && entry.startsWith("[")) continue;
        const slug = entry.slice(0, entry.length - extname(entry).length);
        expect(RESERVED_SLUGS, `${directory}${entry}`).toContain(slug);
      }
    },
  );
});
