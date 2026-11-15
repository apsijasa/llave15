import { describe, expect, it } from "vitest";
import { detectPii } from "../../src/server/library/pii.ts";

describe("detección de datos personales en propuestas", () => {
  it("encuentra teléfono, RUT y correo", () => {
    const kinds = detectPii("Llamar al +56 9 1234 5678, RUT 12.345.678-5, correo a@b.cl").map(
      (finding) => finding.kind,
    );
    expect(kinds).toEqual(expect.arrayContaining(["telefono", "rut", "correo"]));
  });

  it("encuentra patentes en formato nuevo y antiguo", () => {
    expect(detectPii("Auto patente BCDF12")).toEqual([{ kind: "patente", match: "BCDF12" }]);
    expect(detectPii("patente ab 1234 del cliente")).toEqual([
      { kind: "patente", match: "ab 1234" },
    ]);
  });

  it("no marca códigos técnicos ni cantidades", () => {
    expect(detectPii("RD-M8100-SGS de 12 velocidades, CS-M8100-12 y TL-CN10")).toEqual([]);
  });

  it("no repite hallazgos idénticos", () => {
    expect(detectPii("a@b.cl y otra vez a@b.cl")).toEqual([{ kind: "correo", match: "a@b.cl" }]);
  });
});
