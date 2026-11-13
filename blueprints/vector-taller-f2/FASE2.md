# FASE 2 — Inventario, caja y ventas de mostrador

> Borrador del 12 de noviembre de 2026, escrito por la sesión coordinadora para que el dueño lo revise y cierre. Es la **entrada** para `/the-architect:architect-brownfield`, no el blueprint. Cuando el dueño lo apruebe, se genera el bundle en `blueprints/vector-taller-f2/` (§15).
>
> Fuentes: `blueprints/vector-taller-f1/FASE1.md` §2.4 (la cerca de la fase 1) y §16 (qué contiene esta fase); `blueprints/vector-taller-f1/blueprint.md` §1 (filas Inventario, Proveedores, Caja POS, Códigos de barra: "se revisa cuando la fase 1 lleve dos semanas sin papel", cumplido el 27-10-2026) y §20.4; `blueprints/roadmap/dashboard-financiero.md` (Etapa B); `blueprints/vector-taller-f1/fuentes/Especificacion sistema de gestion - 49 secciones.md` §24 a §34; `Analisis sistema de gestion - 3 oct 2026.md` §4 y §2.3.

## Cómo se trabaja esta fase

Mismo reparto que la fase 1 y la etapa A (`docs/BITACORA.md` §2, `docs/encargos/README.md`): un encargo por tarea de `tasks.json`, Codex implementa con TDD, Claude revisa, `pnpm gate` en verde, el dueño sube y publica. Diferencias:

- Los cambios de esquema se agrupan en **ventanas de publicación** con el taller cerrado y respaldo del día, porque esta fase trae entre 8 y 10 tablas nuevas.
- La **tarea 0 no lleva migración**: parte `src/server/db/schema-orders.ts` (399 líneas) moviendo `payments` y `bikeComponents` a `schema-payments.ts` sin cambiar nombres de tabla ni columnas; `pnpm db:generate` debe producir una migración vacía o ninguna. Actualiza `scripts/db-check.ts`, `.claude/rules/database.md`, `AGENTS.md` y `CLAUDE.md`.
- Antes del primer paso, el dueño registra la **decisión 55, "apertura de la fase 2"** (§13), que enmienda las reglas que hoy prohíben construir esto.

## 1. Objetivo y criterio de término

Que un repuesto vendido o usado en una orden descuente stock solo, que el día cierre con la caja cuadrada sin planilla, y que el dueño vea ingresos, egresos y margen del período en `/taller/indicadores`.

**La fase 2 está lista cuando el taller lleva un mes operando stock y caja sin planilla.** No cuando el código pasa la compuerta.

Escala: una sucursal, dos personas en el mostrador, del orden de 150 productos, 10 a 20 bicicletas por semana.

## 2. Decisiones cerradas

Propuestas por la coordinadora; el dueño las confirma o cambia antes de generar el blueprint. Las que cambien se anotan aquí con su fecha.

### 2.1 Arquitectura y entorno

1. Mismo proyecto, misma base, mismo despliegue. Nada de servicios nuevos.
2. Esquema en archivos nuevos al final de la cadena: `schema-payments.ts` (tarea 0), `schema-inventory.ts`, `schema-cash.ts`. Cada uno con su arreglo de tablas para `db:check` y `foundation.test.ts`.
3. **Mercado Pago solo como registro.** `payments.method` admite `mercadopago` y guarda `external_id`, `fee_clp` y `net_clp` para conciliar a mano. El link de pago y el webhook son de una fase posterior (`/the-architect` no los incluye).
4. Los costos existen desde esta fase (`cost_clp` en productos, `unit_cost_clp` congelado en líneas de venta y de orden, `fee_clp` en pagos) y **solo salen de `src/server/**` para roles con la acción nueva `costs.view`** (dueño y administrador). Se prueba por rol en cada función que los devuelve.
5. Acciones nuevas en `permissions.ts`: `inventory.view` (todos los roles), `inventory.adjust` (dueño, administrador), `purchases.manage` (dueño, administrador), `sales.record` (dueño, administrador, recepción), `expenses.record` (dueño, administrador), `cash.open_close` (dueño, administrador, recepción), `costs.view` (dueño, administrador).

### 2.2 Inventario

