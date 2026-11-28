import type { APIRoute } from "astro";
import { toCsv } from "../../../lib/csv.ts";
import { loginRedirect, requireAdmin, SESSION_COOKIE } from "../../../server/auth/admin-auth.ts";
import { can, forbiddenResponse } from "../../../server/auth/permissions.ts";
import { getDb } from "../../../server/db/client.ts";
import { exportIndicatorsReport, REPORT_KINDS } from "../../../server/taller/indicators-export.ts";
import { defaultRange, indicatorsRangeSchema } from "../../../server/taller/indicators.ts";

export const prerender = false;
export const GET: APIRoute = async ({ cookies, params, url, redirect }) => {
  const db = getDb();
  const now = new Date();
  const user = await requireAdmin(db, cookies.get(SESSION_COOKIE)?.value, now);
  if (!user) {
    const response = redirect(loginRedirect(url.pathname + url.search), 303);
    response.headers.set("cache-control", "no-store");
    return response;
  }
  if (!can(user.role, "dashboard.finance")) return forbiddenResponse();
  const kind = REPORT_KINDS.find((kind) => kind === params.report);
  if (!kind)
    return Response.json(
      { error: "Reporte no encontrado.", code: "not_found" },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  const defaults = defaultRange(now);
  const parsed = indicatorsRangeSchema.safeParse({
    from: url.searchParams.get("desde") ?? defaults.from,
    to: url.searchParams.get("hasta") ?? defaults.to,
  });
  if (!parsed.success)
    return Response.json(
      {
        error: "El rango de fechas no es válido.",
        code: "validation_error",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 422, headers: { "cache-control": "no-store" } },
    );
  const result = await exportIndicatorsReport(db, user, kind, parsed.data, now);
  if (!result.ok) return forbiddenResponse();
  return new Response(toCsv(result.rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${result.filename}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
};
