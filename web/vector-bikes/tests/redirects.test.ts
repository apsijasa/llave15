import { describe, expect, it } from "vitest";
import { checkRedirects } from "../scripts/check-redirects.ts";
import { ALL } from "../src/pages/[...path].ts";
import { legacyRedirect, redirectStatus } from "../src/lib/redirects.ts";

const SITE = "https://vectorbikes.cl";
const at = (path: string) => new URL(path, SITE);

function call(method: string, path: string): Promise<Response> {
  const request = new Request(at(path), { method });
  // El endpoint solo lee `request`; el resto del contexto de Astro no se usa.
  return Promise.resolve(ALL({ request } as Parameters<typeof ALL>[0]) as Response);
}

describe("legacyRedirect", () => {
  it("lleva las rutas del sistema a Llave 15 conservando ruta y consulta", () => {
    expect(legacyRedirect(at("/seguimiento/abc?utm=x"))).toBe(
      "https://llave15.cl/seguimiento/abc?utm=x",
    );
    for (const path of [
      "/taller",
      "/taller/ordenes/1",
      "/admin",
      "/admin/login?next=%2Ftaller",
      "/informe/t",
      "/aprobacion/t",
    ]) {
      expect(legacyRedirect(at(path))).toBe(`https://llave15.cl${path}`);
    }
    expect(legacyRedirect(at("/reservas/cancelar?token=t"))).toBe(
      "https://llave15.cl/reservas/cancelar?token=t",
    );
  });

  it("deja en el sitio la portada, privacidad y rutas que solo se parecen", () => {
    for (const path of [
      "/",
      "/privacidad",
      "/servicios",
      "/sucursales",
      "/talleres",
      "/reservas",
      "/administracion",
      "/informes",
    ]) {
      expect(legacyRedirect(at(path)), path).toBeNull();
    }
  });

  it("usa 301 para GET y HEAD, 308 para el resto", () => {
    expect(redirectStatus("GET")).toBe(301);
    expect(redirectStatus("HEAD")).toBe(301);
    expect(redirectStatus("POST")).toBe(308);
  });
});

describe("endpoint comodín", () => {
  it("responde 301 a un GET de una orden con la misma consulta", async () => {
    const response = await call("GET", "/taller/ordenes/1?a=b");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://llave15.cl/taller/ordenes/1?a=b");
  });

  it("responde 308 a un POST de cancelación", async () => {
    const response = await call("POST", "/reservas/cancelar?token=t");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://llave15.cl/reservas/cancelar?token=t");
  });

  it("responde 404 a cualquier otra ruta", async () => {
    expect((await call("GET", "/no-existe")).status).toBe(404);
  });
});

describe("check-redirects", () => {
  it("acepta un sitio que redirige bien y marca uno que no", async () => {
    const good: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (["/", "/privacidad", "/servicios", "/sucursales"].includes(url.pathname))
        return new Response("", { status: 200 });
      return call("GET", `${url.pathname}${url.search}`);
    };
    const checks = await checkRedirects(SITE, good);
    expect(checks.every((check) => check.ok)).toBe(true);
    const broken: typeof fetch = async () => new Response("", { status: 200 });
    expect((await checkRedirects(SITE, broken)).some((check) => !check.ok)).toBe(true);
  });
});
