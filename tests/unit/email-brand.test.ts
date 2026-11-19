import { vectorBikesBrand } from "../helpers/shops.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking } from "../../src/server/db/schema.ts";
import { quoteEmail } from "../../src/server/email/order-templates.ts";
import {
  bookingRescheduledEmail,
  customerConfirmationEmail,
  reminderEmail,
  shopCancellationEmail,
  shopNewBookingEmail,
  shopRescheduledEmail,
} from "../../src/server/email/booking/templates.ts";
import { readyForPickupEmail, receivedBikeEmail } from "../../src/server/email/templates.ts";

const brand = vi.hoisted(() => ({ certifications: [] as readonly string[] }));
vi.mock("../../src/lib/site.ts", async (original) => {
  const { SITE, ...rest } = await original<typeof import("../../src/lib/site.ts")>();
  return {
    ...rest,
    SITE: {
      ...SITE,
      get certifications() {
        return brand.certifications;
      },
    },
  };
});

const bookingBrand = {
  ...vectorBikesBrand(),
  get certifications() {
    return brand.certifications;
  },
};

const NOW = new Date("2026-11-12T15:00:00Z");
const BOOKING: Booking = {
  id: "11111111-1111-4111-8111-111111111111",
  branchId: "22222222-2222-4222-8222-222222222222",
  code: "VB-261113-1500",
  serviceDate: "2026-11-13",
  mode: "taller",
  bikeCount: 1,
  status: "confirmed",
  source: "web",
  startsAt: new Date("2026-11-13T18:00:00Z"),
  endsAt: new Date("2026-11-13T18:30:00Z"),
  timezone: "America/Santiago",
  customerName: "Ana Pérez",
  phoneE164: "+56911112222",
  email: "ana@example.test",
  bike: "Trek Marlin",
  description: "Mantención",
  comuna: null,
  address: null,
  pickupFeeClp: 0,
  consentAt: NOW,
  whatsappConsentAt: null,
  cancelTokenHash: "hash",
  cancelTokenUsedAt: null,
  cancelledAt: null,
  cancelledBy: null,
  completedAt: null,
  reminderSentAt: null,
  ipHash: null,
  createdAt: NOW,
  updatedAt: NOW,
};
const PREVIOUS = { serviceDate: "2026-11-12", start: "15:00" };
const ORDER = {
  orderNumber: "OT-00001",
  customerName: "Ana Pérez",
  bike: "Trek Marlin",
  requestedService: "Mantención",
  items: [{ description: "Mantención", quantity: 1, unitPriceClp: 30000 }],
  accessories: [],
  estimatedDeliveryDate: null,
  warrantyOfNumber: null,
  totalClp: 30000,
  paidClp: 0,
  trackingUrl: "https://vectorbikes.cl/seguimiento/prueba",
};
const CASES = [
  [
    "customerConfirmationEmail",
    () =>
      customerConfirmationEmail(
        bookingBrand,
        BOOKING,
        "https://vectorbikes.cl/reservas/cancelar?token=prueba",
      ),
  ],
  ["bookingRescheduledEmail", () => bookingRescheduledEmail(bookingBrand, BOOKING, PREVIOUS)],
  ["reminderEmail", () => reminderEmail(bookingBrand, BOOKING)],
  ["shopNewBookingEmail", () => shopNewBookingEmail(bookingBrand, BOOKING)],
  ["shopRescheduledEmail", () => shopRescheduledEmail(bookingBrand, BOOKING, PREVIOUS)],
  ["shopCancellationEmail", () => shopCancellationEmail(bookingBrand, BOOKING)],
  ["receivedBikeEmail", () => receivedBikeEmail(ORDER)],
  ["readyForPickupEmail", () => readyForPickupEmail(ORDER)],
  ["quoteEmail", () => quoteEmail(ORDER)],
] as const;
const LOGO = '<img src="https://vectorbikes.cl/brand/vector-bikes-logo.png" alt="Vector Bikes"';

beforeEach(() => {
  brand.certifications = [];
});

describe.each(CASES)("marca en %s", (_name, generate) => {
  // El logo en correos espera la autorización del dueño (decisión 51): hoy no se agrega.
  it("no agrega logo ni certificaciones mientras la lista está vacía", () => {
    const { html, text } = generate();
    expect(html).not.toContain(LOGO);
    expect(html).not.toContain("/brand/");
    expect(text).not.toContain("brand/");
    expect(html).not.toContain("Certificaciones");
  });

  it("lista las certificaciones en el pie solo del HTML", () => {
    const original = generate();
    brand.certifications = ["Shimano Service Center", "SRAM Technical"];
    const email = generate();
    const certifications = "Certificaciones: Shimano Service Center · SRAM Technical";
    expect(email.html).toContain(certifications);
    expect(email.html.indexOf(certifications)).toBeGreaterThan(
      email.html.indexOf("info@vectorbikes.cl"),
    );
    expect(email.subject).toBe(original.subject);
    expect(email.text).toBe(original.text);
  });

  it("escapa las certificaciones antes de incluirlas en el HTML", () => {
    brand.certifications = ["Taller <certificado> & técnico"];
    expect(generate().html).toContain("Certificaciones: Taller &lt;certificado&gt; &amp; técnico");
  });
});
