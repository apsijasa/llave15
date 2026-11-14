import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it } from "vitest";
import { products, stockMovements } from "../../src/server/db/schema-inventory.ts";
import { auditLog } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { importInventory, parseInventoryCsv } from "../../src/server/taller/inventory-import.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-14T15:00:00Z");
const HEADER = "sku,nombre,categoria,costo,precio,stock,minimo,codigo_barras,serie";
const ROWS = [
  "REP-01,Cadena,repuesto,1000,2000,5,2,COD-01,",
  "ACC-01,Casco,accesorio,5000,9000,0,1,,",
  "BIC-01,Bicicleta usada,bicicleta_usada,10000,30000,1,0,,SER-01",
];
const CSV = [HEADER, ...ROWS].join("\n");
let test: TestDb;
let owner: typeof users.$inferSelect;

beforeEach(async () => {
  test = await createTestDb();
  const [branch] = await test.db.insert(branches).values({ name: "Sucursal" }).returning();
  if (!branch) throw new Error("Falta sucursal");
  const [user] = await test.db
    .insert(users)
    .values({
      branchId: branch.id,
      name: "Dueño",
      email: "owner@ejemplo.cl",
      role: "owner",
      passwordHash: "hash-de-prueba",
    })
    .returning();
  if (!user) throw new Error("Falta usuario");
  owner = user;
});

afterEach(async () => {
  await test.close();
});

const run = (text = CSV, dryRun = false, email = owner.email) =>
  importInventory(test.db, email, text, NOW, { dryRun });

async function expectEmpty() {
  expect(await test.db.select().from(products)).toHaveLength(0);
  expect(await test.db.select().from(stockMovements)).toHaveLength(0);
  expect(await test.db.select().from(auditLog)).toHaveLength(0);
}

async function expectInitialProducts() {
  const rows = await test.db.select().from(products).orderBy(products.sku);
  expect(rows.map((row) => [row.sku, row.stockQty, row.costClp, row.priceClp])).toEqual([
    ["ACC-01", 0, 5000, 9000],
    ["BIC-01", 1, 10000, 30000],
    ["REP-01", 5, 1000, 2000],
  ]);
  for (const row of rows) {
    expect(row).toMatchObject({
      branchId: owner.branchId,
      createdBy: owner.id,
      createdAt: NOW,
      updatedAt: NOW,
      unit: "unidad",
      supplierId: null,
    });
  }
  return rows;
}

it("importa tres productos con stock, referencia común, autoría y auditoría", async () => {
  expect(await run()).toEqual({ ok: true, created: 3 });
  const rows = await expectInitialProducts();
  const movements = await test.db.select().from(stockMovements);
  expect(movements.map((movement) => movement.quantity).sort()).toEqual([1, 5]);
  for (const movement of movements) {
    expect(movement).toMatchObject({
      kind: "ajuste",
      note: "Inventario inicial",
      referenceKind: "import",
      branchId: owner.branchId,
      createdBy: owner.id,
      createdAt: NOW,
    });
    expect(movement.referenceId).toMatch(/^[\da-f-]{36}$/);
    expect(rows.some((row) => row.id === movement.productId)).toBe(true);
  }
  expect(new Set(movements.map((movement) => movement.referenceId)).size).toBe(1);
  expect(await test.db.select().from(auditLog)).toMatchObject([
    {
      action: "inventory.imported",
      actorUserId: owner.id,
      branchId: owner.branchId,
      entityId: movements[0]?.referenceId,
      details: { count: 3 },
      createdAt: NOW,
    },
  ]);
});

it("acepta punto y coma, CRLF y campos opcionales vacíos como nulos", async () => {
  const text = `${CSV.replaceAll(",", ";").replaceAll("\n", "\r\n")}\r\n`;
  expect(parseInventoryCsv(text)).toEqual(parseInventoryCsv(CSV));
  expect(await run(text)).toEqual({ ok: true, created: 3 });
  const [helmet] = await test.db.select().from(products).where(eq(products.sku, "ACC-01"));
  expect(helmet).toMatchObject({ barcode: null, serialNumber: null });
});

