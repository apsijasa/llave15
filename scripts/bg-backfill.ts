import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDbEnv, getEmailEnv } from "../src/lib/env.ts";
import { backfillFirstShop } from "../src/server/shops/backfill.ts";
import { createStorage } from "../src/server/storage/storage.ts";
import { VECTOR_BIKES_PROFILE } from "./vector-bikes-profile.ts";

type Options = { dryRun: boolean; logoPath?: string };

function parseArgs(args: string[]): Options | null {
  const options: Options = { dryRun: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--dry-run" && !options.dryRun) options.dryRun = true;
    else if (arg === "--logo" && !options.logoPath) {
      const path = args[++index];
      if (!path?.trim() || path.startsWith("-") || path.includes("\0")) return null;
      options.logoPath = path;
    } else return null;
  }
  return options;
}

async function run(options: Options): Promise<number> {
  let client: ReturnType<typeof postgres> | undefined;
  let connected = false;
  try {
    client = postgres(getDbEnv().DATABASE_URL, { max: 1, connect_timeout: 5 });
    await client`select 1`;
    connected = true;
    const logo = !options.dryRun && options.logoPath ? await readFile(options.logoPath) : undefined;
    const storage = logo ? await createStorage() : undefined;
    const result = await backfillFirstShop(
      drizzle({ client }),
      {
        profile: VECTOR_BIKES_PROFILE,
        notifyEmail: options.dryRun ? undefined : getEmailEnv().SHOP_NOTIFY_EMAIL,
        logo,
        storage,
        dryRun: options.dryRun,
      },
      new Date(),
    );
    console.log(JSON.stringify(result));
    return !result.ok || (!options.dryRun && result.pending > 0) ? 1 : 0;
  } catch {
    // Nunca imprimir el error original: puede contener consultas, datos o credenciales.
    console.error(
      JSON.stringify({
        ok: false,
        code: connected ? "backfill_failed" : "connection_failed",
        message: connected
          ? "No se pudo completar la migración de datos"
          : "No se pudo conectar a la base",
      }),
    );
    return 2;
  } finally {
    await client?.end({ timeout: 1 }).catch(() => undefined);
  }
}

async function main(args: string[]): Promise<number> {
  const options = parseArgs(args);
  if (!options) {
    console.error(
      JSON.stringify({
        ok: false,
        code: "usage",
        message: "Uso: pnpm bg:backfill [--dry-run] [--logo <ruta>]",
      }),
    );
    return 2;
  }
  return run(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
