import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BIKE_TYPES,
  BOOKING_URL,
  BRANCHES,
  SERVICE_PRICES,
  VECTOR_BIKES_SITE,
} from "../src/content/site.ts";
import { formatClp } from "../src/lib/format.ts";

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

describe("servicios y precios", () => {
  it("lista los ocho servicios del catálogo con precios enteros y positivos", () => {
    expect(SERVICE_PRICES).toHaveLength(8);
    const keys = new Set(BIKE_TYPES.map((type) => type.key));
    expect(keys).toEqual(new Set(["mtb", "ruta", "gravel", "urbana", "ebike"]));
    for (const service of SERVICE_PRICES) {
      for (const [key, price] of Object.entries(service.prices)) {
        expect(keys.has(key as never), `${service.name} ${key}`).toBe(true);
        expect(Number.isInteger(price) && price > 0, `${service.name} ${key}`).toBe(true);
      }
    }
    expect(new Set(SERVICE_PRICES.map((service) => service.name)).size).toBe(8);
  });

  it("muestra los montos en pesos chilenos y Consultar donde no hay precio", () => {
    expect(formatClp(54900)).toBe("$54.900");
    expect(formatClp(15000)).toBe("$15.000");
    expect(formatClp(500)).toBe("$500");
    const page = read("src/pages/servicios.astro");
    expect(page).toContain("export const prerender = true;");
    expect(page).toContain("Consultar");
    expect(page).toContain("href={BOOKING_URL}");
  });

  it("enlaza la página desde el menú, el pie y la portada", () => {
    const layout = read("src/layouts/SiteLayout.astro");
    expect(layout.match(/href="\/servicios"/g)).toHaveLength(2);
    expect(read("src/components/Home.astro")).toContain('href="/servicios"');
  });
});

describe("sucursales", () => {
  it("muestra Vitacura y Santiago con dirección, teléfono y mapa", () => {
    expect(BRANCHES.map((branch) => branch.name)).toEqual(["Vitacura", "Santiago"]);
    const santiago = BRANCHES[1]!;
    expect(santiago).toMatchObject({
      streetAddress: "Chiloé 1927",
      comuna: "Santiago",
      phone: "+56976234264",
    });
    for (const branch of BRANCHES) {
      expect(branch.phone, branch.name).toMatch(/^\+569\d{8}$/);
      expect(branch.mapsUrl, branch.name).toMatch(/^https:\/\/www\.google\.com\/maps\//);
    }
    const page = read("src/pages/sucursales.astro");
    expect(page).toContain("export const prerender = true;");
    expect(page).toContain("href={BOOKING_URL}");
  });

  it("enlaza la página desde el menú, el pie y la portada", () => {
    const layout = read("src/layouts/SiteLayout.astro");
    expect(layout.match(/href="\/sucursales"/g)).toHaveLength(2);
    expect(read("src/components/Home.astro")).toContain('href="/sucursales"');
  });
});
