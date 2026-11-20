import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnvError, getAppEnv, getSiteEnv } from "../../src/lib/env.ts";
import { isAllowedOrigin } from "../../src/server/api/handlers.ts";
import { sessionCookieOptions } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import { createBooking } from "../../src/server/booking/create-booking.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { cancelUrlFor, notifyBookingCreated } from "../../src/server/email/notifications.ts";
import type { EmailMessage } from "../../src/server/email/transport.ts";
import { approvalLink } from "../../src/server/taller/approvals.ts";
import { buildLabel } from "../../src/server/taller/label.ts";
import { ensureTrackingLink } from "../../src/server/taller/tracking.ts";
import { createBookingTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const APP_URL = "https://llave15.cl";
const LEGACY_URL = "https://vectorbikes.cl";
const NOW = new Date("2026-09-15T15:00:00Z");
const holder = vi.hoisted(() => ({ db: null as AppDb | null, actor: null as SessionUser | null }));

vi.mock("../../src/server/db/client.ts", async (original) => ({
  ...(await original<typeof import("../../src/server/db/client.ts")>()),
  getDb: () => {
    if (!holder.db) throw new Error("Falta la base de prueba.");
    return holder.db;
  },
}));
vi.mock("../../src/server/auth/admin-auth.ts", async (original) => ({
  ...(await original<typeof import("../../src/server/auth/admin-auth.ts")>()),
  requireAdmin: async () => holder.actor,
}));
vi.mock("../../src/server/storage/storage.ts", async (original) => ({
  ...(await original<typeof import("../../src/server/storage/storage.ts")>()),
  getStorage: async () => ({ get: async () => null }),
}));

const { default: ReportPage } = await import("../../src/pages/taller/ordenes/[id]/informe.astro");

beforeEach(() => {
  vi.stubEnv("APP_URL", APP_URL);
  vi.stubEnv("PUBLIC_SITE_URL", LEGACY_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const post = (origin?: string) =>
  new Request(`${APP_URL}/admin/login`, {
    method: "POST",
    headers: origin === undefined ? {} : { origin },
  });

describe("APP_URL y compatibilidad del entorno", () => {
  it("prefiere APP_URL y conserva getSiteEnv sin cambios", () => {
    const source = { APP_URL, PUBLIC_SITE_URL: LEGACY_URL };
    expect(getAppEnv(source)).toEqual({ APP_URL });
    expect(getAppEnv({ APP_URL })).toEqual({ APP_URL });
    expect(getSiteEnv(source)).toEqual({ PUBLIC_SITE_URL: LEGACY_URL });
    expect(getAppEnv()).toEqual({ APP_URL });
  });

  it.each([undefined, ""])("sin APP_URL (%s) usa PUBLIC_SITE_URL", (value) => {
    expect(getAppEnv({ APP_URL: value, PUBLIC_SITE_URL: LEGACY_URL })).toEqual({
      APP_URL: LEGACY_URL,
    });
    vi.stubEnv("APP_URL", value);
    expect(getAppEnv()).toEqual({ APP_URL: LEGACY_URL });
    expect(isAllowedOrigin(post(LEGACY_URL))).toBe(true);
    expect(isAllowedOrigin(post(APP_URL))).toBe(false);
  });

  it("rechaza APP_URL inválida y nombra la variable sin revelar el valor", () => {
    const invalid = () => getAppEnv({ APP_URL: "invalida", PUBLIC_SITE_URL: LEGACY_URL });
    expect(invalid).toThrow(EnvError);
    expect(invalid).toThrow("APP_URL");
    expect(invalid).not.toThrow("invalida");
    expect(() => getAppEnv({})).toThrow("PUBLIC_SITE_URL");
  });
});

describe("CSRF durante la convivencia", () => {
  it.each([APP_URL, "https://www.llave15.cl", LEGACY_URL, "https://www.vectorbikes.cl"])(
    "acepta %s por entorno y con ambos argumentos explícitos",
    (origin) => {
      expect(isAllowedOrigin(post(origin))).toBe(true);
      expect(isAllowedOrigin(post(origin), APP_URL, LEGACY_URL)).toBe(true);
      expect(
        isAllowedOrigin(post(origin), "https://www.llave15.cl", "https://www.vectorbikes.cl"),
      ).toBe(true);
    },
  );

  it("una URL explícita sin legacyUrl acepta solo su propio origen", () => {
    expect(isAllowedOrigin(post(APP_URL), APP_URL)).toBe(true);
    expect(isAllowedOrigin(post("https://www.llave15.cl"), APP_URL)).toBe(true);
    expect(isAllowedOrigin(post(LEGACY_URL), APP_URL)).toBe(false);
    expect(isAllowedOrigin(post(APP_URL), LEGACY_URL)).toBe(false);
  });

  it.each([
    undefined,
    "",
    "null",
    "basura",
    "https://otro.example",
    "https://llave15.cl.evil.example",
    "http://llave15.cl",
    "https://llave15.cl:8443",
    "http://vectorbikes.cl",
    "https://vectorbikes.cl:8443",
  ])("rechaza Origin %s", (origin) => {
    expect(isAllowedOrigin(post(origin))).toBe(false);
    expect(isAllowedOrigin(post(origin), APP_URL, LEGACY_URL)).toBe(false);
  });
});

async function seedOwner(test: TestDb): Promise<SessionUser> {
  const [branch] = await test.db.select().from(branches);
  if (!branch) throw new Error("Falta la sucursal.");
  const [user] = await test.db
    .insert(users)
    .values({
      branchId: branch.id,
      role: "owner",
      name: "Dueña",
      email: "owner@example.test",
      passwordHash: "hash",
    })
    .returning();
  if (!user) throw new Error("Falta el usuario.");
  return { ...user, role: "owner" };
}

async function seedOrder(test: TestDb) {
  const actor = await seedOwner(test);
  const [customer] = await test.db
    .insert(customers)
    .values({
      branchId: actor.branchId,
      name: "Ana Pérez",
      phoneE164: "+56912345678",
      email: "ana@example.test",
    })
    .returning();
  if (!customer) throw new Error("Falta el cliente.");
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: actor.branchId,
      customerId: customer.id,
      brand: "Trek",
      model: "Marlin",
      bikeType: "mtb",
    })
    .returning();
  if (!bike) throw new Error("Falta la bicicleta.");
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: actor.branchId,
      number: 1,
      customerId: customer.id,
      bikeId: bike.id,
      status: "lista_para_retirar",
      qcApprovedAt: NOW,
      receivedAt: NOW,
      requestedService: "Mantención",
      createdBy: actor.id,
    })
    .returning();
  if (!order) throw new Error("Falta la orden.");
  return { actor, order };
}

