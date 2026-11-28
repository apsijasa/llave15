import { and, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { z } from "zod";
import { TIMEZONE } from "../../lib/time.ts";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { costProfiles } from "../db/schema-costing.ts";
import { products } from "../db/schema-inventory.ts";
import { recordAudit } from "./audit.ts";
import { getService } from "./catalog.ts";
import {
  DEFAULT_TARGET_MARGIN_PCT,
  MAX_BILLABLE_HOURS,
  MAX_MARGIN_PCT,
  hourlyCost,
  monthlyTotal,
  serviceCost,
  priceForMargin,
  marginOfPrice,
  priceTable,
} from "./costing-rules.ts";
import type { MonthlyCosts, PriceRow } from "./costing-rules.ts";
import { expenseTotals } from "./indicators-finance.ts";
import { BIKE_TYPES } from "./rules.ts";
import type { BikeType } from "./rules.ts";

const blank = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
function pesos(value: unknown) {
  const present = blank(value);
  if (typeof present !== "string") return present;
  const amount = present.replace(/[$\s]/g, "");
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(amount)) return present;
  return Number(amount.replace(/\./g, ""));
}
const amount = z.number().int().min(0).max(999_999_999);
const money = z.preprocess(pesos, amount.default(0));
const optionalMoney = z.preprocess(pesos, amount.optional());
function integer(min: number, max: number) {
  return z
    .union([z.number(), z.string().trim().regex(/^\d+$/)])
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));
}
const margin = integer(0, MAX_MARGIN_PCT);
export const costProfileSchema = z.object({
  rentClp: money,
  utilitiesClp: money,
  wagesClp: money,
  taxesClp: money,
  otherClp: money,
  suppliesClp: money,
  billableHoursMonth: z.preprocess(blank, integer(0, MAX_BILLABLE_HOURS).default(0)),
  targetMarginPct: z.preprocess(blank, margin.default(DEFAULT_TARGET_MARGIN_PCT)),
});
export const serviceQuoteSchema = z
  .object({
    serviceId: z.preprocess(blank, z.uuid().optional()),
    bikeType: z.preprocess(blank, z.enum(BIKE_TYPES).optional()),
    minutes: z.preprocess(blank, integer(1, 1440).optional()),
    suppliesClp: money,
    packCostClp: optionalMoney,
    packJobs: z.preprocess(blank, integer(1, 10000).optional()),
    marginPct: z.preprocess(blank, margin.optional()),
  })
  .refine((value) => value.serviceId !== undefined || value.minutes !== undefined, {
    path: ["serviceId"],
    message: "Elige un servicio o escribe los minutos.",
  });
export const productQuoteSchema = z
  .object({
    productId: z.preprocess(blank, z.uuid().optional()),
    costClp: optionalMoney,
    marginPct: z.preprocess(blank, margin.optional()),
  })
  .refine((value) => value.productId !== undefined || value.costClp !== undefined, {
    path: ["productId"],
    message: "Elige un producto o escribe el costo.",
  });

