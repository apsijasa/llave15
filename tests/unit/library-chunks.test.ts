import { describe, expect, it } from "vitest";
import { chunkText } from "../../src/server/library/chunks.ts";
import { orQuery, questionCodes } from "../../src/server/library/retrieval.ts";

describe("trozos para el índice", () => {
  it("corta en encabezados y guarda la sección", () => {
    const chunks = chunkText("# Uno\n\nTexto uno.\n\n## Dos\n\nTexto dos.", 30);
    expect(chunks.map((chunk) => chunk.section)).toEqual(["Uno", "Dos"]);
  });

  it("un párrafo largo se corta sin pasar el máximo", () => {
    const chunks = chunkText("Oración corta. ".repeat(200), 300);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((chunk) => chunk.text.length <= 300)).toBe(true);
    expect(chunks.map((chunk) => chunk.index)).toEqual(chunks.map((_, index) => index));
  });

  it("texto vacío no produce trozos", () => {
    expect(chunkText("   \n\n  ")).toEqual([]);
  });
});

describe("consulta del asistente", () => {
  it("arma una consulta OR solo con palabras seguras", () => {
    expect(orQuery("¿La cadena salta? ' OR 1=1 --")).toBe("cadena | salta");
    expect(orQuery("¿y?")).toBeNull();
  });

  it("detecta códigos exactos dentro de una pregunta", () => {
    expect(questionCodes("¿Qué torque lleva el rd-m8100-sgs, y el CS-M8100-12?")).toEqual([
      "RD-M8100-SGS",
      "CS-M8100-12",
    ]);
  });
});
