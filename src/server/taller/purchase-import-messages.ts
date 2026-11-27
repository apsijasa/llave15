// Mensajes por campo de la revisión de factura (F2-D35): dicen qué falta en vez del texto genérico.
import type { z } from "zod";

const FIELD_MESSAGES: Record<string, string> = {
  quantity: "Ingresa una cantidad entera entre 1 y 10.000.",
  unitCostClp: "Ingresa el costo neto en pesos, sin puntos.",
  priceClp: "Ingresa el precio de venta neto en pesos, sin puntos.",
  sku: "Escribe un SKU de hasta 40 caracteres, sin espacios.",
  name: "Escribe un nombre de 2 a 120 caracteres.",
  unit: "Escribe la unidad (por ejemplo, unidad).",
  category: "Elige una categoría.",
  productId: "Elige un producto existente.",
  mode: "Elige qué hacer con esta línea.",
  supplierId: "Elige un proveedor.",
  "supplier-name": "Escribe la razón social del proveedor.",
  rut: "Ingresa un RUT válido.",
  docType: "Elige el tipo de documento.",
  docNumber: "Escribe el folio.",
};
export function importFieldErrors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => {
      const path = issue.path;
      const name =
        path[0] === "lines"
          ? `line-${String(path[1] ?? 0)}-${String(path[2] ?? "mode")}`
          : path.map(String).join("-");
      return [
        name,
        issue.code === "custom"
          ? issue.message
          : (FIELD_MESSAGES[name === "supplier-name" ? name : String(path.at(-1))] ??
            "Revisa este campo e ingresa un valor válido."),
      ];
    }),
  );
}
