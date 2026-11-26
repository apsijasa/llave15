# Vector Bikes — Sistema de Gestión Integral, Fase 2 "Inventario, caja y ventas de mostrador" — Blueprint de cambio

> Generado por The Architect el 2026-11-13 (modo brownfield, `/the-architect:architect-brownfield`)
> Forma: herramienta interna (`internal-tool`) sobre el sitio + taller existentes
> Runtime track: el del repo (Node 24, pnpm 12.4.2, Astro 7, TypeScript 6) — pins de `pnpm-lock.yaml`
> Modo de emisión: bundle (`blueprint.md`, `tasks.json`, `epics/01…05`, `workspace/`, `WORKSPACE_BASE`)
> Versión del blueprint: 2 (corrige la ronda 1 de validación: 3 MAJOR, 3 MINOR) · Versiones verificadas: 2026-11-13 — ver §11
> Fuente autoritativa: `blueprints/vector-taller-f2/FASE2.md`, aprobado por el dueño el 13-11-2026 (decisión 55). Este documento no la modifica.

Identificadores: cada paso se llama `F2-NN` (de `F2-00`, la tarea 0, a `F2-35`); su tarea en `tasks.json` es `E<épica>-T<n>` y su tag de checkpoint es `f2-NN`. Las decisiones propias de este blueprint se numeran `F2-D1`, `F2-D2`, …; solo se citan por número las decisiones globales 1–55 del blueprint de la fase 1 (la 56 y siguientes pertenecen a otras fases). Equivalencias en el mapa de §9.

La construcción es **supervisada**, igual que la fase 1 y la etapa A: la sesión coordinadora (Claude) escribe un encargo por tarea (`docs/encargos/F2-NN-*.md`, plantilla de `docs/encargos/README.md`), Codex implementa con pruebas primero, Claude revisa, corre `pnpm db:migrate`, `pnpm db:check`, `pnpm gate` y commitea. El dueño publica en Replit.

**Orden de las fases (decisión del dueño, 13-11-2026, F2-D27):** la fase 2 se construye **antes** que la "fase plataforma" (una instalación por taller, rama `feat/plataforma`, decisión 56). El dueño había fijado primero "plataforma primero" y lo cambió el mismo día porque la plataforma solo tenía diseño. La plataforma se rehace sobre la fase 2 ya integrada. **Precondición de la tarea 0:** el árbol no tiene archivos sin seguimiento duplicados por iCloud (`* 2`, `* 2.*`, BITACORA): la sesión coordinadora los borra después de confirmar que son copias. Este blueprint se escribió sobre el commit `76ebdce`: **cada paso relee los archivos que toca** y no confía en los conteos de líneas citados aquí (§20.2).

**Regla transversal de esta fase:** ningún texto para el usuario, correo, título ni página escribe el nombre del taller literal; se usa `SITE` (`src/lib/site.ts`, `SITE.name`), para que la fase plataforma, que viene después, no tenga que reescribir lo nuevo. Aplica a cada paso y está en `workspace/CLAUDE.md`.

---

## 1. Visión general y No-Objetivos

### Visión
Que un repuesto vendido o usado en una orden descuente stock solo, que el día cierre con la caja cuadrada sin planilla y que el dueño vea ingresos, egresos y margen del período en `/taller/indicadores` (FASE2 §1). Escala: una sucursal, dos personas en el mostrador, del orden de 150 productos, 10 a 20 bicicletas por semana. Principio central (FASE2 §4): ningún número de stock ni de caja se escribe a mano; todo es consecuencia de un movimiento con autor, fecha y referencia.

### Current state
Repo en `main` (`76ebdce` al generar; la fase plataforma va después, F2-D27). Astro 7 SSR en Replit Autoscale, Postgres 16 vía Drizzle 0.45. Esquema en cuatro archivos que importan en un sentido: `schema.ts` ← `schema-taller.ts` ← `schema-orders.ts` (399 líneas: órdenes, líneas, fotos, firmas, aprobaciones, control de calidad, **pagos** y **componentes**) ← `schema-reports.ts`. Dominio en `src/server/taller/**`: `items.ts` (385 líneas; `recomputeOrderTotals`, `addPartItem`, `voidItem`, `listItems` que devuelve la fila completa), `orders.ts` (395; dos inserciones de `work_orders`: `insertReceptionOrder` y `openWarrantyOrder`, numeradas por `allocateOrderNumber`), `payments.ts` (229; `recordPayment`, `voidPayment`, `listPayments`, `recomputePaid`), `delivery.ts` (`completeDelivery` exige `paid_clp = total_clp`), `indicators.ts` (289; Etapa A, decisión 54), `history.ts` (319), `reports.ts` (390), `approvals.ts` (369), `reception.ts` (372), `qc.ts`, `quotes.ts`, `maintenance.ts` (resumen diario de atrasos). Correos en `src/server/email/templates.ts` (371) y `order-templates.ts`. 29 acciones en `permissions.ts`. Pruebas: Vitest + PGlite (una conexión: `FOR UPDATE` concurrente se traba, BITACORA §8), specs de Playwright en tablet, `scripts/smoke.sh`; compuerta `pnpm gate`. Sin inventario, caja, proveedores, ventas ni costos.

### Target state
Mismo proyecto, base y despliegue (FASE2 §2.1.1). Cadena de esquema final: `schema.ts` ← `schema-taller.ts` ← `schema-inventory.ts` ← `schema-orders.ts` ← `schema-reports.ts` ← `schema-cash.ts` ← `schema-sales.ts` ← `schema-payments.ts` (F2-D1). Nuevo dominio: `stock.ts` (único punto que cambia stock), `products.ts`, `suppliers.ts`, `purchases.ts`, `part-stock.ts`, `order-totals.ts` (neto/IVA/total por régimen), `order-creation.ts`, `sales.ts`, `sale-void.ts`, `cash.ts`, `refunds.ts`, `expenses.ts`, `low-stock.ts`, `inventory-import.ts`, `indicators-finance.ts`, `phase2-health.ts`. Páginas servidor sin islas nuevas: `/taller/inventario`, `/nuevo`, `/[id]`, `/taller/proveedores`, `/taller/compras`, `/[id]`, `/taller/ventas`, `/nueva`, `/taller/gastos`, `/taller/caja`; grupo de menú "Inventario y caja". Dos interruptores por sucursal: `branches.new_order_pricing_mode` (`final`|`neto`) y `branches.cash_control_enabled`. Siete acciones nuevas. Tres ventanas de publicación (V1, V2, V3).

### Usuarios
| Persona | Qué viene a hacer | Frecuencia |
|---|---|---|
| Dueño (`owner`) | Compras, ajustes, precios, gastos, devoluciones, descuentos, interruptores, indicadores | Diaria |
| Administración (`admin`) | Lo mismo que el dueño salvo usuarios, auditoría y control de calidad | Diaria |
| Recepción (`reception`, tablet o escritorio) | Venta de mostrador, cobros, abrir y cerrar caja, ver inventario | Diaria |
| Mecánico (`mechanic`, tablet) | Ver inventario sin costos; sus órdenes como hoy | Diaria |

### Objetivos — alcance de la fase 2
1. Productos con stock que solo cambia por movimientos; ajustes con motivo; alerta de stock mínimo en `/taller` y en el resumen diario.
2. Proveedores y órdenes de compra; recibir una compra suma stock y actualiza el costo promedio ponderado.
3. Repuestos de la orden ligados a producto, que descuentan stock en la misma transacción y lo devuelven al anular.
4. Precios netos e IVA con corte por régimen, sin reescribir órdenes anteriores (FASE2 §2.4.1).
5. Ventas de mostrador con cliente opcional, pagos ampliados (Mercado Pago solo como registro).
6. Caja diaria con apertura, movimientos, cierre con diferencia y devoluciones; gastos con categoría cerrada.
7. Indicadores Etapa B y una revisión de salud (`pnpm f2:check`) para el mes de operación.

### No-Objetivos — fuera de alcance
**El builder no implementa nada de esta tabla.** Si un paso parece requerirlo, es un defecto del blueprint: detenerse y reportarlo. Las filas "Tema" reproducen la cerca de FASE2 §2.5; las filas **Constante** son las interfaces congeladas de §5.

| No se construye | Por qué no ahora | Se revisa cuando |
|---|---|---|
| Pago en línea (link de Mercado Pago, webhook) | Primero conciliar a mano un mes; después automatizar (FASE2 §2.5) | Fase posterior (`FASE3.md`) |
| Cuentas de clientes, portal, puntos, membresías | Fuera del sistema (FASE1 §2.4, punto 48) | — |
| Multi-sucursal, convenios, tienda online | Fase 4; `branch_id` ya está en todo | Segunda sucursal |
| Strava, kilómetros, desgaste, mantenimiento predictivo | Fase 3 | Fase 2 cerrada |
| Asistente de WhatsApp, reseñas automáticas | Fase 3; requiere Meta | Fase 2 cerrada |
| Portal de proveedores, cuentas por pagar con vencimientos | Por definir: la fase 2 registra la compra y su documento | Un mes de uso de compras |
| Cotizaciones sin orden de trabajo | Pregunta abierta del roadmap; la cotización por correo de la orden existe (decisión 50) | Decisión del dueño |
| Comparativas contra el período anterior, metas, reportes descargables | Etapa C de `dashboard-financiero.md` | Etapa B en uso |
| Emisión de boletas o facturas | Decisión 10: el POS/SII sigue fuera; solo se anotan tipo y folio | Integración SII decidida aparte |
| Devoluciones por medios distintos del efectivo | La devolución es un egreso de caja (FASE2 §2.3.15); por transferencia se anula el pago mientras se pueda (F2-D9) | Un mes de uso de la caja |
| Lectura con lector de códigos en la venta | Depende del lector (FASE2 §12.5); la búsqueda de inventario ya acepta el código | El dueño compra el lector |
| **Constante:** flujo público de reserva y su API (`/api/disponibilidad`, `/api/reservas`), `/reservas/cancelar` y las columnas de `bookings` | Interfaz congelada (§5) | — |
| **Constante:** rutas de orden existentes y firmas exportadas (`recordPayment`, `voidPayment`, `listPayments`, `addPartItem`, `addCatalogItem`, `voidItem`, `recomputeOrderTotals`, `completeDelivery`, `startReception`, `openWarrantyOrder`…) | Solo se agregan campos opcionales o funciones nuevas (F2-D5) | — |
| **Constante:** semántica de `work_orders_delivered_paid_check` y `total_clp` como "monto a cobrar" | El corte por régimen la conserva (F2-D3) | — |
| **Constante:** tokens de seguimiento, informe y aprobación; snapshot v1 del informe | Interfaz congelada; el informe solo gana campos opcionales | — |
| **Constante:** pruebas existentes salvo las ediciones autorizadas por la decisión 55 | `docs/encargos/README.md` | — |
| **Constante:** `e2e/global-setup.ts`, `e2e/fixtures.ts`, `playwright.config.ts`; tokens de `global.css` | `.claude/rules/e2e.md`, `ui-design.md` | — |

### Métricas de éxito
| Métrica | Meta | Cómo se mide |
|---|---|---|
| Operación sin planilla | Un mes con stock y caja (FASE2 §14.14) | El dueño lo confirma; `pnpm f2:check` sale 0 cada día del mes |
| Caja cuadrada | Ninguna sesión con diferencia absoluta > 5.000 | `select count(*) from cash_sessions where closed_at is not null and abs(difference_clp) > 5000` = 0 |
| Stock coherente | Ningún producto con stock distinto de la suma de sus movimientos | `stockDrift` = 0 en `pnpm f2:check` |
| `pnpm gate` | Verde en cada paso y antes de cada ventana | Salida de la compuerta |

---

## 2. Stack

**Runtime track: el del repo.** Esta fase no agrega ni actualiza dependencias (§11).

| Capa | Elección | Por qué esto y no lo otro |
|---|---|---|
| Lenguaje / runtime | TypeScript 6 sobre Node 24 | El del repo; Node quita tipos en `scripts/` |
| Framework | Astro 7 SSR, páginas con `prerender = false` | Patrón probado de `/taller`; rechazado: una SPA de punto de venta (segundo despliegue) |
| Estilos | `global.css` + `taller-layout.css` / `taller-components.css` | Sin hex nuevos (FASE2 §9) |
| Componentes | HTML de servidor, formularios POST; ninguna isla nueva | FASE2 §13.10; la venta sin JS usa "Calcular total" en el servidor (F2-D8) |
| Base de datos | Postgres 16 de Replit (misma base) | FASE2 §2.1.1 |
| Acceso a datos | Drizzle; reglas en CHECK e índices, sin triggers | Triggers exigirían SQL a mano en `drizzle/` |
| Auth | Sesión propia + `can(role, action)` | Ya en producción; 7 acciones nuevas |
| Segundo plano | `/api/tareas/alertas` existente (Make.com) | El stock bajo se suma al resumen diario |
| Pagos | NOT APPLICABLE — Mercado Pago solo como registro manual (FASE2 §2.1.3) | — |
| Archivos | Sin cambios | — |
| Correo | Resend existente | Mismas plantillas con desglose neto/IVA |
| Hosting | Replit Autoscale; `.replit` intacto | FASE2 §2.1.1 |
| Gestor | pnpm 12.4.2 vía corepack (fijado en `.replit`, nunca `packageManager`) | El del repo |

### Chequeo de compatibilidad
Revisado contra `knowledge/stack-compatibility.md`: no hay combinación nueva; el stack es el de la fase 1, que ya pasó ese chequeo. Riesgo propio: `num_nonnulls` en un CHECK (F2-19) — función de Postgres desde 9.6, presente en Postgres 16 y en PGlite 0.5.8 (Postgres 17).

---

## 3. Estructura de directorios

```
vector-bikes/
├── CLAUDE.md · AGENTS.md · .claude/settings.json · .claude/rules/{database,taller-domain,taller-ui}.md
│   · .claude/skills/add-migration/SKILL.md                     # workspace/ (Bootstrap)
├── docs/ventanas/f2-v1.md (F2-17) · f2-v2.md (F2-24) · f2-v3.md (F2-32)
├── drizzle/                                                    # generado por pnpm db:generate (F2-02, 18, 19, 20, 25, 26)
├── e2e/inventario-ajuste.spec.ts (F2-04) · venta-mostrador.spec.ts (F2-22) · caja-efectivo.spec.ts (F2-31)
├── scripts/db-check.ts (F2-00, 02, 18, 25) · inventory-import.ts (F2-06) · f2-check.ts (F2-35)
├── package.json (F2-06, F2-35: solo dos scripts) · README.md (F2-35)
└── src/
    ├── layouts/TallerLayout.astro (F2-04, 08, 22, 30, 31)
    ├── components/taller/LowStockNotice.astro (F2-05) · OrderAmounts.astro (F2-11) · ReportView.astro (F2-15)
    │   · FinanceBlocks.astro (F2-34)
    ├── pages/
    │   ├── aprobacion/[token].astro (F2-16)
    │   └── taller/
    │       ├── index.astro (F2-05) · catalogo/index.astro (F2-10) · indicadores.astro (F2-34)
    │       ├── inventario/index.astro · nuevo.astro · [id].astro (F2-04)
    │       ├── proveedores/index.astro · compras/index.astro · compras/[id].astro (F2-08)
    │       ├── ventas/index.astro · ventas/nueva.astro (F2-22)
    │       ├── gastos/index.astro (F2-30) · caja/index.astro (F2-31)
    │       └── ordenes/[id]/index.astro · recepcion.astro (F2-11) · entrega.astro (F2-11, 23, 28)
    │           · lineas.astro (F2-12) · adicional.astro (F2-16)
    └── server/
        ├── auth/permissions.ts (F2-01)
        ├── db/schema.ts (F2-02, 18, 25) · schema-inventory.ts (F2-02) · schema-orders.ts (F2-00, 02)
        │   · schema-sales.ts (F2-18, 26) · schema-cash.ts (F2-25) · schema-payments.ts (F2-00, 19, 20, 26)
        ├── email/amounts.ts (F2-13) · templates.ts · order-templates.ts (F2-13)
        └── taller/ stock · products (F2-03) · low-stock (F2-05) · inventory-import (F2-06) · suppliers · purchases (F2-07)
                    · order-totals (F2-09) · order-creation (F2-10) · part-stock (F2-12) · report-snapshot (F2-15)
                    · sales · sale-void (F2-21, 29) · cash (F2-27) · refunds (F2-29) · expenses (F2-30)
                    · indicators-finance (F2-33) · phase2-health (F2-35) (.ts, nuevos)
                    · rules (F2-03, 07, 09, 20, 21, 27, 30) · audit (F2-03) · items (F2-09, 12) · orders (F2-10)
                    · payments (F2-00, 19, 23, 28) · history (F2-00, 19, 21) · maintenance (F2-05)
                    · reception · qc · quotes (F2-14) · reports (F2-00, 15) · approvals (F2-16)
                    · indicators (F2-00, 23) · components · dashboard (F2-00) (.ts, modificados)
tests/unit/permissions.test.ts (F2-01, autorizado) · pricing-emails.test.ts (F2-13)
tests/integration/<archivo>.test.ts                             # uno nuevo por paso; ver cada paso
```

**Reglas de frontera.** Las de `CLAUDE.md` sin cambios: `src/components/**` nunca importa `src/server/**` (por eso `OrderAmounts` y `FinanceBlocks` reciben montos ya formateados); `src/layouts/**` solo importa `permissions.ts`; `scripts/**` importa `src/server/**` y `src/lib/**`; `e2e/**` habla por HTTP. La convención de importación se reconcilia en §19.6.

### Delta
- **Nuevos:** 4 archivos de esquema, 17 módulos de dominio, `email/amounts.ts`, 3 componentes, 10 páginas, 2 scripts, 3 specs, 3 documentos de ventana y las pruebas de cada paso.
- **Modificados:** `schema.ts`, `schema-orders.ts`, `db-check.ts`, `permissions.ts`, `rules.ts`, `audit.ts`, `items.ts`, `orders.ts`, `payments.ts`, `history.ts`, `components.ts`, `reports.ts`, `dashboard.ts`, `indicators.ts`, `maintenance.ts`, `reception.ts`, `qc.ts`, `quotes.ts`, `approvals.ts`, `templates.ts`, `order-templates.ts`, `TallerLayout.astro`, `ReportView.astro`; las páginas existentes `src/pages/taller/index.astro`, `src/pages/taller/catalogo/index.astro`, `src/pages/taller/indicadores.astro`, `src/pages/aprobacion/[token].astro`, `src/pages/taller/ordenes/[id]/index.astro`, `src/pages/taller/ordenes/[id]/recepcion.astro`, `src/pages/taller/ordenes/[id]/entrega.astro`, `src/pages/taller/ordenes/[id]/lineas.astro` y `src/pages/taller/ordenes/[id]/adicional.astro`; `package.json` (dos scripts), `README.md`; solo las líneas de import de seis pruebas (F2-00) y `permissions.test.ts` (F2-01), ambas autorizadas por la decisión 55.
- **Eliminados:** nada. `allocateOrderNumber` se **mueve** a `order-creation.ts` con la misma firma (ningún importador fuera de `orders.ts`; F2-D17).

---

## 4. Modelo de datos

Reglas (`database.md`): `id uuid defaultRandom()`, `created_at`/`updated_at` con los helpers de `schema.ts`, dinero `integer` CLP, `branch_id` not null → `branches` restrict (**B**) en toda tabla nueva, FKs `restrict`, CHECK con SQL literal, sin triggers. **V** = `voided_at` + `voided_by → users`. **CB** = `created_by uuid not null → users`.

### Entidades (paso que crea entre paréntesis)

**`schema.ts`** — `branches` gana: `next_purchase_number integer not null default 1` (`>= 1`) y `new_order_pricing_mode text not null default 'final'` (`in ('final','neto')`) (F2-02); `next_sale_number integer not null default 1` (`>= 1`) (F2-18); `cash_control_enabled boolean not null default false` (F2-25).

**`schema-inventory.ts`** (`inventoryTables`, F2-02; importa solo de `schema.ts`)
- `suppliers`: B, `name text not null`, `rut text` (normalizado con `normalizeRut`), `phone`, `email`, `notes`, `is_active boolean not null default true`; único `(branch_id, rut) where rut is not null`; índice `(branch_id, name)`.
- `products`: B, `sku text not null`, `name text not null`, `category text not null` (`in ('repuesto','accesorio','insumo','bicicleta_usada')`), `unit text not null default 'unidad'`, `cost_clp integer not null default 0`, `price_clp integer not null`, `stock_qty integer not null default 0`, `min_stock integer not null default 0`, `barcode text`, `serial_number text`, `supplier_id uuid → suppliers`, `is_active boolean not null default true`, CB. Únicos `(branch_id, sku)`, `(branch_id, barcode) where barcode is not null`; CHECK `stock_qty >= 0` (`products_stock_qty_check`), `cost_clp >= 0 and price_clp >= 0 and min_stock >= 0`, `category <> 'bicicleta_usada' or serial_number is not null`; índice `(branch_id, category)`.
- `stock_movements`: B, `product_id → products`, `kind text not null` (`in ('compra','venta','consumo_orden','ajuste','devolucion','anulacion')`), `quantity integer not null` (`<> 0`; signo: `compra`/`devolucion` > 0, `venta`/`consumo_orden` < 0, `ajuste`/`anulacion` cualquiera), `unit_cost_clp integer` (`>= 0` si no es nulo), `reference_kind text` (`in ('purchase_order','work_order_item','sale','sale_refund','import')`), `reference_id uuid` (ambos nulos o ambos presentes), `note text` (obligatoria en `ajuste`), CB. Índice `(product_id, created_at)`. Sin V: un movimiento se revierte con otro (`anulacion`).
- `purchase_orders`: B, `supplier_id → suppliers` not null, `number integer not null` (`>= 1`), `status text not null default 'borrador'` (`in ('borrador','enviada','recibida','anulada')`), `doc_type` (`is null or in ('factura','boleta','guia')`), `doc_number`, `notes`, `received_at`, `received_by → users`, V, CB. Único `(branch_id, number)`; CHECK `status <> 'recibida' or (received_at is not null and received_by is not null)`, `(status = 'anulada') = (voided_at is not null)`.
- `purchase_order_items`: B, `purchase_order_id → purchase_orders`, `product_id → products`, `quantity integer not null` (`> 0`), `unit_cost_clp integer not null` (`>= 0`), `received_qty integer not null default 0` (`between 0 and quantity`). Índice `(purchase_order_id)`.

**`schema-orders.ts`** (F2-02) — `work_orders` gana `pricing_mode text not null default 'final'` (`in ('final','neto')`), `subtotal_clp integer not null default 0`, `vat_clp integer not null default 0` (ambos `>= 0`) y **`work_orders_pricing_total_check`: `pricing_mode = 'final' or total_clp = subtotal_clp + vat_clp`**. `work_order_items` gana `product_id uuid → products` (null) y `unit_cost_clp integer` (null, `>= 0`), con CHECK `product_id is null or (kind = 'repuesto' and unit_cost_clp is not null)`. Ninguna columna existente cambia.

