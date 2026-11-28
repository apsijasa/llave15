import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import { mechanicDashboard } from "../../src/server/taller/dashboard.ts";
import type { AppDb } from "../../src/server/db/client.ts";
import { workOrderApprovals, workOrderItems } from "../../src/server/db/schema-orders.ts";
import type { SessionUser } from "../../src/server/auth/admin-auth.ts";
import {
  intakeChecks,
  orderPhotos,
  workOrders,
  workOrderStatusHistory,
} from "../../src/server/db/schema-orders.ts";
import { bikes, customers } from "../../src/server/db/schema-taller.ts";
import type { ObjectStorage } from "../../src/server/storage/storage.ts";
import { createApproval, decideApproval } from "../../src/server/taller/approvals.ts";
import { completeDelivery } from "../../src/server/taller/delivery.ts";
import { startReception } from "../../src/server/taller/orders.ts";
import { recordPayment, voidPayment } from "../../src/server/taller/payments.ts";
import { submitQc } from "../../src/server/taller/qc.ts";
import { finalizeReception } from "../../src/server/taller/reception.ts";
import { ensureTrackingLink, viewTrackingByToken } from "../../src/server/taller/tracking.ts";
import { INTAKE_CHECK_KEYS, QC_CHECK_KEYS } from "../../src/server/taller/rules.ts";
import { changeOrderStatus } from "../../src/server/taller/status.ts";
import { createTestDb, type TestDb } from "../helpers/pglite.ts";
import { seedTwoShops } from "../helpers/two-shops.ts";

const NOW = new Date("2026-11-26T15:00:00Z");
const SIGNATURE = "data:image/png;base64,iVBORw0KGgo=";
let test: TestDb;
let owner: SessionUser;
let orderId: string;
const storage: ObjectStorage = {
  put: async () => {},
  get: async () => null,
  exists: async () => false,
  delete: async () => {},
};

async function seed(actor: SessionUser, status = "creado") {
  const [customer] = await test.db
    .insert(customers)
    .values({ branchId: actor.branchId, name: "Cliente de prueba", phoneE164: "+56912345678" })
    .returning();
  if (!customer) throw new Error("Falta cliente");
  const [bike] = await test.db
    .insert(bikes)
    .values({
      branchId: actor.branchId,
      customerId: customer.id,
      brand: "Prueba",
      model: "Ruta",
      bikeType: "ruta",
    })
    .returning();
  if (!bike) throw new Error("Falta bici");
  const result = await startReception(
    test.db,
    actor,
    { customerId: customer.id, bikeId: bike.id, requestedService: "Revisión general" },
    NOW,
  );
  if (!result.ok) throw new Error(result.code);
  await test.db.update(workOrders).set({ status }).where(eq(workOrders.id, result.orderId));
  return result.orderId;
}
async function update(values: Partial<typeof workOrders.$inferInsert>) {
  await test.db.update(workOrders).set(values).where(eq(workOrders.id, orderId));
}
async function saved() {
  const [row] = await test.db.select().from(workOrders).where(eq(workOrders.id, orderId));
  return row;
}
async function history() {
  return test.db
    .select()
    .from(workOrderStatusHistory)
    .where(eq(workOrderStatusHistory.workOrderId, orderId));
}
async function ready(totalClp = 1000, paidClp = 0) {
  await update({ status: "lista_para_retirar", qcApprovedAt: NOW, totalClp, paidClp });
}
function deliver() {
  return completeDelivery(
    test.db,
    storage,
    owner,
    { orderId, signatureDataUrl: SIGNATURE, signedByName: "Cliente de prueba" },
    NOW,
  );
}

beforeEach(async () => {
  test = await createTestDb();
  const shops = await seedTwoShops(test.db);
  owner = shops.vector.owner;
  orderId = await seed(owner);
  return () => test.close();
});

