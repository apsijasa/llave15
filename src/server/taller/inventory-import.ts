import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import { isUniqueViolation } from "../db/client.ts";
import type { AppDb } from "../db/client.ts";
import { products } from "../db/schema-inventory.ts";
import { users } from "../db/schema.ts";
import { recordAudit } from "./audit.ts";
import { productFormSchema } from "./products.ts";
import { applyStockMovement } from "./stock.ts";

const HEADERS = [
  "sku",
  "nombre",
  "categoria",
  "costo",
  "precio",
  "stock",
  "minimo",
  "codigo_barras",
  "serie",
] as const;
const FIELDS = [
  "sku",
  "name",
  "category",
  "costClp",
  "priceClp",
  "stockQty",
  "minStock",
  "barcode",
  "serialNumber",
] as const;
const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
const optionsSchema = z.object({ dryRun: z.boolean() });
type CsvError = { line: number; message: string };
type CsvRow = { line: number; data: z.infer<typeof productFormSchema> };
type ParsedCsv = { rows: CsvRow[]; errors: CsvError[] };
type ImportResult =
  | { ok: true; created: number }
  | { ok: true; valid: number }
  | { ok: false; code: "forbidden" | "validation_error"; errors?: CsvError[] };

class ImportFailure extends Error {
  readonly errors: CsvError[];
  constructor(line: number, message: string) {
    super("No se pudo importar el inventario.");
    this.errors = [{ line, message }];
  }
}

function parseRow(text: string, separator: string, line: number): ParsedCsv {
  const invalid = (message: string): ParsedCsv => ({ rows: [], errors: [{ line, message }] });
  if (text.includes('"')) return invalid("No se permiten comillas dobles.");
  const values = text.split(separator).map((value) => value.trim() || null);
  if (values.length !== FIELDS.length) return invalid("La fila debe tener nueve columnas.");
  const input = Object.fromEntries(FIELDS.map((field, index) => [field, values[index]]));
  const parsed = productFormSchema.safeParse(input);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => {
      const index = FIELDS.findIndex((field) => field === issue.path[0]);
      return HEADERS[index] ?? "fila";
    });
    return invalid(`Revisa los campos: ${[...new Set(fields)].join(", ")}.`);
  }
  return { rows: [{ line, data: parsed.data }], errors: [] };
}

function duplicateErrors(rows: CsvRow[], field: "sku" | "barcode", label: string): CsvError[] {
  const linesByValue = new Map<string, number[]>();
  for (const row of rows) {
    const value = row.data[field];
    if (value) linesByValue.set(value, [...(linesByValue.get(value) ?? []), row.line]);
  }
  return [...linesByValue.values()].flatMap((lines) =>
    lines.length < 2
      ? []
      : lines.map((line) => ({ line, message: `${label} repetido en el archivo.` })),
  );
}

/** CSV simple sin comillas; los números de línea corresponden al archivo original. */
export function parseInventoryCsv(text: string): ParsedCsv {
  const parsedText = z.string().safeParse(text);
  if (!parsedText.success) return { rows: [], errors: [{ line: 1, message: "CSV inválido." }] };
  const lines = parsedText.data.split(/\r?\n/);
  const header = lines.shift() ?? "";
  const separator = header.includes(";") ? ";" : ",";
  if (header !== HEADERS.join(separator)) {
    return { rows: [], errors: [{ line: 1, message: "El encabezado del CSV no es válido." }] };
  }
  if (lines.at(-1) === "") lines.pop();
  const parsed = lines.map((line, index) => parseRow(line, separator, index + 2));
  const rows = parsed.flatMap((row) => row.rows);
  const errors = parsed.flatMap((row) => row.errors);
  if (!lines.length) errors.push({ line: 2, message: "Agrega al menos un producto." });
  errors.push(...duplicateErrors(rows, "sku", "SKU"));
  errors.push(...duplicateErrors(rows, "barcode", "Código de barras"));
  return { rows, errors: errors.sort((a, b) => a.line - b.line) };
}

