# FX-07 · Productos de uso interno y mensajes claros en la carga por factura

## Contexto y autorización (Andrés, 28-11-2026)

FX-05 ya está en producción. Andrés cargó la factura de Bluff como `OC-00001` recibida y aparecieron dos cosas:

1. **Errores poco claros.** Confirmó con las 12 líneas en "Crear producto nuevo" sin precio de venta. La página solo dijo "Revisa los campos marcados."; bajo cada campo, "Revisa este campo e ingresa un valor válido.", sin color ni resumen. Causa: en `src/server/taller/purchase-import-confirm.ts`, `priceClp` vacío falla `integer()` de `confirmImportSchema`, y `fieldsOf` traduce todo error que no es `custom` al mismo texto genérico.
2. **No todo lo comprado se vende.** Desengrasantes, ceras y otros son de uso exclusivo del taller. Hoy todo producto exige `price_clp` (`productFields` en `src/server/taller/products.ts`) y aparece en la venta de mostrador (`sales.ts`, `ventas/nueva.astro`) y en "Agregar repuesto" de la orden (`part-stock.ts`, `ordenes/[id]/lineas.astro`).

Decisiones de Andrés: marca **"Para la venta"** aparte de la categoría (repuesto, accesorio, insumo no cambian de significado). El consumo se registra con **"Registrar uso en taller"** en la ficha del producto: resta stock sin tocar órdenes ni cobrar.

Regístralo como **F2-D35** en `blueprints/vector-taller-f2/blueprint.md` §20.3, después de F2-D34, con este texto (la sesión coordinadora ya lo dejó escrito; verifica que esté):

> **Productos de uso interno** (decisión del dueño, 2026-11-28, rama `feat/uso-interno`, encargo `docs/encargos/FX-07-uso-interno.md`): `products.for_sale` (boolean, por defecto verdadero; los productos existentes siguen vendibles) marca si un producto se vende. Es independiente de la categoría. Un producto de uso interno guarda precio de venta 0 y no lo pide; no aparece ni se acepta en la venta de mostrador ni como repuesto de una orden: el servidor responde `not_found`, igual que con un producto inactivo. Su consumo se registra en su ficha con "Registrar uso en taller" (`inventory.adjust`: dueño y administración): un movimiento `ajuste` negativo con la nota `Uso en taller` (y la nota opcional del personal) por `applyStockMovement`, sin `kind` nuevo para no cambiar el CHECK de `stock_movements`. En la carga por factura, cada producto nuevo trae la casilla "Para la venta" (marcada por defecto); sin ella el precio de venta no se pide. Los errores de la revisión dicen qué falta en cada campo, se marcan en color y se resumen arriba con enlaces a cada sección.

## Lee antes

`AGENTS.md`; `.claude/rules/taller-domain.md`, `.claude/rules/taller-ui.md`, `.claude/rules/server-api.md`, `.claude/rules/database.md`, `.claude/rules/e2e.md`; `docs/encargos/FX-05-compra-por-factura.md` (cómo funciona la carga por factura).

## Rama y reparto

Rama `feat/uso-interno` (base `origin/main`, `c96367e`). Pruebas primero, en rojo. Sin commits ni push: la sesión coordinadora revisa, corre `pnpm db:migrate`, `pnpm db:check` y `pnpm gate`, y commitea.

## Reglas de negocio decididas

| Regla | Valor |
|---|---|
| Columna | `products.for_sale boolean NOT NULL DEFAULT true` |
| Precio de un producto de uso interno | opcional; se guarda 0 |
| Precio de un producto para la venta | obligatorio, como hoy |
| Venta de mostrador y repuesto de orden con producto de uso interno | `not_found` en el servidor; no aparece en los selectores |
| Quién registra el uso | `inventory.adjust` (dueño y administración); el mecánico recibe 403 |
| Qué escribe "Registrar uso en taller" | `applyStockMovement` `kind: "ajuste"`, cantidad negativa, nota `Uso en taller` o `Uso en taller: <nota>`; auditoría `stock.internal_use` con `{ productId, quantity }` |
| Registrar uso de un producto para la venta | `not_internal` (409); la tarjeta no se muestra |
| Cantidad del uso | entero 1..100000; sin stock suficiente, `out_of_stock` |
| Importación | `price_clp` de un producto existente nunca cambia (F2-D34) |

