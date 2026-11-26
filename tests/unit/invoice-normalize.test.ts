import { expect, it } from "vitest";
import { AiProviderError } from "../../src/server/library/ai-provider.ts";
import {
  normalizeInvoiceExtraction,
  isPdf,
  pdfPageCount,
} from "../../src/server/taller/invoice-normalize.ts";
import { netOfGross } from "../../src/server/taller/rules.ts";

const raw = () => ({
  supplier: { name: "Proveedor sintético", rut: "12.345.678-5" },
  document: { type: "factura", number: "123", date: "2026-11-26" },
  pricesIncludeVat: false,
  lines: [
    {
      code: "CAD",
      description: "Cadena sintética",
      quantity: 1,
      unit: "unidad",
      unitPrice: 21008.4,
      lineTotal: 21008.4,
    },
  ],
  totals: { net: 21008, exempt: 0, vat: 3992, total: 25000 },
  confidence: "alta",
  warnings: [],
});

it("redondea costos y totales al peso, cantidades y recorta textos", () => {
  const input = raw();
  input.lines[0]!.quantity = 1.2;
  input.lines[0]!.description = "x".repeat(250);
  const result = normalizeInvoiceExtraction(input);
  expect(result.lines[0]).toMatchObject({ quantity: 1, unitCostClp: 21008, lineTotalClp: 21008 });
  expect(result.lines[0]!.description).toHaveLength(200);
});
it("convierte precios con IVA a neto y avisa", () => {
  const input = { ...raw(), pricesIncludeVat: true };
  const result = normalizeInvoiceExtraction(input);
  expect(result.lines[0]!.unitCostClp).toBe(netOfGross(21008.4));
  expect(result.warnings.join(" ")).toMatch(/IVA/);
});
it("normaliza RUT válido y elimina el inválido con aviso", () => {
  expect(normalizeInvoiceExtraction(raw()).supplier.rut).toBe("12345678-5");
  const input = raw();
  input.supplier.rut = "12.345.678-9";
  const result = normalizeInvoiceExtraction(input);
  expect(result.supplier.rut).toBeNull();
  expect(result.warnings.join(" ")).toMatch(/RUT/);
});
it("omite fecha no ISO y cualquier dato del receptor", () => {
  const input = raw();
  input.document.date = "Jueves 26 de noviembre del 2026";
  const result = normalizeInvoiceExtraction({ ...input, receiver: { name: "Comprador secreto" } });
  expect(result.document.date).toBeNull();
  expect(JSON.stringify(result)).not.toContain("Comprador secreto");
});
it("limita a sesenta líneas y descarta cantidades y costos inválidos", () => {
  const input = raw();
  input.lines = Array.from({ length: 61 }, () => ({ ...input.lines[0]! }));
  expect(normalizeInvoiceExtraction(input).lines).toHaveLength(60);
  expect(normalizeInvoiceExtraction(input).warnings.join(" ")).toMatch(/60/);
  input.lines = [
    { ...input.lines[0]!, quantity: 0 },
    { ...input.lines[0]!, unitPrice: -1 },
  ];
  const result = normalizeInvoiceExtraction(input);
  expect(result.lines).toEqual([]);
  expect(result.warnings.length).toBeGreaterThan(0);
});
it.each(["net", "vat", "total"] as const)("avisa discrepancia aritmética en %s", (key) => {
  const input = raw();
  input.totals[key] = 80000;
  expect(normalizeInvoiceExtraction(input).warnings.length).toBeGreaterThan(0);
});
it("deduplica los avisos y rechaza esquema inválido", () => {
  expect(normalizeInvoiceExtraction({ ...raw(), warnings: ["Duda", "Duda"] }).warnings).toEqual([
    "Duda",
  ]);
  expect(() => normalizeInvoiceExtraction({})).toThrow(AiProviderError);
  expect(() => normalizeInvoiceExtraction({})).toThrow("invalid_json");
});
it("detecta PDF por firma y cuenta páginas sin confundir Pages", () => {
  expect(isPdf(Buffer.from("%PDF-1.7"))).toBe(true);
  expect(isPdf(Buffer.from("basura"))).toBe(false);
  expect(pdfPageCount(Buffer.from("%PDF- /Type /Pages /Type /Page /Type /Page /Type /Page"))).toBe(
    3,
  );
  expect(pdfPageCount(Buffer.from("%PDF- comprimido"))).toBeNull();
});
