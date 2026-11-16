import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { SessionUser } from "../auth/admin-auth.ts";
import { can } from "../auth/permissions.ts";
import type { AppDb } from "../db/client.ts";
import { workOrders } from "../db/schema-orders.ts";
import { componentModels, componentVariants } from "../db/schema-library-catalog.ts";
import { technicalDiagnoses } from "../db/schema-library-private.ts";
import { bikeComponents } from "../db/schema-payments.ts";
import { bikes } from "../db/schema-taller.ts";
import { recordAudit } from "../taller/audit.ts";
import { canAccessOrder } from "../taller/status.ts";

type Failure<C extends string> = { ok: false; code: C };

export type OrderTechnicalContext = {
  order: { id: string; number: number; status: string; requestedService: string };
  bike: {
    id: string;
    brand: string;
    model: string;
    bikeType: string;
    year: number | null;
    size: string | null;
  };
  components: {
    id: string;
    componentType: string;
    brand: string;
    model: string;
    serialNumber: string | null;
    installedAt: string;
    variant: { id: string; code: string; revision: string; modelName: string } | null;
  }[];
  diagnoses: { id: string; symptoms: string; status: string; createdAt: Date }[];
};

async function accessibleOrder(db: AppDb, actor: SessionUser, orderId: string) {
  if (!z.uuid().safeParse(orderId).success) return { ok: false, code: "not_found" } as const;
  const [row] = await db
    .select({ order: workOrders, bike: bikes })
    .from(workOrders)
    .innerJoin(bikes, eq(bikes.id, workOrders.bikeId))
    .where(
      and(
        eq(workOrders.branchId, actor.branchId),
        eq(workOrders.id, orderId),
        isNull(workOrders.voidedAt),
      ),
    );
  if (!row) return { ok: false, code: "not_found" } as const;
  if (!canAccessOrder(actor, row.order)) return { ok: false, code: "forbidden" } as const;
  return { ok: true, ...row } as const;
}

async function currentComponents(db: AppDb, actor: SessionUser, bikeId: string) {
  const rows = await db
    .select({
      part: bikeComponents,
      variantCode: componentVariants.code,
      variantRevision: componentVariants.revision,
      modelName: componentModels.name,
    })
    .from(bikeComponents)
    .leftJoin(componentVariants, eq(componentVariants.id, bikeComponents.componentVariantId))
    .leftJoin(componentModels, eq(componentModels.id, componentVariants.modelId))
    .where(
      and(
        eq(bikeComponents.branchId, actor.branchId),
        eq(bikeComponents.bikeId, bikeId),
        isNull(bikeComponents.voidedAt),
        isNull(bikeComponents.replacedAt),
      ),
    )
    .orderBy(desc(bikeComponents.installedAt));
  return rows.map(({ part, variantCode, variantRevision, modelName }) => ({
    id: part.id,
    componentType: part.componentType,
    brand: part.brand,
    model: part.model,
    serialNumber: part.serialNumber,
    installedAt: part.installedAt,
    variant:
      part.componentVariantId && variantCode !== null
        ? {
            id: part.componentVariantId,
            code: variantCode,
            revision: variantRevision ?? "",
            modelName: modelName ?? "",
          }
        : null,
  }));
}

/** Bici, componentes vigentes y diagnósticos previos de una orden; nunca datos del cliente ni precios. */
export async function orderTechnicalContext(
  db: AppDb,
  actor: SessionUser,
  orderId: string,
): Promise<{ ok: true; context: OrderTechnicalContext } | Failure<"forbidden" | "not_found">> {
  if (!can(actor.role, "library.ai")) return { ok: false, code: "forbidden" };
  const access = await accessibleOrder(db, actor, orderId);
  if (!access.ok) return access;
  const { order, bike } = access;
  const diagnoses = await db
    .select({
      id: technicalDiagnoses.id,
      symptoms: technicalDiagnoses.symptoms,
      status: technicalDiagnoses.status,
      createdAt: technicalDiagnoses.createdAt,
    })
    .from(technicalDiagnoses)
    .where(
      and(
        eq(technicalDiagnoses.branchId, actor.branchId),
        eq(technicalDiagnoses.workOrderId, order.id),
        isNull(technicalDiagnoses.voidedAt),
      ),
    )
    .orderBy(desc(technicalDiagnoses.createdAt));
  return {
    ok: true,
    context: {
      order: {
        id: order.id,
        number: order.number,
        status: order.status,
        requestedService: order.requestedService,
      },
      bike: {
        id: bike.id,
        brand: bike.brand,
        model: bike.model,
        bikeType: bike.bikeType,
        year: bike.year,
        size: bike.size,
      },
      components: await currentComponents(db, actor, bike.id),
      diagnoses,
    },
  };
}

/** Liga (o desliga con `null`) un componente de la bici a una variante del catálogo. */
export async function linkComponentVariant(
  db: AppDb,
  actor: SessionUser,
  componentId: string,
  variantId: string | null,
  now: Date,
): Promise<{ ok: true } | Failure<"forbidden" | "not_found" | "invalid_variant">> {
  if (!can(actor.role, "components.manage")) return { ok: false, code: "forbidden" };
  if (!z.uuid().safeParse(componentId).success) return { ok: false, code: "not_found" };
  if (variantId !== null && !z.uuid().safeParse(variantId).success)
    return { ok: false, code: "invalid_variant" };
  return db.transaction(async (tx) => {
    const [part] = await tx
      .select()
      .from(bikeComponents)
      .where(
        and(
          eq(bikeComponents.branchId, actor.branchId),
          eq(bikeComponents.id, componentId),
          isNull(bikeComponents.voidedAt),
        ),
      )
      .for("update");
    if (!part) return { ok: false, code: "not_found" } as const;
    const access = await accessibleOrder(tx, actor, part.workOrderId);
    if (!access.ok) return access;
    if (variantId) {
      const [variant] = await tx
        .select({ id: componentVariants.id })
        .from(componentVariants)
        .where(eq(componentVariants.id, variantId));
      if (!variant) return { ok: false, code: "invalid_variant" } as const;
    }
    await tx
      .update(bikeComponents)
      .set({ componentVariantId: variantId, updatedAt: now })
      .where(eq(bikeComponents.id, componentId));
    await recordAudit(
      tx,
      {
        branchId: actor.branchId,
        actorUserId: actor.id,
        action: "component.variant_linked",
        entity: "bike_component",
        entityId: componentId,
        details: { variantId },
      },
      now,
    );
    return { ok: true } as const;
  });
}