## Esquema

`src/server/db/schema-inventory.ts`, tabla `products`: `forSale: boolean("for_sale").notNull().default(true)`. Genera con `pnpm db:generate` y anota el nombre de `drizzle/0047_*.sql` en el reporte. Debe contener solo `ALTER TABLE "products" ADD COLUMN "for_sale" boolean DEFAULT true NOT NULL;`. No edites `drizzle/` a mano.

## Qué hacer

**`src/server/taller/products.ts`** (315 líneas; si pasa de 380, mueve `recordInternalUse` a `src/server/taller/products-internal-use.ts`)
- `productFields`: `forSale: z.boolean().default(true)`; `priceClp: integer(0, 10_000_000).default(0)`.
- `productFormSchema`: suma un refine. Si `forSale` es verdadero y el precio no vino, falla con `path: ["priceClp"]` y el mensaje "Ingresa el precio de venta neto.". Para distinguir "no vino" de "0", el campo vacío del formulario se preprocesa a `undefined`. Un 0 explícito sigue siendo válido, como hoy.
- `filtersSchema` y `listProducts`: filtro opcional `forSale?: boolean`.
- Nueva `export async function recordInternalUse(db: AppDb, actor: SessionUser, id: string, input: unknown, now: Date)`:
  - Devuelve `{ ok: true; productId: string; stockQty: number }` o `{ ok: false; code: "forbidden" | "validation_error" | "not_found" | "not_internal" | "out_of_stock" }`.
  - Esquema `internalUseSchema = { quantity: integer(1, 100_000), note: optionalText(200) }`, exportado para la página.
  - Dentro de una transacción: lee el producto `for update` con `productScope`. Si no existe, `not_found`; si `forSale` es verdadero, `not_internal`.
  - Llama a `applyStockMovement` con `quantity: -quantity`. Si falla, lanza `StockFailure`.
  - Audita con `auditProduct(..., "stock.internal_use", { productId, quantity })`. La nota no va a la auditoría.
- `updateProduct` ya guarda los campos del esquema, así que `forSale` entra solo. Agrega `forSale` a `before`/`after` de la auditoría.

**`src/server/taller/audit.ts`**: `| "stock.internal_use"`.

**`src/server/taller/sales.ts`** (~L95) y **`src/server/taller/part-stock.ts`** (~L145): `eq(products.forSale, true)` junto a `eq(products.isActive, true)`.

**`src/server/taller/purchase-import-confirm.ts`**
- Línea `create`: `forSale: z.boolean()` y `priceClp: integer(0, 10_000_000).nullable()` (vacío → `null`).
- En `superRefine`: si `forSale` es verdadero y `priceClp === null`, issue `custom` en `["lines", i, "priceClp"]` con "Ingresa el precio de venta para crear este producto, o desmarca «Para la venta»."
- `confirmFormToInput`: `forSale: field("forSale") === "on"` y `priceClp` vacío → `""` (el esquema lo pasa a `null`).
- `productFor`: pasa `forSale` y `priceClp: line.priceClp ?? 0`.
- `fieldsOf`: si el issue es `custom`, usa su mensaje; si no, toma el texto de una tabla `FIELD_MESSAGES` por el último segmento del path. La tabla queda en el mismo archivo:
  - `quantity`: "Ingresa una cantidad entera entre 1 y 10.000."
  - `unitCostClp`: "Ingresa el costo neto en pesos, sin puntos."
  - `priceClp`: "Ingresa el precio de venta neto en pesos, sin puntos."
  - `sku`: "Escribe un SKU de hasta 40 caracteres, sin espacios."
  - `name`: "Escribe un nombre de 2 a 120 caracteres."
  - `unit`: "Escribe la unidad (por ejemplo, unidad)."
  - `category`: "Elige una categoría."
  - `productId`: "Elige un producto existente."
  - `mode`: "Elige qué hacer con esta línea."
  - `supplierId`: "Elige un proveedor."
  - `name` del proveedor (path `supplier-name`): "Escribe la razón social del proveedor."
  - `rut`: "Ingresa un RUT válido."
  - `docType`: "Elige el tipo de documento."
  - `docNumber`: "Escribe el folio."
  - por defecto: el genérico de hoy.

