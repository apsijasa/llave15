import { getTurnstileEnv } from "../../lib/env.ts";
import { log } from "../../lib/log.ts";
import { hashIp } from "../api/handlers.ts";
import { verifyTurnstile } from "../api/turnstile.ts";
import type { AppDb } from "../db/client.ts";
import { type DemoNotifyDeps, notifyDemoRequest } from "../email/platform/demo-request.ts";
import { createDemoRequest, demoRequestSchema } from "./demo-requests.ts";

export const DEMO_TURNSTILE_CDATA = "demo";

export type DemoSubmitResult =
  | { ok: true }
  | { ok: false; code: "validation_error"; fields: string[] }
  | { ok: false; code: "turnstile_failed" | "rate_limited" };

export type DemoSubmitContext = {
  ip: string | null;
  now: Date;
  fetchFn?: typeof fetch;
  notify: DemoNotifyDeps;
};

/** `/demo`: zod → Turnstile → límite por IP → fila → correos (después de guardar, regla 6). */
export async function submitDemoRequest(
  db: AppDb,
  form: Record<string, string>,
  ctx: DemoSubmitContext,
): Promise<DemoSubmitResult> {
  const parsed = demoRequestSchema.safeParse(form);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    return { ok: false, code: "validation_error", fields };
  }
  const token = form["cf-turnstile-response"] ?? "";
  const human =
    token.length > 0 &&
    (await verifyTurnstile({
      token,
      ip: ctx.ip,
      secret: getTurnstileEnv().TURNSTILE_SECRET_KEY,
      fetchFn: ctx.fetchFn,
    }));
  if (!human || !human.success || (human.cdata !== null && human.cdata !== DEMO_TURNSTILE_CDATA)) {
    return { ok: false, code: "turnstile_failed" };
  }
  const created = await createDemoRequest(db, parsed.data, hashIp(ctx.ip), ctx.now);
  if (!created.ok) return created;
  const mail = await notifyDemoRequest(db, created.request, ctx.notify);
  log.info("demo_request.created", { requestId: created.request.id, ...mail });
  return { ok: true };
}
