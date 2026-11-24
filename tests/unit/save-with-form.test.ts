import { describe, expect, it } from "vitest";
import { queueLabel } from "../../src/components/taller/save-with-form.ts";

describe("queueLabel", () => {
  it("en Fotos y firma dice que las fotos esperan al Guardar, en singular y plural", () => {
    expect(queueLabel(1, true)).toBe("1 foto lista para guardar");
    expect(queueLabel(4, true)).toBe("4 fotos listas para guardar");
  });

  it("fuera de Fotos y firma muestra el conteo contra el máximo", () => {
    expect(queueLabel(3, false)).toBe("3 de 20");
  });
});
