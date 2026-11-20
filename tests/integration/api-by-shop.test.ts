import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerContext } from "../../src/server/api/handlers.ts";
import {
  checkRateLimit,
  handleAvailability,
  handleCreateBooking,
  hashIp,
} from "../../src/server/api/handlers.ts";
import { verifyTurnstile } from "../../src/server/api/turnstile.ts";
import { shops } from "../../src/server/db/schema-shops.ts";
import { bookingRequests, bookings } from "../../src/server/db/schema.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { createBookingTestDb, createTestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const NOW = new Date("2026-09-15T15:00:00.000Z");

function fakeFetch(success: boolean, cdata?: unknown) {
  return vi.fn<typeof fetch>(async () => Response.json({ success, cdata }));
}

function context(test: TestDb): HandlerContext {
  return { db: test.db, now: NOW, ip: "203.0.113.8", fetchFn: fakeFetch(true) };
}

function availability(taller?: string): URL {
  const url = new URL("https://llave15.cl/api/disponibilidad?desde=2026-09-16&dias=1&modo=taller");
  if (taller !== undefined) url.searchParams.set("taller", taller);
  return url;
}

function post(overrides: Record<string, unknown> = {}): Request {
  return new Request("https://llave15.cl/api/reservas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      taller: "taller-demo",
      mode: "taller",
      service_date: "2026-09-16",
      start: "10:00",
      nombre: "Javiera Rojas",
      telefono: "+56 9 1111 1111",
      correo: "javiera@ejemplo.cl",
      bicicleta: "Bici de ruta",
      descripcion: "Ajuste de frenos y cambios",
      consentimiento: true,
      turnstile_token: "token-de-prueba",
      ...overrides,
    }),
  });
}

