import type { APIRoute } from "astro";
import { seoHeaders, seoHostFor, sitemapXml } from "../server/shops/site-seo.ts";

// Lista blanca por dominio: llave15.cl sus páginas comerciales, el heredado su portada.
export const prerender = false;

export const GET: APIRoute = ({ request }) =>
  new Response(sitemapXml(seoHostFor(request)), {
    headers: seoHeaders("application/xml; charset=utf-8"),
  });
