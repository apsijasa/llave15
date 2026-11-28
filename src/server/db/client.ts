import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDbEnv } from "../../lib/env.ts";

export type AppDb = PgDatabase<PgQueryResultHKT>;

let cached: AppDb | undefined;

/**
 * Las conexiones ociosas se conservan 10 minutos. Con 20 segundos, cada clic después de llenar
 * un formulario pagaba abrir una conexión nueva (TLS + autenticación): más de un segundo.
 */
const IDLE_TIMEOUT_SECONDS = 600;
const CONNECT_TIMEOUT_SECONDS = 10;

/**
 * Límites por sesión: una consulta o una espera de lock colgada devuelve su conexión al pool en
 * vez de retenerla. Con cinco conexiones, cinco esperas sin límite dejan a todos sin base.
 */
const SESSION_LIMITS = {
  statement_timeout: 30_000,
  lock_timeout: 10_000,
  idle_in_transaction_session_timeout: 30_000,
} as const;

type Sql = ReturnType<typeof postgres>;
type Callback = (sql: Sql, ...rest: unknown[]) => unknown;

/**
 * Drizzle llama a `unsafe` sin `prepare`, y así postgres-js hace dos viajes por cada consulta
 * con parámetros (describir, luego ejecutar). Con `prepare: true` la sentencia queda preparada
 * en la conexión y desde la segunda vez es un solo viaje. `begin` y `savepoint` entregan otro
 * cliente al callback: también se envuelve.
 */
export function withPreparedStatements(client: Sql): Sql {
  const wrapCallback =
    (method: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      const callback = args.at(-1) as Callback;
      const wrapped: Callback = (inner, ...rest) =>
        callback(withPreparedStatements(inner), ...rest);
      return method(...args.slice(0, -1), wrapped);
    };
  return new Proxy(client, {
    get(target, property) {
      const value = Reflect.get(target, property) as unknown;
      if (property === "unsafe") {
        const unsafe = value as (query: string, args?: unknown[], options?: object) => unknown;
        return (query: string, args?: unknown[], options?: object) =>
          unsafe(query, args, { prepare: true, ...options });
      }
      if (property === "begin" || property === "savepoint") {
        return wrapCallback(value as (...args: unknown[]) => unknown);
      }
      return value;
    },
  });
}

/**
 * Un pooler en modo transacción (host `-pooler`) no conserva sentencias preparadas ni acepta
 * parámetros de sesión al conectar: ahí el cliente queda como antes.
 */
export function isPooledUrl(url: string): boolean {
  try {
    return new URL(url).hostname.includes("-pooler");
  } catch {
    return false;
  }
}

export function getDb(): AppDb {
  if (!cached) {
    const { DATABASE_URL } = getDbEnv();
    const pooled = isPooledUrl(DATABASE_URL);
    const client = postgres(DATABASE_URL, {
      max: 5,
      idle_timeout: IDLE_TIMEOUT_SECONDS,
      connect_timeout: CONNECT_TIMEOUT_SECONDS,
      ...(pooled ? {} : { connection: SESSION_LIMITS }),
    });
    cached = drizzle({
      client: pooled ? client : withPreparedStatements(client),
    }) as unknown as AppDb;
  }
  return cached;
}

export async function pingDb(db: AppDb): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ((current as { code?: unknown }).code === "23505") {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
