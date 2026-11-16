Aviso al cliente cuando se agrega un repuesto

## Contexto y autorización (Andrés, 16-nov)

En la pestaña Líneas (`src/pages/taller/ordenes/[id]/lineas.astro`) se agregan repuestos de dos formas: "Agregar repuesto" (texto libre, `addPartItem` en `src/server/taller/items.ts`) y "Agregar del inventario" (`addProductPartItem` en `src/server/taller/part-stock.ts`). Las dos recalculan el total de la orden (`recomputeOrderTotals`, `src/server/taller/order-totals.ts`) y devuelven `{ ok: true, itemId }`, pero el cliente no se entera del repuesto ni del nuevo total. Andrés quiere que el cliente reciba un correo con el repuesto agregado y el nuevo total.

Regístralo como **decisión F2-D33** en `blueprints/vector-taller-f2/blueprint.md` §20.3 (nueva fila después de `F2-D32`), con este texto:

> **Aviso al cliente cuando se agrega un repuesto** (decisión del dueño, 2026-11-16, rama `fix/fecha-repuesto-adicional`, encargo `docs/encargos/FX-03-aviso-repuesto.md`): al agregar un repuesto en Líneas, de texto libre o del inventario, el cliente recibe "Agregamos un repuesto a tu orden" con la descripción, la cantidad, el precio unitario cobrado y el nuevo total de la orden (en régimen `neto`, Neto / IVA (19%) / Total), más el enlace de seguimiento, con copia al taller. Se envía después del commit, solo si la orden ya no está `reservada` (las líneas de la recepción van en "Recibimos tu bicicleta") y el cliente tiene correo; se audita `notify.part_added` con `{ itemId, totalClp }`, un correo por repuesto. Nunca incluye costos ni márgenes. Un fallo del correo nunca deshace el repuesto. Los servicios del catálogo no avisan.

## Lee antes

`AGENTS.md`; `.claude/rules/server-api.md`; `.claude/rules/taller-domain.md`; `.claude/rules/taller-ui.md`.

## Rama y reparto

Rama `fix/fecha-repuesto-adicional`, sobre el último commit. Pruebas primero, en rojo; `pnpm format && pnpm check && pnpm test && pnpm build` en verde; sin commits ni push (Claude corre `pnpm gate` y commitea). Escribe primero y verifica una vez al final.

## Reglas de negocio decididas

| Tema | Regla |
|---|---|
| Cuándo | Después de un `addPartItem` o `addProductPartItem` con `ok: true`, si la orden no está `reservada` ni en `TERMINAL_STATUSES` y `customers.email` no es nulo. Un correo por repuesto agregado. |
| Contenido | Asunto `Agregamos un repuesto a tu orden · OT-00001 · ${SITE.name}`. Encabezado "Agregamos un repuesto a tu orden". Intro `Hola <primer nombre>,` y "Agregamos este repuesto al trabajo de tu bicicleta.". Filas: Orden, Bicicleta, la línea (`descripción` → `n × $precio unitario` tal como quedó en `work_order_items.unit_price_clp`), y el total: en `final`, "Nuevo total" = `total_clp`; en `neto`, "Neto" = `subtotal_clp`, `IVA (19%)` = `vat_clp` (`VAT_RATE_PERCENT` de `rules.ts`), "Total" = `total_clp`. Enlace "Ver el estado de tu bicicleta" (`ensureTrackingLink`). Nota: "Si tienes dudas sobre este repuesto, responde este correo." |
| Prohibido | `unit_cost_clp`, `cost_clp`, márgenes o cualquier dato interno (regla 17 de `CLAUDE.md`). |
| Envío | Patrón de `notifyReceived` (`src/server/taller/reception.ts`): `try/catch` que solo registra `log.error("email.failed", { kind: "part_added", orderId })`; `transport.send`, `sendShopCopy` (`notifications.ts`), `recordAudit("notify.part_added", { itemId, totalClp })`. |
| Pantalla | Con aviso enviado, la redirección agrega `&avisado=1` y el aviso de Líneas suma " Le avisamos al cliente por correo." |

## Qué hacer

