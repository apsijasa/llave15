# Epic 04: Caja y gastos

> Después de esta épica existen las sesiones de caja (una abierta por sucursal), sus movimientos, los gastos con categoría cerrada y el interruptor `cash_control_enabled`. Con la caja habilitada, todo cobro, venta, gasto o devolución en efectivo pasa por la sesión abierta en la misma transacción, y sin sesión abierta el servidor responde `cash_closed` sin escribir. Con la caja deshabilitada (el valor por defecto) todo funciona como hoy.

| | |
|---|---|
| **Epic id** | `04-caja-gastos` |
| **Tasks** | `E4-T1` … `E4-T6` (pasos F2-25 … F2-30) |
| **Depends on** | `03-ventas-pagos` |
| **Unlocks** | `05-caja-indicadores-cierre` |
| **Parallel with** | ninguna |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Astro 7 SSR · TypeScript 6 · Postgres 16 · Drizzle ORM 0.45 · zod 4 · luxon · Vitest + PGlite. `pnpm` 12.4.2; Node 24. Ninguna dependencia nueva.

| Task | Command |
|---|---|
| Formatear | `pnpm format` |
| Test (un archivo) | `pnpm test tests/integration/<archivo>.test.ts` |
| Migraciones (solo base dev) | `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:check` |
| Compuerta | `pnpm gate` |

**Gate:** `pnpm format && pnpm gate`. El sandbox de Codex corre solo `format`, `check`, `test`, `build`; el resto y el commit, la sesión coordinadora. Reversión: `git reset --hard f2-<anterior>` y, si hace falta, el reinicio de la base dev de `blueprint.md` §12.

**Reglas transversales de cada tarea:** pruebas primero, en rojo; ≤ 5 archivos; **releer cada archivo antes de tocarlo** (el criterio es "< 400" sobre el archivo real); **ningún texto para el usuario, correo, título ni página escribe el nombre del taller literal** — `SITE.name`; nunca editar `drizzle/`; nada se borra (anular con `voided_at`/`voided_by` y motivo); dinero en pesos enteros; `recordAudit` dentro de la transacción; `db` y `now` como argumentos; zod en toda entrada; **con el interruptor apagado, el camino de hoy sin cambios** (las pruebas existentes de pagos y ventas no se tocan). **Checkpoint:** `git add --` solo con las rutas del paso (y `drizzle` en pasos de esquema, después de la guarda de duplicados de iCloud); nunca `git add -A`.

**Cobertura de tablet:** la pantalla de caja y su spec (cobro en efectivo con caja abierta) llegan en la épica 05 (E5-T1). Gastos es de escritorio (prueba con Container API).

## Directory subtree

```
src/server/db/schema-cash.ts              # NEW (E4-T1): cash_sessions, cash_movements, expenses, cashTables
src/server/db/schema.ts                   # edit (E4-T1): branches.cash_control_enabled
scripts/db-check.ts                       # edit (E4-T1)
src/server/db/schema-payments.ts · schema-sales.ts   # edit (E4-T2): cash_session_id
src/server/taller/cash.ts                 # NEW (E4-T3)
src/server/taller/rules.ts                # edit (E4-T3, E4-T6)
src/server/taller/payments.ts · src/pages/taller/ordenes/[id]/entrega.astro   # edit (E4-T4)
src/server/taller/sales.ts · sale-void.ts # edit (E4-T5)
src/server/taller/refunds.ts              # NEW (E4-T5)
src/server/taller/expenses.ts             # NEW (E4-T6) · src/pages/taller/gastos/index.astro NEW · TallerLayout.astro edit
tests/integration/{cash-schema,cash-links-schema,cash,cash-order-payments,cash-sales-refunds,expenses}.test.ts   # NEW
```

## Data model touched here

**B** = `branch_id not null → branches restrict` · **V** = `voided_at` + `voided_by → users` · **CB** = `created_by not null → users`.