it("crea Creado; cerrar recepción fija received_at sin historial adicional", async () => {
  expect(await saved()).toMatchObject({ status: "creado", receivedAt: null });
  const before = await history();
  await test.db.insert(intakeChecks).values(
    INTAKE_CHECK_KEYS.map((itemKey) => ({
      branchId: owner.branchId,
      workOrderId: orderId,
      itemKey,
      result: "ok",
      createdBy: owner.id,
    })),
  );
  await test.db.insert(orderPhotos).values({
    branchId: owner.branchId,
    workOrderId: orderId,
    stage: "recepcion",
    retentionClass: "recepcion_6m",
    fullKey: "photo-full.jpg",
    thumbKey: "photo-thumb.jpg",
    width: 10,
    height: 10,
    createdBy: owner.id,
  });
  await update({ deliveryDateConfirmedAt: NOW, estimatedDeliveryDate: "2026-11-27" });
  expect(
    await finalizeReception(
      test.db,
      storage,
      owner,
      { orderId, signatureDataUrl: SIGNATURE, signedByName: "Cliente de prueba" },
      NOW,
    ),
  ).toEqual({ ok: true });
  expect(await saved()).toMatchObject({ status: "creado", receivedAt: NOW });
  expect(await history()).toEqual(before);
});
it.each(["diagnostico", "en_progreso"] as const)("no permite %s antes de recibir", async (to) => {
  expect(await changeOrderStatus(test.db, owner, orderId, to, null, NOW)).toEqual({
    ok: false,
    code: "reception_pending",
  });
});
it.each([true, false])("QC aprobado=%s desde en_progreso", async (approved) => {
  await update({ status: "en_progreso" });
  const checks = Object.fromEntries(
    QC_CHECK_KEYS.map((key) => [key, { result: !approved && key === "frenos" ? "falla" : "ok" }]),
  );
  const before = await history();
  expect(await submitQc(test.db, owner, orderId, { checks }, NOW)).toEqual({
    ok: true,
    status: approved ? "lista_para_retirar" : "en_progreso",
  });
  expect(await history()).toHaveLength(before.length + Number(approved));
});
it("pago completo y anulación cambian estado e historial dentro de la transacción", async () => {
  await ready();
  const result = await recordPayment(
    test.db,
    owner,
    orderId,
    { kind: "final", method: "transferencia", amountClp: 1000 },
    NOW,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.code);
  expect(await saved()).toMatchObject({ status: "pagado", paidClp: 1000 });
  expect(await history()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fromStatus: "lista_para_retirar",
        toStatus: "pagado",
        note: "Pago completo",
      }),
    ]),
  );
  expect(await voidPayment(test.db, owner, result.paymentId, NOW)).toEqual({ ok: true });
  expect(await saved()).toMatchObject({ status: "lista_para_retirar", paidClp: 0 });
  expect(await history()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fromStatus: "pagado",
        toStatus: "lista_para_retirar",
        note: "Pago anulado",
      }),
    ]),
  );
});
it("pagado manual exige saldo cero", async () => {
  await ready();
  expect(await changeOrderStatus(test.db, owner, orderId, "pagado", null, NOW)).toEqual({
    ok: false,
    code: "balance_pending",
  });
  await update({ paidClp: 1000 });
  expect(await changeOrderStatus(test.db, owner, orderId, "pagado", null, NOW)).toEqual({
    ok: true,
  });
});
it.each(["pagado", "lista_para_retirar"])(
  "entrega desde %s deja las filas intermedias necesarias",
  async (status) => {
    await ready(1000, 1000);
    await update({ status });
    const before = await history();
    expect(await deliver()).toEqual({ ok: true });
    expect(await saved()).toMatchObject({ status: "entregada" });
    const after = await history();
    expect(after).toHaveLength(before.length + (status === "pagado" ? 1 : 2));
    expect(after).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromStatus: "pagado", toStatus: "entregada" }),
      ]),
    );
    if (status === "lista_para_retirar")
      expect(after).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ fromStatus: status, toStatus: "pagado" }),
        ]),
      );
  },
);
it("no entrega con saldo pendiente", async () => {
  await ready();
  expect(await deliver()).toEqual({ ok: false, code: "balance_pending" });
});
it("el rechazo por enlace deja fuera el adicional y sigue En progreso", async () => {
  await update({ status: "diagnostico" });
  const proposal = await createApproval(
    test.db,
    owner,
    orderId,
    { description: "Cadena desgastada", recommendation: "Cambiar cadena", priceClp: 1000 },
    NOW,
  );
  if (!proposal.ok) throw new Error(proposal.code);
  expect(await decideApproval(test.db, proposal.token, "rechazado", null, NOW)).toEqual({
    ok: true,
  });
  expect(await saved()).toMatchObject({ status: "en_progreso" });
});
it("la base protege saldo en Pagado y QC en los tres estados finales", async () => {
  for (const status of ["lista_para_retirar", "pagado", "entregada"]) {
    await expect(
      test.client.query("update work_orders set status = $1 where id = $2", [status, orderId]),
    ).rejects.toMatchObject({ code: "23514" });
  }
  await ready();
  await expect(
    test.client.query("update work_orders set status = 'pagado' where id = $1", [orderId]),
  ).rejects.toMatchObject({ code: "23514" });
});
it("las dos transiciones de entrega tienen un orden temporal inequívoco", async () => {
  await ready(1000, 1000);
  await deliver();
  const rows = await history();
  const paid = rows.find((row) => row.toStatus === "pagado");
  const delivered = rows.find((row) => row.toStatus === "entregada");
  expect(paid?.createdAt.getTime()).toBeLessThan(delivered?.createdAt.getTime() ?? 0);
});

