import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  componentFamilies,
  componentModels,
  componentVariants,
  knowledgeSources,
  libraryCatalogTables,
  manufacturers,
  technicalDocuments,
  technicalSpecifications,
  toolsConsumables,
} from "../../src/server/db/schema-library-catalog.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

let test: TestDb;

beforeEach(async () => {
  test = await createTestDb();
});

afterEach(async () => {
  await test.close();
});

async function model() {
  const [manufacturer] = await test.db
    .insert(manufacturers)
    .values({ slug: "shimano", name: "Shimano" })
    .returning();
  if (!manufacturer) throw new Error("Falta el fabricante de prueba");
  const [family] = await test.db
    .insert(componentFamilies)
    .values({
      manufacturerId: manufacturer.id,
      slug: "deore-xt",
      name: "Deore XT",
      category: "transmision",
    })
    .returning();
  if (!family) throw new Error("Falta la familia de prueba");
  const [row] = await test.db
    .insert(componentModels)
    .values({
      familyId: family.id,
      code: "RD-M8100-SGS",
      name: "Cambio trasero de 12 velocidades",
      componentType: "cambio_trasero",
      speeds: 12,
    })
    .returning();
  if (!row) throw new Error("Falta el modelo de prueba");
  return row;
}

async function variant() {
  const [row] = await test.db
    .insert(componentVariants)
    .values({ modelId: (await model()).id, code: "RD-M8100-SGS" })
    .returning();
  if (!row) throw new Error("Falta la variante de prueba");
  return row;
}

it("migra las ocho tablas globales con identificador e instantes obligatorios", async () => {
  const tables = await test.client.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public'",
  );
  expect(libraryCatalogTables).toHaveLength(8);
  for (const table of libraryCatalogTables) {
    const name = getTableConfig(table).name;
    expect(tables.rows).toContainEqual({ table_name: name });
    const columns = await test.client.query(
      "select column_name, is_nullable, data_type from information_schema.columns where table_schema = 'public' and table_name = $1",
      [name],
    );
    for (const column of ["id", "created_at", "updated_at"]) {
      expect(columns.rows).toContainEqual({
        column_name: column,
        is_nullable: "NO",
        data_type: column === "id" ? "uuid" : "timestamp with time zone",
      });
    }
  }
});

it("crea usuarios sin marca de curador por defecto y permite habilitarla", async () => {
  const [branch] = await test.db
    .insert(branches)
    .values({ name: "Sucursal de prueba" })
    .returning();
  if (!branch) throw new Error("Falta la sucursal de prueba");
  const [user] = await test.db
    .insert(users)
    .values({
      branchId: branch.id,
      email: "curador@ejemplo.cl",
      passwordHash: "test-hash",
      name: "Curador",
      role: "admin",
    })
    .returning();
  if (!user) throw new Error("Falta el usuario de prueba");
  expect(user.libraryCurator).toBe(false);
  await expect(
    test.client.query(
      "insert into users (branch_id, email, password_hash, name, role, library_curator) values ($1, 'sin-marca@ejemplo.cl', 'test-hash', 'Curador', 'admin', null)",
      [branch.id],
    ),
  ).rejects.toThrow();
  const [curator] = await test.db
    .insert(users)
    .values({ ...user, id: undefined, email: "otro@ejemplo.cl", libraryCurator: true })
    .returning();
  expect(curator).toMatchObject({ libraryCurator: true });
});

it("distingue revisiones de una variante y rechaza la misma clave compuesta", async () => {
  const row = await variant();
  expect(row).toMatchObject({ revision: "", attributes: {}, status: "vigente" });
  const values = { modelId: row.modelId, code: row.code, revision: "B" };
  const [revision] = await test.db.insert(componentVariants).values(values).returning();
  expect(revision).toMatchObject({ revision: "B" });
  await expect(test.db.insert(componentVariants).values(values)).rejects.toThrow();
});

it("exige documento para verificar una especificación y valida su tipo", async () => {
  const row = await variant();
  const values = {
    variantId: row.id,
    kind: "torque",
    label: "Tornillo de fijación",
    valueText: "Consultar manual",
    validationStatus: "verificado",
  };
  await expect(test.db.insert(technicalSpecifications).values(values)).rejects.toThrow();
  const [document] = await test.db
    .insert(technicalDocuments)
    .values({ title: "Manual", canonicalUrl: "https://ejemplo.cl/manual", docType: "manual" })
    .returning();
  if (!document) throw new Error("Falta el documento de prueba");
  const [specification] = await test.db
    .insert(technicalSpecifications)
    .values({ ...values, sourceDocumentId: document.id })
    .returning();
  expect(specification).toMatchObject({
    validationStatus: "verificado",
    sourceDocumentId: document.id,
  });
  await expect(
    test.db
      .insert(technicalSpecifications)
      .values({ ...values, sourceDocumentId: document.id, kind: "otro_raro" }),
  ).rejects.toThrow();
});

it("exige copia autorizada para almacenamiento y documento único por URL y revisión", async () => {
  const values = {
    title: "Manual",
    canonicalUrl: "https://ejemplo.cl/manual",
    docType: "manual",
    storageKey: "biblioteca/manual.pdf",
  };
  await expect(
    test.db.insert(technicalDocuments).values({ ...values, license: "enlace" }),
  ).rejects.toThrow();
  const authorized = { ...values, license: "copia_autorizada" };
  const [document] = await test.db.insert(technicalDocuments).values(authorized).returning();
  expect(document).toMatchObject({ revision: "", language: "es", status: "vigente" });
  await expect(test.db.insert(technicalDocuments).values(authorized)).rejects.toThrow();
  await test.db.insert(technicalDocuments).values({ ...authorized, revision: "B" });
});

it("rechaza velocidades fuera del rango y años invertidos", async () => {
  const row = await model();
  await expect(
    test.db.insert(componentModels).values({ ...row, id: undefined, code: "OTRO", speeds: 15 }),
  ).rejects.toThrow();
  await expect(
    test.db
      .insert(componentVariants)
      .values({ modelId: row.id, code: row.code, yearFrom: 2026, yearTo: 2025 }),
  ).rejects.toThrow();
  await test.db
    .insert(componentVariants)
    .values({ modelId: row.id, code: row.code, yearFrom: 2026, yearTo: 2026 });
});

it("crea fuentes y herramientas con sus valores por defecto", async () => {
  const [source] = await test.db
    .insert(knowledgeSources)
    .values({
      publisher: "Fabricante",
      title: "Instrucciones",
      url: "https://ejemplo.cl",
      authority: "oficial",
    })
    .returning();
  expect(source).toMatchObject({ usagePolicy: "enlace" });
  const [tool] = await test.db
    .insert(toolsConsumables)
    .values({ name: "Llave de cassette", kind: "herramienta", category: "transmision" })
    .returning();
  expect(tool).toMatchObject({ manufacturerId: null, code: null });
});

it("omite branch_id del esquema y de las ocho tablas migradas", async () => {
  for (const table of libraryCatalogTables) {
    expect(Object.values(getTableColumns(table)).map((column) => column.name)).not.toContain(
      "branch_id",
    );
    const columns = await test.client.query(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = 'branch_id'",
      [getTableConfig(table).name],
    );
    expect(columns.rows).toEqual([]);
  }
});
