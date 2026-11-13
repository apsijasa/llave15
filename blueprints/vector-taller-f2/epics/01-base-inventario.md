# Epic 01: Base e inventario

> Después de esta épica `payments` y `bike_components` viven en `schema-payments.ts`, existen las siete acciones nuevas, las tablas de inventario y las columnas de precio (ventana V1), el único punto que cambia stock (`applyStockMovement`), productos con ficha y ajustes en tablet, la alerta de stock bajo, la importación inicial por CSV y las compras a proveedores que suman stock con costo promedio.

| | |
|---|---|
| **Epic id** | `01-base-inventario` |
| **Tasks** | `E1-T1` … `E1-T9` (pasos F2-00 … F2-08) |
| **Depends on** | nada — es la primera (precondición: fase plataforma en `main`) |
| **Unlocks** | `02-precios-netos` |
| **Parallel with** | ninguna |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Astro 7 SSR · TypeScript 6 · Postgres 16 · Drizzle ORM 0.45 · zod 4 · luxon · Vitest + PGlite · Playwright (tablet 820×1180). `pnpm` 12.4.2; Node 24; versiones en `pnpm-lock.yaml`. Ninguna dependencia nueva.

| Task | Command |
|---|---|
| Formatear | `pnpm format` |
| Test (un archivo) | `pnpm test tests/integration/<archivo>.test.ts` |
| Migraciones (solo base dev) | `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:check` |
| Tablet | `pnpm build && pnpm test:tablet e2e/<archivo>.spec.ts` |
| Compuerta | `pnpm gate` |

