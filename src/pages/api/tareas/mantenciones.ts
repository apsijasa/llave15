import type { APIRoute } from "astro";
import { handleMaintenanceTask } from "../../../server/api/task-handlers.ts";
import { getDb } from "../../../server/db/client.ts";

export const prerender = false;

export const POST: APIRoute = ({ request }) => handleMaintenanceTask(request, getDb(), new Date());
