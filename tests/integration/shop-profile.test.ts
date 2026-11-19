import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLATFORM } from "../../src/lib/platform.ts";
import { createBooking } from "../../src/server/booking/create-booking.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrderApprovals } from "../../src/server/db/schema-orders.ts";
import { orderTrackingTokens, serviceReports } from "../../src/server/db/schema-reports.ts";
import { shops as shopsTable } from "../../src/server/db/schema-shops.ts";
import { emailBrand, senderFor } from "../../src/server/email/brand.ts";
import {
  profileBySlug,
  profileForBranch,
  profileForCancelToken,
  profileForShareToken,
} from "../../src/server/shops/profile.ts";
import type { ObjectStorage } from "../../src/server/storage/storage.ts";
import { insertBike } from "../../src/server/taller/bikes.ts";
import { customerFormSchema, insertCustomer } from "../../src/server/taller/customers.ts";
import { startReception } from "../../src/server/taller/orders.ts";
import { hashShareToken, newShareToken } from "../../src/server/taller/share-tokens.ts";
import { createTestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const objects = vi.hoisted(() => new Map<string, Buffer>());
const holder = vi.hoisted(() => ({ db: null as AppDb | null }));
vi.mock("../../src/server/db/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Base de prueba no inicializada");
    return holder.db;
  },
}));
vi.mock("../../src/server/storage/storage.ts", async (importOriginal) => {
  const memory: ObjectStorage = {
    put: async (key, body) => {
      objects.set(key, body);
    },
    get: async (key) => objects.get(key) ?? null,
    delete: async (key) => {
      objects.delete(key);
    },
    exists: async (key) => objects.has(key),
  };
  return {
    ...(await importOriginal<typeof import("../../src/server/storage/storage.ts")>()),
    getStorage: async () => memory,
  };
});
const { GET: logoRoute } = await import("../../src/pages/[slug]/logo.ts");

/** Martes 2026-09-15, 12:00 hora local. */
const NOW = new Date("2026-09-15T15:00:00.000Z");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let db: AppDb;
let shops: Awaited<ReturnType<typeof seedTwoShops>>;

async function requestLogo(slug: string) {
  const call = logoRoute as unknown as (context: { params: { slug: string } }) => Promise<Response>;
  return call({ params: { slug } });
}

/** Una orden del Taller Demo, para colgarle los tres enlaces de cliente. */
async function demoOrder() {
  const { demo } = shops;
  const customer = await insertCustomer(
    db,
    demo.branch.id,
    customerFormSchema.parse({ name: "Cliente Demo", phoneE164: "912345678" }),
    NOW,
  );
  if (!customer.ok) throw new Error("Falta el cliente de prueba.");
  const bike = await insertBike(
    db,
    demo.branch.id,
    customer.customer.id,
    { brand: "Trek", model: "Marlin 7", bikeType: "mtb" },
    NOW,
  );
  if (!bike.ok) throw new Error("Falta la bicicleta de prueba.");
  const order = await startReception(
    db,
    demo.owner,
    { customerId: customer.customer.id, bikeId: bike.bike.id, requestedService: "Revisión" },
    NOW,
  );
  if (!order.ok) throw new Error(`Falta la orden de prueba: ${order.code}`);
  return order.orderId;
}

