import type { APIRoute } from "astro";
import { legacyRedirect, redirectStatus } from "../lib/redirects.ts";

export const prerender = false;

/** Redirecciones permanentes de las rutas del sistema a Llave 15 (BG-38); el resto, 404. */
export const ALL: APIRoute = ({ request }) => {
  const target = legacyRedirect(new URL(request.url));
  if (target === null) {
    return new Response("No encontrado", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(null, {
    status: redirectStatus(request.method),
    headers: { location: target, "cache-control": "public, max-age=3600" },
  });
};
