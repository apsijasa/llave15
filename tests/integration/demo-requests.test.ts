import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "../../src/server/db/client.ts";
import { demoRequests, platformTables } from "../../src/server/db/schema-platform.ts";
import { users } from "../../src/server/db/schema.ts";
import {
  DEMO_RATE_LIMIT_MAX,
  createDemoRequest,
  demoRequestSchema,
  listDemoRequests,
  platformAdminEmails,
  setDemoRequestStatus,
} from "../../src/server/shops/demo-requests.ts";
import { createTestDb, type TestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const NOW = new Date("2026-11-21T15:00:00.000Z");
const FORM = {
  nombre: "Paula Rojas",
  taller: "Taller Cordillera",
  correo: " Paula@Ejemplo.CL ",
  telefono: "+56 9 1234 5678",
  ciudad: "Temuco",
  mecanicos: "2-3",
  mensaje: "",
  consentimiento: "on",
};

let test: TestDb;
let db: AppDb;
let seeded: Awaited<ReturnType<typeof seedTwoShops>>;

beforeEach(async () => {
  test = await createTestDb();
  db = test.db;
  seeded = await seedTwoShops(db);
});

afterEach(async () => {
  await test.close();
});

function input(overrides: Record<string, string> = {}) {
  const parsed = demoRequestSchema.safeParse({ ...FORM, ...overrides });
  if (!parsed.success) throw new Error("Formulario inválido");
  return parsed.data;
}

describe("demo_requests", () => {
  it("existe sin branch_id y con su CHECK de estado", async () => {
    expect(platformTables).toHaveLength(1);
    const columns = await test.client.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'demo_requests'",
    );
    const names = columns.rows.map((row) => row.column_name);
    expect(names).toContain("consent_at");
    expect(names).not.toContain("branch_id");
    await expect(
      test.client.query(
        "insert into demo_requests (name, shop_name, email, phone, city, consent_at, status) values ('a','b','c','d','e', now(), 'otra')",
      ),
    ).rejects.toThrow(/demo_requests_status_check/);
  });
});

describe("demoRequestSchema", () => {
  it("normaliza el correo, vacía el mensaje y traduce los campos", () => {
    expect(input()).toEqual({
      name: "Paula Rojas",
      shopName: "Taller Cordillera",
      email: "paula@ejemplo.cl",
      phone: "+56 9 1234 5678",
      city: "Temuco",
      mechanics: "2-3",
      message: null,
    });
    expect(input({ mecanicos: "" }).mechanics).toBeNull();
  });

  it("rechaza sin consentimiento, con correo o teléfono inválidos", () => {
    const { consentimiento: _omit, ...withoutConsent } = FORM;
    expect(demoRequestSchema.safeParse(withoutConsent).success).toBe(false);
    expect(demoRequestSchema.safeParse({ ...FORM, correo: "no-es-correo" }).success).toBe(false);
    expect(demoRequestSchema.safeParse({ ...FORM, telefono: "abc" }).success).toBe(false);
    expect(demoRequestSchema.safeParse({ ...FORM, mecanicos: "9" }).success).toBe(false);
  });
});

describe("createDemoRequest", () => {
  it("guarda la solicitud con el consentimiento y el estado nueva", async () => {
    const result = await createDemoRequest(db, input(), "hash-a", NOW);
    expect(result.ok).toBe(true);
    const [row] = await db.select().from(demoRequests);
    expect(row).toMatchObject({ status: "nueva", consentAt: NOW, ipHash: "hash-a" });
  });

  it(`limita a ${DEMO_RATE_LIMIT_MAX} por IP en una hora y no cuenta otras IP`, async () => {
    for (let i = 0; i < DEMO_RATE_LIMIT_MAX; i += 1) {
      expect((await createDemoRequest(db, input(), "hash-a", NOW)).ok).toBe(true);
    }
    expect(await createDemoRequest(db, input(), "hash-a", NOW)).toEqual({
      ok: false,
      code: "rate_limited",
    });
    expect((await createDemoRequest(db, input(), "hash-b", NOW)).ok).toBe(true);
    const later = new Date(NOW.getTime() + 61 * 60_000);
    expect((await createDemoRequest(db, input(), "hash-a", later)).ok).toBe(true);
  });
});

describe("lectura desde la plataforma", () => {
  it("platformAdminEmails devuelve solo administradores activos", async () => {
    expect(await platformAdminEmails(db)).toEqual([]);
    await db
      .update(users)
      .set({ isPlatformAdmin: true })
      .where(eq(users.id, seeded.vector.owner.id));
    expect(await platformAdminEmails(db)).toEqual([seeded.vector.owner.email]);
  });

  it("lista y cambia el estado solo con la marca", async () => {
    const created = await createDemoRequest(db, input(), null, NOW);
    if (!created.ok) throw new Error(created.code);
    const owner = seeded.vector.owner;
    expect(await listDemoRequests(db, owner)).toBeNull();
    expect(await setDemoRequestStatus(db, owner, created.request.id, "contactada", NOW)).toEqual({
      ok: false,
      code: "forbidden",
    });
    const admin = { ...owner, isPlatformAdmin: true };
    expect(await setDemoRequestStatus(db, admin, created.request.id, "contactada", NOW)).toEqual({
      ok: true,
    });
    expect(await setDemoRequestStatus(db, admin, created.request.id, "otra", NOW)).toEqual({
      ok: false,
      code: "validation_error",
    });
    const rows = await listDemoRequests(db, admin);
    expect(rows?.map((row) => [row.shopName, row.status])).toEqual([
      ["Taller Cordillera", "contactada"],
    ]);
  });
});
