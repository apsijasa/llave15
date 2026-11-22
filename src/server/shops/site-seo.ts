import { getHostEnv } from "../../lib/env.ts";
import { isPlatformHost } from "./host.ts";

/**
 * `robots.txt` y sitemap según el dominio del pedido. Durante la convivencia (hasta BG-DC1) la
 * misma app puede atender llave15.cl y el dominio heredado: cada uno anuncia solo sus páginas,
 * nunca las del otro.
 */
export type SeoHost = {
  /** El pedido llegó por `APP_URL` (`isPlatformHost`). */
  platform: boolean;
  appUrl: string;
  siteUrl: string;
};

/** Rutas privadas en cualquier dominio: personal, plataforma y enlaces con token. */
const PRIVATE_PATHS = [
  "/admin",
  "/taller",
  "/plataforma",
  "/reservas/cancelar",
  "/aprobacion",
  "/informe",
  "/seguimiento",
] as const;

/** Lista blanca: una página nueva no entra sola al sitemap. */
const LEGACY_PAGES = ["/", "/privacidad/"] as const;
const PLATFORM_PAGES = ["/", "/demo", "/aviso-de-privacidad"] as const;

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>';
const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";

function originOf(host: SeoHost): string {
  return new URL(host.platform ? host.appUrl : host.siteUrl).origin;
}

function absolute(host: SeoHost, path: string): string {
  return new URL(path, originOf(host)).href;
}

export function robotsTxt(host: SeoHost): string {
  const lines = [
    "User-agent: *",
    ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
    `Sitemap: ${absolute(host, "/sitemap-index.xml")}`,
  ];
  return `${lines.join("\n")}\n`;
}

export function sitemapIndexXml(host: SeoHost): string {
  const loc = absolute(host, "/sitemap-0.xml");
  return `${XML_HEADER}<sitemapindex xmlns="${SITEMAP_NS}"><sitemap><loc>${loc}</loc></sitemap></sitemapindex>`;
}

export function sitemapXml(host: SeoHost): string {
  const pages = host.platform ? PLATFORM_PAGES : LEGACY_PAGES;
  const urls = pages.map((path) => `<url><loc>${absolute(host, path)}</loc></url>`).join("");
  return `${XML_HEADER}<urlset xmlns="${SITEMAP_NS}">${urls}</urlset>`;
}

/** Cabeceras comunes: la respuesta cambia según el dominio (`vary`). */
export function seoHeaders(contentType: string): Record<string, string> {
  return {
    "content-type": contentType,
    "cache-control": "public, max-age=3600",
    vary: "Host, X-Forwarded-Host",
  };
}

/** Dominio del pedido; sin `PUBLIC_SITE_URL` válido, el origen con que llegó. */
export function seoHostFor(request: Request): SeoHost {
  const env = getHostEnv();
  const siteUrl = env.PUBLIC_SITE_URL || new URL(request.url).origin;
  return {
    platform: isPlatformHost(request, env.APP_URL, siteUrl),
    appUrl: env.APP_URL ?? siteUrl,
    siteUrl,
  };
}