it.each([
  ["encabezado", HEADER.replace("costo", "costos"), 1],
  ["archivo vacío", "", 1],
  ["sin productos", HEADER, 2],
  ["comillas", `${HEADER}\n${ROWS[0]?.replace("Cadena", '"Cadena"')}`, 2],
  ["encabezado con comillas", `"${HEADER}"\n${ROWS[0]}`, 1],
  ["columnas faltantes", `${HEADER}\nREP,Cadena,repuesto,1,2,3,4`, 2],
  ["columnas extra", `${HEADER}\n${ROWS[0]},extra`, 2],
  ["categoría", `${HEADER}\nREP,Cadena,Repuesto,1,2,3,4,,`, 2],
  ["costo negativo", `${HEADER}\nREP,Cadena,repuesto,-1,2,3,4,,`, 2],
  ["precio decimal", `${HEADER}\nREP,Cadena,repuesto,1,2.5,3,4,,`, 2],
  ["stock excesivo", `${HEADER}\nREP,Cadena,repuesto,1,2,100001,4,,`, 2],
  ["mínimo negativo", `${HEADER}\nREP,Cadena,repuesto,1,2,3,-1,,`, 2],
  ["precio vacío", `${HEADER}\nREP,Cadena,repuesto,1,,3,4,,`, 2],
  ["sin serie", `${HEADER}\nBIC,Bicicleta,bicicleta_usada,1,2,1,0,,`, 2],
  ["línea vacía intermedia", `${HEADER}\n\n${ROWS[0]}`, 2],
])("rechaza %s con número de línea", (_label, text, line) => {
  const parsed = parseInventoryCsv(String(text));
  expect(parsed.errors).toContainEqual({ line, message: expect.any(String) });
});

it("reporta todos los SKU repetidos del archivo sin escribir", async () => {
  const result = await run(`${HEADER}\n${ROWS[0]}\nREP-01,Otra cadena,repuesto,1,2,0,0,,`);
  expect(result).toMatchObject({ ok: false, code: "validation_error" });
  if (result.ok || !result.errors) throw new Error("Faltan errores");
  expect(result.errors.map((error) => error.line)).toEqual([2, 3]);
  await expectEmpty();
});

it("reúne errores de filas y SKU existentes sin importar productos nuevos", async () => {
  expect(await run()).toEqual({ ok: true, created: 3 });
  const before = await test.db.select().from(products);
  const result = await run(
    `${HEADER}\n${ROWS[0]}\nNUEVO,Cadena,repuesto,-1,2,1,0,,\nOTRO,Casco,accesorio,1,2,0,0,,`,
  );
  expect(result).toMatchObject({ ok: false, code: "validation_error" });
  if (result.ok || !result.errors) throw new Error("Faltan errores");
  expect([...new Set(result.errors.map((error) => error.line))]).toEqual([2, 3]);
  expect(await test.db.select().from(products)).toEqual(before);
  expect(await test.db.select().from(stockMovements)).toHaveLength(2);
  expect(await test.db.select().from(auditLog)).toHaveLength(1);
});

it.each(["reception", "mechanic", "inactivo-owner", "inactivo-admin", "desconocido", "inválido"])(
  "rechaza usuario %s sin escribir",
  async (kind) => {
    const inactive = kind.startsWith("inactivo-");
    const role = inactive ? kind.slice(9) : kind;
    if (kind !== "desconocido" && kind !== "inválido") {
      await test.db.update(users).set({ role, isActive: !inactive }).where(eq(users.id, owner.id));
    }
    const email =
      kind === "desconocido" ? "otro@ejemplo.cl" : kind === "inválido" ? "otro" : owner.email;
    expect(await run(CSV, false, email)).toEqual({ ok: false, code: "forbidden" });
    await expectEmpty();
  },
);

it("permite administración y normaliza el correo", async () => {
  await test.db.update(users).set({ role: "admin" }).where(eq(users.id, owner.id));
  expect(await run(CSV, false, " OWNER@EJEMPLO.CL ")).toEqual({ ok: true, created: 3 });
});

