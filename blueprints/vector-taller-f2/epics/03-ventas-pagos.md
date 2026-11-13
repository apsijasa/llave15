# Epic 03: Ventas de mostrador, pagos ampliados y ventana V2

> Después de esta épica existen las ventas de mostrador (con cliente opcional, descuento con motivo y anulación), `payments` admite pagos de ventas y Mercado Pago como registro (con `external_id`, comisión y neto), y el CHECK de método se reemplazó en su propia migración. Cierra con la ventana de publicación V2.

| | |
|---|---|
| **Epic id** | `03-ventas-pagos` |
| **Tasks** | `E3-T1` … `E3-T7` (pasos F2-18 … F2-24) |
| **Depends on** | `02-precios-netos` |
| **Unlocks** | `04-caja-gastos` |
| **Parallel with** | ninguna |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Astro 7 SSR · TypeScript 6 · Postgres 16 · Drizzle ORM 0.45 · zod 4 · luxon · Vitest + PGlite · Playwright (tablet). `pnpm` 12.4.2; Node 24. Ninguna dependencia nueva.

| Task | Command |
|---|---|
| Formatear | `pnpm format` |
| Test (un archivo) | `pnpm test tests/integration/<archivo>.test.ts` |
| Migraciones (solo base dev) | `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:check` |
| Tablet | `pnpm build && pnpm test:tablet e2e/<archivo>.spec.ts` |
| Compuerta | `pnpm gate` |

**Gate:** `pnpm format && pnpm gate`. El sandbox de Codex corre solo `format`, `check`, `test`, `build`; `db:migrate`, `db:check`, `test:tablet`, `smoke`, `gate` y el commit los hace la sesión coordinadora. Reversión: `git reset --hard f2-<anterior>` y, si hace falta, el reinicio de la base dev de `blueprint.md` §12.

**Reglas transversales de cada tarea:** pruebas primero, en rojo; ≤ 5 archivos; **releer cada archivo antes de tocarlo** (otros cambios pueden llegar a `main`; el criterio es "< 400" sobre el archivo real); **ningún texto para el usuario, correo, título ni página escribe el nombre del taller literal** — `SITE.name`; nunca editar `drizzle/` ni usar `--custom`; nada se borra (anular con `voided_at`, `voided_by` y motivo); dinero en pesos enteros; `recordAudit` dentro de la transacción; zod en toda entrada; costos (`unitCostClp`, `feeClp`, `netClp`) solo con `costs.view`; Mercado Pago **solo registro**: nada de credenciales ni llamadas a su API. **Checkpoint:** `git add --` solo con las rutas del paso (y `drizzle` en pasos de esquema, después de la guarda de duplicados de iCloud); nunca `git add -A`.

**Cobertura de tablet:** E3-T5 tiene `e2e/venta-mostrador.spec.ts` (venta de mostrador, FASE2 §8).

## Directory subtree

```
src/server/db/schema-sales.ts             # NEW (E3-T1): sales, sale_items, saleTables
src/server/db/schema.ts                   # edit (E3-T1): branches.next_sale_number
scripts/db-check.ts                       # edit (E3-T1)
src/server/db/schema-payments.ts          # edit (E3-T2 aditiva, E3-T3 CHECK de método)
src/server/taller/payments.ts             # edit (E3-T2, E3-T6)
src/server/taller/history.ts              # edit (E3-T2 nulos, E3-T4 ventas)
src/server/taller/rules.ts                # edit (E3-T3, E3-T4)
src/server/taller/sales.ts · sale-void.ts # NEW (E3-T4)
src/server/taller/indicators.ts           # edit (E3-T6): fila Mercado Pago condicional
src/pages/taller/ventas/{index,nueva}.astro   # NEW (E3-T5)
src/pages/taller/ordenes/[id]/entrega.astro   # edit (E3-T6)
src/layouts/TallerLayout.astro            # edit (E3-T5)
e2e/venta-mostrador.spec.ts               # NEW (E3-T5)
docs/ventanas/f2-v2.md                    # NEW (E3-T7)
tests/integration/{sales-schema,payments-extension,payment-method-check,sales,mercadopago-payments}.test.ts   # NEW
```

## Data model touched here

**B** = `branch_id not null → branches restrict` · **V** = `voided_at` + `voided_by → users` · **CB** = `created_by not null → users`.

