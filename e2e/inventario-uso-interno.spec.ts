import { expect, test } from "@playwright/test";
import { login } from "./fixtures.ts";

test("El dueño registra uso interno en tablet sin ofrecer el producto en ventas", async ({
  page,
}) => {
  await login(page, "owner", "/taller/inventario/nuevo");
  await page.getByLabel("SKU", { exact: true }).fill("E2E-USO-INTERNO");
  await page.getByLabel("Nombre", { exact: true }).fill("Limpiador interno E2E");
  await page.getByLabel("Categoría", { exact: true }).selectOption({ label: "Insumo" });
  await page.getByLabel("Para la venta", { exact: true }).uncheck();
  await page.getByLabel("Stock inicial", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Crear producto", exact: true }).tap();
  await expect(page.getByRole("status")).toHaveText("Producto creado.");
  await page.getByLabel("Cantidad usada", { exact: true }).fill("2");
  await page.getByLabel("Nota (opcional)", { exact: true }).fill("Limpieza de cadena");
  await page.getByRole("button", { name: "Registrar uso", exact: true }).tap();
  await expect(page.getByRole("status")).toHaveText("Uso registrado.");
  await expect(
    page
      .locator("dl.data dt")
      .filter({ hasText: /^Stock$/ })
      .locator("+ dd"),
  ).toHaveText("3");
  const movement = page.getByRole("row").filter({ hasText: "Uso en taller: Limpieza de cadena" });
  await expect(movement.getByRole("cell", { name: "-2", exact: true })).toBeVisible();
  await page.goto("/taller/ventas/nueva");
  await expect(page.getByRole("option", { name: /Limpiador interno E2E/ })).toHaveCount(0);
});
