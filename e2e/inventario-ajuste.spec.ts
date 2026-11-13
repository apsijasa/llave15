import { expect, test } from "@playwright/test";
import { login } from "./fixtures.ts";

test("El dueño crea un producto y ajusta su stock en tablet", async ({ page }) => {
  await login(page, "owner", "/taller/inventario/nuevo");
  await page.getByLabel("SKU", { exact: true }).fill("E2E-AJUSTE-1");
  await page.getByLabel("Nombre", { exact: true }).fill("Cámara 29 E2E");
  await page.getByLabel("Categoría", { exact: true }).selectOption({ label: "Repuesto" });
  await page.getByLabel("Costo neto", { exact: true }).fill("1000");
  await page.getByLabel("Precio neto", { exact: true }).fill("2000");
  await page.getByLabel("Stock mínimo", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Crear producto", exact: true }).tap();
  await expect(page.getByRole("status")).toHaveText("Producto creado.");
  await expect(page).toHaveURL(/\/taller\/inventario\/[\da-f-]+\?hecho=create$/);

  await page.goto("/taller/inventario?bajo=1");
  const row = page.getByRole("row").filter({ hasText: "E2E-AJUSTE-1" });
  await expect(row.getByText("Bajo mínimo", { exact: true })).toBeVisible();
  await row.getByRole("link", { name: "Cámara 29 E2E", exact: true }).tap();
  await page.getByLabel("Cantidad", { exact: true }).fill("5");
  await page.getByLabel("Motivo", { exact: true }).fill("Conteo físico");
  await page.getByRole("button", { name: "Registrar ajuste", exact: true }).tap();
  await expect(page.getByRole("status")).toHaveText("Stock ajustado.");
  await expect(
    page
      .locator("dl.data dt")
      .filter({ hasText: /^Stock$/ })
      .locator("+ dd"),
  ).toHaveText("5");
  const movement = page.getByRole("row").filter({ hasText: "Conteo físico" });
  await expect(movement.getByRole("cell", { name: "+5", exact: true })).toBeVisible();
});

test("El mecánico ve el inventario sin costos", async ({ page }) => {
  await login(page, "mechanic", "/taller/inventario");
  await expect(
    page.getByRole("heading", { name: "Inventario", level: 1, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Costo", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Nuevo producto", exact: true })).toHaveCount(0);
});
