# Epic 05: Caja en pantalla, indicadores Etapa B y cierre

> Después de esta épica existe `/taller/caja` (interruptor, apertura, movimientos, otros medios del día, cierre con diferencia, devoluciones, historial) probada en tablet, la ventana de publicación V3, los bloques de la Etapa B en `/taller/indicadores` y `pnpm f2:check`, la revisión diaria de los criterios de aborto del primer mes. Es la última épica de la fase.

| | |
|---|---|
| **Epic id** | `05-caja-indicadores-cierre` |
| **Tasks** | `E5-T1` … `E5-T5` (pasos F2-31 … F2-35) |
| **Depends on** | `04-caja-gastos` |
| **Unlocks** | nada — es la última |
| **Parallel with** | ninguna |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Astro 7 SSR · TypeScript 6 · Postgres 16 · Drizzle ORM 0.45 · zod 4 · luxon · Vitest + PGlite · Playwright (tablet 820×1180). `pnpm` 12.4.2; Node 24. Ninguna dependencia nueva.

| Task | Command |
|---|---|
| Formatear | `pnpm format` |
| Test (un archivo) | `pnpm test tests/integration/<archivo>.test.ts` |
| Migraciones (solo base dev) | `pnpm db:migrate` · `pnpm db:check` |
| Tablet | `pnpm build && pnpm test:tablet e2e/<archivo>.spec.ts` |
| Compuerta | `pnpm gate` |

**Gate:** `pnpm format && pnpm gate`. El sandbox de Codex corre solo `format`, `check`, `test`, `build`; el resto y el commit, la sesión coordinadora. Reversión: `git reset --hard f2-<anterior>`.

**Reglas transversales de cada tarea:** pruebas primero, en rojo; ≤ 5 archivos; **releer cada archivo antes de tocarlo** (el criterio es "< 400" sobre el archivo real); **ningún texto para el usuario, correo, título ni página escribe el nombre del taller literal** — `SITE.name`; nada se borra; dinero en pesos enteros; zod en toda entrada; costos (`valueAtCostClp`, `partsMarginClp`, comisión de Mercado Pago) solo con `costs.view`; páginas `requireAdmin → can → zod → src/server/taller/**` con `isAllowedOrigin` en los POST.

**Cobertura de tablet:** E5-T1 tiene `e2e/caja-efectivo.spec.ts` (cobro en efectivo con caja abierta, FASE2 §8). Indicadores es de escritorio (`e2e/indicadores.spec.ts` existente debe seguir verde).

## Directory subtree

```
src/pages/taller/caja/index.astro         # NEW (E5-T1)
src/layouts/TallerLayout.astro            # edit (E5-T1)
e2e/caja-efectivo.spec.ts                 # NEW (E5-T1)
docs/ventanas/f2-v3.md                    # NEW (E5-T2)
src/server/taller/indicators-finance.ts   # NEW (E5-T3)
src/pages/taller/indicadores.astro        # edit (E5-T4)
src/components/taller/FinanceBlocks.astro # NEW (E5-T4)
src/server/taller/phase2-health.ts        # NEW (E5-T5) · scripts/f2-check.ts NEW · package.json edit · README.md edit
tests/integration/{caja-page,indicators-finance,indicadores-finance-page,phase2-health}.test.ts   # NEW
```

## Data model touched here

Sin esquema nuevo. Se leen: `cash_sessions`, `cash_movements`, `expenses`, `payments` (`method`, `fee_clp`, `net_clp`, `sale_id`, `work_order_id`, `cash_session_id`), `sales`, `sale_items`, `work_orders` (`pricing_mode`, `subtotal_clp`, `vat_clp`, `delivered_at`), `work_order_items` (`kind`, `product_id`, `unit_cost_clp`), `products`, `stock_movements`, `branches.cash_control_enabled`, `audit_log` (`cash.control_changed`).

