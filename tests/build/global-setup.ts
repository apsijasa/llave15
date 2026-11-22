import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * `/` es SSR desde la landing de Llave 15 (BG-D52): ya no existe `dist/client/index.html`.
 * Este setup arranca el servidor construido, pide `/` por cada dominio y deja el HTML en
 * `dist/test-pages/` para que las pruebas del build lo lean como antes.
 */
const PORT = Number(process.env.BUILD_TEST_PORT ?? 4397);
const BASE = `http://127.0.0.1:${PORT}`;
export const PAGES_DIR = "dist/test-pages";

async function waitForServer(child: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error("El servidor construido no arrancó");
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.status > 0) return;
    } catch {
      // Todavía no escucha.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("El servidor construido no respondió a tiempo");
}

async function page(host: string): Promise<string> {
  // `fetch` no deja cambiar `Host`: el proxy de Replit manda el dominio en `x-forwarded-host`.
  const response = await fetch(`${BASE}/`, { headers: { "x-forwarded-host": host } });
  if (response.status !== 200) throw new Error(`/ respondió ${response.status} para ${host}`);
  return response.text();
}

export default async function setup(): Promise<() => void> {
  const child = spawn("node", ["--env-file-if-exists=.env", "dist/server/entry.mjs"], {
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(PORT),
      APP_URL: "https://llave15.cl",
      PUBLIC_SITE_URL: "https://vectorbikes.cl",
    },
    stdio: "ignore",
  });
  try {
    await waitForServer(child);
    mkdirSync(PAGES_DIR, { recursive: true });
    writeFileSync(`${PAGES_DIR}/legacy-home.html`, await page("vectorbikes.cl"));
    writeFileSync(`${PAGES_DIR}/platform-home.html`, await page("llave15.cl"));
  } catch (error) {
    child.kill();
    throw error;
  }
  return () => {
    child.kill();
  };
}
