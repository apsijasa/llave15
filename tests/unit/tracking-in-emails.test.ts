import { vectorBikesGarageBrand } from "../helpers/shops.ts";
import { describe, expect, it } from "vitest";
import { readyForPickupEmail, receivedBikeEmail } from "../../src/server/email/garage/templates.ts";
import type { ReceivedBike, ReadyForPickup } from "../../src/server/email/garage/templates.ts";

const TRACKING_URL = "https://vectorbikes.cl/seguimiento/abc";
const LABEL = "Ver el estado de tu bicicleta";
const RECEIVED: ReceivedBike = {
  orderNumber: "OT-00001",
  customerName: "Ana Pérez",
  bike: "Trek Marlin",
  requestedService: "Mantención general",
  items: [{ description: "Ajuste de frenos", quantity: 1, unitPriceClp: 18000 }],
  accessories: ["Luz trasera"],
  estimatedDeliveryDate: "2026-11-14",
  warrantyOfNumber: null,
};
const READY: ReadyForPickup = {
  orderNumber: "OT-00001",
  customerName: "Ana Pérez",
  bike: "Trek Marlin",
  totalClp: 18000,
  paidClp: 5000,
};
type TrackingInput = { trackingUrl?: string | null };

describe.each([
  {
    name: "Recibimos tu bicicleta",
    render: (extra: TrackingInput) =>
      receivedBikeEmail(vectorBikesGarageBrand(), { ...RECEIVED, ...extra }),
  },
  {
    name: "Lista para retirar",
    render: (extra: TrackingInput) =>
      readyForPickupEmail(vectorBikesGarageBrand(), { ...READY, ...extra }),
  },
])("seguimiento en $name", ({ render }) => {
  it("incluye el único enlace en HTML y texto plano", () => {
    const email = render({ trackingUrl: TRACKING_URL });

    expect(email.html).toContain(`href="${TRACKING_URL}"`);
    expect(email.html).toContain(LABEL);
    expect(email.html.match(/<a\s/g)).toHaveLength(1);
    expect(email.text).toContain(`${LABEL}: ${TRACKING_URL}`);
  });

  it.each([null, undefined])(
    "con %s conserva exactamente el correo sin el campo",
    (trackingUrl) => {
      const baseline = render({});
      const email = render({ trackingUrl });

      expect(email).toEqual(baseline);
      for (const body of [baseline.html, baseline.text, email.html, email.text]) {
        expect(body).not.toContain("seguimiento");
        expect(body).not.toContain(LABEL);
      }
    },
  );

  it("escapa la URL en HTML y conserva la URL original en texto plano", () => {
    const email = render({ trackingUrl: "https://x.test/?a=1&b=2" });

    expect(email.html).toContain('href="https://x.test/?a=1&amp;b=2"');
    expect(email.text).toContain(`${LABEL}: https://x.test/?a=1&b=2`);
  });
});

it("genera el texto plano completo de Recibimos tu bicicleta con seguimiento", () => {
  const email = receivedBikeEmail(vectorBikesGarageBrand(), {
    ...RECEIVED,
    trackingUrl: TRACKING_URL,
  });

  expect(email.text).toBe(`Recibimos tu bicicleta

Hola Ana,
Tu bicicleta quedó registrada en el taller.

Orden: OT-00001
Bicicleta: Trek Marlin
Servicio solicitado: Mantención general
Ajuste de frenos: 1 × $18.000
Total cotizado: $18.000
Accesorios: Luz trasera
Entrega estimada: 14 de noviembre de 2026

Si encontramos algo que no estaba en lo que pediste, te contactamos antes de hacerlo.

Ver el estado de tu bicicleta: https://vectorbikes.cl/seguimiento/abc

Vector Bikes · Av. Kennedy 7666, Vitacura · info@vectorbikes.cl
Vector Bikes · Gestionado con Llave 15`);
});
