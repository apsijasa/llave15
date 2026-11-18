import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const patterns = [
  "Vector Bikes",
  "Vitacura",
  "Las Condes",
  "Kennedy",
  "vectorbikes",
  "vector.bikes",
  "$15.000",
  "85095780",
  "8509 5780",
];

type LiteralFile = { path: string; counts: Record<string, number>; total: number };

function scanLiterals(root: string): LiteralFile[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return scanLiterals(path);
    if (!entry.isFile()) return [];
    const content = readFileSync(path);
    if (content.includes(0)) return [];
    const source = content.toString("utf8");
    const counts = Object.fromEntries(
      patterns.map((pattern) => [pattern, source.split(pattern).length - 1]),
    );
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return total ? [{ path, counts, total }] : [];
  });
}

function assertBaseline(files: LiteralFile[], baseline: Record<string, number>): void {
  const violations = files.filter((file) => file.total > (baseline[file.path] ?? 0));
  const details = violations.map((file) => {
    const matches = Object.entries(file.counts)
      .filter(([, count]) => count > 0)
      .map(([pattern, count]) => `${JSON.stringify(pattern)}: ${count}`)
      .join(", ");
    return `${file.path}: ${file.total} ocurrencias (permitidas: ${baseline[file.path] ?? 0}); ${matches}`;
  });
  if (details.length)
    throw new Error(`Literales del taller fuera de la línea base:\n${details.join("\n")}`);
}

const temporaryDirectories: string[] = [];

function temporaryFile(content: string): string {
  const directory = mkdtempSync(join(tmpdir(), "shop-literals-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "fixture.txt");
  writeFileSync(path, content);
  return path;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("guardia de literales del taller", () => {
  it("mantiene cada archivo de src dentro de su línea base", () => {
    const baseline: Record<string, number> = JSON.parse(
      readFileSync("tests/unit/shop-literals-baseline.json", "utf8"),
    );
    expect(() => assertBaseline(scanLiterals("src"), baseline)).not.toThrow();
  });

  it("detecta Vitacura en un directorio temporal y rechaza un archivo sin línea base", () => {
    const path = temporaryFile("Vitacura");
    const files = scanLiterals(join(path, ".."));
    expect(files).toEqual([
      {
        path,
        counts: Object.fromEntries(patterns.map((p) => [p, p === "Vitacura" ? 1 : 0])),
        total: 1,
      },
    ]);
    expect(() => assertBaseline(files, {})).toThrow(
      `${path}: 1 ocurrencias (permitidas: 0); "Vitacura": 1`,
    );
  });
});

describe("conteo de literales", () => {
  it("cuenta los nueve patrones literalmente, incluso repetidos en una línea", () => {
    const path = temporaryFile(`${patterns.join(" ")} ${patterns.join(" ")} vectorXbikes 15000`);
    const files = scanLiterals(join(path, ".."));
    expect(files[0]?.total).toBe(18);
    expect(Object.values(files[0]?.counts ?? {})).toEqual(patterns.map(() => 2));
    expect(() => assertBaseline(files, { [path]: 17 })).toThrow(path);
    expect(() => assertBaseline(files, { [path]: 18 })).not.toThrow();
    expect(() => assertBaseline(files, { [path]: 19 })).not.toThrow();
  });

  it("recorre subdirectorios y omite archivos binarios igual que grep -I", () => {
    const path = temporaryFile("Vitacura\0");
    const root = join(path, "..");
    expect(scanLiterals(root)).toEqual([]);
    mkdirSync(join(root, "nested"));
    const nested = join(root, "nested", "source.astro");
    writeFileSync(nested, "Kennedy");
    expect(scanLiterals(root).map(({ path, total }) => ({ path, total }))).toEqual([
      { path: nested, total: 1 },
    ]);
  });
});