- **`src/server/taller/part-notice.ts` (nuevo, < 200 líneas):** `export async function notifyPartAdded(db: AppDb, actor: SessionUser, orderId: string, itemId: string, now: Date, deps: NotifyDeps = {}): Promise<boolean>` (devuelve si avisó). Lee orden, cliente y bici con `getOrderHeader` (`orders.ts`) y la línea por `itemId` + `orderId` + `branchId` (no anulada, `kind = 'repuesto'`). Nunca lanza.
- **`src/server/email/order-templates.ts`:** `export function partAddedEmail(input: { orderNumber: string; customerName: string; bike: string; item: { description: string; quantity: number; unitPriceClp: number }; pricingMode: "final" | "neto"; subtotalClp: number; vatClp: number; totalClp: number; trackingUrl: string | null }): RenderedEmail` con `render` y `formatClp` de `templates.ts`.
- **`src/server/taller/audit.ts`:** `"notify.part_added"` en `AuditAction`.
- **`src/pages/taller/ordenes/[id]/lineas.astro`** (334 líneas, debe quedar < 400): después de `addPartItem` / `addProductPartItem` con `ok` (ambas ya devuelven `itemId`), `const notified = await notifyPartAdded(db, user, order.id, result.itemId, now)`; la redirección suma `&avisado=1` si `notified`; el aviso agrega " Le avisamos al cliente por correo." cuando `avisado=1`. Ajusta el tipo de `result` para que lleve `itemId?: string` sin cambiar el resto del flujo.

## No cambiar

- `items.ts`, `part-stock.ts`, `order-totals.ts`, `stock.ts`, `notifications.ts`, `templates.ts` (solo importar), `reception.ts`, `qc.ts`.
- El flujo de "Guardar cambios" (decisión 47) ni los avisos actuales de Líneas.
- El esquema y `drizzle/`; `e2e/global-setup.ts`, `e2e/fixtures.ts`, `playwright.config.ts`.
- Ninguna prueba existente (en particular `order-items.test.ts`, `part-stock.test.ts`, `lineas-un-formulario.test.ts`, `items-precios-en-lote.test.ts`). Si una falla, detente y reporta con el diff.
- Fotos por orden: sin tope.

## Pruebas (primero, verlas fallar)

- **`tests/unit/part-added-email.test.ts`:** asunto con `SITE.name`; fila de la línea con `2 × $5.950`; régimen `final` muestra "Nuevo total"; régimen `neto` muestra Neto, `IVA (19%)` y Total; enlace de seguimiento en HTML y texto; escape de HTML en la descripción; el texto no contiene "costo".
- **`tests/integration/part-notice.test.ts`** (PGlite, `consoleOutbox`; sembrado como `tests/integration/part-stock.test.ts`): repuesto de texto libre en `diagnostico` → `true`, 2 correos (cliente y `Copia · …`) con la descripción y el nuevo `total_clp`, auditoría `notify.part_added`; repuesto del inventario con costo conocido → el correo nunca contiene el costo ni la palabra "costo"; orden `neto` → Neto/IVA/Total con los montos de la orden; orden `reservada` → `false`, 0 correos; cliente sin correo → `false`; transporte que lanza → `false`, la línea sigue guardada y `log.error` sin el correo del cliente; `itemId` de otra orden → `false`.
- **`tests/integration/lineas-aviso-repuesto.test.ts`** (patrón de `tests/integration/lineas-un-formulario.test.ts`): POST `action=part` en una orden `diagnostico` con cliente con correo → 303 con `hecho=part` y `avisado=1`, y el GET muestra "Repuesto agregado. Le avisamos al cliente por correo."; en `reservada` → 303 sin `avisado`.

## Documentación

- Decisión F2-D33 en §20.3.
- `README.md`, "Operación del taller" → "Etiqueta y trabajo", junto a la línea de Líneas: "Al agregar un repuesto, si la bici ya está en el taller y el cliente tiene correo, recibe un aviso con el repuesto y el nuevo total."

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0.
2. Claude: `pnpm gate` → exit 0.

## Reporte

Archivos creados y modificados con las líneas finales de `lineas.astro` y `order-templates.ts`, el texto plano de un correo generado en las pruebas (régimen `neto`), la cola de `pnpm check`, `pnpm test` y `pnpm build`, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
