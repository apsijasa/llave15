import type { APIRoute } from "astro";
import { seoHeaders, seoHostFor, sitemapIndexXml } from "../server/shops/site-seo.ts";

// Cada dominio anuncia su propio sitemap (convivencia hasta BG-DC1).
export const prerender = false;

export const GET: APIRoute = ({ request }) =>
  new Response(sitemapIndexXml(seoHostFor(request)), {
    headers: seoHeaders("application/xml; charset=utf-8"),
  });