| Entity | Campos | Notas |
|---|---|---|
| `branches` (E3-T1) | + `next_sale_number integer not null default 1` | CHECK `next_sale_number >= 1` |
| `sales` (E3-T1) | B, `number not null`, `customer_id → customers` (null), `status not null default 'abierta'`, `subtotal_clp not null` (neto después del descuento), `discount_clp not null default 0`, `discount_reason`, `vat_clp not null`, `total_clp not null`, `paid_clp not null default 0`, `doc_type`, `doc_number`, `void_reason`, V, CB | único `(branch_id, number)`; CHECK `number >= 1`; `status in ('abierta','pagada','anulada')`; montos `>= 0`; `total_clp = subtotal_clp + vat_clp`; `status <> 'pagada' or paid_clp = total_clp`; `discount_clp = 0 or discount_reason is not null`; `doc_type is null or doc_type in ('boleta','factura')`; `(status = 'anulada') = (voided_at is not null)`; índices `(branch_id, created_at)`, `(customer_id)`. `cash_session_id` llega en la épica 04 |
| `sale_items` (E3-T1) | B, `sale_id → sales`, `product_id → products` not null, `description not null`, `quantity not null`, `unit_price_clp not null`, `unit_cost_clp not null` | CHECK `quantity > 0`, `unit_price_clp >= 0 and unit_cost_clp >= 0`; índice `(sale_id)` |
| `payments` (E3-T2) | `work_order_id` **nullable**; + `sale_id → sales` (null), `external_id text`, `fee_clp integer not null default 0`, `net_clp integer` | CHECK `payments_target_check`: `num_nonnulls(work_order_id, sale_id) = 1`; `payments_fee_check`: `fee_clp >= 0 and fee_clp <= amount_clp`; `payments_net_check`: `net_clp is null or net_clp = amount_clp - fee_clp`; `payments_mercadopago_check`: `method <> 'mercadopago' or external_id is not null`; índice `(sale_id)` |
| `payments` (E3-T3) | `payments_method_check` → `method in ('transferencia', 'tarjeta', 'efectivo', 'otro', 'mercadopago')` | **única excepción no aditiva de la fase**; generación propia |

`schema-sales.ts` importa de `schema.ts`, `schema-taller.ts` (`customers`) y `schema-inventory.ts` (`products`); `schema-payments.ts` importa `sales` de `schema-sales.ts`. Ventas siempre en régimen neto: precios de producto netos, IVA sobre el subtotal con descuento (`vatOfNet`).

**Forma de las migraciones (evidencia en el repo):** drizzle-kit 0.31.10 escribe una sentencia por línea con comillas dobles, por ejemplo `drizzle/0001_huge_ultron.sql` línea 17: `ALTER TABLE "bookings" DROP CONSTRAINT "bookings_status_check";--> statement-breakpoint`, y línea 18: `ALTER TABLE "bookings" ADD COLUMN "whatsapp_consent_at" …`. Los Verify de E3-T3 y E3-T7 buscan `DROP CONSTRAINT "payments_method_check"`, `ADD CONSTRAINT "payments_method_check"` y `ADD COLUMN "sale_id"` en ese formato, sin contar líneas.

## Contracts

**Consumed:** `applyStockMovement(tx, …)`, `vatOfNet`, `grossOfNet`, `RECORDABLE_PAYMENT_METHODS` (E3-T3), `recordAudit`, `can`, `findCustomerByPhone` (`customers.ts`), `listProducts`, `formatClp`, `customerTimeline`/`sortTimeline` (`history.ts`), `workshopIndicators`, `SITE`.

**Produced:**

| Export | Signature |
|---|---|
| `schema-sales.ts` → `sales`, `saleItems`, `saleTables` | tablas Drizzle |
| `rules.ts` → `RECORDABLE_PAYMENT_METHODS`, `PAYMENT_METHOD_LABELS` (+`mercadopago: "Mercado Pago"`), `SALE_STATUSES`, `SALE_STATUS_LABELS` | `PAYMENT_METHODS` queda con 4 |
| `sales.ts` → `saleFormSchema`, `previewSale`, `createSale`, `listSales`, `listCustomerSales`, `formatSaleNumber` | `createSale(db, actor, input, now)` → `{ ok: true, saleId, number, totalClp } \| { ok: false, code }`; `formatSaleNumber(1)` → `VM-00001` |
| `sale-void.ts` → `voidSale` | `(db, actor, saleId, { reason }, now)` |
| `payments.ts` → `recordPayment` (misma firma) | acepta `externalId?`, `feeClp?`, `mercadopago` |

**`saleFormSchema`:** `items`: 1–5 `{ productId: uuid, quantity: 1–100 }` sin productos repetidos; `customerId?: uuid`; `discountClp`: entero ≥ 0 (default 0); `discountReason?`: 3–200 (obligatorio si `discountClp > 0`); `method`: `RECORDABLE_PAYMENT_METHODS`; `externalId?`: 1–100 (obligatorio si `mercadopago`); `feeClp?`: entero ≥ 0 (solo `mercadopago`); `docType?`: `boleta`|`factura`; `docNumber?`: ≤ 30.

## Rótulos que usan los specs (literales; F2-31 también depende de ellos)

