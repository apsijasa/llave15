import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDb } from "../../src/server/db/client.ts";
import { demoRequests } from "../../src/server/db/schema-platform.ts";
import { users } from "../../src/server/db/schema.ts";
import { consoleOutbox } from "../../src/server/email/transport.ts";
import { createTestDb, type TestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const holder = vi.hoisted(() => ({
  db: null as AppDb | null,
  turnstile: { success: true, cdata: "demo" as string | null },
}));
vi.mock("../../src/server/db/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Base de prueba no inicializada");
    return holder.db;
  },
}));
vi.mock("../../src/server/api/turnstile.ts", () => ({
  verifyTurnstile: async () => holder.turnstile,
}));
const { default: DemoPage } = await import("../../src/pages/demo.astro");

const FORM = {
  nombre: "Paula Rojas",
  taller: "Taller Cordillera",
  correo: "paula@ejemplo.cl",
  telefono: "+56912345678",
  ciudad: "Temuco",
  mecanicos: "1",
  mensaje: "Queremos dejar las planillas.",
  consentimiento: "on",
  "cf-turnstile-response": "token-de-prueba",
};

let test: TestDb;
let seeded: Awaited<ReturnType<typeof seedTwoShops>>;

beforeEach(async () => {
  test = await createTestDb();
  holder.db = test.db;
  holder.turnstile = { success: true, cdata: "demo" };
  seeded = await seedTwoShops(test.db);
  await test.db
    .update(users)
    .set({ isPlatformAdmin: true })
    .where(eq(users.id, seeded.vector.owner.id));
  consoleOutbox.length = 0;
});

afterEach(async () => {
  await test.close();
});

async function post(
  fields: Record<string, string>,
  ip = "203.0.113.7",
  origin = "https://vectorbikes.cl",
) {
  const container = await AstroContainer.create();
  return container.renderToResponse(DemoPage, {
    request: new Request("https://llave15.cl/demo", {
      method: "POST",
      headers: { origin, "x-forwarded-for": ip },
      body: new URLSearchParams(fields),
    }),
  });
}

describe("/demo", () => {
  it("muestra el formulario con consentimiento y sin el botón de demo en la cabecera", async () => {
    const container = await AstroContainer.create();
    const response = await container.renderToResponse(DemoPage, {
      request: new Request("https://llave15.cl/demo"),
    });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('name="consentimiento"');
    expect(html).toContain('href="/aviso-de-privacidad"');
    expect(html).toContain('href="/admin/login"');
    expect(html).not.toContain("Vector Bikes");
  });

  it("guarda la solicitud, avisa a la plataforma, acusa recibo y redirige 303", async () => {
    const response = await post(FORM);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/demo?enviado=1");
    const rows = await test.db.select().from(demoRequests);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    const recipients = consoleOutbox.map((mail) => mail.to).sort();
    expect(recipients).toEqual([seeded.vector.owner.email, "paula@ejemplo.cl"].sort());
    const notice = consoleOutbox.find((mail) => mail.to === seeded.vector.owner.email);
    expect(notice?.subject).toBe("Solicitud de demo: Taller Cordillera");
    expect(notice?.replyTo).toBe("paula@ejemplo.cl");
    expect(notice?.from).toBe("Llave 15 <reservas@send.vectorbikes.cl>");
    expect(notice?.text).toContain("Queremos dejar las planillas.");
    const ack = consoleOutbox.find((mail) => mail.to === "paula@ejemplo.cl");
    expect(ack?.subject).toBe("Recibimos tu solicitud · Llave 15");
    expect(ack?.replyTo).toBe("info@llave15.cl");
    expect(ack?.text).not.toContain("+56912345678");
  });

  it("rechaza sin consentimiento con el error en el campo y no guarda nada", async () => {
    const { consentimiento: _omit, ...withoutConsent } = FORM;
    const response = await post(withoutConsent);
    expect(response.status).toBe(422);
    const html = await response.text();
    expect(html).toContain('id="consentimiento-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(await test.db.select().from(demoRequests)).toHaveLength(0);
    expect(consoleOutbox).toHaveLength(0);
  });

  it("responde 403 si Turnstile falla o trae otro cdata", async () => {
    holder.turnstile = { success: false, cdata: null };
    expect((await post(FORM)).status).toBe(403);
    holder.turnstile = { success: true, cdata: "vector-bikes" };
    expect((await post(FORM)).status).toBe(403);
    expect(await test.db.select().from(demoRequests)).toHaveLength(0);
  });

  it("responde 403 con un origen ajeno", async () => {
    expect((await post(FORM, "203.0.113.7", "https://otro.cl")).status).toBe(403);
  });

  it("limita a tres solicitudes por IP en una hora", async () => {
    for (let i = 0; i < 3; i += 1) expect((await post(FORM)).status).toBe(303);
    expect((await post(FORM)).status).toBe(429);
    expect((await post(FORM, "198.51.100.9")).status).toBe(303);
  });

  it("conserva la solicitud aunque falle el correo", async () => {
    const original = consoleOutbox.push.bind(consoleOutbox);
    const spy = vi.spyOn(consoleOutbox, "push").mockImplementation(() => {
      throw new Error("correo caído");
    });
    const response = await post(FORM);
    spy.mockRestore();
    expect(original).toBeTypeOf("function");
    expect(response.status).toBe(303);
    expect(await test.db.select().from(demoRequests)).toHaveLength(1);
  });
});
