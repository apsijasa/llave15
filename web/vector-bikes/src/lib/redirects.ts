/** Destino del sistema después del corte (BG-D23): los enlaces ya enviados siguen funcionando. */
export const APP_ORIGIN = "https://llave15.cl";

const PREFIXES = ["/taller", "/admin", "/seguimiento", "/informe", "/aprobacion"] as const;
const EXACT = ["/reservas/cancelar"] as const;

function isLegacy(pathname: string): boolean {
  if ((EXACT as readonly string[]).includes(pathname)) return true;
  return PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Ruta del sistema → la misma ruta y consulta en Llave 15; cualquier otra → `null`. */
export function legacyRedirect(url: URL): string | null {
  if (!isLegacy(url.pathname)) return null;
  return `${APP_ORIGIN}${url.pathname}${url.search}`;
}

/** 301 para `GET`/`HEAD`; 308 para el resto, que conserva método y cuerpo. */
export function redirectStatus(method: string): 301 | 308 {
  return method === "GET" || method === "HEAD" ? 301 : 308;
}