**`src/components/taller/ImportLineRow.astro`**
- `fieldset` con `id={"line-" + index}`.
- Casilla `<label for={prefix+"forSale"}><input type="checkbox" id=… name={prefix+"forSale"} checked=… /> Para la venta</label>`. Va marcada por defecto; con `values` presentes, refleja `values[prefix+"forSale"] === "on"`.
- Etiqueta del precio: "Precio de venta neto (solo si es para la venta)"; `required` sale del campo, porque la página usa `novalidate`.
- Cada `<p>` de error lleva `class="field-error"`.

**`src/pages/taller/compras/factura/[id].astro`**
- Con errores de campo, reemplaza el texto del `role="alert"` por "Faltan datos o hay datos por corregir en:" y una lista de enlaces: `#supplier` "Proveedor", `#document` "Documento", `#line-N` "Línea N+1 · <descripción recortada a 40>".
  - Hay un enlace por sección con al menos un campo en `fields`. Las claves `supplier-*` van a Proveedor; `docType`, `docNumber` y `notes` a Documento; `line-N-*` a la línea N.
  - Arma la lista en el frontmatter, sin lógica de negocio.
- `id="supplier"` e `id="document"` en sus `fieldset`; `class="field-error"` en sus `<p>` de error.

**`src/styles/taller-components.css`** (382 líneas), junto a `.taller .field`:
- `.taller [aria-invalid="true"]:not([type="radio"]):not([type="checkbox"])`: `border-color: var(--status-blocking-ink); border-width: 2px;`
- `.taller .field-error`: `color: var(--status-blocking-ink); font-weight: 600; margin: 0;`
- Solo variables. Ningún hex.

**`src/pages/taller/inventario/nuevo.astro` y `src/pages/taller/inventario/[id].astro`**
- Casilla "Para la venta" (`name="forSale" value="1"`) en el formulario del producto. En `nuevo` va marcada por defecto; en `[id]`, según el producto. El POST arma `forSale: raw.forSale === "1"` como ya se hace con `isActive`.
- Etiqueta del precio: "Precio neto (solo si es para la venta)", sin `required` en el HTML; el servidor decide.
- El mensaje del refine de precio se muestra en el campo.
- En `[id]`, la ficha (`dl.data`) suma "Uso" con "Para la venta" o "Uso interno".
- En `[id]`, si `!product.forSale && canEdit`, va una tarjeta "Registrar uso en taller" antes de "Ajustar stock":
  - Campos: "Cantidad usada" (number, min 1) y "Nota (opcional)". Botón primario "Registrar uso".
  - Usa `action=use` en el `discriminatedUnion` y llama a `recordInternalUse`. Éxito: 303 a `?hecho=use`, con el aviso "Uso registrado.".
  - `out_of_stock`: "No hay stock suficiente para registrar ese uso." en el campo. `not_internal`: "Este producto es para la venta; usa Ajustar stock."
  - Para que la tarjeta tenga una sola acción primaria por zona, el botón de "Ajustar stock" pasa a `.btn.ghost` solo cuando se muestra la tarjeta de uso.

**`src/pages/taller/inventario/index.astro`**: en la columna Estado, si `!product.forSale`, agrega `<span class="status">Uso interno</span>` además del estado de stock. La columna "Precio neto" muestra "Uso interno" en vez de `$0`.

**`src/pages/taller/ventas/nueva.astro`** (L136) y **`src/pages/taller/ordenes/[id]/lineas.astro`** (L212): suma `product.forSale` al filtro.

## No cambiar

- Las firmas exportadas existentes, salvo los campos nuevos que este encargo agrega: `productFormSchema`, `ProductInput`, `insertProduct`, `createSale`, `previewSale`, `addProductPartItem`, `confirmImportSchema`, `confirmFormToInput`, `confirmPurchaseImport`.
- El CHECK de `stock_movements.kind`, `applyStockMovement`, `purchases.ts`, `stock.ts`, `permissions.ts`, `global.css`, `tokens.css`, `.env.example` y `drizzle/` a mano.
- **Ninguna prueba existente se modifica.** Si una falla, detente y reporta el diff. Las pruebas nuevas van en archivos nuevos.
- Sin islas nuevas, sin hex nuevos, sin `new Date()` en `src/server/**`.
- No negociables que aplican:
  - No editar `drizzle/`; migrar solo la base dev.
  - No commitear secretos ni `.env`.
  - Regla 14: ningún dato de un taller en `src/`.
  - 13: el ajuste de stock se prueba en tablet.
  - 14: el stock solo cambia por `applyStockMovement`.
  - 17: costos solo con `costs.view`.
  - 20: aislamiento por taller.