async function existingErrors(db: AppDb, actor: SessionUser, rows: CsvRow[]): Promise<CsvError[]> {
  if (!rows.length) return [];
  const barcodes = rows.flatMap((row) => (row.data.barcode ? [row.data.barcode] : []));
  const existing = await db
    .select({ sku: products.sku, barcode: products.barcode })
    .from(products)
    .where(
      and(
        eq(products.branchId, actor.branchId),
        or(
          inArray(
            products.sku,
            rows.map((row) => row.data.sku),
          ),
          barcodes.length ? inArray(products.barcode, barcodes) : undefined,
        ),
      ),
    );
  const skus = new Set(existing.map((product) => product.sku));
  const codes = new Set(existing.map((product) => product.barcode));
  return rows.flatMap((row) => {
    const errors: CsvError[] = [];
    if (skus.has(row.data.sku))
      errors.push({ line: row.line, message: "El SKU ya existe en la sucursal." });
    if (row.data.barcode && codes.has(row.data.barcode))
      errors.push({ line: row.line, message: "El código de barras ya existe en la sucursal." });
    return errors;
  });
}

async function writeInitialStock(
  tx: AppDb,
  actor: SessionUser,
  row: CsvRow,
  productId: string,
  importId: string,
  now: Date,
) {
  if (row.data.stockQty === 0) return;
  const movement = await applyStockMovement(
    tx,
    actor,
    {
      productId,
      kind: "ajuste",
      quantity: row.data.stockQty,
      note: "Inventario inicial",
      referenceKind: "import",
      referenceId: importId,
    },
    now,
  );
  if (!movement.ok) throw new ImportFailure(row.line, "No se pudo registrar el stock inicial.");
}

async function writeProduct(
  tx: AppDb,
  actor: SessionUser,
  row: CsvRow,
  importId: string,
  now: Date,
) {
  const { stockQty: _stockQty, ...fields } = row.data;
  try {
    const [product] = await tx
      .insert(products)
      .values({
        ...fields,
        branchId: actor.branchId,
        createdBy: actor.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: products.id });
    if (!product) throw new Error("No se pudo crear el producto.");
    await writeInitialStock(tx, actor, row, product.id, importId, now);
  } catch (error) {
    if (isUniqueViolation(error))
      throw new ImportFailure(row.line, "El producto tiene un valor único repetido.");
    throw error;
  }
}

async function writeImport(tx: AppDb, actor: SessionUser, rows: CsvRow[], now: Date) {
  const importId = randomUUID();
  for (const row of rows) await writeProduct(tx, actor, row, importId, now);
  await recordAudit(
    tx,
    {
      branchId: actor.branchId,
      actorUserId: actor.id,
      action: "inventory.imported",
      entity: "inventory_import",
      entityId: importId,
      details: { count: rows.length },
    },
    now,
  );
  return { ok: true, created: rows.length } as const;
}

async function importActor(db: AppDb, email: string): Promise<SessionUser | null> {
  const parsedEmail = emailSchema.safeParse(email);
  if (!parsedEmail.success) return null;
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      branchId: users.branchId,
    })
    .from(users)
    .where(
      and(
        eq(users.email, parsedEmail.data),
        eq(users.isActive, true),
        inArray(users.role, ["owner", "admin"]),
      ),
    );
  if (!user || (user.role !== "owner" && user.role !== "admin")) return null;
  return { ...user, role: user.role };
}

export async function importInventory(
  db: AppDb,
  email: string,
  text: string,
  now: Date,
  options: { dryRun: boolean } = { dryRun: false },
): Promise<ImportResult> {
  const actor = await importActor(db, email);
  if (!actor) return { ok: false, code: "forbidden" };
  const parsedOptions = optionsSchema.safeParse(options);
  if (!parsedOptions.success) return { ok: false, code: "validation_error" };
  const parsed = parseInventoryCsv(text);
  try {
    return await db.transaction(async (tx): Promise<ImportResult> => {
      const errors = [...parsed.errors, ...(await existingErrors(tx, actor, parsed.rows))];
      if (errors.length)
        return {
          ok: false,
          code: "validation_error",
          errors: errors.sort((a, b) => a.line - b.line),
        };
      if (parsedOptions.data.dryRun) return { ok: true, valid: parsed.rows.length };
      return writeImport(tx, actor, parsed.rows, now);
    });
  } catch (error) {
    if (error instanceof ImportFailure)
      return { ok: false, code: "validation_error", errors: error.errors };
    throw error;
  }
}
