import { expect, type Page, test } from "@playwright/test";

type Block = { start: string; state: "free" | "taken" | "late" | "noroom" };
type Day = { date: string; status: string; blocks: Block[] };

/** Espera la respuesta de disponibilidad de la página para ese taller y modo. */
function availabilityFor(page: Page, slug: string, mode: "taller" | "retiro") {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/disponibilidad" &&
      url.searchParams.get("taller") === slug &&
      url.searchParams.get("modo") === mode &&
      response.ok()
    );
  });
}

async function daysOf(response: Awaited<ReturnType<typeof availabilityFor>>): Promise<Day[]> {
  const body = (await response.json()) as { days: Day[] };
  return body.days;
}

function labelOf(block: Block): string {
  if (block.state === "taken") return `${block.start}, reservado`;
  if (block.state === "late") return `${block.start}, fuera de plazo`;
  return block.start;
}

function minutesOf(start: string): number {
  const [hours, minutes] = start.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** Toca el primer día abierto y comprueba que la regla muestre los bloques de la API. */
async function pickFirstOpenDay(page: Page, days: Day[]): Promise<Day> {
  const index = days.findIndex((day) => day.status === "open");
  const day = days[index];
  if (!day) throw new Error("La API no devolvió días abiertos.");
  await page.getByRole("group", { name: "Días disponibles" }).getByRole("button").nth(index).tap();
  const slots = page.getByRole("group", { name: "Bloques del día" }).getByRole("button");
  await expect(slots).toHaveCount(day.blocks.length);
  const labels = await slots.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("aria-label") ?? ""),
  );
  expect(labels).toEqual(day.blocks.map(labelOf));
  return day;
}

async function openBookingPage(page: Page, slug: string): Promise<Day[]> {
  const response = availabilityFor(page, slug, "taller");
  await page.goto(`/${slug}/reservar`);
  return daysOf(await response);
}

async function choosePickup(page: Page, slug: string): Promise<Day[]> {
  const response = availabilityFor(page, slug, "retiro");
  await page.getByRole("button", { name: /Retiro y devolución/ }).tap();
  return daysOf(await response);
}

test("la página de Vector Bikes muestra su marca, sus comunas y los bloques de su taller", async ({
  page,
}) => {
  const days = await openBookingPage(page, "vector-bikes");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Vector Bikes");
  await pickFirstOpenDay(page, days);
  const pickupDays = await choosePickup(page, "vector-bikes");
  const comunas = page.getByLabel("Comuna");
  await expect(comunas.getByRole("option", { name: "Vitacura" })).toHaveCount(1);
  await expect(comunas.getByRole("option", { name: "Las Condes" })).toHaveCount(1);
  await pickFirstOpenDay(page, pickupDays);
  await expect(page.getByRole("contentinfo")).toContainText("Gestionado con Llave 15");
});

test("la página del Taller Demo muestra su marca, sus comunas y bloques de 60 minutos", async ({
  page,
}) => {
  const days = await openBookingPage(page, "taller-demo");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Taller Demo E2E");
  const day = await pickFirstOpenDay(page, days);
  const starts = day.blocks.map((block) => minutesOf(block.start));
  expect(starts.length).toBeGreaterThan(1);
  for (const [index, start] of starts.slice(1).entries()) {
    expect(start - (starts[index] ?? 0)).toBe(60);
  }
  const pickupDays = await choosePickup(page, "taller-demo");
  const comunas = page.getByLabel("Comuna");
  await expect(comunas.getByRole("option", { name: "Ñuñoa" })).toHaveCount(1);
  await expect(comunas.getByRole("option", { name: "Providencia" })).toHaveCount(1);
  await pickFirstOpenDay(page, pickupDays);
  await expect(page.getByRole("contentinfo")).toContainText("Gestionado con Llave 15");
  await expect(page.locator("body")).not.toContainText("Vitacura");
});
