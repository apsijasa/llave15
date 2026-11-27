import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { normalizeRut } from "../../lib/rut.ts";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { products, suppliers } from "../db/schema-inventory.ts";
import type { InvoiceExtraction, InvoiceLine } from "./invoice-normalize.ts";

export type SupplierMatch = { supplierId: string | null; by: "rut" | "name" | null };
export type ProductOption = { productId: string; sku: string; name: string; unit: string };
export type LineView = InvoiceLine & {
  index: number;
  match: ProductOption | null;
  matchedBy: "sku" | "barcode" | null;
  suggestions: ProductOption[];
};
export async function matchSupplier(
  db: AppDb,
  actor: SessionUser,
  supplier: InvoiceExtraction["supplier"],
): Promise<SupplierMatch> {
  const empty = { supplierId: null, by: null };
  if (!can(actor.role, "purchases.manage") || !can(actor.role, "costs.view")) return empty;
  const rut = supplier.rut ? normalizeRut(supplier.rut) : null;
  if (rut) {
    const [row] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.branchId, actor.branchId), eq(suppliers.rut, rut)))
      .limit(1);
    if (row) return { supplierId: row.id, by: "rut" };
  }
  if (!supplier.name) return empty;
  const rows = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(
      and(
        eq(suppliers.branchId, actor.branchId),
        eq(sql`lower(${suppliers.name})`, supplier.name.toLowerCase()),
      ),
    )
    .limit(2);
  const [row] = rows;
  return rows.length === 1 && row ? { supplierId: row.id, by: "name" } : empty;
}
const productFields = {
  productId: products.id,
  sku: products.sku,
  name: products.name,
  unit: products.unit,
};
function escaped(word: string) {
  return word.replace(/[\\%_]/g, "\\$&");
}
async function suggestions(
  db: AppDb,
  actor: SessionUser,
  description: string,
): Promise<ProductOption[]> {
  const words = description
    .split(/\s+/)
    .filter((word) => (word.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 3)
    .slice(0, 2);
  if (!words.length) return [];
  const lookup = (parts: string[]) =>
    db
      .select(productFields)
      .from(products)
      .where(
        and(
          eq(products.branchId, actor.branchId),
          eq(products.isActive, true),
          ...parts.map((word) => ilike(products.name, `%${escaped(word)}%`)),
        ),
      )
      .orderBy(asc(products.name), asc(products.id))
      .limit(3);
  const rows = await lookup(words);
  return rows.length || words.length === 1 ? rows : lookup(words.slice(0, 1));
}
export async function matchLines(
  db: AppDb,
  actor: SessionUser,
  lines: InvoiceLine[],
): Promise<LineView[]> {
  if (!can(actor.role, "purchases.manage") || !can(actor.role, "costs.view")) return [];
  const codes = [...new Set(lines.flatMap((line) => (line.code ? [line.code] : [])))];
  const rows = codes.length
    ? await db
        .select({ ...productFields, barcode: products.barcode })
        .from(products)
        .where(
          and(
            eq(products.branchId, actor.branchId),
            eq(products.isActive, true),
            or(
              inArray(
                sql`lower(${products.sku})`,
                codes.map((code) => code.toLowerCase()),
              ),
              inArray(products.barcode, codes),
            ),
          ),
        )
        .orderBy(asc(products.id))
    : [];
  return Promise.all(
    lines.map(async (line, index) => {
      const code = line.code?.toLowerCase();
      const sku = code ? rows.find((row) => row.sku.toLowerCase() === code) : undefined;
      const barcode = line.code ? rows.find((row) => row.barcode === line.code) : undefined;
      const found = sku ?? barcode;
      const match = found
        ? { productId: found.productId, sku: found.sku, name: found.name, unit: found.unit }
        : null;
      return {
        ...line,
        index,
        match,
        matchedBy: sku ? "sku" : barcode ? "barcode" : null,
        suggestions: match ? [] : await suggestions(db, actor, line.description),
      };
    }),
  );
}
