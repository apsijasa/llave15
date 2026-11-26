import { expect, it, vi } from "vitest";
import { ANTHROPIC_URL } from "../../src/server/library/ai-provider.ts";
import {
  createAnthropicInvoiceExtractor,
  extractorFromEnv,
  noneInvoiceExtractor,
  INVOICE_POLICY,
  INVOICE_SCHEMA,
} from "../../src/server/taller/invoice-extract.ts";

const KEY = "clave-sintetica-secreta";
const env = { ANTHROPIC_API_KEY: KEY, AI_MODEL: "modelo-prueba" };
const invoice = {
  supplier: { name: "Proveedor", rut: null },
  document: { type: "factura", number: "123", date: null },
  pricesIncludeVat: false,
  lines: [
    {
      code: null,
      description: "Cadena",
      quantity: 2,
      unit: null,
      unitPrice: 21008.4,
      lineTotal: null,
    },
  ],
  totals: { net: null, exempt: null, vat: null, total: null },
  confidence: "media",
  warnings: [],
};
const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));
it.each(["pdf", "jpg"] as const)(
  "envía %s con política, esquema, cabeceras y lee tokens",
  async (type) => {
    const fetcher = reply({
      content: [{ type: "text", text: JSON.stringify(invoice) }],
      usage: { input_tokens: 12, output_tokens: 34 },
    });
    const result = await createAnthropicInvoiceExtractor(env, fetcher).extract({
      type,
      bytes: Buffer.from("archivo"),
    });
    expect(result).toMatchObject({
      ok: true,
      tokensIn: 12,
      tokensOut: 34,
      extraction: { lines: [{ unitCostClp: 21008 }] },
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ANTHROPIC_URL);
    expect(init.headers).toMatchObject({
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "server-side-fallback-2026-07-01",
      "content-type": "application/json",
    });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      system: INVOICE_POLICY,
      max_tokens: 16000,
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: INVOICE_SCHEMA } },
    });
    expect(body.messages[0].content[0]).toEqual({
      type: type === "pdf" ? "document" : "image",
      source: {
        type: "base64",
        media_type: type === "pdf" ? "application/pdf" : "image/jpeg",
        data: Buffer.from("archivo").toString("base64"),
      },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  },
);
function checkSchema(value: unknown) {
  if (!value || typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  for (const forbidden of ["maxItems", "minimum", "maxLength"])
    expect(obj).not.toHaveProperty(forbidden);
  if (obj.type === "object") {
    expect(obj.additionalProperties).toBe(false);
    expect(obj.required).toEqual(Object.keys(obj.properties as object));
  }
  for (const item of Object.values(obj)) checkSchema(item);
}
it("usa solamente restricciones admitidas en cada nivel del esquema", () =>
  checkSchema(INVOICE_SCHEMA));
it.each([
  [{ stop_reason: "refusal", content: [] }, 200, "refusal"],
  [{ stop_reason: "max_tokens", content: [] }, 200, "truncated"],
  [{ content: [{ type: "text", text: "sin JSON" }] }, 200, "invalid_json"],
  [{ content: "incorrecto" }, 200, "invalid_response"],
  [{ error: KEY }, 500, "http_500"],
] as const)("traduce errores sin filtrar secretos (%s)", async (body, status, code) => {
  const result = await createAnthropicInvoiceExtractor(env, reply(body, status)).extract({
    type: "pdf",
    bytes: Buffer.from("x"),
  });
  expect(result).toEqual({ ok: false, code });
  expect(JSON.stringify(result)).not.toContain(KEY);
});
it("traduce fallos de red", async () => {
  const fetcher = vi.fn(async () => {
    throw new Error(KEY);
  });
  expect(
    await createAnthropicInvoiceExtractor(env, fetcher).extract({
      type: "jpg",
      bytes: Buffer.from("x"),
    }),
  ).toEqual({ ok: false, code: "network" });
});
it("none nunca llama a fetch y el entorno decide el extractor", async () => {
  const fetcher = vi.fn();
  expect(await noneInvoiceExtractor.extract({ type: "pdf", bytes: Buffer.from("x") })).toEqual({
    ok: false,
    code: "unavailable",
  });
  expect(extractorFromEnv({ ...env, AI_PROVIDER: "none" }, fetcher)).toBe(noneInvoiceExtractor);
  expect(extractorFromEnv({ ...env, AI_PROVIDER: "anthropic" }, fetcher).name).toBe("anthropic");
  expect(fetcher).not.toHaveBeenCalled();
});