**Gate:** `pnpm format && pnpm gate`. Servicio: Postgres local (`vector_bikes`, `vector_bikes_e2e`, con el rol que fija `.env`). El sandbox de Codex corre solo `format`, `check`, `test`, `build`; `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la sesión coordinadora, que también commitea. Reversión: `git reset --hard f2-<anterior>` y, si hace falta, el reinicio de la base dev de `blueprint.md` §12 (lo aprueba el operador).

**Reglas transversales de cada tarea:** pruebas primero, en rojo; ≤ 5 archivos (salvo E1-T1); **releer cada archivo antes de tocarlo** (la fase plataforma lo cambió después de escribir esto; los conteos de líneas son orientativos y el criterio es "< 400" sobre el archivo real); **ningún texto para el usuario, correo, título ni página escribe el nombre del taller literal** — se usa `SITE.name` o el perfil del taller; nunca editar `drizzle/`; `db:migrate` solo en la base dev; nada se borra; dinero en pesos enteros; `branch_id` NOT NULL; `recordAudit` dentro de la transacción; correos después del commit; `db` y `now` como argumentos (nunca `new Date()` en `src/server/**`); zod en toda entrada; páginas `requireAdmin → can → zod → src/server/taller/**` con `isAllowedOrigin` en los POST.

**Cobertura de tablet:** E1-T5 tiene `e2e/inventario-ajuste.spec.ts` (ajuste de stock, FASE2 §8). Proveedores y compras son de escritorio (prueba con Container API).

## Directory subtree

```
src/server/db/schema-payments.ts          # NEW (E1-T1): payments, bikeComponents, paymentTables
src/server/db/schema-orders.ts            # edit (E1-T1 quita dos tablas; E1-T3 agrega columnas)
src/server/db/schema-inventory.ts         # NEW (E1-T3): 5 tablas, inventoryTables
src/server/db/schema.ts                   # edit (E1-T3): branches
scripts/db-check.ts                       # edit (E1-T1, E1-T3)
src/server/auth/permissions.ts            # edit (E1-T2)
src/server/taller/stock.ts · products.ts  # NEW (E1-T4)
src/server/taller/rules.ts · audit.ts     # edit (E1-T4, E1-T8)
src/server/taller/low-stock.ts            # NEW (E1-T6) · maintenance.ts edit
src/server/taller/inventory-import.ts     # NEW (E1-T7) · scripts/inventory-import.ts NEW · package.json edit
src/server/taller/suppliers.ts · purchases.ts   # NEW (E1-T8)
src/components/taller/LowStockNotice.astro       # NEW (E1-T6)
src/pages/taller/inventario/{index,nuevo,[id]}.astro   # NEW (E1-T5)
src/pages/taller/proveedores/index.astro · compras/{index,[id]}.astro   # NEW (E1-T9)
src/pages/taller/index.astro · src/layouts/TallerLayout.astro   # edit
e2e/inventario-ajuste.spec.ts             # NEW (E1-T5)
tests/unit/permissions.test.ts            # edit autorizado (E1-T2)
tests/integration/{inventory-schema,products,low-stock,inventory-import,purchases,compras-page}.test.ts   # NEW
tests/integration/{payments,dashboard,dashboard-finance,indicators,indicadores-page,components}.test.ts   # solo imports (E1-T1)
```

## Data model touched here

**B** = `branch_id uuid not null → branches restrict` · **V** = `voided_at` + `voided_by → users` · **CB** = `created_by uuid not null → users`. Restricciones con prefijo de tabla (`products_stock_qty_check`).

| Entity | Campos | Notas |
|---|---|---|
| `branches` (E1-T3) | + `next_purchase_number integer not null default 1` (`>= 1`), `new_order_pricing_mode text not null default 'final'` (`in ('final','neto')`) | en `schema.ts` |
| `suppliers` (E1-T3) | B, `name not null`, `rut`, `phone`, `email`, `notes`, `is_active boolean not null default true` | único `(branch_id, rut) where rut is not null`; índice `(branch_id, name)` |
| `products` (E1-T3) | B, `sku not null`, `name not null`, `category not null`, `unit not null default 'unidad'`, `cost_clp not null default 0`, `price_clp not null`, `stock_qty not null default 0`, `min_stock not null default 0`, `barcode`, `serial_number`, `supplier_id → suppliers`, `is_active default true`, CB | únicos `(branch_id, sku)`, `(branch_id, barcode) where barcode is not null`; CHECK `stock_qty >= 0`, `cost_clp >= 0 and price_clp >= 0 and min_stock >= 0`, `category in ('repuesto','accesorio','insumo','bicicleta_usada')`, `category <> 'bicicleta_usada' or serial_number is not null`; índice `(branch_id, category)` |
| `stock_movements` (E1-T3) | B, `product_id → products`, `kind`, `quantity integer not null`, `unit_cost_clp`, `reference_kind`, `reference_id uuid`, `note`, CB | CHECK `kind in ('compra','venta','consumo_orden','ajuste','devolucion','anulacion')`; `quantity <> 0`; signo `(kind in ('compra','devolucion') and quantity > 0) or (kind in ('venta','consumo_orden') and quantity < 0) or kind in ('ajuste','anulacion')`; `unit_cost_clp is null or unit_cost_clp >= 0`; `reference_kind is null or reference_kind in ('purchase_order','work_order_item','sale','sale_refund','import')`; `(reference_kind is null) = (reference_id is null)`; `kind <> 'ajuste' or note is not null`; índice `(product_id, created_at)`. Sin V |
| `purchase_orders` (E1-T3) | B, `supplier_id → suppliers not null`, `number not null`, `status not null default 'borrador'`, `doc_type`, `doc_number`, `notes`, `received_at`, `received_by → users`, V, CB | único `(branch_id, number)`; CHECK `number >= 1`, `status in ('borrador','enviada','recibida','anulada')`, `doc_type is null or doc_type in ('factura','boleta','guia')`, `status <> 'recibida' or (received_at is not null and received_by is not null)`, `(status = 'anulada') = (voided_at is not null)` |
| `purchase_order_items` (E1-T3) | B, `purchase_order_id → purchase_orders`, `product_id → products`, `quantity not null`, `unit_cost_clp not null`, `received_qty not null default 0` | CHECK `quantity > 0`, `unit_cost_clp >= 0`, `received_qty between 0 and quantity`; índice `(purchase_order_id)` |
| `work_orders` (E1-T3) | + `pricing_mode text not null default 'final'`, `subtotal_clp integer not null default 0`, `vat_clp integer not null default 0` | CHECK `pricing_mode in ('final','neto')`, `subtotal_clp >= 0 and vat_clp >= 0`, **`work_orders_pricing_total_check`: `pricing_mode = 'final' or total_clp = subtotal_clp + vat_clp`** |
| `work_order_items` (E1-T3) | + `product_id uuid → products` (null), `unit_cost_clp integer` (null) | CHECK `unit_cost_clp is null or unit_cost_clp >= 0`, `product_id is null or (kind = 'repuesto' and unit_cost_clp is not null)` |
| `payments`, `bike_components` (E1-T1) | sin cambios de columnas | solo cambian de archivo |

`schema-inventory.ts` importa solo de `schema.ts`; `schema-orders.ts` importa `products` de `schema-inventory.ts`. Cadena final: `schema.ts ← schema-taller.ts ← schema-inventory.ts ← schema-orders.ts ← schema-reports.ts ← schema-cash.ts ← schema-sales.ts ← schema-payments.ts`.

## Contracts

**Consumed:** `SessionUser`, `requireAdmin`, `loginRedirect`, `SESSION_COOKIE` · `can`, `forbiddenResponse` · `isAllowedOrigin` · `recordAudit`, `redactDetails` · `getDb`, `AppDb`, `isUniqueViolation` · `normalizeRut` (`src/lib/rut.ts`) · `formatClp` (`email/templates.ts`) · `getDbEnv` · `localToday` · `SITE` (perfil del taller) · `sendOverdueDigest` (`maintenance.ts`).

**Produced:**

| Export | Signature |
|---|---|
| `schema-payments.ts` → `payments`, `bikeComponents`, `paymentTables` | tablas Drizzle |
| `schema-inventory.ts` → `suppliers`, `products`, `stockMovements`, `purchaseOrders`, `purchaseOrderItems`, `inventoryTables` | tablas Drizzle |
| `stock.ts` → `applyStockMovement` | `(db, actor, { productId, kind, quantity, unitCostClp?, referenceKind?, referenceId?, note? }, now)` → `{ ok: true, movementId, stockQty, costClp } \| { ok: false, code: "not_found" \| "out_of_stock" }` (recibe la transacción) |
| `products.ts` → `productFormSchema`, `createProduct`, `updateProduct`, `listProducts`, `getProduct`, `adjustStock` | `(db, actor, …, now)` → `{ ok, … }`; listas sin `costClp`/`unitCostClp` si no hay `costs.view` |
| `low-stock.ts` → `lowStockProducts`, `branchLowStock` | `lowStockProducts(db)` → filas de todas las sucursales; `branchLowStock(db, actor)` → filas \| `null` |
| `inventory-import.ts` → `parseInventoryCsv`, `importInventory` | `importInventory(db, email, text, now, { dryRun })` → `{ ok: true, created \| valid } \| { ok: false, code, errors?: { line, message }[] }` |
| `suppliers.ts` → `supplierFormSchema`, `createSupplier`, `updateSupplier`, `listSuppliers` | `(db, actor, …, now)` |
| `purchases.ts` → `createPurchase`, `addPurchaseItem`, `sendPurchase`, `receivePurchase`, `voidPurchase`, `listPurchases`, `getPurchase`, `formatPurchaseNumber` | `formatPurchaseNumber(1)` → `OC-00001` |

**Acciones de auditoría nuevas** (E1-T4 las agrega todas a `AuditAction`, en este orden; son 21): `product.created`, `product.updated`, `stock.adjusted`, `inventory.imported`, `supplier.created`, `supplier.updated`, `purchase.created`, `purchase.item_added`, `purchase.sent`, `purchase.received`, `purchase.voided`, `pricing.mode_changed`, `sale.created`, `sale.discounted`, `sale.voided`, `cash.control_changed`, `cash.opened`, `cash.closed`, `cash.refund`, `expense.recorded`, `expense.voided`. Los pagos de ventas reutilizan `payment.recorded` y `payment.voided` con `entity: "sale"`.

## Rótulos que usan los specs (literales; F2-22 y F2-31 dependen de ellos)

| Página | Rótulos |
|---|---|
| `/taller/inventario` | `h1` `Inventario`; enlace `Nuevo producto` (solo `inventory.adjust`); filtros `Buscar` (SKU, nombre o código de barras), `Categoría`, casilla `Solo bajo mínimo` (`name="bajo" value="1"`), botón `Filtrar`; tabla con columnas `SKU`, `Nombre`, `Categoría`, `Stock`, `Mínimo`, `Precio neto`, `Costo` (solo `costs.view`), `Estado`; estado `Bajo mínimo` (`span.status.status--bajo`), `Sin stock` (`status--sin-stock`) u `OK` |
| `/taller/inventario/nuevo` | `SKU`, `Nombre`, `Categoría` (select con `Repuesto`, `Accesorio`, `Insumo`, `Bicicleta usada`), `Unidad`, `Costo neto`, `Precio neto`, `Stock inicial`, `Stock mínimo`, `Código de barras`, `Número de serie`, `Proveedor`; botón `Crear producto`; 303 a `/taller/inventario/<id>?hecho=create`, aviso `Producto creado.` |
| `/taller/inventario/[id]` | `<dl class="data">` con `Stock`, `Mínimo`, `Precio neto`, `Costo neto` (solo `costs.view`); formulario de ajuste `Cantidad` (ayuda: "negativa para descontar"), `Motivo`, botón `Registrar ajuste`, aviso `Stock ajustado.`; tabla `Movimientos` (`Fecha`, `Tipo`, `Cantidad` con signo `+5`/`-1`, `Referencia`, `Nota`, `Usuario`) |

## Conventions that bite in this area

- El stock **solo** cambia con `applyStockMovement`; nunca `update products set stock_qty` en otro lado. Sin `FOR UPDATE` concurrente en PGlite: las pruebas de "dos consumos" van en secuencia + el CHECK.
- Devolver `{ ok: false }` dentro de `db.transaction` **no** revierte: si algo falla después de escribir, lanzar un error centinela y traducirlo fuera.
- Costos: la clave no viaja sin `costs.view` (omitirla, no ponerla en `null`).
- El resumen diario solo cambia cuando hay productos bajo mínimo: sin ellos, respuesta y correo idénticos a hoy.
- El CSV del dueño vive fuera del repo (lleva costos).

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/database.md`, `taller-domain.md`, `taller-ui.md`, `server-api.md`, `e2e.md`.

---

## Tasks

### `E1-T1` — F2-00 Split payments and components out of schema-orders

**Depends on:** — · **Priority:** p0

0. Precondición: `git cat-file -e main:blueprints/vector-plataforma/FASE-PLATAFORMA.md` sale 0 y el árbol está limpio. Si no, detenerse.
1. Crear `src/server/db/schema-payments.ts`: mover **tal cual** `payments` y `bikeComponents` desde `schema-orders.ts` (columnas, `$type`, defaults, índices `uq_payments_one_abono`, `idx_payments_branch_received`, `idx_bike_components_*`, CHECK `payments_*` y `bike_components_*`), con sus propias copias de `branchReference()` y `creatorReference()`; importa `workOrders`, `workOrderItems` de `./schema-orders.ts`, `bikes` de `./schema-taller.ts`, el resto de `./schema.ts`. `export const paymentTables = [payments, bikeComponents] as const;`.
2. `schema-orders.ts`: quitar las dos tablas, sus importaciones que queden sin uso y sacarlas de `orderTables`.
3. `scripts/db-check.ts`: importar `paymentTables` y agregarlo al recorrido de columnas.
4. Reapuntar importadores: `grep -rn "schema-orders.ts" src scripts tests e2e` y, en cada archivo que importa `payments` o `bikeComponents`, separar esa importación hacia `schema-payments.ts`. Al generar se encontraron `src/server/taller/{payments,history,components,reports,dashboard,indicators}.ts` y `tests/integration/{payments,dashboard,dashboard-finance,indicators,indicadores-page,components}.test.ts`; si el grep encuentra otro (por ejemplo una página `.astro` agregada por la fase plataforma), se incluye y se anota en el reporte. En las pruebas, **solo** líneas de import (decisión 55).
5. `pnpm db:generate` debe decir que no hay cambios y no crear archivo.

**Files**
- `src/server/db/schema-orders.ts` — edit
- `src/server/db/schema-payments.ts` — new
- `scripts/db-check.ts` — edit
- `src/server/taller/payments.ts`, `history.ts`, `components.ts`, `reports.ts`, `dashboard.ts`, `indicators.ts` — edit (imports)
- `tests/integration/payments.test.ts`, `dashboard.test.ts`, `dashboard-finance.test.ts`, `indicators.test.ts`, `indicadores-page.test.ts`, `components.test.ts` — edit (solo imports)

Única excepción declarada al límite de 5 archivos (F2-D2). Reglas: `database.md`. No cambia: nombres de tabla/columna ni aserciones.

**Acceptance**

1. **WHEN** la tarea 0 empieza **THE SYSTEM SHALL** tener en la rama `main` el archivo `blueprints/vector-plataforma/FASE-PLATAFORMA.md` (la fase plataforma está integrada)
2. **WHEN** `pnpm db:generate` corre después del cambio **THE SYSTEM SHALL** no crear ni modificar ningún archivo en `drizzle/`
3. **WHEN** se busca la definición de `payments` y de `bikeComponents` **THE SYSTEM SHALL** encontrarlas solo en `src/server/db/schema-payments.ts`, con las tablas `payments` y `bike_components`, sus columnas, índices y CHECK sin cambios
4. **WHEN** `pnpm db:check` corre **THE SYSTEM SHALL** revisar las columnas de `allTables`, `tallerTables`, `orderTables`, `reportTables` y `paymentTables` y salir 0
5. **WHEN** se compara `tests/` con el commit anterior **THE SYSTEM SHALL** mostrar cambios solo en líneas de import de `payments.test.ts`, `dashboard.test.ts`, `dashboard-finance.test.ts`, `indicators.test.ts`, `indicadores-page.test.ts` y `components.test.ts`
6. **WHEN** corre `pnpm test` **THE SYSTEM SHALL** pasar con 0 fallas y `src/server/db/schema-orders.ts` **SHALL** tener menos de 400 líneas

**Verify**

```bash
git cat-file -e main:blueprints/vector-plataforma/FASE-PLATAFORMA.md   # expect: exit 0 — la fase plataforma ya está en main
pnpm db:generate   # expect: exit 0, sin migración nueva
test -z "$(git status --porcelain -- drizzle)"   # expect: exit 0 — la tarea 0 no crea ni cambia nada en drizzle/
grep -q 'export const payments = pgTable' src/server/db/schema-payments.ts && grep -q 'export const bikeComponents = pgTable' src/server/db/schema-payments.ts   # expect: exit 0
grep -Eq 'export const (payments|bikeComponents) = pgTable' src/server/db/schema-orders.ts; test $? -eq 1   # expect: 1 = ya no están en schema-orders.ts → la línea sale 0
test "$(wc -l < src/server/db/schema-orders.ts | tr -d ' ')" -lt 400   # expect: exit 0
test -z "$(git diff -U0 -- tests | grep -E '^[+-][^+-]' | grep -Ev '^[+-](import |\} from |  [A-Za-z]+,$)')"   # expect: exit 0 — en tests/ solo cambian líneas de import
pnpm test tests/integration/payments.test.ts tests/integration/components.test.ts tests/integration/dashboard.test.ts tests/integration/dashboard-finance.test.ts tests/integration/indicators.test.ts tests/integration/indicadores-page.test.ts   # expect: exit 0, 0 failed
pnpm db:check   # expect: exit 0, {"ok":true,...}
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -A && git commit -m "refactor: f2-00 move payments and components to schema-payments" && git tag f2-00
git tag -l f2-00 | grep -qx f2-00   # expect: exit 0
```

### `E1-T2` — F2-01 Add the seven phase-2 permissions

**Depends on:** `E1-T1` · **Priority:** p0

1. `src/server/auth/permissions.ts`: agregar al final de `ACTIONS` `inventory.view`, `inventory.adjust`, `purchases.manage`, `sales.record`, `expenses.record`, `cash.open_close`, `costs.view`; en `permissions`: `inventory.view: ROLES`, `sales.record: staff`, `cash.open_close: staff`, `inventory.adjust`, `purchases.manage`, `expenses.record`, `costs.view: administrators`.
2. `tests/unit/permissions.test.ts` (edición autorizada por la decisión 55): `29` → `36` en el nombre y las dos aserciones; agregar las acciones a las listas `admin` (las siete), `reception` (`inventory.view`, `sales.record`, `cash.open_close`) y `mechanic` (`inventory.view`). Nada más.

**Files**
- `src/server/auth/permissions.ts` — edit
- `tests/unit/permissions.test.ts` — edit (autorizado)

Reglas: `server-api.md`. No cambia: ninguna acción existente ni sus roles.

**Acceptance**

1. **WHEN** se lee `ACTIONS` **THE SYSTEM SHALL** exponer 36 acciones sin duplicados: las 29 de la fase 1 más `inventory.view`, `inventory.adjust`, `purchases.manage`, `sales.record`, `expenses.record`, `cash.open_close` y `costs.view`
2. **WHEN** se evalúa `can(role, "inventory.view")` **THE SYSTEM SHALL** devolver `true` para `owner`, `admin`, `reception` y `mechanic`
3. **WHEN** se evalúan `sales.record` y `cash.open_close` **THE SYSTEM SHALL** devolver `true` para `owner`, `admin` y `reception`, y `false` para `mechanic`
4. **WHEN** se evalúan `inventory.adjust`, `purchases.manage`, `expenses.record` y `costs.view` **THE SYSTEM SHALL** devolver `true` solo para `owner` y `admin`
5. **WHEN** se evalúa cualquiera de las 29 acciones de la fase 1 **THE SYSTEM SHALL** devolver lo mismo que antes del cambio

**Verify**

```bash
pnpm test tests/unit/permissions.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -A && git commit -m "feat: f2-01 add phase 2 permissions" && git tag f2-01
git tag -l f2-01 | grep -qx f2-01   # expect: exit 0
```

### `E1-T3` — F2-02 Add inventory tables and pricing columns

**Depends on:** `E1-T2` · **Priority:** p0

Confirmación previa del operador (no es compuerta): respaldos de la base de Replit activos.

1. `tests/integration/inventory-schema.test.ts` primero: con `createTestDb()` inserta sucursal, usuario, órdenes y productos; verifica defaults, cada CHECK (`23514`) y único (`23505`) de la tabla de arriba.
2. `src/server/db/schema-inventory.ts` (nuevo): las cinco tablas exactamente como en "Data model" (el ejemplo de `products` de `blueprint.md` §4 es el patrón), `inventoryTables = [suppliers, products, stockMovements, purchaseOrders, purchaseOrderItems] as const`; tipos `ProductCategory`, `StockMovementKind`.
3. `schema.ts`: las dos columnas de `branches` y sus CHECK.
4. `schema-orders.ts`: columnas de `work_orders` y `work_order_items` y sus CHECK; importa `products` de `./schema-inventory.ts`.
5. `scripts/db-check.ts`: recorre también `inventoryTables`.
6. `pnpm db:generate` (si pregunta algo, detenerse) → pruebas → `pnpm db:migrate` → `pnpm db:check`.

**Files**
- `src/server/db/schema-inventory.ts` — new
- `src/server/db/schema.ts` — edit
- `src/server/db/schema-orders.ts` — edit
- `scripts/db-check.ts` — edit
- `tests/integration/inventory-schema.test.ts` — new

Reglas: `database.md`. No cambia: columnas y CHECK existentes; `foundation.test.ts` sin cambios (solo recorre `allTables`).

**Acceptance**

1. **WHEN** `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` **THE SYSTEM SHALL** crear `products`, `stock_movements`, `suppliers`, `purchase_orders` y `purchase_order_items` y agregar `branches.next_purchase_number`, `branches.new_order_pricing_mode`, `work_orders.pricing_mode`, `work_orders.subtotal_clp`, `work_orders.vat_clp`, `work_order_items.product_id` y `work_order_items.unit_cost_clp`, sin borrar ni renombrar nada
2. **WHEN** se inserta una sucursal o una orden sin las columnas nuevas **THE SYSTEM SHALL** guardar `new_order_pricing_mode = 'final'`, `pricing_mode = 'final'`, `subtotal_clp = 0` y `vat_clp = 0`
3. **WHEN** se guarda una orden `neto` con `total_clp` distinto de `subtotal_clp + vat_clp` **THE SYSTEM SHALL** rechazarla con código `23514`, y una orden `final` con cualquier total **SHALL** aceptarse
4. **WHEN** se guarda un producto con `stock_qty` negativo, con `category` fuera de `repuesto`, `accesorio`, `insumo` y `bicicleta_usada`, o una `bicicleta_usada` sin `serial_number` **THE SYSTEM SHALL** rechazarlo con código `23514`
5. **WHEN** se insertan dos productos con el mismo `sku`, o con el mismo `barcode` no nulo, en una sucursal **THE SYSTEM SHALL** rechazar el segundo con código `23505`, y **SHALL** aceptar dos productos con `barcode` nulo
6. **WHEN** `pnpm db:check` corre **THE SYSTEM SHALL** revisar también las columnas de `inventoryTables` y salir 0

**Verify**

```bash
pnpm test tests/integration/inventory-schema.test.ts tests/integration/foundation.test.ts   # expect: exit 0, 0 failed
f="$(ls drizzle/*.sql | sort | tail -1)"; grep -Eq 'DROP (TABLE|COLUMN|CONSTRAINT)|RENAME' "$f"; test $? -eq 1   # expect: 1 = la migración nueva no borra ni renombra → la línea sale 0
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
test "$(wc -l < src/server/db/schema-orders.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -A && git commit -m "feat: f2-02 add inventory tables and pricing columns" && git tag f2-02
git tag -l f2-02 | grep -qx f2-02   # expect: exit 0
```

### `E1-T4` — F2-03 Add stock movements and product server

**Depends on:** `E1-T3` · **Priority:** p0

1. `tests/integration/products.test.ts` primero: los seis criterios, con usuarios de los cuatro roles en una sucursal.
2. `rules.ts`: `PRODUCT_CATEGORIES = ["repuesto","accesorio","insumo","bicicleta_usada"] as const` + `PRODUCT_CATEGORY_LABELS` (`Repuesto`, `Accesorio`, `Insumo`, `Bicicleta usada`); `STOCK_MOVEMENT_KINDS` + `STOCK_MOVEMENT_LABELS` (`Compra`, `Venta`, `Consumo en orden`, `Ajuste`, `Devolución`, `Anulación`).
3. `audit.ts`: agregar a `AuditAction` las 21 acciones de "Contracts", en ese orden.
4. `stock.ts`: `applyStockMovement(db, actor, input, now)`: `select … from products where branch_id = actor.branchId and id = productId for update`; sin fila → `not_found`; `stock_qty + quantity < 0` → `out_of_stock`; en `compra`, nuevo costo = `stock_qty > 0 ? Math.round((stock_qty * cost_clp + quantity * unitCostClp) / (stock_qty + quantity)) : unitCostClp`; insertar el movimiento (CB = `actor.id`) y actualizar `stock_qty` (y `cost_clp`) con `updated_at = now`; un `23514` de `products_stock_qty_check` también devuelve `out_of_stock`. No abre transacción: la recibe.
5. `products.ts`: `productFormSchema` (SKU 1–40 sin espacios, nombre 2–120, categoría, unidad 1–20 por defecto `unidad`, costo y precio enteros 0–10.000.000, stock inicial 0–100.000, mínimo 0–100.000, código ≤ 64 opcional, serie ≤ 80 opcional, proveedor uuid opcional; serie obligatoria si `bicicleta_usada`). `createProduct` (`inventory.adjust`; `sku_exists` ante `23505`; stock inicial > 0 → `applyStockMovement(ajuste, nota "Stock inicial")`; audit `product.created`). `updateProduct` (`inventory.adjust`; no toca stock; audit `product.updated` con antes/después de precio y costo). `listProducts(db, actor, { q?, category?, lowOnly? })` (`inventory.view`; `q` busca en SKU, nombre y código de barras, sin distinguir mayúsculas; máximo 300; `lowOnly` = activos con `min_stock > 0 and stock_qty <= min_stock`). `getProduct(db, actor, id)` → producto + últimos 50 movimientos con nombre del usuario. `adjustStock(db, actor, id, { quantity: entero ≠ 0 entre −100.000 y 100.000, reason: 3–200 }, now)` (`inventory.adjust`; una transacción; audit `stock.adjusted` con `productId`, `quantity`, `reason`). Sin `costs.view`, quitar `costClp` de cada producto y `unitCostClp` de cada movimiento.

**Files**
- `src/server/taller/stock.ts` — new
- `src/server/taller/products.ts` — new
- `src/server/taller/rules.ts` — edit
- `src/server/taller/audit.ts` — edit
- `tests/integration/products.test.ts` — new

Reglas: `taller-domain.md`. No negociables 9, 14, 16, 17. No cambia: acciones de auditoría existentes.

**Acceptance**

1. **WHEN** `adjustStock` registra +5 con motivo sobre un producto con stock 0 **THE SYSTEM SHALL** dejar `stock_qty = 5`, un `stock_movements` `ajuste` con `quantity = 5` y el motivo, y una fila `stock.adjusted` en `audit_log` con el usuario
2. **WHEN** dos consumos de 1 unidad se aplican en secuencia sobre un producto con `stock_qty = 1` **THE SYSTEM SHALL** aceptar el primero y devolver `ok: false` con código `out_of_stock` en el segundo, dejando `stock_qty = 0` y un solo movimiento de consumo
3. **WHEN** un `update` directo intenta dejar `stock_qty = -1` **THE SYSTEM SHALL** fallar con código `23514`
4. **WHEN** `applyStockMovement` aplica una `compra` de 5 unidades a 1.300 sobre 5 unidades a costo 1.000 **THE SYSTEM SHALL** dejar `stock_qty = 10` y `cost_clp = 1150`
5. **WHEN** `listProducts` o `getProduct` corren para `mechanic` o `reception` **THE SYSTEM SHALL** devolver filas sin las claves `costClp` ni `unitCostClp`, y con ellas para `owner` y `admin`
6. **WHEN** `reception` o `mechanic` llaman `createProduct`, `updateProduct` o `adjustStock` **THE SYSTEM SHALL** devolver `ok: false` con código `forbidden` sin escribir filas

**Verify**

```bash
pnpm test tests/integration/products.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -A && git commit -m "feat: f2-03 add stock movements and product server" && git tag f2-03
git tag -l f2-03 | grep -qx f2-03   # expect: exit 0
```

### `E1-T5` — F2-04 Add inventory pages and tablet stock adjustment

**Depends on:** `E1-T4` · **Priority:** p0

1. `e2e/inventario-ajuste.spec.ts` primero (solo importa `@playwright/test` y `./fixtures.ts`; usa `login`): **test 1** "El dueño crea un producto y ajusta su stock en tablet": `login(page, "owner", "/taller/inventario/nuevo")`; llena `SKU` `E2E-AJUSTE-1`, `Nombre` `Cámara 29 E2E`, `Categoría` → `Repuesto`, `Costo neto` 1000, `Precio neto` 2000, `Stock mínimo` 2; toca `Crear producto`; espera `Producto creado.`; va a `/taller/inventario?bajo=1` y ve la fila `E2E-AJUSTE-1` con `Bajo mínimo`; vuelve a la ficha, `Cantidad` 5, `Motivo` `Conteo físico`, toca `Registrar ajuste`; espera `role=status` `Stock ajustado.` y el `dd` de `Stock` = `5`. **test 2** "El mecánico ve el inventario sin costos": `login(page, "mechanic", "/taller/inventario")`; `h1` `Inventario`; `columnheader` `Costo` con count 0; enlace `Nuevo producto` con count 0.
2. Las tres páginas con los rótulos de la tabla "Rótulos que usan los specs" (son literales: F2-22 y F2-31 dependen de ellos). Título `Inventario — ${SITE.name}` (nunca el nombre literal). `/taller/inventario` (`inventory.view`; filtros por GET; 300 filas). `/nuevo` (`inventory.adjust`; POST → `createProduct`; errores por campo con `aria-invalid`). `/[id]` (`inventory.view`; POST `action=adjust` → `adjustStock`, `action=update` → `updateProduct`, ambos solo con `inventory.adjust`; 404 si no existe). Objetivos ≥ 48px; `tabular-nums`; estados con forma + texto.
3. `TallerLayout.astro`: grupo nuevo `{ label: "Inventario y caja", links: [{ label: "Inventario", href: "/taller/inventario", action: "inventory.view" }] }` después de "Gestión".

**Files**
- `src/pages/taller/inventario/index.astro` — new
- `src/pages/taller/inventario/nuevo.astro` — new
- `src/pages/taller/inventario/[id].astro` — new
- `src/layouts/TallerLayout.astro` — edit
- `e2e/inventario-ajuste.spec.ts` — new

Reglas: `taller-ui.md`, `server-api.md`, `e2e.md`. No negociables 13, 17. No cambia: `global-setup.ts`, `fixtures.ts`, `playwright.config.ts`.

**Acceptance**

1. **WHEN** el spec `e2e/inventario-ajuste.spec.ts` corre en el viewport de tablet **THE SYSTEM SHALL** crear un producto desde `/taller/inventario/nuevo`, mostrarlo con el texto `Bajo mínimo` en `/taller/inventario?bajo=1`, registrar un ajuste de +5 con motivo y mostrar `Stock ajustado.` y stock `5` en su ficha
2. **WHEN** el mecánico abre `/taller/inventario` en ese spec **THE SYSTEM SHALL** mostrar la lista sin la columna `Costo` y sin el enlace `Nuevo producto`
3. **WHEN** se lee `src/layouts/TallerLayout.astro` **THE SYSTEM SHALL** contener el enlace `/taller/inventario` con la acción `inventory.view`

**Verify**

```bash
pnpm build && pnpm test:tablet e2e/inventario-ajuste.spec.ts   # expect: exit 0, 0 failed
grep -q '"/taller/inventario"' src/layouts/TallerLayout.astro && grep -q '"inventory.view"' src/layouts/TallerLayout.astro   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -A && git commit -m "feat: f2-04 add inventory pages and tablet stock adjustment" && git tag f2-04
git tag -l f2-04 | grep -qx f2-04   # expect: exit 0
```

### `E1-T6` — F2-05 Alert low stock on /taller and daily digest

**Depends on:** `E1-T5` · **Priority:** p1

1. `tests/integration/low-stock.test.ts` primero: usa `handleAlertsTask` (con `deps.secret` y un transporte de prueba) y `branchLowStock`.
2. `low-stock.ts`: `lowStockProducts(db)` → `{ branchId, sku, name, stockQty, minStock }[]` de todas las sucursales, activos con `min_stock > 0 and stock_qty <= min_stock`, ordenado por SKU; `branchLowStock(db, actor)` → lo mismo filtrado por sucursal si `can(actor.role, "purchases.manage")`, si no `null`.
3. `maintenance.ts` → `sendOverdueDigest`: además de `overdueOrders`, pide `lowStockProducts`. Si ambos vacíos → `{ overdue: 0, sent: false }` como hoy. Si solo hay stock bajo → asunto `` `Stock bajo mínimo: ${n} · ${SITE.name}` ``. Si hay atrasos → el asunto de hoy, intacto, y al final del cuerpo una línea `Stock bajo mínimo:` y una por producto `SKU · nombre · stock N (mínimo M)`. Devuelve `lowStock: n` **solo** si `n > 0`. Si hoy el asunto escribe el nombre del taller literal, la fase plataforma ya lo cambió a `SITE`: no tocar esa parte.
4. `LowStockNotice.astro`: props `{ items: { sku: string; name: string; stockQty: number; minStock: number; href: string }[] }`; aviso con `span.status.status--bajo` "Bajo mínimo" y lista; no importa `src/server/**`.
5. `src/pages/taller/index.astro`: si `branchLowStock` devuelve filas, mostrar el aviso arriba del dashboard (dueño y administración).

**Files**
- `src/server/taller/low-stock.ts` — new
- `src/server/taller/maintenance.ts` — edit
- `src/components/taller/LowStockNotice.astro` — new
- `src/pages/taller/index.astro` — edit
- `tests/integration/low-stock.test.ts` — new

Reglas: `taller-domain.md`, `taller-ui.md`. Regla del nombre del taller. No cambia: respuesta y correo de alertas sin productos bajo mínimo (`tasks-maintenance.test.ts`).

**Acceptance**

1. **WHEN** `/api/tareas/alertas` corre sin órdenes atrasadas ni productos bajo mínimo **THE SYSTEM SHALL** responder 200 con `ok: true`, `overdue: 0`, `sent: false` y sin la clave `lowStock`
2. **WHEN** hay 2 productos activos con `min_stock > 0` y `stock_qty <= min_stock` y ninguna orden atrasada **THE SYSTEM SHALL** enviar a `SHOP_NOTIFY_EMAIL` un correo con asunto `Stock bajo mínimo: 2 · ` seguido de `SITE.name`, y responder `ok: true`, `overdue: 0`, `sent: true`, `lowStock: 2`
3. **WHEN** hay órdenes atrasadas y productos bajo mínimo **THE SYSTEM SHALL** conservar el asunto de órdenes atrasadas que arma hoy `sendOverdueDigest` y agregar al cuerpo la línea `Stock bajo mínimo:` y una línea por producto con SKU, nombre, stock y mínimo
4. **WHEN** un producto está inactivo o tiene `min_stock = 0` **THE SYSTEM SHALL** excluirlo de la alerta
5. **WHEN** `branchLowStock` corre para `owner` o `admin` **THE SYSTEM SHALL** devolver los productos bajo mínimo de su sucursal, y `null` para `reception` y `mechanic`

**Verify**

```bash
pnpm test tests/integration/low-stock.test.ts tests/integration/tasks-maintenance.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -A && git commit -m "feat: f2-05 alert low stock on taller and daily digest" && git tag f2-05
git tag -l f2-05 | grep -qx f2-05   # expect: exit 0
```

### `E1-T7` — F2-06 Import the initial inventory from CSV

**Depends on:** `E1-T6` · **Priority:** p1

1. `tests/integration/inventory-import.test.ts` primero: CSV en strings dentro de la prueba (nunca archivos con costos en el repo).
2. `inventory-import.ts`: `parseInventoryCsv(text)` → detecta el separador por el encabezado (`,` o `;`), exige el encabezado exacto `sku,nombre,categoria,costo,precio,stock,minimo,codigo_barras,serie` (con el separador detectado), rechaza comillas dobles con un error de línea, valida cada fila con `productFormSchema` (categoría en minúsculas: `repuesto`, `accesorio`, `insumo`, `bicicleta_usada`; vacíos = nulos), SKU repetidos dentro del archivo. `importInventory(db, email, text, now, { dryRun })`: busca el usuario activo por correo con rol `owner` o `admin` (si no, `forbidden`); si hay errores o algún SKU ya existe en la sucursal → `{ ok: false, code: "validation_error", errors: [{ line, message }] }`; si `dryRun` → `{ ok: true, valid: n }`; si no, una transacción: crea cada producto y, si `stock > 0`, `applyStockMovement(ajuste, nota "Inventario inicial", referenceKind "import" + un uuid de la importación)`; audit `inventory.imported` con el conteo; `{ ok: true, created: n }`.
3. `scripts/inventory-import.ts`: lee `process.argv`; sin `<archivo.csv> <correo>` → mensaje de uso a stderr y `process.exit(2)` **antes** de importar o conectarse; lee el archivo, abre `postgres(getDbEnv().DATABASE_URL, { max: 1 })` + `drizzle`, llama `importInventory`, imprime JSON (sin correos ni costos), sale 0 si `ok`, 1 si no; `--dry-run` opcional.
4. `package.json`: solo agregar `"inventory:import": "node --env-file-if-exists=.env scripts/inventory-import.ts"` (sin tocar dependencias; no agregar `packageManager`).

**Files**
- `src/server/taller/inventory-import.ts` — new
- `scripts/inventory-import.ts` — new
- `package.json` — edit (un script)
- `tests/integration/inventory-import.test.ts` — new

Reglas: `taller-domain.md`. No negociables 4, 14. No cambia: dependencias.

**Acceptance**

1. **WHEN** `importInventory` recibe un CSV válido de 3 filas con encabezado `sku,nombre,categoria,costo,precio,stock,minimo,codigo_barras,serie` **THE SYSTEM SHALL** crear 3 productos y, por cada `stock` mayor que 0, un `stock_movements` `ajuste` con nota `Inventario inicial`, en una sola transacción
2. **WHEN** alguna fila es inválida o repite un `sku` existente **THE SYSTEM SHALL** devolver cada número de línea con su error y no escribir ninguna fila
3. **WHEN** el encabezado usa `;` como separador **THE SYSTEM SHALL** leer el archivo igual que con `,`
4. **WHEN** el correo indicado no es de un usuario activo `owner` o `admin` **THE SYSTEM SHALL** devolver `ok: false` con código `forbidden` sin escribir
5. **WHEN** `node scripts/inventory-import.ts` corre sin argumentos **THE SYSTEM SHALL** salir con código 2 y un mensaje de uso, sin conectarse a la base
6. **WHEN** se lee `package.json` **THE SYSTEM SHALL** tener el script `inventory:import` igual a `node --env-file-if-exists=.env scripts/inventory-import.ts`

**Verify**

```bash
pnpm test tests/integration/inventory-import.test.ts   # expect: exit 0, 0 failed
node scripts/inventory-import.ts; test $? -eq 2   # expect: código 2 (uso) → la línea sale 0
test "$(node -p "require('./package.json').scripts['inventory:import']")" = "node --env-file-if-exists=.env scripts/inventory-import.ts"   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -A && git commit -m "feat: f2-06 import initial inventory from csv" && git tag f2-06
git tag -l f2-06 | grep -qx f2-06   # expect: exit 0
```

### `E1-T8` — F2-07 Add suppliers and purchase orders server

**Depends on:** `E1-T7` · **Priority:** p0

1. `tests/integration/purchases.test.ts` primero: los seis criterios.
2. `rules.ts`: `PURCHASE_STATUSES` + `PURCHASE_STATUS_LABELS` (`Borrador`, `Enviada`, `Recibida`, `Anulada`); `PURCHASE_DOC_TYPES = ["factura","boleta","guia"]` + etiquetas (`Factura`, `Boleta`, `Guía de despacho`).
3. `suppliers.ts`: `supplierFormSchema` (nombre 2–120, RUT opcional normalizado con `normalizeRut` → si no normaliza, `validation_error`; teléfono ≤ 30, correo opcional, notas ≤ 500); `createSupplier`/`updateSupplier` (`purchases.manage`; `23505` del índice de RUT → `rut_exists`; audit `supplier.created`/`supplier.updated` — `redactDetails` quita teléfono y correo); `listSuppliers` (`purchases.manage`).
4. `purchases.ts`: `formatPurchaseNumber(n)` = `` `OC-${String(n).padStart(5, "0")}` ``; número con `update branches set next_purchase_number = next_purchase_number + 1 where id = $1 returning next_purchase_number - 1` (mismo manejo de PGlite/postgres-js que `allocateOrderNumber`). `createPurchase(db, actor, { supplierId, notes? }, now)` → `borrador`, audit `purchase.created`. `addPurchaseItem(db, actor, purchaseId, { productId, quantity 1–10.000, unitCostClp 0–10.000.000 }, now)` solo en `borrador` (si no, `invalid_status`), audit `purchase.item_added`. `sendPurchase` (`borrador → enviada`, audit `purchase.sent`). `receivePurchase(db, actor, purchaseId, { docType?, docNumber? }, now)`: bloquea la compra (`for update`), exige `borrador` o `enviada` con al menos una línea, por línea `applyStockMovement(compra, +quantity, unitCostClp, referenceKind "purchase_order", referenceId purchaseId)` y `received_qty = quantity`; `recibida`, `received_at`, `received_by`; audit `purchase.received`. `voidPurchase(db, actor, id, { reason 3–200 }, now)` solo `borrador`/`enviada` → `anulada` + V, audit `purchase.voided`; una `recibida` devuelve `invalid_status` (se corrige con un ajuste). `listPurchases`, `getPurchase` (líneas con producto; costos solo con `costs.view`). Todas exigen `purchases.manage`.

**Files**
- `src/server/taller/suppliers.ts` — new
- `src/server/taller/purchases.ts` — new
- `src/server/taller/rules.ts` — edit
- `tests/integration/purchases.test.ts` — new

Reglas: `taller-domain.md`. No negociables 9, 14, 16, 17. No cambia: `normalizeRut`.

**Acceptance**

1. **WHEN** se recibe una compra `enviada` de 5 unidades de un producto nuevo a 1.000 **THE SYSTEM SHALL** dejar el producto con `stock_qty = 5` y `cost_clp = 1000`, un movimiento `compra` de +5 con `reference_kind = 'purchase_order'`, y la compra `recibida` con `received_at` y `received_by`
2. **WHEN** una segunda compra de 5 unidades a 1.300 se recibe **THE SYSTEM SHALL** dejar `stock_qty = 10` y `cost_clp = 1150`
3. **WHEN** se agrega una línea a una compra que no está en `borrador`, o se recibe o anula una compra `recibida` **THE SYSTEM SHALL** devolver `ok: false` con código `invalid_status` sin cambiar filas
4. **WHEN** se crean dos compras en una sucursal **THE SYSTEM SHALL** numerarlas desde `branches.next_purchase_number` y mostrarlas como `OC-00001` y `OC-00002`
5. **WHEN** `reception` o `mechanic` llaman una función que escribe proveedores o compras **THE SYSTEM SHALL** devolver `ok: false` con código `forbidden`
6. **WHEN** se crea un proveedor con un RUT inválido, o con un RUT que ya existe en la sucursal **THE SYSTEM SHALL** devolver el código `validation_error` o `rut_exists`

**Verify**

```bash
pnpm test tests/integration/purchases.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -A && git commit -m "feat: f2-07 add suppliers and purchase orders server" && git tag f2-07
git tag -l f2-07 | grep -qx f2-07   # expect: exit 0
```

### `E1-T9` — F2-08 Add supplier and purchase pages

**Depends on:** `E1-T8` · **Priority:** p1

1. `tests/integration/compras-page.test.ts` primero, con el patrón de `tests/integration/indicadores-page.test.ts` (Container API, `vi.mock` de `getDb`, `loginAdmin`, cookie `vb_admin_session`; POST con `content-type: application/x-www-form-urlencoded` y `Origin` del sitio; uno con `Origin` ajeno → 403).
2. `/taller/proveedores`: lista + formulario `Nombre`, `RUT`, `Teléfono`, `Correo`, `Notas`, botón `Guardar proveedor`; edición en línea.
3. `/taller/compras`: lista (`OC-00001`, proveedor, estado con forma + texto, total a costo) + formulario `Proveedor` (select) y `Notas`, botón `Nueva compra` → 303 a `/taller/compras/<id>`.
4. `/taller/compras/[id]`: líneas, formulario `Producto`/`Cantidad`/`Costo unitario neto` (`Agregar línea`) solo en `borrador`, botones `Marcar enviada`, `Recibir` (con `Tipo de documento` y `Folio`) y `Anular` (con `Motivo`); avisos `?hecho=add|send|receive|void`; tras recibir, cada línea muestra `Stock actual`.
5. `TallerLayout.astro`: en "Inventario y caja", `Proveedores` (`/taller/proveedores`) y `Compras` (`/taller/compras`) con `purchases.manage`. Títulos con `SITE.name`.

**Files**
- `src/pages/taller/proveedores/index.astro` — new
- `src/pages/taller/compras/index.astro` — new
- `src/pages/taller/compras/[id].astro` — new
- `src/layouts/TallerLayout.astro` — edit
- `tests/integration/compras-page.test.ts` — new

Reglas: `taller-ui.md`, `server-api.md`. No negociable 17. No cambia: enlaces existentes del menú.

**Acceptance**

1. **WHEN** el dueño hace POST en `/taller/compras` con un proveedor **THE SYSTEM SHALL** crear la compra en `borrador` y responder 303 a `/taller/compras/<id>`
2. **WHEN** el dueño agrega una línea y luego recibe la compra con tipo y folio en `/taller/compras/<id>` **THE SYSTEM SHALL** responder 303 a `?hecho=receive` y la página **SHALL** mostrar `Recibida` y el stock nuevo del producto
3. **WHEN** `reception` o `mechanic` piden `/taller/compras`, `/taller/compras/<id>` o `/taller/proveedores` **THE SYSTEM SHALL** responder 403
4. **WHEN** un POST llega a esas páginas con un `Origin` ajeno **THE SYSTEM SHALL** responder 403 sin escribir filas
5. **WHEN** se lee `src/layouts/TallerLayout.astro` **THE SYSTEM SHALL** contener los enlaces `/taller/proveedores` y `/taller/compras` con la acción `purchases.manage`

**Verify**

```bash
pnpm test tests/integration/compras-page.test.ts   # expect: exit 0, 0 failed
grep -q '"/taller/compras"' src/layouts/TallerLayout.astro && grep -q '"/taller/proveedores"' src/layouts/TallerLayout.astro && grep -q '"purchases.manage"' src/layouts/TallerLayout.astro   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -A && git commit -m "feat: f2-08 add supplier and purchase pages" && git tag f2-08
git tag -l f2-08 | grep -qx f2-08   # expect: exit 0
```
