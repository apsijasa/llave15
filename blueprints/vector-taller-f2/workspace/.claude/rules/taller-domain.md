---
description: Lógica de dominio del taller y capa de almacenamiento de imágenes
paths:
  - "src/server/taller/**"
  - "src/server/storage/**"
---

# Dominio del taller

- Cada función recibe `db: AppDb` (una transacción de Drizzle también lo es), el usuario de la sesión (`actor: SessionUser`) cuando hay autoría, y `now: Date`. Nunca `new Date()` ni `Date.now()` dentro de la lógica.
- Toda consulta filtra por `actor.branchId`; toda fila nueva lleva ese `branch_id`.
- El permiso se revisa al comienzo de cada función que escribe, con `can(actor.role, …)`; sin permiso devuelve `{ ok: false, code: "forbidden" }` sin tocar filas.
- Nunca se borra una orden, línea, accesorio, componente, aprobación, foto, venta, compra, gasto ni movimiento de caja: se marcan con `voided_at`/`voided_by` (y motivo cuando la pantalla lo pide).
- `total_clp` y `estimated_minutes` se recalculan desde las filas con `recomputeOrderTotals` (`order-totals.ts`, reexportado por `items.ts`) y `paid_clp` con `recomputePaid` (`payments.ts`), dentro de la misma transacción que cambia líneas o pagos.
- Régimen de precios: `work_orders.pricing_mode` se fija al crear la orden (`allocateNewOrder` en `order-creation.ts`, desde `branches.new_order_pricing_mode`) y nunca cambia. En `neto`, `subtotal_clp` = suma de líneas vigentes, `vat_clp = vatOfNet(subtotal)`, `total_clp = subtotal + vat`; en `final`, el cálculo de siempre. `total_clp` es siempre el monto a cobrar. La tasa vive en `VAT_RATE_PERCENT` (`rules.ts`).
- Stock: solo `applyStockMovement` (`stock.ts`) cambia `products.stock_qty`, bajo `select … for update`; un consumo que dejaría stock negativo devuelve `out_of_stock`. Las compras recalculan el costo promedio ponderado. Un repuesto ligado a producto congela `unit_cost_clp`; anular la línea revierte el stock con un movimiento `anulacion`.
- Caja: todo pago, venta, gasto o devolución en efectivo consulta `requireOpenCashSession` (`cash.ts`) dentro de su transacción: interruptor apagado → como antes; habilitado sin sesión abierta → `cash_closed` sin escribir; con sesión → la fila lleva `cash_session_id` y se crea el `cash_movements` en la misma transacción. Anular algo cuya sesión ya cerró → `cash_session_closed`.
- Un error descubierto dentro de una transacción después de escribir se lanza (error centinela) y se traduce a `{ ok: false, code }` fuera de ella: devolverlo no revierte.
- Todo cambio de estado valida `ORDER_TRANSITIONS` de `rules.ts` y escribe historial con `recordStatusChange` (`orders.ts`). Los saltos que solo ocurren por un flujo (`MANUAL_TRANSITIONS` no los incluye: cierre de recepción, propuesta y respuesta de adicional, control de calidad, entrega) nunca aparecen como botón manual.
- `recordAudit(tx, …)` se llama dentro de la misma transacción del cambio auditado; `details` pasa por `redactDetails`, que quita correos, teléfonos, RUT, tokens y claves (también de proveedores).
- Nada de red, correo ni almacenamiento dentro de una transacción: subir el objeto primero, escribir la fila después; si la fila falla, borrar el objeto. Los correos van después del commit.
- Las claves de almacenamiento las arman `photos.ts` y `reception.ts` con ids generados por el servidor (`orders/<orderId>/<photoId>-full.jpg`, `-thumb.jpg`, `orders/<orderId>/signature-<recepcion|entrega>-<id>.png`); nunca con texto del usuario.
- Errores esperables se devuelven como `{ ok: false, code }`; solo lo inesperado se lanza.
- Tokens de aprobación e informe: `newShareToken()` y `hashShareToken()` de `share-tokens.ts`; en base solo el hash.
- Constantes del taller (estados, etiquetas, transiciones, checklists, capacidad diaria, ancho de etiqueta, categorías de producto y de gasto, medios de pago, IVA) solo en `src/server/taller/rules.ts`.
- Ningún texto para el usuario (correo, asunto, aviso) escribe el nombre del taller literal: se usa `SITE.name` o el perfil del taller.
- Los costos existen desde la fase 2 (decisión 55): `cost_clp`, `unit_cost_clp`, `fee_clp` y `net_clp` solo salen de `src/server/**` para roles con `costs.view` (dueño y administración); sin ese permiso un costo con valor se omite (la clave no aparece); un costo `null` de una línea sin producto se deja tal cual (F2-D28). Cada función que los devuelve tiene una prueba de omisión por rol; el mecánico nunca los recibe.
