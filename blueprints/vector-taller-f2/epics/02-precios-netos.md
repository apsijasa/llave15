# Epic 02: Precios netos, repuestos ligados y ventana V1

> Después de esta épica las órdenes nuevas copian el régimen de precios de la sucursal (`final` o `neto`), las órdenes `neto` guardan neto, IVA y total, y todo lo que el personal o el cliente ve de una orden `neto` (detalle, recepción, entrega, líneas, correos, informe, aprobación) muestra el desglose — idéntico a hoy para `final`. Los repuestos pueden ligarse a un producto y descuentan stock. Cierra con la ventana de publicación V1.

| | |
|---|---|
| **Epic id** | `02-precios-netos` |
| **Tasks** | `E2-T1` … `E2-T9` (pasos F2-09 … F2-17) |
| **Depends on** | `01-base-inventario` |
| **Unlocks** | `03-ventas-pagos` |
| **Parallel with** | ninguna |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Astro 7 SSR · TypeScript 6 · Postgres 16 · Drizzle ORM 0.45 · zod 4 · luxon · Vitest + PGlite · Playwright (tablet). `pnpm` 12.4.2; Node 24. Ninguna dependencia nueva.

| Task | Command |
|---|---|
| Formatear | `pnpm format` |
| Test (un archivo) | `pnpm test tests/integration/<archivo>.test.ts` |
| Migraciones (solo base dev) | `pnpm db:migrate` · `pnpm db:check` |
| Compuerta | `pnpm gate` |

**Gate:** `pnpm format && pnpm gate`. Servicio: Postgres local. El sandbox de Codex corre solo `format`, `check`, `test`, `build`; el resto lo corre la sesión coordinadora, que commitea. Reversión: `git reset --hard f2-<anterior>`.

**Reglas transversales de cada tarea:** pruebas primero, en rojo; ≤ 5 archivos; **releer cada archivo antes de tocarlo** (la fase plataforma cambió `site.ts`, las plantillas de correo y quizá páginas; los conteos son orientativos, el criterio es "< 400" sobre el archivo real); **ningún texto para el usuario, correo, título ni página escribe el nombre del taller literal** — `SITE.name` o el perfil; nada se borra; dinero en pesos enteros; correos después del commit; `db` y `now` como argumentos; zod en toda entrada; **una orden `final` debe producir exactamente la misma salida que hoy** (las pruebas existentes no se tocan). **Checkpoint:** `git add --` solo con las rutas del paso; nunca `git add -A` (el repo está en iCloud y acumula copias `* 2.*`).

**Cobertura de tablet:** sin specs nuevos; las pantallas de orden ya tienen specs (`entrega`, `lineas-guardar-cambios`, `recepcion-*`) que deben seguir verdes sin cambios. Las órdenes de esos specs nacen `final`.

## Directory subtree

```
src/server/taller/rules.ts                # edit (E2-T1): VAT_RATE_PERCENT, PRICING_MODES, vatOfNet, grossOfNet, netOfGross
src/server/taller/order-totals.ts         # NEW (E2-T1): recomputeOrderTotals con régimen
src/server/taller/items.ts                # edit (E2-T1 reexporta; E2-T4 voidItem + listItems)
src/server/taller/order-creation.ts       # NEW (E2-T2): allocateOrderNumber (movido), allocateNewOrder, get/setNewOrderPricingMode
src/server/taller/orders.ts               # edit (E2-T2)
src/pages/taller/catalogo/index.astro     # edit (E2-T2): interruptor de régimen
src/components/taller/OrderAmounts.astro  # NEW (E2-T3)
src/pages/taller/ordenes/[id]/{index,recepcion,entrega}.astro   # edit (E2-T3)
src/server/taller/part-stock.ts           # NEW (E2-T4) · src/pages/taller/ordenes/[id]/lineas.astro edit
src/server/email/amounts.ts               # NEW (E2-T5) · templates.ts · order-templates.ts edit
src/server/taller/{reception,qc,quotes}.ts   # edit (E2-T6)
src/server/taller/report-snapshot.ts      # NEW (E2-T7) · reports.ts · components/taller/ReportView.astro edit
src/server/taller/approvals.ts · src/pages/aprobacion/[token].astro · ordenes/[id]/adicional.astro   # edit (E2-T8)
docs/ventanas/f2-v1.md                    # NEW (E2-T9)
tests/integration/{pricing-totals,pricing-switch,order-amounts-page,part-stock,pricing-notifications,report-pricing,approval-pricing}.test.ts   # NEW
tests/unit/pricing-emails.test.ts         # NEW
```

## Data model touched here

Sin esquema nuevo (todo lo creó E1-T3). Se usan: `branches.new_order_pricing_mode` (`final`|`neto`, default `final`); `work_orders.pricing_mode`, `subtotal_clp`, `vat_clp` y **`work_orders_pricing_total_check`: `pricing_mode = 'final' or total_clp = subtotal_clp + vat_clp`**; `work_order_items.product_id`, `unit_cost_clp`; `products`, `stock_movements`. `total_clp` sigue siendo "monto a cobrar": `work_orders_delivered_paid_check` (`status <> 'entregada' or paid_clp = total_clp`) no cambia.

