import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pages = readdirSync("src/pages", { encoding: "utf8", recursive: true })
  .filter((path) => /\.(astro|ts)$/.test(path))
  .map((path) => join("src/pages", path))
  .filter((path) => readFileSync(path, "utf8").includes("isAllowedOrigin"));

describe("política de referrer compatible con el chequeo de Origin", () => {
  it.each(pages)("%s no usa no-referrer cuando chequea Origin", (path) => {
    expect(readFileSync(path, "utf8")).not.toContain("no-referrer");
  });
});
