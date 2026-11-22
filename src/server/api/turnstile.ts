import { errorMessage, log } from "../../lib/log.ts";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_LOGGED_CODES = 8;

export type TurnstileResult = { success: boolean; cdata: string | null };

type SiteverifyBody = {
  success?: unknown;
  cdata?: unknown;
  hostname?: unknown;
  "error-codes"?: unknown;
};

/** Códigos de siteverify aptos para el log: solo texto, a lo más ocho. */
function errorCodesOf(body: SiteverifyBody | null): string[] {
  const codes = body?.["error-codes"];
  if (!Array.isArray(codes)) return [];
  return codes
    .filter((code): code is string => typeof code === "string")
    .slice(0, MAX_LOGGED_CODES);
}

/** Registra por qué Cloudflare rechazó el token; nunca el token, la clave ni la IP. */
function logRejection(status: number, body: SiteverifyBody | null): void {
  log.error("turnstile.rejected", {
    status,
    errorCodes: errorCodesOf(body),
    hostname: typeof body?.hostname === "string" ? body.hostname : null,
  });
}

/** Verifica el token y su taller. Cualquier fallo de red o formato devuelve un fallo neutro. */
export async function verifyTurnstile(args: {
  token: string;
  ip: string | null;
  secret: string;
  fetchFn?: typeof fetch;
}): Promise<TurnstileResult> {
  const body = new URLSearchParams({ secret: args.secret, response: args.token });
  if (args.ip) {
    body.set("remoteip", args.ip);
  }
  try {
    const doFetch = args.fetchFn ?? fetch;
    const response = await doFetch(VERIFY_URL, { method: "POST", body });
    const result = (await response.json()) as SiteverifyBody | null;
    if (result?.success === true) {
      return { success: true, cdata: typeof result.cdata === "string" ? result.cdata : null };
    }
    logRejection(response.status, result);
  } catch (error) {
    log.error("turnstile.error", { message: errorMessage(error) });
  }
  return { success: false, cdata: null };
}

/**
 * Pasa si siteverify dijo que sí y, cuando devuelve `cdata`, es el esperado (slug o `demo`).
 * `false` = no hubo token que verificar. El rechazo de Cloudflare ya quedó registrado.
 */
export function passesTurnstile(result: TurnstileResult | false, expectedCdata: string): boolean {
  if (result === false || !result.success) return false;
  if (result.cdata !== null && result.cdata !== expectedCdata) {
    log.error("turnstile.cdata_mismatch", { expected: expectedCdata, received: result.cdata });
    return false;
  }
  return true;
}
