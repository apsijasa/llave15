import { errorMessage, log } from "../../lib/log.ts";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Verifica el token y su taller. Cualquier fallo de red o formato devuelve un fallo neutro. */
export async function verifyTurnstile(args: {
  token: string;
  ip: string | null;
  secret: string;
  fetchFn?: typeof fetch;
}): Promise<{ success: boolean; cdata: string | null }> {
  const body = new URLSearchParams({ secret: args.secret, response: args.token });
  if (args.ip) {
    body.set("remoteip", args.ip);
  }
  try {
    const doFetch = args.fetchFn ?? fetch;
    const response = await doFetch(VERIFY_URL, { method: "POST", body });
    const result = (await response.json()) as { success?: unknown; cdata?: unknown } | null;
    if (result?.success === true) {
      return { success: true, cdata: typeof result.cdata === "string" ? result.cdata : null };
    }
  } catch (error) {
    log.error("turnstile.error", { message: errorMessage(error) });
  }
  return { success: false, cdata: null };
}