**`schema-sales.ts`** (`saleTables`, F2-18; importa de `schema.ts`, `schema-taller.ts`, `schema-inventory.ts`; F2-26 agrega la importación de `schema-cash.ts`)
- `sales`: B, `number integer not null` (`>= 1`), `customer_id uuid → customers` (null), `status text not null default 'abierta'` (`in ('abierta','pagada','anulada')`), `subtotal_clp` (neto después del descuento), `discount_clp integer not null default 0`, `discount_reason text`, `vat_clp`, `total_clp`, `paid_clp integer not null default 0` (todos `>= 0`), `doc_type` (`is null or in ('boleta','factura')`), `doc_number`, `void_reason`, V, CB; F2-26: `cash_session_id uuid → cash_sessions` (null). Único `(branch_id, number)`; CHECK `total_clp = subtotal_clp + vat_clp`, `status <> 'pagada' or paid_clp = total_clp`, `discount_clp = 0 or discount_reason is not null`, `(status = 'anulada') = (voided_at is not null)`; índices `(branch_id, created_at)`, `(customer_id)`.
- `sale_items`: B, `sale_id → sales`, `product_id → products` not null, `description text not null`, `quantity` (`> 0`), `unit_price_clp`, `unit_cost_clp` (ambos `>= 0`, not null). Índice `(sale_id)`.

**`schema-cash.ts`** (`cashTables`, F2-25; importa de `schema.ts` y `schema-inventory.ts`)
- `cash_sessions`: B, `opened_at timestamptz not null`, `opened_by → users` not null, `opening_cash_clp integer not null` (`>= 0`), `closed_at`, `closed_by → users`, `counted_cash_clp`, `expected_cash_clp`, `difference_clp`, `note`. **Único parcial `uq_cash_sessions_open (branch_id) where closed_at is null`**; CHECK `(closed_at is null and closed_by is null and counted_cash_clp is null and expected_cash_clp is null and difference_clp is null) or (closed_at is not null and closed_by is not null and counted_cash_clp is not null and expected_cash_clp is not null and difference_clp = counted_cash_clp - expected_cash_clp)`, `counted_cash_clp is null or counted_cash_clp >= 0`.
- `cash_movements`: B, `cash_session_id → cash_sessions` not null, `kind` (`in ('ingreso','egreso')`), `amount_clp` (`> 0`), `reference_kind` (`in ('payment','expense','sale_refund','order_refund')`), `reference_id uuid not null`, `note`, V, CB. Índices `(cash_session_id, created_at)`, `(reference_kind, reference_id)`.
- `expenses`: B, `category` (`in ('arriendo','sueldos','servicios','insumos','repuestos','otros')`), `amount_clp` (`> 0`, neto), `expense_date date not null`, `description text not null`, `supplier_id → suppliers` (null), `method` (`in ('efectivo','transferencia','tarjeta','otro')`), `doc_type` (`is null or in ('boleta','factura')`), `doc_number`, `cash_session_id → cash_sessions` (null), `void_reason`, V, CB. Índice `(branch_id, expense_date)`.

**`schema-payments.ts`** (`paymentTables`, F2-00; F2-19 importa `schema-sales.ts`, F2-26 `schema-cash.ts`)
- `payments`: igual que hoy (F2-00) y luego: `work_order_id` **nullable** (F2-19, quitar un NOT NULL es aditivo), `sale_id uuid → sales` (null), `external_id text`, `fee_clp integer not null default 0`, `net_clp integer` (F2-19); CHECK `payments_target_check`: `num_nonnulls(work_order_id, sale_id) = 1`; `payments_fee_check`: `fee_clp >= 0 and fee_clp <= amount_clp`; `payments_net_check`: `net_clp is null or net_clp = amount_clp - fee_clp`; `payments_mercadopago_check`: `method <> 'mercadopago' or external_id is not null`; índice `(sale_id)`. **F2-20 (única excepción no aditiva):** `payments_method_check` pasa a `method in ('transferencia','tarjeta','efectivo','otro','mercadopago')`. F2-26: `cash_session_id uuid → cash_sessions` (null), índice.
- `bike_components`: igual que hoy, solo cambia de archivo (F2-00).

Tablas nuevas: 5 (F2-02) + 2 (F2-18) + 3 (F2-25) = 10, las de FASE2 §5.

### Relaciones
suppliers 1—N products, purchase_orders · purchase_orders 1—N purchase_order_items · products 1—N stock_movements, purchase_order_items, sale_items, work_order_items (opcional) · sales 1—N sale_items, payments · customers 1—N sales (opcional) · cash_sessions 1—N cash_movements, payments, sales, expenses · payments N—1 exactamente uno de work_orders o sales. Borrado: `restrict` en todo; nada se borra.

### Índices
| Tabla | Índice | Por qué |
|---|---|---|
| `products` | `(branch_id, sku)` único, `(branch_id, barcode)` parcial único, `(branch_id, category)` | Búsqueda por SKU o código (lector) y filtro por categoría |
| `stock_movements` | `(product_id, created_at)` | Historial de la ficha y `stockDrift` |
| `cash_sessions` | `(branch_id) where closed_at is null` único | Una sesión abierta por sucursal (FASE2 §2.3.11) |
| `cash_movements` | `(cash_session_id, created_at)`, `(reference_kind, reference_id)` | Lista de la sesión; anular el movimiento de un pago o gasto |
| `sales` | `(branch_id, number)` único, `(branch_id, created_at)`, `(customer_id)` | Numeración, lista del día, historial del cliente |
| `expenses` | `(branch_id, expense_date)` | Egresos del período |
| `payments` | `(sale_id)`, `(cash_session_id)` | Pagos de una venta; cierre de caja |

### Schema
El código Drizzle literal lo escribe cada paso de esquema siguiendo exactamente las columnas, tipos, defaults, nombres de CHECK e índices de arriba (nombres de restricción con el prefijo de la tabla, como en `schema-orders.ts`). Las épicas repiten la tabla completa de cada paso. Ejemplo del patrón obligatorio (F2-02):

```ts
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: branchReference(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    category: text("category").$type<ProductCategory>().notNull(),
    unit: text("unit").notNull().default("unidad"),
    costClp: integer("cost_clp").notNull().default(0),
    priceClp: integer("price_clp").notNull(),
    stockQty: integer("stock_qty").notNull().default(0),
    minStock: integer("min_stock").notNull().default(0),
    barcode: text("barcode"),
    serialNumber: text("serial_number"),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "restrict" }),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: creatorReference(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_products_branch_sku").on(t.branchId, t.sku),
    uniqueIndex("uq_products_branch_barcode").on(t.branchId, t.barcode).where(sql`barcode is not null`),
    index("idx_products_branch_category").on(t.branchId, t.category),
    check("products_stock_qty_check", sql`stock_qty >= 0`),
    check("products_amounts_check", sql`cost_clp >= 0 and price_clp >= 0 and min_stock >= 0`),
    check("products_category_check", sql`category in ('repuesto', 'accesorio', 'insumo', 'bicicleta_usada')`),
    check("products_used_bike_serial_check", sql`category <> 'bicicleta_usada' or serial_number is not null`),
  ],
);
```

### Migraciones
`pnpm db:generate` emite el SQL con nombre elegido por drizzle-kit ("la migración que emite `pnpm db:generate`"). Seis generaciones: F2-02, F2-18, F2-19, F2-20, F2-25, F2-26; F2-00 no genera nada. Todas aditivas salvo F2-20, que solo reemplaza `payments_method_check` y va sola (decisión 55, F2-D6). Nunca `--custom`, nunca editar `drizzle/`; si drizzle-kit pregunta algo, detenerse: el cambio no es aditivo. `pnpm db:migrate` solo contra la base dev. Replit propaga el esquema al publicar, sin datos y sin correr `drizzle/` (`database.md`).

### Datos iniciales
Producción: la sucursal ya existe; sus columnas nuevas toman los valores por defecto (`final`, caja deshabilitada). El inventario inicial entra con `pnpm inventory:import` (F2-06, lo corre el dueño) o desde `/taller/inventario/nuevo`. Pruebas: PGlite por prueba; E2E: los specs nuevos crean sus datos por la interfaz (`global-setup.ts` no cambia: vacía todas las tablas de `public`, incluidas las nuevas).

### Delta
+10 tablas; +4 columnas en `branches`; +3 en `work_orders`; +2 en `work_order_items`; `payments`: `work_order_id` nullable, +5 columnas, 4 CHECK nuevos y el CHECK de método reemplazado; `sales` +1 columna en F2-26.

---

## 5. Diseño de API

### Conventions
- Funciones de dominio: `(db, actor, …, now)` → `{ ok: true, … } | { ok: false, code }`; solo lo inesperado lanza. Cuando un error se descubre dentro de una transacción después de escribir, se lanza un error centinela y se traduce a `{ ok: false, code }` fuera de ella (devolver un error no revierte; comentario existente en `items.ts`). Las funciones internas que **solo** corren dentro de una transacción ajena reciben `tx` como primer argumento (`applyStockMovement`, `requireOpenCashSession`, `recordCashMovement`, `voidCashMovementFor`, `reverseItemStock`).
- Códigos nuevos: `out_of_stock`, `cash_closed`, `cash_session_open`, `cash_session_closed`, `cash_control_off`, `rut_exists`, `sku_exists`, `invalid_amount`, `invalid_status`, `forbidden`, `not_found`, `validation_error`.
- Páginas `/taller/**`: POST → 303 a la misma página con `?hecho=<acción>`, o 4xx con el error en texto (`role="alert"`): `validation_error`/`invalid_amount` 422, `forbidden` 403, `not_found` 404, el resto 409.
- Validación: esquemas zod exportados por cada módulo; mensajes en español de Chile.
- Sin paginación: límites fijos (inventario 300 filas, ventas y gastos 200, sesiones 30, movimientos de un producto 50).
- Idempotencia: el único punto con reintento externo es `/api/tareas/alertas`, no idempotente por diseño (un correo por llamada, Make.com la llama una vez al día).

### Routes
| Método | Ruta | Descripción | Auth | Límite |
|---|---|---|---|---|
| GET/POST | `/taller/inventario` | Lista, filtros (`q`, `categoria`, `bajo=1`) | `inventory.view` | 300 filas |
| GET/POST | `/taller/inventario/nuevo` | Crear producto | `inventory.adjust` | — |
| GET/POST | `/taller/inventario/[id]` | Ficha, movimientos, ajuste, edición | `inventory.view` (escribir: `inventory.adjust`) | 50 movimientos |
| GET/POST | `/taller/proveedores` | Proveedores | `purchases.manage` | — |
| GET/POST | `/taller/compras`, `/taller/compras/[id]` | Compras y su recepción | `purchases.manage` | 200 |
| GET/POST | `/taller/ventas`, `/taller/ventas/nueva` | Ventas del día o rango; nueva venta | `sales.record` (anular: `payments.void`) | 200; rango ≤ 31 días |
| GET/POST | `/taller/gastos` | Gastos | `expenses.record` | 200 |
| GET/POST | `/taller/caja` | Caja, cierre, devoluciones, interruptor | `cash.open_close` (devolución: `payments.void`; interruptor: `dashboard.finance`) | 30 sesiones |
| POST | `/taller/catalogo` (`action=pricing`) | Régimen de precios de órdenes nuevas | `catalog.edit` | — |
| POST | `/api/tareas/alertas` | + productos bajo mínimo | Bearer `TASKS_SECRET` | — |

### Critical endpoints
- **`createSale(db, actor, input, now)`** (F2-21, F2-29): `sales.record`; descuento > 0 exige `items.override_price`; transacción: numerar (`next_sale_number`), bloquear cada producto, insertar venta e ítems con precio y costo congelados, `applyStockMovement(venta)` por ítem, calcular `subtotal = Σ − descuento` (negativo → `invalid_amount`), `vat = vatOfNet(subtotal)`, `total`; insertar el pago `final` con `sale_id` (Mercado Pago exige `externalId`; `net = amount − fee`); con la caja habilitada y método `efectivo`, exige la sesión abierta (si no, `cash_closed` y nada se escribe) y crea `cash_movements(ingreso)`; venta `pagada`; auditoría `sale.created`, `sale.discounted`, `payment.recorded` (entidad `sale`).
- **`recordPayment`** (existente, F2-23, F2-28): misma firma; acepta `externalId?`, `feeClp?` y `mercadopago`; con la caja habilitada y `efectivo`, sesión obligatoria (`cash_closed`) + movimiento; sin caja habilitada, exactamente como hoy.
- **`voidPayment`** (existente, F2-28): si el pago tiene `cash_session_id` y la sesión cerró → `cash_session_closed` (el dueño registra una devolución en `/taller/caja`); si sigue abierta, anula también el movimiento.
- **`closeCashSession`** (F2-27): esperado = apertura + Σ ingresos vigentes − Σ egresos vigentes; diferencia = contado − esperado; `cash.closed` con los tres valores.
- **`applyStockMovement(tx, actor, input, now)`** (F2-03): `select … for update` del producto de la sucursal; `stock + quantity < 0` → `out_of_stock`; en `compra`, `cost = round((stock × cost + qty × unit) / (stock + qty))` (si el stock era 0, el costo de la compra); inserta el movimiento y actualiza `stock_qty` (y `cost_clp`); un `23514` de `products_stock_qty_check` también se traduce a `out_of_stock`.

### Delta
Nuevas: las páginas de la tabla y las funciones de §3. Modificadas (solo campos opcionales o comportamiento detrás de un interruptor): `recordPayment`, `voidPayment`, `listPayments` (omite `feeClp`/`netClp` sin `costs.view`), `listItems` (omite `unitCostClp` sin `costs.view`), `voidItem` (revierte stock si la línea tiene producto), `recomputeOrderTotals` (régimen `neto`), `sendOverdueDigest` (stock bajo), `customerTimeline` (ventas), `workshopIndicators` (fila Mercado Pago solo si hay pagos de ese método), `quoteTotalClp(items, mode?)`, plantillas de correo (régimen opcional), `viewApproval` (devuelve `pricingMode`).

### Interfaces held constant
| Interfaz | Garantía | Prueba |
|---|---|---|
| Reserva pública, `/reservas/cancelar`, `bookings` | Sin cambios en esta fase | `api.test.ts`, `cancel-flow.test.ts`, `concurrency.test.ts` |
| Firmas exportadas de orden, ítems, pagos y entrega | Solo campos opcionales o funciones nuevas | Todo `tests/integration` sin cambios |
| `work_orders_delivered_paid_check` y `total_clp` = monto a cobrar | Igual en ambos regímenes | `delivery.test.ts` + F2-11 |
| Órdenes `final`: totales, correos, pantallas | Idénticas a hoy | §9.1 |
| Efectivo sin control de caja | Idéntico a hoy | `payments.test.ts` + F2-28 |
| Tokens de seguimiento, informe y aprobación; snapshot v1 | Sin cambios; el snapshot solo gana campos opcionales en `neto` | `reports.test.ts`, `report-page.test.ts`, `approval-page.test.ts`, `tracking*.test.ts` |
| Etapa A de indicadores | Cuatro filas por método sin pagos Mercado Pago | `indicators.test.ts`, `indicadores-page.test.ts` |
| `e2e/global-setup.ts`, `fixtures.ts`, `playwright.config.ts`, tokens de diseño | Sin cambios | `pnpm test:tablet` |

---

## 6. Arquitectura de frontend

### Routes
| Ruta | Página | Datos | Auth |
|---|---|---|---|
| `/taller/inventario` (+`/nuevo`, `/[id]`) | Inventario | `products.ts`, `stock.ts` | `inventory.view` / `inventory.adjust` |
| `/taller/proveedores`, `/taller/compras`, `/[id]` | Compras | `suppliers.ts`, `purchases.ts` | `purchases.manage` |
| `/taller/ventas`, `/nueva` | Ventas de mostrador | `sales.ts`, `sale-void.ts` | `sales.record` |
| `/taller/gastos` | Gastos | `expenses.ts` | `expenses.record` |
| `/taller/caja` | Caja | `cash.ts`, `refunds.ts` | `cash.open_close` |
| `/taller/indicadores` | + Etapa B | `indicators-finance.ts` | `dashboard.finance` |
| `/taller`, `/taller/catalogo`, `/taller/ordenes/[id]/*`, `/aprobacion/[token]` | Existentes con agregados | — | Como hoy |

### Rendering strategy
Todo con `prerender = false`, `cache-control: no-store` y `noindex` (heredado de `TallerLayout`). Ninguna isla nueva: las dos islas siguen siendo `PhotoCapture` y `SignaturePad`.

### Component hierarchy
```
TallerLayout (servidor; grupo "Inventario y caja" filtrado por can)
└─ ventas/nueva.astro (servidor)
   └─ <form method=post>
      ├─ 5 filas: <select> Producto N + <input> Cantidad N
      ├─ Teléfono del cliente (opcional) · [Descuento (neto), Motivo del descuento] si items.override_price
      ├─ <fieldset> Medio de pago · <fieldset> Solo Mercado Pago (Id de la operación, Comisión)
      ├─ <button name=action value=preview> Calcular total → <dl> Neto / IVA (19%) / Total
      └─ <button name=action value=record> Registrar venta
```

### State management
Todo en el servidor; cada POST recarga. "Calcular total" vuelve a renderizar el formulario con los mismos valores y el desglose (`previewSale`, sin escribir).

### Loading, empty, and error states
Listas con texto vacío ("No hay productos.", "No hay compras.", "No hay ventas en el rango.", "No hay gastos en el rango.", "La caja está cerrada."); errores con `role="alert"` y `aria-invalid`; resultados con `role="status"`. Stock bajo y diferencias de caja con `span.status` + texto (`Bajo mínimo`, `Sin stock`, `Diferencia`), nunca solo color.

---

## 7. Sistema de diseño

Se mantiene el sistema aprobado (tabla literal en `workspace/CLAUDE.md`). **Ningún token ni hex nuevo.**

### Colors
Los nueve tokens de `global.css`, claro y oscuro, sin cambios. Contraste ya medido en la fase 1 (§7 del blueprint de la fase 1): `--ink` sobre `--surface` ≈ 19,4:1; `--steel` sobre #FFFFFF ≈ 6,5:1; `--steel` sobre #151618 ≈ 6,8:1.

### Typography
Michroma (h1), Archivo Variable (cuerpo), IBM Plex Mono para montos, SKU, números `OT-`/`VM-`/`OC-` y cantidades (`tabular-nums`).

### Spacing, radius, elevation
Radio 2px, reglas 1px, sin sombras; objetivos ≥ 48px en `/taller`.

### Motion
`--dur-fast` 140ms, `--dur` 160ms; `prefers-reduced-motion` → 0ms. Nada nuevo anima.

### Component style
Tablas densas como las de órdenes. Estados nuevos con la misma familia de `span.status`: `status--bajo` (borde punteado + "Bajo mínimo"), `status--sin-stock` (rayado `--hatch` + "Sin stock"), `status--diferencia` (borde doble + "Diferencia +$1.000"), `status--anulada` (rayado + "Anulada"). Montos de órdenes `neto`: `OrderAmounts.astro` dentro del `<dl class="data">` existente.

---

## 8. Autenticación y autorización

### Provider
Sesión propia existente (`vb_admin_session`), sin cambios.

### Flows
Sin cambios: `requireAdmin` → `can` → zod → `src/server/taller/**` en cada página nueva; POST con `isAllowedOrigin`.

### Route protection
| Superficie | Regla | Dónde |
|---|---|---|
| Páginas nuevas de §6 | sesión + acción de la tabla | cada página + cada función de dominio |
| Costos (`cost_clp`, `unit_cost_clp`, `fee_clp`, `net_clp`) | solo con `costs.view` | cada función que los devuelve (prueba de omisión por rol) |

**Regla:** la autorización se decide en el servidor en cada petición; ocultar un botón no es un permiso.

### Roles and permissions (acciones nuevas, FASE2 §2.1.5)
| Acción | owner | admin | reception | mechanic |
|---|---|---|---|---|
| `inventory.view` | ✓ | ✓ | ✓ | ✓ |
| `sales.record`, `cash.open_close` | ✓ | ✓ | ✓ | — |
| `inventory.adjust`, `purchases.manage`, `expenses.record`, `costs.view` | ✓ | ✓ | — | — |

Acciones existentes reutilizadas: descuentos en ventas → `items.override_price`; devoluciones y anulación de ventas → `payments.void` (ambas dueño y administración, FASE2 §2.3.15; F2-D10); interruptor de caja → `dashboard.finance`; régimen de precios → `catalog.edit`; agregar repuesto ligado → `items.add_part` (el mecánico no la tiene hoy y sigue sin tenerla).

### Sessions
Sin cambios.

### Multi-tenancy / row-level isolation
Toda función recibe `actor` y filtra por `actor.branchId`; toda fila nueva usa ese `branch_id`. Las dos tareas sin actor (`lowStockProducts` para el resumen, `phase2Health`) recorren todas las sucursales y agrupan por `branch_id`.

---

## 9. ORDEN DE CONSTRUCCIÓN

