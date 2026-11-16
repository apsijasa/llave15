import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, expect, it } from "vitest";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import { workOrders } from "../../src/server/db/schema-orders.ts";
import { aiInteractions } from "../../src/server/db/schema-library-private.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import { branches, users } from "../../src/server/db/schema.ts";
import { AiProviderError, noneProvider } from "../../src/server/library/ai-provider.ts";
import type { AiAnswer, AiProvider, AiRequest } from "../../src/server/library/ai-provider.ts";
import {
  askAssistant,
  numericGuard,
  recentInteractions,
} from "../../src/server/library/assistant.ts";
import { reindexAll } from "../../src/server/library/chunks.ts";
import { importLibraryPack, libraryPackSchema } from "../../src/server/library/content-pack.ts";
import { AI_DAILY_QUOTA_PER_BRANCH } from "../../src/server/library/rules.ts";
import { createTestDb } from "../helpers/pglite.ts";
import type { TestDb } from "../helpers/pglite.ts";

const NOW = new Date("2026-11-15T15:00:00.000Z");
const QUESTION = "¿Cómo identifico una transmisión de 12 velocidades RD-M8100-SGS?";
let test: TestDb;
let mechanic: SessionUser;
let outsider: SessionUser;

async function actor(branchId: string, role: Role): Promise<SessionUser> {
  const [row] = await test.db
    .insert(users)
    .values({
      branchId,
      role,
      name: `Usuario ${role}`,
      email: `${randomUUID()}@ejemplo.cl`,
      passwordHash: "hash",
    })
    .returning();
  if (!row) throw new Error("Falta el usuario");
  return { id: row.id, branchId, role, name: row.name, email: row.email };
}

function fakeProvider(answer: (request: AiRequest) => Partial<AiAnswer>) {
  const calls: AiRequest[] = [];
  const provider: AiProvider = {
    name: "anthropic",
    model: "modelo-de-prueba",
    async complete(request) {
      calls.push(request);
      return {
        answer: "Respuesta",
        confidence: "alta",
        citations: request.sources.slice(0, 1).map((source) => source.ref),
        assumptions: [],
        nextCheck: "Medir",
        tokensIn: 10,
        tokensOut: 5,
        ...answer(request),
      };
    },
  };
  return { provider, calls };
}

beforeEach(async () => {
  test = await createTestDb();
  const [a, b] = await test.db
    .insert(branches)
    .values([{ name: "Vitacura" }, { name: "Otra" }])
    .returning();
  if (!a || !b) throw new Error("Faltan sucursales");
  mechanic = await actor(a.id, "mechanic");
  outsider = await actor(b.id, "owner");
  const pack = libraryPackSchema.parse(
    JSON.parse(readFileSync("src/data/library/pack.json", "utf8")),
  );
  await importLibraryPack(test.db, null, pack, NOW, { dryRun: false });
  await reindexAll(test.db);
  return () => test.close();
});

