import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { demoRequests } from "../../src/server/db/schema-platform.ts";
import { createDemoRequest, demoRequestSchema } from "../../src/server/shops/demo-requests.ts";
import { createTestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const holder = vi.hoisted(() => ({ db: null as AppDb | null, actor: null as SessionUser | null }));
vi.mock("../../src/server/db/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Base de prueba no inicializada");
    return holder.db;
  },
}));
vi.mock("../../src/server/auth/admin-auth.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/auth/admin-auth.ts")>()),
  requireAdmin: async () => holder.actor,
}));
const { default: RequestsPage } = await import("../../src/pages/plataforma/solicitudes.astro");

const NOW = new Date("2026-11-21T15:00:00.000Z");
let seeded: Awaited<ReturnType<typeof seedTwoShops>>;
let requestId: string;

beforeEach(async () => {
  holder.db = (await createTestDb()).db;
  seeded = await seedTwoShops(holder.db);
  const input = demoRequestSchema.parse({
    nombre: "Paula Rojas",
    taller: "Taller Cordillera",
    correo: "paula@ejemplo.cl",
    telefono: "+56912345678",
    ciudad: "Temuco",
    mecanicos: "4+",
    mensaje: "",
    consentimiento: "on",
  });
  const created = await createDemoRequest(holder.db, input, null, NOW);
  if (!created.ok) throw new Error(created.code);
  requestId = created.request.id;
});

async function render(actor: SessionUser | null, init?: RequestInit): Promise<Response> {
  holder.actor = actor;
  const container = await AstroContainer.create();
  return container.renderToResponse(RequestsPage, {
    request: new Request("https://llave15.cl/plataforma/solicitudes", init),
  });
}

describe("/plataforma/solicitudes", () => {
  it("lista las solicitudes al administrador de plataforma", async () => {
    const response = await render({ ...seeded.vector.owner, isPlatformAdmin: true });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const html = await response.text();
    expect(html).toContain("Taller Cordillera");
    expect(html).toContain("paula@ejemplo.cl");
    expect(html).toContain("4 o más");
    expect(html).toContain("Nueva");
  });

  it("responde 403 sin la marca y 303 sin sesión", async () => {
    expect((await render(seeded.vector.owner)).status).toBe(403);
    const anonymous = await render(null);
    expect(anonymous.status).toBe(303);
    expect(anonymous.headers.get("location")).toContain("/admin/login");
  });

  it("cambia el estado por POST y redirige 303", async () => {
    const admin = { ...seeded.vector.owner, isPlatformAdmin: true };
    const response = await render(admin, {
      method: "POST",
      headers: { origin: "https://vectorbikes.cl" },
      body: new URLSearchParams({ id: requestId, status: "contactada" }),
    });
    expect(response.status).toBe(303);
    const [row] = await holder.db!.select().from(demoRequests);
    expect(row?.status).toBe("contactada");
  });

  it("rechaza el POST sin la marca o con un origen ajeno, sin cambiar la fila", async () => {
    const body = () => new URLSearchParams({ id: requestId, status: "descartada" });
    const plain = await render(seeded.vector.owner, {
      method: "POST",
      headers: { origin: "https://vectorbikes.cl" },
      body: body(),
    });
    expect(plain.status).toBe(403);
    const foreign = await render(
      { ...seeded.vector.owner, isPlatformAdmin: true },
      { method: "POST", headers: { origin: "https://otro.cl" }, body: body() },
    );
    expect(foreign.status).toBe(403);
    const [row] = await holder.db!.select().from(demoRequests);
    expect(row?.status).toBe("nueva");
  });
});