describe("perfil del taller, marca de correo y logo", () => {
  beforeEach(async () => {
    objects.clear();
    const test = await createTestDb();
    db = test.db;
    holder.db = db;
    shops = await seedTwoShops(db);
  });

  it("devuelve el perfil del Taller Demo por su sucursal", async () => {
    const profile = await profileForBranch(db, shops.demo.branch.id);
    expect(profile).toMatchObject({
      shopId: shops.demo.shop.id,
      slug: "taller-demo",
      name: "Taller Demo",
      email: "hola@tallerdemo.cl",
      notifyEmail: "avisos@tallerdemo.cl",
      phoneDisplay: "+56 9 1111 2222",
      addressShort: "Av. Irarrázaval 1000, Ñuñoa",
      instagramHandle: "@tallerdemo",
      logoPath: null,
    });
    expect(profile?.receptionHours["1"]).toEqual({ open: "10:00", close: "13:00" });
    expect(profile?.receptionHours["6"]).toBeNull();
    expect(await profileBySlug(db, "taller-demo")).toEqual(profile);
    expect(await profileBySlug(db, "no-existe")).toBeNull();
  });

  it("resuelve el taller por el token de cancelación y por los tres enlaces de la orden", async () => {
    const { demo } = shops;
    const booking = await createBooking(
      db,
      {
        mode: "taller",
        serviceDate: "2026-09-16",
        start: "10:00",
        customerName: "Cliente Demo",
        phoneE164: "+56933333333",
        email: null,
        bike: "Urbana",
        description: "Ajuste",
        comuna: null,
        address: null,
        ipHash: null,
      },
      NOW,
      demo.scope,
    );
    if (!booking.ok) throw new Error(`Falta la reserva de prueba: ${booking.code}`);
    expect((await profileForCancelToken(db, booking.cancelToken))?.slug).toBe("taller-demo");
    expect(await profileForCancelToken(db, newShareToken())).toBeNull();

    const orderId = await demoOrder();
    const tokens = {
      seguimiento: newShareToken(),
      informe: newShareToken(),
      aprobacion: newShareToken(),
    };
    await db.insert(orderTrackingTokens).values({
      branchId: demo.branch.id,
      workOrderId: orderId,
      tokenHash: hashShareToken(tokens.seguimiento),
    });
    await db.insert(serviceReports).values({
      branchId: demo.branch.id,
      workOrderId: orderId,
      generatedAt: NOW,
      generatedBy: demo.owner.id,
      snapshot: {},
      shareTokenHash: hashShareToken(tokens.informe),
    });
    await db.insert(workOrderApprovals).values({
      branchId: demo.branch.id,
      workOrderId: orderId,
      description: "Cambio de cadena",
      recommendation: "Recomendado",
      priceClp: 15000,
      tokenHash: hashShareToken(tokens.aprobacion),
      createdBy: demo.owner.id,
    });
    for (const kind of ["seguimiento", "informe", "aprobacion"] as const) {
      expect((await profileForShareToken(db, kind, tokens[kind]))?.slug).toBe("taller-demo");
      expect(await profileForShareToken(db, kind, newShareToken())).toBeNull();
    }
  });

  it("arma el remitente y la marca de correo con el taller y Llave 15", async () => {
    const profile = await profileForBranch(db, shops.demo.branch.id);
    if (!profile) throw new Error("Falta el perfil del Taller Demo.");
    expect(senderFor(profile, "Vector Bikes <reservas@send.vectorbikes.cl>")).toBe(
      "Taller Demo · Llave 15 <reservas@send.vectorbikes.cl>",
    );
    expect(senderFor(profile, "reservas@send.vectorbikes.cl")).toBe(
      "Taller Demo · Llave 15 <reservas@send.vectorbikes.cl>",
    );
    expect(emailBrand(profile)).toMatchObject({
      replyTo: "hola@tallerdemo.cl",
      notifyEmail: "avisos@tallerdemo.cl",
      footerLine: "Gestionado con Llave 15",
    });
    expect(PLATFORM.name).toBe("Llave 15");
  });

  it("sirve el logo guardado y responde 404 sin logo o con un slug desconocido o reservado", async () => {
    const key = `shops/${shops.vector.shop.id}/logo.png`;
    objects.set(key, PNG);
    await db
      .update(shopsTable)
      .set({ logoKey: key })
      .where(eq(shopsTable.id, shops.vector.shop.id));
    const found = await requestLogo("vector-bikes");
    expect(found.status).toBe(200);
    expect(found.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(found.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await found.arrayBuffer())).toEqual(PNG);
    expect((await profileForBranch(db, shops.vector.branch.id))?.logoPath).toBe(
      "/vector-bikes/logo",
    );
    expect((await requestLogo("taller-demo")).status).toBe(404);
    expect((await requestLogo("no-existe")).status).toBe(404);
    expect((await requestLogo("taller")).status).toBe(404);
  });
});