| Entity | Campos | Notas |
|---|---|---|
| `branches` (E4-T1) | + `cash_control_enabled boolean not null default false` | en `schema.ts` |
| `cash_sessions` (E4-T1) | B, `opened_at timestamptz not null`, `opened_by → users not null`, `opening_cash_clp integer not null`, `closed_at`, `closed_by → users`, `counted_cash_clp`, `expected_cash_clp`, `difference_clp`, `note` | **único parcial `uq_cash_sessions_open (branch_id) where closed_at is null`**; CHECK `opening_cash_clp >= 0`, `counted_cash_clp is null or counted_cash_clp >= 0`, y cierre completo o nada: `(closed_at is null and closed_by is null and counted_cash_clp is null and expected_cash_clp is null and difference_clp is null) or (closed_at is not null and closed_by is not null and counted_cash_clp is not null and expected_cash_clp is not null and difference_clp = counted_cash_clp - expected_cash_clp)`; índice `(branch_id, opened_at)` |
| `cash_movements` (E4-T1) | B, `cash_session_id → cash_sessions not null`, `kind not null`, `amount_clp not null`, `reference_kind not null`, `reference_id uuid not null`, `note`, V, CB | CHECK `kind in ('ingreso','egreso')`, `amount_clp > 0`, `reference_kind in ('payment','expense','sale_refund','order_refund')`; índices `(cash_session_id, created_at)`, `(reference_kind, reference_id)` |
| `expenses` (E4-T1) | B, `category not null`, `amount_clp not null` (neto), `expense_date date not null`, `description text not null`, `supplier_id → suppliers` (null), `method not null`, `doc_type`, `doc_number`, `cash_session_id → cash_sessions` (null), `void_reason`, V, CB | CHECK `category in ('arriendo','sueldos','servicios','insumos','repuestos','otros')`, `amount_clp > 0`, `method in ('efectivo','transferencia','tarjeta','otro')`, `doc_type is null or doc_type in ('boleta','factura')`; índice `(branch_id, expense_date)` |
| `payments` (E4-T2) | + `cash_session_id → cash_sessions` (null) | índice `(cash_session_id)` |
| `sales` (E4-T2) | + `cash_session_id → cash_sessions` (null) | índice `(cash_session_id)` |

`schema-cash.ts` importa de `schema.ts` y `schema-inventory.ts` (`suppliers`); `schema-sales.ts` y `schema-payments.ts` importan `cashSessions` de `schema-cash.ts` (cadena: `… schema-reports.ts ← schema-cash.ts ← schema-sales.ts ← schema-payments.ts`).

## Contracts

**Consumed:** `applyStockMovement(tx, …)`, `recordAudit`, `can`, `createSale`/`voidSale` (E3-T4), `recordPayment`/`voidPayment`, `localToday`, `TIMEZONE`, `RECORDABLE_PAYMENT_METHODS`, `PAYMENT_METHOD_LABELS`, `formatClp`, `SITE`.

**Produced:**

| Export | Signature |
|---|---|
| `schema-cash.ts` → `cashSessions`, `cashMovements`, `expenses`, `cashTables` | tablas Drizzle |
| `cash.ts` → `openCashSession`, `closeCashSession`, `currentCashSession`, `listCashSessions`, `setCashControl`, `requireOpenCashSession`, `recordCashMovement`, `voidCashMovementFor`, `dayPaymentsSummary` | `requireOpenCashSession(tx, branchId)` → `{ mode: "off" } \| { mode: "closed" } \| { mode: "open", sessionId }`; `recordCashMovement(tx, actor, input, now)`; `voidCashMovementFor(tx, actor, referenceKind, referenceId, now)` → `{ ok: true } \| { ok: false, code: "cash_session_closed" }` (las tres solo dentro de la transacción de quien llama) |
| `refunds.ts` → `refundFormSchema`, `registerRefund` | `registerRefund(db, actor, input, now)` |
| `expenses.ts` → `expenseFormSchema`, `recordExpense`, `voidExpense`, `listExpenses` | `(db, actor, …, now)` |
| `rules.ts` → `CASH_MOVEMENT_KIND_LABELS`, `CASH_REFERENCE_LABELS`, `EXPENSE_CATEGORIES`, `EXPENSE_CATEGORY_LABELS`, `EXPENSE_METHODS` | etiquetas: `Ingreso`, `Egreso`; `Pago`, `Gasto`, `Devolución de venta`, `Devolución de orden`; `Arriendo`, `Sueldos`, `Servicios`, `Insumos`, `Repuestos`, `Otros` |

**Esperado de caja** = `opening_cash_clp` + Σ `ingreso` vigentes − Σ `egreso` vigentes de la sesión. **Diferencia** = contado − esperado.

## Conventions that bite in this area

