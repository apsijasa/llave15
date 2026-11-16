import { describe, expect, it } from "vitest";
import { lineDiff } from "../../src/lib/line-diff.ts";

describe("diferencia por líneas", () => {
  it("marca líneas iguales, agregadas y quitadas", () => {
    expect(lineDiff("uno\ndos\ntres", "uno\ntres\ncuatro")).toEqual([
      { kind: "same", text: "uno" },
      { kind: "del", text: "dos" },
      { kind: "same", text: "tres" },
      { kind: "add", text: "cuatro" },
    ]);
  });

  it("todo agregado cuando no había versión", () => {
    expect(lineDiff("", "a\nb")).toEqual([
      { kind: "add", text: "a" },
      { kind: "add", text: "b" },
    ]);
  });

  it("devuelve null sobre el límite", () => {
    expect(lineDiff("x\n".repeat(10), "y", 5)).toBeNull();
  });
});
