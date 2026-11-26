import { expect, test } from "@playwright/test";
import { login } from "./fixtures.ts";

test("el dueño lee el panel y su detalle sin desborde en tablet", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await login(page, "owner", "/taller/indicadores");
  await expect(
    page.getByRole("heading", { level: 1, name: "Indicadores", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "El taller en una mirada", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("figure", { name: "Evolución diaria", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Detalle del período", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("link", { name: "Hoy", exact: true }).tap();
  await expect(page.getByRole("link", { name: "Hoy", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
