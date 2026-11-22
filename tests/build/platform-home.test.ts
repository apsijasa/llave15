import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// El setup del build pide `/` con `Host: llave15.cl` y `APP_URL=https://llave15.cl` (BG-D52).
const html = readFileSync("dist/test-pages/platform-home.html", "utf8");

describe("landing de Llave 15 construida", () => {
  it("es la landing de la plataforma, con un solo h1 y en es-CL", () => {
    expect(html).toContain('<html lang="es-CL" class="l15"');
    expect(html.split("<h1").length - 1).toBe(1);
    expect(html).toContain("Cada bicicleta, del ingreso a la entrega.");
  });

  it("lleva a Ingresar y a Solicitar demo, y enlaza su aviso de privacidad", () => {
    expect(html).toContain('href="/admin/login"');
    expect(html).toContain('href="/demo"');
    expect(html).toContain('href="/aviso-de-privacidad"');
  });

  it("no trae la portada heredada: ni JSON-LD, ni isla, ni el taller", () => {
    expect(html).not.toContain("application/ld+json");
    expect(html).not.toContain("<astro-island");
    expect(html).not.toContain("Vector Bikes");
  });

  it("usa los íconos de Llave 15", () => {
    expect(html).toContain('href="/brand/llave15-distintivo.svg"');
  });
});