### Reglas de un paso
1. Una sesión por paso; **≤ 5 archivos escritos a mano** (lo generado en `drizzle/` no cuenta). **Única excepción declarada: F2-00** (mover dos tablas e importadores; mecánico; F2-D2). ≤ 6 criterios.
2. Pruebas primero, en rojo; después la implementación. Cada paso lleva Archivos, Hacer, reglas que aplican, Done when, Verify y Checkpoint; la dirección completa está en su épica, que es autocontenida.
3. Verify es shell literal desde la raíz; toda línea sale 0 cuando el paso es correcto; los fallos esperados afirman su código. La última línea siempre es `pnpm format && pnpm gate   # expect: exit 0`. El sandbox de Codex corre solo `format`, `check`, `test` y `build`; `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la sesión coordinadora (BITACORA §8).
4. Ningún Verify afirma estado de commit; los únicos `git` en Verify (F2-00) comprueban la precondición y que el paso **no** cambió `drizzle/` y solo tocó los imports autorizados en `tests/`, comparando el árbol de trabajo contra `HEAD` y verificando que `git` respondió antes de leer su salida.
5. Un paso no está hecho hasta que su Verify pasa y `pnpm gate` sigue en verde. El Verify de cada paso se corre una sola vez, antes de su Checkpoint: varios comparan contra `HEAD` o contra la migración más nueva y no se repiten en pasos posteriores. La regresión de lo anterior la cubren `pnpm gate` y la compuerta de §20.1. Esta fase no agrega variables de entorno.
   Patrón de duplicados de iCloud: `' 2(\.[^/]*)?$'` cubre los archivos sueltos, que es el caso observado en este repo. Carpetas duplicadas (`drizzle 2/`) o sufijos ` 3` quedan fuera a propósito (F2-D26); si aparecen, la coordinadora los borra a mano antes de seguir.
6. **Checkpoint:** `git add -- <los archivos del paso>` (en los pasos de esquema también `drizzle`, después de comprobar que no hay duplicados de iCloud sin seguimiento), luego `git commit -m "<tipo>: f2-NN <descripción en inglés>" && git tag f2-NN` (sin trailers). **Nunca `git add -A`**: en el repo pueden aparecer copias `* 2.*` de iCloud y archivos del dueño sin seguimiento (F2-D26). Reversión: `git reset --hard f2-<NN-1>` y, si el paso migró la base dev, reiniciarla con el comando de §12 (lo aprueba el operador cada vez).
7. Nunca saltar adelante; un paso bloqueado se reporta.
8. Pasos de esquema: editar → `pnpm db:generate` (si pregunta, detenerse) → pruebas PGlite → `pnpm db:migrate` → `pnpm db:check`.
9. **Cada paso relee los archivos que toca** antes de editarlos: otros cambios pueden llegar a `main` entre pasos; los conteos de líneas citados son orientativos y el criterio es "< 400" sobre el archivo real.
10. **Ningún texto para el usuario escribe el nombre del taller literal** (títulos, correos, asuntos, páginas): `SITE.name`. La fase plataforma, que viene después, agregará la prueba guardiana; lo nuevo de esta fase ya debe cumplirla.
11. **Prueba en tablet real** (venta, cobro en efectivo con caja abierta, ajuste de stock): línea manual del checklist (§20.1), no compuerta de máquina.

### Un paso, una unidad
36 pasos = 36 tareas = 36 bloques en 5 épicas (9 + 9 + 7 + 6 + 5). Supera el rango orientativo de 10–18 por la misma razón que la fase 1: cada paso se limitó a 5 archivos, el desglose de precios toca nueve superficies existentes y hay tres ventanas de publicación con su propio paso (F2-D23).

### Mapa de pasos
| Paso | Tarea | Tag | Título | Depende de | Épica | Ventana |
|---|---|---|---|---|---|---|
| F2-00 | E1-T1 | f2-00 | Partir `schema-orders.ts` (tarea 0) | — | 01 | — |
| F2-01 | E1-T2 | f2-01 | Permisos de la fase 2 | F2-00 | 01 | V1 |
| F2-02 | E1-T3 | f2-02 | Esquema V1: inventario, precios y contadores | F2-01 | 01 | V1 |
| F2-03 | E1-T4 | f2-03 | Stock y productos: servidor | F2-02 | 01 | V1 |
| F2-04 | E1-T5 | f2-04 | Inventario: pantallas y ajuste en tablet | F2-03 | 01 | V1 |
| F2-05 | E1-T6 | f2-05 | Stock bajo mínimo | F2-04 | 01 | V1 |
| F2-06 | E1-T7 | f2-06 | Importación inicial desde CSV | F2-05 | 01 | V1 |
| F2-07 | E1-T8 | f2-07 | Proveedores y compras: servidor | F2-06 | 01 | V1 |
| F2-08 | E1-T9 | f2-08 | Proveedores y compras: pantallas | F2-07 | 01 | V1 |
| F2-09 | E2-T1 | f2-09 | Totales netos | F2-08 | 02 | V1 |
| F2-10 | E2-T2 | f2-10 | Régimen al crear la orden e interruptor | F2-09 | 02 | V1 |
| F2-11 | E2-T3 | f2-11 | Desglose en las pantallas de la orden | F2-10 | 02 | V1 |
| F2-12 | E2-T4 | f2-12 | Repuesto ligado a producto | F2-11 | 02 | V1 |
| F2-13 | E2-T5 | f2-13 | Desglose en las plantillas de correo | F2-12 | 02 | V1 |
| F2-14 | E2-T6 | f2-14 | Desglose en los envíos | F2-13 | 02 | V1 |
| F2-15 | E2-T7 | f2-15 | Desglose en el informe | F2-14 | 02 | V1 |
| F2-16 | E2-T8 | f2-16 | Desglose en la aprobación | F2-15 | 02 | V1 |
| F2-17 | E2-T9 | f2-17 | Ventana de publicación V1 | F2-16 | 02 | V1 |
| F2-18 | E3-T1 | f2-18 | Esquema de ventas | F2-17 | 03 | V2 |
| F2-19 | E3-T2 | f2-19 | Pagos: extensión aditiva | F2-18 | 03 | V2 |
| F2-20 | E3-T3 | f2-20 | CHECK de método (excepción) | F2-19 | 03 | V2 |
| F2-21 | E3-T4 | f2-21 | Ventas: servidor e historial | F2-20 | 03 | V2 |
| F2-22 | E3-T5 | f2-22 | Ventas: pantallas y venta en tablet | F2-21 | 03 | V2 |
| F2-23 | E3-T6 | f2-23 | Mercado Pago en pagos de órdenes | F2-22 | 03 | V2 |
| F2-24 | E3-T7 | f2-24 | Ventana de publicación V2 | F2-23 | 03 | V2 |
| F2-25 | E4-T1 | f2-25 | Esquema de caja y gastos | F2-24 | 04 | V3 |
| F2-26 | E4-T2 | f2-26 | Enlaces de caja en pagos y ventas | F2-25 | 04 | V3 |
| F2-27 | E4-T3 | f2-27 | Caja: servidor | F2-26 | 04 | V3 |
| F2-28 | E4-T4 | f2-28 | Efectivo de órdenes por la caja | F2-27 | 04 | V3 |
| F2-29 | E4-T5 | f2-29 | Efectivo de ventas y devoluciones | F2-28 | 04 | V3 |
| F2-30 | E4-T6 | f2-30 | Gastos: servidor y pantalla | F2-29 | 04 | V3 |
| F2-31 | E5-T1 | f2-31 | Caja: pantalla y venta en efectivo en tablet | F2-30 | 05 | V3 |
| F2-32 | E5-T2 | f2-32 | Ventana de publicación V3 | F2-31 | 05 | V3 |
| F2-33 | E5-T3 | f2-33 | Indicadores Etapa B: servidor | F2-32 | 05 | — |
| F2-34 | E5-T4 | f2-34 | Indicadores Etapa B: pantalla | F2-33 | 05 | — |
| F2-35 | E5-T5 | f2-35 | Salud de la fase y cierre | F2-34 | 05 | — |

La cadena es lineal a propósito: un solo builder (Codex) por vez, un encargo por tarea (`CLAUDE.md`, "Reparto con Codex").

**Reglas por paso (abreviatura en cada paso):** R-db = `.claude/rules/database.md` · R-dom = `taller-domain.md` · R-api = `server-api.md` · R-ui = `taller-ui.md` · R-e2e = `e2e.md` · NN = No negociables de `CLAUDE.md` · RC = reglas de código de `CLAUDE.md` (siempre: NN 4 secretos/PII, NN 5 `drizzle/`, NN 2 migrar solo dev, NN 7 compuerta, y RC 14, el nombre del taller).

---

#### F2-00 — Partir `schema-orders.ts` (tarea 0) (E1-T1)
**Precondición (operador):** no hay duplicados de iCloud sin seguimiento (`* 2`, `* 2.*`); si los hay, la coordinadora confirma que son copias y los borra antes del pase. Es la primera línea del Verify.
**Archivos (excepción declarada, F2-D2):** `src/server/db/schema-orders.ts` · `src/server/db/schema-payments.ts` (nuevo) · `scripts/db-check.ts` · `src/server/taller/{payments,history,components,reports,dashboard,indicators}.ts` (solo imports) · `tests/integration/{payments,dashboard,dashboard-finance,indicators,indicadores-page,components}.test.ts` (solo líneas de import; decisión 55).
**Hacer:** mover `payments` y `bikeComponents` tal cual (nombres, columnas, índices, CHECK) a `schema-payments.ts` (importa de `schema-orders.ts`, `schema-taller.ts`, `schema.ts`; copia sus helpers `branchReference`/`creatorReference`), exportar `paymentTables = [payments, bikeComponents] as const`, quitarlos de `orderTables`; `db-check.ts` recorre también `paymentTables`; reapuntar todo importador de `src/` y `scripts/` (`grep -rn "schema-orders.ts" src scripts tests e2e` y quedarse con los que importan esas dos tablas; si aparece uno fuera de la lista, se agrega por nombre al Checkpoint y al reporte). En `tests/` solo cambian los seis archivos autorizados. Sin migración.
**Reglas:** R-db · NN 5, 7 · No cambia: nombres de tabla y columna, ninguna aserción de prueba.
**Done when**
- [ ] WHEN la tarea 0 empieza THE SYSTEM SHALL tener ningún archivo sin seguimiento con nombre de duplicado de iCloud (`* 2` o `* 2.*`)
- [ ] WHEN `pnpm db:generate` corre después del cambio THE SYSTEM SHALL no crear ni modificar ningún archivo en `drizzle/`
- [ ] WHEN se busca la definición de `payments` y de `bikeComponents` THE SYSTEM SHALL encontrarlas solo en `src/server/db/schema-payments.ts`, con las tablas `payments` y `bike_components`, sus columnas, índices y CHECK sin cambios
- [ ] WHEN `pnpm db:check` corre THE SYSTEM SHALL revisar las columnas de `allTables`, `tallerTables`, `orderTables`, `reportTables` y `paymentTables` y salir 0
- [ ] WHEN se compara `tests/` con el commit anterior THE SYSTEM SHALL mostrar cambios exactamente en `payments.test.ts`, `dashboard.test.ts`, `dashboard-finance.test.ts`, `indicators.test.ts`, `indicadores-page.test.ts` y `components.test.ts`, y solo en sus líneas de import
- [ ] WHEN corre `pnpm test` THE SYSTEM SHALL pasar con 0 fallas y `src/server/db/schema-orders.ts` SHALL tener menos de 400 líneas
**Verify**
```bash
u="$(git ls-files --others --exclude-standard)" && test -z "$(printf '%s\n' "$u" | grep -E ' 2(\.[^/]*)?$')"   # expect: exit 0 — ningún duplicado de iCloud sin seguimiento
pnpm db:generate   # expect: exit 0, sin migración nueva
s="$(git status --porcelain -- drizzle)" && test -z "$s"   # expect: exit 0 — git respondió y la tarea 0 no crea ni cambia nada en drizzle/
grep -q 'export const payments = pgTable' src/server/db/schema-payments.ts && grep -q 'export const bikeComponents = pgTable' src/server/db/schema-payments.ts   # expect: exit 0
grep -Eq 'export const (payments|bikeComponents) = pgTable' src/server/db/schema-orders.ts; test $? -eq 1   # expect: 1 = ya no están en schema-orders.ts → la línea sale 0
test "$(wc -l < src/server/db/schema-orders.ts | tr -d ' ')" -lt 400   # expect: exit 0
d="$(git diff HEAD --name-only -- tests)" && test "$(printf '%s\n' "$d" | LC_ALL=C sort)" = "$(printf '%s\n' tests/integration/payments.test.ts tests/integration/dashboard.test.ts tests/integration/dashboard-finance.test.ts tests/integration/indicators.test.ts tests/integration/indicadores-page.test.ts tests/integration/components.test.ts | LC_ALL=C sort)"   # expect: exit 0 — git respondió y cambiaron exactamente los seis archivos autorizados
p="$(git diff HEAD -U0 -- tests)" && test -z "$(printf '%s\n' "$p" | grep -E '^[+-][^+-]' | grep -Ev '^[+-](import |\} from |  [A-Za-z]+,$)')"   # expect: exit 0 — en esos archivos solo cambian líneas de import
pnpm test tests/integration/payments.test.ts tests/integration/components.test.ts tests/integration/dashboard.test.ts tests/integration/dashboard-finance.test.ts tests/integration/indicators.test.ts tests/integration/indicadores-page.test.ts   # expect: exit 0, 0 failed
pnpm db:check   # expect: exit 0, {"ok":true,...}
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/db/schema-orders.ts src/server/db/schema-payments.ts scripts/db-check.ts src/server/taller/payments.ts src/server/taller/history.ts src/server/taller/components.ts src/server/taller/reports.ts src/server/taller/dashboard.ts src/server/taller/indicators.ts tests/integration/payments.test.ts tests/integration/dashboard.test.ts tests/integration/dashboard-finance.test.ts tests/integration/indicators.test.ts tests/integration/indicadores-page.test.ts tests/integration/components.test.ts   # + cualquier importador extra encontrado, por nombre
git commit -m "refactor: f2-00 move payments and components to schema-payments" && git tag f2-00
git tag -l f2-00 | grep -qx f2-00   # expect: exit 0
```

#### F2-01 — Permisos de la fase 2 (E1-T2)
**Archivos:** `src/server/auth/permissions.ts` · `tests/unit/permissions.test.ts` (autorizado por la decisión 55)
**Hacer:** agregar al final de `ACTIONS` las siete acciones con los roles de §8; en la prueba, 29 → 36 y las listas esperadas de `admin`, `reception` y `mechanic` (el dueño se deriva solo).
**Reglas:** R-api · NN 7 · No cambia: ninguna acción existente ni sus roles.
**Done when**
- [ ] WHEN se lee `ACTIONS` THE SYSTEM SHALL exponer 36 acciones sin duplicados: las 29 de la fase 1 más `inventory.view`, `inventory.adjust`, `purchases.manage`, `sales.record`, `expenses.record`, `cash.open_close` y `costs.view`
- [ ] WHEN se evalúa `can(role, "inventory.view")` THE SYSTEM SHALL devolver `true` para `owner`, `admin`, `reception` y `mechanic`
- [ ] WHEN se evalúan `sales.record` y `cash.open_close` THE SYSTEM SHALL devolver `true` para `owner`, `admin` y `reception`, y `false` para `mechanic`
- [ ] WHEN se evalúan `inventory.adjust`, `purchases.manage`, `expenses.record` y `costs.view` THE SYSTEM SHALL devolver `true` solo para `owner` y `admin`
- [ ] WHEN se evalúa cualquiera de las 29 acciones de la fase 1 THE SYSTEM SHALL devolver lo mismo que antes del cambio
**Verify**
```bash
pnpm test tests/unit/permissions.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/auth/permissions.ts tests/unit/permissions.test.ts
git commit -m "feat: f2-01 add phase 2 permissions" && git tag f2-01
git tag -l f2-01 | grep -qx f2-01   # expect: exit 0
```

#### F2-02 — Esquema V1: inventario, precios y contadores (E1-T3)
**Confirmación previa del operador (no es compuerta):** respaldos de la base de Replit activos.
**Archivos:** `src/server/db/schema-inventory.ts` (nuevo) · `src/server/db/schema.ts` · `src/server/db/schema-orders.ts` · `scripts/db-check.ts` · `tests/integration/inventory-schema.test.ts`
**Hacer:** las cinco tablas de inventario y `inventoryTables`; `branches.next_purchase_number` y `new_order_pricing_mode`; `work_orders.pricing_mode`, `subtotal_clp`, `vat_clp` y `work_orders_pricing_total_check`; `work_order_items.product_id`, `unit_cost_clp` y su CHECK (§4). Una sola generación.
**Reglas:** R-db · NN 5, 8 · No cambia: ninguna columna o CHECK existente.
**Done when**
- [ ] WHEN `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` THE SYSTEM SHALL crear `products`, `stock_movements`, `suppliers`, `purchase_orders` y `purchase_order_items` y agregar `branches.next_purchase_number`, `branches.new_order_pricing_mode`, `work_orders.pricing_mode`, `work_orders.subtotal_clp`, `work_orders.vat_clp`, `work_order_items.product_id` y `work_order_items.unit_cost_clp`, sin borrar ni renombrar nada
- [ ] WHEN se inserta una sucursal o una orden sin las columnas nuevas THE SYSTEM SHALL guardar `new_order_pricing_mode = 'final'`, `pricing_mode = 'final'`, `subtotal_clp = 0` y `vat_clp = 0`
- [ ] WHEN se guarda una orden `neto` con `total_clp` distinto de `subtotal_clp + vat_clp` THE SYSTEM SHALL rechazarla con código `23514`, y una orden `final` con cualquier total SHALL aceptarse
- [ ] WHEN se guarda un producto con `stock_qty` negativo, con `category` fuera de `repuesto`, `accesorio`, `insumo` y `bicicleta_usada`, o una `bicicleta_usada` sin `serial_number` THE SYSTEM SHALL rechazarlo con código `23514`
- [ ] WHEN se insertan dos productos con el mismo `sku`, o con el mismo `barcode` no nulo, en una sucursal THE SYSTEM SHALL rechazar el segundo con código `23505`, y SHALL aceptar dos productos con `barcode` nulo
- [ ] WHEN `pnpm db:check` corre THE SYSTEM SHALL revisar también las columnas de `inventoryTables` y salir 0
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
u="$(git ls-files --others --exclude-standard)" && test -z "$(printf '%s\n' "$u" | grep -E ' 2(\.[^/]*)?$')"   # expect: exit 0 — sin duplicados de iCloud antes de agregar drizzle/
git add -- src/server/db/schema-inventory.ts src/server/db/schema.ts src/server/db/schema-orders.ts scripts/db-check.ts tests/integration/inventory-schema.test.ts drizzle
git commit -m "feat: f2-02 add inventory tables and pricing columns" && git tag f2-02
git tag -l f2-02 | grep -qx f2-02   # expect: exit 0
```

#### F2-03 — Stock y productos: servidor (E1-T4)
**Archivos:** `src/server/taller/stock.ts` · `src/server/taller/products.ts` · `src/server/taller/rules.ts` · `src/server/taller/audit.ts` · `tests/integration/products.test.ts`
**Hacer:** `applyStockMovement(tx, actor, input, now)` (§5); `products.ts` con `productFormSchema`, `createProduct` (stock inicial como `ajuste` con nota `Stock inicial`), `updateProduct` (sin tocar stock), `listProducts` (filtros `q` sobre SKU/nombre/código, `category`, `lowOnly`), `getProduct` (+50 movimientos), `adjustStock`; omisión de costos sin `costs.view`; `rules.ts`: categorías, tipos de movimiento y sus etiquetas; `audit.ts`: las 21 acciones de auditoría de la fase (lista en la épica 01).
**Reglas:** R-dom · NN 9, 14, 16, 17 · No cambia: acciones de auditoría existentes.
**Done when**
- [ ] WHEN `adjustStock` registra +5 con motivo sobre un producto con stock 0 THE SYSTEM SHALL dejar `stock_qty = 5`, un `stock_movements` `ajuste` con `quantity = 5` y el motivo, y una fila `stock.adjusted` en `audit_log` con el usuario
- [ ] WHEN dos consumos de 1 unidad se aplican en secuencia sobre un producto con `stock_qty = 1` THE SYSTEM SHALL aceptar el primero y devolver `ok: false` con código `out_of_stock` en el segundo, dejando `stock_qty = 0` y un solo movimiento de consumo
- [ ] WHEN un `update` directo intenta dejar `stock_qty = -1` THE SYSTEM SHALL fallar con código `23514`
- [ ] WHEN `applyStockMovement` aplica una `compra` de 5 unidades a 1.300 sobre 5 unidades a costo 1.000 THE SYSTEM SHALL dejar `stock_qty = 10` y `cost_clp = 1150`
- [ ] WHEN `listProducts` o `getProduct` corren para `mechanic` o `reception` THE SYSTEM SHALL devolver filas sin las claves `costClp` ni `unitCostClp`, y con ellas para `owner` y `admin`
- [ ] WHEN `reception` o `mechanic` llaman `createProduct`, `updateProduct` o `adjustStock` THE SYSTEM SHALL devolver `ok: false` con código `forbidden` sin escribir filas
**Verify**
```bash
pnpm test tests/integration/products.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/taller/stock.ts src/server/taller/products.ts src/server/taller/rules.ts src/server/taller/audit.ts tests/integration/products.test.ts
git commit -m "feat: f2-03 add stock movements and product server" && git tag f2-03
git tag -l f2-03 | grep -qx f2-03   # expect: exit 0
```

#### F2-04 — Inventario: pantallas y ajuste en tablet (E1-T5)
**Archivos:** `src/pages/taller/inventario/index.astro` · `nuevo.astro` · `[id].astro` · `src/layouts/TallerLayout.astro` · `e2e/inventario-ajuste.spec.ts`
**Hacer:** las tres páginas con los rótulos literales de la épica 01 (los specs de F2-22 y F2-31 los usan); grupo de menú "Inventario y caja" con el enlace `Inventario`.
**Reglas:** R-ui · R-api · R-e2e · NN 13 (prueba en tablet), 17 · No cambia: `global-setup.ts`, `fixtures.ts`, `playwright.config.ts`.
**Done when**
- [ ] WHEN el spec `e2e/inventario-ajuste.spec.ts` corre en el viewport de tablet THE SYSTEM SHALL crear un producto desde `/taller/inventario/nuevo`, mostrarlo con el texto `Bajo mínimo` en `/taller/inventario?bajo=1`, registrar un ajuste de +5 con motivo y mostrar `Stock ajustado.` y stock `5` en su ficha
- [ ] WHEN el mecánico abre `/taller/inventario` en ese spec THE SYSTEM SHALL mostrar la lista sin la columna `Costo` y sin el enlace `Nuevo producto`
- [ ] WHEN se lee `src/layouts/TallerLayout.astro` THE SYSTEM SHALL contener el enlace `/taller/inventario` con la acción `inventory.view`
**Verify**
```bash
pnpm build && pnpm test:tablet e2e/inventario-ajuste.spec.ts   # expect: exit 0, 0 failed
grep -q '"/taller/inventario"' src/layouts/TallerLayout.astro && grep -q '"inventory.view"' src/layouts/TallerLayout.astro   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/pages/taller/inventario/index.astro src/pages/taller/inventario/nuevo.astro 'src/pages/taller/inventario/[id].astro' src/layouts/TallerLayout.astro e2e/inventario-ajuste.spec.ts
git commit -m "feat: f2-04 add inventory pages and tablet stock adjustment" && git tag f2-04
git tag -l f2-04 | grep -qx f2-04   # expect: exit 0
```

#### F2-05 — Stock bajo mínimo (E1-T6)
**Archivos:** `src/server/taller/low-stock.ts` · `src/server/taller/maintenance.ts` · `src/components/taller/LowStockNotice.astro` · `src/pages/taller/index.astro` · `tests/integration/low-stock.test.ts`
**Hacer:** `lowStockProducts(db)` (todas las sucursales; activos con `min_stock > 0 and stock_qty <= min_stock`, F2-D11) y `branchLowStock(db, actor)` (`purchases.manage`; si no, `null`); `sendOverdueDigest` suma la lista solo si no está vacía; aviso en `/taller` para dueño y administración.
**Reglas:** R-dom · R-ui · RC 14 (el asunto usa `SITE.name`) · No cambia: respuesta y correo de alertas sin productos bajo mínimo.
**Done when**
- [ ] WHEN `/api/tareas/alertas` corre sin órdenes atrasadas ni productos bajo mínimo THE SYSTEM SHALL responder 200 con `ok: true`, `overdue: 0`, `sent: false` y sin la clave `lowStock`
- [ ] WHEN hay 2 productos activos con `min_stock > 0` y `stock_qty <= min_stock` y ninguna orden atrasada THE SYSTEM SHALL enviar a `SHOP_NOTIFY_EMAIL` un correo con asunto `Stock bajo mínimo: 2 · ` seguido de `SITE.name`, y responder `ok: true`, `overdue: 0`, `sent: true`, `lowStock: 2`
- [ ] WHEN hay órdenes atrasadas y productos bajo mínimo THE SYSTEM SHALL conservar el asunto de órdenes atrasadas que arma hoy `sendOverdueDigest` y agregar al cuerpo la línea `Stock bajo mínimo:` y una línea por producto con SKU, nombre, stock y mínimo
- [ ] WHEN un producto está inactivo o tiene `min_stock = 0` THE SYSTEM SHALL excluirlo de la alerta
- [ ] WHEN `branchLowStock` corre para `owner` o `admin` THE SYSTEM SHALL devolver los productos bajo mínimo de su sucursal, y `null` para `reception` y `mechanic`
**Verify**
```bash
pnpm test tests/integration/low-stock.test.ts tests/integration/tasks-maintenance.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/taller/low-stock.ts src/server/taller/maintenance.ts src/components/taller/LowStockNotice.astro src/pages/taller/index.astro tests/integration/low-stock.test.ts
git commit -m "feat: f2-05 alert low stock on taller and daily digest" && git tag f2-05
git tag -l f2-05 | grep -qx f2-05   # expect: exit 0
```

