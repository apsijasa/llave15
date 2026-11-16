import { describe, expect, it } from "vitest";
import { EnvError, getAiEnv } from "../../src/lib/env.ts";

describe("entorno del asistente", () => {
  it("por defecto funciona sin proveedor externo", () => {
    expect(getAiEnv({})).toEqual({ AI_PROVIDER: "none", AI_MODEL: "claude-opus-5-5" });
  });

  it("con anthropic exige la clave y la nombra", () => {
    expect(() => getAiEnv({ AI_PROVIDER: "anthropic" })).toThrow(EnvError);
    expect(() => getAiEnv({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "" })).toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it("acepta un modelo explícito y rechaza proveedores desconocidos", () => {
    const key = "sk-ant-prueba-0123456789abcdef";
    expect(
      getAiEnv({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: key, AI_MODEL: "claude-sonnet-5-5" }),
    ).toMatchObject({ AI_MODEL: "claude-sonnet-5-5" });
    expect(() => getAiEnv({ AI_PROVIDER: "otro" })).toThrow(/AI_PROVIDER/);
  });
});
