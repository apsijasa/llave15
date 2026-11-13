import { expect, test } from "@playwright/test";
import { login } from "./fixtures.ts";

test("el dueño abre Indicadores desde el menú y cambia al mes anterior", async ({ page }) => {
  await login(page, "owner");
  await page.getByRole("button", { name: "Menú", exact: true }).tap();
  await page.getByRole("link", { name: "Indicadores", exact: true }).tap();
  await expect(
    page.getByRole("heading", { level: 1, name: "Indicadores", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Ingresos por medio de pago", exact: true }),
  ).toBeVisible();
  const shortcut = page.getByRole("link", { name: "Mes anterior", exact: true });
  await expect(shortcut).toHaveAttribute("href", /desde=/);
  await shortcut.tap();
  await expect(page).toHaveURL(/\/taller\/indicadores\?desde=/);
  await expect(page.getByRole("link", { name: "Mes anterior", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("el mecánico recibe 403 al abrir Indicadores", async ({ page }) => {
  await login(page, "mechanic");
  const response = await page.goto("/taller/indicadores");
  expect(response?.status()).toBe(403);
  await expect(page.getByText(/No tienes permiso/)).toBeVisible();
});