#### F2-06 — Importación inicial desde CSV (E1-T7)
**Archivos:** `src/server/taller/inventory-import.ts` · `scripts/inventory-import.ts` · `package.json` (solo el script) · `tests/integration/inventory-import.test.ts`
**Hacer:** `parseInventoryCsv(text)` y `importInventory(db, email, text, now, { dryRun })` todo-o-nada; el script: `pnpm inventory:import <archivo.csv> <correo> [--dry-run]`, salida 0 / 1 (datos inválidos) / 2 (uso). El CSV del dueño vive fuera del repo.
**Reglas:** R-dom · NN 4 (el script nunca imprime correos completos ni costos en logs), 14 · No cambia: ninguna dependencia de `package.json`.
**Done when**
- [ ] WHEN `importInventory` recibe un CSV válido de 3 filas con encabezado `sku,nombre,categoria,costo,precio,stock,minimo,codigo_barras,serie` THE SYSTEM SHALL crear 3 productos y, por cada `stock` mayor que 0, un `stock_movements` `ajuste` con nota `Inventario inicial`, en una sola transacción
- [ ] WHEN alguna fila es inválida o repite un `sku` existente THE SYSTEM SHALL devolver cada número de línea con su error y no escribir ninguna fila
- [ ] WHEN el encabezado usa `;` como separador THE SYSTEM SHALL leer el archivo igual que con `,`
- [ ] WHEN el correo indicado no es de un usuario activo `owner` o `admin` THE SYSTEM SHALL devolver `ok: false` con código `forbidden` sin escribir
- [ ] WHEN `node scripts/inventory-import.ts` corre sin argumentos THE SYSTEM SHALL salir con código 2 y un mensaje de uso, sin conectarse a la base
- [ ] WHEN se lee `package.json` THE SYSTEM SHALL tener el script `inventory:import` igual a `node --env-file-if-exists=.env scripts/inventory-import.ts`
**Verify**
```bash
pnpm test tests/integration/inventory-import.test.ts   # expect: exit 0, 0 failed
node scripts/inventory-import.ts; test $? -eq 2   # expect: código 2 (uso) → la línea sale 0
test "$(node -p "require('./package.json').scripts['inventory:import']")" = "node --env-file-if-exists=.env scripts/inventory-import.ts"   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/taller/inventory-import.ts scripts/inventory-import.ts package.json tests/integration/inventory-import.test.ts
git commit -m "feat: f2-06 import initial inventory from csv" && git tag f2-06
git tag -l f2-06 | grep -qx f2-06   # expect: exit 0
```

#### F2-07 — Proveedores y compras: servidor (E1-T8)
**Archivos:** `src/server/taller/suppliers.ts` · `src/server/taller/purchases.ts` · `src/server/taller/rules.ts` · `tests/integration/purchases.test.ts`
**Hacer:** proveedores (RUT con `normalizeRut`); compras `borrador → enviada → recibida | anulada`, número `OC-00001` desde `next_purchase_number`; `receivePurchase` aplica `compra` por línea con costo promedio; una compra `recibida` no se anula (se corrige con un ajuste).
**Reglas:** R-dom · NN 9, 14, 16, 17 · No cambia: `normalizeRut`.
**Done when**
- [ ] WHEN se recibe una compra `enviada` de 5 unidades de un producto nuevo a 1.000 THE SYSTEM SHALL dejar el producto con `stock_qty = 5` y `cost_clp = 1000`, un movimiento `compra` de +5 con `reference_kind = 'purchase_order'`, y la compra `recibida` con `received_at` y `received_by`
- [ ] WHEN una segunda compra de 5 unidades a 1.300 se recibe THE SYSTEM SHALL dejar `stock_qty = 10` y `cost_clp = 1150`
- [ ] WHEN se agrega una línea a una compra que no está en `borrador`, o se recibe o anula una compra `recibida` THE SYSTEM SHALL devolver `ok: false` con código `invalid_status` sin cambiar filas
- [ ] WHEN se crean dos compras en una sucursal THE SYSTEM SHALL numerarlas desde `branches.next_purchase_number` y mostrarlas como `OC-00001` y `OC-00002`
- [ ] WHEN `reception` o `mechanic` llaman una función que escribe proveedores o compras THE SYSTEM SHALL devolver `ok: false` con código `forbidden`
- [ ] WHEN se crea un proveedor con un RUT inválido, o con un RUT que ya existe en la sucursal THE SYSTEM SHALL devolver el código `validation_error` o `rut_exists`
**Verify**
```bash
pnpm test tests/integration/purchases.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/taller/suppliers.ts src/server/taller/purchases.ts src/server/taller/rules.ts tests/integration/purchases.test.ts
git commit -m "feat: f2-07 add suppliers and purchase orders server" && git tag f2-07
git tag -l f2-07 | grep -qx f2-07   # expect: exit 0
```

#### F2-08 — Proveedores y compras: pantallas (E1-T9)
**Archivos:** `src/pages/taller/proveedores/index.astro` · `src/pages/taller/compras/index.astro` · `src/pages/taller/compras/[id].astro` · `src/layouts/TallerLayout.astro` · `tests/integration/compras-page.test.ts`
**Hacer:** pantallas de escritorio; enlaces `Proveedores` y `Compras` en el grupo "Inventario y caja". La prueba sigue el patrón de `tests/integration/indicadores-page.test.ts` (Container API + `vi.mock` de `getDb`).
**Reglas:** R-ui · R-api · NN 17 · No cambia: enlaces existentes del menú.
**Done when**
- [ ] WHEN el dueño hace POST en `/taller/compras` con un proveedor THE SYSTEM SHALL crear la compra en `borrador` y responder 303 a `/taller/compras/<id>`
- [ ] WHEN el dueño agrega una línea y luego recibe la compra con tipo y folio en `/taller/compras/<id>` THE SYSTEM SHALL responder 303 a `?hecho=receive` y la página SHALL mostrar `Recibida` y el stock nuevo del producto
- [ ] WHEN `reception` o `mechanic` piden `/taller/compras`, `/taller/compras/<id>` o `/taller/proveedores` THE SYSTEM SHALL responder 403
- [ ] WHEN un POST llega a esas páginas con un `Origin` ajeno THE SYSTEM SHALL responder 403 sin escribir filas
- [ ] WHEN se lee `src/layouts/TallerLayout.astro` THE SYSTEM SHALL contener los enlaces `/taller/proveedores` y `/taller/compras` con la acción `purchases.manage`
**Verify**
```bash
pnpm test tests/integration/compras-page.test.ts   # expect: exit 0, 0 failed
grep -q '"/taller/compras"' src/layouts/TallerLayout.astro && grep -q '"/taller/proveedores"' src/layouts/TallerLayout.astro && grep -q '"purchases.manage"' src/layouts/TallerLayout.astro   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/pages/taller/proveedores/index.astro src/pages/taller/compras/index.astro 'src/pages/taller/compras/[id].astro' src/layouts/TallerLayout.astro tests/integration/compras-page.test.ts
git commit -m "feat: f2-08 add supplier and purchase pages" && git tag f2-08
git tag -l f2-08 | grep -qx f2-08   # expect: exit 0
```

#### F2-09 — Totales netos (E2-T1)
**Archivos:** `src/server/taller/order-totals.ts` (nuevo) · `src/server/taller/items.ts` · `src/server/taller/rules.ts` · `tests/integration/pricing-totals.test.ts`
**Hacer:** `rules.ts`: `VAT_RATE_PERCENT = 19`, `PRICING_MODES`, `PRICING_MODE_LABELS`, `vatOfNet(net) = Math.round(net * VAT_RATE_PERCENT / 100)`, `grossOfNet`, `netOfGross(gross) = Math.round(gross * 100 / (100 + VAT_RATE_PERCENT))`; mover `recomputeOrderTotals` a `order-totals.ts` con régimen; `items.ts` lo importa y lo reexporta con la misma firma (F2-D17).
**Reglas:** R-dom · NN 10 · No cambia: firma de `recomputeOrderTotals`, totales `final`.
**Done when**
- [ ] WHEN una orden `neto` tiene líneas vigentes por 10.000 THE SYSTEM SHALL dejar `subtotal_clp = 10000`, `vat_clp = 1900` y `total_clp = 11900`
- [ ] WHEN una orden `neto` suma 10.003 THE SYSTEM SHALL dejar `vat_clp = 1901` y `total_clp = 11904`
- [ ] WHEN se anula una línea de una orden `neto` THE SYSTEM SHALL recalcular neto, IVA y total sobre las líneas vigentes en la misma transacción
- [ ] WHEN una orden `final` cambia sus líneas THE SYSTEM SHALL calcular `total_clp` y `estimated_minutes` como antes y dejar `subtotal_clp` y `vat_clp` en 0
- [ ] WHEN `vatOfNet` recibe 0, 50 y 10000 THE SYSTEM SHALL devolver 0, 10 y 1900
- [ ] WHEN corren `items.test.ts`, `order-items.test.ts`, `approvals.test.ts` y `delivery.test.ts` THE SYSTEM SHALL pasar sin cambios en esos archivos
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

#### F2-10 — Régimen al crear la orden e interruptor (E2-T2)
**Archivos:** `src/server/taller/order-creation.ts` (nuevo) · `src/server/taller/orders.ts` · `src/pages/taller/catalogo/index.astro` · `tests/integration/pricing-switch.test.ts`
**Hacer:** mover `allocateOrderNumber` (misma firma) a `order-creation.ts` y agregar `allocateNewOrder(db, branchId)` (un `update … returning` con número y `new_order_pricing_mode`), `getNewOrderPricingMode`, `setNewOrderPricingMode` (`catalog.edit`, auditado); las dos inserciones de `orders.ts` copian el régimen; bloque "Régimen de precios de órdenes nuevas" en el catálogo.
**Reglas:** R-dom · R-ui · R-api · NN 18 · No cambia: firmas de `startReception` y `openWarrantyOrder`.
**Done when**
- [ ] WHEN la sucursal tiene `new_order_pricing_mode = 'neto'` y se inicia una recepción o se abre una garantía THE SYSTEM SHALL crear la orden con `pricing_mode = 'neto'`
- [ ] WHEN la sucursal está en `final` THE SYSTEM SHALL crear las órdenes con `pricing_mode = 'final'` como hoy
- [ ] WHEN `setNewOrderPricingMode` cambia el régimen THE SYSTEM SHALL dejar intactos `pricing_mode`, `total_clp`, `subtotal_clp` y `vat_clp` de las órdenes existentes y registrar `pricing.mode_changed` con el régimen anterior y el nuevo
- [ ] WHEN `reception` o `mechanic` llaman `setNewOrderPricingMode` THE SYSTEM SHALL devolver `ok: false` con código `forbidden` sin cambiar la sucursal
- [ ] WHEN el dueño hace POST del régimen en `/taller/catalogo` THE SYSTEM SHALL responder 303 a `/taller/catalogo?hecho=pricing`
- [ ] WHEN se cuentan las líneas de `src/server/taller/orders.ts` THE SYSTEM SHALL tener menos de 400
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

#### F2-11 — Desglose en las pantallas de la orden (E2-T3)
**Archivos:** `src/components/taller/OrderAmounts.astro` (nuevo) · `src/pages/taller/ordenes/[id]/index.astro` · `recepcion.astro` · `entrega.astro` · `tests/integration/order-amounts-page.test.ts`
**Hacer:** `OrderAmounts` recibe textos ya formateados (`netText`, `vatLabel`, `vatText`, `totalLabel`, `totalText`) y rinde pares `<dt>/<dd class="mono">`; cada página conserva su marcado actual cuando `pricing_mode = 'final'` y usa el componente solo en `neto`.
**Reglas:** R-ui · No cambia: marcado de órdenes `final`, formulario de pago de `entrega.astro`.
**Done when**
- [ ] WHEN se renderiza `/taller/ordenes/<id>` de una orden `neto` con neto 10.000 THE SYSTEM SHALL mostrar `Neto` `$10.000`, `IVA (19%)` `$1.900` y `Total para el cliente` `$11.900`
- [ ] WHEN se renderiza `/taller/ordenes/<id>/entrega` de esa orden THE SYSTEM SHALL mostrar neto, IVA, `Total` `$11.900` y `Saldo` `$11.900`, y el campo `Monto` con valor `11900`
- [ ] WHEN se renderiza `/taller/ordenes/<id>/recepcion` de esa orden THE SYSTEM SHALL mostrar `Neto`, `IVA (19%)` y el total `$11.900`
- [ ] WHEN las tres páginas se renderizan para una orden `final` THE SYSTEM SHALL no contener `IVA (19%)` y mostrar el total con el mismo marcado de hoy
- [ ] WHEN se fuerza `status = 'entregada'` en una orden `neto` de total 11.900 con `paid_clp = 10000` THE SYSTEM SHALL fallar con código `23514`, y con `paid_clp = 11900` SHALL aceptarlo
- [ ] WHEN corre `pnpm test` THE SYSTEM SHALL pasar sin cambios en ninguna prueba existente
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

#### F2-12 — Repuesto ligado a producto (E2-T4)
**Archivos:** `src/server/taller/part-stock.ts` (nuevo) · `src/server/taller/items.ts` · `src/pages/taller/ordenes/[id]/lineas.astro` · `tests/integration/part-stock.test.ts`
**Hacer:** `addProductPartItem` (`items.add_part`; precio por régimen, F2-D16; costo congelado; `consumo_orden`), `reverseItemStock(tx, actor, item, now)` que `voidItem` llama cuando la línea tiene producto; `listItems` omite `unitCostClp` sin `costs.view`; en Líneas, "Agregar repuesto del inventario" y el desglose `neto` con `OrderAmounts`.
**Reglas:** R-dom · R-ui · NN 12, 14, 16, 17 · No cambia: `addPartItem` sin producto, firmas de `voidItem` y `listItems`.
**Done when**
- [ ] WHEN `addProductPartItem` agrega 1 unidad de un producto con `stock_qty = 5` a una orden THE SYSTEM SHALL dejar `stock_qty = 4`, una línea `repuesto` con `product_id` y `unit_cost_clp` igual al costo del producto, y un movimiento `consumo_orden` de -1 que referencia esa línea
- [ ] WHEN se anula esa línea con `voidItem` THE SYSTEM SHALL devolver el stock a 5 con un movimiento `anulacion` de +1, dejando dos movimientos
- [ ] WHEN el producto no tiene stock suficiente THE SYSTEM SHALL devolver `ok: false` con código `out_of_stock` sin dejar la línea ni el movimiento
- [ ] WHEN la orden es `neto` THE SYSTEM SHALL usar `price_clp` del producto como precio unitario de la línea, y en una orden `final` SHALL usar `price_clp + vatOfNet(price_clp)`
- [ ] WHEN `listItems` corre para `mechanic` o `reception` THE SYSTEM SHALL devolver las líneas sin la clave `unitCostClp`, y con ella para `owner` y `admin`
- [ ] WHEN el mecánico llama `addProductPartItem` THE SYSTEM SHALL devolver `ok: false` con código `forbidden`, y `addPartItem` sin producto SHALL comportarse como hoy
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

#### F2-13 — Desglose en las plantillas de correo (E2-T5)
**Archivos:** `src/server/email/amounts.ts` (nuevo) · `src/server/email/templates.ts` · `src/server/email/order-templates.ts` · `tests/unit/pricing-emails.test.ts`
**Hacer:** `amounts.ts` (sin importar `templates.ts`) devuelve filas `[etiqueta, monto]`; `ReceivedBike` gana `pricingMode?`, `ReadyForPickup` gana `pricing?`, `QuoteEmail` gana `pricingMode?`; `quoteTotalClp(items, mode?)`.
**Reglas:** R-dom · RC 14 · No cambia: salida de las tres plantillas sin régimen o con `final`.
**Done when**
- [ ] WHEN `receivedBikeEmail` recibe líneas por 10.000 y `pricingMode: neto` THE SYSTEM SHALL incluir en `text` y en `html` las filas `Neto` `$10.000`, `IVA (19%)` `$1.900` y `Total cotizado` `$11.900`
- [ ] WHEN `readyForPickupEmail` recibe una orden `neto` con neto 10.000, IVA 1.900, total 11.900 y abonado 5.000 THE SYSTEM SHALL mostrar `Neto`, `IVA (19%)`, `Total` `$11.900`, `Abonado` `$5.000` y `Saldo` `$6.900`
- [ ] WHEN `quoteEmail` recibe `pricingMode: neto` THE SYSTEM SHALL mostrar neto, IVA y `Total` con IVA, y `quoteTotalClp(items, 'neto')` SHALL devolver 11900 para 10.000 netos
- [ ] WHEN las tres plantillas reciben `final` o no reciben régimen THE SYSTEM SHALL producir `subject`, `html` y `text` idénticos a los de hoy
- [ ] WHEN se cuentan las líneas de `src/server/email/templates.ts` THE SYSTEM SHALL tener menos de 400
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

#### F2-14 — Desglose en los envíos (E2-T6)
**Archivos:** `src/server/taller/reception.ts` · `src/server/taller/qc.ts` · `src/server/taller/quotes.ts` · `tests/integration/pricing-notifications.test.ts`
**Hacer:** las tres consultas que arman los correos agregan `pricingMode` (y en `qc.ts`, `subtotalClp`/`vatClp`); `sendQuote` pasa el régimen y audita el total con IVA.
**Reglas:** R-dom · NN 4 · RC 6 (correos después del commit) · No cambia: condiciones de envío y auditoría `notify.*`.
**Done when**
- [ ] WHEN se finaliza la recepción de una orden `neto` con líneas por 10.000 THE SYSTEM SHALL enviar `Recibimos tu bicicleta` con `IVA (19%)` `$1.900` y `Total cotizado` `$11.900`
- [ ] WHEN el control de calidad aprueba una orden `neto` de neto 10.000 THE SYSTEM SHALL enviar `Lista para retirar` con `Neto`, `IVA (19%)` y `Total` `$11.900`
- [ ] WHEN `sendQuote` corre sobre una orden `neto` de neto 10.000 THE SYSTEM SHALL enviar neto, IVA y total, y registrar `notify.quote_sent` con `totalClp` 11900
- [ ] WHEN las mismas acciones corren sobre una orden `final` THE SYSTEM SHALL enviar correos sin `IVA (19%)`, con `received-notification.test.ts`, `ready-notification.test.ts` y `quotes.test.ts` sin cambios
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

#### F2-15 — Desglose en el informe (E2-T7)
**Archivos:** `src/server/taller/report-snapshot.ts` (nuevo) · `src/server/taller/reports.ts` · `src/components/taller/ReportView.astro` · `tests/integration/report-pricing.test.ts`
**Hacer:** mover `snapshotSchema` y `ReportSnapshot` a `report-snapshot.ts` (reports.ts reexporta el tipo); agregar `subtotalClp`, `vatClp`, `vatRatePercent` opcionales (versión 1); el generador los escribe solo en `neto`; `ReportView` los muestra si existen.
**Reglas:** R-dom · R-ui · No cambia: snapshots existentes, token del informe.
**Done when**
- [ ] WHEN se genera el informe de una orden `neto` con neto 10.000 THE SYSTEM SHALL guardar en el snapshot `subtotalClp` 10000, `vatClp` 1900, `vatRatePercent` 19 y `totalClp` 11900
- [ ] WHEN `ReportView` recibe ese snapshot THE SYSTEM SHALL mostrar las filas `Neto`, `IVA (19%)` y `Total` con los tres montos
- [ ] WHEN se genera el informe de una orden `final` THE SYSTEM SHALL guardar el snapshot sin `subtotalClp`, `vatClp` ni `vatRatePercent`
- [ ] WHEN se abre un informe guardado antes del cambio THE SYSTEM SHALL validarlo y mostrarlo como hoy
- [ ] WHEN se cuentan las líneas de `src/server/taller/reports.ts` THE SYSTEM SHALL tener menos de 400
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

#### F2-16 — Desglose en la aprobación (E2-T8)
**Archivos:** `src/server/taller/approvals.ts` · `src/pages/aprobacion/[token].astro` · `src/pages/taller/ordenes/[id]/adicional.astro` · `tests/integration/approval-pricing.test.ts`
**Hacer:** `viewApproval` y `listApprovals` devuelven también `pricingMode`; la página pública y la del personal rotulan `Precio neto` y muestran IVA y total en `neto`.
**Reglas:** R-api (página pública: token, `no-store`, `noindex`, `no-referrer`, solo primer nombre) · No cambia: decisión y token de un solo uso (NN 11).
**Done when**
- [ ] WHEN el cliente abre `/aprobacion/<token>` de un adicional de 10.000 en una orden `neto` THE SYSTEM SHALL mostrar `Precio neto` `$10.000`, `IVA (19%)` `$1.900` y `Total` `$11.900`
- [ ] WHEN el adicional es de una orden `final` THE SYSTEM SHALL mostrar `Precio` con el monto como hoy, con `approval-page.test.ts` sin cambios
- [ ] WHEN el cliente aprueba ese adicional en una orden `neto` sin otras líneas THE SYSTEM SHALL agregar la línea con `unit_price_clp = 10000` y dejar la orden con `total_clp = 11900`
- [ ] WHEN el personal abre `/taller/ordenes/<id>/adicional` de una orden `neto` THE SYSTEM SHALL rotular el campo de precio como `Precio neto` y mostrar cada propuesta con su IVA
- [ ] WHEN se cuentan las líneas de `src/server/taller/approvals.ts` THE SYSTEM SHALL tener menos de 400
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

#### F2-17 — Ventana de publicación V1 (E2-T9)
**Archivos:** `docs/ventanas/f2-v1.md`
**Hacer:** documentar la migración de la ventana (nombre real del archivo), precondiciones del dueño (taller cerrado, respaldo del día, `pnpm f2:check` aún no existe: se usan las consultas del documento), pasos de Replit (BITACORA §2 "Publicar con cambios de esquema") y verificación después de publicar. La publicación misma es del checklist (§20.1).
**Reglas:** R-db · NN 2 · No cambia: nada de código.
**Done when**
- [ ] WHEN `pnpm db:migrate` y `pnpm db:check` corren sobre la base dev THE SYSTEM SHALL salir 0 con `products`, `stock_movements`, `suppliers`, `purchase_orders` y `purchase_order_items` presentes
- [ ] WHEN se buscan en `drizzle/*.sql` las migraciones de la ventana V1 THE SYSTEM SHALL encontrar exactamente una con `CREATE TABLE` de `products`, sin `DROP TABLE`, `DROP COLUMN`, `DROP CONSTRAINT` ni `RENAME`
- [ ] WHEN se lee `docs/ventanas/f2-v1.md` THE SYSTEM SHALL contener `## Precondiciones`, `## Pasos en Replit` y `## Verificación después de publicar`, y el nombre de esa migración
- [ ] WHEN corre `pnpm gate` sobre el tag de la ventana THE SYSTEM SHALL salir 0
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

#### F2-18 — Esquema de ventas (E3-T1)
**Archivos:** `src/server/db/schema-sales.ts` (nuevo) · `src/server/db/schema.ts` · `scripts/db-check.ts` · `tests/integration/sales-schema.test.ts`
**Hacer:** `sales`, `sale_items`, `saleTables`; `branches.next_sale_number` (§4).
**Reglas:** R-db · NN 5, 8 · No cambia: nada existente.
**Done when**
- [ ] WHEN `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` THE SYSTEM SHALL crear `sales` y `sale_items` y agregar `branches.next_sale_number` con valor por defecto 1
- [ ] WHEN una venta se guarda con `total_clp` distinto de `subtotal_clp + vat_clp` THE SYSTEM SHALL rechazarla con código `23514`
- [ ] WHEN una venta queda `pagada` con `paid_clp` distinto de `total_clp`, o lleva `discount_clp > 0` sin `discount_reason` THE SYSTEM SHALL rechazarla con código `23514`
- [ ] WHEN una venta queda `anulada` sin `voided_at`, o tiene `voided_at` en otro estado THE SYSTEM SHALL rechazarla con código `23514`
- [ ] WHEN se guardan dos ventas con el mismo `number` en una sucursal THE SYSTEM SHALL rechazar la segunda con código `23505`
- [ ] WHEN `pnpm db:check` corre THE SYSTEM SHALL revisar las columnas de `saleTables` y salir 0
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

