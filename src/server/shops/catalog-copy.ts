import { and, eq, inArray } from "drizzle-orm";
import type { AppDb } from "../db/client.ts";
import { servicePrices, services } from "../db/schema-taller.ts";

/**
 * Copia los servicios activos y sus precios de una sucursal plantilla a otra, con el `branch_id`
 * nuevo (BG-42). Corre dentro de la transacción del alta; devuelve cuántos servicios copió.
 */
export async function copyCatalog(
  db: AppDb,
  fromBranchId: string,
  toBranchId: string,
  now: Date,
): Promise<number> {
  const source = await db
    .select()
    .from(services)
    .where(and(eq(services.branchId, fromBranchId), eq(services.isActive, true)));
  if (source.length === 0) return 0;
  const ids = new Map<string, string>();
  for (const service of source) {
    const [copy] = await db
      .insert(services)
      .values({
        branchId: toBranchId,
        name: service.name,
        description: service.description,
        estimatedMinutes: service.estimatedMinutes,
        usualMaterials: service.usualMaterials,
        aftercare: service.aftercare,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: services.id });
    if (!copy) throw new Error("No se pudo copiar un servicio del catálogo.");
    ids.set(service.id, copy.id);
  }
  const prices = await db
    .select()
    .from(servicePrices)
    .where(
      and(
        eq(servicePrices.branchId, fromBranchId),
        inArray(servicePrices.serviceId, [...ids.keys()]),
      ),
    );
  const rows = prices.flatMap((price) => {
    const serviceId = ids.get(price.serviceId);
    return serviceId === undefined
      ? []
      : [
          {
            branchId: toBranchId,
            serviceId,
            bikeType: price.bikeType,
            priceClp: price.priceClp,
            createdAt: now,
            updatedAt: now,
          },
        ];
  });
  if (rows.length > 0) await db.insert(servicePrices).values(rows);
  return source.length;
}
