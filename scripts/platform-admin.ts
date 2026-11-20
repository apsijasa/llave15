// Pone o quita la marca de administrador de plataforma (BG-45).
// Uso: pnpm platform:admin <correo> [--off]
// Sale 0 si la marca quedó como se pidió, 1 si el correo no existe, 2 por uso o sin conexión.
// Solo imprime JSON sin datos personales: nunca el correo ni errores de la base.
import { pathToFileURL } from "node:url";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import { getDbEnv } from "../src/lib/env.ts";
import type { AppDb } from "../src/server/db/client.ts";
import { adminSessions, users } from "../src/server/db/schema.ts";

export type SetPlatformAdminResult = { ok: true } | { ok: false; code: "not_found" };

/** Marca o quita la marca y revoca las sesiones abiertas: el cambio rige en el próximo ingreso. */
export async function setPlatformAdmin(
  db: AppDb,
  email: string,
  on: boolean,
  now: Date,
): Promise<SetPlatformAdminResult> {
  const normalized = email.trim().toLowerCase();
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(users)
      .set({ isPlatformAdmin: on, updatedAt: now })
      .where(eq(users.email, normalized))
      .returning({ id: users.id });
    const user = updated[0];
    if (!user) return { ok: false, code: "not_found" } as const;
    await tx
      .update(adminSessions)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(adminSessions.userId, user.id), isNull(adminSessions.revokedAt)));
    return { ok: true } as const;
  });
}

const argsSchema = z.tuple([z.email()]).or(z.tuple([z.email(), z.literal("--off")]));

async function main(args: string[]): Promise<number> {
  const parsed = argsSchema.safeParse(args);
  if (!parsed.success) {
    console.error(
      JSON.stringify({
        ok: false,
        code: "usage",
        message: "Uso: pnpm platform:admin <correo> [--off]",
      }),
    );
    return 2;
  }
  const [email, flag] = parsed.data;
  let client: ReturnType<typeof postgres> | undefined;
  try {
    client = postgres(getDbEnv().DATABASE_URL, { max: 1, connect_timeout: 5 });
    await client`select 1`;
  } catch {
    console.error(
      JSON.stringify({
        ok: false,
        code: "connection_failed",
        message: "No se pudo conectar a la base",
      }),
    );
    await client?.end({ timeout: 1 }).catch(() => undefined);
    return 2;
  }
  try {
    const on = flag !== "--off";
    const result = await setPlatformAdmin(drizzle({ client }), email, on, new Date());
    console.log(JSON.stringify(result.ok ? { ok: true, platformAdmin: on } : result));
    return result.ok ? 0 : 1;
  } catch {
    console.error(
      JSON.stringify({ ok: false, code: "failed", message: "No se pudo cambiar la marca" }),
    );
    return 2;
  } finally {
    await client.end({ timeout: 1 }).catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