## Pruebas (primero, verlas fallar)

- `tests/unit/purchase-import-messages.test.ts`:
  - `confirmImportSchema` con una línea `create` y `forSale: false` sin precio pasa.
  - Con `forSale: true` sin precio falla con el mensaje nuevo en `line-0-priceClp`. Usa `confirmFormToInput` con un `FormData` para llegar a `fields` por `confirmPurchaseImport`, o prueba `fieldsOf` si lo exportas como `importFieldErrors`.
  - Cantidad "0" da "Ingresa una cantidad entera entre 1 y 10.000.".
  - SKU con espacio da su mensaje.
- `tests/integration/products-internal-use.test.ts` (PGlite, `createTestDb`):
  - Crear un producto `forSale: false` sin precio guarda `price_clp = 0`. Con `forSale: true` y sin precio, `validation_error`.
  - `recordInternalUse` resta stock. El movimiento queda `ajuste`, `-2`, con la nota `Uso en taller: limpieza` y el costo del producto. La auditoría `stock.internal_use` no lleva la nota.
  - Rechaza un producto para la venta (`not_internal`), stock insuficiente (`out_of_stock`), cantidad 0 (`validation_error`) y al mecánico (`forbidden`, sin filas nuevas).
  - `previewSale` y `createSale` con el producto de uso interno devuelven `not_found`; `addProductPartItem` también.
  - `listProducts` con `forSale: false` filtra.
  - El mecánico no recibe `costClp` en `listProducts` (omisión por rol).
- `tests/integration/products-internal-use-isolation.test.ts` (`seedTwoShops`): el taller B no puede registrar uso de un producto de A (`not_found`) y el stock de A no cambia.
- `tests/integration/purchase-import-internal.test.ts`:
  - Confirmar una factura con una línea vendible con precio y una de uso interno sin precio. Ambas crean producto: `for_sale` true con su precio y false con precio 0.
  - Con "Recibir ahora", las dos suben stock.
- `tests/integration/inventario-uso-page.test.ts` (AstroContainer, patrón de `compras-factura-page.test.ts`):
  - La ficha de un producto de uso interno muestra "Registrar uso en taller" al dueño, y no al mecánico ni en un producto para la venta.
  - El POST `action=use` hace 303 `?hecho=use`.
  - La revisión de factura con un error de precio muestra el resumen con un enlace `#line-0` y `aria-invalid="true"` en el campo.
- `e2e/inventario-uso-interno.spec.ts` (tablet, patrón de `e2e/inventario-ajuste.spec.ts`):
  - El dueño crea un producto con "Para la venta" desmarcado y sin precio, con stock inicial 5.
  - En su ficha registra un uso de 2 con la nota "Limpieza de cadena", ve "Uso registrado.", el stock en 3 y el movimiento `-2` con la nota.
  - En `/taller/ventas/nueva`, el producto no aparece.

## Documentación

- `CLAUDE.md`, Arquitectura, nueva viñeta: "**Uso interno (F2-D35).** `products.for_sale = false`: sin precio de venta, fuera de la venta de mostrador y de los repuestos de la orden; el consumo se registra con `recordInternalUse` (`products.ts`) como `ajuste` negativo `Uso en taller`."
- `.claude/rules/taller-domain.md`: una viñeta con la misma regla.
- `.claude/rules/taller-ui.md`: errores de formulario con `class="field-error"` y `aria-invalid` marcados en `--status-blocking-ink`; la revisión de factura resume los errores con enlaces.
- `docs/encargos/README.md`: nada.

## Verificación (sandbox de Codex)

`pnpm format && pnpm check && pnpm test && pnpm build`, y `pnpm db:generate` una vez. Sin red: no corras `db:migrate`, `test:tablet`, `smoke` ni `gate`.

## Reporte

Resumen archivo por archivo, nombre de la migración generada, salida resumida de las cuatro órdenes, y cualquier desvío del encargo con su motivo.