describe("enlaces reales con APP_URL", () => {
  let test: TestDb;

  beforeEach(async () => {
    test = await createBookingTestDb();
    holder.db = test.db;
    return async () => {
      holder.db = null;
      holder.actor = null;
      await test.close();
    };
  });

  it("la confirmación usa APP_URL para cancelar y conserva el UID del calendario en el sitio", async () => {
    const result = await createBooking(
      test.db,
      {
        mode: "taller",
        serviceDate: "2026-09-16",
        start: "15:00",
        customerName: "Ana Pérez",
        phoneE164: "+56912345678",
        email: "ana@example.test",
        bike: "Trek Marlin",
        description: "Mantención general",
        comuna: null,
        address: null,
        ipHash: null,
      },
      NOW,
    );
    if (!result.ok) throw new Error(result.code);
    const messages: EmailMessage[] = [];
    await notifyBookingCreated(
      result.booking,
      result.cancelToken,
      {
        transport: {
          send: async (message) => {
            messages.push(message);
          },
        },
      },
      [],
      test.db,
    );
    const expected = cancelUrlFor(result.cancelToken, APP_URL);
    expect(new URL(expected).origin).toBe(APP_URL);
    expect(new URL(expected).searchParams.get("token")).toBe(result.cancelToken);
    expect(messages[0]?.text).toContain(expected);
    expect(messages[0]?.html).toContain(`href="${expected}"`);
    // El UID del evento queda en el dominio del sitio: reprogramar actualiza el mismo evento.
    const ics = String(messages[0]?.attachments?.[0]?.content ?? "");
    expect(ics).toContain("@vectorbikes.cl");
    expect(ics).not.toContain("@llave15.cl");
  });

  it("el seguimiento, la aprobación y el QR usan el dominio de la app", async () => {
    const { actor, order } = await seedOrder(test);
    const { APP_URL: appUrl } = getAppEnv();
    const tracking = await ensureTrackingLink(test.db, actor, order.id, appUrl, NOW);
    if (!tracking.ok) throw new Error(tracking.code);
    expect(tracking.url).toBe(`${APP_URL}/seguimiento/${tracking.token}`);
    expect(approvalLink(`${appUrl}/`, tracking.token)).toBe(
      `${APP_URL}/aprobacion/${tracking.token}`,
    );
    const payloads: string[] = [];
    const label = await buildLabel(test.db, actor, order.id, appUrl, {
      toSvg: async (payload) => {
        payloads.push(payload);
        return "<svg></svg>";
      },
    });
    if (!label.ok) throw new Error(label.code);
    const expected = `${APP_URL}/taller/ordenes/${order.id}`;
    expect(payloads).toEqual([expected]);
    expect(label.html).toContain(`data-qr-url="${expected}"`);
  });

  it("generar un informe en la página devuelve su enlace con APP_URL", async () => {
    const { actor, order } = await seedOrder(test);
    holder.actor = actor;
    const request = new Request(`${APP_URL}/taller/ordenes/${order.id}/informe`, {
      method: "POST",
      headers: { origin: APP_URL },
      body: new URLSearchParams({
        recommendations: "Lubricar la cadena",
        nextChecks: "Revisar frenos",
        nextMaintenanceDate: "",
        nextMaintenanceNote: "",
      }),
    });
    const container = await AstroContainer.create({ astroConfig: { site: APP_URL } });
    const response = await container.renderToResponse(ReportPage, {
      request,
      params: { id: order.id },
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toMatch(/https:\/\/llave15\.cl\/informe\/[A-Za-z0-9_-]{43}/);
    expect(html).not.toContain(`${LEGACY_URL}/informe/`);
  });
});

it("la cookie usa secure según APP_URL y sigue siendo de host", () => {
  expect(sessionCookieOptions(getAppEnv().APP_URL)).toMatchObject({
    secure: true,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
  expect(sessionCookieOptions(getAppEnv().APP_URL)).not.toHaveProperty("domain");
  expect(sessionCookieOptions("http://localhost:4321").secure).toBe(false);
  expect(readFileSync("src/pages/admin/login.astro", "utf8")).toContain(
    "sessionCookieOptions(getAppEnv().APP_URL)",
  );
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

it("getSiteEnv solo permanece en env.ts y en la convivencia CSRF", () => {
  const matches = sourceFiles("src").filter((path) =>
    readFileSync(path, "utf8").includes("getSiteEnv("),
  );
  expect(matches.sort()).toEqual(["src/lib/env.ts", "src/server/api/handlers.ts"]);
});

it(".env.example documenta APP_URL vacía y su fallback", () => {
  const example = readFileSync(".env.example", "utf8");
  expect(example).toMatch(/^APP_URL=$/m);
  expect(example).toMatch(/#.*dominio del sistema.*https:\/\/llave15\.cl.*PUBLIC_SITE_URL/i);
});
