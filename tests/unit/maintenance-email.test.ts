import { expect, it } from "vitest";
import { maintenanceReminderEmail } from "../../src/server/email/order-templates.ts";
import { vectorBikesBrand } from "../helpers/shops.ts";

const INPUT = {
  orderNumber: "OT-00001",
  customerName: "Ana María Pérez",
  bike: "Trek Marlin",
  nextMaintenanceDate: "2026-11-17",
  note: "Cambio de cadena",
  bookingUrl: "https://vectorbikes.cl/#reserva",
};

it("compone el recordatorio con primer nombre, fecha larga, nota y última orden", () => {
  const email = maintenanceReminderEmail(vectorBikesBrand(), INPUT);
  expect(email.subject).toBe("Se acerca la mantención de tu bicicleta · Vector Bikes");
  expect(email.text).toContain("Hola Ana,");
  expect(email.text).not.toContain("María Pérez");
  expect(email.text).toContain(
    "Cuando revisamos tu bicicleta sugerimos una próxima mantención. Se acerca la fecha.",
  );
  expect(email.text).toContain("Bicicleta: Trek Marlin");
  expect(email.text).toContain("Fecha sugerida: 17 de noviembre de 2026");
  expect(email.text).toContain("Nota: Cambio de cadena");
  expect(email.text).toContain("Última orden: OT-00001");
});

it.each([null, ""])("omite la fila Nota si no hay nota (%s)", (note) => {
  const email = maintenanceReminderEmail(vectorBikesBrand(), { ...INPUT, note });
  for (const body of [email.text, email.html]) expect(body).not.toContain("Nota");
});

it("ofrece reservar y responder para quitar los avisos, sin otros enlaces ni credenciales", () => {
  const email = maintenanceReminderEmail(vectorBikesBrand(), INPUT);
  expect(email.html).toMatch(new RegExp(`href="${INPUT.bookingUrl}"[^>]*>Reservar hora</a>`));
  expect(email.text).toContain(`Reservar hora: ${INPUT.bookingUrl}`);
  for (const body of [email.text, email.html]) {
    expect(body).toContain("Si no quieres recibir este aviso, responde este correo y lo quitamos.");
    expect(body).not.toMatch(/token/i);
    expect(body.match(/https:\/\/[^\s"<>]+/g)).toEqual([INPUT.bookingUrl]);
  }
});

it("escapa la nota una sola vez en HTML y conserva el texto original", () => {
  const note = '<script>alert("x")</script> & cadena';
  const email = maintenanceReminderEmail(vectorBikesBrand(), { ...INPUT, note });
  expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; cadena");
  expect(email.html).not.toContain("<script>");
  expect(email.html).not.toContain("&amp;lt;");
  expect(email.text).toContain(note);
});