export type CostProfile = MonthlyCosts & {
  billableHoursMonth: number;
  targetMarginPct: number;
  saved: boolean;
  updatedAt: Date | null;
};
export type SuggestedCosts = {
  range: { from: string; to: string };
  values: MonthlyCosts;
  totalClp: number;
  hasExpenses: boolean;
};
type Failure = {
  ok: false;
  code: "forbidden" | "validation_error" | "not_found" | "hours_missing";
  fields?: string[];
};
export type ServiceQuote = {
  serviceName: string | null;
  bikeType: BikeType | null;
  minutes: number;
  hourlyCostClp: number;
  laborClp: number;
  suppliesClp: number;
  costClp: number;
  marginPct: number;
  priceNetClp: number;
  priceGrossClp: number;
  catalogPriceClp: number | null;
  catalogMarginPct: number | null;
  table: PriceRow[];
};
export type ProductQuote = {
  productLabel: string | null;
  costClp: number;
  marginPct: number;
  priceNetClp: number;
  priceGrossClp: number;
  currentPriceClp: number | null;
  currentMarginPct: number | null;
  table: PriceRow[];
};
type QuoteResult<T> = { ok: true; quote: T; values: Record<string, string> } | Failure;
function invalid(error: z.ZodError): { ok: false; code: "validation_error"; fields: string[] } {
  return {
    ok: false,
    code: "validation_error",
    fields: [...new Set(error.issues.map((issue) => String(issue.path[0])))],
  } as const;
}
function textValues(input: object): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value === undefined ? "" : String(value)]),
  );
}
export async function getCostProfile(db: AppDb, actor: SessionUser): Promise<CostProfile | null> {
  if (!can(actor.role, "costs.view")) return null;
  const [row] = await db
    .select()
    .from(costProfiles)
    .where(eq(costProfiles.branchId, actor.branchId))
    .limit(1);
  return {
    ...costProfileSchema.parse(row ?? {}),
    saved: Boolean(row),
    updatedAt: row?.updatedAt ?? null,
  };
}
export async function saveCostProfile(db: AppDb, actor: SessionUser, input: unknown, now: Date) {
  if (!can(actor.role, "costs.view")) return { ok: false, code: "forbidden" } as const;
  const parsed = costProfileSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const data = parsed.data;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(costProfiles)
      .values({
        ...data,
        branchId: actor.branchId,
        updatedBy: actor.id,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: costProfiles.branchId,
        set: { ...data, updatedBy: actor.id, updatedAt: now },
      })
      .returning({ id: costProfiles.id });
    if (!row) throw new Error("No se pudo guardar el perfil de costos.");
    await recordAudit(
      tx,
      {
        branchId: actor.branchId,
        actorUserId: actor.id,
        action: "costing.profile_saved",
        entity: "cost_profile",
        entityId: row.id,
        details: data,
      },
      now,
    );
  });
  return { ok: true } as const;
}
export async function suggestedMonthlyCosts(
  db: AppDb,
  actor: SessionUser,
  now: Date,
): Promise<SuggestedCosts | null> {
  if (!can(actor.role, "costs.view")) return null;
  const previous = DateTime.fromJSDate(now, { zone: TIMEZONE })
    .startOf("month")
    .minus({ months: 1 });
  const range = { from: previous.toISODate() ?? "", to: previous.endOf("month").toISODate() ?? "" };
  const totals = await expenseTotals(db, actor, range);
  const get = (category: string) =>
    totals.byCategory.find((row) => row.category === category)?.amountClp ?? 0;
  const values = {
    rentClp: get("arriendo"),
    utilitiesClp: get("servicios"),
    wagesClp: get("sueldos"),
    taxesClp: 0,
    suppliesClp: get("insumos"),
    otherClp: get("otros"),
  };
  const totalClp = monthlyTotal(values);
  return { range, values, totalClp, hasExpenses: totalClp > 0 };
}
function suggestedPrice(costClp: number, marginPct: number) {
  const price = priceForMargin(costClp, marginPct);
  return { priceNetClp: price.netClp, priceGrossClp: price.grossClp, table: priceTable(costClp) };
}
export async function serviceQuote(
  db: AppDb,
  actor: SessionUser,
  input: unknown,
): Promise<QuoteResult<ServiceQuote>> {
  if (!can(actor.role, "costs.view")) return { ok: false, code: "forbidden" };
  const parsed = serviceQuoteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const data = parsed.data;
  const service = data.serviceId ? await getService(db, actor, data.serviceId) : null;
  if (data.serviceId && !service) return { ok: false, code: "not_found" };
  const profile = await getCostProfile(db, actor);
  if (!profile?.saved || !profile.billableHoursMonth) return { ok: false, code: "hours_missing" };
  const hourlyCostClp = hourlyCost(monthlyTotal(profile), profile.billableHoursMonth) ?? 0;
  const minutes = data.minutes ?? service?.estimatedMinutes ?? 0;
  const marginPct = data.marginPct ?? profile.targetMarginPct;
  const suppliesClp =
    data.suppliesClp +
    (data.packCostClp !== undefined && data.packJobs !== undefined
      ? Math.ceil(data.packCostClp / data.packJobs)
      : 0);
  const cost = serviceCost({ minutes, hourlyCostClp, suppliesClp });
  const catalogPriceClp = data.bikeType ? (service?.prices[data.bikeType] ?? null) : null;
  const quote = {
    serviceName: service?.name ?? null,
    bikeType: data.bikeType ?? null,
    minutes,
    hourlyCostClp,
    ...cost,
    marginPct,
    ...suggestedPrice(cost.costClp, marginPct),
    catalogPriceClp,
    catalogMarginPct:
      catalogPriceClp === null ? null : marginOfPrice(cost.costClp, catalogPriceClp),
  };
  return { ok: true, quote, values: textValues({ ...data, minutes, marginPct }) };
}
export async function productQuote(
  db: AppDb,
  actor: SessionUser,
  input: unknown,
): Promise<QuoteResult<ProductQuote>> {
  if (!can(actor.role, "costs.view")) return { ok: false, code: "forbidden" };
  const parsed = productQuoteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const data = parsed.data;
  const [product] = data.productId
    ? await db
        .select({
          id: products.id,
          sku: products.sku,
          name: products.name,
          costClp: products.costClp,
          priceClp: products.priceClp,
        })
        .from(products)
        .where(and(eq(products.branchId, actor.branchId), eq(products.id, data.productId)))
        .limit(1)
    : [];
  if (data.productId && !product) return { ok: false, code: "not_found" };
  const profile = await getCostProfile(db, actor);
  const costClp = data.costClp ?? product?.costClp ?? 0;
  const marginPct = data.marginPct ?? profile?.targetMarginPct ?? DEFAULT_TARGET_MARGIN_PCT;
  const quote = {
    productLabel: product ? `${product.sku} · ${product.name}` : null,
    costClp,
    marginPct,
    ...suggestedPrice(costClp, marginPct),
    currentPriceClp: product?.priceClp ?? null,
    currentMarginPct: product ? marginOfPrice(costClp, product.priceClp) : null,
  };
  return { ok: true, quote, values: textValues({ ...data, costClp, marginPct }) };
}
