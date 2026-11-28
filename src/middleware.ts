import { defineMiddleware } from "astro:middleware";
import { compressResponse } from "./lib/http-compression.ts";

/** El servidor standalone no comprime: el HTML, el JSON y los CSV salen con gzip desde acá. */
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  return compressResponse(context.request, response);
});
