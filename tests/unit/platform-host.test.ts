import { describe, expect, it } from "vitest";
import { isPlatformHost } from "../../src/server/shops/host.ts";

const APP = "https://llave15.cl";
const SITE = "https://vectorbikes.cl";

function request(headers: Record<string, string>): Request {
  return new Request("http://127.0.0.1/", { headers });
}

describe("isPlatformHost", () => {
  it("reconoce el dominio de la plataforma con y sin www, puerto o mayúsculas", () => {
    expect(isPlatformHost(request({ host: "llave15.cl" }), APP, SITE)).toBe(true);
    expect(isPlatformHost(request({ host: "www.llave15.cl" }), APP, SITE)).toBe(true);
    expect(isPlatformHost(request({ host: "LLAVE15.CL:443" }), APP, SITE)).toBe(true);
  });

  it("prefiere x-forwarded-host sobre host", () => {
    const viaProxy = request({ host: "interno.replit.app", "x-forwarded-host": "llave15.cl" });
    expect(isPlatformHost(viaProxy, APP, SITE)).toBe(true);
    const legacy = request({ host: "llave15.cl", "x-forwarded-host": "vectorbikes.cl" });
    expect(isPlatformHost(legacy, APP, SITE)).toBe(false);
  });

  it("es falso en el dominio heredado y en cualquier otro", () => {
    expect(isPlatformHost(request({ host: "vectorbikes.cl" }), APP, SITE)).toBe(false);
    expect(isPlatformHost(request({ host: "llave15.cl.evil.com" }), APP, SITE)).toBe(false);
    expect(isPlatformHost(request({}), APP, SITE)).toBe(false);
  });

  it("es siempre falso sin APP_URL o si coincide con PUBLIC_SITE_URL", () => {
    expect(isPlatformHost(request({ host: "llave15.cl" }), undefined, SITE)).toBe(false);
    expect(isPlatformHost(request({ host: "vectorbikes.cl" }), SITE, SITE)).toBe(false);
  });
});
