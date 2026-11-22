/** Host de una URL o cabecera, en minúsculas y sin puerto; `null` si no se puede leer. */
function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim().toLowerCase() ?? "";
  if (first === "") return null;
  try {
    return new URL(first.includes("://") ? first : `http://${first}`).hostname;
  } catch {
    return null;
  }
}

/**
 * ¿El pedido llegó por el dominio de la plataforma (`APP_URL`, llave15.cl)? Durante la convivencia
 * (hasta BG-DC1) `/` muestra la landing de Llave 15 solo ahí y la portada heredada en el resto.
 * Sin `APP_URL`, o si coincide con `PUBLIC_SITE_URL`, siempre es falso: todo sigue como antes.
 */
export function isPlatformHost(
  request: Request,
  appUrl: string | undefined,
  siteUrl: string,
): boolean {
  const app = hostOf(appUrl);
  if (app === null || app === hostOf(siteUrl)) return false;
  const requested =
    hostOf(request.headers.get("x-forwarded-host")) ?? hostOf(request.headers.get("host"));
  const bare = (host: string) => host.replace(/^www\./, "");
  return requested !== null && bare(requested) === bare(app);
}