#### F2-19 — Pagos: extensión aditiva (E3-T2)
**Archivos:** `src/server/db/schema-payments.ts` · `src/server/taller/payments.ts` · `src/server/taller/history.ts` · `tests/integration/payments-extension.test.ts`
**Hacer:** columnas y CHECK de §4 (sin tocar `payments_method_check`); `payments.ts` y `history.ts` toleran `workOrderId` nulo (en `history.ts`, `orderId: row.workOrderId ?? undefined`); `listPayments` omite `feeClp`/`netClp` sin `costs.view`.
**Reglas:** R-db · R-dom · NN 5, 16, 17 · No cambia: firmas de pagos.
**Done when**
- [ ] WHEN `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` THE SYSTEM SHALL dejar `payments.work_order_id` nullable y agregar `sale_id`, `external_id`, `fee_clp` con valor por defecto 0 y `net_clp`, sin cambiar `payments_method_check`
- [ ] WHEN se inserta un pago sin `work_order_id` ni `sale_id`, o con ambos THE SYSTEM SHALL rechazarlo con código `23514`
- [ ] WHEN se inserta un pago con `fee_clp` negativo o mayor que `amount_clp`, o con `net_clp` distinto de `amount_clp - fee_clp` THE SYSTEM SHALL rechazarlo con código `23514`
- [ ] WHEN `listPayments` corre para `reception` o `mechanic` THE SYSTEM SHALL devolver los pagos sin las claves `feeClp` ni `netClp`, y con ellas para `owner` y `admin`
- [ ] WHEN corren `payments.test.ts`, `delivery.test.ts`, `history.test.ts` e `indicators.test.ts` THE SYSTEM SHALL pasar sin cambios en esos archivos
- [ ] WHEN se cuentan las líneas de `src/server/db/schema-payments.ts` THE SYSTEM SHALL tener menos de 400
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

#### F2-20 — CHECK de método (excepción declarada) (E3-T3)
**Archivos:** `src/server/db/schema-payments.ts` · `src/server/taller/rules.ts` · `tests/integration/payment-method-check.test.ts`
**Hacer:** solo reemplazar `payments_method_check` y el `$type` de `method`; en `rules.ts`, `PAYMENT_METHODS` queda con cuatro métodos y se agrega `RECORDABLE_PAYMENT_METHODS` + etiqueta `Mercado Pago` (F2-D7). Nada más en esta generación.
**Reglas:** R-db (la excepción declarada) · NN 5, 19 · No cambia: `PAYMENT_METHODS`.
**Done when**
- [ ] WHEN `pnpm db:generate` corre THE SYSTEM SHALL emitir una migración propia cuyas únicas sentencias quitan y vuelven a crear `payments_method_check`
- [ ] WHEN se inserta un pago `mercadopago` con `external_id` THE SYSTEM SHALL aceptarlo, y sin `external_id` SHALL rechazarlo con código `23514`
- [ ] WHEN se inserta un pago con método `cheque` THE SYSTEM SHALL rechazarlo con código `23514`
- [ ] WHEN se leen `PAYMENT_METHODS` y `RECORDABLE_PAYMENT_METHODS` THE SYSTEM SHALL tener `transferencia`, `tarjeta`, `efectivo` y `otro` en el primero, y esos cuatro más `mercadopago` en el segundo, con la etiqueta `Mercado Pago`
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

#### F2-21 — Ventas: servidor e historial (E3-T4)
**Archivos:** `src/server/taller/sales.ts` · `src/server/taller/sale-void.ts` · `src/server/taller/rules.ts` · `src/server/taller/history.ts` · `tests/integration/sales.test.ts`
**Hacer:** `previewSale`, `createSale` (§5, sin caja todavía), `listSales`, `listCustomerSales`, `formatSaleNumber` (`VM-00001`); `voidSale` (`payments.void`, motivo, stock `anulacion`, pago anulado); `customerTimeline` agrega eventos `sale`.
**Reglas:** R-dom · NN 14, 16, 17 · No cambia: eventos y orden del historial existentes.
**Done when**
- [ ] WHEN `reception` registra una venta sin cliente de 2 unidades de un producto de 5.000 netos con stock 3, pagada por transferencia THE SYSTEM SHALL crear la venta `VM-00001` `pagada` con `subtotal_clp = 10000`, `vat_clp = 1900` y `total_clp = 11900`, un `sale_items` con precio y costo congelados, un pago `final` con `sale_id` por 11.900, y dejar `stock_qty = 1` con un movimiento `venta` de -2
- [ ] WHEN una línea pide más unidades que el stock THE SYSTEM SHALL devolver `ok: false` con código `out_of_stock` sin escribir venta, líneas, pago ni movimientos
- [ ] WHEN `reception` envía un descuento THE SYSTEM SHALL devolver `ok: false` con código `forbidden`, y WHEN `owner` aplica 1.000 con motivo THE SYSTEM SHALL calcular el IVA sobre el neto con descuento y registrar `sale.discounted` con usuario, monto y motivo
- [ ] WHEN `owner` anula la venta con motivo THE SYSTEM SHALL dejarla `anulada` con `voided_at`, `voided_by` y el motivo, devolver el stock con movimientos `anulacion`, anular su pago y registrar `sale.voided`; `reception` SHALL recibir `forbidden`
- [ ] WHEN la venta lleva cliente THE SYSTEM SHALL aparecer en `customerTimeline` de ese cliente como `Venta VM-00001` con su total, aunque el cliente no tenga órdenes
- [ ] WHEN `listSales` corre para `reception` THE SYSTEM SHALL devolver las ventas sin las claves `unitCostClp` ni `feeClp`
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

#### F2-22 — Ventas: pantallas y venta en tablet (E3-T5)
**Archivos:** `src/pages/taller/ventas/index.astro` · `src/pages/taller/ventas/nueva.astro` · `src/layouts/TallerLayout.astro` · `e2e/venta-mostrador.spec.ts`
**Hacer:** formulario sin islas con "Calcular total" y "Registrar venta"; cliente opcional por teléfono (`findCustomerByPhone`); lista del día o rango (≤ 31 días) con anulación; rótulos literales de la épica 03.
**Reglas:** R-ui · R-api · R-e2e · NN 13, 17 · No cambia: `global-setup.ts`.
**Done when**
- [ ] WHEN el spec `e2e/venta-mostrador.spec.ts` corre en tablet THE SYSTEM SHALL registrar una venta sin cliente de 2 unidades por transferencia, mostrar `Total` `$11.900` antes de registrar y `Venta VM-` con cinco dígitos y `registrada.` después, y la ficha del producto SHALL mostrar stock `1`
- [ ] WHEN el mecánico pide `/taller/ventas/nueva` en ese spec THE SYSTEM SHALL responder 403
- [ ] WHEN se lee `src/layouts/TallerLayout.astro` THE SYSTEM SHALL contener el enlace `/taller/ventas` con la acción `sales.record`
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

#### F2-23 — Mercado Pago en pagos de órdenes (E3-T6)
**Archivos:** `src/server/taller/payments.ts` · `src/pages/taller/ordenes/[id]/entrega.astro` · `src/server/taller/indicators.ts` · `tests/integration/mercadopago-payments.test.ts`
**Hacer:** `recordPayment` acepta `mercadopago`, `externalId`, `feeClp` (solo Mercado Pago); `entrega.astro` ofrece el método y los dos campos; Etapa A agrega la fila Mercado Pago solo si hay pagos de ese método (F2-D13).
**Reglas:** R-dom · R-ui · NN 17, 19 · No cambia: `PAYMENT_METHODS`, cuatro filas de la Etapa A sin Mercado Pago.
**Done when**
- [ ] WHEN se registra en una orden un pago `mercadopago` de 11.900 con `externalId` y comisión 450 THE SYSTEM SHALL guardar `external_id`, `fee_clp = 450` y `net_clp = 11450`
- [ ] WHEN el pago `mercadopago` llega sin `externalId` THE SYSTEM SHALL devolver `ok: false` con código `validation_error` sin escribir
- [ ] WHEN un pago que no es `mercadopago` trae comisión mayor que 0 THE SYSTEM SHALL devolver `ok: false` con código `validation_error`
- [ ] WHEN `workshopIndicators` corre con un pago `mercadopago` en el rango THE SYSTEM SHALL agregar la fila `Mercado Pago` a `income.byMethod` y sumarlo al total, y sin pagos `mercadopago` SHALL devolver las cuatro filas de hoy
- [ ] WHEN se lee `src/pages/taller/ordenes/[id]/entrega.astro` THE SYSTEM SHALL ofrecer los métodos de `RECORDABLE_PAYMENT_METHODS` y los campos `Id de la operación` y `Comisión`
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

#### F2-24 — Ventana de publicación V2 (E3-T7)
**Archivos:** `docs/ventanas/f2-v2.md`
**Hacer:** como F2-17, con las tres migraciones (ventas, pagos aditiva, CHECK de método). El documento advierte que Replit puede mostrar el reemplazo de `payments_method_check` como "destructivo": se acepta solo ese (BITACORA §2).
**Done when**
- [ ] WHEN `pnpm db:migrate` y `pnpm db:check` corren sobre la base dev THE SYSTEM SHALL salir 0 con `sales` y `sale_items` presentes
- [ ] WHEN se revisan las tres migraciones de la ventana V2 THE SYSTEM SHALL encontrar la de `CREATE TABLE` de `sales` y la que agrega `sale_id` sin `DROP CONSTRAINT`, `DROP TABLE`, `DROP COLUMN` ni `RENAME`, y la del CHECK de método como la única con `DROP CONSTRAINT`
- [ ] WHEN se lee `docs/ventanas/f2-v2.md` THE SYSTEM SHALL contener `## Precondiciones`, `## Pasos en Replit` y `## Verificación después de publicar`, y los nombres de las tres migraciones
- [ ] WHEN corre `pnpm gate` THE SYSTEM SHALL salir 0
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

#### F2-25 — Esquema de caja y gastos (E4-T1)
**Archivos:** `src/server/db/schema-cash.ts` (nuevo) · `src/server/db/schema.ts` · `scripts/db-check.ts` · `tests/integration/cash-schema.test.ts`
**Hacer:** `cash_sessions`, `cash_movements`, `expenses`, `cashTables`; `branches.cash_control_enabled` (§4).
**Reglas:** R-db · NN 5, 8 · No cambia: nada existente.
**Done when**
- [ ] WHEN `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` THE SYSTEM SHALL crear `cash_sessions`, `cash_movements` y `expenses` y agregar `branches.cash_control_enabled` con valor por defecto `false`
- [ ] WHEN se abre una segunda sesión sin cerrar la primera en la misma sucursal THE SYSTEM SHALL rechazarla con código `23505`
- [ ] WHEN una sesión se cierra con `difference_clp` distinto de `counted_cash_clp - expected_cash_clp`, o queda con solo parte de los datos de cierre THE SYSTEM SHALL rechazarla con código `23514`
- [ ] WHEN un gasto tiene `amount_clp <= 0` o una categoría fuera de `arriendo`, `sueldos`, `servicios`, `insumos`, `repuestos` y `otros` THE SYSTEM SHALL rechazarlo con código `23514`
- [ ] WHEN un movimiento de caja tiene `amount_clp <= 0` o `kind` fuera de `ingreso` y `egreso` THE SYSTEM SHALL rechazarlo con código `23514`
- [ ] WHEN `pnpm db:check` corre THE SYSTEM SHALL revisar las columnas de `cashTables` y salir 0
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

#### F2-26 — Enlaces de caja en pagos y ventas (E4-T2)
**Archivos:** `src/server/db/schema-payments.ts` · `src/server/db/schema-sales.ts` · `tests/integration/cash-links-schema.test.ts`
**Hacer:** `cash_session_id` en `payments` y `sales` (§4), con índice.
**Reglas:** R-db · NN 5 · No cambia: nada existente.
**Done when**
- [ ] WHEN `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` THE SYSTEM SHALL agregar `payments.cash_session_id` y `sales.cash_session_id`, nullable y con FK a `cash_sessions`, sin borrar nada
- [ ] WHEN se inserta un pago o una venta con un `cash_session_id` que no existe THE SYSTEM SHALL rechazarlo con código `23503`
- [ ] WHEN corren `payments.test.ts`, `payments-extension.test.ts` y `sales.test.ts` THE SYSTEM SHALL pasar sin cambios en esos archivos
- [ ] WHEN se cuentan las líneas de `schema-payments.ts` y `schema-sales.ts` THE SYSTEM SHALL tener menos de 400 en cada uno
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

#### F2-27 — Caja: servidor (E4-T3)
**Archivos:** `src/server/taller/cash.ts` · `src/server/taller/rules.ts` · `tests/integration/cash.test.ts`
**Hacer:** `openCashSession`, `closeCashSession`, `currentCashSession`, `listCashSessions`, `setCashControl` (`dashboard.finance`), `requireOpenCashSession(tx, branchId)` → `off` | `closed` | `{ sessionId }`, `recordCashMovement(tx, …)`, `voidCashMovementFor(tx, …)`, `dayPaymentsSummary`; etiquetas de caja en `rules.ts`.
**Reglas:** R-dom · NN 15, 16 · No cambia: nada existente.
**Done when**
- [ ] WHEN la caja está habilitada y `reception` abre una sesión con 20.000 THE SYSTEM SHALL crearla con `opened_by` y `opening_cash_clp = 20000` y registrar `cash.opened`, y una segunda apertura SHALL devolver `ok: false` con código `cash_session_open`
- [ ] WHEN se cierra con conteo 31.000 tras un ingreso de 15.000 y un egreso de 3.000 THE SYSTEM SHALL guardar `expected_cash_clp = 32000` y `difference_clp = -1000` y registrar `cash.closed` con esperado, contado y diferencia
- [ ] WHEN la caja no está habilitada y alguien intenta abrirla THE SYSTEM SHALL devolver `ok: false` con código `cash_control_off`
- [ ] WHEN `reception` llama `setCashControl` THE SYSTEM SHALL devolver `forbidden`, y WHEN `owner` intenta desactivarla con una sesión abierta THE SYSTEM SHALL devolver `cash_session_open`; cada cambio efectivo SHALL registrar `cash.control_changed`
- [ ] WHEN `dayPaymentsSummary` corre THE SYSTEM SHALL sumar por método los pagos vigentes del día local de órdenes y ventas, incluidos transferencia, tarjeta y Mercado Pago
- [ ] WHEN el mecánico llama cualquier función de caja THE SYSTEM SHALL devolver `ok: false` con código `forbidden`
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

#### F2-28 — Efectivo de órdenes por la caja (E4-T4)
**Archivos:** `src/server/taller/payments.ts` · `src/pages/taller/ordenes/[id]/entrega.astro` · `tests/integration/cash-order-payments.test.ts`
**Hacer:** `recordPayment` y `voidPayment` consultan `requireOpenCashSession`; `entrega.astro` traduce `cash_closed` ("La caja está cerrada: ábrela en Caja antes de cobrar en efectivo.") y `cash_session_closed` ("La caja de ese pago ya se cerró: registra una devolución en Caja.") con 409.
**Reglas:** R-dom · NN 15, 16 · No cambia: firmas; efectivo sin caja habilitada.
**Done when**
- [ ] WHEN la caja está habilitada y abierta y se registra un pago `efectivo` de una orden THE SYSTEM SHALL guardar el pago con `cash_session_id` y un `cash_movements` `ingreso` por el mismo monto, en la misma transacción
- [ ] WHEN la caja está habilitada y no hay sesión abierta THE SYSTEM SHALL devolver `ok: false` con código `cash_closed` sin escribir pago ni movimiento
- [ ] WHEN la caja no está habilitada THE SYSTEM SHALL registrar el pago `efectivo` como hoy, sin `cash_session_id`, con `payments.test.ts` sin cambios
- [ ] WHEN se anula un pago en efectivo cuya sesión sigue abierta THE SYSTEM SHALL marcar también su movimiento con `voided_at`
- [ ] WHEN la sesión de ese pago ya cerró THE SYSTEM SHALL devolver `ok: false` con código `cash_session_closed` sin anular nada
- [ ] WHEN se registra un pago por transferencia con la caja abierta THE SYSTEM SHALL no crear movimiento de caja
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

#### F2-29 — Efectivo de ventas y devoluciones (E4-T5)
**Archivos:** `src/server/taller/sales.ts` · `src/server/taller/sale-void.ts` · `src/server/taller/refunds.ts` (nuevo) · `tests/integration/cash-sales-refunds.test.ts`
**Hacer:** `createSale` y `voidSale` con caja (§5); `registerRefund(db, actor, input, now)` (`payments.void`; requiere sesión abierta; venta por número o orden por id; tope = pagado − devuelto; devolución de producto opcional con `stock_movements` `devolucion`).
**Reglas:** R-dom · NN 14, 15, 16 · No cambia: ventas sin caja habilitada.
**Done when**
- [ ] WHEN la caja está abierta y se registra una venta sin cliente en efectivo THE SYSTEM SHALL dejar la venta `pagada` con `cash_session_id`, el pago y un `cash_movements` `ingreso` por el total
- [ ] WHEN la caja está habilitada y cerrada THE SYSTEM SHALL devolver `ok: false` con código `cash_closed` en una venta en efectivo sin escribir venta, pago, stock ni movimiento
- [ ] WHEN el dueño registra con la caja abierta una devolución de 1 unidad de una venta, con monto y motivo THE SYSTEM SHALL crear un `cash_movements` `egreso` con `reference_kind = 'sale_refund'`, un `stock_movements` `devolucion` de +1 y registrar `cash.refund` con usuario, monto y motivo
- [ ] WHEN la devolución supera lo pagado menos lo ya devuelto, o la pide `reception` THE SYSTEM SHALL devolver `invalid_amount` o `forbidden` sin escribir
- [ ] WHEN se anula una venta en efectivo cuya sesión ya cerró THE SYSTEM SHALL devolver `ok: false` con código `cash_session_closed` sin cambiar la venta
- [ ] WHEN la caja no está habilitada THE SYSTEM SHALL registrar ventas en efectivo sin sesión, con `sales.test.ts` sin cambios
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

#### F2-30 — Gastos: servidor y pantalla (E4-T6)
**Archivos:** `src/server/taller/expenses.ts` · `src/server/taller/rules.ts` · `src/pages/taller/gastos/index.astro` · `src/layouts/TallerLayout.astro` · `tests/integration/expenses.test.ts`
**Hacer:** `recordExpense`, `voidExpense` (motivo), `listExpenses` (rango ≤ 366 días); categorías y medios en `rules.ts`; pantalla de escritorio con formulario y lista; enlace `Gastos`.
**Reglas:** R-dom · R-ui · R-api · NN 15, 16 · No cambia: nada existente.
**Done when**
- [ ] WHEN el dueño registra con la caja abierta un gasto en efectivo de 8.000 THE SYSTEM SHALL guardar el gasto con `cash_session_id` y un `cash_movements` `egreso` de 8.000
- [ ] WHEN registra un gasto por transferencia THE SYSTEM SHALL guardarlo sin sesión y sin movimiento de caja
- [ ] WHEN la caja está habilitada y cerrada y el gasto es en efectivo THE SYSTEM SHALL devolver `ok: false` con código `cash_closed` sin escribir
- [ ] WHEN `reception` o `mechanic` registran o anulan un gasto THE SYSTEM SHALL devolver `ok: false` con código `forbidden`
- [ ] WHEN se anula un gasto con motivo THE SYSTEM SHALL marcar `voided_at`, `voided_by` y el motivo, anular su movimiento si la sesión sigue abierta o devolver `cash_session_closed` si cerró, y registrar `expense.voided`
- [ ] WHEN `reception` pide `/taller/gastos` THE SYSTEM SHALL responder 403, y `src/layouts/TallerLayout.astro` SHALL contener `/taller/gastos` con la acción `expenses.record`
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

#### F2-31 — Caja: pantalla y venta en efectivo en tablet (E5-T1)
**Archivos:** `src/pages/taller/caja/index.astro` · `src/layouts/TallerLayout.astro` · `e2e/caja-efectivo.spec.ts` · `tests/integration/caja-page.test.ts`
**Hacer:** interruptor (`dashboard.finance`), apertura, movimientos de la sesión, otros medios del día, cierre con conteo, devolución (`payments.void`), sesiones anteriores; enlace `Caja`. El spec deja la caja deshabilitada al terminar para no afectar a los demás specs.
**Reglas:** R-ui · R-api · R-e2e · NN 13, 15 · No cambia: `global-setup.ts`, specs existentes.
**Done when**
- [ ] WHEN el spec `e2e/caja-efectivo.spec.ts` corre en tablet THE SYSTEM SHALL habilitar la caja, abrirla con $10.000, registrar una venta en efectivo de $5.950, mostrar el ingreso y `Esperado` `$15.950`, cerrarla con conteo 15.950 mostrando `Diferencia: $0.` y dejar la caja deshabilitada al terminar
- [ ] WHEN `reception` abre `/taller/caja` THE SYSTEM SHALL mostrar apertura y cierre, sin el interruptor de control de caja ni el formulario de devolución
- [ ] WHEN el mecánico pide `/taller/caja` THE SYSTEM SHALL responder 403
- [ ] WHEN la página muestra una sesión cerrada con diferencia distinta de 0 THE SYSTEM SHALL marcarla con `span.status` y el texto `Diferencia` con el monto con signo
- [ ] WHEN se lee `src/layouts/TallerLayout.astro` THE SYSTEM SHALL contener el enlace `/taller/caja` con la acción `cash.open_close`
**Verify**
```bash
pnpm test tests/integration/caja-page.test.ts   # expect: exit 0, 0 failed
pnpm build && pnpm test:tablet e2e/caja-efectivo.spec.ts   # expect: exit 0, 0 failed
grep -q '"/taller/caja"' src/layouts/TallerLayout.astro && grep -q '"cash.open_close"' src/layouts/TallerLayout.astro   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/pages/taller/caja/index.astro src/layouts/TallerLayout.astro e2e/caja-efectivo.spec.ts tests/integration/caja-page.test.ts
git commit -m "feat: f2-31 add the cash page and tablet cash sale" && git tag f2-31
git tag -l f2-31 | grep -qx f2-31   # expect: exit 0
```

