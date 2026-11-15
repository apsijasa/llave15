import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import * as permissions from "../../src/server/auth/permissions.ts";
import {
  componentFamilies,
  componentModels,
  componentVariants,
  manufacturers,
  technicalDocuments,
  technicalSpecifications,
  toolsConsumables,
} from "../../src/server/db/schema-library-catalog.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { SPEC_KINDS } from "../../src/server/library/rules.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const api = () => import("../../src/server/library/specifications.ts");
let test: TestDb;
let actor: SessionUser;
let variantId: string;
let modelId: string;
let manufacturerId: string;
let documentId: string;

beforeEach(async () => {
  test = await createTestDb();
  const [branch] = await test.db.insert(branches).values({ name: "Sucursal" }).returning();
  if (!branch) throw new Error("Falta sucursal");
  const [user] = await test.db
    .insert(users)
    .values({
      branchId: branch.id,
      name: "Mecánico",
      email: "mecanico@ejemplo.cl",
      role: "mechanic",
      passwordHash: "prueba",
    })
    .returning();
  if (!user) throw new Error("Falta usuario");
  actor = { ...user, role: "mechanic" };
  await seedCatalog();
  return async () => {
    vi.restoreAllMocks();
    await test.close();
  };
});

async function seedCatalog() {
  manufacturerId = randomUUID();
  const familyId = randomUUID();
  modelId = randomUUID();
  variantId = randomUUID();
  documentId = randomUUID();
  await test.db
    .insert(manufacturers)
    .values({ id: manufacturerId, slug: "fabricante", name: "Fabricante" });
  await test.db.insert(componentFamilies).values({
    id: familyId,
    manufacturerId,
    slug: "serie",
    name: "Serie",
    category: "transmision",
  });
  await test.db.insert(componentModels).values({
    id: modelId,
    familyId,
    code: "CN-TEST",
    name: "Cadena de prueba",
    componentType: "cadena",
  });
  await test.db
    .insert(componentVariants)
    .values({ id: variantId, modelId, code: "CN-TEST", revision: "B" });
  await test.db.insert(technicalDocuments).values({
    id: documentId,
    title: "Manual de prueba",
    canonicalUrl: "https://ejemplo.cl/manual",
    docType: "manual",
  });
}

async function lookup(input: unknown) {
  const result = await (await api()).lookupSpecifications(test.db, actor, input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.code);
  return result;
}

async function seedTools() {
  await test.db.insert(toolsConsumables).values([
    {
      name: "Alicate de cierre",
      code: "TL-CN10",
      kind: "herramienta",
      category: "transmision",
      usage: "Abrir cadenas",
      specification: "11 y 12 velocidades",
      restrictions: "Revisar el cierre",
      manufacturerId,
    },
    {
      name: "Lubricante",
      kind: "consumible",
      category: "transmision",
      specification: "Para cadenas limpias",
    },
    { name: "Indicador de cadena", kind: "herramienta", category: "herramientas" },
    { name: "Llave de pedal", kind: "herramienta", category: "pedalier" },
  ]);
}

it("devuelve una fila sintética al faltar el tipo solicitado, aunque existan otros datos", async () => {
  await test.db
    .insert(technicalSpecifications)
    .values({ variantId, kind: "medida", label: "Ancho", valueText: "5" });
  expect(await lookup({ variantId, kind: "torque" })).toEqual({
    ok: true,
    tools: [],
    specs: [
      {
        id: null,
        variantId,
        kind: "torque",
        label: "Torque",
        valueText: "",
        unit: null,
        tolerance: null,
        context: null,
        validationStatus: "sin_dato_verificado",
        reviewedOn: null,
        sourceDocument: null,
      },
    ],
  });
});

it("un valor vacío fuerza Sin dato verificado incluso si la base dice verificado", async () => {
  const [spec] = await test.db
    .insert(technicalSpecifications)
    .values({
      variantId,
      kind: "torque",
      label: "Cierre",
      valueText: "",
      unit: "N·m",
      validationStatus: "verificado",
      sourceDocumentId: documentId,
    })
    .returning();
  expect((await lookup({ variantId, kind: "torque" })).specs).toEqual([
    expect.objectContaining({
      id: spec?.id,
      valueText: "",
      validationStatus: "sin_dato_verificado",
    }),
  ]);
});

it("conserva valor, unidad, tolerancia, contexto, revisión y fuente; filtra por variante y tipo", async () => {
  await test.db.insert(technicalSpecifications).values([
    {
      variantId,
      kind: "torque",
      label: "Dato de prueba",
      valueText: "4",
      unit: "N·m",
      tolerance: "±0,5",
      context: "Solo prueba",
      reviewedOn: "2026-11-15",
      validationStatus: "verificado",
      sourceDocumentId: documentId,
    },
    { variantId, kind: "medida", label: "Ancho", valueText: "5", unit: "mm" },
  ]);
  const otherId = randomUUID();
  await test.db.insert(componentVariants).values({ id: otherId, modelId, code: "OTRA" });
  await test.db
    .insert(technicalSpecifications)
    .values({ variantId: otherId, kind: "torque", label: "Otra", valueText: "99" });
  const result = await lookup({ variantId, kind: "torque" });
  expect(result.specs).toHaveLength(1);
  expect(result.specs[0]).toMatchObject({
    variantId,
    kind: "torque",
    label: "Dato de prueba",
    valueText: "4",
    unit: "N·m",
    tolerance: "±0,5",
    context: "Solo prueba",
    reviewedOn: "2026-11-15",
    validationStatus: "verificado",
    sourceDocument: {
      id: documentId,
      title: "Manual de prueba",
      canonicalUrl: "https://ejemplo.cl/manual",
    },
  });
  expect((await lookup({ variantId })).specs.map((row) => row.label)).toEqual([
    "Ancho",
    "Dato de prueba",
  ]);
});

