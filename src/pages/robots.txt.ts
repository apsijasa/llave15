import type { APIRoute } from "astro";
import { robotsTxt, seoHeaders, seoHostFor } from "../server/shops/site-seo.ts";

// Cambia según el dominio (convivencia hasta BG-DC1): no puede ser un archivo de `public/`.
export const prerender = false;

export const GET: APIRoute = ({ request }) =>
  new Response(robotsTxt(seoHostFor(request)), {
    headers: seoHeaders("text/plain; charset=utf-8"),
  });
