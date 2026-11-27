import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { deliveryDateSchema } from "./delivery-date.ts";
import { changeDeliveryDate } from "./delivery-notice.ts";
import { addAccessory, isChecklistComplete, saveChecklist } from "./intake.ts";
import { addCatalogItem, catalogItemSchema } from "./items.ts";
import { getOrderHeader } from "./orders.ts";

/** Vacío o solo espacios: el campo no se llenó y ese paso se salta. */
const optionalText = z
  .string()
  .trim()
  .max(200, "El accesorio no puede superar los 200 caracteres.")
  .optional()
  .transform((value) => value || undefined);

/**
 * "Continuar a fotos y firma": el checklist viaja aparte (`checklistFormSchema`); aquí van el
 * accesorio y el servicio que hayan quedado escritos sin agregar, y la fecha de entrega.
 */
export const continueFormSchema = z.object({
  accion: z.literal("continuar"),
  description: optionalText,
  serviceId: z
    .union([z.literal(""), catalogItemSchema.shape.serviceId])
    .optional()
    .transform((value) => value || undefined),
  quantity: catalogItemSchema.shape.quantity,
  date: deliveryDateSchema,
});

export type ContinueInput = {
  checklist: unknown;
  description?: string;
  serviceId?: string;
  quantity: number;
  date: string;
};

export type ContinueResult =
  | { ok: true; complete: boolean }
  | {
      ok: false;
      code:
        | "forbidden"
        | "not_found"
        | "invalid_status"
        | "invalid_state"
        | "validation_error"
        | "no_price"
        | "invalid_date";
    };

type StepResult = { ok: true } | { ok: false; code: string };

function failure(result: StepResult): ContinueResult | null {
  if (result.ok) return null;
  return { ok: false, code: result.code as Extract<ContinueResult, { ok: false }>["code"] };
}

/**
 * Guarda la recepción completa de una vez: checklist, accesorio y servicio pendientes, y la
 * fecha de entrega. Cada paso es su propia transacción (los mismos de los botones sueltos); al
 * primer error se detiene y lo anterior queda guardado. `complete` dice si el checklist quedó
 * con los 7 puntos, que es lo que pide la firma.
 */
export async function continueReception(
  db: AppDb,
  actor: SessionUser,
  orderId: string,
  input: ContinueInput,
  now: Date,
): Promise<ContinueResult> {
  if (!can(actor.role, "reception.perform")) return { ok: false, code: "forbidden" };
  const header = await getOrderHeader(db, actor, orderId);
  if (!header || header.order.voidedAt) return { ok: false, code: "not_found" };
  if (header.order.status !== "creado" || header.order.receivedAt !== null)
    return { ok: false, code: "invalid_status" };
  const steps: Array<() => Promise<StepResult>> = [
    () => saveChecklist(db, actor, orderId, input.checklist, now),
    ...(input.description
      ? [() => addAccessory(db, actor, orderId, { description: input.description }, now)]
      : []),
    ...(input.serviceId
      ? [
          () =>
            addCatalogItem(
              db,
              actor,
              orderId,
              { serviceId: input.serviceId, quantity: input.quantity },
              now,
            ),
        ]
      : []),
    () => changeDeliveryDate(db, actor, orderId, input.date, now),
  ];
  for (const step of steps) {
    const failed = failure(await step());
    if (failed) return failed;
  }
  return { ok: true, complete: await isChecklistComplete(db, orderId) };
}

/** Texto para el personal según el código de error de la recepción. */
export function receptionErrorMessage(code: string): string {
  switch (code) {
    case "invalid_status":
      return "La orden ya está cerrada.";
    case "invalid_state":
      return "El checklist solo se puede guardar en una orden en estado Creado.";
    case "not_found":
      return "No se encontró la orden o el accesorio.";
    case "no_price":
      return "El servicio no tiene precio para este tipo de bicicleta.";
    case "invalid_date":
      return "La fecha de entrega debe ser hoy o posterior.";
    default:
      return "Revisa los datos de la recepción.";
  }
}
