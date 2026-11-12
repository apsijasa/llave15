import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReportSnapshot } from "../../src/server/taller/reports.ts";

const brand = vi.hoisted(() => ({ certifications: [] as readonly string[] }));
vi.mock("../../src/lib/site.ts", async (original) => {
  const { SITE, ...rest } = await original<typeof import("../../src/lib/site.ts")>();
  return {
    ...rest,
    SITE: {
      ...SITE,
      get certifications() {
        return brand.certifications;
      },
    },
  };
});

const snapshot: ReportSnapshot = {
  version: 1,
  orderNumber: "OT-00001",
  customerFirstName: "Ana",
  bike: {
    brand: "Trek",
    model: "Marlin",
    year: null,
    type: "mtb",
    size: null,
    color: null,
    serialNumber: null,
    kmNoted: null,
  },
  receivedAt: null,
  deliveredAt: null,
  diagnosis: null,
  workDone: [],
  problemsFound: [],
  componentsReplaced: [],
  photosBefore: [],
  photosAfter: [],
  recommendations: "",
  nextChecks: "",
  rejectedWork: [],
  totalClp: 0,
};

beforeEach(() => {
  brand.certifications = [];
  vi.resetModules();
});

async function render(certifications: readonly string[]) {
  brand.certifications = certifications;
  const { default: ReportView } = await import("../../src/components/taller/ReportView.astro");
  const container = await AstroContainer.create();
  return container.renderToString(ReportView, { props: { snapshot, photos: {} } });
}

it.each([{ certifications: [] }, { certifications: ["Shimano Service Center", "SRAM Technical"] }])(
  "muestra el contacto sin logo, header ni footer, con certificaciones $certifications",
  async ({ certifications }) => {
    const html = await render(certifications);
    // El logo va en la página pública del informe, no en el componente compartido con el taller.
    expect(html).not.toContain("/brand/");
    expect(html).toContain(
      "Vector Bikes · Av. Kennedy 7666, Vitacura · info@vectorbikes.cl · +56 9 8509 5780",
    );
    expect(html.indexOf("info@vectorbikes.cl")).toBeGreaterThan(html.indexOf("Total"));
    expect(html).not.toMatch(/<header\b|<footer\b/);
    if (certifications.length) {
      expect(html).toContain(`Certificaciones: ${certifications.join(" · ")}`);
    } else {
      expect(html).not.toContain("Certificaciones");
    }
  },
);