it("responde con citas válidas y guarda la consulta", async () => {
  const { provider } = fakeProvider(() => ({}));
  const result = await askAssistant(test.db, mechanic, provider, { question: QUESTION }, NOW);
  if (!result.ok) throw new Error(result.code);
  expect(result).toMatchObject({ status: "respondida", confidence: "alta" });
  expect(result.citations).toHaveLength(1);
  expect(result.citations[0]?.href).toMatch(/^\/taller\/biblioteca\//);
  const [row] = await test.db.select().from(aiInteractions);
  expect(row).toMatchObject({
    id: result.interactionId,
    provider: "anthropic",
    model: "modelo-de-prueba",
    status: "respondida",
    tokensIn: 10,
  });
});

it("una cifra con unidad que no está en las fuentes baja la confianza", async () => {
  const { provider } = fakeProvider(() => ({ answer: "Apriete a 12 Nm el tornillo" }));
  const result = await askAssistant(test.db, mechanic, provider, { question: QUESTION }, NOW);
  if (!result.ok) throw new Error(result.code);
  expect(result.confidence).toBe("no_verificada");
  expect(result.assumptions.join(" ")).toContain("12nm");
  expect(
    numericGuard("8 Nm", [{ ref: "S1", label: "", text: "torque 8 Nm", official: true }]).ok,
  ).toBe(true);
});

it("sin fuentes declara que no hay evidencia", async () => {
  const result = await askAssistant(
    test.db,
    mechanic,
    noneProvider,
    { question: "zzzz qqqq wwww" },
    NOW,
  );
  if (!result.ok) throw new Error(result.code);
  expect(result).toMatchObject({
    status: "sin_evidencia",
    confidence: "no_verificada",
    citations: [],
  });
});

it("al superar la cuota diaria no llama al proveedor", async () => {
  await test.db.insert(aiInteractions).values(
    Array.from({ length: AI_DAILY_QUOTA_PER_BRANCH }, () => ({
      branchId: mechanic.branchId,
      userId: outsider.id,
      scope: "biblioteca",
      question: "x",
      confidence: "no_verificada",
      provider: "none",
      promptVersion: "bt-1",
      status: "respondida",
      createdAt: NOW,
      updatedAt: NOW,
    })),
  );
  const { provider, calls } = fakeProvider(() => ({}));
  expect(await askAssistant(test.db, mechanic, provider, { question: QUESTION }, NOW)).toEqual({
    ok: false,
    code: "quota",
  });
  expect(calls).toHaveLength(0);
});

it("al superar la cuota por minuto no llama al proveedor", async () => {
  const { provider, calls } = fakeProvider(() => ({}));
  for (let i = 0; i < 5; i += 1)
    await askAssistant(test.db, mechanic, provider, { question: QUESTION }, NOW);
  expect(await askAssistant(test.db, mechanic, provider, { question: QUESTION }, NOW)).toEqual({
    ok: false,
    code: "quota",
  });
  expect(calls).toHaveLength(5);
});

it("una orden de otra sucursal responde forbidden y no guarda nada", async () => {
  const [customer] = await test.db
    .insert(customers)
    .values({ branchId: mechanic.branchId, name: "C", phoneE164: "+56911112222" })
    .returning();
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: mechanic.branchId,
      customerId: customer?.id ?? "",
      brand: "B",
      model: "M",
      bikeType: "mtb",
    })
    .returning();
  const [order] = await test.db
    .insert(workOrders)
    .values({
      branchId: mechanic.branchId,
      number: 1,
      customerId: customer?.id ?? "",
      bikeId: bike?.id ?? "",
      requestedService: "x",
      createdBy: mechanic.id,
    })
    .returning();
  const { provider, calls } = fakeProvider(() => ({}));
  const result = await askAssistant(
    test.db,
    outsider,
    provider,
    { question: QUESTION, scope: "orden", orderId: order?.id },
    NOW,
  );
  expect(result).toEqual({ ok: false, code: "forbidden" });
  expect(calls).toHaveLength(0);
  expect(await test.db.select().from(aiInteractions)).toHaveLength(0);
});

it("guarda la pregunta redactada y registra fallas del proveedor", async () => {
  const failing: AiProvider = {
    name: "anthropic",
    model: "m",
    complete: async () => {
      throw new AiProviderError("http_500");
    },
  };
  const result = await askAssistant(
    test.db,
    mechanic,
    failing,
    { question: "Cliente +56 9 1234 5678 con cadena que salta" },
    NOW,
  );
  if (!result.ok) throw new Error(result.code);
  expect(result.status).toBe("error");
  const [row] = await test.db.select().from(aiInteractions);
  expect(row?.question).not.toContain("1234 5678");
  expect(row?.status).toBe("error");
  const recent = await recentInteractions(test.db, mechanic);
  expect(recent).toHaveLength(1);
  expect(await recentInteractions(test.db, outsider)).toHaveLength(0);
});

it("valida la entrada", async () => {
  expect(await askAssistant(test.db, mechanic, noneProvider, { question: "x" }, NOW)).toEqual({
    ok: false,
    code: "validation_error",
  });
  expect(
    await askAssistant(
      test.db,
      mechanic,
      noneProvider,
      { question: QUESTION, scope: "orden" },
      NOW,
    ),
  ).toEqual({ ok: false, code: "validation_error" });
});