6. El stock **solo cambia por `stock_movements`**: nunca un `update` directo de `products.stock_qty`. `stock_qty` se recalcula en la misma transacción bajo `select … for update` y lleva CHECK `>= 0`.
7. Costo promedio ponderado por movimiento de compra; no se guarda historial de precios de compra (especificación §24).
8. Un producto es repuesto, accesorio o insumo (`category`); las bicicletas usadas son una categoría más con número de serie obligatorio, propiedad del taller (§29), sin consignación.
9. `barcode` nullable y único por sucursal desde el primer día; la **lectura** con lector queda para la segunda mitad de la fase (la etiqueta con QR de la orden ya existe).
10. Alerta de stock mínimo: aparece en `/taller` (dueño y administración) y en el resumen diario de alertas (`/api/tareas/alertas`) cuando `stock_qty <= min_stock`.

### 2.3 Caja

11. **Una sesión de caja abierta por sucursal** (índice único parcial `closed_at is null`). Abre con el efectivo inicial; cierra con el conteo, el esperado y la diferencia; queda auditado.
12. Todo pago en efectivo y todo egreso en efectivo cuelga de la sesión abierta. Sin sesión abierta, el servidor responde `cash_closed` y no escribe.
13. Transferencia, tarjeta y Mercado Pago no pasan por la caja de efectivo, pero sí se listan en el cierre del día.
14. Ningún movimiento se edita: se anula (`voided_at`) y se crea otro.
15. Devoluciones y descuentos: con responsable, monto y motivo, solo dueño y administrador (§32, §33). Una devolución es un movimiento de caja negativo y, si devuelve un producto, un `stock_movements` positivo.

### 2.4 Ventas de mostrador

16. `sales` sin cliente obligatorio (FASE1 decisión 17: la venta de mostrador es fase 2). Con cliente, queda en su historial.
17. Una venta tiene líneas de productos (`sale_items`) con precio y costo congelados, y pagos (`payments.sale_id`).
18. La boleta sigue saliendo del POS/SII fuera del sistema (decisión 10 de la fase 1); la venta guarda tipo y folio del documento como hoy lo hace la orden.

### 2.5 Lo que queda afuera y por qué

| Tema | Destino | Razón |
|---|---|---|
| Pago en línea (link de Mercado Pago, webhook) | Fase posterior | Primero conciliar a mano un mes; después automatizar. |
| Cuentas de clientes, portal, puntos, membresías | Fuera del sistema | FASE1 §2.4, punto 48 de la especificación. |
| Multi-sucursal, convenios, tienda online | Fase 4 | `branch_id` ya está en todo. |
| Strava, kilómetros, desgaste, mantenimiento predictivo | Fase 3 | Decisión del dueño en FASE1. |
| Asistente de WhatsApp, reseñas automáticas | Fase 3 | Requiere Meta. |
| Portal de proveedores, cuentas por pagar con vencimientos | Por definir | La fase 2 registra la compra y su documento; el calendario de pagos espera a ver cómo se usa. |
| Cotizaciones sin orden de trabajo | Por definir | Pregunta abierta del roadmap. La cotización por correo de la orden ya existe (decisión 50). |
| Comparativas contra el período anterior, metas, reportes descargables | Etapa C del dashboard | `dashboard-financiero.md`. |

**Esta tabla es la cerca del alcance de la fase 2** y reemplaza, para esta fase, la de FASE1 §2.4.

## 3. Alcance de la fase 2

- **3.0 Tarea 0 — Partir `schema-orders.ts`** sin migración (ver "Cómo se trabaja").
- **3.1 Productos y categorías:** `/taller/inventario` (lista con stock y mínimo, filtros por categoría y bajo mínimo), `/taller/inventario/nuevo`, `/taller/inventario/[id]` (ficha, movimientos). Importación inicial por `scripts/inventory-import.ts` desde CSV (§12).
- **3.2 Movimientos y ajustes:** ajuste manual con motivo (`inventory.adjust`), historial por producto, auditoría.
- **3.3 Proveedores y órdenes de compra:** `/taller/proveedores`, `/taller/compras` con estados `borrador → enviada → recibida | anulada`; recibir una compra genera los movimientos de entrada y actualiza el costo promedio.
- **3.4 Repuestos de la orden ligados a producto:** en Líneas, "Agregar repuesto" elige un producto del inventario (o texto libre como hoy); `addPartItem` con `productId` descuenta stock en la misma transacción; `voidItem` revierte. El precio sugerido es `products.price_clp`; el mecánico sigue sin poder cambiarlo.
- **3.5 Ventas de mostrador:** `/taller/ventas/nueva` (productos, cantidades, cliente opcional, pago), `/taller/ventas` (lista del día y por rango), anulación con motivo.
- **3.6 Pagos ampliados:** `mercadopago` como medio con `external_id`, `fee_clp`, `net_clp`; pagos de ventas; cada pago en efectivo ligado a la sesión de caja.
- **3.7 Gastos:** `/taller/gastos` con categoría cerrada (arriendo, sueldos, servicios, insumos, repuestos, otros), monto, fecha, proveedor opcional, documento, medio; los de efectivo salen de la caja.
- **3.8 Caja diaria:** `/taller/caja` con apertura, lista de movimientos del día (pagos de órdenes, ventas, gastos, devoluciones), cierre con conteo y diferencia, historial de sesiones.
- **3.9 Indicadores, Etapa B:** en `/taller/indicadores`: egresos del período, balance, gastos / ingresos, mix servicios / repuestos / ventas de mostrador, inventario (activos, bajo mínimo, sin stock, valor a costo), margen bruto de repuestos.
- **3.10 Permisos y auditoría:** las siete acciones nuevas; auditoría de ajustes de stock, cierres de caja, anulaciones, devoluciones y descuentos.

