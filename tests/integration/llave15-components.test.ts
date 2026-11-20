import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it, vi } from "vitest";
import { PLATFORM } from "../../src/lib/platform.ts";
import { STATUS_LABELS } from "../../src/server/taller/rules.ts";

vi.mock("../../src/server/db/client.ts", () => ({
  getDb: () => {
    throw new Error("El render GET del ingreso no debe consultar la base");
  },
}));

interface CssBlock {
  selectors: string[];
  declarations: Record<string, string>;
}

function parseCss(css: string): CssBlock[] {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    ([, selectors = "", body = ""]) => ({
      selectors: selectors.split(",").map((selector) => selector.trim()),
      declarations: Object.fromEntries(
        body
          .split(";")
          .map((declaration) => declaration.trim())
          .filter(Boolean)
          .map((declaration) => {
            const colon = declaration.indexOf(":");
            const value = declaration
              .slice(colon + 1)
              .trim()
              .replace(/\s+/g, " ")
              .replace(/\(\s+/g, "(")
              .replace(/\s+\)/g, ")");
            return [declaration.slice(0, colon), value];
          }),
      ),
    }),
  );
}

const path = "src/styles/llave15.css";
const css = existsSync(path) ? readFileSync(path, "utf8") : "";
const tallerCss = readFileSync("src/styles/taller-components.css", "utf8");
const blocks = parseCss(css);
const tallerBlocks = parseCss(tallerCss);
const originalBlocks = parseCss(
  execFileSync("git", ["show", "bg-47:src/styles/taller-components.css"], { encoding: "utf8" }),
);
const groups = {
  neutral: [
    "reservada",
    "recibida",
    "entregada",
    "cancelada",
    "anulada",
    "draft",
    "published",
    "withdrawn",
    "sin_dato_verificado",
    "no_verificada",
  ],
  progress: [
    "diagnostico",
    "en_reparacion",
    "control_calidad",
    "abierta",
    "submitted",
    "in_review",
    "en_revision",
  ],
  waiting: [
    "esperando_aprobacion",
    "esperando_repuesto",
    "bajo",
    "needs_changes",
    "condicionado",
    "condicionada",
    "desactualizado",
    "media",
    "baja",
  ],
  ready: ["lista_para_retirar", "verificado", "oficial_confirmada", "approved", "alta", "activo"],
  blocking: [
    "trabajo_rechazado",
    "sin-stock",
    "diferencia",
    "rejected",
    "incompatible",
    "suspendido",
  ],
};

function declarations(source: CssBlock[], selector: string): Record<string, string> {
  const matches = source.filter((block) => block.selectors.includes(selector));
  expect(matches.length, selector).toBeGreaterThan(0);
  return Object.assign({}, ...matches.map((block) => block.declarations));
}

function statusShapes(source: CssBlock[]): CssBlock[] {
  return source
    .filter((block) => block.selectors.some((selector) => selector.includes(".status")))
    .map((block) => ({
      selectors: block.selectors,
      declarations: Object.fromEntries(
        Object.entries(block.declarations).filter(
          ([property]) =>
            property === "border-style" || block.selectors.some((s) => s.endsWith("::before")),
        ),
      ),
    }))
    .filter((block) => Object.keys(block.declarations).length > 0);
}

