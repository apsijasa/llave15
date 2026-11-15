import { expect, test } from "@playwright/test";
import { login, SEED } from "./fixtures.ts";

test("El mecánico busca un código exacto y abre la ficha en tablet", async ({ page }) => {
  await login(page, "mechanic", "/taller/biblioteca");
  await page.getByLabel(/Fabricante, modelo, código/).fill("rd-m8100-sgs");
  await page.getByRole("button", { name: "Buscar", exact: true }).tap();
  await expect(page).toHaveURL(/\/taller\/biblioteca\/buscar\?/);
  const exactMatch = page.getByRole("table", { name: "Coincidencia exacta", exact: true });
  const row = exactMatch.getByRole("row").filter({
    has: page.getByRole("link", { name: "RD-M8100-SGS", exact: true }),
  });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "RD-M8100-SGS", exact: true }).tap();
  await expect(page).toHaveURL(`/taller/biblioteca/componentes/${SEED.libraryVariantId}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("RD-M8100-SGS");
  await page.getByRole("link", { name: "Especificaciones", exact: true }).tap();
  const specifications = page.getByRole("table", {
    name: "Especificaciones de la variante",
    exact: true,
  });
  await expect(specifications.getByRole("cell", { name: /Sin dato verificado/ })).toBeVisible();
});

test("Una categoría lleva a resultados filtrados", async ({ page }) => {
  await login(page, "mechanic", "/taller/biblioteca");
  await page.getByRole("link", { name: "Transmisión", exact: true }).tap();
  await expect(page).toHaveURL(/\/taller\/biblioteca\/buscar\?categoria=transmision$/);
  await expect(page.getByLabel("Categoría", { exact: true })).toHaveValue("transmision");
  await expect(
    page.getByRole("listitem").filter({ hasText: /^Deore XT · Shimano$/ }),
  ).toBeVisible();
});

test("El menú muestra Biblioteca y no Revisión para el mecánico", async ({ page }) => {
  await login(page, "mechanic", "/taller/biblioteca");
  await page.getByRole("button", { name: "Menú", exact: true }).tap();
  const menu = page.getByRole("navigation", { name: "Taller", exact: true });
  await expect(menu.getByRole("link", { name: "Biblioteca", exact: true })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Revisión", exact: true })).toHaveCount(0);
});