## 4. Principio central

**Ningún número de stock ni de caja se escribe a mano: todo es consecuencia de un movimiento con autor, fecha y referencia.** Si un saldo está mal, se corrige con un movimiento de ajuste que explica por qué.

## 5. Modelo de datos

Todas con `id uuid`, `branch_id` NOT NULL, `created_at`, `updated_at`; `voided_at`/`voided_by` donde algo se anula; dinero en pesos enteros; FKs `restrict`.

| Tabla | Columnas principales | Reglas en la base |
|---|---|---|
| `products` | `sku`, `name`, `category` CHECK (`repuesto`, `accesorio`, `insumo`, `bicicleta_usada`), `unit`, `cost_clp`, `price_clp`, `stock_qty`, `min_stock`, `barcode`, `serial_number`, `supplier_id`, `is_active` | `sku` único por sucursal; `barcode` único por sucursal donde no nulo; CHECK `stock_qty >= 0`, `cost_clp >= 0`, `price_clp >= 0` |
| `stock_movements` | `product_id`, `kind` CHECK (`compra`, `venta`, `consumo_orden`, `ajuste`, `devolucion`, `anulacion`), `quantity` entero con signo, `unit_cost_clp`, `reference_kind`, `reference_id`, `note`, `created_by` | índice (`product_id`, `created_at`); CHECK `quantity <> 0` |
| `suppliers` | `name`, `rut`, `phone`, `email`, `notes`, `is_active` | `rut` único donde no nulo |
| `purchase_orders` | `supplier_id`, `number`, `status` CHECK (`borrador`, `enviada`, `recibida`, `anulada`), `doc_type`, `doc_number`, `received_at`, `received_by`, `created_by` | `number` único por sucursal |
| `purchase_order_items` | `purchase_order_id`, `product_id`, `quantity`, `unit_cost_clp`, `received_qty` | CHECK `quantity > 0`, `received_qty between 0 and quantity` |
| `sales` | `number`, `customer_id` nullable, `status` CHECK (`abierta`, `pagada`, `anulada`), `total_clp`, `paid_clp`, `cash_session_id` nullable, `doc_type`, `doc_number`, `created_by` | `number` único por sucursal; CHECK `status <> 'pagada' or paid_clp = total_clp` |
| `sale_items` | `sale_id`, `product_id`, `description`, `quantity`, `unit_price_clp`, `unit_cost_clp` | CHECK `quantity > 0` |
| `expenses` | `category` CHECK lista cerrada, `amount_clp`, `expense_date`, `supplier_id` nullable, `method`, `doc_type`, `doc_number`, `cash_session_id` nullable, `created_by` | CHECK `amount_clp > 0` |
| `cash_sessions` | `opened_at`, `opened_by`, `opening_cash_clp`, `closed_at`, `closed_by`, `counted_cash_clp`, `expected_cash_clp`, `difference_clp`, `note` | índice único parcial (`branch_id`) donde `closed_at is null` |
| `cash_movements` | `cash_session_id`, `kind` CHECK (`ingreso`, `egreso`), `amount_clp`, `reference_kind`, `reference_id`, `note`, `created_by` | CHECK `amount_clp > 0` |
| `payments` (extensión) | `work_order_id` pasa a nullable; `sale_id` nullable; `external_id`, `fee_clp` default 0, `net_clp`; `cash_session_id` nullable; `method` admite `mercadopago` | CHECK "exactamente uno de `work_order_id` / `sale_id`"; el CHECK de `method` cambia (ver §11) |
| `work_order_items` (extensión) | `product_id` nullable | — |

## 6. Integración con lo ya construido

