import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerContext } from "../../src/server/api/handlers.ts";
import { handleAvailability, handleCreateBooking } from "../../src/server/api/handlers.ts";
import type { BookingScope } from "../../src/server/shops/scope.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { createBookingTestDb, createTestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const NOW = new Date("2026-09-15T15:00:00.000Z");
const availabilityUrl = new URL(
  "https://llave15.cl/api/disponibilidad?desde=2026-09-16&dias=1&modo=taller",
);

function postRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request("https://llave15.cl/api/reservas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "retiro",
      service_date: "2026-09-16",
      start: "10:00",
      nombre: "Javiera Rojas",
      telefono: "+56 9 1111 1111",
      correo: "javiera@ejemplo.cl",
      bicicleta: "Bici de ruta",
      descripcion: "Ajuste de frenos y cambios",
      comuna: "Ñuñoa",
      direccion: "Avenida de prueba 123",
      consentimiento: true,
      turnstile_token: "token-de-prueba",
      ...overrides,
    }),
  });
}

function context(test: TestDb, scope?: BookingScope): HandlerContext {
  return {
    db: test.db,
    now: NOW,
    ip: "203.0.113.8",
    scope,
    fetchFn: vi.fn(async () => Response.json({ success: true })),
  };
}

describe("API pública con la configuración del taller", () => {
  let test: TestDb;
  let vector: BookingScope;
  let demo: BookingScope;

  beforeEach(async () => {
    test = await createTestDb();
    const seeded = await seedTwoShops(test.db);
    vector = seeded.vector.scope;
    demo = seeded.demo.scope;
    return () => test.close();
  });

  it("entrega capacidad 2, horario y bloques de 60 minutos del Taller Demo", async () => {
    const response = await handleAvailability(availabilityUrl, context(test, demo));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      timezone: "America/Santiago",
      modo: "taller",
      capacity: 2,
      days: [
        {
          date: "2026-09-16",
          status: "open",
          holidayName: null,
          used: 0,
          blocks: [
            { start: "10:00", state: "free" },
            { start: "11:00", state: "free" },
            { start: "12:00", state: "free" },
          ],
        },
      ],
    });
  });

  it.each(["Vitacura", undefined])(
    "valida la comuna %s con las comunas del Demo",
    async (comuna) => {
      const ctx = context(test, demo);
      const response = await handleCreateBooking(postRequest({ comuna }), ctx);
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        error: "Revisa los datos del formulario.",
        code: "validation_error",
        fields: { comuna: "Elige Ñuñoa o Providencia." },
      });
      expect(ctx.fetchFn).not.toHaveBeenCalled();
    },
  );

  it("conserva el mensaje de Vector Bikes para una comuna fuera de cobertura", async () => {
    const response = await handleCreateBooking(postRequest(), context(test, vector));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "Revisa los datos del formulario.",
      code: "validation_error",
      fields: { comuna: "Elige Vitacura o Las Condes." },
    });
  });

  it("crea en taller con el alcance y duración del Demo sin cruzar disponibilidad", async () => {
    const ctx = context(test, demo);
    // Los CHECK de retiro del Demo se habilitan recién en BG-11.
    const response = await handleCreateBooking(
      postRequest({ mode: "taller", comuna: undefined, direccion: undefined }),
      ctx,
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      code: "TD-260916-1000",
      service_date: "2026-09-16",
      start: "10:00",
      end: "11:00",
      mode: "taller",
      fee: 0,
    });
    expect(ctx.fetchFn).toHaveBeenCalledTimes(1);
    const own = await handleAvailability(availabilityUrl, ctx);
    const other = await handleAvailability(availabilityUrl, context(test, vector));
    expect(await own.json()).toMatchObject({
      days: [
        {
          used: 1,
          blocks: [
            { start: "10:00", state: "taken" },
            { start: "11:00", state: "free" },
            { start: "12:00", state: "free" },
          ],
        },
      ],
    });
    expect(await other.json()).toMatchObject({ capacity: 4, days: [{ used: 0 }] });
  });

  it("rechaza el retiro deshabilitado en zod, antes de Turnstile", async () => {
    const scope = { ...demo, config: { ...demo.config, pickupEnabled: false } };
    const ctx = context(test, scope);
    const response = await handleCreateBooking(postRequest(), ctx);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "validation_error",
      fields: { mode: expect.any(String) },
    });
    expect(ctx.fetchFn).not.toHaveBeenCalled();
  });

  it("no ofrece bloques de retiro si está deshabilitado", async () => {
    const scope = { ...demo, config: { ...demo.config, pickupEnabled: false } };
    const url = new URL(availabilityUrl);
    url.searchParams.set("modo", "retiro");
    const response = await handleAvailability(url, context(test, scope));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      modo: "retiro",
      capacity: 2,
      days: [{ status: "closed", blocks: [] }],
    });
  });

  it.each([
    { comunas: ["Ñuñoa"], message: "Elige Ñuñoa." },
    { comunas: ["Ñuñoa", "Providencia", "Macul"], message: "Elige Ñuñoa, Providencia o Macul." },
  ])("arma el mensaje desde $comunas", async ({ comunas, message }) => {
    const scope = { ...demo, config: { ...demo.config, pickupComunas: comunas } };
    const response = await handleCreateBooking(
      postRequest({ comuna: "Vitacura" }),
      context(test, scope),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ fields: { comuna: message } });
  });
});

it("usa el único taller cuando el contexto no trae alcance", async () => {
  const test = await createBookingTestDb();
  try {
    const ctx = context(test);
    const availability = await handleAvailability(availabilityUrl, ctx);
    expect(availability.status).toBe(200);
    expect(await availability.json()).toMatchObject({ capacity: 4 });
    const response = await handleCreateBooking(
      postRequest({
        mode: "taller",
        start: "16:30",
        comuna: undefined,
        direccion: undefined,
      }),
      ctx,
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      code: "VB-260916-1630",
      service_date: "2026-09-16",
      start: "16:30",
      end: "17:00",
      mode: "taller",
      fee: 0,
    });
  } finally {
    await test.close();
  }
});
