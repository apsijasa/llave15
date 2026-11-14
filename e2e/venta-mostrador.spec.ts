import { expect, test } from "@playwright/test";
import { login } from "./fixtures.ts";

test("Venta de mostrador sin cliente en tablet", async ({ page }) => {
  await login(page, "owner", "/taller/inventario/nuevo");
  await page.getByLabel("SKU", { exact: true }).fill("E2E-VENTA-1");
  await page.getByLabel("Nombre", { exact: true }).fill("Bombín E2E");
  await page.getByLabel("Categoría", { exact: true }).selectOption({ label: "Repuesto" });
  await page.getByLabel("Costo neto", { exact: true }).fill("3000");
  await page.getByLabel("Precio neto", { exact: true }).fill("5000");
  await page.getByLabel("Stock inicial", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Crear producto", exact: true }).tap();
  await expect(page.getByRole("status")).toHaveText("Producto creado.");
  const productUrl = page.url();

  await page.goto("/taller/ventas/nueva");
  await page.getByLabel("Producto 1", { exact: true }).selectOption({
    label: "E2E-VENTA-1 · Bombín E2E · stock 3 · $5.000",
  });
  await page.getByLabel("Cantidad 1", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Calcular total", exact: true }).tap();
  await expect(
    page
      .locator("dl.data dt")
      .filter({ hasText: /^Total$/ })
      .locator("+ dd"),
  ).toHaveText("$11.900");
  await page
    .getByRole("group", { name: "Medio de pago", exact: true })
    .getByLabel("Transferencia", { exact: true })
    .tap();
  await page.getByRole("button", { name: "Registrar venta", exact: true }).tap();
  await expect(page).toHaveURL(/\/taller\/ventas\?hecho=sale&venta=VM-\d{5}$/);
  await expect(page.getByRole("status")).toHaveText(/^Venta VM-\d{5} registrada\.$/);

  await page.goto(new URL(productUrl).pathname);
  await expect(
    page
      .locator("dl.data dt")
      .filter({ hasText: /^Stock$/ })
      .locator("+ dd"),
  ).toHaveText("1");
});

test("El mecánico no vende", async ({ page }) => {
  await login(page, "mechanic");
  const response = await page.goto("/taller/ventas/nueva");
  expect(response?.status()).toBe(403);
});