**Fórmulas (FASE2 §2.4.1; `VAT_RATE_PERCENT = 19` en `rules.ts`):** `vatOfNet(net) = Math.round(net * VAT_RATE_PERCENT / 100)` (redondeo comercial al peso, una vez sobre el neto del documento); `grossOfNet(net) = net + vatOfNet(net)`; `netOfGross(gross) = Math.round(gross * 100 / (100 + VAT_RATE_PERCENT))`. Valores de control: 10000 → 1900; 10003 → 1901; 50 → 10; 0 → 0; 5000 → 950.

## Contracts

**Consumed:** `recordAudit`, `can`, `getOrderHeader`, `canAccessOrder`, `TERMINAL_STATUSES`, `applyStockMovement(tx, …)` (`stock.ts`), `getProduct`/`listProducts` (`products.ts`), `formatClp`, `render`, `SITE`, `getEmailEnv`, `createTransport`, `ensureTrackingLink`, `sendShopCopy`, `isAllowedOrigin`, `requireAdmin`.

**Produced:**

| Export | Signature |
|---|---|
| `rules.ts` → `VAT_RATE_PERCENT`, `PRICING_MODES`, `PricingMode`, `PRICING_MODE_LABELS`, `vatOfNet`, `grossOfNet`, `netOfGross` | `PRICING_MODE_LABELS = { final: "Precios finales", neto: "Precios netos + IVA" }` |
| `order-totals.ts` → `recomputeOrderTotals` | `(db, orderId, now)` — misma firma; `items.ts` la reexporta |
| `order-creation.ts` → `allocateOrderNumber`, `allocateNewOrder`, `getNewOrderPricingMode`, `setNewOrderPricingMode` | `allocateNewOrder(db, branchId)` → `{ number, pricingMode }`; `setNewOrderPricingMode(db, actor, { mode }, now)` → `{ ok: true, changed } \| { ok: false, code }` |
| `OrderAmounts.astro` | props `{ netText, vatLabel, vatText, totalLabel, totalText }`; rinde tres pares `<dt>/<dd class="mono">` |
| `part-stock.ts` → `productPartSchema`, `addProductPartItem`, `reverseItemStock` | `addProductPartItem(db, actor, orderId, { productId, quantity }, now)` → `{ ok: true, itemId } \| { ok: false, code }`; `reverseItemStock(tx, actor, item, now)` (solo dentro de la transacción de `voidItem`) |
| `email/amounts.ts` → `OrderPricing`, `amountRows`, `pricingFromNet` | `amountRows(totalLabel, totalClp, pricing?)` → `[label, amountClp][]` |
| `report-snapshot.ts` → `snapshotSchema`, `ReportSnapshot` | v1 + `subtotalClp?`, `vatClp?`, `vatRatePercent?` |

## Conventions that bite in this area

