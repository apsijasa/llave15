import { readFileSync } from "node:fs";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import { PLATFORM } from "../../src/lib/platform.ts";
import { ROLE_LABELS, ROLES } from "../../src/server/auth/permissions.ts";
import type { Role } from "../../src/server/auth/permissions.ts";
import type { Booking } from "../../src/server/db/schema.ts";
import { customerConfirmationEmail } from "../../src/server/email/booking/templates.ts";
import { DEMO_SHOP_PROFILE } from "../helpers/shops.ts";

const css = readFileSync("src/styles/taller-layout.css", "utf8");
const [mobileCss = "", desktopCss = ""] = css.split("@media (min-width: 1024px) {");
const commonLinks = [
  ["/taller", "Inicio"],
  ["/taller/buscar", "Buscar"],
  ["/taller/ordenes", "Órdenes"],
  ["/taller/recepcion/nueva", "Recepción"],
];
const knowledgeLinks = [
  ["/taller/biblioteca", "Biblioteca"],
  ["/taller/biblioteca/asistente", "Asistente"],
  ["/taller/biblioteca/propuestas", "Propuestas"],
];
const staffLinks = [
  ...commonLinks,
  ["/taller/reservas", "Reservas"],
  ["/admin", "Agenda"],
  ["/taller/clientes", "Clientes"],
  ["/taller/catalogo", "Catálogo"],
];
const stockLinks = [
  ["/taller/inventario", "Inventario"],
  ["/taller/ventas", "Ventas"],
  ["/taller/caja", "Caja"],
];
const managementLinks = [
  ["/taller/proveedores", "Proveedores"],
  ["/taller/compras", "Compras"],
  ["/taller/gastos", "Gastos"],
];
const expectedLinks: Record<Role, string[][]> = {
  owner: [
    ...staffLinks,
    ["/taller/indicadores", "Indicadores"],
    ["/taller/usuarios", "Usuarios"],
    ["/admin/bloqueos", "Bloqueos"],
    ...knowledgeLinks,
    ...stockLinks,
    ...managementLinks,
  ],
  admin: [
    ...staffLinks,
    ["/taller/indicadores", "Indicadores"],
    ["/admin/bloqueos", "Bloqueos"],
    ...knowledgeLinks,
    ...stockLinks,
    ...managementLinks,
  ],
  reception: [...staffLinks, ["/admin/bloqueos", "Bloqueos"], ...knowledgeLinks, ...stockLinks],
  mechanic: [
    ...commonLinks,
    ["/taller/catalogo", "Catálogo"],
    ...knowledgeLinks,
    ["/taller/inventario", "Inventario"],
  ],
};

