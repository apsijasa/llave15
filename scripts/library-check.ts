// Salud de la biblioteca: imprime el JSON de libraryIsolationHealth y sale 0 (sano), 1 (anomalías)
// o 2 (sin conexión o error). Solo conteos; nunca imprime datos de un taller ni credenciales.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDbEnv } from "../src/lib/env.ts";
import { libraryIsolationHealth } from "../src/server/library/isolation-health.ts";

/** Quita del mensaje cualquier URL de conexión, que podría llevar usuario y clave. */
function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/postgres(ql)?:\/\/\S+/gi, "postgres://…");
}

let client: ReturnType<typeof postgres> | undefined;
let exitCode = 2;
let connected = false;
try {
  client = postgres(getDbEnv().DATABASE_URL, { max: 1, connect_timeout: 10 });
  await client`select 1`;
  connected = true;
  const health = await libraryIsolationHealth(drizzle({ client }));
  console.log(JSON.stringify(health));
  exitCode = health.ok ? 0 : 1;
} catch (error) {
  const prefix = connected ? "No se pudo completar el chequeo" : "No se pudo conectar a la base";
  console.error(`${prefix}: ${safeMessage(error)}`);
} finally {
  await client?.end({ timeout: 5 }).catch(() => undefined);
}
process.exit(exitCode);
