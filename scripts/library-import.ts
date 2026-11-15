import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDbEnv } from "../src/lib/env.ts";
import { importLibraryPack, libraryPackSchema } from "../src/server/library/content-pack.ts";
import type { LibraryPack } from "../src/server/library/content-pack.ts";

const args = process.argv.slice(2);
const paths = args.filter((arg) => arg !== "--dry-run");
if (
  paths.length > 1 ||
  paths.some((arg) => arg.startsWith("--")) ||
  args.filter((arg) => arg === "--dry-run").length > 1
) {
  console.error("Uso: pnpm library:import [--dry-run] [ruta]");
  process.exit(1);
}

async function readPack(): Promise<LibraryPack> {
  let input: unknown;
  try {
    input = JSON.parse(await readFile(paths[0] ?? "src/data/library/pack.json", "utf8"));
  } catch {
    console.error(
      JSON.stringify({
        ok: false,
        code: "validation_error",
        issues: ["No se pudo leer el paquete JSON."],
      }),
    );
    process.exit(1);
  }
  const parsed = libraryPackSchema.safeParse(input);
  if (!parsed.success) {
    console.error(
      JSON.stringify({
        ok: false,
        code: "validation_error",
        issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      }),
    );
    process.exit(1);
  }
  return parsed.data;
}

async function run(pack: LibraryPack) {
  let client: ReturnType<typeof postgres> | undefined;
  let connected = false;
  try {
    client = postgres(getDbEnv().DATABASE_URL, { max: 1, connect_timeout: 5 });
    await client`select 1`;
    connected = true;
    const result = await importLibraryPack(drizzle({ client }), null, pack, new Date(), {
      dryRun: args.includes("--dry-run"),
    });
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
  } catch {
    // Los errores pueden incluir credenciales o contenido: solo se imprime un mensaje seguro.
    console.error(
      connected
        ? "No se pudo completar la importación en la base."
        : "No se pudo conectar a la base.",
    );
    process.exitCode = 2;
  } finally {
    await client?.end({ timeout: 1 }).catch(() => undefined);
  }
}

await run(await readPack());
