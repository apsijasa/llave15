import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { setPlatformAdmin } from "../../scripts/platform-admin.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { adminSessions, users } from "../../src/server/db/schema.ts";
import { createTestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const NOW = new Date("2026-11-20T15:00:00.000Z");
let db: AppDb;
let seeded: Awaited<ReturnType<typeof seedTwoShops>>;

async function flagOf(userId: string) {
  const [row] = await db
    .select({ flag: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, userId));
  return row?.flag;
}

beforeEach(async () => {
  db = (await createTestDb()).db;
  seeded = await seedTwoShops(db);
});

describe("setPlatformAdmin", () => {
  it("marca a un usuario existente y revoca sus sesiones; con on false quita la marca", async () => {
    const owner = seeded.vector.owner;
    await db.insert(adminSessions).values({
      userId: owner.id,
      tokenHash: "hash-de-sesion",
      expiresAt: new Date(NOW.getTime() + 60_000),
    });
    expect(await setPlatformAdmin(db, ` ${owner.email.toUpperCase()} `, true, NOW)).toEqual({
      ok: true,
    });
    expect(await flagOf(owner.id)).toBe(true);
    const [session] = await db
      .select()
      .from(adminSessions)
      .where(eq(adminSessions.userId, owner.id));
    expect(session?.revokedAt).toEqual(NOW);
    expect(await setPlatformAdmin(db, owner.email, false, NOW)).toEqual({ ok: true });
    expect(await flagOf(owner.id)).toBe(false);
  });

  it("devuelve not_found sin cambios cuando el correo no existe", async () => {
    expect(await setPlatformAdmin(db, "nadie@ejemplo.cl", true, NOW)).toEqual({
      ok: false,
      code: "not_found",
    });
    const flagged = await db.select().from(users).where(eq(users.isPlatformAdmin, true));
    expect(flagged).toEqual([]);
  });
});

describe("script y documentación", () => {
  it("sale 2 sin argumentos", () => {
    const run = spawnSync(process.execPath, ["scripts/platform-admin.ts"], { encoding: "utf8" });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("Uso: pnpm platform:admin");
  });

  it("package.json declara platform:admin", () => {
    const { scripts } = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(scripts["platform:admin"]).toBe(
      "node --env-file-if-exists=.env scripts/platform-admin.ts",
    );
  });

  it("docs/nuevo-taller.md y el README tienen sus secciones", () => {
    const guide = readFileSync("docs/nuevo-taller.md", "utf8");
    for (const section of [
      "## Antes de dar de alta",
      "## Alta en /plataforma",
      "## Primer ingreso del dueño",
      "## Verificación",
    ]) {
      expect(guide).toContain(section);
    }
    expect(readFileSync("README.md", "utf8")).toContain("## Operación de Llave 15");
  });
});