describe("controles y estados Llave 15 (BG-48)", () => {
  it("limita la hoja nueva a l15, sin hex, sombras ni important", () => {
    expect(existsSync(path)).toBe(true);
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block.selectors.every((selector) => selector.startsWith(".l15 "))).toBe(true);
    }
    expect(css + tallerCss).not.toMatch(/#[0-9a-f]{3,8}([^0-9a-z]|$)/i);
    expect(css).not.toMatch(/box-shadow|!important/);
    expect(css.split("\n").length).toBeLessThan(400);
    expect(tallerCss.split("\n").length).toBeLessThan(400);
  });

  it("asigna exactamente las clases acordadas, una vez por clase y en su grupo", () => {
    const modifiers = blocks.flatMap((block) =>
      block.selectors.filter((selector) => selector.startsWith(".l15 .status--")),
    );
    expect(modifiers.sort()).toEqual(
      Object.values(groups)
        .flat()
        .map((status) => `.l15 .status--${status}`)
        .sort(),
    );
    for (const [group, statuses] of Object.entries(groups)) {
      for (const status of statuses) {
        expect(declarations(blocks, `.l15 .status--${status}`)).toEqual({
          "--status-bg": `var(--status-${group}-bg)`,
          "--status-ink": `var(--status-${group}-ink)`,
        });
      }
    }
    expect(declarations(blocks, ".l15 .status")).toMatchObject({
      "--status-bg": "var(--status-neutral-bg)",
      "--status-ink": "var(--status-neutral-ink)",
      "background-color": "var(--status-bg, transparent)",
      color: "var(--status-ink, inherit)",
    });
  });

  it("aplica el fondo y la tinta sin cambiar ningún border-style ni ::before", () => {
    expect(declarations(tallerBlocks, ".taller .status")).toMatchObject({
      background: "var(--status-bg, transparent)",
      color: "var(--status-ink, inherit)",
      border: "1px solid currentColor",
      "border-radius": "var(--radius-control)",
    });
    expect(statusShapes(tallerBlocks)).toEqual(statusShapes(originalBlocks));
    for (const status of Object.keys(STATUS_LABELS)) {
      const selector = `.taller .status--${status}::before`;
      expect(declarations(tallerBlocks, selector)).toEqual(declarations(originalBlocks, selector));
    }
    for (const block of tallerBlocks) {
      if (!block.selectors.some((selector) => selector.includes(".status--"))) continue;
      if (block.declarations.border)
        expect(block.declarations.border).toBe("3px double currentColor");
      if (block.declarations.background) {
        expect(block.declarations.background).toBe(
          "repeating-linear-gradient(135deg, var(--status-bg, var(--surface)) 0 4px, var(--hatch) 4px 5px)",
        );
      }
    }
  });

  it.each([
    [".l15", blocks],
    [".taller", tallerBlocks],
  ] as const)("usa accent, secundarios neutros y foco accesible en %s", (scope, source) => {
    expect(declarations(source, `${scope} .btn`)).toMatchObject({
      background: "var(--accent)",
      color: "var(--on-ink)",
      "border-color": "var(--accent)",
      "border-radius": "var(--radius-control)",
    });
    expect(declarations(source, `${scope} .btn:hover`)).toMatchObject({
      background: "var(--accent-hover)",
      color: "var(--on-ink)",
      "border-color": "var(--accent-hover)",
    });
    expect(declarations(source, `${scope} .btn.ghost`)).toMatchObject({
      background: "var(--surface)",
      color: "var(--ink)",
      "border-color": "var(--field-border)",
    });
    expect(declarations(source, `${scope} .btn.ghost:hover`)).toMatchObject({
      background: "var(--surface)",
      color: "var(--ink)",
      "border-color": "var(--ink)",
    });
    expect(declarations(source, `${scope} :focus-visible`)).toMatchObject({
      outline: "2px solid var(--focus)",
      "outline-offset": "2px",
    });
  });

  it("mantiene el foco sobre los campos y usa blanco dentro de on-dark", () => {
    for (const control of ["input", "select", "textarea"]) {
      expect(declarations(blocks, `.l15 .field ${control}:focus-visible`)).toMatchObject({
        outline: "2px solid var(--focus)",
        "outline-offset": "2px",
      });
    }
    expect(declarations(blocks, ".l15 .on-dark :focus-visible").outline).toBe(
      "2px solid var(--on-ink)",
    );
    expect(declarations(tallerBlocks, ".taller .on-dark :focus-visible").outline).toBe(
      "2px solid var(--on-ink)",
    );
  });

  it("aplica la escala tipográfica y los números tabulares", () => {
    for (const [selector, size, height, weight] of [
      ["h1", "28px", "36px", "600"],
      ["h2", "20px", "28px", "600"],
      ["body", "16px", "24px", undefined],
      ["table.dense", "14px", "20px", undefined],
      [".label", "14px", "20px", undefined],
    ]) {
      const rule = declarations(blocks, `.l15 ${selector}`);
      expect(rule).toMatchObject({ "font-size": size, "line-height": height });
      if (weight) expect(rule["font-weight"]).toBe(weight);
    }
    expect(declarations(blocks, ".l15 .label")).toMatchObject({
      "text-transform": "none",
      "letter-spacing": "normal",
    });
    for (const selector of ["table", ".mono", ".status", ".ticket-total strong", ".big-price"]) {
      expect(
        blocks.some(
          (block) =>
            block.selectors.includes(`.l15 ${selector}`) &&
            block.declarations["font-variant-numeric"] === "tabular-nums",
        ),
      ).toBe(true);
    }
  });

  it("aplica los radios de controles y superficies", () => {
    for (const control of ["input", "select", "textarea", "button"]) {
      expect(declarations(blocks, `.l15 ${control}`)).toMatchObject({
        "border-radius": "var(--radius-control)",
        "border-color": "var(--field-border)",
      });
    }
    for (const selector of [
      ".mode",
      ".slots",
      ".ticket",
      ".card",
      '[role="status"]',
      '[role="alert"]',
    ]) {
      expect(declarations(blocks, `.l15 ${selector}`)["border-radius"]).toBe("var(--radius-card)");
    }
    expect(declarations(blocks, ".l15 .day")["border-radius"]).toBe("var(--radius-control)");
    for (const selector of [".card", '[role="status"]', '[role="alert"]', ".lib-category"]) {
      expect(declarations(tallerBlocks, `.taller ${selector}`)["border-radius"]).toBe(
        "var(--radius-card)",
      );
    }
    for (const selector of [".options label", ".grid-photos img"]) {
      expect(declarations(tallerBlocks, `.taller ${selector}`)["border-radius"]).toBe(
        "var(--radius-control)",
      );
    }
  });

  it("usa bloqueo en los avisos y carga llave15.css justo después de global.css", () => {
    for (const [scope, source] of [
      [".l15", blocks],
      [".taller", tallerBlocks],
    ] as const) {
      expect(declarations(source, `${scope} [role="alert"]`)).toMatchObject({
        background: "var(--status-blocking-bg)",
        color: "var(--status-blocking-ink)",
      });
    }
    expect(readFileSync("src/layouts/AppLayout.astro", "utf8")).toMatch(
      /import "\.\.\/styles\/global\.css";\s*import "\.\.\/styles\/llave15\.css";/,
    );
  });

  it("renderiza la firma y descriptor sobre el formulario, conservando textos y next", async () => {
    const { default: LoginPage } = await import("../../src/pages/admin/login.astro");
    const container = await AstroContainer.create();
    const response = await container.renderToResponse(LoginPage, {
      request: new Request("https://example.test/admin/login?next=%2Ftaller%2Fordenes"),
    });
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(html).toMatch(
      /<img\b[^>]*src="\/brand\/llave15-firma.svg"[^>]*alt="Llave 15"[^>]*width="176"[^>]*height="40"/,
    );
    expect(html).toMatch(new RegExp(`<p[^>]*>${PLATFORM.descriptor}</p>`));
    expect(html.indexOf("/brand/llave15-firma.svg")).toBeLessThan(html.indexOf("<form"));
    expect(html.indexOf(PLATFORM.descriptor)).toBeLessThan(html.indexOf("<form"));
    for (const text of ["Panel del taller", "Ingresar", "Correo", "Clave"])
      expect(html).toContain(text);
    expect(html).toContain('method="post" action="/admin/login"');
    expect(html).toContain('name="next" value="/taller/ordenes"');
    const login = readFileSync("src/pages/admin/login.astro", "utf8");
    expect(login).toMatch(/class="login-brand"/);
    expect(login).toMatch(/\.login-brand\s*\{[^}]*padding:\s*12px/);
  });
});
