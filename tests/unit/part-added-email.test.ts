import { expect, it } from "vitest";
import { SITE, vectorBikesBrand } from "../helpers/shops.ts";
import { partAddedEmail } from "../../src/server/email/order-templates.ts";

const input = {
  orderNumber: "OT-00001",
  customerName: "  Ana Pérez ",
  bike: "Trek Marlin",
  item: { description: "Pastillas de freno", quantity: 2, unitPriceClp: 5950 },
  pricingMode: "final" as const,
  subtotalClp: 11900,
  vatClp: 2261,
  totalClp: 14161,
  trackingUrl: "https://example.test/seguimiento/enlace-de-prueba",
};

it("identifica el taller, saluda solo por el primer nombre y muestra el precio cobrado", () => {
  const email = partAddedEmail(vectorBikesBrand(), input);
  expect(email.subject).toBe(`Agregamos un repuesto a tu orden · OT-00001 · ${SITE.name}`);
  expect(email.text).toContain("Hola Ana,");
  expect(email.text).not.toContain("Pérez");
  expect(email.text).toContain("Agregamos este repuesto al trabajo de tu bicicleta.");
  expect(email.text).toContain("Orden: OT-00001");
  expect(email.text).toContain("Bicicleta: Trek Marlin");
  expect(email.text).toContain("Pastillas de freno: 2 × $5.950");
  expect(email.text).toContain("Nuevo total: $14.161");
  expect(email.text).not.toContain("Neto:");
  expect(email.text).not.toContain("IVA");
  expect(email.text).toContain("Si tienes dudas sobre este repuesto, responde este correo.");
  expect(`${email.text} ${email.html}`).not.toMatch(/costo|margen|unit_cost_clp|cost_clp/i);
});

it("muestra el desglose neto completo con los montos recibidos", () => {
  const email = partAddedEmail(vectorBikesBrand(), { ...input, pricingMode: "neto" });
  expect(email.text).toBe(`Agregamos un repuesto a tu orden

Hola Ana,
Agregamos este repuesto al trabajo de tu bicicleta.

Orden: OT-00001
Bicicleta: Trek Marlin
Pastillas de freno: 2 × $5.950
Neto: $11.900
IVA (19%): $2.261
Total: $14.161

Si tienes dudas sobre este repuesto, responde este correo.

Ver el estado de tu bicicleta: ${input.trackingUrl}

${SITE.name} · ${SITE.addressShort} · ${SITE.email}
Gestionado con Llave 15`);
  for (const label of ["Neto", "IVA (19%)", "Total"]) expect(email.html).toContain(label);
  expect(email.text).not.toContain("Nuevo total");
});

it("incluye el seguimiento en HTML y texto y omite el enlace cuando no existe", () => {
  const email = partAddedEmail(vectorBikesBrand(), input);
  expect(email.html).toContain(`href="${input.trackingUrl}"`);
  expect(email.text).toContain(`Ver el estado de tu bicicleta: ${input.trackingUrl}`);
  const withoutLink = partAddedEmail(vectorBikesBrand(), { ...input, trackingUrl: null });
  expect(withoutLink.text).not.toContain("Ver el estado");
  expect(withoutLink.html).not.toContain("Ver el estado");
});

it("escapa la descripción una sola vez en HTML y la conserva en texto", () => {
  const description = '<script>"Pastillas" & frenos</script>';
  const email = partAddedEmail(vectorBikesBrand(), {
    ...input,
    item: { ...input.item, description },
  });
  expect(email.html).not.toContain("<script>");
  expect(email.html).toContain("&lt;script&gt;&quot;Pastillas&quot; &amp; frenos&lt;/script&gt;");
  expect(email.html).not.toContain("&amp;lt;");
  expect(email.text).toContain(description);
});