#### F2-32 — Ventana de publicación V3 (E5-T2)
**Archivos:** `docs/ventanas/f2-v3.md`
**Hacer:** como F2-17 con las dos migraciones de caja; el documento indica que la caja llega **deshabilitada** y que habilitarla es el corte C5 de §9.1.
**Done when**
- [ ] WHEN `pnpm db:migrate` y `pnpm db:check` corren sobre la base dev THE SYSTEM SHALL salir 0 con `cash_sessions`, `cash_movements` y `expenses` presentes
- [ ] WHEN se revisan las dos migraciones de la ventana V3 THE SYSTEM SHALL encontrar la de `CREATE TABLE` de `cash_sessions` y la que agrega `cash_session_id`, ninguna con `DROP TABLE`, `DROP COLUMN`, `DROP CONSTRAINT` ni `RENAME`
- [ ] WHEN se lee `docs/ventanas/f2-v3.md` THE SYSTEM SHALL contener `## Precondiciones`, `## Pasos en Replit` y `## Verificación después de publicar`, y los nombres de las dos migraciones
- [ ] WHEN corre `pnpm gate` THE SYSTEM SHALL salir 0
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
git add -- docs/ventanas/f2-v3.md
git commit -m "docs: f2-32 prepare publication window v3" && git tag f2-32
git tag -l f2-32 | grep -qx f2-32   # expect: exit 0
git ls-files --error-unmatch docs/ventanas/f2-v3.md   # expect: exit 0
```

#### F2-33 — Indicadores Etapa B: servidor (E5-T3)
**Archivos:** `src/server/taller/indicators-finance.ts` (nuevo) · `tests/integration/indicators-finance.test.ts`
**Hacer:** `financeIndicators(db, actor, range, now)` (`dashboard.finance`; si no, `null`) con ingresos brutos y netos (`netOfGross` por pago, F2-D12), devoluciones, egresos por categoría, balance, gastos sobre ingresos (entero %), Mercado Pago, mix, inventario y, con `costs.view`, `valueAtCostClp` y `partsMarginClp`; reutiliza `indicatorsRangeSchema` y los límites de día local de `indicators.ts`.
**Reglas:** R-dom · NN 17 · No cambia: `workshopIndicators`.
**Done when**
- [ ] WHEN `reception` o `mechanic` llaman `financeIndicators` THE SYSTEM SHALL devolver `null`
- [ ] WHEN el rango tiene un pago de orden de 11.900, una venta pagada de total 11.900 y un gasto de 8.000 THE SYSTEM SHALL devolver ingresos brutos 23.800, ingresos netos 20.000, egresos 8.000, balance 12.000 y gastos sobre ingresos 40
- [ ] WHEN el rango tiene un pago `mercadopago` de 11.900 con comisión 450 THE SYSTEM SHALL devolver en `mercadoPago` bruto 11.900, comisión 450 y neto 11.450
- [ ] WHEN hay una orden `neto` entregada con un servicio de 10.000 y un repuesto ligado de 5.000 con costo 3.000, y una venta pagada de 2 unidades a 5.000 con costo 3.000 THE SYSTEM SHALL devolver mix servicios 10.000, repuestos 5.000, ventas de mostrador 10.000 y `partsMarginClp` 6.000
- [ ] WHEN el inventario tiene 3 productos activos, uno con `min_stock > 0` y bajo mínimo, y uno sin stock THE SYSTEM SHALL devolver `activeCount` 3, `lowStockCount` 1, `outOfStockCount` 1 y `valueAtCostClp` igual a la suma de stock por costo
- [ ] WHEN el rango no tiene movimientos THE SYSTEM SHALL devolver ceros, sin dividir por cero
**Verify**
```bash
pnpm test tests/integration/indicators-finance.test.ts tests/integration/indicators.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/taller/indicators-finance.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/taller/indicators-finance.ts tests/integration/indicators-finance.test.ts
git commit -m "feat: f2-33 compute stage b finance indicators" && git tag f2-33
git tag -l f2-33 | grep -qx f2-33   # expect: exit 0
```

#### F2-34 — Indicadores Etapa B: pantalla (E5-T4)
**Archivos:** `src/pages/taller/indicadores.astro` · `src/components/taller/FinanceBlocks.astro` (nuevo) · `tests/integration/indicadores-finance-page.test.ts`
**Hacer:** la página llama `financeIndicators` con el mismo rango y pasa a `FinanceBlocks` filas ya formateadas; tablas con `tabular-nums`, sin gráficos.
**Reglas:** R-ui · No cambia: bloques de la Etapa A.
**Done when**
- [ ] WHEN el dueño abre `/taller/indicadores` con un rango THE SYSTEM SHALL mostrar las secciones `Egresos del período`, `Balance`, `Mix de ingresos`, `Mercado Pago` e `Inventario` con los montos de `financeIndicators` en celdas `mono`
- [ ] WHEN `reception` pide `/taller/indicadores` THE SYSTEM SHALL responder 403 como hoy
- [ ] WHEN corre `indicadores-page.test.ts` THE SYSTEM SHALL pasar sin cambios en ese archivo
- [ ] WHEN se cuentan las líneas de `src/pages/taller/indicadores.astro` THE SYSTEM SHALL tener menos de 400
**Verify**
```bash
pnpm test tests/integration/indicadores-finance-page.test.ts tests/integration/indicadores-page.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/pages/taller/indicadores.astro | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0 (incluye e2e/indicadores.spec.ts sin cambios)
```
**Checkpoint**
```bash
git add -- src/pages/taller/indicadores.astro src/components/taller/FinanceBlocks.astro tests/integration/indicadores-finance-page.test.ts
git commit -m "feat: f2-34 show stage b blocks on indicators page" && git tag f2-34
git tag -l f2-34 | grep -qx f2-34   # expect: exit 0
```

#### F2-35 — Salud de la fase y cierre (E5-T5)
**Archivos:** `src/server/taller/phase2-health.ts` (nuevo) · `scripts/f2-check.ts` (nuevo) · `package.json` (solo el script) · `README.md` · `tests/integration/phase2-health.test.ts`
**Hacer:** `phase2Health(db)` con los cuatro criterios de aborto de §9.1; `pnpm f2:check` imprime el JSON y sale 0 (sano), 1 (algún umbral superado) o 2 (sin conexión); README `## Operación de la fase 2` (interruptores, ventanas, importación, `f2:check`, tabla de criterios FASE2 §14 → prueba).
**Reglas:** R-dom · NN 4 (sin datos personales en la salida) · No cambia: nada existente.
**Done when**
- [ ] WHEN `phase2Health` corre sobre una base sin anomalías THE SYSTEM SHALL devolver `ok: true` con `netoInconsistent`, `cashUnlinked`, `cashDifferenceOver` y `stockDrift` en 0
- [ ] WHEN existe una orden `neto` con `vat_clp` distinto de `vatOfNet(subtotal_clp)` THE SYSTEM SHALL contarla en `netoInconsistent` y devolver `ok: false`
- [ ] WHEN existe un pago `efectivo` vigente sin `cash_session_id` creado después del último `cash.control_changed` de una sucursal con la caja habilitada THE SYSTEM SHALL contarlo en `cashUnlinked`
- [ ] WHEN una sesión cerrada tiene una diferencia absoluta mayor que 5.000 THE SYSTEM SHALL contarla en `cashDifferenceOver`, y WHEN un producto tiene `stock_qty` distinto de la suma de sus movimientos THE SYSTEM SHALL contarlo en `stockDrift`
- [ ] WHEN `node scripts/f2-check.ts` corre con un `DATABASE_URL` inalcanzable THE SYSTEM SHALL salir con código 2 y un mensaje que contiene `No se pudo conectar`
- [ ] WHEN se leen `package.json` y `README.md` THE SYSTEM SHALL tener el script `f2:check` igual a `node --env-file-if-exists=.env scripts/f2-check.ts` y la sección `## Operación de la fase 2`
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
git add -- src/server/taller/phase2-health.ts scripts/f2-check.ts package.json README.md tests/integration/phase2-health.test.ts
git commit -m "feat: f2-35 add phase health check and close the phase" && git tag f2-35
git tag -l f2-35 | grep -qx f2-35   # expect: exit 0
```

**Criterios FASE2 §14 → prueba** (también en `README.md` y §20.1): 1 `purchases.test.ts` (F2-07) · 2 `part-stock.test.ts` (F2-12) · 3 `products.test.ts` (F2-03) + `part-stock.test.ts` · 4 `cash-sales-refunds.test.ts` (F2-29) + `e2e/caja-efectivo.spec.ts` · 5 `cash-order-payments.test.ts` (F2-28) + `cash-sales-refunds.test.ts` · 6 `cash.test.ts` (F2-27) · 7 `expenses.test.ts` (F2-30) · 8 `mercadopago-payments.test.ts` (F2-23) + `indicators-finance.test.ts` (F2-33) · 9 omisión por rol en `products.test.ts`, `part-stock.test.ts`, `payments-extension.test.ts`, `sales.test.ts` + `e2e/inventario-ajuste.spec.ts` · 10 `indicators-finance.test.ts` + `indicadores-finance-page.test.ts` · 11 `products.test.ts` (`stock.adjusted`), `cash.test.ts` (`cash.closed`), `sales.test.ts` (`sale.voided`, `sale.discounted`), `cash-sales-refunds.test.ts` (`cash.refund`) · 12 `pricing-totals.test.ts` + `order-amounts-page.test.ts` · 13 `pnpm gate` · 14 checklist de lanzamiento (§20.1).

---

### 9.1 Paridad y corte

Dos migraciones de comportamiento, tratadas como corte (decisión del dueño, F2-D3, F2-D4): **(a) régimen de precios** `final` → `neto` para órdenes nuevas; **(b) control de caja** apagado → encendido. Ninguna reescribe datos.

#### Parity set
Leído del código (`items.ts`, `payments.ts`, `delivery.ts`, `templates.ts`, `order-templates.ts`, `indicators.ts`, las páginas de la orden).

| # | Comportamiento constante | Cómo se prueba | Tolerancia |
|---|---|---|---|
| a1 | Orden `final`: `total_clp = Σ cantidad × precio` de líneas vigentes, `estimated_minutes`, `subtotal_clp`/`vat_clp` en 0 | `items.test.ts`, `order-items.test.ts`, `approvals.test.ts` sin cambios + `pricing-totals.test.ts` criterio 4 | Exacta |
| a2 | Correos "Recibimos tu bicicleta", "Lista para retirar" y cotización de órdenes `final` | `tests/unit/received-email.test.ts`, `ready-email.test.ts`, `received-notification.test.ts`, `ready-notification.test.ts`, `quotes.test.ts` sin cambios + `pricing-emails.test.ts` criterio 4 | Byte a byte |
| a3 | Entrega solo con `paid_clp = total_clp` (`work_orders_delivered_paid_check`, `balance_pending`) | `delivery.test.ts` sin cambios + `order-amounts-page.test.ts` criterio 5 | Exacta |
| a4 | Pantallas de la orden `final` (detalle, recepción, entrega, líneas) | `order-amounts-page.test.ts` criterio 4 + specs de tablet existentes (`entrega`, `lineas-guardar-cambios`, `recepcion-*`) | Mismo marcado |
| a5 | Informe y aprobación de órdenes `final`; informes guardados | `reports.test.ts`, `report-page.test.ts`, `approval-page.test.ts` sin cambios | Exacta |
| b1 | Pago `efectivo` sin control de caja: misma fila, sin `cash_session_id`, mismo `paid_clp` | `payments.test.ts` sin cambios + `cash-order-payments.test.ts` criterio 3 | Exacta |
| b2 | Venta en efectivo sin control de caja | `sales.test.ts` sin cambios después de F2-29 | Exacta |
| b3 | Etapa A de indicadores con cuatro métodos | `indicators.test.ts`, `indicadores-page.test.ts` sin cambios | Exacta |
| b4 | Resumen diario sin productos bajo mínimo | `tasks-maintenance.test.ts` sin cambios | Exacta |

**Harness:** `pnpm test && pnpm build && pnpm test:tablet` sobre el árbol del paso, más la comprobación de que ninguna prueba existente cambió después de la decisión 55 y de que el tag de referencia existe: `git rev-parse --verify -q f2-01 >/dev/null && test -z "$(git diff --name-only --diff-filter=MD f2-01 HEAD -- tests e2e)"` (§20.1).
**Convivencia:** `work_orders.pricing_mode` congela el régimen de cada orden al crearla; las órdenes `final` conviven para siempre con las `neto` y nunca se reescriben. `branches.cash_control_enabled` decide por sucursal si el efectivo pasa por la caja; con el interruptor apagado el código recorre exactamente el camino de hoy. Sin escritura doble: cada pago o venta pasa por un solo punto de entrada que crea pago y movimiento en la misma transacción.
**Período sombra:** no hay dos sistemas que comparar; el "sombra" es el mes de operación con `pnpm f2:check` diario y la caja cerrada cada día.

#### Corte
| Fase | Qué cambia | Afecta a | Done when (decidible en el Mac) | Reversible por | Verify |
|---|---|---|---|---|---|
| C1. Ventana V1 publicada | Inventario, compras, repuestos ligados, columnas de precio; régimen sigue `final` | Personal | WHEN corre el Verify de F2-17 en el tag `f2-17` THE SYSTEM SHALL salir 0 (una migración aditiva, documentada en `docs/ventanas/f2-v1.md`) | Republicar el deployment anterior (el esquema solo creció) | Verify de F2-17 |
| C2. Corte de precios | El dueño confirma que el catálogo y los productos están cargados netos y cambia a `neto` en `/taller/catalogo` | Órdenes creadas después | WHEN el interruptor pasa a `neto` THE SYSTEM SHALL crear las órdenes nuevas en `neto` sin tocar las existentes (`pricing-switch.test.ts` criterios 1 y 3) | Volver a `final` en la misma pantalla (solo afecta a las órdenes que se creen después; las `neto` creadas quedan `neto`) | `pnpm test tests/integration/pricing-switch.test.ts` |
| C3. Ventana V2 publicada | Ventas, Mercado Pago, CHECK de método | Personal, clientes de mostrador | WHEN corre el Verify de F2-24 en el tag `f2-24` THE SYSTEM SHALL salir 0 (tres migraciones; solo la del CHECK con `DROP CONSTRAINT`) | Republicar el anterior; el CHECK nuevo es un superconjunto | Verify de F2-24 |
| C4. Ventana V3 publicada | Tablas de caja y gastos; caja **deshabilitada** | Nadie hasta C5 | WHEN corre el Verify de F2-32 en el tag `f2-32` THE SYSTEM SHALL salir 0 (dos migraciones aditivas) | Republicar el anterior | Verify de F2-32 |
| C5. Corte de caja | El dueño habilita el control en `/taller/caja` y la recepción abre la primera sesión | Cobros en efectivo | WHEN la caja se habilita, se abre, cobra en efectivo y se cierra THE SYSTEM SHALL dejar el ingreso en la sesión y diferencia 0 (`e2e/caja-efectivo.spec.ts`) | Cerrar la sesión y deshabilitar el control (minutos, sin publicar) | `pnpm build && pnpm test:tablet e2e/caja-efectivo.spec.ts` |
| C6. Decomisión `F2-DC1` | Fijar ambos regímenes (ver abajo) | — | WHEN el dueño intenta volver a `final` o deshabilitar la caja después del período THE SYSTEM SHALL responder `pricing_locked` o `cash_control_locked` | Un commit revertible | `pnpm test tests/integration/pricing-lock.test.ts` (en ese encargo) |

**Interruptor:** ambos cortes se revierten con un POST en la interfaz (segundos, sin publicar). Un problema de código se revierte republicando el deployment anterior desde *Deployments* de Replit (minutos).

#### Criterios de aborto
De guardia: **el dueño**. Se evalúan con `pnpm f2:check` (F2-35) cada día del primer mes, contra producción (el dueño lo corre en el Shell de Replit con la `DATABASE_URL` de producción), o con las mismas consultas en el panel *Database*, solo lectura.
- [ ] WHEN `netoInconsistent > 0` (alguna orden `neto` con `vat_clp <> (subtotal_clp * 19 + 50) / 100`) THE SYSTEM SHALL volver a `final` para órdenes nuevas y reportar las órdenes afectadas (umbral: 1).
- [ ] WHEN `cashUnlinked > 0` (algún pago `efectivo` vigente sin sesión creado con la caja habilitada) THE SYSTEM SHALL cerrar la sesión, deshabilitar el control de caja y reportar (umbral: 1).
- [ ] WHEN `cashDifferenceOver > 0` (alguna sesión cerrada con `abs(difference_clp) > 5000`) THE SYSTEM SHALL revisar los movimientos de esa sesión antes de abrir la siguiente; con tres en siete días, deshabilitar el control y volver a la planilla (umbral elegido en F2-D14: 5.000 es el billete más chico de uso común; una diferencia mayor es un billete faltante, no un error de vuelto).
- [ ] WHEN `stockDrift > 0` (algún producto con `stock_qty` distinto de la suma de sus movimientos) THE SYSTEM SHALL suspender ajustes y ventas de ese producto y reportar (umbral: 1; solo un `update` directo lo produce).

#### Migración de datos
NOT APPLICABLE — no se mueven datos: las órdenes anteriores conservan `final` y sus montos; las líneas de repuesto antiguas quedan con `product_id` nulo (los indicadores de margen empiezan en cero, FASE2 §11). El inventario inicial es carga de datos nuevos (F2-06), no migración. **Punto de no retorno:** la primera orden creada en `neto` queda en `neto` para siempre; volver a `final` solo afecta a las órdenes siguientes.

#### Decomisión
**Tarea `F2-DC1` — Fijar los regímenes después del mes de prueba** (no es un paso de §9 ni de `tasks.json`: espera un mes de operación; se ejecuta como un encargo propio, `docs/encargos/F2-DC1-*.md`, cuando el dueño lo pide).
- **Qué se decomisiona:** la posibilidad de volver a `final` para órdenes nuevas y de deshabilitar el control de caja en esa sucursal. `setNewOrderPricingMode` responde `pricing_locked` a `final` cuando ya hay órdenes `neto` con más de 30 días; `setCashControl` responde `cash_control_locked` al apagar cuando la primera sesión tiene más de 30 días; la interfaz deja de ofrecer ambos botones.
- **Qué se conserva y por qué:** el camino `final` de cálculo, pantallas y correos (las órdenes anteriores existen y nunca se reescriben; borrarlo rompería a1–a5 para el historial) y el camino de efectivo sin caja (sucursales futuras de la fase 4 empiezan con el interruptor apagado).
- **Precondición:** 30 días seguidos con `pnpm f2:check` en 0 y la caja cerrada cada día hábil; respaldo del día.
- **Done when:** WHEN el dueño intenta volver a `final` o deshabilitar la caja después del período THE SYSTEM SHALL responder `pricing_locked` o `cash_control_locked` sin cambiar la sucursal.
- **Verify:** `pnpm test tests/integration/pricing-lock.test.ts` (nuevo en ese encargo) y `pnpm gate`.

---

## 10. Configuración del entorno

### Prerrequisitos
| Herramienta | Versión | Check |
|---|---|---|
| Node | 24 (`.nvmrc`) | `node -v` → `v24.…` |
| pnpm | 12.4.2 (corepack si el global es más antiguo) | `pnpm --version` imprime `12.4.2` |
| Postgres local + `psql` | 16 en `127.0.0.1:5432`, con el rol de `.env` | `pg_isready -h 127.0.0.1 -p 5432` |
| Chromium de Playwright | el de `@playwright/test` | lo deja el Bootstrap |
| git, rsync, cmp | los de macOS | `git --version` |
| **Sin duplicados de iCloud sin seguimiento** | — | `u="$(git ls-files --others --exclude-standard)" && test -z "$(printf '%s\n' "$u" \| grep -E ' 2(\.[^/]*)?$')"`. Al generar había copias como `drizzle/0025_overconfident_stone_men 2.sql` y `src/server/taller/tracking 2.ts`: la coordinadora confirma que son duplicados (mismo contenido que su original) y los borra antes del Bootstrap. Otros archivos sin seguimiento del dueño (por ejemplo `docs/auditoria-seo-2026-10-20.md`) pueden quedarse: ningún Checkpoint usa `git add -A` |

### Cuentas
Ninguna nueva para el build. Cuenta de Mercado Pago del taller solo para conocer la comisión real (FASE2 §12.3); el sistema no guarda credenciales.

### Variables de entorno
Esta fase **no agrega variables**. Las existentes (tabla de `CLAUDE.md`) no cambian. Los scripts nuevos (`inventory-import.ts`, `f2-check.ts`) leen `DATABASE_URL` con `getDbEnv()` y se cargan con `node --env-file-if-exists=.env`, igual que `db:migrate` y `db:check`; el `DATABASE_URL` del entorno tiene prioridad sobre `.env` (comportamiento de Node), que es lo que usan los Verify de F2-06 y F2-35.

| Variable | Propósito | Dónde se obtiene | Requerida desde | Secreta |
|---|---|---|---|---|
| (sin cambios) | — | — | — | — |

### Archivos que deben commitearse
| Archivo | Por qué | Excepción en el ignore |
|---|---|---|
| `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, `.claude/rules/*.md`, `.claude/skills/add-migration/SKILL.md` | Agentes | — no coincide con ningún patrón de `.gitignore` |
| `docs/ventanas/f2-v*.md` | Instrucciones de publicación | — |
| `drizzle/**` | Migraciones generadas | — |
| `package.json`, `pnpm-lock.yaml` | Scripts nuevos; lockfile sin cambios | — |
| El CSV del inventario | **No** se commitea: vive fuera del repo (lleva costos) | — |

### Bootstrap
```bash
# Desde la raíz del repo, con el bundle commiteado y pnpm --version = 12.4.2.
# El orden importa: precondiciones (duplicados de iCloud, base del workspace) → archivos que
# gobiernan a los agentes (workspace/) → install → navegador → .env → chequeo estático → commit de rutas
# nombradas. No crea ni altera ninguna base; no toca producción.
git rev-parse --git-dir >/dev/null 2>&1 || git init -b main   # el repo ya existe: no hace nada
u="$(git ls-files --others --exclude-standard)" && test -z "$(printf '%s\n' "$u" | grep -E ' 2(\.[^/]*)?$')"   # precondición: sin duplicados de iCloud; si los hay, la coordinadora los confirma y borra antes
base="$(cat blueprints/vector-taller-f2/WORKSPACE_BASE)"; for f in CLAUDE.md AGENTS.md .claude/settings.json .claude/rules/database.md .claude/rules/taller-domain.md .claude/rules/taller-ui.md .claude/skills/add-migration/SKILL.md; do cmp -s "$f" "blueprints/vector-taller-f2/workspace/$f" || git show "$base:$f" | cmp -s - "$f" || { echo "$f cambió después de $base: re-fusionar workspace/ y actualizar WORKSPACE_BASE"; exit 1; }; done   # guarda: cada archivo es la versión base o ya la fusionada; sale 0 en ambas
rsync -a blueprints/vector-taller-f2/workspace/ ./   # reemplaza con las versiones fusionadas; sale 0 aunque no haya cambios
pnpm install --frozen-lockfile
pnpm exec playwright install chromium   # ya instalado: sale 0
test -f .env || cp .env.example .env
pnpm check
git add -- CLAUDE.md AGENTS.md .claude/settings.json .claude/rules .claude/skills && (git diff --cached --quiet || git commit -m "chore: bootstrap phase 2 workspace")
```
**Re-fusión (si hace falta):** si `CLAUDE.md`, `AGENTS.md` o un archivo administrado cambió en `main` después de `WORKSPACE_BASE`, la guarda **se detiene**. La sesión coordinadora lleva esos cambios a las copias de `workspace/` (sin perder lo de esta fase), escribe en `WORKSPACE_BASE` el hash de `main` sobre el que fusionó, commitea el bundle y vuelve a correr el bloque. Así ninguna copia pisa trabajo ajeno.
**Seguro de correr dos veces.** Ningún paso edita un archivo que entrega `workspace/` (`package.json` y el lockfile nunca están ahí), así que la segunda corrida encuentra cada archivo igual a la versión fusionada (`cmp` sale 0), `rsync` no cambia nada, `pnpm install --frozen-lockfile`, `playwright install`, `test -f .env ||` y el commit condicionado salen 0. El `git add` nombra rutas: no arrastra archivos ajenos sin seguimiento.
**Permisos:** la primera corrida pide permiso para la línea de `rsync` de esta fase, `cmp` y `git show` (el allowlist antiguo no los tenía); el `.claude/settings.json` nuevo los incluye.

