import { expect, it } from "vitest";
import {
  confirmFormToInput,
  confirmImportSchema,
  importFieldErrors,
} from "../../src/server/taller/purchase-import-confirm.ts";

function form(forSale = false) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    "supplier-mode": "create",
    "supplier-name": "Proveedor sintético",
    docType: "factura",
    docNumber: "42",
    "line-0-mode": "create",
    "line-0-sku": "LIM-01",
    "line-0-name": "Limpiador",
    "line-0-category": "insumo",
    "line-0-unit": "unidad",
    "line-0-priceClp": "",
    "line-0-quantity": "2",
    "line-0-unitCostClp": "1000",
    "line-0-forSalePresent": "1",
  }))
    data.set(key, value);
  if (forSale) data.set("line-0-forSale", "on");
  return data;
}
function errors(data: FormData) {
  const parsed = confirmImportSchema.safeParse(confirmFormToInput(data, 1));
  expect(parsed.success).toBe(false);
  if (parsed.success) throw new Error("Debió rechazar la entrada");
  return importFieldErrors(parsed.error);
}
it("acepta uso interno sin precio y conserva el valor explícito de la casilla", () => {
  const parsed = confirmImportSchema.parse(confirmFormToInput(form(), 1));
  expect(parsed.lines[0]).toMatchObject({ forSale: false, priceClp: null });
});
it("explica el precio faltante de un producto para la venta", () => {
  expect(errors(form(true))["line-0-priceClp"]).toBe(
    "Ingresa el precio de venta para crear este producto, o desmarca «Para la venta».",
  );
});
it.each([
  ["quantity", "0", "Ingresa una cantidad entera entre 1 y 10.000."],
  ["sku", "SKU CON ESPACIO", "Escribe un SKU de hasta 40 caracteres, sin espacios."],
  ["unitCostClp", "abc", "Ingresa el costo neto en pesos, sin puntos."],
  ["priceClp", "abc", "Ingresa el precio de venta neto en pesos, sin puntos."],
  ["name", "x", "Escribe un nombre de 2 a 120 caracteres."],
  ["unit", "", "Escribe la unidad (por ejemplo, unidad)."],
  ["category", "otra", "Elige una categoría."],
])("explica el campo %s", (key, value, message) => {
  const data = form();
  data.set(`line-0-${key}`, value);
  expect(errors(data)[`line-0-${key}`]).toBe(message);
});
it("mantiene vendibles los formularios anteriores sin marcador", () => {
  const data = form();
  data.delete("line-0-forSalePresent");
  expect(errors(data)["line-0-priceClp"]).toContain("Ingresa el precio de venta");
});
it("por defecto conserva vendibles las entradas antiguas y acepta precio cero explícito", () => {
  const input = confirmFormToInput(form(true), 1) as { lines: Record<string, unknown>[] };
  delete input.lines[0]!.forSale;
  input.lines[0]!.priceClp = 0;
  expect(confirmImportSchema.parse(input).lines[0]).toMatchObject({ forSale: true, priceClp: 0 });
});
