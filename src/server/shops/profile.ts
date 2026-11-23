import { eq } from "drizzle-orm";
import { z } from "zod";
import { hashCancelToken } from "../booking/tokens.ts";
import type { AppDb } from "../db/client.ts";
import { workOrderApprovals } from "../db/schema-orders.ts";
import { orderTrackingTokens, serviceReports } from "../db/schema-reports.ts";
import type { WeekHours } from "../db/schema-shops.ts";
import { shops } from "../db/schema-shops.ts";
import { bookings, branches } from "../db/schema.ts";
import type { ObjectStorage } from "../storage/storage.ts";
import { hashShareToken } from "../taller/share-tokens.ts";

/** Lo que ve el cliente del taller: nombre, contacto, dirección, horarios y logo (BG-17). */
export type ShopProfile = {
  shopId: string;
  slug: string;
  name: string;
  email: string;
  notifyEmail: string;
  phone: string;
  phoneDisplay: string;
  streetAddress: string;
  addressShort: string;
  locality: string;
  region: string;
  mapsUrl: string | null;
  instagramUrl: string | null;
  instagramHandle: string | null;
  /** Sitio propio del taller; el logo de sus páginas públicas enlaza ahí. */
  websiteUrl: string | null;
  logoKey: string | null;
  logoPath: string | null;
  certifications: string[];
  receptionHours: WeekHours;
  pickupHours: WeekHours;
};

export type ShareTokenKind = "seguimiento" | "informe" | "aprobacion";

type ShopRow = typeof shops.$inferSelect;

/** `@` + el último segmento de la URL de Instagram, o `null` si no hay. */
function instagramHandleOf(url: string | null): string | null {
  if (!url) return null;
  const segment = url
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .split("/")
    .at(-1);
  return segment ? `@${segment}` : null;
}

export function profileFromShop(row: ShopRow): ShopProfile {
  return {
    shopId: row.id,
    slug: row.slug,
    name: row.name,
    email: row.email,
    notifyEmail: row.notifyEmail,
    phone: row.phone,
    phoneDisplay: row.phoneDisplay,
    streetAddress: row.streetAddress,
    addressShort: row.addressShort,
    locality: row.locality,
    region: row.region,
    mapsUrl: row.mapsUrl,
    instagramUrl: row.instagramUrl,
    instagramHandle: instagramHandleOf(row.instagramUrl),
    websiteUrl: row.websiteUrl,
    logoKey: row.logoKey,
    logoPath: row.logoKey ? `/${row.slug}/logo` : null,
    certifications: [...row.certifications],
    receptionHours: row.receptionHours,
    pickupHours: row.pickupHours,
  };
}

export async function profileForBranch(db: AppDb, branchId: string): Promise<ShopProfile | null> {
  const [row] = await db
    .select({ shop: shops })
    .from(branches)
    .innerJoin(shops, eq(branches.shopId, shops.id))
    .where(eq(branches.id, branchId))
    .limit(1);
  return row ? profileFromShop(row.shop) : null;
}

const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export async function profileBySlug(db: AppDb, slug: string): Promise<ShopProfile | null> {
  if (!slugSchema.safeParse(slug).success) return null;
  const [row] = await db.select().from(shops).where(eq(shops.slug, slug)).limit(1);
  return row ? profileFromShop(row) : null;
}

/** El taller de la reserva a la que pertenece el token de cancelación. */
export async function profileForCancelToken(db: AppDb, token: string): Promise<ShopProfile | null> {
  const [row] = await db
    .select({ branchId: bookings.branchId })
    .from(bookings)
    .where(eq(bookings.cancelTokenHash, hashCancelToken(token)))
    .limit(1);
  return row ? profileForBranch(db, row.branchId) : null;
}

async function branchForShareToken(
  db: AppDb,
  kind: ShareTokenKind,
  hash: string,
): Promise<string | null> {
  if (kind === "seguimiento") {
    const [row] = await db
      .select({ branchId: orderTrackingTokens.branchId })
      .from(orderTrackingTokens)
      .where(eq(orderTrackingTokens.tokenHash, hash))
      .limit(1);
    return row?.branchId ?? null;
  }
  if (kind === "informe") {
    const [row] = await db
      .select({ branchId: serviceReports.branchId })
      .from(serviceReports)
      .where(eq(serviceReports.shareTokenHash, hash))
      .limit(1);
    return row?.branchId ?? null;
  }
  const [row] = await db
    .select({ branchId: workOrderApprovals.branchId })
    .from(workOrderApprovals)
    .where(eq(workOrderApprovals.tokenHash, hash))
    .limit(1);
  return row?.branchId ?? null;
}

/** El taller de la orden a la que pertenece un enlace de seguimiento, informe o aprobación. */
export async function profileForShareToken(
  db: AppDb,
  kind: ShareTokenKind,
  token: string,
): Promise<ShopProfile | null> {
  const branchId = await branchForShareToken(db, kind, hashShareToken(token));
  return branchId ? profileForBranch(db, branchId) : null;
}

const NOT_FOUND = () =>
  new Response("Logo no encontrado.", { status: 404, headers: { "cache-control": "no-store" } });

/** `GET /<slug>/logo`: el logo público del taller, o 404 sin taller o sin logo. */
export async function handleLogoRequest(
  db: AppDb,
  storage: ObjectStorage,
  slug: string,
): Promise<Response> {
  const profile = await profileBySlug(db, slug);
  if (!profile?.logoKey) return NOT_FOUND();
  const body = await storage.get(profile.logoKey);
  if (!body) return NOT_FOUND();
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "content-type": profile.logoKey.endsWith(".jpg") ? "image/jpeg" : "image/png",
      "cache-control": "public, max-age=86400",
    },
  });
}