---

## 11. Dependencias

**Ninguna dependencia nueva ni actualización** (F2-D22). Pins leídos de `pnpm-lock.yaml` y confirmados en el registro de npm con `npm view <paquete>@<versión> version` el 2026-11-13 por la sesión coordinadora. Todos los instala la línea `pnpm install --frozen-lockfile` del Bootstrap (§10).

### Runtime
| Paquete | Versión | Fuente | Verificado | Instalado por | Propósito |
|---|---|---|---|---|---|
| astro | 7.3.2 | https://www.npmjs.com/package/astro | 2026-11-13 (VERIFIED) | §10 Bootstrap (`pnpm install --frozen-lockfile`) | Páginas de servidor |
| @astrojs/node | 11.1.5 | https://www.npmjs.com/package/@astrojs/node | 2026-11-13 (VERIFIED) | §10 Bootstrap | Adaptador standalone |
| @astrojs/preact | 6.0.5 | https://www.npmjs.com/package/@astrojs/preact | 2026-11-13 (VERIFIED) | §10 Bootstrap | Islas existentes (ninguna nueva) |
| preact | 10.29.8 | https://www.npmjs.com/package/preact | 2026-11-13 (VERIFIED) | §10 Bootstrap | Islas existentes |
| drizzle-orm | 0.45.2 | https://www.npmjs.com/package/drizzle-orm | 2026-11-13 (VERIFIED) | §10 Bootstrap | Esquema y consultas |
| postgres | 3.4.9 | https://www.npmjs.com/package/postgres | 2026-11-13 (VERIFIED) | §10 Bootstrap | Cliente de la app y de los scripts |
| zod | 4.6.5 | https://www.npmjs.com/package/zod | 2026-11-13 (VERIFIED) | §10 Bootstrap | Validación |
| luxon | 3.7.2 | https://www.npmjs.com/package/luxon | 2026-11-13 (VERIFIED) | §10 Bootstrap | Días locales (caja, rangos) |

### Desarrollo
| Paquete | Versión | Fuente | Verificado | Instalado por | Propósito |
|---|---|---|---|---|---|
| drizzle-kit | 0.31.10 | https://www.npmjs.com/package/drizzle-kit | 2026-11-13 (VERIFIED) | §10 Bootstrap | `pnpm db:generate` |
| vitest | 5.0.1 | https://www.npmjs.com/package/vitest | 2026-11-13 (VERIFIED) | §10 Bootstrap | Pruebas |
| @electric-sql/pglite | 0.5.8 | https://www.npmjs.com/package/@electric-sql/pglite | 2026-11-13 (VERIFIED) | §10 Bootstrap | Base por prueba (una conexión) |
| @playwright/test | 1.63.0 | https://www.npmjs.com/package/@playwright/test | 2026-11-13 (VERIFIED) | §10 Bootstrap | Specs de tablet |
| typescript | 6.0.3 | https://www.npmjs.com/package/typescript | 2026-11-13 (VERIFIED) | §10 Bootstrap | `tsc --noEmit` |
| @biomejs/biome | 2.5.13 | https://www.npmjs.com/package/@biomejs/biome | 2026-11-13 (VERIFIED) | §10 Bootstrap | Formato y lint |

Runtimes y sistema (Node 24, pnpm 12.4.2 vía corepack, Postgres 16, Chromium): §10.

### Deliberadamente no usados
| Rechazado | En su lugar | Por qué |
|---|---|---|
| Librería de CSV (`csv-parse`, `papaparse`) | Lector propio de una línea por fila (F2-06) | ~150 filas, sin comillas; sin dependencia nueva |
| SDK de Mercado Pago | Registro manual de `external_id`, comisión y neto | Solo registro en esta fase (FASE2 §2.1.3) |
| Librería de gráficos | Tablas con `tabular-nums` | FASE2 §9 |
| Islas para la venta | Formulario con "Calcular total" | Ninguna isla nueva (FASE2 §13.10) |
| `decimal.js` | Enteros CLP + `Math.round` | Dinero en pesos enteros |

---

## 12. Estrategia de despliegue

### Hosting
Replit Autoscale existente; `.replit` intacto. Se construye en el Mac; el dueño publica (BITACORA §2).

### Environments
| Entorno | Rama | URL | Base | Terceros |
|---|---|---|---|---|
| Local (Mac) | — | http://localhost:4321 | `vector_bikes` (dev), `vector_bikes_e2e` (Playwright) | correo `console` |
| Producción | `main` | la de `SITE.url` | Postgres de producción | Resend |

### CI/CD
Sin CI externo: `pnpm gate` en el Mac antes de cada commit de paso y de cada ventana.

### Release and rollback
- **Ventanas:** V1 = tag `f2-17`; V2 = `f2-24`; V3 = `f2-32`. Cada una con el taller cerrado, respaldo del día y los pasos de `docs/ventanas/f2-v*.md` (`corepack pnpm@12.4.2 install --frozen-lockfile`, `db:migrate` y `db:check` en el workspace de Replit, `rm -rf node_modules`, Republish). La app nunca migra al arrancar. F2-33 a F2-35 no tocan el esquema y se publican sin ventana.
- **Producción:** republicar el deployment anterior. Todas las migraciones son aditivas salvo el CHECK de método, cuyo nuevo valor admite todo lo anterior: cualquier reversión de código es segura.
- **Interruptores:** régimen y caja se revierten desde la interfaz (§9.1).
- **Local:** `git reset --hard f2-<NN-1>` y, si la base dev tiene migraciones de pasos revertidos, reiniciarla (solo la de `.env`, se niega dentro de una deployment; lo aprueba el operador cada vez):
  ```bash
  test -z "$REPLIT_DEPLOYMENT" && psql "$(node --env-file-if-exists=.env -p 'process.env.DATABASE_URL')" -v ON_ERROR_STOP=1 -c 'drop schema public cascade; create schema public; drop schema if exists drizzle cascade;' && pnpm db:migrate
  ```

### Domain, DNS, TLS
Sin cambios.

---

## 13. Estrategia de pruebas

| Capa | Framework | Cubre | Dónde | Corre |
|---|---|---|---|---|
| Unit | Vitest | permisos, plantillas de correo | `tests/unit/` | `pnpm test` |
| Integración | Vitest + PGlite | dominio, CHECK, omisión de costos por rol, páginas con Container API | `tests/integration/` | `pnpm test` |
| Build | Vitest | sitio público | `tests/build/` | `pnpm test:build` |
| Tablet E2E | Playwright 820×1180 táctil | ajuste de stock, venta, venta en efectivo con caja | `e2e/` | `pnpm test:tablet` |
| Smoke | sh + curl | servidor construido | `scripts/smoke.sh` | `pnpm smoke` |
| Salud | `phase2Health` | criterios de aborto | `pnpm f2:check` | cada día del primer mes |
| Manual | iPad real | venta, cobro en efectivo, ajuste | §20.1 | antes de cerrar la fase |

### Flujos críticos E2E
1. Ajuste de stock con motivo y lista bajo mínimo (`inventario-ajuste.spec.ts`).
2. Venta de mostrador sin cliente (`venta-mostrador.spec.ts`).
3. Caja: habilitar, abrir, venta en efectivo, cerrar sin diferencia, deshabilitar (`caja-efectivo.spec.ts`).

### Datos de prueba
PGlite nuevo por prueba con todas las migraciones de `drizzle/`. Las pruebas que necesitan `neto` o caja habilitada lo fijan explícitamente en la sucursal o la orden; todo lo demás nace en `final` y con la caja apagada, por eso las pruebas existentes no cambian. Los specs nuevos crean sus productos por la interfaz con SKU propios (`E2E-AJUSTE-1`, `E2E-VENTA-1`, `E2E-CAJA-1`) y no afirman números exactos de venta (`/VM-\d{5}/`). Concurrencia: PGlite es de una conexión, así que el doble consumo del último stock se prueba en secuencia y con el CHECK (`23514`), no con `FOR UPDATE` concurrente (BITACORA §8).

### Lo que no se prueba
Comparaciones de píxeles; la publicación en Replit; el lector de códigos; la comisión real de Mercado Pago; la concurrencia real de dos conexiones (la garantiza el `for update` + CHECK en Postgres, y la prueba cubre el CHECK).

---

## 14. Seguridad y secretos

| Tema | Control | Dónde |
|---|---|---|
| Secretos | Ninguno nuevo; Mercado Pago sin credenciales | §10 |
| Validación | zod en cada borde (formularios, CSV) | `src/server/taller/**` |
| SQL | Drizzle y `sql` parametrizado | todo |
| AuthN/AuthZ | §8 en cada petición; costos solo con `costs.view`, probado por rol | páginas + dominio |
| CSRF | `isAllowedOrigin` en todo POST nuevo | páginas |
| Datos personales | Proveedores con las mismas reglas que clientes (FASE2 §7): `redactDetails` en auditoría, sin PII en logs; ventas sin cliente no guardan nada personal; Mercado Pago solo identificadores | `audit.ts`, `log.ts` |
| Comandos destructivos | Reinicio de la base dev y `git reset --hard`: confirmación del operador; `rm -rf`, `git push`, `drizzle-kit push/drop/--custom` en `deny` | `.claude/settings.json` |
| Commits | Cada Checkpoint agrega solo rutas nombradas; nunca `git add -A` (F2-D26) | §9 regla 6 |
| Producción | Claude nunca la toca; el dueño corre `inventory:import` y `f2:check` contra producción | checklist §20.1 |

Régimen: Ley 21.719 (Chile). Los costos no son datos personales, pero sí información comercial: nunca salen al mecánico ni a páginas públicas.

---

## 15. Accesibilidad

WCAG 2.2 AA. En `/taller`: objetivos ≥ 48px, `label` en todo control (los specs ubican cada control por rol y nombre accesible), `fieldset`/`legend` en medios de pago, estados con forma + texto (`Bajo mínimo`, `Sin stock`, `Diferencia`, `Anulada`), `role="status"`/`role="alert"`, foco visible. Manual antes de cerrar: teclado en `/taller/compras` y `/taller/gastos`, VoiceOver en la venta y la caja, zoom 200 %.

---

## 16. Observabilidad y costo

| Señal | Herramienta | Qué | Quién |
|---|---|---|---|
| Logs | `log.ts` → Replit | errores de tareas y correos | dueño |
| Salud de la fase | `pnpm f2:check` | cuatro criterios de aborto | dueño, diario el primer mes |
| Stock bajo | resumen diario de alertas | productos bajo mínimo | dueño |

| Métrica | Meta | Alerta |
|---|---|---|
| `cashDifferenceOver` | 0 | ≥ 1 (revisar), 3 en 7 días (abortar) |
| `stockDrift` | 0 | ≥ 1 |
| Productos bajo mínimo | según el dueño | correo diario |

Health sin cambios. **Costo:** cero adicional (misma base, mismo despliegue, sin servicios nuevos).

---

## 17. Enrutamiento de modelos

NOT APPLICABLE — this project does not call an LLM at runtime.

---

## 18. Skills para usar durante el build

| Skill | Pasos | Por qué | Instalación |
|---|---|---|---|
| playwright-cli (se activa sola) | F2-04, F2-22, F2-31 | Depurar specs de tablet | `npm install -g @playwright/cli@latest` y luego `playwright-cli install --skills` |
| frontend-design (se activa sola) | F2-04, 08, 11, 22, 30, 31, 34 | Pantallas densas fieles al sistema existente | `/plugin marketplace add anthropics/skills` y luego `/plugin install example-skills@anthropic-agent-skills` |

Si una no está instalada, se sigue con este blueprint y se anota en una línea. Las skills del proyecto `add-migration` (actualizada, §19.4) y `add-holidays` se conservan.

---

## 19. Espacio de trabajo del agente

`workspace/` refleja la raíz del repo y lo copia el Bootstrap (§10). **En brownfield, los archivos de `workspace/` son versiones fusionadas**: conservan el contenido del repo en `WORKSPACE_BASE` y agregan lo de esta fase; reemplazan a los actuales al copiarse, solo después de la guarda que verifica que nadie los cambió desde esa base. Ningún paso edita un archivo de esta lista. Nunca se emite `.claude/commands/`. Los archivos bajo `workspace/` son la fuente literal; esta sección describe su contenido.

### 19.1 `CLAUDE.md`
`workspace/CLAUDE.md`: el `CLAUDE.md` del repo completo, con: comandos `pnpm inventory:import` (desde F2-06) y `pnpm f2:check` (desde F2-35); "Estado del build" apuntando a `blueprints/vector-taller-f2/tasks.json`, sus épicas, este blueprint, `FASE2.md` y los encargos `docs/encargos/F2-NN-*.md` que escribe la sesión coordinadora antes de cada pase; camino de una venta; la cadena de ocho archivos de esquema; filas nuevas en "Dónde vive cada cosa" (stock, precios netos, caja, costos); la regla de código 14 (nombre del taller); No negociable 14–19 de la fase 2; "Reparto con Codex" literal.

### 19.2 `AGENTS.md`
`workspace/AGENTS.md`: el del repo completo con los mismos cambios en comandos, orden de trabajo, esquema, regla 14 (nombre del taller) y No negociable sincronizado.

### 19.3 `.claude/settings.json`
El allowlist existente completo más: la línea literal `rsync -a blueprints/vector-taller-f2/workspace/ ./`, `cmp:*`, `git show:*`, `git cat-file:*`, `basename:*`, `sort:*`, `LC_ALL=C sort:*`, `tail:*`, `echo:*`, `pnpm inventory:import:*`, `pnpm f2:check`, `node scripts/inventory-import.ts`, `DATABASE_URL=postgres://127.0.0.1:1/x node scripts/f2-check.ts`. Cubre cada Verify, cada Checkpoint y §20.1. Deny sin cambios.

### 19.4 Skills del proyecto
| Skill | Se activa con | Automatiza |
|---|---|---|
| add-migration (actualizada) | "agregar un campo", "nueva tabla", "migración" | elegir el archivo de la cadena → generate → test → migrate → check |
| add-holidays (sin cambios) | feriados de un año nuevo | carga y prueba de feriados |

### 19.5 `.claude/rules/*.md`
| Archivo | `paths` | Cambio |
|---|---|---|
| `database.md` (fusionado) | sin cambios | cadena de ocho archivos con `schema-inventory.ts` en medio (F2-D1), arreglos por archivo, excepción del CHECK de método |
| `taller-domain.md` (fusionado) | sin cambios | stock solo por `applyStockMovement`, error centinela para revertir, régimen de precios, caja por `requireOpenCashSession`, costos con `costs.view`, nombre del taller por `SITE` |
| `taller-ui.md` (fusionado) | sin cambios | desglose `OrderAmounts`, estados de stock y caja, pantallas de escritorio y de tablet de la fase, títulos con `SITE.name` |
| `server-api.md`, `e2e.md`, `ui-design.md`, `booking-engine.md` | — | sin cambios (no se entregan) |

### 19.6 Configuración crítica para las compuertas
Todas existen en el repo y **se reutilizan sin cambios**; ninguna se emite bajo `workspace/`.

| Archivo | Ruta | Verify que lo necesita | Resolución / entorno | Exclusión del bundle |
|---|---|---|---|---|
| `vitest.config.ts` | raíz | todo `pnpm test` | `getViteConfig`; `tests/setup.ts` fija el entorno | `exclude: "blueprints/**"` (existente) |
| `playwright.config.ts` | raíz | F2-04, F2-22, F2-31 y `pnpm gate` | `env` explícito al servidor; importa `e2e/fixtures.ts` (carga `.env`) | `testDir: "./e2e"` |
| `e2e/global-setup.ts`, `e2e/fixtures.ts` | `e2e/` | ídem | vacía **todas** las tablas de `public` (incluidas las nuevas) y siembra; las columnas nuevas de `branches` toman su valor por defecto | n/a |
| `drizzle.config.ts` | raíz | pasos de esquema | `process.loadEnvFile(".env")`; `schema: "./src/server/db/schema*.ts"` toma los archivos nuevos sin edición (su comentario de la fase 1 queda desactualizado y no se toca) | el glob solo mira `src/server/db/` |
| `tests/helpers/pglite.ts` | `tests/helpers/` | toda prueba de integración | migra desde `drizzle/` | n/a |
| `biome.json`, `tsconfig.json` | raíz | `pnpm check` | — | `"!!**/blueprints"`, `exclude: ["blueprints"]` (existentes) |

Ningún servicio en contenedor: Postgres local es prerrequisito (§10).

#### Resolution convention matrix
**Convención:** importación relativa con extensión `.ts`/`.tsx` explícita, sin alias ni barrels; la única reexportación es `recomputeOrderTotals` en `items.ts` y `ReportSnapshot` en `reports.ts`, para no cambiar sus rutas públicas (F2-D17).

| Contexto | Comando | Forma | Config que lo hace funcionar |
|---|---|---|---|
| App | `pnpm build` / `pnpm dev` | `../db/schema-payments.ts` | `tsconfig.json` `allowImportingTsExtensions`; Vite resuelve la ruta literal |
| Tests | `pnpm test` | igual | `vitest.config.ts` (`getViteConfig`) |
| Scripts | `node --env-file-if-exists=.env scripts/inventory-import.ts`, `… scripts/f2-check.ts` | igual | Node 24 quita tipos y resuelve la ruta literal (`erasableSyntaxOnly`); `tsc` la acepta por `allowImportingTsExtensions` + `noEmit` |
| Build | `pnpm build` | salida `dist/server/entry.mjs` | Vite reescribe los especificadores |
| drizzle-kit | `pnpm db:generate` | `./schema-inventory.ts` desde `schema-orders.ts` | cargador TS de drizzle-kit; glob de `drizzle.config.ts` |
| Playwright | `pnpm test:tablet` | `./fixtures.ts` | transformación TS de Playwright |

Ningún paquete con resolución no trivial nuevo.

#### Cross-artifact value reconciliation
| Valor | Fuente | Literal | Otras apariciones | Comparado |
|---|---|---|---|---|
| Glob de esquema | `drizzle.config.ts` | `./src/server/db/schema*.ts` | `database.md`, los ocho archivos de esquema | yes |
| Cadena de esquema | `database.md` (workspace) | `schema.ts ← schema-taller.ts ← schema-inventory.ts ← schema-orders.ts ← schema-reports.ts ← schema-cash.ts ← schema-sales.ts ← schema-payments.ts` | `CLAUDE.md`, `AGENTS.md`, §1, add-migration | yes |
| Script de importación | `package.json` (F2-06) | `node --env-file-if-exists=.env scripts/inventory-import.ts` | Verify F2-06, `CLAUDE.md`, `AGENTS.md`, `settings.json` (`pnpm inventory:import:*`) | yes |
| Script de salud | `package.json` (F2-35) | `node --env-file-if-exists=.env scripts/f2-check.ts` | Verify F2-35, `CLAUDE.md`, `AGENTS.md`, `settings.json` | yes |
| Copia del workspace | §10 | `rsync -a blueprints/vector-taller-f2/workspace/ ./` | `settings.json` (literal) | yes |
| Base del workspace | `WORKSPACE_BASE` | `76ebdce` | §10 (guarda) | yes |
| Patrón de duplicados de iCloud | §10 | `' 2(\.[^/]*)?$'` | Verify de F2-00, Checkpoints de pasos de esquema | yes |
| Seis pruebas autorizadas en F2-00 | decisión 55 | `tests/integration/{payments,dashboard,dashboard-finance,indicators,indicadores-page,components}.test.ts` | Verify y Checkpoint de F2-00, `tasks.json` `files`, épica 01 | yes |
| Rutas del menú | `TallerLayout.astro` | `/taller/inventario`, `/taller/proveedores`, `/taller/compras`, `/taller/ventas`, `/taller/gastos`, `/taller/caja` | Verify F2-04, 08, 22, 30, 31; §6 | yes |
| Etiqueta de IVA | `rules.ts` (`VAT_RATE_PERCENT = 19`) | `IVA (19%)` | F2-11, 13, 14, 15, 16, specs | yes |
| Prefijos de número | `purchases.ts`, `sales.ts`, `orders.ts` | `OC-00001`, `VM-00001`, `OT-00001` | Verify F2-07, F2-21, specs | yes |
| Rótulos de formularios | épicas 01, 03, 05 | los de la tabla de rótulos de cada épica | specs F2-04, 22, 31 | yes |
| Ruta del bundle | — | `blueprints/` | `biome.json`, `tsconfig.json`, `vitest.config.ts` | yes |

Cada contrato se ejerce en el primer paso donde existen ambos lados: las páginas de inventario corren en el spec de F2-04; los scripts nuevos se ejecutan en su propio Verify (F2-06, F2-35); el servidor construido corre en cada `pnpm gate` (smoke + Playwright).

#### Byte-exact artifact reconciliation
| Artefacto | Autor | Primer diff | Reglas que lo restringen | Llamada del runtime | Confirmado |
|---|---|---|---|---|---|
| `$1.900`, `$10.000`, `$11.900`, `$15.950` en páginas y correos | F2-11, 13, 14, 16, 22, 31 | mismo paso | `formatClp` del repo: `` `$${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}` `` | determinista (regex, sin Intl) | yes |
| Montos de `ReportView` | F2-15 | F2-15 | `ReportView` usa `Intl.NumberFormat("es-CL")` | **no se escribe literal**: la prueba calcula el esperado con el mismo `Intl` (el agrupamiento de cuatro cifras depende de ICU) | yes |
| IVA: 1900, 1901, 10, 950 | F2-09 | F2-09 | `Math.round(net * 19 / 100)`: 10000→1900, 10003→1900,57→1901, 50→9,5→10, 5000→950 | aritmética | yes |
| Costo promedio 1150 | F2-03, F2-07 | mismo paso | (5×1000 + 5×1300)/10 = 1150 | aritmética | yes |
| Netos de indicadores 20.000, 12.000, 40 | F2-33 | F2-33 | `Math.round(11900 × 100 / 119)` = 10000 ×2; 20000 − 8000; 8000×100/20000 | aritmética | yes |
| Caja 32.000 / −1.000; 15.950 | F2-27, F2-31 | mismo paso | 20000+15000−3000; 31000−32000; 10000+5950 | aritmética | yes |
| Texto de las migraciones que buscan los Verify de F2-20, F2-24 y F2-32 (`DROP CONSTRAINT "…"`, `ADD CONSTRAINT "…"`, `ADD COLUMN "…"`, `CREATE TABLE "…"`) | drizzle-kit 0.31.10 | F2-20, F2-24, F2-32 | los Verify no cuentan líneas: buscan la presencia de las dos sentencias del CHECK y la ausencia de cualquier otra sentencia o nombre de restricción | evidencia del formato y de las comillas en el propio repo: `drizzle/0001_huge_ultron.sql` línea 17 `ALTER TABLE "bookings" DROP CONSTRAINT "bookings_status_check";--> statement-breakpoint` y línea 18 `ALTER TABLE "bookings" ADD COLUMN "whatsapp_consent_at" …` | yes |
| `OC-00001`, `VM-00001` | F2-07, F2-21 | mismo paso | `padStart(5, "0")` como `formatOrderNumber` | n/a | yes |

