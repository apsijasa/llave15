import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { hashPassword, loginAdmin, requireAdmin } from "../../src/server/auth/admin-auth.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { canCurate, canUseLibrary } from "../../src/server/library/access.ts";
import type { TestDb } from "../helpers/pglite.ts";
import { createTestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-15T15:00:00.000Z");
const PASSWORD = "clave-larga-de-prueba";
let test: TestDb;
let branchId: string;
let passwordHash: string;

beforeEach(async () => {
  test = await createTestDb();
  passwordHash = await hashPassword(PASSWORD);
  const [branch] = await test.db.insert(branches).values({ name: "Vitacura" }).returning();
  if (!branch) throw new Error("Falta la sucursal de prueba");
  branchId = branch.id;
  return () => test.close();
});

async function sessionFor(role: Role, libraryCurator?: boolean) {
  const email = `${role}-${libraryCurator ?? "default"}@ejemplo.cl`;
  await test.db.insert(users).values({
    branchId,
    email,
    name: "Usuario de prueba",
    passwordHash,
    role,
    ...(libraryCurator === undefined ? {} : { libraryCurator }),
    createdAt: NOW,
    updatedAt: NOW,
  });
  const login = await loginAdmin(test.db, {
    email,
    password: PASSWORD,
    ipHash: "a".repeat(64),
    now: NOW,
  });
  if (!login.ok) throw new Error(`Login falló: ${login.code}`);
  const user = await requireAdmin(test.db, login.token, NOW);
  if (!user) throw new Error("Falta la sesión de prueba");
  return { user, token: login.token };
}

describe("marca de curador en la sesión", () => {
  it("devuelve la marca guardada para un owner curador y otro sin marca", async () => {
    const curator = await sessionFor("owner", true);
    const regular = await sessionFor("owner");

    expect(curator.user.libraryCurator).toBe(true);
    expect(regular.user.libraryCurator).toBe(false);
    expect(canCurate(curator.user)).toBe(true);
    expect(canCurate(regular.user)).toBe(false);
  });

  it("vuelve a leer la marca al resolver una sesión vigente", async () => {
    const { user, token } = await sessionFor("owner", true);
    await test.db.update(users).set({ libraryCurator: false }).where(eq(users.id, user.id));

    const refreshed = await requireAdmin(test.db, token, NOW);
    expect(refreshed?.libraryCurator).toBe(false);
    if (!refreshed) throw new Error("Falta la sesión vigente");
    expect(canCurate(refreshed)).toBe(false);
  });
});

describe("acceso a la biblioteca por rol y marca", () => {
  it.each([
    ["owner", false, false],
    ["admin", true, true],
    ["admin", false, false],
    ["reception", true, false],
    ["reception", false, false],
    ["mechanic", true, false],
    ["mechanic", false, false],
  ] as const)("%s con marca %s: curador %s", async (role, flag, expected) => {
    const { user } = await sessionFor(role, flag);

    expect(user.libraryCurator).toBe(flag);
    expect(canCurate(user)).toBe(expected);
    expect(canUseLibrary(user)).toBe(true);
  });

  it("permite consultar al owner y exige una marca explícita para curar", async () => {
    const { user } = await sessionFor("owner", true);
    const { libraryCurator: _flag, ...withoutFlag } = user;
    const legacyUser: SessionUser = withoutFlag;

    expect(canUseLibrary(user)).toBe(true);
    expect(canUseLibrary(legacyUser)).toBe(true);
    expect(canCurate(legacyUser)).toBe(false);
  });
});
