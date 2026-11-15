import { expect, it } from "vitest";
import { detectExactCode, librarySearchSchema } from "../../src/server/library/search.ts";

it.each([
  ["rd-m8100-sgs", "RD-M8100-SGS"],
  [" CS-M8100-12 ", "CS-M8100-12"],
  ["TL-CN10", "TL-CN10"],
  ["ABC-12-A-B-C", "ABC-12-A-B-C"],
  ["cadena salta", null],
  ["RD", null],
  ["RD-M8100-SGS-X-Y-Z-W", null],
  ["R-12", null],
  ["AB-X", null],
  ["ABCD-12", null],
  ["RD-M8100_12", null],
  ["", null],
])("detecta el código exacto de %j", (input, expected) => {
  expect(detectExactCode(input)).toBe(expected);
});

it("valida y recorta la consulta y sus filtros", () => {
  expect(librarySearchSchema.parse({ q: " cambio " })).toEqual({ q: "cambio" });
  for (const input of [
    { q: " " },
    { q: "a".repeat(121) },
    { q: "cambio", category: "otra" },
    { q: "cambio", manufacturerId: "inválido" },
    { q: "cambio", status: "retirado" },
  ])
    expect(librarySearchSchema.safeParse(input).success).toBe(false);
});
