import { expect, it } from "vitest";
import { toCsv } from "../../src/lib/csv.ts";

it("genera BOM, separador chileno, CRLF, enteros y celdas vacías", () => {
  expect(
    toCsv([
      ["Monto", null],
      [-5000, 12],
      ["12,5", "CLP"],
    ]),
  ).toBe("\uFEFFMonto;\r\n-5000;12\r\n12,5;CLP");
});
it("entrecomilla separadores, comillas y saltos y duplica comillas", () => {
  expect(toCsv([["a;b", 'a"b', "a\nb", "a\rb"]])).toBe('\uFEFF"a;b";"a""b";"a\nb";"a\rb"');
});
it.each(["=SUMA(A1)", "+5", "-x", "@a", "\tx", "\rx"])("escapa texto peligroso %j", (cell) => {
  const escaped = `'${cell}`;
  expect(toCsv([[cell]])).toBe(`\uFEFF${cell.includes("\r") ? `"${escaped}"` : escaped}`);
});
