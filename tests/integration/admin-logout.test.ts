import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { createTestDb, type TestDb } from "../helpers/pglite.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null }));
vi.mock("../../src/server/db/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Base de prueba no inicializada");
    return holder.db;
  },
}));
const { POST } = await import("../../src/pages/admin/logout.ts");

let test: TestDb;
let previousAppUrl: string | undefined;

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  previousAppUrl = process.env.APP_URL;
});

afterEach(async () => {
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
  await test.close();
});

function call(origin: string) {
  const deleted: string[] = [];
  const context = {
    request: new Request("https://llave15.cl/admin/logout", {
      method: "POST",
      headers: { origin },
    }),
    cookies: { get: () => undefined, delete: (name: string) => deleted.push(name) },
    redirect: (location: string, status: number) =>
      new Response(null, { status, headers: { location } }),
  };
  return { deleted, response: POST(context as unknown as Parameters<typeof POST>[0]) };
}

describe("POST /admin/logout", () => {
  it("borra la cookie y vuelve a la home del dominio del sistema", async () => {
    process.env.APP_URL = "https://llave15.cl";
    const { deleted, response } = call("https://llave15.cl");
    const result = await response;
    expect(result.status).toBe(303);
    expect(result.headers.get("location")).toBe("https://llave15.cl/");
    expect(deleted).toEqual([SESSION_COOKIE]);
  });

  it("sin APP_URL vuelve a la home del dominio heredado", async () => {
    delete process.env.APP_URL;
    const result = await call("https://vectorbikes.cl").response;
    expect(result.headers.get("location")).toBe("https://vectorbikes.cl/");
  });

  it("responde 403 con un origen ajeno", async () => {
    process.env.APP_URL = "https://llave15.cl";
    expect((await call("https://otro.cl").response).status).toBe(403);
  });
});