- `addPartItem(db, actor, orderId, input, now)` acepta `productId` opcional: bloquea el producto, inserta `stock_movements(consumo_orden, -quantity, unit_cost_clp = costo promedio)`, actualiza `stock_qty`, y la línea guarda `product_id` y el costo congelado. `voidItem` inserta la reversa (`anulacion`, +quantity). Sin `productId`, se comporta como hoy.
- `recordPayment` acepta `saleId` o `workOrderId`; con `method = 'efectivo'` exige sesión de caja abierta y crea `cash_movements(ingreso)`; con `mercadopago` exige `external_id` y acepta `fee_clp`/`net_clp`.
- `completeDelivery` no cambia: el CHECK de saldo cero sigue en `work_orders`.
- `/taller/indicadores` (decisión 54) gana los bloques de la Etapa B; `workshopIndicators` sigue devolviendo `null` sin `dashboard.finance`, y los costos solo con `costs.view`.
- `/api/tareas/alertas` suma la lista de productos bajo mínimo al resumen diario.
- El historial del cliente (`history.ts`) muestra sus ventas de mostrador.
- Auditoría con `recordAudit` dentro de la misma transacción, acciones nuevas en `AuditAction`.

## 7. Protección de datos personales

Proveedores con datos de contacto bajo las mismas reglas que clientes (redacción en auditoría y logs, sin PII en páginas públicas). Mercado Pago: solo identificadores de pago, nunca datos de tarjeta. Ventas sin cliente no guardan nada personal.

## 8. Dispositivos

Venta de mostrador y caja: escritorio o la tablet de recepción (táctil ≥ 48px). Ajustes de stock: tablet. Compras, proveedores, gastos e indicadores: escritorio. Las pruebas de Playwright cubren venta, cobro en efectivo con caja abierta y ajuste de stock en tablet.

## 9. Diseño visual

Igual que la fase 1 y la etapa A: tokens de `global.css`, reglas de 1px, radio 2px, sin sombras, tablas densas con `tabular-nums`. Alertas de stock y diferencias de caja con forma más texto, nunca solo color. Sin gráficos; si hacen falta barras, en tinta y rayado.

## 10. Tamaño estimado

18 a 24 pasos: tarea 0 (1); productos y movimientos (4); proveedores y compras (3); repuestos ligados a producto (2); ventas (3); pagos ampliados (2); gastos (2); caja (3); indicadores B (2); cierre y documentación (1). Tres ventanas de publicación con esquema: después de productos y movimientos, después de ventas y pagos, después de caja.

## 11. Riesgos

- `schema-orders.ts` en el límite: la tarea 0 va primero y sola.
- Cambiar el CHECK `payments_method_check` no es aditivo: migración propia, ventana propia, documentada como la única excepción de la fase.
- Stock negativo por dos consumos simultáneos: `for update` + CHECK; la prueba de concurrencia usa índices y CHECK, no `for update` (PGlite es de una conexión; BITACORA §8).
- Confusión entre "pago de orden" y "movimiento de caja": un solo punto de entrada (`recordPayment`) crea los dos.
- Costos filtrándose al mecánico: prueba de omisión por rol en cada función que devuelve `cost_clp`, `unit_cost_clp` o `fee_clp`.
- Líneas de repuesto antiguas (texto libre) no se migran a productos: `product_id` queda `null` y los indicadores de margen empiezan en cero.
- Tiempo del `pnpm gate` crece con cada spec de tablet: mantener los specs cortos.

## 12. Pendientes operativos, fuera del diseño

1. Inventario físico inicial y su CSV (sku, nombre, categoría, costo, precio, stock, mínimo, código de barras).
2. Lista cerrada de categorías de gasto que usa el contador.
3. Cuenta de Mercado Pago del taller, para conocer la comisión real.
4. Decidir si los precios del catálogo y de los productos incluyen IVA (pendiente 3 de BITACORA §7).
5. Lector de códigos de barra, si se compra, y su modo (teclado USB o Bluetooth).

## 13. Lo que no se negocia al construir

1. `branch_id` NOT NULL en toda tabla nueva.
2. Nunca borrar: `voided_at`/`voided_by`.
3. El stock solo cambia por `stock_movements`; `stock_qty` con CHECK `>= 0`.
4. Una sesión de caja abierta por sucursal; sin sesión abierta no entra efectivo.
5. Los pagos y los movimientos no se editan; se anulan y se crean otros.
6. Los costos solo salen con `costs.view`; el mecánico nunca los recibe.
7. Dinero en pesos enteros.
8. Esquema solo por `pnpm db:generate`, aditivo, salvo la excepción declarada del CHECK de `method`.
9. Mercado Pago solo registro: nada de credenciales de pago en esta fase.
10. Archivos < 400 líneas; funciones < 50; ninguna isla nueva salvo que el dueño la autorice por decisión.
11. `pnpm gate` en verde antes de marcar un paso; venta, cobro y ajuste de stock probados en tablet.