- **Marcado `final` intacto:** las páginas conservan su marcado actual en una rama `final`; el componente se usa solo en `neto`. Los correos `final` deben ser byte a byte los de hoy.
- `src/components/**` no importa `src/server/**`: `OrderAmounts` y `ReportView` reciben textos o números ya listos.
- `ReportView` formatea con `Intl.NumberFormat("es-CL")`, cuyo agrupamiento de cuatro cifras depende de ICU: en su prueba, el esperado se calcula con el mismo `Intl`, nunca un literal como `$1.900`. El resto usa `formatClp` (regex determinista).
- `email/amounts.ts` **no** importa `templates.ts` (evita un ciclo); devuelve números y la plantilla los formatea.
- El régimen se fija al crear la orden; cambiar el interruptor nunca toca órdenes existentes.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/taller-domain.md`, `taller-ui.md`, `server-api.md`, `database.md`.

---

## Tasks

### `E2-T1` — F2-09 Compute net, VAT and total for neto orders

**Depends on:** `E1-T9` · **Priority:** p0

1. `tests/integration/pricing-totals.test.ts` primero: órdenes insertadas con `pricingMode: "neto"` o por defecto; líneas con `addPartItem`/`addCatalogItem`; anulación con `voidItem`; `vatOfNet` como función pura.
2. `rules.ts`: las constantes y funciones de "Contracts".
3. `order-totals.ts`: mover `recomputeOrderTotals` desde `items.ts`. Lee `branchId` y `pricingMode` de la orden; suma `quantity * unit_price_clp` y `quantity * estimated_minutes` de líneas vigentes. `final` → `set({ totalClp, estimatedMinutes, updatedAt })` exactamente como hoy (no escribe `subtotal_clp` ni `vat_clp`). `neto` → `subtotalClp = suma`, `vatClp = vatOfNet(suma)`, `totalClp = subtotal + vat`, `estimatedMinutes`.
4. `items.ts`: `import { recomputeOrderTotals } from "./order-totals.ts";` y `export { recomputeOrderTotals };` (los importadores, como `approvals.ts`, no cambian).

**Files**
- `src/server/taller/order-totals.ts` — new
- `src/server/taller/items.ts` — edit
- `src/server/taller/rules.ts` — edit
- `tests/integration/pricing-totals.test.ts` — new

Reglas: `taller-domain.md`. No negociable 10. No cambia: firma de `recomputeOrderTotals`, totales `final`.

**Acceptance**

1. **WHEN** una orden `neto` tiene líneas vigentes por 10.000 **THE SYSTEM SHALL** dejar `subtotal_clp = 10000`, `vat_clp = 1900` y `total_clp = 11900`
2. **WHEN** una orden `neto` suma 10.003 **THE SYSTEM SHALL** dejar `vat_clp = 1901` y `total_clp = 11904`
3. **WHEN** se anula una línea de una orden `neto` **THE SYSTEM SHALL** recalcular neto, IVA y total sobre las líneas vigentes en la misma transacción
4. **WHEN** una orden `final` cambia sus líneas **THE SYSTEM SHALL** calcular `total_clp` y `estimated_minutes` como antes y dejar `subtotal_clp` y `vat_clp` en 0
5. **WHEN** `vatOfNet` recibe 0, 50 y 10000 **THE SYSTEM SHALL** devolver 0, 10 y 1900
6. **WHEN** corren `items.test.ts`, `order-items.test.ts`, `approvals.test.ts` y `delivery.test.ts` **THE SYSTEM SHALL** pasar sin cambios en esos archivos

**Verify**

```bash
pnpm test tests/integration/pricing-totals.test.ts tests/integration/items.test.ts tests/integration/order-items.test.ts tests/integration/approvals.test.ts tests/integration/delivery.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/taller/items.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/server/taller/order-totals.ts src/server/taller/items.ts src/server/taller/rules.ts tests/integration/pricing-totals.test.ts
git commit -m "feat: f2-09 compute net vat and total for neto orders" && git tag f2-09
git tag -l f2-09 | grep -qx f2-09   # expect: exit 0
```

### `E2-T2` — F2-10 Copy branch pricing mode on order creation

**Depends on:** `E2-T1` · **Priority:** p0

1. `tests/integration/pricing-switch.test.ts` primero: `startReception` y `openWarrantyOrder` con la sucursal en `neto` y en `final`; `setNewOrderPricingMode` por rol; una orden existente no cambia; render del catálogo con POST `action=pricing` (patrón de `indicadores-page.test.ts`: Container API, `vi.mock` de `getDb`, cookie, `Origin`).
2. `order-creation.ts`: mover `allocateOrderNumber` desde `orders.ts` sin cambiar su firma (no tiene importadores fuera de `orders.ts`; verificar con `grep -rn allocateOrderNumber src tests scripts`). `allocateNewOrder(db, branchId)`: un solo `update branches set next_order_number = next_order_number + 1 where id = $1 returning next_order_number - 1 as number, new_order_pricing_mode as pricing_mode` (mismo manejo `Array.isArray(result) ? result : result.rows`). `getNewOrderPricingMode(db, actor)`. `setNewOrderPricingMode(db, actor, { mode }, now)`: `catalog.edit`; zod `z.enum(PRICING_MODES)`; transacción; si no cambia → `{ ok: true, changed: false }`; si cambia, actualiza la sucursal y audita `pricing.mode_changed` con `{ from, to }`.
3. `orders.ts`: en `insertReceptionOrder` y `openWarrantyOrder`, `const { number, pricingMode } = await allocateNewOrder(…)` y `pricingMode` en los `values`; quitar `allocateOrderNumber` del archivo.
4. `catalogo/index.astro`: bloque "Régimen de precios de órdenes nuevas", visible con `catalog.edit`: régimen actual (`PRICING_MODE_LABELS`), formulario POST `action=pricing` con radios `Precios finales` / `Precios netos + IVA` y botón `Guardar régimen`; nota: "Afecta solo a las órdenes creadas después del cambio. Antes de pasar a netos, confirma que los precios del catálogo y de los productos están cargados sin IVA." → 303 `?hecho=pricing`, aviso `Régimen de precios guardado.`

**Files**
- `src/server/taller/order-creation.ts` — new
- `src/server/taller/orders.ts` — edit
- `src/pages/taller/catalogo/index.astro` — edit
- `tests/integration/pricing-switch.test.ts` — new

Reglas: `taller-domain.md`, `taller-ui.md`, `server-api.md`. No negociable 18. No cambia: firmas de `startReception` y `openWarrantyOrder`; `reception.test.ts`, `warranty.test.ts`, `catalog.test.ts`.

**Acceptance**

1. **WHEN** la sucursal tiene `new_order_pricing_mode = 'neto'` y se inicia una recepción o se abre una garantía **THE SYSTEM SHALL** crear la orden con `pricing_mode = 'neto'`
2. **WHEN** la sucursal está en `final` **THE SYSTEM SHALL** crear las órdenes con `pricing_mode = 'final'` como hoy
3. **WHEN** `setNewOrderPricingMode` cambia el régimen **THE SYSTEM SHALL** dejar intactos `pricing_mode`, `total_clp`, `subtotal_clp` y `vat_clp` de las órdenes existentes y registrar `pricing.mode_changed` con el régimen anterior y el nuevo
4. **WHEN** `reception` o `mechanic` llaman `setNewOrderPricingMode` **THE SYSTEM SHALL** devolver `ok: false` con código `forbidden` sin cambiar la sucursal
5. **WHEN** el dueño hace POST del régimen en `/taller/catalogo` **THE SYSTEM SHALL** responder 303 a `/taller/catalogo?hecho=pricing`
6. **WHEN** se cuentan las líneas de `src/server/taller/orders.ts` **THE SYSTEM SHALL** tener menos de 400

**Verify**

```bash
pnpm test tests/integration/pricing-switch.test.ts tests/integration/reception.test.ts tests/integration/warranty.test.ts tests/integration/catalog.test.ts   # expect: exit 0, 0 failed
grep -q 'export async function allocateOrderNumber' src/server/taller/order-creation.ts   # expect: exit 0
test "$(wc -l < src/server/taller/orders.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/server/taller/order-creation.ts src/server/taller/orders.ts src/pages/taller/catalogo/index.astro tests/integration/pricing-switch.test.ts
git commit -m "feat: f2-10 copy branch pricing mode on order creation" && git tag f2-10
git tag -l f2-10 | grep -qx f2-10   # expect: exit 0
```

### `E2-T3` — F2-11 Show net, VAT and total on order screens

**Depends on:** `E2-T2` · **Priority:** p0

1. `tests/integration/order-amounts-page.test.ts` primero: orden `neto` con una línea de 10.000 (vía `addPartItem` para que el total se recalcule) y una orden `final`; renderiza `ordenes/[id]/index.astro`, `recepcion.astro` y `entrega.astro` con Container API; además el CHECK de saldo con `update` directo (`status = 'entregada'`, `qc_approved_at` fijado).
2. `OrderAmounts.astro`: props de "Contracts"; rinde `<dt>Neto</dt><dd class="mono">{netText}</dd><dt>{vatLabel}</dt><dd class="mono">{vatText}</dd><dt>{totalLabel}</dt><dd class="mono">{totalText}</dd>`; no importa `src/server/**`.
3. En las tres páginas, `order.pricingMode === "neto"` ? `OrderAmounts` (con `formatClp` y `` `IVA (${VAT_RATE_PERCENT}%)` ``) : **el marcado de hoy sin tocar**. Detalle: `Total para el cliente`. Entrega: `Total`, luego `Pagado` y `Saldo` como hoy; el campo `Monto` sigue tomando `balance = total_clp - paid_clp`. Recepción: dentro de un `<dl class="data">` en `neto`; en `final`, el `<p>Total: …</p>` de hoy.

**Files**
- `src/components/taller/OrderAmounts.astro` — new
- `src/pages/taller/ordenes/[id]/index.astro` — edit
- `src/pages/taller/ordenes/[id]/recepcion.astro` — edit
- `src/pages/taller/ordenes/[id]/entrega.astro` — edit
- `tests/integration/order-amounts-page.test.ts` — new

Reglas: `taller-ui.md`. No cambia: marcado `final`, formulario de pago.

**Acceptance**

1. **WHEN** se renderiza `/taller/ordenes/<id>` de una orden `neto` con neto 10.000 **THE SYSTEM SHALL** mostrar `Neto` `$10.000`, `IVA (19%)` `$1.900` y `Total para el cliente` `$11.900`
2. **WHEN** se renderiza `/taller/ordenes/<id>/entrega` de esa orden **THE SYSTEM SHALL** mostrar neto, IVA, `Total` `$11.900` y `Saldo` `$11.900`, y el campo `Monto` con valor `11900`
3. **WHEN** se renderiza `/taller/ordenes/<id>/recepcion` de esa orden **THE SYSTEM SHALL** mostrar `Neto`, `IVA (19%)` y el total `$11.900`
4. **WHEN** las tres páginas se renderizan para una orden `final` **THE SYSTEM SHALL** no contener `IVA (19%)` y mostrar el total con el mismo marcado de hoy
5. **WHEN** se fuerza `status = 'entregada'` en una orden `neto` de total 11.900 con `paid_clp = 10000` **THE SYSTEM SHALL** fallar con código `23514`, y con `paid_clp = 11900` **SHALL** aceptarlo
6. **WHEN** corre `pnpm test` **THE SYSTEM SHALL** pasar sin cambios en ninguna prueba existente

**Verify**

```bash
pnpm test tests/integration/order-amounts-page.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/components/taller/OrderAmounts.astro 'src/pages/taller/ordenes/[id]/index.astro' 'src/pages/taller/ordenes/[id]/recepcion.astro' 'src/pages/taller/ordenes/[id]/entrega.astro' tests/integration/order-amounts-page.test.ts
git commit -m "feat: f2-11 show net vat and total on order screens" && git tag f2-11
git tag -l f2-11 | grep -qx f2-11   # expect: exit 0
```

### `E2-T4` — F2-12 Link part lines to inventory products

**Depends on:** `E2-T3` · **Priority:** p0

1. `tests/integration/part-stock.test.ts` primero: los seis criterios (orden `neto` y `final`, producto de costo 3.000 y precio 5.000; `listItems` para los cuatro roles).
2. `part-stock.ts`: `productPartSchema = { productId: uuid, quantity: 1–100 }`. `addProductPartItem(db, actor, orderId, input, now)`: `items.add_part` (el mecánico no la tiene); transacción: bloquear la orden (`select … for update`), `getOrderHeader` + `canAccessOrder` + estado no terminal (mismo criterio que `items.ts`); leer el producto activo de la sucursal (si no, `not_found`); precio = `neto` ? `price_clp` : `grossOfNet(price_clp)` (F2-D16); insertar la línea `repuesto`/`inicial` con `description = name`, `product_id`, `unit_cost_clp = cost_clp`; `applyStockMovement(tx, …)` con `consumo_orden`, `-quantity`, `unitCostClp = cost_clp`, `referenceKind "work_order_item"`, `referenceId item.id`; si devuelve `out_of_stock`, **lanzar** un error centinela para revertir y traducirlo afuera a `{ ok: false, code: "out_of_stock" }`; `recomputeOrderTotals` (importado de `order-totals.ts`); audit `item.added` con `productId`. `reverseItemStock(tx, actor, item, now)`: si `item.productId`, `applyStockMovement(tx, …)` con `anulacion`, `+quantity`, `unitCostClp = item.unitCostClp`, `referenceKind "work_order_item"`, `referenceId item.id`.
3. `items.ts`: en `voidItem`, cuando la línea cambió (`changed.length > 0`), llamar `reverseItemStock(tx, actor, item, now)` antes de recalcular. `listItems`: si `!can(actor.role, "costs.view")`, devolver cada fila sin `unitCostClp` (desestructurar). Sin otros cambios.
4. `lineas.astro`: formulario "Agregar repuesto del inventario" (solo con `items.add_part`): select `Producto` (activos con stock > 0: `SKU · nombre · stock N · $precio`), `Cantidad`, botón `Agregar del inventario` → POST `action=add_product` → 303 `?hecho=add_product`; `out_of_stock` → 409 "No hay stock suficiente de ese producto."; en `neto`, el total de la página usa `OrderAmounts` (`Total para el cliente`), en `final` el marcado de hoy.

**Files**
- `src/server/taller/part-stock.ts` — new
- `src/server/taller/items.ts` — edit
- `src/pages/taller/ordenes/[id]/lineas.astro` — edit
- `tests/integration/part-stock.test.ts` — new

Reglas: `taller-domain.md`, `taller-ui.md`. No negociables 12, 14, 16, 17. No cambia: `addPartItem` sin producto; firmas de `voidItem` y `listItems`; `e2e/lineas-guardar-cambios.spec.ts`.

**Acceptance**

1. **WHEN** `addProductPartItem` agrega 1 unidad de un producto con `stock_qty = 5` a una orden **THE SYSTEM SHALL** dejar `stock_qty = 4`, una línea `repuesto` con `product_id` y `unit_cost_clp` igual al costo del producto, y un movimiento `consumo_orden` de -1 que referencia esa línea
2. **WHEN** se anula esa línea con `voidItem` **THE SYSTEM SHALL** devolver el stock a 5 con un movimiento `anulacion` de +1, dejando dos movimientos
3. **WHEN** el producto no tiene stock suficiente **THE SYSTEM SHALL** devolver `ok: false` con código `out_of_stock` sin dejar la línea ni el movimiento
4. **WHEN** la orden es `neto` **THE SYSTEM SHALL** usar `price_clp` del producto como precio unitario de la línea, y en una orden `final` **SHALL** usar `price_clp + vatOfNet(price_clp)`
5. **WHEN** `listItems` corre para `mechanic` o `reception` **THE SYSTEM SHALL** devolver las líneas sin la clave `unitCostClp`, y con ella para `owner` y `admin`
6. **WHEN** el mecánico llama `addProductPartItem` **THE SYSTEM SHALL** devolver `ok: false` con código `forbidden`, y `addPartItem` sin producto **SHALL** comportarse como hoy

**Verify**

```bash
pnpm test tests/integration/part-stock.test.ts tests/integration/order-items.test.ts tests/integration/items.test.ts tests/integration/quotes.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/taller/items.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0 (incluye e2e/lineas-guardar-cambios.spec.ts sin cambios)
```

**Checkpoint**

```bash
git add -- src/server/taller/part-stock.ts src/server/taller/items.ts 'src/pages/taller/ordenes/[id]/lineas.astro' tests/integration/part-stock.test.ts
git commit -m "feat: f2-12 link part lines to inventory products" && git tag f2-12
git tag -l f2-12 | grep -qx f2-12   # expect: exit 0
```

### `E2-T5` — F2-13 Render net and VAT rows in order emails

**Depends on:** `E2-T4` · **Priority:** p1

1. `tests/unit/pricing-emails.test.ts` primero: las tres plantillas en `neto`, y en `final`/sin régimen comparadas contra la salida de una llamada sin el campo nuevo (`toEqual` del objeto completo).
2. `email/amounts.ts` (no importa `templates.ts`): `type OrderPricing = { mode: PricingMode; subtotalClp: number; vatClp: number }`; `pricingFromNet(mode, netClp)` → `OrderPricing` con `vatOfNet`; `amountRows(totalLabel, totalClp, pricing?)` → si `pricing?.mode !== "neto"`, `[[totalLabel, totalClp]]`; si no, `[["Neto", subtotal], [`IVA (${VAT_RATE_PERCENT}%)`, vat], [totalLabel, subtotal + vat]]`.
3. `templates.ts`: `ReceivedBike` gana `pricingMode?: PricingMode`; `ReadyForPickup` gana `pricing?: OrderPricing`. En `receivedBikeEmail`, la fila `Total cotizado` pasa a `...amountRows("Total cotizado", suma, pricingFromNet(order.pricingMode ?? "final", suma)).map(([l, a]) => [l, formatClp(a)])`. En `readyForPickupEmail`, la fila `Total` igual con `order.pricing`; `Abonado` y `Saldo` siguen comparando contra `totalClp`. Nada más cambia.
4. `order-templates.ts`: `QuoteEmail` gana `pricingMode?`; `quoteTotalClp(items, mode = "final")` → `neto` ? `grossOfNet(suma)` : suma; la fila `Total` usa `amountRows`.

**Files**
- `src/server/email/amounts.ts` — new
- `src/server/email/templates.ts` — edit
- `src/server/email/order-templates.ts` — edit
- `tests/unit/pricing-emails.test.ts` — new

Reglas: `taller-domain.md`. Regla de código 14 (asuntos con `SITE.name`, como ya los deja la fase plataforma). No cambia: salida sin régimen o con `final`; `received-email.test.ts`, `ready-email.test.ts`.

**Acceptance**

1. **WHEN** `receivedBikeEmail` recibe líneas por 10.000 y `pricingMode: neto` **THE SYSTEM SHALL** incluir en `text` y en `html` las filas `Neto` `$10.000`, `IVA (19%)` `$1.900` y `Total cotizado` `$11.900`
2. **WHEN** `readyForPickupEmail` recibe una orden `neto` con neto 10.000, IVA 1.900, total 11.900 y abonado 5.000 **THE SYSTEM SHALL** mostrar `Neto`, `IVA (19%)`, `Total` `$11.900`, `Abonado` `$5.000` y `Saldo` `$6.900`
3. **WHEN** `quoteEmail` recibe `pricingMode: neto` **THE SYSTEM SHALL** mostrar neto, IVA y `Total` con IVA, y `quoteTotalClp(items, 'neto')` **SHALL** devolver 11900 para 10.000 netos
4. **WHEN** las tres plantillas reciben `final` o no reciben régimen **THE SYSTEM SHALL** producir `subject`, `html` y `text` idénticos a los de hoy
5. **WHEN** se cuentan las líneas de `src/server/email/templates.ts` **THE SYSTEM SHALL** tener menos de 400

**Verify**

```bash
pnpm test tests/unit/pricing-emails.test.ts tests/unit/received-email.test.ts tests/unit/ready-email.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/email/templates.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/server/email/amounts.ts src/server/email/templates.ts src/server/email/order-templates.ts tests/unit/pricing-emails.test.ts
git commit -m "feat: f2-13 render net and vat rows in order emails" && git tag f2-13
git tag -l f2-13 | grep -qx f2-13   # expect: exit 0
```

### `E2-T6` — F2-14 Send the breakdown in reception, ready and quote emails

**Depends on:** `E2-T5` · **Priority:** p1

1. `tests/integration/pricing-notifications.test.ts` primero, con el transporte de prueba que usan `received-notification.test.ts` y `ready-notification.test.ts` (copiar su forma de armar la orden y el transporte, sin modificarlos).
2. `reception.ts`: la consulta de `receivedNotificationOrder` agrega `pricingMode: workOrders.pricingMode` (llega a la plantilla por el spread existente).
3. `qc.ts`: `readyNotificationOrder` agrega `pricingMode`, `subtotalClp`, `vatClp`; la llamada pasa `pricing: { mode: order.pricingMode, subtotalClp: order.subtotalClp, vatClp: order.vatClp }`.
4. `quotes.ts`: `input.pricingMode = order.pricingMode`; el total auditado y devuelto es `quoteTotalClp(input.items, input.pricingMode)`.

**Files**
- `src/server/taller/reception.ts` — edit
- `src/server/taller/qc.ts` — edit
- `src/server/taller/quotes.ts` — edit
- `tests/integration/pricing-notifications.test.ts` — new

Reglas: `taller-domain.md`. No negociable 4 · regla de código 6 (correos después del commit). No cambia: condiciones de envío, auditoría `notify.*`, pruebas de notificaciones existentes.

**Acceptance**

1. **WHEN** se finaliza la recepción de una orden `neto` con líneas por 10.000 **THE SYSTEM SHALL** enviar `Recibimos tu bicicleta` con `IVA (19%)` `$1.900` y `Total cotizado` `$11.900`
2. **WHEN** el control de calidad aprueba una orden `neto` de neto 10.000 **THE SYSTEM SHALL** enviar `Lista para retirar` con `Neto`, `IVA (19%)` y `Total` `$11.900`
3. **WHEN** `sendQuote` corre sobre una orden `neto` de neto 10.000 **THE SYSTEM SHALL** enviar neto, IVA y total, y registrar `notify.quote_sent` con `totalClp` 11900
4. **WHEN** las mismas acciones corren sobre una orden `final` **THE SYSTEM SHALL** enviar correos sin `IVA (19%)`, con `received-notification.test.ts`, `ready-notification.test.ts` y `quotes.test.ts` sin cambios

**Verify**

```bash
pnpm test tests/integration/pricing-notifications.test.ts tests/integration/received-notification.test.ts tests/integration/ready-notification.test.ts tests/integration/quotes.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/taller/reception.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/server/taller/reception.ts src/server/taller/qc.ts src/server/taller/quotes.ts tests/integration/pricing-notifications.test.ts
git commit -m "feat: f2-14 send the breakdown in order emails" && git tag f2-14
git tag -l f2-14 | grep -qx f2-14   # expect: exit 0
```

### `E2-T7` — F2-15 Freeze the breakdown in the service report

**Depends on:** `E2-T6` · **Priority:** p1

1. `tests/integration/report-pricing.test.ts` primero: genera informes de una orden `neto` y una `final` (como `reports.test.ts`); valida un snapshot v1 antiguo con `snapshotSchema`; renderiza `ReportView` y compara montos calculados con `new Intl.NumberFormat("es-CL").format(n)` en la misma prueba.
2. `report-snapshot.ts`: mover `photoSchema`, `snapshotSchema` y `ReportSnapshot` desde `reports.ts`; agregar `subtotalClp: z.number().int().optional()`, `vatClp: z.number().int().optional()`, `vatRatePercent: z.number().int().optional()` (sigue `version: 1`).
3. `reports.ts`: importa de `report-snapshot.ts` y `export type { ReportSnapshot } from "./report-snapshot.ts";`; al armar el snapshot, solo si `order.pricingMode === "neto"`, agrega `subtotalClp`, `vatClp` y `vatRatePercent: VAT_RATE_PERCENT`.
4. `ReportView.astro`: el tipo de props acepta los tres opcionales; si `vatClp` existe, la sección Total muestra `Neto`, `IVA (${vatRatePercent}%)` y `Total` con el mismo formateador que hoy; si no, como hoy.

**Files**
- `src/server/taller/report-snapshot.ts` — new
- `src/server/taller/reports.ts` — edit
- `src/components/taller/ReportView.astro` — edit
- `tests/integration/report-pricing.test.ts` — new

Reglas: `taller-domain.md`, `taller-ui.md`. No cambia: snapshots guardados, token del informe, `reports.test.ts`, `report-view.test.ts`, `report-page.test.ts`.

**Acceptance**

1. **WHEN** se genera el informe de una orden `neto` con neto 10.000 **THE SYSTEM SHALL** guardar en el snapshot `subtotalClp` 10000, `vatClp` 1900, `vatRatePercent` 19 y `totalClp` 11900
2. **WHEN** `ReportView` recibe ese snapshot **THE SYSTEM SHALL** mostrar las filas `Neto`, `IVA (19%)` y `Total` con los tres montos
3. **WHEN** se genera el informe de una orden `final` **THE SYSTEM SHALL** guardar el snapshot sin `subtotalClp`, `vatClp` ni `vatRatePercent`
4. **WHEN** se abre un informe guardado antes del cambio **THE SYSTEM SHALL** validarlo y mostrarlo como hoy
5. **WHEN** se cuentan las líneas de `src/server/taller/reports.ts` **THE SYSTEM SHALL** tener menos de 400

**Verify**

```bash
pnpm test tests/integration/report-pricing.test.ts tests/integration/reports.test.ts tests/integration/report-view.test.ts tests/integration/report-page.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/taller/reports.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/server/taller/report-snapshot.ts src/server/taller/reports.ts src/components/taller/ReportView.astro tests/integration/report-pricing.test.ts
git commit -m "feat: f2-15 freeze the breakdown in the service report" && git tag f2-15
git tag -l f2-15 | grep -qx f2-15   # expect: exit 0
```

### `E2-T8` — F2-16 Show net and VAT on approvals

**Depends on:** `E2-T7` · **Priority:** p1

1. `tests/integration/approval-pricing.test.ts` primero: adicional de 10.000 en una orden `neto` sin líneas; render de `/aprobacion/[token]` (patrón de `approval-page.test.ts`), decisión `aprobar` y totales; render de `adicional.astro` para el dueño.
2. `approvals.ts`: `viewApproval` y `listApprovals` agregan `pricingMode: workOrders.pricingMode` a su select y al objeto devuelto (si `viewApproval` no hace join con `work_orders`, agregarlo por `work_order_id` y `branch_id`).
3. `aprobacion/[token].astro`: en `neto`, el ticket muestra `Precio neto` `formatClp(price)`, `IVA (19%)` `formatClp(vatOfNet(price))` y `Total` `formatClp(grossOfNet(price))`; en `final`, el `Precio` de hoy. Página pública: token, `no-store`, `noindex`, `no-referrer`, solo primer nombre — sin cambios.
4. `adicional.astro`: en órdenes `neto`, el campo se rotula `Precio neto` y cada propuesta muestra `+ IVA $X = $Y`; en `final`, como hoy.

**Files**
- `src/server/taller/approvals.ts` — edit
- `src/pages/aprobacion/[token].astro` — edit
- `src/pages/taller/ordenes/[id]/adicional.astro` — edit
- `tests/integration/approval-pricing.test.ts` — new

Reglas: `server-api.md`, `taller-ui.md`. No negociable 11. No cambia: decisión de un solo uso, `approval-page.test.ts`, `approvals.test.ts`, `approval-decide.test.ts`.

**Acceptance**

1. **WHEN** el cliente abre `/aprobacion/<token>` de un adicional de 10.000 en una orden `neto` **THE SYSTEM SHALL** mostrar `Precio neto` `$10.000`, `IVA (19%)` `$1.900` y `Total` `$11.900`
2. **WHEN** el adicional es de una orden `final` **THE SYSTEM SHALL** mostrar `Precio` con el monto como hoy, con `approval-page.test.ts` sin cambios
3. **WHEN** el cliente aprueba ese adicional en una orden `neto` sin otras líneas **THE SYSTEM SHALL** agregar la línea con `unit_price_clp = 10000` y dejar la orden con `total_clp = 11900`
4. **WHEN** el personal abre `/taller/ordenes/<id>/adicional` de una orden `neto` **THE SYSTEM SHALL** rotular el campo de precio como `Precio neto` y mostrar cada propuesta con su IVA
5. **WHEN** se cuentan las líneas de `src/server/taller/approvals.ts` **THE SYSTEM SHALL** tener menos de 400

**Verify**

```bash
pnpm test tests/integration/approval-pricing.test.ts tests/integration/approval-page.test.ts tests/integration/approvals.test.ts tests/integration/approval-decide.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/taller/approvals.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/server/taller/approvals.ts 'src/pages/aprobacion/[token].astro' 'src/pages/taller/ordenes/[id]/adicional.astro' tests/integration/approval-pricing.test.ts
git commit -m "feat: f2-16 show net and vat on approvals" && git tag f2-16
git tag -l f2-16 | grep -qx f2-16   # expect: exit 0
```

### `E2-T9` — F2-17 Prepare publication window V1

**Depends on:** `E2-T8` · **Priority:** p0

1. Localizar la migración de la ventana: `grep -lE 'CREATE TABLE ("public"\.)?"products"' drizzle/*.sql` (la generada en F2-02). Leerla y confirmar que solo agrega.
2. Escribir `docs/ventanas/f2-v1.md` con estas secciones literales:
   - `## Qué trae` — inventario, compras, repuestos ligados, columnas de precio y el interruptor (en `final`); tag `f2-17`.
   - `## Migraciones` — el nombre exacto del archivo que devolvió el grep y lo que crea.
   - `## Precondiciones` — taller cerrado; respaldo de la base del día; `main` en el tag `f2-17` con `pnpm gate` verde; régimen de precios en `final` (el corte C2 es posterior y lo decide el dueño).
   - `## Pasos en Replit` — los de BITACORA §2 "Publicar con cambios de esquema": `git fetch origin`, `git reset --hard origin/main`, `git log --oneline -1`, `corepack pnpm@12.4.2 install --frozen-lockfile`, `corepack pnpm@12.4.2 db:migrate`, `corepack pnpm@12.4.2 db:check`, `rm -rf node_modules`, Deployments → Republish.
   - `## Verificación después de publicar` — en el panel *Database* de producción, solo lectura: `select count(*) from products;` responde (tabla existe); `select new_order_pricing_mode from branches;` → `final`; abrir `/taller/inventario` como dueño.
   - `## Reversión` — republicar el deployment anterior; el esquema solo creció.

**Files**
- `docs/ventanas/f2-v1.md` — new

Reglas: `database.md`. No negociable 2 (Claude nunca toca producción).

**Acceptance**

1. **WHEN** `pnpm db:migrate` y `pnpm db:check` corren sobre la base dev **THE SYSTEM SHALL** salir 0 con `products`, `stock_movements`, `suppliers`, `purchase_orders` y `purchase_order_items` presentes
2. **WHEN** se buscan en `drizzle/*.sql` las migraciones de la ventana V1 **THE SYSTEM SHALL** encontrar exactamente una con `CREATE TABLE` de `products`, sin `DROP TABLE`, `DROP COLUMN`, `DROP CONSTRAINT` ni `RENAME`
3. **WHEN** se lee `docs/ventanas/f2-v1.md` **THE SYSTEM SHALL** contener `## Precondiciones`, `## Pasos en Replit` y `## Verificación después de publicar`, y el nombre de esa migración
4. **WHEN** corre `pnpm gate` sobre el tag de la ventana **THE SYSTEM SHALL** salir 0

**Verify**

```bash
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
f="$(grep -lE 'CREATE TABLE ("public"\.)?"products"' drizzle/*.sql)"; test "$(printf '%s\n' "$f" | grep -c .)" = 1 && { grep -Eq 'DROP (TABLE|COLUMN|CONSTRAINT)|RENAME' "$f"; test $? -eq 1; }   # expect: exit 0 — una sola migración de la ventana y sin borrados
f="$(grep -lE 'CREATE TABLE ("public"\.)?"products"' drizzle/*.sql)"; grep -qF "$(basename "$f")" docs/ventanas/f2-v1.md   # expect: exit 0
grep -qF '## Precondiciones' docs/ventanas/f2-v1.md && grep -qF '## Pasos en Replit' docs/ventanas/f2-v1.md && grep -qF '## Verificación después de publicar' docs/ventanas/f2-v1.md   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- docs/ventanas/f2-v1.md
git commit -m "docs: f2-17 prepare publication window v1" && git tag f2-17
git tag -l f2-17 | grep -qx f2-17   # expect: exit 0
git ls-files --error-unmatch docs/ventanas/f2-v1.md   # expect: exit 0 — commiteado una línea arriba
```