**Fórmulas de la Etapa B (F2-D12):** ingresos brutos = Σ `amount_clp` de pagos vigentes recibidos en el rango (órdenes y ventas); ingresos netos = Σ `netOfGross(amount_clp)` por pago (`Math.round(amount × 100 / 119)`); devoluciones = Σ `egreso` vigentes `sale_refund`/`order_refund` en el rango (netas con `netOfGross`); egresos = Σ `expenses.amount_clp` vigentes por `expense_date` en el rango (ya netos); balance = ingresos netos − devoluciones netas − egresos; gastos sobre ingresos = `ingresosNetos > 0 ? Math.round(egresos × 100 / ingresosNetos) : 0`. Mix: servicios y repuestos = líneas vigentes de órdenes entregadas en el rango, neto por línea (`neto`: `quantity × unit_price_clp`; `final`: `netOfGross(quantity × unit_price_clp)`); ventas de mostrador = Σ `subtotal_clp` de ventas `pagada` creadas en el rango. Margen de repuestos (`costs.view`) = Σ (neto unitario − `unit_cost_clp`) × cantidad de líneas con `product_id` de órdenes entregadas en el rango + Σ (`unit_price_clp` − `unit_cost_clp`) × cantidad de ítems de ventas `pagada` del rango − Σ `discount_clp` de esas ventas. Inventario: activos; bajo mínimo (`min_stock > 0 and stock_qty <= min_stock`); sin stock (`stock_qty = 0`); valor a costo = Σ `stock_qty × cost_clp` (`costs.view`).

**Criterios de aborto (F2-D14, F2-D20):** `netoInconsistent` = órdenes `neto` con `vat_clp <> (subtotal_clp * 19 + 50) / 100`; `cashUnlinked` = pagos `efectivo` vigentes sin `cash_session_id` de sucursales con la caja habilitada, creados después del último `cash.control_changed` de esa sucursal; `cashDifferenceOver` = sesiones cerradas con `abs(difference_clp) > 5000`; `stockDrift` = productos cuyo `stock_qty` ≠ Σ `quantity` de sus movimientos.

## Contracts

**Consumed:** `cash.ts` (todas), `registerRefund`, `dayPaymentsSummary`, `indicatorsRangeSchema`, `defaultRange` (`indicators.ts`), `netOfGross`, `vatOfNet`, `RECORDABLE_PAYMENT_METHODS`, `EXPENSE_CATEGORIES`, `formatClp`, `getDbEnv`, `SITE`; del spec: los rótulos de `/taller/inventario/nuevo` (épica 01) y de `/taller/ventas/nueva` (épica 03).

**Produced:**

| Export | Signature |
|---|---|
| `indicators-finance.ts` → `financeIndicators`, `FinanceIndicators` | `(db, actor, range, now)` → objeto \| `null` |
| `FinanceBlocks.astro` | props `{ sections: { title: string; rows: { label: string; value: string }[] }[] }` |
| `phase2-health.ts` → `phase2Health` | `(db)` → `{ ok, netoInconsistent, cashUnlinked, cashDifferenceOver, stockDrift }` |
| `scripts/f2-check.ts` | salida 0 sano · 1 algún umbral superado · 2 sin conexión o error |

**Forma de `FinanceIndicators`:** `{ range, income: { grossClp, netClp, refundsClp }, mercadoPago: { grossClp, feeClp?, netClp? }, expenses: { totalClp, byCategory: { category, label, amountClp }[] }, balanceClp, expenseRatioPct, mix: { servicesClp, partsClp, counterSalesClp }, inventory: { activeCount, lowStockCount, outOfStockCount, valueAtCostClp? }, partsMarginClp? }` — las claves con `?` solo viajan con `costs.view`.

## Rótulos de `/taller/caja` (literales; el spec depende de ellos)