it("seguimiento usa etiquetas actuales y conserva las heredadas de la línea de tiempo", async () => {
  await update({ status: "en_progreso" });
  await test.db.insert(workOrderStatusHistory).values({
    branchId: owner.branchId,
    workOrderId: orderId,
    fromStatus: "recibida",
    toStatus: "en_reparacion",
    createdAt: NOW,
  });
  const link = await ensureTrackingLink(test.db, owner, orderId, "https://example.test", NOW);
  if (!link.ok) throw new Error(link.code);
  let view = await viewTrackingByToken(test.db, link.token);
  expect(view).toMatchObject({
    status: "en_progreso",
    statusLabel: "En progreso",
    isReadyForPickup: false,
  });
  expect(view?.timeline).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ status: "en_reparacion", label: "En reparación" }),
    ]),
  );
  await ready(1000, 1000);
  await update({ status: "pagado" });
  view = await viewTrackingByToken(test.db, link.token);
  expect(view).toMatchObject({ status: "pagado", statusLabel: "Pagado", isReadyForPickup: true });
});

it("revierte una decisión si la orden se canceló antes de adquirir su bloqueo", async () => {
  await update({ status: "diagnostico" });
  const proposal = await createApproval(
    test.db,
    owner,
    orderId,
    { description: "Cadena gastada", recommendation: "Cambiar cadena", priceClp: 1000 },
    NOW,
  );
  if (!proposal.ok) throw new Error(proposal.code);
  const before = await test.db.select().from(workOrderApprovals);
  const db = new Proxy(test.db, {
    get(target, key, receiver) {
      if (key !== "transaction") return Reflect.get(target, key, receiver);
      return (callback: (tx: AppDb) => Promise<unknown>) =>
        target.transaction(async (tx) => {
          let firstSelect = true;
          const locked = new Proxy(tx, {
            get(target, key, receiver) {
              if (key !== "select") return Reflect.get(target, key, receiver);
              return (...args: Parameters<AppDb["select"]>) => {
                if (!firstSelect) return target.select(...args);
                firstSelect = false;
                // Simula lo que lee FOR UPDATE después de esperar a la transacción que canceló.
                return {
                  from: () => ({
                    where: () => ({ for: async () => [{ status: "cancelada", voidedAt: null }] }),
                  }),
                };
              };
            },
          }) as AppDb;
          return callback(locked);
        });
    },
  });
  expect(await decideApproval(db, proposal.token, "aprobado", null, NOW)).toEqual({
    ok: false,
    code: "already_decided",
  });
  expect(await test.db.select().from(workOrderApprovals)).toEqual(before);
  expect(await test.db.select().from(workOrderItems)).toEqual([]);
});
it("el panel no pone una recepción pendiente en el grupo que antes era Recibida", async () => {
  await update({ assignedMechanicId: owner.id });
  const mechanic = { ...owner, role: "mechanic" as const };
  expect((await mechanicDashboard(test.db, mechanic, NOW))?.pending).toEqual([]);
  await update({ receivedAt: NOW });
  expect((await mechanicDashboard(test.db, mechanic, NOW))?.pending.map((row) => row.id)).toContain(
    orderId,
  );
});
