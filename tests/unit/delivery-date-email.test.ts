import { expect, it } from "vitest";
import { SITE } from "../../src/lib/site.ts";
import { deliveryDateChangedEmail } from "../../src/server/email/order-templates.ts";

const INPUT = {
  orderNumber: "OT-00001",
  customerName: "Ana Pérez",
  bike: "Trek Marlin",
  previousDate: "2026-10-23",
  newDate: "2026-11-23",
  trackingUrl: "https://example.test/seguimiento/enlace-de-prueba",
};

it("avisa con ambas fechas largas, el primer nombre y la identidad del taller", () => {
  const email = deliveryDateChangedEmail(INPUT);
  expect(email.subject).toBe(`Cambiamos la fecha de entrega · OT-00001 · ${SITE.name}`);
  expect(email.text).toContain("Hola Ana,");
  expect(email.text).not.toContain("Pérez");
  expect(email.text).toContain("Actualizamos la fecha estimada de entrega de tu bicicleta.");
  expect(email.text).toContain("Orden: OT-00001");
  expect(email.text).toContain("Bicicleta: Trek Marlin");
  expect(email.text).toContain("Fecha anterior: 23 de octubre de 2026");
  expect(email.text).toContain("Nueva fecha: 23 de noviembre de 2026");
  expect(email.html).toContain("23 de octubre de 2026");
  expect(email.html).toContain("23 de noviembre de 2026");
  expect(email.text).toContain("Si la nueva fecha no te acomoda, responde este correo.");
});

it("omite la fecha anterior cuando no existía", () => {
  const email = deliveryDateChangedEmail({ ...INPUT, previousDate: null });
  expect(email.text).not.toContain("Fecha anterior");
  expect(email.html).not.toContain("Fecha anterior");
  expect(email.text).toContain("Nueva fecha: 23 de noviembre de 2026");
});

it("incluye el seguimiento en HTML y texto, y lo omite sin enlace", () => {
  const email = deliveryDateChangedEmail(INPUT);
  expect(email.html).toContain(`href="${INPUT.trackingUrl}"`);
  expect(email.text).toContain(`Ver el estado de tu bicicleta: ${INPUT.trackingUrl}`);
  const withoutLink = deliveryDateChangedEmail({ ...INPUT, trackingUrl: null });
  expect(withoutLink.html).not.toContain("Ver el estado de tu bicicleta");
  expect(withoutLink.text).not.toContain("Ver el estado de tu bicicleta");
});

it("escapa el HTML del nombre una sola vez", () => {
  const email = deliveryDateChangedEmail({ ...INPUT, customerName: "<Ana&> Pérez" });
  expect(email.html).toContain("Hola &lt;Ana&amp;&gt;,");
  expect(email.html).not.toContain("<Ana&>");
  expect(email.html).not.toContain("&amp;lt;");
  expect(email.text).toContain("Hola <Ana&>,");
});
