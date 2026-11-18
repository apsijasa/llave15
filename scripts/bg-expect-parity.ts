import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const matchers = [
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
];
const matcherStart = new RegExp(`\\.(?:not\\.)?(?:${matchers.join("|")})\\(`);
const usage =
  "Uso: node scripts/bg-expect-parity.ts [--base <ref>] [--allow <texto>]… [--skip <ruta>]…";

type Options = { base: string; allow: string[]; skip: string[] };
type MatcherDifference = { removed: string[]; added: string[] };

function diffSections(diff: string): string[] {
  return diff.split(/(?=^diff --git )/m);
}

function matcherTails(section: string, allow: string[]): MatcherDifference {
  const tails: MatcherDifference = { removed: [], added: [] };
  for (const line of section.split("\n")) {
    if (line.startsWith("--- ") || line.startsWith("+++ ")) continue;
    if (!line.startsWith("-") && !line.startsWith("+")) continue;
    const match = matcherStart.exec(line.slice(1));
    if (!match) continue;
    const tail = line.slice(match.index + 1);
    if (allow.some((text) => tail.includes(text))) continue;
    tails[line.startsWith("-") ? "removed" : "added"].push(tail);
  }
  return tails;
}

/** Compara multiconjuntos; los cambios de sujeto o de orden no alteran la paridad. */
export function compareMatcherTails(diff: string, allow: string[]): MatcherDifference {
  const counts = new Map<string, number>();
  for (const section of diffSections(diff)) {
    if (/^new file mode |^--- \/dev\/null$/m.test(section)) continue;
    const tails = matcherTails(section, allow);
    for (const tail of tails.removed) counts.set(tail, (counts.get(tail) ?? 0) - 1);
    for (const tail of tails.added) counts.set(tail, (counts.get(tail) ?? 0) + 1);
  }
  const difference: MatcherDifference = { removed: [], added: [] };
  for (const [tail, count] of [...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    difference[count < 0 ? "removed" : "added"].push(...Array<string>(Math.abs(count)).fill(tail));
  }
  return difference;
}

function parseOptions(args: string[]): Options | null {
  const options: Options = { base: "HEAD", allow: [], skip: [] };
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value || value.startsWith("-")) return null;
    if (flag === "--base") options.base = value;
    else if (flag === "--allow") options.allow.push(value);
    else if (flag === "--skip") options.skip.push(value);
    else return null;
  }
  return options;
}

function sectionPaths(section: string): string[] {
  return [...section.matchAll(/^(?:---|\+\+\+) (.+)$/gm)].map((match) => {
    const raw = match[1] ?? "";
    const path: string = raw.startsWith('"') ? JSON.parse(raw) : raw;
    return path.replace(/^[ab]\//, "");
  });
}

function withoutSkippedFiles(diff: string, skip: string[]): string {
  return diffSections(diff)
    .filter((section) => !sectionPaths(section).some((path) => skip.includes(path)))
    .join("");
}

function main(args: string[]): number {
  const options = parseOptions(args);
  if (!options) {
    console.error(usage);
    return 2;
  }
  const result = spawnSync(
    "git",
    ["diff", options.base, "-U0", "--no-color", "--", "tests", "e2e"],
    {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.error || result.status !== 0) {
    console.error("No se pudo ejecutar git diff. Revisa la referencia base y el repositorio.");
    return 2;
  }
  const difference = compareMatcherTails(
    withoutSkippedFiles(result.stdout, options.skip),
    options.allow,
  );
  if (!difference.removed.length && !difference.added.length) {
    console.log("Paridad de expectativas conservada.");
    return 0;
  }
  console.error("Cambios en las expectativas existentes:");
  for (const tail of difference.removed) console.error(`Quitada: ${tail}`);
  for (const tail of difference.added) console.error(`Agregada: ${tail}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
