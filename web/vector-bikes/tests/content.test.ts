import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BOOKING_URL, VECTOR_BIKES_SITE } from "../src/content/site.ts";

const root = new URL("..", import.meta.url).pathname;
const read = (path: string) => readFileSync(join(root, path), "utf8");

function sourceFiles(directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

describe("portada de Vector Bikes", () => {
  it("reserva en la página de Vector Bikes en Llave 15", () => {
    expect(BOOKING_URL).toBe("https://llave15.cl/vector-bikes/reservar");
    const home = read("src/components/Home.astro");
    expect(home).toContain('<a href={BOOKING_URL} class="btn">Reservar</a>');
  });

  it("no lleva la isla de reserva ni Turnstile", () => {
    for (const path of sourceFiles("src")) {
      const text = read(path);
      expect(text, path).not.toContain("BookingIsland");
      expect(text, path).not.toContain("challenges.cloudflare.com");
    }
  });

  it("conserva el título, la descripción y los datos estructurados de la portada", () => {
    expect(VECTOR_BIKES_SITE.home.title).toBe(
      "Taller de bicicletas en Vitacura | Mecánica Vector Bikes",
    );
    const layout = read("src/layouts/SiteLayout.astro");
    expect(layout).toContain('"@type": "LocalBusiness"');
    expect(layout).toContain('"@type": "FAQPage"');
    expect(read("src/pages/index.astro")).toContain("export const prerender = true;");
  });

  it("nunca importa código de la plataforma", () => {
    for (const path of sourceFiles("src")) {
      expect(read(path), path).not.toMatch(/from "(\.\.\/)+(\.\.\/)src\//);
    }
  });
});