- **Un solo punto de entrada** crea pago (o gasto, o devolución) y movimiento en la misma transacción: `recordPayment`, `createSale`, `recordExpense`, `registerRefund`. Nunca se inserta un `cash_movements` desde una página.
- `requireOpenCashSession` lee `branches.cash_control_enabled` y la sesión abierta con `for update` sobre la fila de la sesión; en PGlite las pruebas son secuenciales.
- Anular algo en efectivo cuya sesión ya cerró → `cash_session_closed` sin cambios; el dueño registra una devolución en `/taller/caja`.
- Apagar el control de caja exige la sesión cerrada (`cash_session_open`).
- Las devoluciones son solo en efectivo, con motivo, por dueño o administración (`payments.void`).

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/database.md`, `taller-domain.md`, `taller-ui.md`, `server-api.md`.

---

## Tasks

### `E4-T1` — F2-25 Add cash sessions, movements and expenses schema

**Depends on:** `E3-T7` · **Priority:** p0

1. `tests/integration/cash-schema.test.ts` primero: default del interruptor; segunda sesión abierta (`23505`); cierres inválidos y parciales (`23514`); gastos y movimientos inválidos (`23514`).
2. `schema-cash.ts` (nuevo): las tres tablas según "Data model"; `export const cashTables = [cashSessions, cashMovements, expenses] as const`.
3. `schema.ts`: `branches.cash_control_enabled`.
4. `scripts/db-check.ts`: recorre también `cashTables`.
5. `pnpm db:generate` (si pregunta, detenerse) → pruebas → migrate → check.

**Files**
- `src/server/db/schema-cash.ts` — new
- `src/server/db/schema.ts` — edit
- `scripts/db-check.ts` — edit
- `tests/integration/cash-schema.test.ts` — new

Reglas: `database.md`. No negociables 5, 8, 15.

**Acceptance**

1. **WHEN** `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` **THE SYSTEM SHALL** crear `cash_sessions`, `cash_movements` y `expenses` y agregar `branches.cash_control_enabled` con valor por defecto `false`
2. **WHEN** se abre una segunda sesión sin cerrar la primera en la misma sucursal **THE SYSTEM SHALL** rechazarla con código `23505`
3. **WHEN** una sesión se cierra con `difference_clp` distinto de `counted_cash_clp - expected_cash_clp`, o queda con solo parte de los datos de cierre **THE SYSTEM SHALL** rechazarla con código `23514`
4. **WHEN** un gasto tiene `amount_clp <= 0` o una categoría fuera de `arriendo`, `sueldos`, `servicios`, `insumos`, `repuestos` y `otros` **THE SYSTEM SHALL** rechazarlo con código `23514`
5. **WHEN** un movimiento de caja tiene `amount_clp <= 0` o `kind` fuera de `ingreso` y `egreso` **THE SYSTEM SHALL** rechazarlo con código `23514`
6. **WHEN** `pnpm db:check` corre **THE SYSTEM SHALL** revisar las columnas de `cashTables` y salir 0

**Verify**

```bash
pnpm test tests/integration/cash-schema.test.ts   # expect: exit 0, 0 failed
f="$(ls drizzle/*.sql | sort | tail -1)"; grep -Eq 'DROP (TABLE|COLUMN|CONSTRAINT)|RENAME' "$f"; test $? -eq 1   # expect: 1 = aditiva → la línea sale 0
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
u="$(git ls-files --others --exclude-standard)" && test -z "$(printf '%s\n' "$u" | grep -E ' 2(\.[^/]*)?$')"   # expect: exit 0 — sin duplicados de iCloud antes de agregar drizzle/
git add -- src/server/db/schema-cash.ts src/server/db/schema.ts scripts/db-check.ts tests/integration/cash-schema.test.ts drizzle
git commit -m "feat: f2-25 add cash sessions movements and expenses schema" && git tag f2-25
git tag -l f2-25 | grep -qx f2-25   # expect: exit 0
```

### `E4-T2` — F2-26 Link payments and sales to cash sessions

**Depends on:** `E4-T1` · **Priority:** p0

1. `tests/integration/cash-links-schema.test.ts` primero: FK inexistente (`23503`) en pago y venta; una con sesión válida se acepta.
2. `schema-payments.ts` y `schema-sales.ts`: `cashSessionId: uuid("cash_session_id").references(() => cashSessions.id, { onDelete: "restrict" })` + índice.
3. `pnpm db:generate` → pruebas → migrate → check.

**Files**
- `src/server/db/schema-payments.ts` — edit
- `src/server/db/schema-sales.ts` — edit
- `tests/integration/cash-links-schema.test.ts` — new

Reglas: `database.md`. No negociable 5. No cambia: `payments.test.ts`, `payments-extension.test.ts`, `sales.test.ts`.

**Acceptance**

1. **WHEN** `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` **THE SYSTEM SHALL** agregar `payments.cash_session_id` y `sales.cash_session_id`, nullable y con FK a `cash_sessions`, sin borrar nada
2. **WHEN** se inserta un pago o una venta con un `cash_session_id` que no existe **THE SYSTEM SHALL** rechazarlo con código `23503`
3. **WHEN** corren `payments.test.ts`, `payments-extension.test.ts` y `sales.test.ts` **THE SYSTEM SHALL** pasar sin cambios en esos archivos
4. **WHEN** se cuentan las líneas de `schema-payments.ts` y `schema-sales.ts` **THE SYSTEM SHALL** tener menos de 400 en cada uno

**Verify**

```bash
pnpm test tests/integration/cash-links-schema.test.ts tests/integration/payments.test.ts tests/integration/payments-extension.test.ts tests/integration/sales.test.ts   # expect: exit 0, 0 failed
f="$(ls drizzle/*.sql | sort | tail -1)"; grep -Eq 'DROP (TABLE|COLUMN|CONSTRAINT)|RENAME' "$f"; test $? -eq 1   # expect: 1 = aditiva → la línea sale 0
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
test "$(wc -l < src/server/db/schema-payments.ts | tr -d ' ')" -lt 400 && test "$(wc -l < src/server/db/schema-sales.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
u="$(git ls-files --others --exclude-standard)" && test -z "$(printf '%s\n' "$u" | grep -E ' 2(\.[^/]*)?$')"   # expect: exit 0 — sin duplicados de iCloud antes de agregar drizzle/
git add -- src/server/db/schema-payments.ts src/server/db/schema-sales.ts tests/integration/cash-links-schema.test.ts drizzle
git commit -m "feat: f2-26 link payments and sales to cash sessions" && git tag f2-26
git tag -l f2-26 | grep -qx f2-26   # expect: exit 0
```

### `E4-T3` — F2-27 Add cash session server

**Depends on:** `E4-T2` · **Priority:** p0

1. `tests/integration/cash.test.ts` primero: los seis criterios (movimientos de prueba con `recordCashMovement` dentro de una transacción).
2. `rules.ts`: etiquetas de caja de "Contracts".
3. `cash.ts`: `setCashControl(db, actor, { enabled }, now)` (`dashboard.finance`; apagar con sesión abierta → `cash_session_open`; si cambia, audit `cash.control_changed` con `{ enabled }`; si no cambia, `{ ok: true, changed: false }`). `openCashSession(db, actor, { openingCashClp: 0–10.000.000, note? }, now)` (`cash.open_close`; control apagado → `cash_control_off`; `23505` → `cash_session_open`; audit `cash.opened`). `closeCashSession(db, actor, { countedCashClp: 0–10.000.000, note? }, now)` (`cash.open_close`; sesión abierta con `for update`, si no `not_found`; esperado y diferencia; audit `cash.closed` con `expectedCashClp`, `countedCashClp`, `differenceClp`). `currentCashSession(db, actor)` → sesión abierta + movimientos con origen y totales, o `null`. `listCashSessions(db, actor)` → últimas 30. `requireOpenCashSession(tx, branchId)`. `recordCashMovement(tx, actor, { sessionId, kind, amountClp, referenceKind, referenceId, note? }, now)`. `voidCashMovementFor(tx, actor, referenceKind, referenceId, now)`: si el movimiento vigente pertenece a una sesión cerrada → `cash_session_closed`; si no, `voided_at`/`voided_by`. `dayPaymentsSummary(db, actor, now)` → por método (`RECORDABLE_PAYMENT_METHODS`), suma y cantidad de pagos vigentes recibidos en el día local (`TIMEZONE`), de órdenes y de ventas. Todas las funciones exigen `cash.open_close` salvo `setCashControl` (`dashboard.finance`); el mecánico recibe `forbidden`.

**Files**
- `src/server/taller/cash.ts` — new
- `src/server/taller/rules.ts` — edit
- `tests/integration/cash.test.ts` — new

Reglas: `taller-domain.md`. No negociables 15, 16.

**Acceptance**

1. **WHEN** la caja está habilitada y `reception` abre una sesión con 20.000 **THE SYSTEM SHALL** crearla con `opened_by` y `opening_cash_clp = 20000` y registrar `cash.opened`, y una segunda apertura **SHALL** devolver `ok: false` con código `cash_session_open`
2. **WHEN** se cierra con conteo 31.000 tras un ingreso de 15.000 y un egreso de 3.000 **THE SYSTEM SHALL** guardar `expected_cash_clp = 32000` y `difference_clp = -1000` y registrar `cash.closed` con esperado, contado y diferencia
3. **WHEN** la caja no está habilitada y alguien intenta abrirla **THE SYSTEM SHALL** devolver `ok: false` con código `cash_control_off`
4. **WHEN** `reception` llama `setCashControl` **THE SYSTEM SHALL** devolver `forbidden`, y **WHEN** `owner` intenta desactivarla con una sesión abierta **THE SYSTEM SHALL** devolver `cash_session_open`; cada cambio efectivo **SHALL** registrar `cash.control_changed`
5. **WHEN** `dayPaymentsSummary` corre **THE SYSTEM SHALL** sumar por método los pagos vigentes del día local de órdenes y ventas, incluidos transferencia, tarjeta y Mercado Pago
6. **WHEN** el mecánico llama cualquier función de caja **THE SYSTEM SHALL** devolver `ok: false` con código `forbidden`

**Verify**

```bash
pnpm test tests/integration/cash.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/server/taller/cash.ts src/server/taller/rules.ts tests/integration/cash.test.ts
git commit -m "feat: f2-27 add cash session server" && git tag f2-27
git tag -l f2-27 | grep -qx f2-27   # expect: exit 0
```

### `E4-T4` — F2-28 Route cash order payments through the session

**Depends on:** `E4-T3` · **Priority:** p0

1. `tests/integration/cash-order-payments.test.ts` primero: los seis criterios.
2. `payments.ts` → `recordPayment`: dentro de la transacción, si `method === "efectivo"`, `requireOpenCashSession(tx, actor.branchId)`: `off` → como hoy; `closed` → `{ ok: false, code: "cash_closed" }` sin escribir; `open` → insertar el pago con `cash_session_id` y `recordCashMovement(tx, …)` con `ingreso`, el monto, `"payment"` y el id del pago. Otros métodos: como hoy. `voidPayment`: si el pago tiene `cash_session_id`, primero `voidCashMovementFor(tx, actor, "payment", paymentId, now)`; si devuelve `cash_session_closed`, devolverlo sin anular el pago (error centinela si ya se escribió algo).
3. `entrega.astro`: mapear `cash_closed` → "La caja está cerrada: ábrela en Caja antes de cobrar en efectivo." y `cash_session_closed` → "La caja de ese pago ya se cerró: registra una devolución en Caja.", ambos 409.

**Files**
- `src/server/taller/payments.ts` — edit
- `src/pages/taller/ordenes/[id]/entrega.astro` — edit
- `tests/integration/cash-order-payments.test.ts` — new

Reglas: `taller-domain.md`, `taller-ui.md`. No negociables 15, 16. No cambia: firmas; `payments.test.ts`, `delivery.test.ts`.

**Acceptance**

1. **WHEN** la caja está habilitada y abierta y se registra un pago `efectivo` de una orden **THE SYSTEM SHALL** guardar el pago con `cash_session_id` y un `cash_movements` `ingreso` por el mismo monto, en la misma transacción
2. **WHEN** la caja está habilitada y no hay sesión abierta **THE SYSTEM SHALL** devolver `ok: false` con código `cash_closed` sin escribir pago ni movimiento
3. **WHEN** la caja no está habilitada **THE SYSTEM SHALL** registrar el pago `efectivo` como hoy, sin `cash_session_id`, con `payments.test.ts` sin cambios
4. **WHEN** se anula un pago en efectivo cuya sesión sigue abierta **THE SYSTEM SHALL** marcar también su movimiento con `voided_at`
5. **WHEN** la sesión de ese pago ya cerró **THE SYSTEM SHALL** devolver `ok: false` con código `cash_session_closed` sin anular nada
6. **WHEN** se registra un pago por transferencia con la caja abierta **THE SYSTEM SHALL** no crear movimiento de caja

**Verify**

```bash
pnpm test tests/integration/cash-order-payments.test.ts tests/integration/payments.test.ts tests/integration/delivery.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/taller/payments.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/server/taller/payments.ts 'src/pages/taller/ordenes/[id]/entrega.astro' tests/integration/cash-order-payments.test.ts
git commit -m "feat: f2-28 route cash order payments through the session" && git tag f2-28
git tag -l f2-28 | grep -qx f2-28   # expect: exit 0
```

### `E4-T5` — F2-29 Route cash sales and refunds through the session

**Depends on:** `E4-T4` · **Priority:** p0

1. `tests/integration/cash-sales-refunds.test.ts` primero: los seis criterios.
2. `sales.ts` → `createSale`: con `method === "efectivo"`, `requireOpenCashSession(tx, …)` antes de escribir nada: `closed` → `cash_closed`; `open` → la venta y el pago llevan `cash_session_id` y se crea `recordCashMovement(tx, …)` con `ingreso`, el total, `"payment"` y el id del pago; `off` → como en E3-T4.
3. `sale-void.ts` → `voidSale`: por cada pago con `cash_session_id`, `voidCashMovementFor(tx, …)`; si alguno devuelve `cash_session_closed`, devolverlo sin cambiar la venta (error centinela).
4. `refunds.ts`: `refundFormSchema` = `{ saleNumber?: /^VM-\d{5}$/, workOrderId?: uuid (exactamente uno de los dos), amountClp: entero > 0, reason: 3–200, returnedSku?: string, returnedQuantity?: 1–100 }`. `registerRefund(db, actor, input, now)`: `payments.void`; `requireOpenCashSession(tx, …)`: `off` → `cash_control_off`, `closed` → `cash_closed`; resolver la venta (o la orden) de la sucursal; tope = pagado vigente − devoluciones vigentes previas (Σ `egreso` con `reference_kind` `sale_refund`/`order_refund` y ese `reference_id`); si `amountClp` lo supera → `invalid_amount`; `recordCashMovement(tx, …)` con `egreso`, el monto, `"sale_refund"` o `"order_refund"`, el id y `note = reason`; si hay producto devuelto (solo ventas): el SKU debe ser un ítem de esa venta y `returnedQuantity` ≤ vendido − ya devuelto → `applyStockMovement(tx, …)` con `devolucion`, `+returnedQuantity`, `unit_cost_clp` del ítem, `"sale_refund"`, `saleId`; audit `cash.refund` con `{ reference, amountClp, reason, returnedQuantity? }` (el responsable es `actor`).

**Files**
- `src/server/taller/sales.ts` — edit
- `src/server/taller/sale-void.ts` — edit
- `src/server/taller/refunds.ts` — new
- `tests/integration/cash-sales-refunds.test.ts` — new

Reglas: `taller-domain.md`. No negociables 14, 15, 16. No cambia: `sales.test.ts`.

**Acceptance**

1. **WHEN** la caja está abierta y se registra una venta sin cliente en efectivo **THE SYSTEM SHALL** dejar la venta `pagada` con `cash_session_id`, el pago y un `cash_movements` `ingreso` por el total
2. **WHEN** la caja está habilitada y cerrada **THE SYSTEM SHALL** devolver `ok: false` con código `cash_closed` en una venta en efectivo sin escribir venta, pago, stock ni movimiento
3. **WHEN** el dueño registra con la caja abierta una devolución de 1 unidad de una venta, con monto y motivo **THE SYSTEM SHALL** crear un `cash_movements` `egreso` con `reference_kind = 'sale_refund'`, un `stock_movements` `devolucion` de +1 y registrar `cash.refund` con usuario, monto y motivo
4. **WHEN** la devolución supera lo pagado menos lo ya devuelto, o la pide `reception` **THE SYSTEM SHALL** devolver `invalid_amount` o `forbidden` sin escribir
5. **WHEN** se anula una venta en efectivo cuya sesión ya cerró **THE SYSTEM SHALL** devolver `ok: false` con código `cash_session_closed` sin cambiar la venta
6. **WHEN** la caja no está habilitada **THE SYSTEM SHALL** registrar ventas en efectivo sin sesión, con `sales.test.ts` sin cambios

**Verify**

```bash
pnpm test tests/integration/cash-sales-refunds.test.ts tests/integration/sales.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/taller/sales.ts | tr -d ' ')" -lt 400 && test "$(wc -l < src/server/taller/sale-void.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/server/taller/sales.ts src/server/taller/sale-void.ts src/server/taller/refunds.ts tests/integration/cash-sales-refunds.test.ts
git commit -m "feat: f2-29 route cash sales and refunds through the session" && git tag f2-29
git tag -l f2-29 | grep -qx f2-29   # expect: exit 0
```

### `E4-T6` — F2-30 Add expenses server and page

**Depends on:** `E4-T5` · **Priority:** p0

1. `tests/integration/expenses.test.ts` primero: los cinco criterios de servidor y el render de `/taller/gastos` para `reception` (403) con el patrón de `indicadores-page.test.ts`.
2. `rules.ts`: `EXPENSE_CATEGORIES` + etiquetas; `EXPENSE_METHODS = ["efectivo","transferencia","tarjeta","otro"]`.
3. `expenses.ts`: `expenseFormSchema` (`category`, `amountClp` entero 1–100.000.000, `expenseDate` ISO, `description` 2–200, `supplierId?`, `method`, `docType?`, `docNumber?` ≤ 30). `recordExpense(db, actor, input, now)` (`expenses.record`; si `efectivo`: `requireOpenCashSession(tx, …)` → `closed` → `cash_closed`; `open` → `cash_session_id` + `recordCashMovement(tx, …)` con `egreso`, el monto, `"expense"` y el id del gasto; audit `expense.recorded`). `voidExpense(db, actor, id, { reason 3–200 }, now)` (`expenses.record`; si tiene sesión, `voidCashMovementFor(tx, …)`; `cash_session_closed` sin cambios; V + `void_reason`; audit `expense.voided`). `listExpenses(db, actor, { from, to })` (≤ 366 días, vigentes y anuladas marcadas).
4. `gastos/index.astro` (`expenses.record`; escritorio): formulario `Categoría`, `Monto neto`, `Fecha`, `Descripción`, `Proveedor (opcional)`, `Medio`, `Documento`, `Folio`, botón `Registrar gasto` → 303 `?hecho=record`, aviso `Gasto registrado.`; lista del mes en curso con rango `Desde`/`Hasta`; anular con `Motivo` → `?hecho=void`, aviso `Gasto anulado.`; `cash_closed` → 409 "La caja está cerrada: ábrela en Caja antes de un gasto en efectivo." Título con `SITE.name`.
5. `TallerLayout.astro`: en "Inventario y caja", `Gastos` (`/taller/gastos`, `expenses.record`).

**Files**
- `src/server/taller/expenses.ts` — new
- `src/server/taller/rules.ts` — edit
- `src/pages/taller/gastos/index.astro` — new
- `src/layouts/TallerLayout.astro` — edit
- `tests/integration/expenses.test.ts` — new

Reglas: `taller-domain.md`, `taller-ui.md`, `server-api.md`. No negociables 15, 16.

**Acceptance**

1. **WHEN** el dueño registra con la caja abierta un gasto en efectivo de 8.000 **THE SYSTEM SHALL** guardar el gasto con `cash_session_id` y un `cash_movements` `egreso` de 8.000
2. **WHEN** registra un gasto por transferencia **THE SYSTEM SHALL** guardarlo sin sesión y sin movimiento de caja
3. **WHEN** la caja está habilitada y cerrada y el gasto es en efectivo **THE SYSTEM SHALL** devolver `ok: false` con código `cash_closed` sin escribir
4. **WHEN** `reception` o `mechanic` registran o anulan un gasto **THE SYSTEM SHALL** devolver `ok: false` con código `forbidden`
5. **WHEN** se anula un gasto con motivo **THE SYSTEM SHALL** marcar `voided_at`, `voided_by` y el motivo, anular su movimiento si la sesión sigue abierta o devolver `cash_session_closed` si cerró, y registrar `expense.voided`
6. **WHEN** `reception` pide `/taller/gastos` **THE SYSTEM SHALL** responder 403, y `src/layouts/TallerLayout.astro` **SHALL** contener `/taller/gastos` con la acción `expenses.record`

**Verify**

```bash
pnpm test tests/integration/expenses.test.ts   # expect: exit 0, 0 failed
grep -q '"/taller/gastos"' src/layouts/TallerLayout.astro && grep -q '"expenses.record"' src/layouts/TallerLayout.astro   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/server/taller/expenses.ts src/server/taller/rules.ts src/pages/taller/gastos/index.astro src/layouts/TallerLayout.astro tests/integration/expenses.test.ts
git commit -m "feat: f2-30 add expenses server and page" && git tag f2-30
git tag -l f2-30 | grep -qx f2-30   # expect: exit 0
```