`h1` `Caja`. Con `dashboard.finance`: botón `Habilitar control de caja` / `Desactivar control de caja`, avisos `Control de caja habilitado.` / `Control de caja desactivado.`. Sin sesión: `Efectivo inicial`, botón `Abrir caja`, aviso `Caja abierta.`. Con sesión: `<dl class="data">` con `Abierta por`, `Efectivo inicial`, `Ingresos`, `Egresos`, `Esperado`; tabla `Movimientos de la sesión` (`Hora`, `Tipo` = `Ingreso`/`Egreso`, `Origen`, `Monto`, `Nota`); tabla `Otros medios del día` (por método, de `dayPaymentsSummary`); cierre `Efectivo contado`, `Nota (opcional)`, botón `Cerrar caja`, aviso `` `Caja cerrada. Diferencia: ${formatClp(diferencia)}.` ``. Con `payments.void`: devolución `Venta` (`VM-00001`), `Monto`, `Motivo`, `SKU devuelto (opcional)`, `Unidades devueltas (opcional)`, botón `Registrar devolución`, aviso `Devolución registrada.`. Tabla `Sesiones anteriores` (`Apertura`, `Cierre`, `Esperado`, `Contado`, `Diferencia`): diferencia distinta de 0 con `span.status.status--diferencia` y el texto `Diferencia +$1.000` o `Diferencia -$1.000`.

## Conventions that bite in this area

