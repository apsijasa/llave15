// Comprueba las redirecciones del sitio de Vector Bikes contra una URL base (BG-38).
// Uso: node web/vector-bikes/scripts/check-redirects.ts <url-base>
// Sale 0 si todo coincide, 1 si algo no coincide, 2 por uso incorrecto o sin conexión.
import { pathToFileURL } from "node:url";

const APP_ORIGIN = "https://llave15.cl";
const REDIRECTS = [
  "/taller",
  "/taller/ordenes/abc?x=1",
  "/admin/login?next=%2Ftaller",
  "/seguimiento/TOKEN",
  "/informe/TOKEN",
  "/aprobacion/TOKEN",
  "/reservas/cancelar?token=abc",
] as const;
const PAGES = [
  ["/", 200],
  ["/privacidad", 200],
  ["/servicios", 200],
  ["/no-existe", 404],
] as const;

export type Check = { path: string; ok: boolean; detail: string };

export async function checkRedirects(
  base: string,
  fetchFn: typeof fetch = fetch,
): Promise<Check[]> {
  const checks: Check[] = [];
  for (const path of REDIRECTS) {
    const response = await fetchFn(new URL(path, base), { redirect: "manual" });
    const location = response.headers.get("location");
    const expected = `${APP_ORIGIN}${path}`;
    checks.push({
      path,
      ok: response.status === 301 && location === expected,
      detail: `${response.status} ${location ?? "(sin Location)"}`,
    });
  }
  for (const [path, status] of PAGES) {
    const response = await fetchFn(new URL(path, base), { redirect: "manual" });
    checks.push({ path, ok: response.status === status, detail: String(response.status) });
  }
  return checks;
}

async function main(argv: string[]): Promise<number> {
  const base = argv[0];
  if (!base || !URL.canParse(base)) {
    process.stderr.write("Uso: node web/vector-bikes/scripts/check-redirects.ts <url-base>\n");
    return 2;
  }
  let checks: Check[];
  try {
    checks = await checkRedirects(base);
  } catch {
    process.stderr.write(`No se pudo conectar con ${new URL(base).origin}\n`);
    return 2;
  }
  for (const check of checks) {
    process.stdout.write(`${check.ok ? "ok " : "MAL"} ${check.path} → ${check.detail}\n`);
  }
  return checks.every((check) => check.ok) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