**Decisión 55, "apertura de la fase 2"** (el dueño la registra en `blueprints/vector-taller-f1/blueprint.md` §20.3 antes del primer paso): enmienda el No negociable 6 de `AGENTS.md` y `CLAUDE.md` (quitar inventario, caja/POS, proveedores y códigos de barra de la cerca; dejar Strava, asistente de WhatsApp y multi-sucursal; la cerca vigente es FASE2 §2.5); reemplaza la última viñeta de `.claude/rules/taller-domain.md` por "Los costos existen desde la fase 2 y solo salen de `src/server/**` para roles con `costs.view`; se prueba por rol"; actualiza `.claude/rules/database.md` (cinco o seis archivos de esquema; la excepción del CHECK de `method`); autoriza las siete acciones nuevas en `permissions.ts` y, si `tests/unit/permissions.test.ts` o `tests/integration/foundation.test.ts` enumeran acciones o tablas, autoriza modificarlos en el paso que las agrega. `blueprint.md` §1 y `FASE1.md` §2.4 no se editan: son el registro de la fase 1.

## 14. Criterios de aceptación de la fase

1. Crear un producto y recibir una compra de 5 unidades deja `stock_qty = 5` y un movimiento `compra`.
2. Agregar ese repuesto a una orden deja `stock_qty = 4`; anular la línea lo devuelve a 5, con dos movimientos.
3. Dos consumos simultáneos del último stock: uno entra y el otro falla con `out_of_stock`; nunca queda negativo.
4. Una venta de mostrador sin cliente, pagada en efectivo con caja abierta, deja la venta `pagada`, el pago y un `cash_movements(ingreso)`.
5. Sin caja abierta, el cobro en efectivo responde `cash_closed` y no escribe nada.
6. El cierre de caja calcula el esperado (apertura + ingresos − egresos) y la diferencia contra el conteo.
7. Un gasto en efectivo descuenta de la caja; uno por transferencia no.
8. Un pago `mercadopago` guarda `external_id`, `fee_clp` y `net_clp`, y el neto aparece en indicadores.
9. El mecánico no recibe `cost_clp` en ninguna respuesta de `src/server/**` ni lo ve en ninguna pantalla.
10. `/taller/indicadores` muestra egresos, balance y mix del período.
11. La auditoría registra quién ajustó stock, cerró caja, anuló o descontó.
12. `pnpm gate` en verde.
13. Un mes de operación real con stock y caja sin planilla.

Los primeros doce se verifican en el blueprint, paso por paso. El trece lo verifica el taller.

## 15. Cómo generar el blueprint

Requisitos: este documento aprobado y commiteado; decisión 55 registrada y las reglas enmendadas; árbol limpio; respaldos de la base activos; la etapa A publicada (sus migraciones `0025` a `0027` aplicadas en producción).

Desde la raíz del repo:

```
/the-architect:architect-brownfield Lee blueprints/vector-taller-f2/FASE2.md, el blueprint de la fase 1 en blueprints/vector-taller-f1/blueprint.md (solo lectura) y blueprints/roadmap/dashboard-financiero.md. Construye el blueprint de la fase 2 en blueprints/vector-taller-f2/. La tarea 0 es partir src/server/db/schema-orders.ts sin migración. Las decisiones de la sección 2 están cerradas: no las re-preguntes. La sección 2.5 es la cerca. La sección 14 son los criterios de aceptación. Respeta CLAUDE.md, AGENTS.md y .claude/rules/, ya enmendados por la decisión 55. Cada paso toca como máximo 5 archivos, tiene un Verify observable y, cuando toca venta, cobro o ajuste de stock, una prueba de Playwright en tablet. Agrupa los cambios de esquema en tres ventanas de publicación.
```

Después, `/the-architect:architect-next` por cada paso, y un encargo por paso en `docs/encargos/F2-NN-*.md`.

## 16. Documentos de las otras fases

- `FASE3.md` — La inteligencia: componentes con kilómetros, Strava, mantenimiento predictivo, asistente de WhatsApp, reseñas de Google, fichas de suspensiones, **y la integración de Mercado Pago (link de pago y webhook)** sobre los campos de registro de esta fase.
- `FASE4.md` — Crecimiento: multi-sucursal, convenios, tienda online.
- `../roadmap/dashboard-financiero.md` — Etapa C: comparativas, metas, reportes descargables.

**La fase 2 no empieza antes de que la etapa A esté publicada y la decisión 55 registrada.**
