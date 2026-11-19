import { describe, expect, it } from "vitest";
import { SITE, vectorBikesGarageBrand } from "../helpers/shops.ts";
import { quoteEmail, quoteTotalClp } from "../../src/server/email/order-templates.ts";
import type { QuoteEmail } from "../../src/server/email/order-templates.ts";
import { readyForPickupEmail, receivedBikeEmail } from "../../src/server/email/garage/templates.ts";
import type {
  ReadyForPickup,
  ReceivedBike,
  RenderedEmail,
} from "../../src/server/email/templates.ts";

const brand = vectorBikesGarageBrand();

const ITEMS = [
  { description: "Ajuste de frenos", quantity: 2, unitPriceClp: 3000 },
  { description: "Cadena", quantity: 1, unitPriceClp: 4000 },
];
const RECEIVED: ReceivedBike = {
  orderNumber: "OT-00013",
  customerName: "Ana Pérez",
  bike: "Trek Marlin",
  requestedService: "Mantención general",
  items: ITEMS,
  accessories: ["Luz trasera"],
  estimatedDeliveryDate: "2026-11-16",
  warrantyOfNumber: "OT-00001",
  trackingUrl: "https://example.test/seguimiento/prueba",
};
const READY: ReadyForPickup = {
  orderNumber: RECEIVED.orderNumber,
  customerName: RECEIVED.customerName,
  bike: RECEIVED.bike,
  totalClp: 11900,
  paidClp: 5000,
  trackingUrl: RECEIVED.trackingUrl,
};
const QUOTE: QuoteEmail = {
  orderNumber: RECEIVED.orderNumber,
  customerName: RECEIVED.customerName,
  bike: RECEIVED.bike,
  items: ITEMS,
  estimatedDeliveryDate: RECEIVED.estimatedDeliveryDate,
  trackingUrl: RECEIVED.trackingUrl ?? null,
};

function expectRows(email: RenderedEmail, rows: [string, string][]) {
  expect(email.subject).toContain(SITE.name);
  expect(email.text).toContain(rows.map(([label, value]) => `${label}: ${value}`).join("\n"));
  const htmlRows = email.html.match(/<tr>.*?<\/tr>/g) ?? [];
  for (const [label, value] of rows) {
    const row = htmlRows.find((candidate) => candidate.includes(`>${label}</td>`));
    expect(row).toContain(`>${value}</td>`);
  }
}

describe("desglose de precios netos en correos", () => {
  it("recepción muestra neto, IVA y total cotizado en texto y HTML", () => {
    const email = receivedBikeEmail(brand, { ...RECEIVED, pricingMode: "neto" });
    expectRows(email, [
      ["Neto", "$10.000"],
      ["IVA (19%)", "$1.900"],
      ["Total cotizado", "$11.900"],
    ]);
  });

  it("retiro muestra el desglose guardado, abono y saldo del total con IVA", () => {
    const email = readyForPickupEmail(brand, {
      ...READY,
      pricing: { mode: "neto", subtotalClp: 10000, vatClp: 1900 },
    });
    expectRows(email, [
      ["Neto", "$10.000"],
      ["IVA (19%)", "$1.900"],
      ["Total", "$11.900"],
      ["Abonado", "$5.000"],
      ["Saldo", "$6.900"],
    ]);
  });

  it("retiro conserva Pagado cuando el abono cubre el total con IVA", () => {
    for (const paidClp of [11900, 12000]) {
      expectRows(
        readyForPickupEmail(brand, {
          ...READY,
          paidClp,
          pricing: { mode: "neto", subtotalClp: 10000, vatClp: 1900 },
        }),
        [["Saldo", "Pagado"]],
      );
    }
  });

  it("cotización muestra neto, IVA y total con IVA en texto y HTML", () => {
    expectRows(quoteEmail({ ...QUOTE, pricingMode: "neto" }), [
      ["Neto", "$10.000"],
      ["IVA (19%)", "$1.900"],
      ["Total", "$11.900"],
    ]);
  });

  it("el total de la cotización agrega IVA solo en neto", () => {
    expect(quoteTotalClp(ITEMS, "neto")).toBe(11900);
    expect(quoteTotalClp(ITEMS, "final")).toBe(10000);
    expect(quoteTotalClp(ITEMS)).toBe(10000);
    expect(quoteTotalClp([], "neto")).toBe(0);
  });

  it("redondea el IVA una sola vez sobre la suma de las líneas", () => {
    const items = [{ description: "Ajuste", quantity: 2, unitPriceClp: 50 }];
    const rows: [string, string][] = [
      ["Neto", "$100"],
      ["IVA (19%)", "$19"],
    ];
    expectRows(receivedBikeEmail(brand, { ...RECEIVED, items, pricingMode: "neto" }), [
      ...rows,
      ["Total cotizado", "$119"],
    ]);
    expectRows(quoteEmail({ ...QUOTE, items, pricingMode: "neto" }), [...rows, ["Total", "$119"]]);
    expect(quoteTotalClp(items, "neto")).toBe(119);
  });

  it("recepción sin líneas sigue anunciando el presupuesto posterior sin montos", () => {
    const email = receivedBikeEmail(brand, {
      ...RECEIVED,
      items: [],
      pricingMode: "neto",
    });
    for (const body of [email.text, email.html]) {
      expect(body).toContain("Te enviaremos el presupuesto después del diagnóstico.");
      expect(body).not.toContain("Neto");
      expect(body).not.toContain("IVA (19%)");
      expect(body).not.toContain("Total cotizado");
    }
  });

  it("cotización neta vacía muestra montos cero", () => {
    expectRows(quoteEmail({ ...QUOTE, items: [], pricingMode: "neto" }), [
      ["Neto", "$0"],
      ["IVA (19%)", "$0"],
      ["Total", "$0"],
    ]);
  });
});

describe("compatibilidad de los correos con precios finales", () => {
  it("recepción conserva subject, html y text con final o régimen omitido", () => {
    const previous = receivedBikeEmail(brand, RECEIVED);
    expect(receivedBikeEmail(brand, { ...RECEIVED, pricingMode: "final" })).toEqual(previous);
    expect(receivedBikeEmail(brand, { ...RECEIVED, pricingMode: undefined })).toEqual(previous);
  });

  it("retiro conserva subject, html y text e ignora el desglose en final", () => {
    const previous = readyForPickupEmail(brand, READY);
    expect(
      readyForPickupEmail(brand, {
        ...READY,
        pricing: { mode: "final", subtotalClp: 10000, vatClp: 1900 },
      }),
    ).toEqual(previous);
    expect(readyForPickupEmail(brand, { ...READY, pricing: undefined })).toEqual(previous);
  });

  it("cotización conserva subject, html y text con final o régimen omitido", () => {
    const previous = quoteEmail(QUOTE);
    expect(quoteEmail({ ...QUOTE, pricingMode: "final" })).toEqual(previous);
    expect(quoteEmail({ ...QUOTE, pricingMode: undefined })).toEqual(previous);
  });
});