- El spec de caja **deja la caja deshabilitada al terminar** (cierra la sesión y apaga el interruptor): los demás specs no cobran en efectivo, pero ninguno debe heredar una caja habilitada.
- `ReportView`/`Intl` no se usan aquí: los montos de páginas y del informe de caja van con `formatClp`.
- `phase2Health` no imprime datos personales: solo conteos.
- `f2:check` contra producción lo corre el dueño; Claude nunca toca producción.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/taller-domain.md`, `taller-ui.md`, `server-api.md`, `e2e.md`, `database.md`.

---

## Tasks

### `E5-T1` — F2-31 Add the cash page and tablet cash sale

**Depends on:** `E4-T6` · **Priority:** p0

1. `tests/integration/caja-page.test.ts` primero (Container API como `indicadores-page.test.ts`): `reception` ve apertura/cierre sin interruptor ni devolución; `mechanic` → 403; una sesión cerrada con diferencia −1.000 aparece con `status--diferencia` y `Diferencia -$1.000`.
2. `e2e/caja-efectivo.spec.ts` (solo `@playwright/test` y `./fixtures.ts`): "Venta en efectivo con la caja abierta": `login(page, "owner", "/taller/caja")`; tocar `Habilitar control de caja` → `Control de caja habilitado.`; `Efectivo inicial` 10000 → `Abrir caja` → `Caja abierta.`; crear producto `E2E-CAJA-1` `Luz E2E`, `Accesorio`, `Costo neto` 3000, `Precio neto` 5000, `Stock inicial` 2 en `/taller/inventario/nuevo`; en `/taller/ventas/nueva`, `Producto 1` → `E2E-CAJA-1 · Luz E2E · stock 2 · $5.000`, `Cantidad 1` = 1, `Calcular total` → `Total` `$5.950`, `Medio de pago` → `Efectivo`, `Registrar venta`; volver a `/taller/caja`: una fila `Ingreso` con `$5.950` en `Movimientos de la sesión` y `Esperado` `$15.950`; `Efectivo contado` 15950 → `Cerrar caja` → `Caja cerrada. Diferencia: $0.`; `Desactivar control de caja` → `Control de caja desactivado.`.
3. `caja/index.astro` (`cash.open_close`; tablet y escritorio): POST `action=control` (`dashboard.finance`), `open`, `close`, `refund` (`payments.void`), cada uno → la función de `cash.ts`/`refunds.ts` → 303 `?hecho=<acción>`; errores en texto: `cash_session_open` "Ya hay una caja abierta.", `cash_control_off` "El control de caja está desactivado.", `cash_closed` "La caja está cerrada.", `invalid_amount` "El monto supera lo pagado menos lo ya devuelto.". Rótulos de la sección de arriba; título con `SITE.name`; objetivos ≥ 48px; `tabular-nums`.
4. `TallerLayout.astro`: en "Inventario y caja", `Caja` (`/taller/caja`, `cash.open_close`).

**Files**
- `src/pages/taller/caja/index.astro` — new
- `src/layouts/TallerLayout.astro` — edit
- `e2e/caja-efectivo.spec.ts` — new
- `tests/integration/caja-page.test.ts` — new

Reglas: `taller-ui.md`, `server-api.md`, `e2e.md`. No negociables 13, 15. No cambia: `global-setup.ts`, `fixtures.ts`, `playwright.config.ts`, specs existentes.

**Acceptance**

1. **WHEN** el spec `e2e/caja-efectivo.spec.ts` corre en tablet **THE SYSTEM SHALL** habilitar la caja, abrirla con $10.000, registrar una venta en efectivo de $5.950, mostrar el ingreso y `Esperado` `$15.950`, cerrarla con conteo 15.950 mostrando `Diferencia: $0.` y dejar la caja deshabilitada al terminar
2. **WHEN** `reception` abre `/taller/caja` **THE SYSTEM SHALL** mostrar apertura y cierre, sin el interruptor de control de caja ni el formulario de devolución
3. **WHEN** el mecánico pide `/taller/caja` **THE SYSTEM SHALL** responder 403
4. **WHEN** la página muestra una sesión cerrada con diferencia distinta de 0 **THE SYSTEM SHALL** marcarla con `span.status` y el texto `Diferencia` con el monto con signo
5. **WHEN** se lee `src/layouts/TallerLayout.astro` **THE SYSTEM SHALL** contener el enlace `/taller/caja` con la acción `cash.open_close`

**Verify**

```bash
pnpm test tests/integration/caja-page.test.ts   # expect: exit 0, 0 failed
pnpm build && pnpm test:tablet e2e/caja-efectivo.spec.ts   # expect: exit 0, 0 failed
grep -q '"/taller/caja"' src/layouts/TallerLayout.astro && grep -q '"cash.open_close"' src/layouts/TallerLayout.astro   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -A && git commit -m "feat: f2-31 add the cash page and tablet cash sale" && git tag f2-31
git tag -l f2-31 | grep -qx f2-31   # expect: exit 0
```

### `E5-T2` — F2-32 Prepare publication window V3

**Depends on:** `E5-T1` · **Priority:** p0

1. Localizar las dos migraciones: `grep -lE 'CREATE TABLE ("public"\.)?"cash_sessions"' drizzle/*.sql` y `grep -l 'ADD COLUMN "cash_session_id"' drizzle/*.sql`.
2. `docs/ventanas/f2-v3.md` con: `## Qué trae` (caja, gastos, devoluciones; tag `f2-32`; la caja llega **deshabilitada**), `## Migraciones` (los dos nombres), `## Precondiciones` (taller cerrado, respaldo del día, V2 publicada, gate verde), `## Pasos en Replit` (BITACORA §2 con `corepack pnpm@12.4.2`), `## Verificación después de publicar` (panel *Database*, solo lectura: `select cash_control_enabled from branches;` → `false`; `select count(*) from cash_sessions;` → 0; abrir `/taller/caja`), `## Corte de caja (C5)` (lo hace el dueño cuando quiera: habilitar en `/taller/caja`, abrir la primera sesión, cerrarla al final del día; `pnpm f2:check` cada día), `## Reversión` (cerrar la sesión y deshabilitar; o republicar el anterior).

**Files**
- `docs/ventanas/f2-v3.md` — new

Reglas: `database.md`. No negociable 2.

**Acceptance**

1. **WHEN** `pnpm db:migrate` y `pnpm db:check` corren sobre la base dev **THE SYSTEM SHALL** salir 0 con `cash_sessions`, `cash_movements` y `expenses` presentes
2. **WHEN** se revisan las dos migraciones de la ventana V3 **THE SYSTEM SHALL** encontrar la de `CREATE TABLE` de `cash_sessions` y la que agrega `cash_session_id`, ninguna con `DROP TABLE`, `DROP COLUMN`, `DROP CONSTRAINT` ni `RENAME`
3. **WHEN** se lee `docs/ventanas/f2-v3.md` **THE SYSTEM SHALL** contener `## Precondiciones`, `## Pasos en Replit` y `## Verificación después de publicar`, y los nombres de las dos migraciones
4. **WHEN** corre `pnpm gate` **THE SYSTEM SHALL** salir 0

**Verify**

```bash
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
f="$(grep -lE 'CREATE TABLE ("public"\.)?"cash_sessions"' drizzle/*.sql)"; test -f "$f" && { grep -Eq 'DROP (TABLE|COLUMN|CONSTRAINT)|RENAME' "$f"; test $? -eq 1; } && grep -qF "$(basename "$f")" docs/ventanas/f2-v3.md   # expect: exit 0
f="$(grep -l 'ADD COLUMN "cash_session_id"' drizzle/*.sql)"; test -f "$f" && { grep -Eq 'DROP (TABLE|COLUMN|CONSTRAINT)|RENAME' "$f"; test $? -eq 1; } && grep -qF "$(basename "$f")" docs/ventanas/f2-v3.md   # expect: exit 0
grep -qF '## Precondiciones' docs/ventanas/f2-v3.md && grep -qF '## Pasos en Replit' docs/ventanas/f2-v3.md && grep -qF '## Verificación después de publicar' docs/ventanas/f2-v3.md   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -A && git commit -m "docs: f2-32 prepare publication window v3" && git tag f2-32
git tag -l f2-32 | grep -qx f2-32   # expect: exit 0
git ls-files --error-unmatch docs/ventanas/f2-v3.md   # expect: exit 0
```

### `E5-T3` — F2-33 Compute Stage B finance indicators

**Depends on:** `E5-T2` · **Priority:** p1

1. `tests/integration/indicators-finance.test.ts` primero: un escenario por criterio con fechas fijas (rango `2026-11-01`–`2026-11-30`, `now` en el rango). Fixture del criterio 4: orden `neto` entregada en el rango con un servicio de 10.000 y un repuesto ligado de 5.000 (costo 3.000, cantidad 1); venta `pagada` de 2 unidades a 5.000 (costo 3.000) → `partsMarginClp` = (5000 − 3000) × 1 + (5000 − 3000) × 2 = 6000. Fixture del criterio 5: tres productos activos — A con `min_stock` 2 y stock 1, B con stock 0 y `min_stock` 0, C con stock 4 — más uno inactivo.
2. `indicators-finance.ts`: `financeIndicators(db, actor, range, now)`: `dashboard.finance` (si no, `null`); valida `range` con `indicatorsRangeSchema` y usa los mismos límites de día local que `indicators.ts`; fórmulas de "Data model"; todas las consultas filtran `actor.branchId` y excluyen anulados; sin `costs.view`, omite `mercadoPago.feeClp`, `mercadoPago.netClp`, `inventory.valueAtCostClp` y `partsMarginClp`. Archivo < 400 líneas; funciones < 50.

**Files**
- `src/server/taller/indicators-finance.ts` — new
- `tests/integration/indicators-finance.test.ts` — new

Reglas: `taller-domain.md`. No negociable 17. No cambia: `workshopIndicators`, `indicators.test.ts`.

**Acceptance**

1. **WHEN** `reception` o `mechanic` llaman `financeIndicators` **THE SYSTEM SHALL** devolver `null`
2. **WHEN** el rango tiene un pago de orden de 11.900, una venta pagada de total 11.900 y un gasto de 8.000 **THE SYSTEM SHALL** devolver ingresos brutos 23.800, ingresos netos 20.000, egresos 8.000, balance 12.000 y gastos sobre ingresos 40
3. **WHEN** el rango tiene un pago `mercadopago` de 11.900 con comisión 450 **THE SYSTEM SHALL** devolver en `mercadoPago` bruto 11.900, comisión 450 y neto 11.450
4. **WHEN** hay una orden `neto` entregada con un servicio de 10.000 y un repuesto ligado de 5.000 con costo 3.000, y una venta pagada de 2 unidades a 5.000 con costo 3.000 **THE SYSTEM SHALL** devolver mix servicios 10.000, repuestos 5.000, ventas de mostrador 10.000 y `partsMarginClp` 6.000
5. **WHEN** el inventario tiene 3 productos activos, uno con `min_stock > 0` y bajo mínimo, y uno sin stock **THE SYSTEM SHALL** devolver `activeCount` 3, `lowStockCount` 1, `outOfStockCount` 1 y `valueAtCostClp` igual a la suma de stock por costo
6. **WHEN** el rango no tiene movimientos **THE SYSTEM SHALL** devolver ceros, sin dividir por cero

**Verify**

```bash
pnpm test tests/integration/indicators-finance.test.ts tests/integration/indicators.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/taller/indicators-finance.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -A && git commit -m "feat: f2-33 compute stage b finance indicators" && git tag f2-33
git tag -l f2-33 | grep -qx f2-33   # expect: exit 0
```

### `E5-T4` — F2-34 Show Stage B blocks on /taller/indicadores

**Depends on:** `E5-T3` · **Priority:** p1

1. `tests/integration/indicadores-finance-page.test.ts` primero (patrón y helpers propios, copiados de `indicadores-page.test.ts` sin modificarlo): con un pago, un gasto y una venta en el rango, el HTML del dueño contiene las cinco secciones con sus montos en `class="mono"`; `reception` → 403.
2. `FinanceBlocks.astro`: props `{ sections }`; cada sección es un `<section>` con `<h2>` y una tabla densa (`tabular-nums`, montos en `<td class="mono">`); no importa `src/server/**`.
3. `indicadores.astro`: después de los bloques de la Etapa A, llamar `financeIndicators(db, user, range, now)` con el mismo rango y pasar a `FinanceBlocks` las secciones `Egresos del período` (total y por categoría), `Balance` (ingresos netos, devoluciones, egresos, balance, gastos sobre ingresos en %), `Mix de ingresos` (servicios, repuestos, ventas de mostrador), `Mercado Pago` (bruto, comisión, neto) e `Inventario` (activos, bajo mínimo, sin stock, valor a costo, margen de repuestos), formateadas con `formatClp`. Sin gráficos.

**Files**
- `src/pages/taller/indicadores.astro` — edit
- `src/components/taller/FinanceBlocks.astro` — new
- `tests/integration/indicadores-finance-page.test.ts` — new

Reglas: `taller-ui.md`. No cambia: bloques de la Etapa A, `indicadores-page.test.ts`, `e2e/indicadores.spec.ts`.

**Acceptance**

1. **WHEN** el dueño abre `/taller/indicadores` con un rango **THE SYSTEM SHALL** mostrar las secciones `Egresos del período`, `Balance`, `Mix de ingresos`, `Mercado Pago` e `Inventario` con los montos de `financeIndicators` en celdas `mono`
2. **WHEN** `reception` pide `/taller/indicadores` **THE SYSTEM SHALL** responder 403 como hoy
3. **WHEN** corre `indicadores-page.test.ts` **THE SYSTEM SHALL** pasar sin cambios en ese archivo
4. **WHEN** se cuentan las líneas de `src/pages/taller/indicadores.astro` **THE SYSTEM SHALL** tener menos de 400

**Verify**

```bash
pnpm test tests/integration/indicadores-finance-page.test.ts tests/integration/indicadores-page.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/pages/taller/indicadores.astro | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0 (incluye e2e/indicadores.spec.ts sin cambios)
```

**Checkpoint**

```bash
git add -A && git commit -m "feat: f2-34 show stage b blocks on indicators page" && git tag f2-34
git tag -l f2-34 | grep -qx f2-34   # expect: exit 0
```

### `E5-T5` — F2-35 Add phase health check and close the phase

**Depends on:** `E5-T4` · **Priority:** p0

1. `tests/integration/phase2-health.test.ts` primero: base sana; una anomalía por criterio (orden `neto` con IVA mal escrito vía `update` directo de `subtotal_clp`/`vat_clp`/`total_clp`; pago efectivo sin sesión después de un `cash.control_changed` con la caja habilitada; sesión cerrada con diferencia −6.000; un `stock_movements` insertado sin actualizar el producto).
2. `phase2-health.ts`: `phase2Health(db)` con las cuatro consultas de "Data model" (SQL parametrizado con `sql`; sin `branchId`: recorre todas las sucursales); `ok` = los cuatro en 0. Solo conteos, sin datos personales.
3. `scripts/f2-check.ts`: conecta con `postgres(getDbEnv().DATABASE_URL, { max: 1, connect_timeout: 10 })`; si `select 1` falla → stderr `No se pudo conectar a la base: <mensaje sin credenciales>` y `process.exit(2)`; si conecta, imprime el JSON de `phase2Health` y sale 0 si `ok`, 1 si no; cierra la conexión.
4. `package.json`: solo agregar `"f2:check": "node --env-file-if-exists=.env scripts/f2-check.ts"`.
5. `README.md`: sección `## Operación de la fase 2` con: los dos interruptores y dónde están (`/taller/catalogo`, `/taller/caja`), las tres ventanas (`docs/ventanas/f2-v*.md`), la importación inicial (`pnpm inventory:import <archivo.csv> <correo> [--dry-run]`, CSV fuera del repo), `pnpm f2:check` (qué mide, códigos 0/1/2, cada día del primer mes contra producción, lo corre el dueño), y la tabla de criterios FASE2 §14 → prueba (copiada de `blueprint.md` §9, al final de F2-35).

**Files**
- `src/server/taller/phase2-health.ts` — new
- `scripts/f2-check.ts` — new
- `package.json` — edit (un script)
- `README.md` — edit
- `tests/integration/phase2-health.test.ts` — new

Reglas: `taller-domain.md`. No negociable 4. No cambia: dependencias.

**Acceptance**

1. **WHEN** `phase2Health` corre sobre una base sin anomalías **THE SYSTEM SHALL** devolver `ok: true` con `netoInconsistent`, `cashUnlinked`, `cashDifferenceOver` y `stockDrift` en 0
2. **WHEN** existe una orden `neto` con `vat_clp` distinto de `vatOfNet(subtotal_clp)` **THE SYSTEM SHALL** contarla en `netoInconsistent` y devolver `ok: false`
3. **WHEN** existe un pago `efectivo` vigente sin `cash_session_id` creado después del último `cash.control_changed` de una sucursal con la caja habilitada **THE SYSTEM SHALL** contarlo en `cashUnlinked`
4. **WHEN** una sesión cerrada tiene una diferencia absoluta mayor que 5.000 **THE SYSTEM SHALL** contarla en `cashDifferenceOver`, y **WHEN** un producto tiene `stock_qty` distinto de la suma de sus movimientos **THE SYSTEM SHALL** contarlo en `stockDrift`
5. **WHEN** `node scripts/f2-check.ts` corre con un `DATABASE_URL` inalcanzable **THE SYSTEM SHALL** salir con código 2 y un mensaje que contiene `No se pudo conectar`
6. **WHEN** se leen `package.json` y `README.md` **THE SYSTEM SHALL** tener el script `f2:check` igual a `node --env-file-if-exists=.env scripts/f2-check.ts` y la sección `## Operación de la fase 2`

**Verify**

```bash
pnpm test tests/integration/phase2-health.test.ts   # expect: exit 0, 0 failed
out="$(DATABASE_URL=postgres://127.0.0.1:1/x node scripts/f2-check.ts 2>&1)"; test $? -eq 2 && printf '%s' "$out" | grep -q 'No se pudo conectar'   # expect: exit 0 — código 2 (conexión) y no 1 (umbral)
test "$(node -p "require('./package.json').scripts['f2:check']")" = "node --env-file-if-exists=.env scripts/f2-check.ts"   # expect: exit 0
grep -qF '## Operación de la fase 2' README.md   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -A && git commit -m "feat: f2-35 add phase health check and close the phase" && git tag f2-35
git tag -l f2-35 | grep -qx f2-35   # expect: exit 0
```