function declarations(source: string, selector: string): string {
  const blocks = [...source.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const matches = blocks.filter(([, selectors = ""]) =>
    selectors.split(",").some((value) => value.trim() === selector),
  );
  expect(matches.length, selector).toBeGreaterThan(0);
  return matches.map(([, , body]) => body).join("\n");
}

async function renderStaff(role: Role, libraryCurator = false): Promise<string> {
  const { default: TallerLayout } = await import("../../src/layouts/TallerLayout.astro");
  const container = await AstroContainer.create();
  return container.renderToString(TallerLayout, {
    props: {
      title: "Órdenes — Llave 15",
      description: "Gestión del taller",
      path: "/taller/ordenes",
      user: { name: "Ana", role, libraryCurator },
    },
  });
}

function menuLinks(html: string): string[][] {
  const nav = html.match(/<nav\b[^>]*aria-label="Taller"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? "";
  return [...nav.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/g)].map(
    ([, href = "", label = ""]) => [href, label],
  );
}

describe("firma de Llave 15 en los layouts (BG-49)", () => {
  it.each(ROLES)("muestra la firma accesible y conserva el menú de %s", async (role) => {
    const html = await renderStaff(role);
    expect(html).toMatch(
      /<a\b[^>]*class="taller-brand on-dark"[^>]*href="\/taller"[^>]*>\s*<img\b[^>]*src="\/brand\/llave15-firma-invertida.svg"[^>]*alt="Llave 15"[^>]*width="132"[^>]*height="30"[^>]*>\s*<span\b[^>]*class="taller-area"[^>]*>Taller<\/span>\s*<\/a>/,
    );
    expect(menuLinks(html)).toEqual(expectedLinks[role]);
    expect(html).toMatch(new RegExp(`Ana · <span class="role">${ROLE_LABELS[role]}</span>`));
    expect(html).toContain('href="/taller/ordenes" aria-current="page"');
    expect(html).toContain('method="post" action="/admin/logout"');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Salir<\/button>/);
    for (const label of [
      "Operación",
      "Gestión",
      "Conocimiento",
      "Inventario y caja",
      "Menú",
      "Cerrar",
    ])
      expect(html).toContain(label);
  });

  it.each(ROLES)("mantiene el permiso de revisión para %s con marca de curador", async (role) => {
    const links = [...expectedLinks[role]];
    if (role === "owner" || role === "admin") {
      links.splice(
        links.findIndex(([href]) => href === "/taller/inventario"),
        0,
        ["/taller/biblioteca/revision", "Revisión"],
      );
    }
    expect(menuLinks(await renderStaff(role, true))).toEqual(links);
  });

  it("usa grafito, tinta clara y espacio libre para la firma, sin hex", () => {
    const aside = declarations(mobileCss, ".taller .taller-aside");
    expect(aside).toContain("background: var(--ink)");
    expect(aside).toContain("color: var(--on-ink)");
    expect(declarations(css, ".taller .taller-user")).toContain("color: var(--on-ink)");
    expect(declarations(css, ".taller .taller-brand")).toContain("padding: 8px");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}([^0-9a-z]|$)/i);
    expect(css).not.toMatch(/box-shadow|!important/);
  });

  it("mantiene el cajón claro y usa enlaces claros y selección invertida en escritorio", () => {
    const panel = declarations(mobileCss, ".taller .taller-panel");
    expect(panel).toContain("background: var(--surface)");
    expect(panel).toContain("color: var(--ink)");
    expect(panel).toContain("border-radius: var(--radius-card)");
    expect(declarations(desktopCss, ".taller .taller-panel nav a")).toContain(
      "color: var(--on-ink)",
    );
    expect(declarations(desktopCss, ".taller .taller-panel nav a:hover")).toContain(
      "border-color: var(--on-ink)",
    );
    const current = declarations(desktopCss, '.taller .taller-panel nav a[aria-current="page"]');
    expect(current).toContain("background: var(--surface)");
    expect(current).toContain("color: var(--ink)");
  });

  it("distingue el foco sobre grafito del cajón abierto y conserva radios y objetivos", () => {
    expect(declarations(css, ".taller .taller-aside :focus-visible")).toContain(
      "outline: 2px solid var(--on-ink)",
    );
    expect(declarations(mobileCss, ".taller .taller-panel:popover-open :focus-visible")).toContain(
      "outline: 2px solid var(--focus)",
    );
    expect(declarations(css, ".taller button")).toContain("border-radius: var(--radius-control)");
    expect(declarations(css, ".taller .taller-panel nav a")).toContain(
      "border-radius: var(--radius-control)",
    );
    expect(declarations(mobileCss, ".taller a")).toContain("min-height: 48px");
    expect(declarations(mobileCss, ".taller a")).toContain("min-width: 48px");
    const fineCss = css.split("@media (min-width: 1024px) and (pointer: fine) {")[1] ?? "";
    expect(declarations(fineCss, ".taller .taller-panel nav a")).toContain("min-height: 34px");
  });

  it.each([null, "/taller-demo/logo"])(
    "conserva el encabezado con logo %s y firma el pie del Demo",
    async (logoPath) => {
      const { default: PublicLayout } = await import("../../src/layouts/PublicLayout.astro");
      const container = await AstroContainer.create();
      const html = await container.renderToString(PublicLayout, {
        props: { title: "Reservar — Taller Demo", profile: { ...DEMO_SHOP_PROFILE, logoPath } },
      });
      const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0] ?? "";
      expect(header).toContain("Taller Demo");
      if (logoPath) expect(header).toContain('src="/taller-demo/logo" alt="Taller Demo"');
      else expect(header).not.toContain("<img");
      expect(header).not.toContain("/brand/llave15-");
      const footer = html.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/)?.[0] ?? "";
      expect(footer).toMatch(
        /<img\b[^>]*src="\/brand\/llave15-distintivo.svg"[^>]*alt=""[^>]*width="24"[^>]*height="24"/,
      );
      expect(footer).toContain("Taller Demo · Gestionado con Llave 15");
      expect(footer).toContain(DEMO_SHOP_PROFILE.addressShort);
      expect(footer).toContain(`href="mailto:${DEMO_SHOP_PROFILE.email}"`);
    },
  );
});

const now = new Date("2026-11-12T15:00:00Z");
const booking: Booking = {
  id: "11111111-1111-4111-8111-111111111111",
  branchId: "22222222-2222-4222-8222-222222222222",
  code: "TD-261113-1000",
  serviceDate: "2026-11-13",
  mode: "taller",
  bikeCount: 1,
  status: "confirmed",
  source: "web",
  startsAt: new Date("2026-11-13T13:00:00Z"),
  endsAt: new Date("2026-11-13T14:00:00Z"),
  timezone: DEMO_SHOP_PROFILE.timezone,
  customerName: "Ana Pérez",
  phoneE164: "+56911112222",
  email: "ana@example.test",
  bike: "Trek Marlin",
  description: "Mantención",
  comuna: null,
  address: null,
  pickupFeeClp: 0,
  consentAt: now,
  whatsappConsentAt: null,
  cancelTokenHash: "hash",
  cancelTokenUsedAt: null,
  cancelledAt: null,
  cancelledBy: null,
  completedAt: null,
  reminderSentAt: null,
  ipHash: null,
  createdAt: now,
  updatedAt: now,
};

it("cierra la confirmación del Taller Demo con la misma firma en texto y HTML", () => {
  const email = customerConfirmationEmail(
    {
      shopName: DEMO_SHOP_PROFILE.name,
      replyTo: DEMO_SHOP_PROFILE.email,
      notifyEmail: DEMO_SHOP_PROFILE.notifyEmail,
      phoneDisplay: DEMO_SHOP_PROFILE.phoneDisplay,
      addressShort: DEMO_SHOP_PROFILE.addressShort,
      logoPath: null,
      footerLine: PLATFORM.footerLine,
    },
    booking,
    "https://example.test/reservas/cancelar?token=prueba",
  );
  expect(email.subject).toBe(`Reserva confirmada ${booking.code} · Taller Demo`);
  expect(email.text.split("\n").at(-1)).toBe("Taller Demo · Gestionado con Llave 15");
  expect(email.html).toMatch(
    /<p\b[^>]*>Taller Demo · Gestionado con Llave 15<\/p><\/div><\/body><\/html>$/,
  );
  expect(email.html).not.toContain("<img");
});
