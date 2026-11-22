import { afterEach, describe, expect, it, vi } from "vitest";
import { passesTurnstile, verifyTurnstile } from "../../src/server/api/turnstile.ts";

function fakeFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

type ConsoleSpy = { mock: { calls: unknown[][] } };

function loggedLines(spy: ConsoleSpy): Record<string, unknown>[] {
  return spy.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);
}

const ARGS = { token: "token-secreto-del-widget", ip: "203.0.113.7", secret: "clave-secreta" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("verifyTurnstile registra el motivo del rechazo", () => {
  it("con success false registra los códigos de error, el estado y el hostname", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await verifyTurnstile({
      ...ARGS,
      fetchFn: fakeFetch(200, {
        success: false,
        "error-codes": ["invalid-input-secret"],
        hostname: "llave15.cl",
      }),
    });
    expect(result).toEqual({ success: false, cdata: null });
    const [line] = loggedLines(spy);
    expect(line).toMatchObject({
      level: "error",
      event: "turnstile.rejected",
      status: 200,
      errorCodes: ["invalid-input-secret"],
      hostname: "llave15.cl",
    });
  });

  it("nunca registra el token, la clave secreta ni la IP", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await verifyTurnstile({
      ...ARGS,
      fetchFn: fakeFetch(200, { success: false, "error-codes": ["timeout-or-duplicate"] }),
    });
    const raw = spy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(raw).not.toContain(ARGS.token);
    expect(raw).not.toContain(ARGS.secret);
    expect(raw).not.toContain(ARGS.ip);
  });

  it("descarta códigos que no son texto y limita la cantidad", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const codes = [1, "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];
    await verifyTurnstile({
      ...ARGS,
      fetchFn: fakeFetch(200, { success: false, "error-codes": codes }),
    });
    const [line] = loggedLines(spy);
    expect(line?.errorCodes).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
  });

  it("con un cuerpo que no es JSON registra el error de red", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchFn = vi.fn(async () => new Response("<html>", { status: 502 })) as typeof fetch;
    expect(await verifyTurnstile({ ...ARGS, fetchFn })).toEqual({ success: false, cdata: null });
    const [line] = loggedLines(spy);
    expect(line?.event).toBe("turnstile.error");
  });

  it("con success true no registra nada", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await verifyTurnstile({
      ...ARGS,
      fetchFn: fakeFetch(200, { success: true, cdata: "vector-bikes" }),
    });
    expect(result).toEqual({ success: true, cdata: "vector-bikes" });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("passesTurnstile", () => {
  it("acepta el cdata esperado o ausente", () => {
    expect(passesTurnstile({ success: true, cdata: "vector-bikes" }, "vector-bikes")).toBe(true);
    expect(passesTurnstile({ success: true, cdata: null }, "vector-bikes")).toBe(true);
  });

  it("rechaza sin verificación o con fallo, sin registrar de nuevo", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(passesTurnstile(false, "vector-bikes")).toBe(false);
    expect(passesTurnstile({ success: false, cdata: null }, "vector-bikes")).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("rechaza y registra un cdata distinto del esperado", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(passesTurnstile({ success: true, cdata: "otro-taller" }, "vector-bikes")).toBe(false);
    const [line] = loggedLines(spy);
    expect(line).toMatchObject({
      event: "turnstile.cdata_mismatch",
      expected: "vector-bikes",
      received: "otro-taller",
    });
  });
});
