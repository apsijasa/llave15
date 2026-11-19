import preactRenderer from "@astrojs/preact/server.js";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { createElement } from "preact";
import type { ComponentType } from "preact";
import { describe, expect, it } from "vitest";
import BookingIsland from "../../src/components/islands/BookingIsland.tsx";
import { BookingTicket } from "../../src/components/islands/BookingTicket.tsx";
import type { IslandShop, State } from "../../src/components/islands/booking-state.ts";
import {
  ShopContext,
  consentTexts,
  initialState,
  selectedBlocks,
  validateForm,
} from "../../src/components/islands/booking-state.ts";

const shop: IslandShop = {
  slug: "taller-demo",
  name: "Taller Demo",
  addressShort: "Calle de Prueba 123, Santiago",
  pickupEnabled: true,
  pickupComunas: ["Ñuñoa", "Providencia"],
  pickupFeeClp: 9000,
  horizonDays: 14,
  blockMinutes: 20,
  codePrefix: "TD",
  privacyHref: "/taller-demo/privacidad",
};

async function render<P extends Record<string, unknown>>(
  component: ComponentType<P>,
  props: P,
): Promise<string> {
  const container = await AstroContainer.create();
  container.addServerRenderer({ name: "@astrojs/preact", renderer: preactRenderer });
  return container.renderToString(
    component as unknown as Parameters<typeof container.renderToString>[0],
    { props },
  );
}

describe("isla con el taller por props", () => {
  it("ofrece las comunas y el retiro a $9.000 del Taller Demo", async () => {
    const html = await render(BookingIsland, { siteKey: "", shop });
    expect(html).toContain("<option>Ñuñoa</option>");
    expect(html).toContain("<option>Providencia</option>");
    expect(html).toContain("Ñuñoa y Providencia");
    expect(html).toContain("$9.000");
    expect(html).toContain(shop.addressShort);
    expect(html).toContain(`href="${shop.privacyHref}"`);
    expect(html).toContain("Acepto que Taller Demo use estos datos");
    expect(html).toContain("Autorizo que Taller Demo me contacte por WhatsApp");
    expect(html).not.toContain("Vector Bikes");
    expect(html).not.toContain("Vitacura");
    expect(html).not.toContain("$15.000");
  });

  it("valida solamente las comunas del taller y arma su mensaje", () => {
    const state: State = { ...initialState, mode: "retiro" };
    expect(validateForm(state, shop).comuna).toBe("Elige Ñuñoa o Providencia.");
    for (const comuna of shop.pickupComunas) {
      const filled = { ...state, form: { ...state.form, comuna } };
      expect(validateForm(filled, shop)).not.toHaveProperty("comuna");
    }
    const other = { ...state, form: { ...state.form, comuna: "Santiago" } };
    expect(validateForm(other, shop).comuna).toBe("Elige Ñuñoa o Providencia.");
  });

  it("no ofrece el retiro cuando el taller lo deshabilita", async () => {
    const html = await render(BookingIsland, {
      siteKey: "",
      shop: { ...shop, pickupEnabled: false },
    });
    expect(html).toContain('id="mode-taller"');
    expect(html).not.toContain('id="mode-retiro"');
    expect(html).not.toContain("Retiro y devolución");
    expect(html).not.toContain("$9.000");
  });

  it("usa el prefijo, la tarifa y la duración del taller en la boleta", async () => {
    const state: State = {
      ...initialState,
      mode: "retiro",
      selectedDate: "2026-11-20",
      selectedStart: "16:00",
    };
    function Ticket() {
      return createElement(ShopContext.Provider, {
        value: shop,
        children: createElement(BookingTicket, {
          state,
          chosen: selectedBlocks(state, shop),
          isPickup: true,
        }),
      });
    }
    const html = await render(Ticket, {});
    expect(html).toContain("TD-261120-1600");
    expect(html).toContain("$9.000");
    expect(html).toContain("16:00 – 16:40");
  });

  it("arma los dos textos de consentimiento con el nombre del taller", () => {
    expect(consentTexts("Taller Demo")).toEqual({
      privacy: "Acepto que Taller Demo use estos datos solo para gestionar mi reserva, según el",
      whatsapp:
        "Autorizo que Taller Demo me contacte por WhatsApp al número indicado para coordinar",
    });
  });
});
