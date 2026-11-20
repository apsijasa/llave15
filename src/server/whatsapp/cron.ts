import { timingSafeEqual } from "node:crypto";
import { getCronEnv } from "../../lib/env.ts";
import type { AppDb } from "../db/client.ts";
import { taskScopes } from "../shops/scope.ts";
import { sendPendingReminders } from "./service.ts";

function authorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function handleWhatsAppCron(
  request: Request,
  db: AppDb,
  now: Date,
  secret: string | undefined = getCronEnv().CRON_SECRET,
  sender?: Parameters<typeof sendPendingReminders>[2],
): Promise<Response> {
  const headers = { "cache-control": "no-store", "content-type": "application/json" };
  if (request.method !== "POST")
    return new Response('{"error":"Método no permitido"}', { status: 405, headers });
  if (!authorized(request.headers.get("authorization"), secret)) {
    return new Response('{"error":"No autorizado"}', { status: 401, headers });
  }
  const summary = { sent: 0, failed: 0, skipped: 0 };
  for (const scope of await taskScopes(db)) {
    const totals = await sendPendingReminders(db, now, sender, scope);
    summary.sent += totals.sent;
    summary.failed += totals.failed;
    summary.skipped += totals.skipped;
  }
  return new Response(JSON.stringify(summary), { status: 200, headers });
}