---

## 20. Compuerta de aceptación, riesgos y registro de decisiones

### 20.1 Compuerta global de aceptación
```bash
pnpm install --frozen-lockfile   # expect: exit 0, lockfile sin cambios
pnpm check                       # expect: exit 0
pnpm test                        # expect: exit 0, 0 failed, 0 skipped
pnpm db:migrate                  # expect: exit 0
pnpm db:check                    # expect: exit 0, {"ok":true,...}
pnpm build                       # expect: exit 0
pnpm test:build                  # expect: exit 0
pnpm test:tablet                 # expect: exit 0, 0 failed (todos los specs de e2e/, incluidos los tres nuevos)
sh scripts/smoke.sh              # expect: exit 0
git rev-parse --verify -q f2-01 >/dev/null && test -z "$(git diff --name-only --diff-filter=MD f2-01 HEAD -- tests e2e)"   # expect: exit 0 — el tag existe y ninguna prueba existente cambió después de F2-01
pnpm gate                        # expect: exit 0
```
**Criterios FASE2 §14 → prueba:** tabla al final de F2-35 (§9).

**Compuertas manuales (una vez, después del build):**
- [ ] Un tag por paso: `test "$(git tag -l 'f2-*' | wc -l | tr -d ' ')" = 36` sale 0.
- [ ] Archivos commiteados, uno por invocación: `git ls-files --error-unmatch CLAUDE.md`, `… AGENTS.md`, `… .claude/settings.json`, `… .claude/rules/database.md`, `… docs/ventanas/f2-v1.md`, `… docs/ventanas/f2-v2.md`, `… docs/ventanas/f2-v3.md` — cada uno sale 0; y `git check-ignore -q docs/ventanas/f2-v1.md; test $? -eq 1` (1 = no ignorado; 128 = uso, y entonces falla).
- [ ] Ningún duplicado de iCloud quedó commiteado: `test -z "$(git ls-files | grep -E ' 2(\.[^/]*)?$')"` sale 0.
- [ ] Bootstrap re-ejecutado sobre el árbol terminado: **sale 0**, `package.json` conserva sus scripts nuevos y `pnpm test` sigue en 0.
- [ ] §19.6: cada fila dice `Comparado: yes` y `pnpm check` se corrió con `blueprints/vector-taller-f2/` presente.
- [ ] §9.1: harness verde e interruptores ensayados una vez en local (régimen `neto`→`final`, caja habilitar→deshabilitar).
- [ ] Ningún No-Objetivo de §1 construido.
- [ ] **Lanzamiento — ventanas:** V1 (`f2-17`), V2 (`f2-24`) y V3 (`f2-32`) publicadas por el dueño con el taller cerrado, respaldo del día y `docs/ventanas/f2-v*.md`; en V2, Replit muestra como cambio "destructivo" solo `payments_method_check`.
- [ ] **Lanzamiento — catálogo neto (precondición de C2):** el dueño revisa el catálogo y los precios de productos y confirma que están cargados **sin IVA** antes de cambiar el régimen (FASE2 §12.4).
- [ ] **Lanzamiento — inventario inicial:** el dueño corre `pnpm inventory:import <archivo.csv> <su correo> --dry-run` y luego sin `--dry-run` contra la base de producción (con su `DATABASE_URL`), con el CSV fuera del repo; o carga los productos en `/taller/inventario/nuevo`.
- [ ] **Lanzamiento — corte de caja (C5):** el dueño habilita el control en `/taller/caja` y la recepción abre y cierra la primera sesión del día.
- [ ] **Lanzamiento — tablet real:** venta de mostrador, cobro en efectivo con caja abierta y ajuste de stock probados en el iPad por el dueño (FASE2 §8, §13.11).
- [ ] **Lanzamiento — salud:** `pnpm f2:check` contra producción sale 0 cada día del primer mes.
- [ ] **Lanzamiento — accesibilidad:** teclado en compras y gastos, VoiceOver en venta y caja, zoom 200 %.
- [ ] **Decomisión `F2-DC1`:** tras 30 días sanos, el encargo de §9.1.
- [ ] **Cierre de fase:** un mes de operación real con stock y caja sin planilla (FASE2 §14.14).

### 20.2 Registro de riesgos
| Riesgo | Prob. | Impacto | Señal temprana | Mitigación |
|---|---|---|---|---|
| `schema-orders.ts` en el límite (399 líneas) | A | M | Un paso de esquema lo pasa de 400 | F2-00 primero y solo; F2-02 lo vuelve a medir (dueño de la mitigación: la coordinadora) |
| Reemplazar `payments_method_check` no es aditivo | M | A | drizzle-kit pregunta o la migración trae más sentencias | Paso propio (F2-20), generación propia, Verify que exige solo las dos sentencias del CHECK, ventana V2 con aviso de Replit |
| Stock negativo por dos consumos simultáneos | B | A | `stockDrift` > 0 o un `23514` en logs | `for update` + CHECK; prueba secuencial + CHECK (PGlite de una conexión) |
| Confusión entre pago de orden y movimiento de caja | M | M | `cashUnlinked` > 0 | Un solo punto de entrada (`recordPayment`, `createSale`, `recordExpense`) crea los dos |
| Costos filtrándose al mecánico | M | A | Una clave `costClp`/`unitCostClp`/`feeClp` en una respuesta | Prueba de omisión por rol en cada función que los devuelve (`listItems`, `listPayments`, `products`, `sales`) |
| Líneas de repuesto antiguas sin producto | A | B | Margen de repuestos en cero al empezar | Aceptado (FASE2 §11); el margen crece con las líneas nuevas |
| **Otro trabajo cambia `schema.ts`, `site.ts`, las plantillas de correo, `CLAUDE.md` o `AGENTS.md` entre pasos** | A | M | Un conteo de líneas o un fragmento citado no coincide con el archivo; la guarda del Bootstrap se detiene | Regla 9 de §9: cada paso relee los archivos que toca; los criterios dicen "< 400" sobre el archivo real; la guarda de `WORKSPACE_BASE` obliga a re-fusionar el workspace (dueño: la coordinadora) |
| **Duplicados de iCloud (`* 2.*`) en el árbol** (BITACORA; al generar había en `drizzle/`, `src/` y `tests/`) | A | M | Un archivo `… 2.sql` en `drizzle/` aplicado como migración, o un `… 2.ts` commiteado | Precondición de F2-00 y del Bootstrap; Checkpoints con rutas nombradas y guarda antes de `git add -- drizzle`; compuerta manual de §20.1 (F2-D26) |
| Archivos cerca del límite: `orders.ts` 395, `items.ts` 385, `templates.ts` 371, `reception.ts` 372, `reports.ts` 390, `approvals.ts` 369, `history.ts` 319, `payments.ts` 229, `indicators.ts` 289 | A | M | Un Verify `wc -l` falla | Extracciones planificadas: `order-totals.ts`, `order-creation.ts`, `part-stock.ts`, `email/amounts.ts`, `report-snapshot.ts`, `indicators-finance.ts`, `sale-void.ts` |
| Pruebas existentes que se rompen | M | A | Un archivo de `tests/` aparece modificado | Interruptores por defecto apagados; filas condicionales (Mercado Pago, `lowStock`, snapshot); gate de §20.1 sobre `git diff f2-01` |
| Duración del `pnpm gate` con tres specs más | M | M | Tiempos de espera en tablet | Specs cortos; gate con la carga del Mac baja (BITACORA §8) |
| Límites del sandbox de Codex (sin red ni Postgres) | A | B | Codex no puede correr `db:migrate`/`gate` | Reparto de BITACORA §8: Codex genera, Claude migra, verifica y commitea |
| Un spec deja la caja habilitada y afecta a otros | B | M | `entrega.spec.ts` u otros fallan con `cash_closed` | `caja-efectivo.spec.ts` cierra y deshabilita al final; los demás specs no cobran en efectivo |
| Alcance que crece hacia la cerca | M | A | Pedidos de link de pago, cuentas por pagar, comparativas | No-Objetivos de §1; el criterio 14 cierra la fase |

Aceptado: `/api/tareas/alertas` sigue sin ser idempotente (un correo por llamada).

### 20.3 Registro de decisiones
Numeración propia de este blueprint (`F2-D#`). Las decisiones globales 1–55 viven en `blueprints/vector-taller-f1/blueprint.md` §20.3; la 55 abre esta fase.

| # | Decisión | Alternativa rechazada | Por qué | Se revierte si |
|---|---|---|---|---|
| F2-D1 | Cadena `schema.ts ← schema-taller.ts ← schema-inventory.ts ← schema-orders.ts ← schema-reports.ts ← schema-cash.ts ← schema-sales.ts ← schema-payments.ts`; `schema-inventory.ts` va en medio por excepción a "solo al final" | Todo al final de la cadena | `work_order_items.product_id` necesita `products` antes de las órdenes; `payments` necesita `sales` y `cash_sessions` antes | Una tabla de inventario necesita referenciar órdenes |
| F2-D2 | Tarea 0 sola, sin migración, única excepción al límite de 5 archivos | Partir el movimiento en varios pasos | Es mecánico (mover dos tablas y reapuntar imports); dividirlo deja el árbol sin compilar entre pasos | El movimiento exige cambiar una aserción |
| F2-D3 | Precios netos por interruptor de sucursal + `pricing_mode` por orden; `total_clp` sigue siendo el monto a cobrar | Reescribir órdenes antiguas o un `total_with_vat` paralelo | No toca el CHECK de saldo, la entrega ni los pagos; las pruebas existentes nacen en `final` | El contador pide guardar IVA por línea |
| F2-D4 | Control de caja por interruptor (`cash_control_enabled`, por defecto apagado); lo cambian dueño y administración con `dashboard.finance`; apagarlo exige la sesión cerrada | Obligatorio desde la publicación | Corte sin romper pruebas ni la operación; reversible en segundos | La caja queda apagada por olvido más de una semana |
| F2-D5 | Funciones existentes conservan su firma; solo campos opcionales o funciones nuevas | Ampliar firmas | Interfaz congelada de la fase 1 | — |
| F2-D6 | El CHECK de método se reemplaza en su propio paso, su propia generación y la ventana V2 | Dentro de la extensión de pagos | Única excepción declarada (decisión 55); aísla el riesgo | drizzle-kit la emite con más sentencias |
| F2-D7 | `PAYMENT_METHODS` queda con cuatro; `RECORDABLE_PAYMENT_METHODS` agrega `mercadopago` | Agregar `mercadopago` a `PAYMENT_METHODS` | `indicators.test.ts` afirma exactamente cuatro filas | El dueño autoriza cambiar esa prueba |
| F2-D8 | Venta sin JS: "Calcular total" re-renderiza el desglose en el servidor; un pago por venta al registrarla; cliente opcional por teléfono | Una isla de carrito | Ninguna isla nueva (FASE2 §13.10); 150 productos caben en un `select` | Ventas con más de 5 líneas son frecuentes |
| F2-D9 | Devoluciones solo en efectivo, como egreso de caja con motivo; por otros medios se anula el pago mientras se pueda | Tabla de devoluciones con todos los medios | FASE2 §2.3.15 define la devolución como movimiento de caja | Devoluciones por transferencia frecuentes |
| F2-D10 | Descuentos y devoluciones con acciones existentes (`items.override_price`, `payments.void`) | Acciones nuevas | Las siete acciones de FASE2 §2.1.5 son cerradas; ambas existentes son dueño y administración | El dueño quiere separar quién descuenta de quién devuelve |
| F2-D11 | Stock bajo = activo, `min_stock > 0` y `stock_qty <= min_stock`; lo ve quien tiene `purchases.manage` | Incluir `min_stock = 0` | Un producto sin mínimo definido no debe alertar todos los días | El dueño quiere ver todo lo sin stock |
| F2-D12 | Ingresos netos = Σ `round(monto × 100 / 119)` por pago, en ambos regímenes | Separar por régimen | Lo cobrado a un consumidor en Chile incluye IVA en ambos casos | El contador indica otra base |
| F2-D13 | La fila Mercado Pago aparece en la Etapa A solo si hay pagos de ese método | Siempre cinco filas | Mantiene `indicators.test.ts` sin cambios | El dueño autoriza cambiar la prueba |
| F2-D14 | Umbral de aborto de caja: diferencia absoluta > 5.000 | 1.000 o cero | 5.000 es el billete más chico de uso común; menos es error de vuelto | Las diferencias normales del mes superan 5.000 |
| F2-D15 | `listItems`, `listPayments`, productos y ventas omiten costos sin `costs.view` (la clave no aparece) | Devolver `null` | "No recibe" significa que la clave no viaja | — |
| F2-D16 | Un repuesto ligado en una orden `final` toma `price_clp + vatOfNet(price_clp)`; en `neto`, `price_clp` | Siempre `price_clp` | Los precios de producto son netos (FASE2 §2.4.1) y una orden `final` guarda montos finales | El dueño fija todas las órdenes en `neto` (F2-DC1) |
| F2-D17 | `recomputeOrderTotals` se mueve a `order-totals.ts` y `items.ts` lo reexporta; `allocateOrderNumber` se mueve a `order-creation.ts` (sin importadores externos); `ReportSnapshot` a `report-snapshot.ts` con reexporte del tipo | Crecer los archivos | Límite de 400 líneas; rutas públicas intactas | — |
| F2-D18 | Tres ventanas de publicación (V1, V2, V3) como pasos propios | Una sola publicación al final | Menos esquema por publicación, con el taller cerrado (FASE2 "Cómo se trabaja") | — |
| F2-D19 | Importación todo-o-nada, `,` o `;`, sin comillas, con `--dry-run`; la corre el dueño | Carga parcial | Un CSV a medias deja el stock en un estado que nadie entiende | El CSV real trae nombres con separadores |
| F2-D20 | `pnpm f2:check` evalúa los criterios de aborto (0/1/2) | Consultas sueltas en un documento | Decidible por script, lo corre el dueño cada día | — |
| F2-D21 | La decomisión (`F2-DC1`) fija los regímenes tras 30 días; se conserva el camino `final` y el efectivo sin caja | Borrar el camino `final` | Las órdenes `final` existen para siempre; la fase 4 traerá sucursales que empiezan apagadas | — |
| F2-D22 | Ninguna dependencia nueva | Librería de CSV, SDK de Mercado Pago | §11 | — |
| F2-D23 | 36 pasos, sobre el rango orientativo | Pasos más grandes | Límite de 5 archivos, nueve superficies con desglose, tres ventanas | — |
| F2-D24 | Guarda de `WORKSPACE_BASE` en el Bootstrap | Copiar el workspace sin mirar | Si alguien cambia `CLAUDE.md`/`AGENTS.md` en `main`, copiar a ciegas borraría su trabajo | Nadie más toca esos archivos durante la fase |
| F2-D25 | Ningún texto para el usuario escribe el nombre del taller: `SITE.name` | Literal en plantillas nuevas | La fase plataforma (decisión 56), que viene después, prohibirá el literal con una prueba guardiana; lo nuevo ya la cumple | — |
| F2-D27 | La fase 2 se construye antes que la fase plataforma (dueño, 13-11-2026) | Plataforma primero (orden anterior del mismo día) | La plataforma solo tenía diseño; la fase 2 tiene blueprint validado | El dueño vuelve a priorizar la plataforma: se pausa al cierre de una ventana, nunca a mitad |
| F2-D28 | Sin `costs.view`, un costo con valor se omite; un costo `null` (línea de texto libre, sin producto) se deja como está | Omitir la clave siempre | `tests/integration/items.test.ts` (fase 1, no editable) compara `listItems` del mecánico con las filas completas; un `null` no revela ningún dato (decidido por la coordinadora en F2-12, 14-11-2026) | Una prueba existente se autoriza a cambiar o la clave pasa a llevar un dato |
| F2-D29 | En F2-20, `tests/integration/payments-extension.test.ts` (prueba de esta fase, de F2-19) deja de exigir que `payments_method_check` rechace `mercadopago` (sigue exigiéndolo para `cheque`), e `indicators.ts` tipa la fila de pago con `RecordablePaymentMethod` | Dejar la prueba de F2-19 y no admitir Mercado Pago | La aserción describía el estado previo a F2-20; admitir Mercado Pago como registro es lo aprobado (FASE2 §2.1 punto 3). Decidido por la coordinadora el 14-11-2026; se informa al dueño | — |
| F2-D30 | Los formularios de cobro (entrega y venta de mostrador) ofrecen Transferencia, **POS**, Efectivo y Otro; POS lleva el proveedor (Transbank, Mercado Pago o Getnet) en `payments.pos_provider`, con `method = 'tarjeta'` y el CHECK aditivo `payments_pos_provider_check` (migración `0034`). Se quitan del formulario el id de operación y la comisión; `mercadopago`, `external_id`, `fee_clp` y `net_clp` quedan en la base para el historial. Indicadores cambia la sección "Mercado Pago" por "POS por proveedor" (bruto; los `mercadopago` anteriores cuentan como Mercado Pago). `tests/integration/mercadopago-payments.test.ts` pasa a `pos-payments.test.ts`; se ajustan `indicators-finance.test.ts`, `indicadores-finance-page.test.ts` y `sales.test.ts` | Mantener Mercado Pago como medio aparte con id y comisión | En el mesón se cobra con el POS de uno de tres proveedores y nadie anota la comisión por pago. Decidido por el dueño el 15-11-2026, con autorización para modificar esas pruebas | Se integra un proveedor o se quiere conciliar comisiones |
| F2-D31 | **Las páginas internas con formulario usan `referrer-policy: same-origin`** (decisión del dueño, 2026-11-16, rama `fix/fecha-repuesto-adicional`, encargo `docs/encargos/FX-01-adicional-informe-origen.md`): `adicional.astro` e `informe.astro` del taller mandaban `no-referrer`, y con esa política el navegador envía `Origin: null` en el POST del formulario, que `isAllowedOrigin` rechaza: "Crear propuesta", "Generar nuevo enlace" y "Generar informe" respondían 403 desde el día en que se crearon. Pasan a `same-origin`: el navegador manda el `Origin` real al propio sitio y sigue sin mandar referrer a sitios externos. Las páginas públicas por token (`/aprobacion`, `/informe/[token]`, `/seguimiento`) mantienen `no-referrer` porque no chequean `Origin`. Una prueba guardiana impide volver a combinar `isAllowedOrigin` con `no-referrer`. El dueño autorizó cambiar las dos aserciones de `tests/integration/approvals.test.ts` (líneas 337 y 378) que fijaban `no-referrer` en la página interna de Adicional. | Mantener `no-referrer` en las páginas internas con formulario | El navegador enviaba `Origin: null` y el chequeo rechazaba los formularios legítimos | Cambia la defensa de origen de los formularios internos |
| F2-D32 | **Cambio de fecha de entrega con aviso al cliente** (decisión del dueño, 2026-11-16, rama `fix/fecha-repuesto-adicional`, encargo `docs/encargos/FX-02-fecha-entrega.md`): la fecha de entrega se cambia en el detalle de la orden (tarjeta "Fecha de entrega", botón "Guardar y avisar al cliente") y en la pestaña Recepción, por cualquier rol con `reception.perform` (dueño, administrador, recepción y mecánico; el mecánico solo en las órdenes a las que tiene acceso), en cualquier estado no terminal. `changeDeliveryDate` (`src/server/taller/delivery-notice.ts`) reutiliza `confirmDeliveryDate` sin cambiarlo y, después del commit, manda al cliente "Cambiamos la fecha de entrega" con la fecha anterior, la nueva y el enlace de seguimiento, con copia al taller, solo si la fecha cambió, la orden ya no está `reservada` (ahí el aviso es "Recibimos tu bicicleta", que lleva la fecha) y el cliente tiene correo; se audita `notify.delivery_date_changed` y no se repite para la misma fecha. La pestaña Recepción solo guarda el checklist mientras la orden está `reservada` o `recibida`: en estados posteriores sus otros botones funcionan sin tocarlo. | — | — | — |
| F2-D33 | **Aviso al cliente cuando se agrega un repuesto** (decisión del dueño, 2026-11-16, rama `fix/fecha-repuesto-adicional`, encargo `docs/encargos/FX-03-aviso-repuesto.md`): al agregar un repuesto en Líneas, de texto libre o del inventario, el cliente recibe "Agregamos un repuesto a tu orden" con la descripción, la cantidad, el precio unitario cobrado y el nuevo total de la orden (en régimen `neto`, Neto / IVA (19%) / Total), más el enlace de seguimiento, con copia al taller. Se envía después del commit, solo si la orden ya no está `reservada` (las líneas de la recepción van en "Recibimos tu bicicleta") y el cliente tiene correo; se audita `notify.part_added` con `{ itemId, totalClp }`, un correo por repuesto. Nunca incluye costos ni márgenes. Un fallo del correo nunca deshace el repuesto. Los servicios del catálogo no avisan. | — | — | — |
| F2-D34 | **Compra por factura con IA** (decisión del dueño, 2026-11-26, rama `feat/compra-por-factura`, encargo `docs/encargos/FX-05-compra-por-factura.md`): desde Compras o Inventario, dueño y administración (`purchases.manage` y `costs.view`) suben la factura del proveedor: PDF de hasta 10 MB y 5 páginas, o foto JPG, PNG o WebP que se normaliza a JPG. El servidor la guarda en `purchases/imports/<id>/documento.(pdf|jpg)`, la manda a la Messages API de Anthropic con salida JSON estructurada (mismo proveedor, modelo y variables que la biblioteca; con `AI_PROVIDER=none` la pantalla queda deshabilitada) y guarda la lectura en `purchase_imports` sin ningún dato del comprador. La revisión propone el proveedor (por RUT, luego por nombre exacto) y el producto de cada línea (por SKU sin distinguir mayúsculas, luego por código de barras, con hasta 3 sugerencias por nombre que el personal elige) y permite crear proveedor y productos (precio de venta obligatorio; categoría sin bicicleta usada) u omitir líneas. Los costos se redondean al peso y se convierten a neto cuando la factura trae IVA incluido. Al confirmar, en una sola transacción, crea la `OC` con sus líneas y, con "Recibir ahora" (marcado por defecto; exige tipo y número de documento), la recibe con `applyStockMovement(compra)`; si no, queda en `borrador`. Máximo 60 líneas por factura y 50 lecturas por sucursal por día (las fallidas cuentan). Nunca cambia el `price_clp` de un producto existente. Es la única excepción a "IA solo en la biblioteca" (BT-D5): el extractor se inyecta, se llama fuera de toda transacción y las pruebas usan uno falso. | — | — | — |
| F2-D26 | Cada Checkpoint agrega solo rutas nombradas (y `drizzle` tras comprobar que no hay duplicados de iCloud); nunca `git add -A` | `git add -A` como en la fase 1 | El repo está sincronizado con iCloud y acumula copias `* 2.*` y archivos del dueño sin seguimiento | El repo sale de iCloud |

### 20.4 Qué construir después
1. **Link de pago y webhook de Mercado Pago** — fase posterior, después de un mes conciliando a mano (FASE3).
2. **Lectura con lector de códigos en la venta** — cuando el dueño compre el lector (FASE2 §12.5).
3. **Cuentas por pagar con vencimientos** — después de un mes de uso de compras.
4. **Etapa C del dashboard** — comparativas, metas, reportes descargables.
5. **Multi-sucursal** — fase 4; los interruptores ya son por sucursal.

---

*Fin del blueprint. El orden de construcción es §9. Detenerse cuando §20.1 esté en verde.*
