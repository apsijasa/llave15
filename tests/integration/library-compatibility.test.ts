import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import * as permissions from "../../src/server/auth/permissions.ts";
import {
  componentFamilies,
  componentModels,
  componentVariants,
  manufacturers,
  technicalDocuments,
} from "../../src/server/db/schema-library-catalog.ts";
import {
  compatibilityRuleMembers,
  compatibilityRules,
} from "../../src/server/db/schema-library-procedures.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const api = () => import("../../src/server/library/compatibility.ts");
const roles = ["shifter", "cambio", "cassette", "cadena"] as const;
let test: TestDb;
let actor: SessionUser;
let ids: string[];
let documentId: string;

function variantId(index: number): string {
  const id = ids[index];
  if (!id) throw new Error("Falta variante");
  return id;
}

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
  ids = await seedVariants();
  documentId = randomUUID();
  await test.db.insert(technicalDocuments).values({
    id: documentId,
    title: "Manual de prueba",
    canonicalUrl: "https://ejemplo.cl/manual",
    docType: "manual",
  });
  return async () => {
    vi.restoreAllMocks();
    await test.close();
  };
});

async function seedVariants() {
  const manufacturerId = randomUUID(),
    familyId = randomUUID();
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
  const types = [
    "shifter",
    "cambio_trasero",
    "cassette",
    "cadena",
    "biela",
    "nucleo",
    "freno_disco",
    "disco",
  ];
  const models = types.map((componentType, index) => ({
    id: randomUUID(),
    familyId,
    code: `MODELO-${index}`,
    name: `Modelo ${index}`,
    componentType,
    speeds: 12,
  }));
  await test.db.insert(componentModels).values(models);
  const variants = models.map((model, index) => ({
    id: randomUUID(),
    modelId: model.id,
    code: `VAR-${index}`,
    revision: index === 0 ? "B" : "",
  }));
  await test.db.insert(componentVariants).values(variants);
  return variants.map((variant) => variant.id);
}

function input(count = 2) {
  return {
    members: roles.slice(0, count).map((role, index) => ({ role, variantId: variantId(index) })),
  };
}

async function rule(indexes: number[], relation = "oficial_confirmada", status = "vigente") {
  const id = randomUUID();
  await test.db.insert(compatibilityRules).values({
    id,
    relation,
    status,
    sourceDocumentId: documentId,
    certainty: "alta",
    evidence: "Evidencia de prueba",
    conditions: relation === "condicionada" ? "Usar adaptador" : null,
    restrictions: relation === "incompatible" ? "No montar juntos" : null,
    reviewedOn: "2026-11-15",
  });
  await test.db.insert(compatibilityRuleMembers).values(
    indexes.map((index) => ({
      ruleId: id,
      variantId: variantId(index),
      role: roles[index] ?? "otro",
    })),
  );
  return id;
}

async function verdict(count = 2) {
  const result = await (await api()).checkCompatibility(test.db, actor, input(count));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.code);
  return result.verdict;
}

it("a: dos variantes 12v sin reglas quedan no verificadas", async () => {
  const result = await verdict();
  expect(result.relation).toBe("no_verificada");
  expect(result.uncovered).toEqual(ids.slice(0, 2));
  expect(result.rules).toEqual([]);
  expect(result.members).toEqual([
    { role: "shifter", variantId: ids[0], code: "VAR-0", modelName: "Modelo 0", speeds: 12 },
    { role: "cambio", variantId: ids[1], code: "VAR-1", modelName: "Modelo 1", speeds: 12 },
  ]);
  expect(result.explanation).toBe(
    "No hay evidencia verificada para esta combinación exacta. Que tengan la misma cantidad de velocidades no basta: identifique cada variante y consulte el manual.",
  );
});

it("b: confirma ambas variantes con evidencia y documento oficial", async () => {
  const ruleId = await rule([0, 1]);
  expect(await verdict()).toMatchObject({
    relation: "oficial_confirmada",
    uncovered: [],
    explanation: "Combinación confirmada por documentación oficial.",
    rules: [
      {
        ruleId,
        relation: "oficial_confirmada",
        certainty: "alta",
        evidence: "Evidencia de prueba",
        conditions: null,
        restrictions: null,
        reviewedOn: "2026-11-15",
        sourceDocument: {
          id: documentId,
          title: "Manual de prueba",
          canonicalUrl: "https://ejemplo.cl/manual",
        },
        coveredVariantIds: expect.arrayContaining(ids.slice(0, 2)),
      },
    ],
  });
});

