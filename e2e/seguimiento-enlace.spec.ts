import { expect, test } from "@playwright/test";
import { login, SEED } from "./fixtures.ts";

test("el dueño abre el seguimiento desde la orden sin datos privados", async ({ page }) => {
  await login(page, "owner", `/taller/ordenes/${SEED.orderListaId}`);
  await expect(page.getByText("Seguimiento", { exact: true })).toBeVisible();
  const link = page.getByRole("link", { name: /\/seguimiento\// });
  const href = await link.getAttribute("href");
  expect(href).toContain("/seguimiento/");
  await expect(page.getByRole("link", { name: "Enviar por WhatsApp", exact: true })).toBeVisible();
  if (!href) throw new Error("Falta el enlace de seguimiento.");
  // Otros specs avanzan esta orden (entrega.spec la entrega): se compara con el estado del momento.
  const status = (await page.locator(".page-head .status").textContent())?.trim();
  if (!status) throw new Error("Falta el estado de la orden.");
  await page.goto(href);
  await expect(
    page.getByRole("heading", { name: "Seguimiento de tu bicicleta", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("OT-00003", { exact: true })).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: status })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("cliente@e2e.vectorbikes.cl");
  await expect(page.locator("body")).not.toContainText("+56933334444");
});

test("el mecánico ve el enlace de su orden sin el botón de WhatsApp", async ({ page }) => {
  await login(page, "mechanic", `/taller/ordenes/${SEED.orderRecibidaId}`);
  await expect(page.getByText("Seguimiento", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /\/seguimiento\// })).toBeVisible();
  await expect(page.getByRole("link", { name: "Enviar por WhatsApp", exact: true })).toHaveCount(0);
});
