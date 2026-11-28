/** Tipos de respuesta que vale la pena comprimir: texto que el servidor genera en cada request. */
const COMPRESSIBLE = /^(text\/|application\/(json|ld\+json|xml|javascript)|image\/svg\+xml)/i;

/** Bajo este tamaño declarado, la cabecera de gzip pesa casi lo mismo que lo que ahorra. */
const MIN_BYTES = 1024;

function acceptsGzip(request: Request): boolean {
  const header = request.headers.get("accept-encoding") ?? "";
  return header
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .some((part) => (part === "gzip" || part.startsWith("gzip;")) && !/;\s*q=0(\.0+)?$/.test(part));
}

function shouldCompress(request: Request, response: Response): boolean {
  if (request.method === "HEAD" || !response.body) return false;
  if (response.status < 200 || response.status === 204 || response.status === 304) return false;
  if (response.headers.has("content-encoding")) return false;
  if (!COMPRESSIBLE.test(response.headers.get("content-type") ?? "")) return false;
  const length = response.headers.get("content-length");
  if (length !== null && Number(length) < MIN_BYTES) return false;
  return acceptsGzip(request);
}

function appendVary(headers: Headers): void {
  const vary = headers.get("vary");
  if (!vary) headers.set("vary", "Accept-Encoding");
  else if (!/accept-encoding/i.test(vary) && vary.trim() !== "*") {
    headers.set("vary", `${vary}, Accept-Encoding`);
  }
}

/**
 * Devuelve la respuesta comprimida con gzip cuando el navegador lo acepta y el contenido es
 * texto; si no, la misma respuesta. Comprime en flujo: no espera el cuerpo completo.
 */
export function compressResponse(request: Request, response: Response): Response {
  if (!shouldCompress(request, response) || !response.body) return response;
  const headers = new Headers(response.headers);
  headers.set("content-encoding", "gzip");
  headers.delete("content-length");
  appendVary(headers);
  const body = response.body.pipeThrough(
    new CompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
  );
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