it("c: una regla de dos aplica al conjunto de tres, dejando una sin cubrir", async () => {
  await rule([0, 1]);
  expect(await verdict(3)).toMatchObject({
    relation: "no_verificada",
    uncovered: [ids[2]],
    rules: [expect.anything()],
  });
});

it("d: combina reglas oficiales y condicionadas que cubren todo", async () => {
  await rule([0, 1]);
  await rule([1, 2], "condicionada");
  const result = await verdict(3);
  expect(result).toMatchObject({
    relation: "condicionada",
    uncovered: [],
    explanation: "Compatible solo bajo las condiciones indicadas.",
  });
  expect(result.rules).toEqual(
    expect.arrayContaining([expect.objectContaining({ conditions: "Usar adaptador" })]),
  );
});

it("e: una incompatibilidad aplicable prevalece incluso con cobertura incompleta", async () => {
  await rule([0, 1]);
  await rule([0, 1], "incompatible");
  const result = await verdict(3);
  expect(result).toMatchObject({
    relation: "incompatible",
    uncovered: [ids[2]],
    explanation: "La documentación indica que no son compatibles.",
  });
  expect(result.rules).toEqual(
    expect.arrayContaining([expect.objectContaining({ restrictions: "No montar juntos" })]),
  );
});

it.each(["oficial_confirmada", "incompatible"])(
  "f: ignora reglas archivadas %s",
  async (relation) => {
    await rule([0, 1], relation, "archivada");
    expect(await verdict()).toMatchObject({
      relation: "no_verificada",
      rules: [],
      uncovered: ids.slice(0, 2),
    });
  },
);

it("g: velocidades distintas tampoco deciden incompatibilidad", async () => {
  const [variant] = await test.db
    .select()
    .from(componentVariants)
    .where(eq(componentVariants.id, variantId(0)));
  if (!variant) throw new Error("Falta variante");
  await test.db
    .update(componentModels)
    .set({ speeds: 11 })
    .where(eq(componentModels.id, variant.modelId));
  const result = await verdict();
  expect(result.relation).toBe("no_verificada");
  expect(result.members.map((member) => member.speeds)).toEqual([11, 12]);
});

it("h: una variante inexistente devuelve not_found", async () => {
  const request = {
    members: [
      { role: "shifter", variantId: variantId(0) },
      { role: "cambio", variantId: randomUUID() },
    ],
  };
  expect(await (await api()).checkCompatibility(test.db, actor, request)).toEqual({
    ok: false,
    code: "not_found",
  });
});

it.each([
  { members: [{ role: "shifter", variantId: randomUUID() }] },
  { members: Array.from({ length: 9 }, () => ({ role: "cadena", variantId: randomUUID() })) },
  {
    members: [
      { role: "inventado", variantId: randomUUID() },
      { role: "cadena", variantId: "mal" },
    ],
  },
  null,
])("i: rechaza entradas inválidas %j", async (request) => {
  expect(await (await api()).checkCompatibility(test.db, actor, request)).toEqual({
    ok: false,
    code: "validation_error",
  });
});

it.each(["oficial_confirmada", "incompatible"])(
  "exige TODOS los miembros de la regla %s",
  async (relation) => {
    await rule([0, 1, 2], relation);
    expect(await verdict()).toMatchObject({
      relation: "no_verificada",
      rules: [],
      uncovered: ids.slice(0, 2),
    });
  },
);

it("una regla no verificada impide confirmar aunque haya cobertura total", async () => {
  await rule([0, 1]);
  await rule([0, 1], "no_verificada");
  expect(await verdict()).toMatchObject({ relation: "no_verificada", uncovered: [] });
});

it("revisa library.view antes de validar o consultar", async () => {
  vi.spyOn(permissions, "can").mockReturnValue(false);
  const select = vi.spyOn(test.db, "select");
  expect(await (await api()).checkCompatibility(test.db, actor, null)).toEqual({
    ok: false,
    code: "forbidden",
  });
  expect(select).not.toHaveBeenCalled();
});

it("ofrece variantes por tipo de componente y etiqueta con revisión opcional", async () => {
  const { listVariantsForRole, compatibilityCheckSchema } = await api();
  const allRoles = [...roles, "plato", "nucleo", "freno", "disco"] as const;
  for (const [index, role] of allRoles.entries()) {
    expect(await listVariantsForRole(test.db, role)).toEqual([
      { id: ids[index], label: `VAR-${index}${index === 0 ? " rev. B" : ""} — Modelo ${index}` },
    ]);
  }
  expect(await listVariantsForRole(test.db, "otro")).toEqual([]);
  expect(compatibilityCheckSchema.safeParse(input()).success).toBe(true);
});