| Página | Rótulos |
|---|---|
| `/taller/ventas/nueva` | `h1` `Nueva venta`; selects `Producto 1` … `Producto 5` (primera opción `—`; cada opción con el texto exacto `` `${sku} · ${name} · stock ${stockQty} · ${formatClp(priceClp)}` ``, solo activos con stock > 0); `Cantidad 1` … `Cantidad 5` (valor 1); `Teléfono del cliente (opcional)`; solo con `items.override_price`: `Descuento (neto)` y `Motivo del descuento`; `fieldset` `Medio de pago` con radios de `PAYMENT_METHOD_LABELS` (`Transferencia`, `Tarjeta`, `Efectivo`, `Otro`, `Mercado Pago`); `fieldset` `Solo Mercado Pago` con `Id de la operación` y `Comisión`; `Documento` (`Sin documento`, `Boleta`, `Factura`) y `Folio`; botones `Calcular total` (`name="action" value="preview"`) y `Registrar venta` (`value="record"`); tras calcular, `<dl class="data">` con `Neto`, `IVA (19%)`, `Total` |
| `/taller/ventas` | `h1` `Ventas`; aviso `` `Venta ${número} registrada.` `` cuando llega `?hecho=sale&venta=VM-00001` (validar `^VM-\d{5}$`); rango `Desde`/`Hasta` (≤ 31 días, si no 422); tabla `Número`, `Hora`, `Cliente`, `Total`, `Medio`, `Estado` (`span.status`), `Acciones` (anular con `Motivo`, solo `payments.void`) |

## Conventions that bite in this area

