import { describe, expect, it } from "vitest";
import { isPooledUrl } from "../../src/server/db/client.ts";

describe("isPooledUrl", () => {
  it("detecta el host de un pooler en modo transacción", () => {
    expect(isPooledUrl("postgres://u:p@ep-algo-123-pooler.us-east-2.aws.neon.tech/db")).toBe(true);
  });

  it("trata como directa cualquier otra URL, incluso inválida", () => {
    expect(isPooledUrl("postgres://u:p@ep-algo-123.us-east-2.aws.neon.tech/db")).toBe(false);
    expect(isPooledUrl("postgres://postgres:postgres@127.0.0.1:5432/pooler")).toBe(false);
    expect(isPooledUrl("no es una url")).toBe(false);
  });
});
