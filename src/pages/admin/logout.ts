import type { APIRoute } from "astro";
import { getAppEnv } from "../../lib/env.ts";
import { isAllowedOrigin } from "../../server/api/handlers.ts";
import { logoutAdmin, SESSION_COOKIE } from "../../server/auth/admin-auth.ts";
import { getDb } from "../../server/db/client.ts";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!isAllowedOrigin(request)) {
    return new Response("No pudimos confirmar la solicitud.", {
      status: 403,
      headers: { "cache-control": "no-store" },
    });
  }
  await logoutAdmin(getDb(), cookies.get(SESSION_COOKIE)?.value, new Date());
  cookies.delete(SESSION_COOKIE, { path: "/" });
  // Al salir se vuelve a la home del dominio del sistema (llave15.cl muestra la landing).
  return redirect(new URL("/", getAppEnv().APP_URL).href, 303);
};
