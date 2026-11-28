import { randomUUID } from "node:crypto";
import type { APIContext } from "astro";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeEach, expect, it, vi } from "vitest";
import { hashPassword, loginAdmin } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";
const holder = vi.hoisted(() => ({ db: null as AppDb | null }));
vi.mock("../../src/server/db/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Base no inicializada");
    return holder.db;
  },
}));
const { GET } = await import("../../src/pages/taller/indicadores/[report].csv.ts");
const { default: Page } = await import("../../src/pages/taller/indicadores.astro");
const NOW = new Date("2026-11-20T15:00:00Z");
const SITE = "https://panel.example.test";
const QUERY = "?desde=2026-11-01&hasta=2026-11-30";
const PASSWORD = "clave-reportes-de-prueba";
let test: TestDb;
let owner: SessionUser;
async function user(role: Role, branchId: string): Promise<SessionUser> {
  const [row] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      name: "Personal",
      email: `${randomUUID()}@example.test`,
      passwordHash: await hashPassword(PASSWORD),
    })
    .returning();
  if (!row) throw new Error("Falta usuario");
  return { ...row, role };
}
async function login(actor = owner) {
  const result = await loginAdmin(test.db, {
    email: actor.email,
    password: PASSWORD,
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!result.ok) throw new Error(result.code);
  return result.token;
}
async function endpoint(token?: string, report = "resumen", query = QUERY) {
  const url = new URL(`${SITE}/taller/indicadores/${report}.csv${query}`);
  const request = new Request(url, {
    headers: token ? { cookie: `vb_admin_session=${token}` } : {},
  });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  try {
    return await GET({
      url,
      request,
      params: { report },
      cookies: { get: () => (token ? { value: token } : undefined) },
      redirect: (location: string, status: number) =>
        new Response(null, { status, headers: { location } }),
    } as unknown as APIContext);
  } finally {
    vi.useRealTimers();
  }
}
beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  const [branch] = await test.db.insert(branches).values({ name: "Sucursal" }).returning();
  if (!branch) throw new Error("Falta sucursal");
  owner = await user("owner", branch.id);
  return async () => {
    holder.db = null;
    await test.close();
  };
});
it.each(["ingresos-egresos", "resumen", "mecanicos"])(
  "descarga %s con cabeceras y BOM",
  async (kind) => {
    const response = await endpoint(await login(), kind);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="indicadores-${kind}-2026-11-01-2026-11-30.csv"`,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect([...new Uint8Array(await response.arrayBuffer()).slice(0, 3)]).toEqual([239, 187, 191]);
  },
);
it("rechaza reporte desconocido y fecha inválida", async () => {
  const token = await login();
  const missing = await endpoint(token, "otro");
  expect(missing.status).toBe(404);
  expect(await missing.json()).toMatchObject({ code: "not_found", error: expect.any(String) });
  const invalid = await endpoint(token, "resumen", "?desde=2026-13-01");
  expect(invalid.status).toBe(422);
  expect(await invalid.json()).toMatchObject({
    code: "validation_error",
    error: expect.any(String),
    fields: expect.any(Object),
  });
});
it.each(["reception", "mechanic"] as const)(
  "rechaza %s incluso con reporte desconocido",
  async (role) => {
    expect((await endpoint(await login(await user(role, owner.branchId)), "otro")).status).toBe(
      403,
    );
  },
);
it("redirige sin sesión preservando ruta y rango", async () => {
  const response = await endpoint();
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    `/admin/login?next=${encodeURIComponent(`/taller/indicadores/resumen.csv${QUERY}`)}`,
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("usa el rango predeterminado sin parámetros", async () => {
  expect(
    (await endpoint(await login(), "resumen", "")).headers.get("content-disposition"),
  ).toContain("2026-11-01-2026-11-20.csv");
});
it("muestra tres enlaces de descarga con el rango vigente", async () => {
  const token = await login();
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  const request = new Request(`${SITE}/taller/indicadores${QUERY}`, {
    headers: { cookie: `vb_admin_session=${token}` },
  });
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  try {
    const html = await container.renderToString(Page, { request });
    expect(html).toContain("Descargar reportes");
    for (const [kind, label] of [
      ["ingresos-egresos", "Ingresos y egresos"],
      ["resumen", "Resumen del período"],
      ["mecanicos", "Por mecánico"],
    ]) {
      expect(html).toContain(
        `/taller/indicadores/${kind}.csv?desde=2026-11-01&amp;hasta=2026-11-30`,
      );
      expect(html).toMatch(new RegExp(`<a[^>]*download[^>]*>${label} \\(CSV\\)</a>`));
    }
    expect(html).toContain("Archivos CSV para Excel, sin datos personales de clientes.");
  } finally {
    vi.useRealTimers();
  }
});
