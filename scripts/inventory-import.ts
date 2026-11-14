const args = process.argv.slice(2);
const [file, email, flag] = args;
if (!file || !email || args.length > 3 || (flag !== undefined && flag !== "--dry-run")) {
  console.error("Uso: pnpm inventory:import <archivo.csv> <correo> [--dry-run]");
  process.exit(2);
}

// Ningún módulo de la base se carga antes de validar los argumentos y leer el CSV.
const { z } = await import("zod");
const parsedEmail = z.string().trim().toLowerCase().pipe(z.email()).safeParse(email);
if (!parsedEmail.success) {
  console.log(JSON.stringify({ ok: false, code: "forbidden" }));
  process.exit(1);
}

const { readFile } = await import("node:fs/promises");
let text: string;
try {
  text = await readFile(file, "utf8");
} catch {
  console.error(
    JSON.stringify({ ok: false, code: "file_error", message: "No se pudo leer el CSV." }),
  );
  process.exit(1);
}

async function runImport(validEmail: string, csv: string) {
  const [{ getDbEnv }, { drizzle }, { default: postgres }, { importInventory }] = await Promise.all(
    [
      import("../src/lib/env.ts"),
      import("drizzle-orm/postgres-js"),
      import("postgres"),
      import("../src/server/taller/inventory-import.ts"),
    ],
  );
  const client = postgres(getDbEnv().DATABASE_URL, { max: 1, connect_timeout: 5 });
  try {
    const db = drizzle({ client });
    const result = await importInventory(db, validEmail, csv, new Date(), {
      dryRun: flag === "--dry-run",
    });
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
  } finally {
    await client.end({ timeout: 1 });
  }
}

try {
  await runImport(parsedEmail.data, text);
} catch {
  // Los errores de conexión pueden incluir credenciales o SQL con costos: no imprimirlos.
  console.error(
    JSON.stringify({
      ok: false,
      code: "database_error",
      message: "No se pudo completar la importación en la base.",
    }),
  );
  process.exitCode = 2;
}

export {};
