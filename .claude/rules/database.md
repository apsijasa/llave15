---
description: Esquema, migraciones y acceso a Postgres de Vector Bikes
paths:
  - "src/server/db/**"
  - "drizzle/**"
  - "scripts/db-*.ts"
---

# Base de datos

- El esquema vive en ocho archivos, que importan en un solo sentido: `src/server/db/schema.ts` (tablas del sitio, `branches`, `users`) ← `schema-taller.ts` (auditoría, catálogo, clientes, bicicletas) ← `schema-inventory.ts` (`products`, `stock_movements`, `suppliers`, `purchase_orders`, `purchase_order_items`) ← `schema-orders.ts` (órdenes y lo que cuelga de ellas, sin pagos ni componentes) ← `schema-reports.ts` (lo que el cliente recibe de la orden: `service_reports`, `order_tracking_tokens`, `order_whatsapp_notices`) ← `schema-cash.ts` (`cash_sessions`, `cash_movements`, `expenses`) ← `schema-sales.ts` (`sales`, `sale_items`) ← `schema-payments.ts` (`payments`, `bike_components`). Los archivos de la fase 2 se crean en el paso que los nombra (`blueprints/vector-taller-f2/`). `drizzle.config.ts` los lee con `./src/server/db/schema*.ts`.
- Cada archivo queda bajo 400 líneas; una tabla que no cabe va a un archivo nuevo al final de la cadena. Única excepción a "al final": `schema-inventory.ts` va entre `schema-taller.ts` y `schema-orders.ts` porque `work_order_items.product_id` necesita `products` antes de las órdenes (decisión F2-D1 del blueprint de la fase 2); `schema-inventory.ts` importa solo de `schema.ts`.
- `drizzle/` se regenera con `pnpm db:generate` y nunca se edita. Nunca `drizzle-kit generate --custom` ni SQL escrito a mano: si un cambio no se puede expresar en el esquema, se rediseña.
- Cambios de tabla siempre aditivos (tabla, columna, índice o CHECK nuevo; quitar un NOT NULL) para que `drizzle-kit generate` no pregunte por renombres. Un renombre o un borrado va en su propio paso de contracción, sin nada aditivo en la misma generación. Única excepción declarada de la fase 2 (decisión 55): reemplazar el CHECK `payments_method_check` para admitir `mercadopago`, en su propio paso (F2-20), su propia generación —que debe traer solo esas dos sentencias— y la ventana de publicación V2.
- Toda tabla nueva: `id uuid` con `defaultRandom()`, `created_at` y `updated_at` `timestamptz` (salvo tablas de bloqueo con PK natural, como `booking_days`).
- Toda tabla de operación lleva `branch_id uuid not null` con FK a `branches`; toda consulta filtra por la sucursal del usuario de la sesión.
- Instantes en `timestamptz` UTC; fechas y horas locales de negocio en `date` y `time`.
- Dinero en enteros CLP (`integer`), nunca decimales. Los precios de productos y catálogo son netos; el IVA se calcula en código (`vatOfNet`), no se guarda por línea.
- Checks e índices parciales con SQL literal de columnas (`sql\`is_active = true\``), no referencias calificadas. Nombres de restricción con el prefijo de su tabla (`products_stock_qty_check`).
- Las reglas que viven en la base (saldo cero al entregar, control de calidad antes de `lista_para_retirar`, un solo abono vigente, número de orden único por sucursal, token único, stock no negativo, una sesión de caja abierta por sucursal, total = neto + IVA en órdenes `neto` y en ventas, exactamente un destino por pago) son CHECK o índices únicos. Sin triggers.
- Nunca se borra: órdenes, líneas, accesorios, componentes, aprobaciones, fotos, ventas, compras, gastos y movimientos de caja llevan `voided_at`/`voided_by`. Un `stock_movements` no se anula: se revierte con otro movimiento (`anulacion`). Nunca borrar filas de `bookings`.
- `products.stock_qty` solo lo cambia `applyStockMovement` (`src/server/taller/stock.ts`); nunca un `update` directo.
- FKs nuevas con `onDelete: "restrict"`; la única cascada es `admin_sessions.user_id`.
- Cada tabla nueva se agrega al arreglo de su archivo (`allTables`, `tallerTables`, `inventoryTables`, `orderTables`, `reportTables`, `cashTables`, `saleTables` o `paymentTables`): `pnpm db:check` y los tests lo recorren.
- Solo constructor de consultas de Drizzle o `sql\`\`` parametrizado; nunca `db.query.*` relacional (PGlite y postgres-js comparten solo esa API).
- PGlite es de una conexión: las pruebas de concurrencia no usan `FOR UPDATE` concurrente; la garantía se prueba en secuencia contra el CHECK o el índice único.
- `pnpm db:migrate` solo contra la base del workspace; nunca `drizzle-kit push`; la app nunca migra al arrancar.
- Cambios destructivos: expand → migrate → contract en publicaciones separadas (Replit propaga el esquema de dev a producción al publicar, sin datos y sin correr `drizzle/`). Los cambios de esquema de la fase 2 se publican en tres ventanas (V1, V2, V3) documentadas en `docs/ventanas/`.