describe("API pública por slug de taller", () => {
  let test: TestDb;
  let seeded: Awaited<ReturnType<typeof seedTwoShops>>;
  let ctx: HandlerContext;

  beforeEach(async () => {
    test = await createTestDb();
    seeded = await seedTwoShops(test.db);
    ctx = context(test);
    return () => test.close();
  });

  it("resuelve la disponibilidad del Demo antes que el alcance del contexto", async () => {
    const response = await handleAvailability(availability("taller-demo"), {
      ...ctx,
      scope: seeded.vector.scope,
    });
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

  it("crea en la sucursal del slug y avisa después del commit sin cruzar disponibilidad", async () => {
    const onCreated = vi.fn(async () => {
      expect(await test.db.select().from(bookings)).toHaveLength(1);
    });
    const response = await handleCreateBooking(post(), {
      ...ctx,
      scope: seeded.vector.scope,
      onCreated,
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      code: "TD-260916-1000",
      service_date: "2026-09-16",
      start: "10:00",
      end: "11:00",
      mode: "taller",
      fee: 0,
    });
    expect(onCreated).toHaveBeenCalledOnce();
    const [booking] = await test.db.select().from(bookings);
    expect(booking?.branchId).toBe(seeded.demo.branch.id);
    const [attempt] = await test.db.select().from(bookingRequests);
    expect(attempt?.branchId).toBe(seeded.demo.branch.id);
    const own = await handleAvailability(availability("taller-demo"), ctx);
    const other = await handleAvailability(availability(seeded.vector.shop.slug), ctx);
    expect(await own.json()).toMatchObject({ days: [{ used: 1 }] });
    expect(await other.json()).toMatchObject({ capacity: 4, days: [{ used: 0 }] });
  });

  it.each(["no-existe", "taller", "_astro", "Taller Demo", ""])(
    "rechaza el slug %s antes del límite y de la validación sin registrar intentos",
    async (slug) => {
      await test.db.insert(bookingRequests).values(
        Array.from({ length: 5 }, () => ({
          branchId: seeded.demo.branch.id,
          ipHash: hashIp(ctx.ip)!,
          createdAt: NOW,
        })),
      );
      if (slug === "taller") {
        await test.db.update(shops).set({ slug }).where(eq(shops.id, seeded.demo.shop.id));
      }
      const url = availability(slug);
      url.searchParams.set("dias", "40");
      const responses = [
        await handleAvailability(url, ctx),
        await handleCreateBooking(post({ taller: slug, telefono: "inválido" }), {
          ...ctx,
          scope: seeded.demo.scope,
        }),
      ];
      for (const response of responses) {
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({
          error: "No encontramos ese taller.",
          code: "shop_not_found",
        });
      }
      expect(await test.db.select().from(bookingRequests)).toHaveLength(5);
      expect(await test.db.select().from(bookings)).toHaveLength(0);
      expect(ctx.fetchFn).not.toHaveBeenCalled();
    },
  );

  it("oculta el taller suspendido sin registrar intentos", async () => {
    await test.db
      .update(shops)
      .set({ status: "suspendido" })
      .where(eq(shops.id, seeded.demo.shop.id));
    for (const response of [
      await handleAvailability(availability("taller-demo"), ctx),
      await handleCreateBooking(post(), { ...ctx, scope: seeded.demo.scope }),
    ]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: "No encontramos ese taller.",
        code: "shop_not_found",
      });
    }
    expect(await test.db.select().from(bookingRequests)).toHaveLength(0);
    expect(ctx.fetchFn).not.toHaveBeenCalled();
  });

  it("limita por sucursal e IP y conserva el límite global para páginas por token", async () => {
    const rejected = { ...ctx, fetchFn: fakeFetch(false) };
    for (let index = 0; index < 5; index++) {
      expect((await handleCreateBooking(post(), rejected)).status).toBe(403);
    }
    const limited = await handleCreateBooking(post({ telefono: "inválido" }), ctx);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("600");
    expect(await limited.json()).toMatchObject({ code: "rate_limited" });
    expect((await checkRateLimit(ctx))?.status).toBe(429);
    const other = await handleCreateBooking(
      post({ taller: seeded.vector.shop.slug, start: "16:30" }),
      ctx,
    );
    expect(other.status).toBe(201);
    const differentIp = await handleCreateBooking(post(), { ...ctx, ip: "203.0.113.9" });
    expect(differentIp.status).toBe(201);
    const attempts = await test.db.select().from(bookingRequests);
    expect(attempts.filter((row) => row.branchId === seeded.demo.branch.id)).toHaveLength(6);
    expect(attempts.filter((row) => row.branchId === seeded.vector.branch.id)).toHaveLength(1);
  });

  it.each(["otro-taller", ""])(
    "rechaza cdata %s distinto del slug antes de crear la reserva",
    async (cdata) => {
      const onCreated = vi.fn(async () => {});
      const response = await handleCreateBooking(post(), {
        ...ctx,
        fetchFn: fakeFetch(true, cdata),
        onCreated,
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "turnstile_failed" });
      expect(await test.db.select().from(bookings)).toHaveLength(0);
      expect(await test.db.select().from(bookingRequests)).toHaveLength(1);
      expect(onCreated).not.toHaveBeenCalled();
    },
  );

  it.each(["taller-demo", undefined, null, 123])("acepta cdata %s compatible", async (cdata) => {
    const response = await handleCreateBooking(post(), { ...ctx, fetchFn: fakeFetch(true, cdata) });
    expect(response.status).toBe(201);
  });

  it("pide taller con dos talleres en vez de elegir uno o devolver 500", async () => {
    for (const response of [
      await handleAvailability(availability(), ctx),
      await handleCreateBooking(post({ taller: undefined }), ctx),
    ]) {
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        error: "Revisa los datos del formulario.",
        code: "validation_error",
        fields: { taller: "Falta el taller." },
      });
    }
    expect(await test.db.select().from(bookingRequests)).toHaveLength(0);
  });

  it("valida el tipo de taller y el cuerpo estricto sin contar los 422", async () => {
    for (const overrides of [{ taller: 123 }, { inesperado: true }, { telefono: "123" }]) {
      const response = await handleCreateBooking(post(overrides), {
        ...ctx,
        scope: seeded.demo.scope,
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ code: "validation_error" });
    }
    expect(await test.db.select().from(bookingRequests)).toHaveLength(0);
    expect(ctx.fetchFn).not.toHaveBeenCalled();
  });
});

it("conserva ambas respuestas sin taller cuando hay un solo taller", async () => {
  const test = await createBookingTestDb();
  try {
    const ctx = context(test);
    const response = await handleAvailability(availability(), ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ capacity: 4 });
    const created = await handleCreateBooking(post({ taller: undefined, start: "16:30" }), ctx);
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({
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

it.each([false, "network", "invalid", "null"])(
  "Turnstile devuelve un fallo neutro para %s",
  async (failure) => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      if (failure === "network") throw new Error("sin conexión");
      if (failure === "invalid") return new Response("{");
      return Response.json(failure === "null" ? null : { success: false, cdata: "taller-demo" });
    });
    expect(await verifyTurnstile({ token: "prueba", ip: null, secret: "prueba", fetchFn })).toEqual(
      {
        success: false,
        cdata: null,
      },
    );
  },
);
