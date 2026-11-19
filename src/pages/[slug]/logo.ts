import type { APIRoute } from "astro";
import { getDb } from "../../server/db/client.ts";
import { handleLogoRequest } from "../../server/shops/profile.ts";
import { getStorage } from "../../server/storage/storage.ts";

export const prerender = false;

export const GET: APIRoute = async ({ params }) =>
  handleLogoRequest(getDb(), await getStorage(), params.slug ?? "");
