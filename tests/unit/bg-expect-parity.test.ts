import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { compareMatcherTails } from "../../scripts/bg-expect-parity.ts";

function diffLines(removed: string[], added: string[]): string {
  return [
    "diff --git a/tests/unit/example.test.ts b/tests/unit/example.test.ts",
    "--- a/tests/unit/example.test.ts",
    "+++ b/tests/unit/example.test.ts",
    "@@ -1,1 +1,1 @@",
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
  ].join("\n");
}

describe("paridad de expectativas", () => {
  it("devuelve las colas cuyo argumento cambió", () => {
    expect(
      compareMatcherTails(diffLines(["expect(value).toBe(1);"], ["expect(value).toBe(2);"]), []),
    ).toEqual({
      removed: [".toBe(1);"],
      added: [".toBe(2);"],
    });
  });

  it("permite cambios de firma, siembra y sujeto fuera de la cola", () => {
    const diff = diffLines(
      ["seed(db);", "expect(read(db)).toEqual({ ok: true });"],
      ["seed(db, shop);", "expect(read(db, scope)).toEqual({ ok: true });"],
    );
    expect(compareMatcherTails(diff, [])).toEqual({ removed: [], added: [] });
  });

  it("ignora las colas que contienen cualquiera de los textos permitidos", () => {
    const diff = diffLines(["expect(name).toBe('anterior');"], ["expect(name).toBe('nuevo');"]);
    expect(compareMatcherTails(diff, ["anterior", "nuevo"])).toEqual({ removed: [], added: [] });
    expect(compareMatcherTails(diffLines(["expect(allowed).toBe(1);"], []), ["allowed"])).toEqual({
      removed: [".toBe(1);"],
      added: [],
    });
  });
});

describe("multiconjuntos de expectativas", () => {
  it("compara multiconjuntos sin perder repeticiones ni depender del orden", () => {
    const first = "expect(a).toBe(1);";
    const second = "expect(b).toBe(2);";
    expect(compareMatcherTails(diffLines([first, second], [second, first]), [])).toEqual({
      removed: [],
      added: [],
    });
    expect(compareMatcherTails(diffLines([first, first], [first]), [])).toEqual({
      removed: [".toBe(1);"],
      added: [],
    });
  });

  it("conserva la negación como parte de la expectativa", () => {
    expect(
      compareMatcherTails(diffLines(["expect(a).not.toBe(1);"], ["expect(a).toBe(1);"]), []),
    ).toEqual({
      removed: [".not.toBe(1);"],
      added: [".toBe(1);"],
    });
  });
});

describe("matchers admitidos", () => {
  it.each([
    "toBe",
    "toEqual",
    "toStrictEqual",
    "toContain",
    "toContainEqual",
    "toMatch",
    "toMatchObject",
    "toHaveLength",
    "toHaveProperty",
    "toThrow",
    "toBeNull",
    "toBeTruthy",
    "toBeFalsy",
    "toBeDefined",
    "toBeUndefined",
    "toBeGreaterThan",
    "toBeLessThan",
  ])("reconoce %s y su variante negada", (matcher) => {
    const tail = `.not.${matcher}('valor');`;
    expect(compareMatcherTails(diffLines([`expect(value)${tail}`], []), [])).toEqual({
      removed: [tail],
      added: [],
    });
  });
});

describe("archivos nuevos", () => {
  it("ignora archivos nuevos y no confunde encabezados con expectativas", () => {
    const newFile = [
      "diff --git a/tests/new.test.ts b/tests/new.test.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/tests/new.test.ts",
      "@@ -0,0 +1 @@",
      "+expect(value).toBe(9);",
    ].join("\n");
    const diff = `${newFile}\n${diffLines(["expect(value).toBe(1);"], [])}`;
    expect(compareMatcherTails(diff, [])).toEqual({ removed: [".toBe(1);"], added: [] });
  });
});

describe("uso del script de paridad", () => {
  it.each([["--x"], ["--base"], ["--allow"], ["--skip"], ["--base", "--x"]])(
    "sale 2 y muestra el uso con argumentos inválidos: %j",
    (...args) => {
      const result = spawnSync(process.execPath, ["scripts/bg-expect-parity.ts", ...args], {
        encoding: "utf8",
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("Uso:");
    },
  );

  it("sale 2 si git no puede resolver la base", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/bg-expect-parity.ts", "--base", "refs/bg-01-no-existe"],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("No se pudo ejecutar git diff");
  });
});