- Una venta se crea **pagada** en una sola transacción: venta, ítems, movimientos de stock y pago. Cualquier error después de escribir se traduce con un error centinela para revertir todo.
- `PAYMENT_METHODS` no cambia (la Etapa A de indicadores afirma cuatro filas); los formularios usan `RECORDABLE_PAYMENT_METHODS`.
- `payments.work_order_id` deja de ser obligatorio: todo código que lo usa como `string` lo trata como `string | null`.
- La migración de E3-T3 debe traer **solo** el reemplazo de `payments_method_check`; si drizzle-kit pregunta algo o trae otra sentencia o restricción, detenerse y reportar.
- `e2e/**` no afirma números exactos de venta: `/VM-\d{5}/`.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/database.md`, `taller-domain.md`, `taller-ui.md`, `server-api.md`, `e2e.md`.

---

## Tasks

### `E3-T1` — F2-18 Add sales and sale items schema

**Depends on:** `E2-T9` · **Priority:** p0

1. `tests/integration/sales-schema.test.ts` primero: defaults, cada CHECK (`23514`) y el único de número (`23505`).
2. `schema-sales.ts` (nuevo): `sales`, `saleItems` según "Data model"; `export const saleTables = [sales, saleItems] as const`.
3. `schema.ts`: `branches.next_sale_number` y su CHECK.
4. `scripts/db-check.ts`: recorre también `saleTables`.
5. `pnpm db:generate` (si pregunta, detenerse) → pruebas → `pnpm db:migrate` → `pnpm db:check`.

**Files**
- `src/server/db/schema-sales.ts` — new
- `src/server/db/schema.ts` — edit
- `scripts/db-check.ts` — edit
- `tests/integration/sales-schema.test.ts` — new

Reglas: `database.md`. No negociables 5, 8.

**Acceptance**

1. **WHEN** `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` **THE SYSTEM SHALL** crear `sales` y `sale_items` y agregar `branches.next_sale_number` con valor por defecto 1
2. **WHEN** una venta se guarda con `total_clp` distinto de `subtotal_clp + vat_clp` **THE SYSTEM SHALL** rechazarla con código `23514`
3. **WHEN** una venta queda `pagada` con `paid_clp` distinto de `total_clp`, o lleva `discount_clp > 0` sin `discount_reason` **THE SYSTEM SHALL** rechazarla con código `23514`
4. **WHEN** una venta queda `anulada` sin `voided_at`, o tiene `voided_at` en otro estado **THE SYSTEM SHALL** rechazarla con código `23514`
5. **WHEN** se guardan dos ventas con el mismo `number` en una sucursal **THE SYSTEM SHALL** rechazar la segunda con código `23505`
6. **WHEN** `pnpm db:check` corre **THE SYSTEM SHALL** revisar las columnas de `saleTables` y salir 0

**Verify**

```bash
pnpm test tests/integration/sales-schema.test.ts   # expect: exit 0, 0 failed
f="$(ls drizzle/*.sql | sort | tail -1)"; grep -Eq 'DROP (TABLE|COLUMN|CONSTRAINT)|RENAME' "$f"; test $? -eq 1   # expect: 1 = aditiva → la línea sale 0
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
u="$(git ls-files --others --exclude-standard)" && test -z "$(printf '%s\n' "$u" | grep -E ' 2(\.[^/]*)?$')"   # expect: exit 0 — sin duplicados de iCloud antes de agregar drizzle/
git add -- src/server/db/schema-sales.ts src/server/db/schema.ts scripts/db-check.ts tests/integration/sales-schema.test.ts drizzle
git commit -m "feat: f2-18 add sales schema" && git tag f2-18
git tag -l f2-18 | grep -qx f2-18   # expect: exit 0
```

### `E3-T2` — F2-19 Extend payments additively for sales and fees

**Depends on:** `E3-T1` · **Priority:** p0

1. `tests/integration/payments-extension.test.ts` primero: los CHECK nuevos con inserciones directas (método `transferencia`, ya admitido) y `listPayments` para los cuatro roles.
2. `schema-payments.ts`: lo de "Data model" para E3-T2 (sin tocar `payments_method_check`).
3. `payments.ts`: donde `payments.workOrderId` se usa como `string` (`lockPayment`, `voidPayment`), tratar `null` como `not_found`; `listPayments`: sin `costs.view`, omitir `feeClp` y `netClp` de cada fila.
4. `history.ts`: en la consulta de pagos, `orderId: row.workOrderId ?? undefined` (o el ajuste mínimo que pida `tsc`).
5. `pnpm db:generate` (quitar un NOT NULL es aditivo; si pregunta, detenerse) → pruebas → migrate → check. Si `pnpm check` marca un error de tipos en una **prueba existente** por el `null`, detenerse y reportar (no se edita).

**Files**
- `src/server/db/schema-payments.ts` — edit
- `src/server/taller/payments.ts` — edit
- `src/server/taller/history.ts` — edit
- `tests/integration/payments-extension.test.ts` — new

Reglas: `database.md`, `taller-domain.md`. No negociables 5, 16, 17. No cambia: firmas de pagos, `payments.test.ts`, `delivery.test.ts`, `history.test.ts`, `indicators.test.ts`.

**Acceptance**

1. **WHEN** `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` **THE SYSTEM SHALL** dejar `payments.work_order_id` nullable y agregar `sale_id`, `external_id`, `fee_clp` con valor por defecto 0 y `net_clp`, sin cambiar `payments_method_check`
2. **WHEN** se inserta un pago sin `work_order_id` ni `sale_id`, o con ambos **THE SYSTEM SHALL** rechazarlo con código `23514`
3. **WHEN** se inserta un pago con `fee_clp` negativo o mayor que `amount_clp`, o con `net_clp` distinto de `amount_clp - fee_clp` **THE SYSTEM SHALL** rechazarlo con código `23514`
4. **WHEN** `listPayments` corre para `reception` o `mechanic` **THE SYSTEM SHALL** devolver los pagos sin las claves `feeClp` ni `netClp`, y con ellas para `owner` y `admin`
5. **WHEN** corren `payments.test.ts`, `delivery.test.ts`, `history.test.ts` e `indicators.test.ts` **THE SYSTEM SHALL** pasar sin cambios en esos archivos
6. **WHEN** se cuentan las líneas de `src/server/db/schema-payments.ts` **THE SYSTEM SHALL** tener menos de 400

**Verify**

```bash
pnpm test tests/integration/payments-extension.test.ts tests/integration/payments.test.ts tests/integration/delivery.test.ts tests/integration/history.test.ts tests/integration/indicators.test.ts   # expect: exit 0, 0 failed
f="$(ls drizzle/*.sql | sort | tail -1)"; grep -Eq 'DROP (TABLE|COLUMN|CONSTRAINT)|RENAME' "$f"; test $? -eq 1   # expect: 1 = aditiva (DROP NOT NULL se permite) → la línea sale 0
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
test "$(wc -l < src/server/db/schema-payments.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
u="$(git ls-files --others --exclude-standard)" && test -z "$(printf '%s\n' "$u" | grep -E ' 2(\.[^/]*)?$')"   # expect: exit 0 — sin duplicados de iCloud antes de agregar drizzle/
git add -- src/server/db/schema-payments.ts src/server/taller/payments.ts src/server/taller/history.ts tests/integration/payments-extension.test.ts drizzle
git commit -m "feat: f2-19 extend payments additively for sales and fees" && git tag f2-19
git tag -l f2-19 | grep -qx f2-19   # expect: exit 0
```

### `E3-T3` — F2-20 Replace the payment method CHECK for Mercado Pago

**Depends on:** `E3-T2` · **Priority:** p0

1. `tests/integration/payment-method-check.test.ts` primero: inserción `mercadopago` con y sin `external_id`; método `cheque`; las dos listas de `rules.ts`.
2. `schema-payments.ts`: **solo** cambiar `payments_method_check` a `method in ('transferencia', 'tarjeta', 'efectivo', 'otro', 'mercadopago')` y el `$type` de `method`. Nada más en esta generación.
3. `rules.ts`: `RECORDABLE_PAYMENT_METHODS = [...PAYMENT_METHODS, "mercadopago"] as const`; `PAYMENT_METHOD_LABELS` pasa a `Record<RecordablePaymentMethod, string>` con `mercadopago: "Mercado Pago"`; `PAYMENT_METHODS` sin cambios.
4. `pnpm db:generate`: la migración debe contener `DROP CONSTRAINT "payments_method_check"` y `ADD CONSTRAINT "payments_method_check"` y ninguna otra sentencia ni restricción. Si trae otra cosa o pregunta, detenerse.

**Files**
- `src/server/db/schema-payments.ts` — edit
- `src/server/taller/rules.ts` — edit
- `tests/integration/payment-method-check.test.ts` — new

Reglas: `database.md` (excepción declarada de la decisión 55). No negociables 5, 19. No cambia: `PAYMENT_METHODS`, `indicators.test.ts`.

**Acceptance**

1. **WHEN** `pnpm db:generate` corre **THE SYSTEM SHALL** emitir una migración propia cuyas únicas sentencias quitan y vuelven a crear `payments_method_check`
2. **WHEN** se inserta un pago `mercadopago` con `external_id` **THE SYSTEM SHALL** aceptarlo, y sin `external_id` **SHALL** rechazarlo con código `23514`
3. **WHEN** se inserta un pago con método `cheque` **THE SYSTEM SHALL** rechazarlo con código `23514`
4. **WHEN** se leen `PAYMENT_METHODS` y `RECORDABLE_PAYMENT_METHODS` **THE SYSTEM SHALL** tener `transferencia`, `tarjeta`, `efectivo` y `otro` en el primero, y esos cuatro más `mercadopago` en el segundo, con la etiqueta `Mercado Pago`

**Verify**

```bash
pnpm test tests/integration/payment-method-check.test.ts tests/integration/payments.test.ts tests/integration/indicators.test.ts   # expect: exit 0, 0 failed
f="$(ls drizzle/*.sql | sort | tail -1)"; grep -qF 'DROP CONSTRAINT "payments_method_check"' "$f" && grep -qF 'ADD CONSTRAINT "payments_method_check"' "$f" && { grep -Eq 'CREATE TABLE|CREATE (UNIQUE )?INDEX|DROP INDEX|ADD COLUMN|DROP COLUMN|ALTER COLUMN|RENAME' "$f"; test $? -eq 1; } && test -z "$(grep -oE 'CONSTRAINT "[a-z_]+"' "$f" | grep -v '"payments_method_check"')"   # expect: exit 0 — la migración más nueva solo quita y vuelve a crear payments_method_check
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
u="$(git ls-files --others --exclude-standard)" && test -z "$(printf '%s\n' "$u" | grep -E ' 2(\.[^/]*)?$')"   # expect: exit 0 — sin duplicados de iCloud antes de agregar drizzle/
git add -- src/server/db/schema-payments.ts src/server/taller/rules.ts tests/integration/payment-method-check.test.ts drizzle
git commit -m "feat: f2-20 replace payment method check for mercado pago" && git tag f2-20
git tag -l f2-20 | grep -qx f2-20   # expect: exit 0
```

### `E3-T4` — F2-21 Add counter sales server and customer history

**Depends on:** `E3-T3` · **Priority:** p0

1. `tests/integration/sales.test.ts` primero: los seis criterios (producto de 5.000 netos y costo 3.000, stock 3; usuarios de los cuatro roles; un cliente sin órdenes).
2. `rules.ts`: `SALE_STATUSES = ["abierta","pagada","anulada"]` + etiquetas (`Abierta`, `Pagada`, `Anulada`).
3. `sales.ts`: `formatSaleNumber(n)` = `` `VM-${String(n).padStart(5, "0")}` ``. `previewSale(db, actor, input)` (`sales.record`; sin escribir; productos activos de la sucursal; devuelve líneas con precio, `subtotalClp`, `vatClp`, `totalClp` o `out_of_stock`/`invalid_amount`). `createSale(db, actor, input, now)`: `sales.record`; `discountClp > 0` sin `items.override_price` → `forbidden`; zod; transacción: número (`update branches set next_sale_number = next_sale_number + 1 … returning next_sale_number - 1`), leer y bloquear cada producto, `subtotal = Σ(quantity × price_clp) − discount` (< 0 o total 0 → `invalid_amount`), `vat = vatOfNet(subtotal)`, `total`; insertar la venta (`abierta`), sus `sale_items` (precio y costo congelados), `applyStockMovement(tx, …)` con `venta`, `-quantity`, `cost_clp`, `"sale"`, `saleId` por ítem (si `out_of_stock`, error centinela → revertir); insertar el pago (`kind: "final"`, `sale_id`, `amount_clp = total`, método; en `mercadopago`, `external_id`, `fee_clp` y `net_clp = total − fee`); venta `pagada` con `paid_clp = total`; audit `sale.created` (`number`, `totalClp`, líneas), `sale.discounted` (`amountClp`, `reason`) si hay descuento, `payment.recorded` con `entity: "sale"`. `listSales(db, actor, { from, to })` (`sales.record`; fechas locales, ≤ 31 días; sin `unitCostClp` ni `feeClp` si no hay `costs.view`). `listCustomerSales(db, actor, customerId)`.
4. `sale-void.ts`: `voidSale(db, actor, saleId, { reason: 3–200 }, now)`: `payments.void`; venta `pagada` o `abierta` de la sucursal (si no, `invalid_status`); transacción: `anulada` con `voided_at`, `voided_by`, `void_reason`; `applyStockMovement(tx, …)` con `anulacion`, `+quantity`, `unit_cost_clp`, `"sale"`, `saleId` por ítem; anular sus pagos vigentes (`voided_at`, `voided_by`); audit `sale.voided` y `payment.voided` (`entity: "sale"`).
5. `history.ts`: `TimelineEvent.kind` gana `"sale"` (y su lugar en `KIND_ORDER`, antes de `payment`); `customerTimeline` agrega, para las ventas vigentes del cliente, `{ at, kind: "sale", title: `Venta ${formatSaleNumber(n)}`, detail: formatClp(total) }` y ya no devuelve `[]` si el cliente tiene ventas aunque no tenga órdenes (ordenar con `sortTimeline` en ese caso). Los eventos existentes no cambian.

**Files**
- `src/server/taller/sales.ts` — new
- `src/server/taller/sale-void.ts` — new
- `src/server/taller/rules.ts` — edit
- `src/server/taller/history.ts` — edit
- `tests/integration/sales.test.ts` — new

Reglas: `taller-domain.md`. No negociables 14, 16, 17. No cambia: `history.test.ts`.

**Acceptance**

1. **WHEN** `reception` registra una venta sin cliente de 2 unidades de un producto de 5.000 netos con stock 3, pagada por transferencia **THE SYSTEM SHALL** crear la venta `VM-00001` `pagada` con `subtotal_clp = 10000`, `vat_clp = 1900` y `total_clp = 11900`, un `sale_items` con precio y costo congelados, un pago `final` con `sale_id` por 11.900, y dejar `stock_qty = 1` con un movimiento `venta` de -2
2. **WHEN** una línea pide más unidades que el stock **THE SYSTEM SHALL** devolver `ok: false` con código `out_of_stock` sin escribir venta, líneas, pago ni movimientos
3. **WHEN** `reception` envía un descuento **THE SYSTEM SHALL** devolver `ok: false` con código `forbidden`, y **WHEN** `owner` aplica 1.000 con motivo **THE SYSTEM SHALL** calcular el IVA sobre el neto con descuento y registrar `sale.discounted` con usuario, monto y motivo
4. **WHEN** `owner` anula la venta con motivo **THE SYSTEM SHALL** dejarla `anulada` con `voided_at`, `voided_by` y el motivo, devolver el stock con movimientos `anulacion`, anular su pago y registrar `sale.voided`; `reception` **SHALL** recibir `forbidden`
5. **WHEN** la venta lleva cliente **THE SYSTEM SHALL** aparecer en `customerTimeline` de ese cliente como `Venta VM-00001` con su total, aunque el cliente no tenga órdenes
6. **WHEN** `listSales` corre para `reception` **THE SYSTEM SHALL** devolver las ventas sin las claves `unitCostClp` ni `feeClp`

**Verify**

```bash
pnpm test tests/integration/sales.test.ts tests/integration/history.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/taller/sales.ts | tr -d ' ')" -lt 400 && test "$(wc -l < src/server/taller/history.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/server/taller/sales.ts src/server/taller/sale-void.ts src/server/taller/rules.ts src/server/taller/history.ts tests/integration/sales.test.ts
git commit -m "feat: f2-21 add counter sales server and customer history" && git tag f2-21
git tag -l f2-21 | grep -qx f2-21   # expect: exit 0
```

### `E3-T5` — F2-22 Add sale pages and tablet counter sale

**Depends on:** `E3-T4` · **Priority:** p0

1. `e2e/venta-mostrador.spec.ts` primero (solo `@playwright/test` y `./fixtures.ts`): **test 1** "Venta de mostrador sin cliente en tablet": `login(page, "owner", "/taller/inventario/nuevo")`; crear `E2E-VENTA-1` `Bombín E2E`, `Repuesto`, `Costo neto` 3000, `Precio neto` 5000, `Stock inicial` 3; ir a `/taller/ventas/nueva`; `Producto 1` → opción `E2E-VENTA-1 · Bombín E2E · stock 3 · $5.000`; `Cantidad 1` = 2; tocar `Calcular total`; el `dd` de `Total` = `$11.900`; en `Medio de pago` tocar `Transferencia`; tocar `Registrar venta`; `role=status` con `/^Venta VM-\d{5} registrada\.$/`; abrir la ficha del producto y ver `Stock` = `1`. **test 2** "El mecánico no vende": `login(page, "mechanic")`; `const r = await page.goto("/taller/ventas/nueva")`; `r?.status()` = 403.
2. `ventas/nueva.astro` (`sales.record`): formulario con los rótulos de la tabla; cliente opcional por teléfono con `findCustomerByPhone` (si no existe, error "No hay un cliente con ese teléfono."); POST `action=preview` → `previewSale` y re-render con los mismos valores y el `<dl>` del desglose; POST `action=record` → `createSale` → 303 `/taller/ventas?hecho=sale&venta=<número>`; errores `out_of_stock` "No hay stock suficiente.", `forbidden` 403, `validation_error`/`invalid_amount` 422. Título con `SITE.name`. Objetivos ≥ 48px.
3. `ventas/index.astro` (`sales.record`): lista del día local por defecto o rango `desde`/`hasta` (≤ 31 días, si no 422 con aviso); anulación POST `action=void` con `Motivo` (solo `payments.void`) → `voidSale` → 303 `?hecho=void`, aviso `Venta anulada.`; estados con forma + texto.
4. `TallerLayout.astro`: en "Inventario y caja", `Ventas` (`/taller/ventas`, `sales.record`).

**Files**
- `src/pages/taller/ventas/index.astro` — new
- `src/pages/taller/ventas/nueva.astro` — new
- `src/layouts/TallerLayout.astro` — edit
- `e2e/venta-mostrador.spec.ts` — new

Reglas: `taller-ui.md`, `server-api.md`, `e2e.md`. No negociables 13, 17. No cambia: `global-setup.ts`, `fixtures.ts`, `playwright.config.ts`, specs existentes.

**Acceptance**

1. **WHEN** el spec `e2e/venta-mostrador.spec.ts` corre en tablet **THE SYSTEM SHALL** registrar una venta sin cliente de 2 unidades por transferencia, mostrar `Total` `$11.900` antes de registrar y `Venta VM-` con cinco dígitos y `registrada.` después, y la ficha del producto **SHALL** mostrar stock `1`
2. **WHEN** el mecánico pide `/taller/ventas/nueva` en ese spec **THE SYSTEM SHALL** responder 403
3. **WHEN** se lee `src/layouts/TallerLayout.astro` **THE SYSTEM SHALL** contener el enlace `/taller/ventas` con la acción `sales.record`

**Verify**

```bash
pnpm build && pnpm test:tablet e2e/venta-mostrador.spec.ts   # expect: exit 0, 0 failed
grep -q '"/taller/ventas"' src/layouts/TallerLayout.astro && grep -q '"sales.record"' src/layouts/TallerLayout.astro   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/pages/taller/ventas/index.astro src/pages/taller/ventas/nueva.astro src/layouts/TallerLayout.astro e2e/venta-mostrador.spec.ts
git commit -m "feat: f2-22 add sale pages and tablet counter sale" && git tag f2-22
git tag -l f2-22 | grep -qx f2-22   # expect: exit 0
```

### `E3-T6` — F2-23 Record Mercado Pago on order payments

**Depends on:** `E3-T5` · **Priority:** p1

1. `tests/integration/mercadopago-payments.test.ts` primero: `recordPayment` con `mercadopago`; los dos errores; `workshopIndicators` con y sin un pago `mercadopago`.
2. `payments.ts`: `paymentInputSchema` usa `RECORDABLE_PAYMENT_METHODS` y gana `externalId?` (1–100, se recorta) y `feeClp?` (entero ≥ 0; por defecto 0); `superRefine`: `mercadopago` exige `externalId`; otro método con `feeClp > 0` → error. En `insertPayment`, `mercadopago` guarda `external_id`, `fee_clp` y `net_clp = amount − fee`; los demás, como hoy. `paymentFormSchema` hereda los dos campos opcionales (la página los envía vacíos).
3. `entrega.astro`: radios de `RECORDABLE_PAYMENT_METHODS`; `fieldset` `Solo Mercado Pago` con `Id de la operación` (`name="externalId"`) y `Comisión` (`name="feeClp"`), opcionales; los campos vacíos no se envían al servidor como cadenas vacías (filtrarlos antes de `safeParse`); la tabla de pagos muestra `Comisión` solo con `costs.view`.
4. `indicators.ts` → `income`: mapear `PAYMENT_METHODS` como hoy y **agregar** la fila `mercadopago` (`Mercado Pago`) solo si su `count > 0`; el total suma todas las filas.

**Files**
- `src/server/taller/payments.ts` — edit
- `src/pages/taller/ordenes/[id]/entrega.astro` — edit
- `src/server/taller/indicators.ts` — edit
- `tests/integration/mercadopago-payments.test.ts` — new

Reglas: `taller-domain.md`, `taller-ui.md`. No negociables 17, 19. No cambia: `payments.test.ts`, `indicators.test.ts`, `indicadores-page.test.ts`, `e2e/entrega.spec.ts`.

**Acceptance**

1. **WHEN** se registra en una orden un pago `mercadopago` de 11.900 con `externalId` y comisión 450 **THE SYSTEM SHALL** guardar `external_id`, `fee_clp = 450` y `net_clp = 11450`
2. **WHEN** el pago `mercadopago` llega sin `externalId` **THE SYSTEM SHALL** devolver `ok: false` con código `validation_error` sin escribir
3. **WHEN** un pago que no es `mercadopago` trae comisión mayor que 0 **THE SYSTEM SHALL** devolver `ok: false` con código `validation_error`
4. **WHEN** `workshopIndicators` corre con un pago `mercadopago` en el rango **THE SYSTEM SHALL** agregar la fila `Mercado Pago` a `income.byMethod` y sumarlo al total, y sin pagos `mercadopago` **SHALL** devolver las cuatro filas de hoy
5. **WHEN** se lee `src/pages/taller/ordenes/[id]/entrega.astro` **THE SYSTEM SHALL** ofrecer los métodos de `RECORDABLE_PAYMENT_METHODS` y los campos `Id de la operación` y `Comisión`

**Verify**

```bash
pnpm test tests/integration/mercadopago-payments.test.ts tests/integration/payments.test.ts tests/integration/indicators.test.ts tests/integration/indicadores-page.test.ts   # expect: exit 0, 0 failed
grep -q 'RECORDABLE_PAYMENT_METHODS' 'src/pages/taller/ordenes/[id]/entrega.astro' && grep -qF 'Id de la operación' 'src/pages/taller/ordenes/[id]/entrega.astro'   # expect: exit 0
test "$(wc -l < src/server/taller/payments.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0 (incluye e2e/entrega.spec.ts sin cambios)
```

**Checkpoint**

```bash
git add -- src/server/taller/payments.ts 'src/pages/taller/ordenes/[id]/entrega.astro' src/server/taller/indicators.ts tests/integration/mercadopago-payments.test.ts
git commit -m "feat: f2-23 record mercado pago on order payments" && git tag f2-23
git tag -l f2-23 | grep -qx f2-23   # expect: exit 0
```

### `E3-T7` — F2-24 Prepare publication window V2

**Depends on:** `E3-T6` · **Priority:** p0

1. Localizar las tres migraciones: `grep -lE 'CREATE TABLE ("public"\.)?"sales"' drizzle/*.sql`, `grep -l 'ADD COLUMN "sale_id"' drizzle/*.sql`, `grep -l 'DROP CONSTRAINT "payments_method_check"' drizzle/*.sql`.
2. `docs/ventanas/f2-v2.md` con: `## Qué trae` (ventas, pagos de ventas, Mercado Pago como registro; tag `f2-24`), `## Migraciones` (los tres nombres y qué hace cada una; la tercera es la **única** no aditiva de la fase), `## Precondiciones` (taller cerrado, respaldo del día, V1 publicada, gate verde), `## Pasos en Replit` (los de BITACORA §2 con `corepack pnpm@12.4.2`; aviso: Replit puede mostrar el reemplazo de `payments_method_check` como cambio "destructivo" — se acepta solo ese), `## Verificación después de publicar` (panel *Database*, solo lectura: `select count(*) from sales;` responde; `select pg_get_constraintdef(oid) from pg_constraint where conname = 'payments_method_check';` incluye `mercadopago`; abrir `/taller/ventas`), `## Reversión` (republicar el anterior; el CHECK nuevo admite todo lo anterior).

**Files**
- `docs/ventanas/f2-v2.md` — new

Reglas: `database.md`. No negociable 2.

**Acceptance**

1. **WHEN** `pnpm db:migrate` y `pnpm db:check` corren sobre la base dev **THE SYSTEM SHALL** salir 0 con `sales` y `sale_items` presentes
2. **WHEN** se revisan las tres migraciones de la ventana V2 **THE SYSTEM SHALL** encontrar la de `CREATE TABLE` de `sales` y la que agrega `sale_id` sin `DROP CONSTRAINT`, `DROP TABLE`, `DROP COLUMN` ni `RENAME`, y la del CHECK de método como la única con `DROP CONSTRAINT`
3. **WHEN** se lee `docs/ventanas/f2-v2.md` **THE SYSTEM SHALL** contener `## Precondiciones`, `## Pasos en Replit` y `## Verificación después de publicar`, y los nombres de las tres migraciones
4. **WHEN** corre `pnpm gate` **THE SYSTEM SHALL** salir 0

**Verify**

```bash
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
f="$(grep -lE 'CREATE TABLE ("public"\.)?"sales"' drizzle/*.sql)"; test -f "$f" && { grep -Eq 'DROP (TABLE|COLUMN|CONSTRAINT)|RENAME' "$f"; test $? -eq 1; } && grep -qF "$(basename "$f")" docs/ventanas/f2-v2.md   # expect: exit 0
f="$(grep -l 'ADD COLUMN "sale_id"' drizzle/*.sql)"; test -f "$f" && { grep -Eq 'DROP (TABLE|COLUMN|CONSTRAINT)|RENAME' "$f"; test $? -eq 1; } && grep -qF "$(basename "$f")" docs/ventanas/f2-v2.md   # expect: exit 0
f="$(grep -l 'DROP CONSTRAINT "payments_method_check"' drizzle/*.sql)"; test -f "$f" && grep -qF 'ADD CONSTRAINT "payments_method_check"' "$f" && grep -qF "$(basename "$f")" docs/ventanas/f2-v2.md   # expect: exit 0 — una sola migración la quita y la vuelve a crear
grep -qF '## Precondiciones' docs/ventanas/f2-v2.md && grep -qF '## Pasos en Replit' docs/ventanas/f2-v2.md && grep -qF '## Verificación después de publicar' docs/ventanas/f2-v2.md   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- docs/ventanas/f2-v2.md
git commit -m "docs: f2-24 prepare publication window v2" && git tag f2-24
git tag -l f2-24 | grep -qx f2-24   # expect: exit 0
git ls-files --error-unmatch docs/ventanas/f2-v2.md   # expect: exit 0
```
