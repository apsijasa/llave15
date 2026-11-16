import { writeFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDbEnv } from "../src/lib/env.ts";
import { exportLibraryPack } from "../src/server/library/content-pack-export.ts";

const args = process.argv.slice(2);
if (args.length > 1 || args.some((arg) => arg.startsWith("--"))) {
  console.error("Uso: pnpm library:export [ruta]");
  process.exit(1);
}

let client: ReturnType<typeof postgres> | undefined;
let connected = false;
try {
  client = postgres(getDbEnv().DATABASE_URL, { max: 1, connect_timeout: 5 });
  await client`select 1`;
  connected = true;
  const pack = await exportLibraryPack(drizzle({ client }), new Date());
  const json = `${JSON.stringify(pack, null, 2)}\n`;
  if (args[0]) await writeFile(args[0], json, "utf8");
  else process.stdout.write(json);
  process.exitCode = 0;
} catch {
  // Los errores pueden incluir credenciales: solo se imprime un mensaje seguro.
  console.error(
    connected ? "No se pudo exportar la biblioteca." : "No se pudo conectar a la base.",
  );
  process.exitCode = connected ? 1 : 2;
} finally {
  await client?.end({ timeout: 1 }).catch(() => undefined);
}
