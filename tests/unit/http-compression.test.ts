import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { compressResponse } from "../../src/lib/http-compression.ts";

const BODY = "<p>Orden de trabajo</p>".repeat(200);

function request(acceptEncoding?: string, method = "GET"): Request {
  return new Request("http://localhost/taller", {
    method,
    headers: acceptEncoding ? { "accept-encoding": acceptEncoding } : {},
  });
}

function html(body = BODY, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

describe("compressResponse", () => {
  it("comprime el HTML con gzip y conserva el contenido y el estado", async () => {
    const out = compressResponse(request("gzip, deflate, br"), html(BODY, {}, 422));
    expect(out.status).toBe(422);
    expect(out.headers.get("content-encoding")).toBe("gzip");
    expect(out.headers.get("vary")).toBe("Accept-Encoding");
    expect(out.headers.has("content-length")).toBe(false);
    const bytes = Buffer.from(await out.arrayBuffer());
    expect(bytes.length).toBeLessThan(BODY.length / 5);
    expect(gunzipSync(bytes).toString("utf8")).toBe(BODY);
  });

  it("agrega Accept-Encoding al Vary existente y conserva las demás cabeceras", () => {
    const out = compressResponse(
      request("gzip"),
      html(BODY, { vary: "Cookie", "cache-control": "no-store" }),
    );
    expect(out.headers.get("vary")).toBe("Cookie, Accept-Encoding");
    expect(out.headers.get("cache-control")).toBe("no-store");
  });

  it("comprime JSON, CSV y SVG", () => {
    for (const type of ["application/json", "text/csv; charset=utf-8", "image/svg+xml"]) {
      const out = compressResponse(
        request("gzip"),
        new Response(BODY, { headers: { "content-type": type } }),
      );
      expect(out.headers.get("content-encoding")).toBe("gzip");
    }
  });

  it("no toca la respuesta si el navegador no acepta gzip", () => {
    for (const accept of [undefined, "br", "identity", "gzip;q=0"]) {
      const response = html();
      expect(compressResponse(request(accept), response)).toBe(response);
    }
  });

  it("no comprime imágenes, PDF ni respuestas ya codificadas", () => {
    const cases = [
      new Response(BODY, { headers: { "content-type": "image/jpeg" } }),
      new Response(BODY, { headers: { "content-type": "application/pdf" } }),
      new Response(new TextEncoder().encode(BODY)),
      html(BODY, { "content-encoding": "br" }),
    ];
    for (const response of cases) {
      expect(compressResponse(request("gzip"), response)).toBe(response);
    }
  });

  it("no comprime respuestas sin cuerpo, HEAD ni cuerpos pequeños declarados", () => {
    const redirect = new Response(null, { status: 303, headers: { location: "/taller" } });
    expect(compressResponse(request("gzip"), redirect)).toBe(redirect);
    const head = html();
    expect(compressResponse(request("gzip", "HEAD"), head)).toBe(head);
    const small = html("ok", { "content-length": "2" });
    expect(compressResponse(request("gzip"), small)).toBe(small);
  });
});