it("sin variante no consulta especificaciones ni inventa filas", async () => {
  expect(await lookup({ kind: "torque" })).toEqual({ ok: true, specs: [], tools: [] });
  expect(await lookup({ variantId })).toEqual({ ok: true, specs: [], tools: [] });
});

it("cadena encuentra TL-CN10 por uso y lubricante por especificación mediante FTS español", async () => {
  await seedTools();
  const result = await lookup({ operation: "  cadena  " });
  expect(result.tools.map((row) => row.name)).toEqual([
    "Indicador de cadena",
    "Alicate de cierre",
    "Lubricante",
  ]);
  expect(result.tools[1]).toMatchObject({
    code: "TL-CN10",
    kind: "herramienta",
    manufacturerName: "Fabricante",
    specification: "11 y 12 velocidades",
    usage: "Abrir cadenas",
    restrictions: "Revisar el cierre",
  });
  expect(result.tools[2]).toMatchObject({ kind: "consumible", manufacturerName: null });
  expect((await lookup({ variantId, kind: "torque", operation: "cadena" })).specs[0]).toMatchObject(
    { id: null },
  );
});

it("ILIKE encuentra fragmentos de nombre sin distinguir mayúsculas", async () => {
  await seedTools();
  expect((await lookup({ operation: "UBRIC" })).tools.map((row) => row.name)).toEqual([
    "Lubricante",
  ]);
  expect((await lookup({})).tools).toEqual([]);
});

it.each(["%%", "__", "\\\\", "%' OR 1=1 --"])(
  "escapa comodines y parametriza %s",
  async (operation) => {
    await seedTools();
    expect((await lookup({ operation })).tools).toEqual([]);
  },
);

it("limita herramientas a 30 ordenadas por categoría y nombre", async () => {
  await test.db.insert(toolsConsumables).values(
    Array.from({ length: 35 }, (_, index) => ({
      name: `Cadena ${String(34 - index).padStart(2, "0")}`,
      kind: "herramienta",
      category: "transmision",
    })),
  );
  const result = await lookup({ operation: "cadena" });
  expect(result.tools).toHaveLength(30);
  expect(result.tools.map((row) => row.name)).toEqual(
    Array.from({ length: 30 }, (_, index) => `Cadena ${String(index).padStart(2, "0")}`),
  );
});

it("variante desconocida devuelve not_found aun con operación", async () => {
  expect(
    await (await api()).lookupSpecifications(test.db, actor, {
      variantId: randomUUID(),
      operation: "cadena",
    }),
  ).toEqual({ ok: false, code: "not_found" });
});

it.each([
  null,
  { variantId: "mal" },
  { kind: "inventado" },
  { operation: " " },
  { operation: "a" },
  { operation: "a".repeat(121) },
])("rechaza entrada inválida %j sin consultar", async (input) => {
  const select = vi.spyOn(test.db, "select");
  expect(await (await api()).lookupSpecifications(test.db, actor, input)).toEqual({
    ok: false,
    code: "validation_error",
  });
  expect(select).not.toHaveBeenCalled();
});

it("exige library.view antes de validar o consultar", async () => {
  vi.spyOn(permissions, "can").mockReturnValue(false);
  const select = vi.spyOn(test.db, "select");
  expect(await (await api()).lookupSpecifications(test.db, actor, null)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(select).not.toHaveBeenCalled();
});

it("el esquema acepta todos los tipos, campos opcionales y operación de 120 caracteres", async () => {
  const { specLookupSchema } = await api();
  expect(specLookupSchema.parse({})).toEqual({});
  for (const kind of SPEC_KINDS)
    expect(specLookupSchema.parse({ variantId, kind, operation: " cadena " })).toEqual({
      variantId,
      kind,
      operation: "cadena",
    });
  expect(specLookupSchema.safeParse({ operation: "a".repeat(120) }).success).toBe(true);
});

it("ofrece hasta 200 variantes por código y revisión sin SQL en la página", async () => {
  await test.db.insert(componentVariants).values(
    Array.from({ length: 205 }, (_, index) => ({
      modelId,
      code: `ZZ-${String(204 - index).padStart(3, "0")}`,
    })),
  );
  const choices = await (await api()).listSpecificationVariants(test.db, actor);
  expect(choices).toHaveLength(200);
  expect(choices[0]).toEqual({ id: variantId, label: "CN-TEST rev. B — Cadena de prueba" });
  expect(choices[199]?.label).toBe("ZZ-198 — Cadena de prueba");
  vi.spyOn(permissions, "can").mockReturnValue(false);
  const select = vi.spyOn(test.db, "select");
  expect(await (await api()).listSpecificationVariants(test.db, actor)).toEqual([]);
  expect(select).not.toHaveBeenCalled();
});
