import { z } from "zod";
import { normalizeRut } from "../../lib/rut.ts";
import { AiProviderError } from "../library/ai-provider.ts";
import { INVOICE_IMPORT_MAX_LINES, netOfGross, vatOfNet } from "./rules.ts";

const nullableText = z.string().nullable();
const nullableNumber = z.number().nullable();
const supplierSchema = z.object({ name: nullableText, rut: nullableText });
const documentSchema = z.object({
  type: z.enum(["factura", "boleta", "guia"]).nullable(),
  number: nullableText,
  date: nullableText,
});
const confidenceSchema = z.enum(["alta", "media", "baja"]);
export const rawInvoiceSchema = z.object({
  supplier: supplierSchema,
  document: documentSchema,
  pricesIncludeVat: z.boolean(),
  lines: z.array(
    z.object({
      code: nullableText,
      description: z.string(),
      quantity: z.number(),
      unit: nullableText,
      unitPrice: z.number(),
      lineTotal: nullableNumber,
    }),
  ),
  totals: z.object({
    net: nullableNumber,
    exempt: nullableNumber,
    vat: nullableNumber,
    total: nullableNumber,
  }),
  confidence: confidenceSchema,
  warnings: z.array(z.string()),
});
export const extractionSchema = z.object({
  supplier: supplierSchema,
  document: documentSchema,
  pricesIncludeVat: z.boolean(),
  lines: z.array(
    z.object({
      code: nullableText,
      description: z.string(),
      quantity: z.number().int().positive(),
      unit: nullableText,
      unitCostClp: z.number().int().nonnegative(),
      lineTotalClp: nullableNumber,
    }),
  ),
  totals: z.object({
    netClp: nullableNumber,
    exemptClp: nullableNumber,
    vatClp: nullableNumber,
    totalClp: nullableNumber,
  }),
  confidence: confidenceSchema,
  warnings: z.array(z.string()),
});
export type InvoiceExtraction = z.infer<typeof extractionSchema>;
export type InvoiceLine = InvoiceExtraction["lines"][number];
type RawInvoice = z.infer<typeof rawInvoiceSchema>;
const text = (value: string | null, max: number) => value?.trim().slice(0, max) || null;
const rounded = (value: number | null) => (value === null ? null : Math.round(value));

function normalizeLines(raw: RawInvoice, warnings: string[]): InvoiceLine[] {
  if (raw.lines.length > INVOICE_IMPORT_MAX_LINES)
    warnings.push("Se conservaron solo las primeras 60 líneas.");
  if (raw.pricesIncludeVat)
    warnings.push("Los precios incluían IVA; se convirtieron a costos netos.");
  return raw.lines.slice(0, INVOICE_IMPORT_MAX_LINES).flatMap((line, index) => {
    const quantity = Math.round(line.quantity);
    if (quantity <= 0 || line.unitPrice < 0) {
      warnings.push(`Se omitió la línea ${index + 1}: cantidad o costo inválido.`);
      return [];
    }
    return [
      {
        code: text(line.code, 40),
        description: text(line.description, 200) ?? "",
        quantity,
        unit: text(line.unit, 20),
        unitCostClp: raw.pricesIncludeVat ? netOfGross(line.unitPrice) : Math.round(line.unitPrice),
        lineTotalClp:
          line.lineTotal === null
            ? null
            : raw.pricesIncludeVat
              ? netOfGross(line.lineTotal)
              : Math.round(line.lineTotal),
      },
    ];
  });
}
function arithmeticWarnings(
  lines: InvoiceLine[],
  totals: InvoiceExtraction["totals"],
  warnings: string[],
) {
  const { netClp: net, exemptClp: exempt, vatClp: vat, totalClp: total } = totals;
  const sum = lines.reduce((n, line) => n + Math.round(line.quantity * line.unitCostClp), 0);
  if (net !== null && Math.abs(sum - net) > Math.max(10, lines.length))
    warnings.push("La suma de las líneas no coincide con el neto leído.");
  if (
    net !== null &&
    exempt !== null &&
    vat !== null &&
    total !== null &&
    Math.abs(net + exempt + vat - total) > 2
  )
    warnings.push("Neto más exento e IVA no coincide con el total leído.");
  if (net !== null && vat !== null && Math.abs(vatOfNet(net) - vat) > 2)
    warnings.push("El IVA leído no coincide con el 19% del neto.");
}
export function normalizeInvoiceExtraction(raw: unknown): InvoiceExtraction {
  const parsed = rawInvoiceSchema.safeParse(raw);
  if (!parsed.success) throw new AiProviderError("invalid_json");
  const value = parsed.data;
  const warnings = [...value.warnings];
  const rut = value.supplier.rut ? normalizeRut(value.supplier.rut) : null;
  if (value.supplier.rut && !rut) warnings.push("El RUT del proveedor no es válido; revísalo.");
  const lines = normalizeLines(value, warnings);
  const totals = {
    netClp: rounded(value.totals.net),
    exemptClp: rounded(value.totals.exempt),
    vatClp: rounded(value.totals.vat),
    totalClp: rounded(value.totals.total),
  };
  arithmeticWarnings(lines, totals, warnings);
  return {
    supplier: { name: text(value.supplier.name, 120), rut },
    document: {
      type: value.document.type,
      number: text(value.document.number, 80),
      date:
        value.document.date && /^\d{4}-\d{2}-\d{2}$/.test(value.document.date)
          ? value.document.date
          : null,
    },
    pricesIncludeVat: value.pricesIncludeVat,
    lines,
    totals,
    confidence: value.confidence,
    warnings: [...new Set(warnings)],
  };
}
export function isPdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
}
export function pdfPageCount(bytes: Buffer): number | null {
  return bytes.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g)?.length || null;
}
