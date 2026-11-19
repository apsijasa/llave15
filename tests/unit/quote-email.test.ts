import { vectorBikesBrand } from "../helpers/shops.ts";
import { expect, it } from "vitest";
import { quoteEmail, quoteTotalClp } from "../../src/server/email/order-templates.ts";
import type { QuoteEmail } from "../../src/server/email/order-templates.ts";

const INPUT: QuoteEmail = {
  orderNumber: "OT-00001",
  customerName: "Ana María Pérez",
  bike: "Trek Marlin",
  items: [
    { description: "Ajuste de frenos", quantity: 2, unitPriceClp: 12000 },
    { description: "Cadena", quantity: 1, unitPriceClp: 18000 },
  ],
  estimatedDeliveryDate: "2026-11-16",
  trackingUrl: "https://vectorbikes.cl/seguimiento/prueba",
};

it("compone la cotización con cantidades, precios, total y entrega en español", () => {
  const email = quoteEmail(vectorBikesBrand(), INPUT);
  expect(email.subject).toBe("Cotización · OT-00001 · Vector Bikes");
  expect(email.text).toContain("Tu cotización\n\nHola Ana,");
  expect(email.text).not.toContain("María Pérez");
  expect(email.text).toContain(
    "Este es el presupuesto de tu bicicleta. Si estás de acuerdo, respóndenos por este correo o por WhatsApp y empezamos.",
  );
  expect(email.text).toContain("Ajuste de frenos: 2 × $12.000");
  expect(email.text).toContain("Cadena: 1 × $18.000");
  expect(email.html.match(/Ajuste de frenos/g)).toHaveLength(1);
  expect(email.html.match(/Cadena/g)).toHaveLength(1);
  expect(quoteTotalClp(INPUT.items)).toBe(42000);
  expect(quoteTotalClp([])).toBe(0);
  expect(email.text).toContain("Total: $42.000");
  expect(email.text).toContain("Entrega estimada: 16 de noviembre de 2026");
  expect(email.text).toContain(
    "El diagnóstico y los repuestos se cotizan en el taller. Si encontramos un problema extra, te llamamos antes de hacer cualquier trabajo que no estaba en tu descripción: te explicamos la solución y tú decides.",
  );
});

it("incluye el enlace en HTML y texto y omite enlace y fecha cuando son nulos", () => {
  const email = quoteEmail(vectorBikesBrand(), INPUT);
  expect(email.html).toContain(`href="${INPUT.trackingUrl}"`);
  expect(email.text).toContain(`Ver el estado de tu bicicleta: ${INPUT.trackingUrl}`);
  const without = quoteEmail(vectorBikesBrand(), {
    ...INPUT,
    trackingUrl: null,
    estimatedDeliveryDate: null,
  });
  for (const body of [without.html, without.text]) {
    expect(body).not.toContain("seguimiento");
    expect(body).not.toContain("Ver el estado de tu bicicleta");
    expect(body).not.toContain("Entrega estimada");
  }
});

it("escapa las descripciones en HTML y conserva el texto original", () => {
  const description = '<script>alert("x")</script> & frenos';
  const email = quoteEmail(vectorBikesBrand(), {
    ...INPUT,
    items: [{ description, quantity: 1, unitPriceClp: 1 }],
  });
  expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; frenos");
  expect(email.html).not.toContain("<script>");
  expect(email.text).toContain(description);
});