it("dry-run valida filas y duplicados sin escribir productos, movimientos ni auditoría", async () => {
  expect(await run(CSV, true)).toEqual({ ok: true, valid: 3 });
  await expectEmpty();
  await run();
  expect(await run(CSV, true)).toMatchObject({ ok: false, code: "validation_error" });
  expect(await test.db.select().from(products)).toHaveLength(3);
  expect(await test.db.select().from(auditLog)).toHaveLength(1);
});

it("limita la búsqueda de duplicados y las escrituras a la sucursal del usuario", async () => {
  await run();
  const [other] = await test.db.insert(branches).values({ name: "Otra sucursal" }).returning();
  if (!other) throw new Error("Falta sucursal");
  await test.db.update(users).set({ branchId: other.id }).where(eq(users.id, owner.id));
  expect(await run()).toEqual({ ok: true, created: 3 });
  expect(await test.db.select().from(products).where(eq(products.branchId, other.id))).toHaveLength(
    3,
  );
});

it("rechaza códigos de barras repetidos en el archivo o existentes, también en dry-run", async () => {
  const repeated = `${HEADER}\n${ROWS[0]}\nOTRO,Pastillas,repuesto,1,2,1,0,COD-01,`;
  expect(await run(repeated, true)).toMatchObject({ ok: false, code: "validation_error" });
  await expectEmpty();
  await run();
  const result = await run(`${HEADER}\nOTRO,Pastillas,repuesto,1,2,1,0,COD-01,`);
  expect(result).toMatchObject({
    ok: false,
    code: "validation_error",
    errors: [{ line: 2, message: expect.any(String) }],
  });
  expect(await test.db.select().from(products)).toHaveLength(3);
});

it("revierte escrituras previas y reporta la línea si aparece una colisión al insertar", async () => {
  await test.client.exec("create unique index test_product_name on products (name)");
  const result = await run(`${HEADER}\n${ROWS[0]}\nOTRO,Cadena,repuesto,1,2,1,0,,`);
  expect(result).toMatchObject({
    ok: false,
    code: "validation_error",
    errors: [{ line: 3, message: expect.any(String) }],
  });
  await expectEmpty();
});

it("revierte producto y movimiento si el ajuste de stock devuelve un error", async () => {
  await test.client.exec(
    "alter table products drop constraint products_stock_qty_check; alter table products add constraint products_stock_qty_check check (stock_qty = 0)",
  );
  expect(await run()).toMatchObject({
    ok: false,
    code: "validation_error",
    errors: [{ line: 2, message: expect.any(String) }],
  });
  await expectEmpty();
});

it("revierte toda la importación si falla la auditoría", async () => {
  await test.client.exec(
    "alter table audit_log add constraint test_reject_import check (action <> 'inventory.imported')",
  );
  await expect(run()).rejects.toThrow();
  await expectEmpty();
});

it("el CLI sin argumentos muestra uso y sale 2 antes de cargar módulos de base", () => {
  const result = spawnSync(process.execPath, ["scripts/inventory-import.ts"], {
    encoding: "utf8",
    env: { PATH: "/usr/bin:/bin" },
    timeout: 5000,
  });
  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("Uso:");
  expect(result.stderr).not.toMatch(/DATABASE_URL|ERR_MODULE_NOT_FOUND|postgres/i);
});

it("el CLI distingue archivo ilegible de base no configurada sin exponer datos", () => {
  for (const [file, status, code] of [
    ["/archivo-inventario-inexistente.csv", 1, "file_error"],
    ["package.json", 2, "database_error"],
  ] as const) {
    const result = spawnSync(process.execPath, ["scripts/inventory-import.ts", file, owner.email], {
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin" },
      timeout: 10000,
    });
    expect(result.status).toBe(status);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({ ok: false, code });
    expect(result.stderr).not.toContain(owner.email);
    expect(result.stderr).not.toMatch(/DATABASE_URL|password|costClp|10000/);
  }
});

it("registra el comando inventory:import exacto", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  expect(pkg.scripts["inventory:import"]).toBe(
    "node --env-file-if-exists=.env scripts/inventory-import.ts",
  );
});
