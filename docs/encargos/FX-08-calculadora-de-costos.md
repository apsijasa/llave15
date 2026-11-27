Calculadora de costos en `/taller/calculadora`

## Contexto y autorización (Andrés, 26-11-2026)

Hoy el taller registra gastos (`expenses`, `src/server/taller/expenses.ts`), costos y precios netos de productos (`products.cost_clp`, `price_clp`, `src/server/taller/products.ts`) y servicios con minutos y precio por tipo de bici (`services.estimated_minutes`, `service_prices`, `src/server/taller/catalog.ts`), pero no tiene dónde responder "¿cuánto me cuesta una hora de taller?" ni "¿a cuánto vendo este lubricante que me costó $1.500 para ganar lo suficiente?". Andrés quiere una calculadora de costos como la de Tribike Academy (gastos del mes ÷ horas cobrables = costo por hora; minutos del servicio × costo hora + insumos = costo del trabajo; precio sugerido con un margen), conectada a los datos que ya existen.

Decisiones del dueño (26-11-2026):

- La usan quienes tienen `costs.view` (dueño y administración). Link "Calculadora" en el grupo "Gestión" del menú, después de "Indicadores".
- Elegir un producto del inventario trae su costo neto y su precio actual; elegir un servicio del catálogo trae sus minutos y su precio por tipo de bici; los gastos del mes se sugieren desde los gastos registrados el mes calendario anterior. Las pantallas de inventario, catálogo y gastos no cambian. La calculadora **nunca escribe precios**: solo sugiere.
- La ganancia se mide **sobre el precio de venta** ("de cada $100 que cobras, $30 quedan"), no como recargo sobre el costo.
- Andrés autoriza por escrito (26-11-2026, esta decisión) **un solo cambio en una prueba existente**: en `tests/integration/llave15-layouts.test.ts`, agregar `["/taller/calculadora", "Calculadora"]` justo después de `["/taller/indicadores", "Indicadores"]` en `expectedLinks.owner` y `expectedLinks.admin`. Ningún otro valor esperado de ninguna otra prueba cambia.

Regístralo como **decisión BG-D57** en `blueprints/bike-garage/blueprint.md` §20.3 (nueva fila después de `BG-D56`), con este texto en las columnas de la tabla (`# | Decisión | Alternativa rechazada | Por qué | Se revierte si`):

> **BG-D57** | Calculadora de costos (decisión del dueño, 2026-11-26, rama `feat/calculadora-costos`, encargo `docs/encargos/FX-08-calculadora-de-costos.md`): `/taller/calculadora` con `costs.view` calcula el gasto fijo del mes, el costo por hora (gasto ÷ horas facturables), el costo de un servicio (minutos × costo hora + insumos) y el precio neto y con IVA para un margen sobre el precio de venta (`ceil(costo × 100 / (100 − margen))`). El perfil de gastos se guarda por sucursal en `cost_profiles` (`schema-costing.ts`, archivo quince de la cadena); los gastos se sugieren desde `expenses` del mes anterior (repuestos fuera, son costo variable). Nunca escribe precios. Sin isla: tres formularios que se recalculan en el servidor | Isla Preact con cálculo en vivo; recargo sobre el costo; calculadora sin guardar | Regla "ninguna isla nueva en /taller"; el margen sobre el precio es el que usan los indicadores y la referencia del dueño; guardar evita reescribir los gastos cada vez | El dueño pide fijar precios desde la calculadora o un costo por hora por mecánico

## Lee antes

`AGENTS.md`; `.claude/rules/database.md`; `.claude/rules/server-api.md`; `.claude/rules/taller-domain.md`; `.claude/rules/taller-ui.md`; `.claude/rules/ui-design.md`; `.claude/rules/e2e.md`. Como modelos: `src/pages/taller/ventas/nueva.astro` (botón que recalcula en el servidor con `name="action"`), `src/pages/taller/mi-taller.astro` (guardar → 303 `?hecho=`), `src/server/taller/expenses.ts` (permiso → zod → transacción → `recordAudit`), `tests/integration/expenses.test.ts`, `tests/integration/lineas-un-formulario.test.ts`, `e2e/caja-efectivo.spec.ts` (`dataValue` sobre `dl.data`).

## Rama y reparto

Rama `feat/calculadora-costos`, creada desde el commit de FX-04 (incluye `drizzle/0045_*`), árbol limpio. Pruebas primero, en rojo; `pnpm format && pnpm check && pnpm test && pnpm build` en verde; sin commits ni push. Corre `pnpm db:generate` una vez después de escribir el esquema y anota en el reporte el archivo generado (debe ser `drizzle/0046_*.sql`); **no** corras `pnpm db:migrate`, `db:check`, `test:tablet`, `smoke` ni `gate` (sin red). Escribe primero y verifica una vez al final.

## Reglas de negocio decididas

Todo en enteros CLP, con aritmética entera. Nunca `1 − margen / 100` en coma flotante: con 90 % da `0.09999999999999998` y el precio sale 100.001 en vez de 100.000.

| Función (`src/server/taller/costing-rules.ts`) | Regla | Ejemplos (deben quedar como pruebas) |
|---|---|---|
| `monthlyTotal(costs)` | suma de `rentClp + utilitiesClp + wagesClp + taxesClp + otherClp + suppliesClp` | 250.000 + 50.000 + 0 + 20.000 + 30.000 + 50.000 = 400.000 |
| `hourlyCost(totalClp, billableHours)` | `billableHours <= 0` → `null`; si no, `Math.ceil(totalClp / billableHours)` | (400.000, 100) → 4.000 · (400.000, 120) → 3.334 · (0, 100) → 0 · (400.000, 0) → `null` |
| `laborCost(minutes, hourlyCostClp)` | `Math.ceil(minutes * hourlyCostClp / 60)` | (90, 4.000) → 6.000 · (50, 4.000) → 3.334 |
| `serviceCost({ minutes, hourlyCostClp, suppliesClp })` | `{ laborClp, suppliesClp, costClp: laborClp + suppliesClp }` | (90, 4.000, 3.000) → 6.000 / 3.000 / 9.000 |
| `priceForMargin(costClp, marginPct)` | `netClp = Math.ceil(costClp * 100 / (100 - marginPct))`, `grossClp = grossOfNet(netClp)`; `marginPct >= 100` o no entero → `RangeError` | (1.500, 30) → 2.143 / 2.550 · (9.000, 30) → 12.858 / 15.301 · (7.000, 40) → 11.667 / 13.884 · (10.000, 90) → 100.000 / 119.000 · (1.500, 0) → 1.500 / 1.785 · (0, 30) → 0 / 0 |
| `marginOfPrice(costClp, priceNetClp)` | `priceNetClp <= 0` → `null`; si no, `Math.round((priceNetClp - costClp) * 100 / priceNetClp)` | (1.500, 2.143) → 30 · (1.500, 2.500) → 40 · (9.000, 35.000) → 74 · (2.000, 1.500) → −33 · (1.500, 0) → `null` |
| `priceTable(costClp, margins = PRICE_TABLE_MARGINS)` | una fila `{ marginPct, netClp, grossClp }` por margen, en orden | 1.500 → 20: 1.875 / 2.231 · 30: 2.143 / 2.550 · 40: 2.500 / 2.975 · 50: 3.000 / 3.570 |

Constantes exportadas: `DEFAULT_TARGET_MARGIN_PCT = 30`, `MAX_MARGIN_PCT = 90`, `PRICE_TABLE_MARGINS = [20, 30, 40, 50] as const`, `MAX_BILLABLE_HOURS = 744`. Tipos: `MonthlyCosts` (los seis montos) y `PriceRow`. El archivo solo importa `grossOfNet` de `./rules.ts`.

Redondeo: los costos suben al peso (nunca se subestima) y el precio sube al peso siguiente; no se redondea a $10. La página dice "Precio sugerido; redondéalo al fijar el precio de lista."

### Sugerencia desde los gastos registrados

Mes calendario anterior al de `now` en `America/Santiago` (`TIMEZONE` de `src/lib/time.ts`), con `expenseTotals` de `indicators-finance.ts` (ya excluye anulados y filtra por sucursal):

| Categoría de gasto | Campo del perfil | Etiqueta en la página |
|---|---|---|
| `arriendo` | `rentClp` | Arriendo |
| `servicios` | `utilitiesClp` | Servicios básicos |
| `sueldos` | `wagesClp` | Sueldos |
| — (no hay categoría) | `taxesClp` (siempre 0) | Impuestos y patentes |
| `insumos` | `suppliesClp` | Insumos del taller |
| `otros` | `otherClp` | Otros gastos |
| `repuestos` | fuera (costo variable, se cobra en cada orden) | — |

Ejemplos: `now = 2026-11-14T15:00:00Z` → del 2026-10-01 al 2026-10-31. `now = 2026-12-01T03:30:00Z` (00:30 del 1 de diciembre en Santiago) → del 2026-11-01 al 2026-11-30.

## Esquema

Archivo nuevo `src/server/db/schema-costing.ts`, al final de la cadena (importa solo `schema.ts`: `branches`, `users`, `createdAt`, `updatedAt`):

```ts
/** Perfil de costos mensuales del taller (FX-08, BG-D57): una fila por sucursal. */
export const costProfiles = pgTable("cost_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "restrict" }),
  rentClp: integer("rent_clp").notNull().default(0),
  utilitiesClp: integer("utilities_clp").notNull().default(0),
  wagesClp: integer("wages_clp").notNull().default(0),
  taxesClp: integer("taxes_clp").notNull().default(0),
  otherClp: integer("other_clp").notNull().default(0),
  suppliesClp: integer("supplies_clp").notNull().default(0),
  billableHoursMonth: integer("billable_hours_month").notNull().default(0),
  targetMarginPct: integer("target_margin_pct").notNull().default(30),
  updatedBy: uuid("updated_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("uq_cost_profiles_branch").on(t.branchId),
  check("cost_profiles_amounts_check", sql`rent_clp >= 0 and utilities_clp >= 0 and wages_clp >= 0 and taxes_clp >= 0 and other_clp >= 0 and supplies_clp >= 0`),
  check("cost_profiles_hours_check", sql`billable_hours_month between 0 and 744`),
  check("cost_profiles_margin_check", sql`target_margin_pct between 0 and 90`),
]);
export const costingTables = [costProfiles] as const;
```

Agrega `costingTables` a `scripts/db-check.ts` (import y `...costingTables` después de `...platformTables`). Luego `pnpm db:generate` (nunca editar `drizzle/` a mano ni `--custom`). Cambio solo aditivo.

## Qué hacer

- **`src/server/taller/costing-rules.ts`** (nuevo, puro, sin base): la tabla de arriba.
- **`src/server/taller/indicators-finance.ts`**: `async function expenseTotals` pasa a `export async function expenseTotals`, con el comentario "Sin chequeo de permiso: lo hace quien llama." Nada más cambia.
- **`src/server/taller/audit.ts`**: agrega `| "costing.profile_saved"` a `AuditAction`.
- **`src/server/taller/costing.ts`** (nuevo, < 350 líneas; si no cabe, las cotizaciones van a `src/server/taller/costing-quotes.ts`). Todas las funciones revisan `can(actor.role, "costs.view")` primero.
  - Zod. Montos CLP aceptan número, `"400000"`, `"400.000"` y `"$ 400.000"` (quitar `$` y espacios; si calza `^\d{1,3}(\.\d{3})+$`, quitar los puntos) y rechazan `"abc"`, `"1.5"` y negativos; enteros 0..999.999.999. Campos vacíos usan su valor por defecto.
    - `costProfileSchema`: los seis montos (default 0), `billableHoursMonth` 0..744 (default 0), `targetMarginPct` 0..90 (default 30).
    - `serviceQuoteSchema`: `serviceId` uuid opcional, `bikeType` de `BIKE_TYPES` opcional, `minutes` 1..1440 opcional, `suppliesClp` (vacío = 0), `packCostClp` y `packJobs` opcionales (ayuda de prorrateo: si vienen los dos, se suma `Math.ceil(packCostClp / packJobs)` a los insumos; `packJobs` 1..10.000), `marginPct` 0..90 opcional. Refinamiento: `serviceId` o `minutes` (mensaje "Elige un servicio o escribe los minutos.", ruta `serviceId`).
    - `productQuoteSchema`: `productId` uuid opcional, `costClp` opcional, `marginPct` 0..90 opcional. Refinamiento: `productId` o `costClp` (mensaje "Elige un producto o escribe el costo.", ruta `productId`).
  - `getCostProfile(db: AppDb, actor: SessionUser): Promise<CostProfile | null>` — `null` sin permiso; sin fila, los valores por defecto con `saved: false` y `updatedAt: null`. `CostProfile = MonthlyCosts & { billableHoursMonth: number; targetMarginPct: number; saved: boolean; updatedAt: Date | null }`.
  - `saveCostProfile(db, actor, input: unknown, now: Date): Promise<{ ok: true } | { ok: false; code: "forbidden" } | { ok: false; code: "validation_error"; fields: string[] }>` — en una transacción: `insert … onConflictDoUpdate({ target: costProfiles.branchId, set: { ...datos, updatedBy: actor.id, updatedAt: now } }).returning({ id })` con `branchId: actor.branchId`, y `recordAudit(tx, { branchId, actorUserId: actor.id, action: "costing.profile_saved", entity: "cost_profile", entityId: id, details: datos }, now)`.
  - `suggestedMonthlyCosts(db, actor, now: Date): Promise<SuggestedCosts | null>` — `SuggestedCosts = { range: { from: string; to: string }; values: MonthlyCosts; totalClp: number; hasExpenses: boolean }`, según la tabla de la sección anterior.
  - `serviceQuote(db, actor, input: unknown)` → `{ ok: true; quote: ServiceQuote; values: Record<string, string> }` o `{ ok: false; code: "forbidden" | "validation_error" | "not_found" | "hours_missing"; fields?: string[] }`. Minutos = los escritos o `estimatedMinutes` del servicio (`getService`); margen = el escrito o el objetivo del perfil; sin horas guardadas → `hours_missing`; servicio de otra sucursal o inexistente → `not_found`. `ServiceQuote = { serviceName: string | null; bikeType: BikeType | null; minutes: number; hourlyCostClp: number; laborClp: number; suppliesClp: number; costClp: number; marginPct: number; priceNetClp: number; priceGrossClp: number; catalogPriceClp: number | null; catalogMarginPct: number | null; table: PriceRow[] }`; `catalogPriceClp` = precio del servicio para ese tipo de bici, o `null`. `values` son los valores efectivos como texto (por ejemplo `minutes: "90"` cuando venía vacío) para rellenar el formulario.
  - `productQuote(db, actor, input: unknown)` → `{ ok: true; quote: ProductQuote; values }` o `{ ok: false; code: "forbidden" | "validation_error" | "not_found"; fields? }`. El producto se lee con un `select` propio (`id, sku, name, costClp, priceClp`) filtrado por `products.branchId = actor.branchId` (no uses `getProduct`, que trae movimientos). Costo = el escrito o el del producto; margen = el escrito, o el objetivo del perfil, o 30 sin perfil. `ProductQuote = { productLabel: string | null; costClp: number; marginPct: number; priceNetClp: number; priceGrossClp: number; currentPriceClp: number | null; currentMarginPct: number | null; table: PriceRow[] }`.
- **`src/components/taller/costing/`** (nuevos; reciben props ya formateadas y nunca importan `src/server/**`; estilos en `<style is:global>` bajo `.taller .costing-…`, solo variables existentes):
  - `MonthlyCostsForm.astro` — props `{ action: string; values: Record<string, string>; errors: Record<string, string>; hints: Record<string, string>; summary: { monthly: string; hourly: string | null } }`. Campos con estas etiquetas exactas: **Arriendo**, **Servicios básicos**, **Sueldos** (ayuda: "Incluye lo que quieres pagarte."), **Impuestos y patentes**, **Insumos del taller** (ayuda: "Trapos, aseo y lo que se usa en todo el taller."), **Otros gastos**, **Horas facturables al mes** (ayuda: "Horas que realmente cobras, sumando a todos los mecánicos."), **Margen objetivo (%)**. Cada sugerencia va como ayuda del campo ("Octubre: $250.000") con `aria-describedby`. `<dl class="data" aria-label="Resumen del mes">` con **Gasto mensual** y **Costo por hora** ("—" y la ayuda "Escribe las horas facturables para calcularlo." cuando no hay horas). Botones: `.btn` **Guardar gastos** (`name="action" value="save"`) y `.btn.ghost` **Usar gastos del mes anterior** (`value="suggest"`).
  - `ServiceCostForm.astro` — props `{ action: string; services: { id: string; name: string }[]; bikeTypes: { value: string; label: string }[]; values; errors; result?: CostResult props }`. Controles: select **Servicio del catálogo** (primera opción "Otro servicio" con valor vacío), select **Tipo de bici** (`BIKE_TYPE_LABELS`), **Minutos**, **Insumos del servicio**, y en un `fieldset` con `legend` "Prorratear un envase (opcional)": **Costo del envase** y **Trabajos que alcanza**; **Margen del servicio (%)**. Botón `.btn` **Calcular servicio** (`value="service"`).
  - `ProductPriceForm.astro` — props `{ action: string; products: { id: string; label: string }[]; values; errors; result? }`. Select **Producto del inventario** (etiqueta `SKU · nombre`, sin costo; primera opción "Escribir el costo a mano" con valor vacío), **Costo neto**, **Margen del producto (%)**. Botón `.btn` **Calcular producto** (`value="product"`).
  - `CostResult.astro` — props `{ label: string; rows: { term: string; value: string }[]; table: { caption: string; rows: { margin: string; net: string; gross: string }[] }; note?: string }`. Renderiza `<dl class="data" aria-label={label}>` y una `table.dense` con columnas Margen / Neto / Con IVA (`tabular-nums`). Términos del servicio: **Costo por hora**, **Mano de obra**, **Insumos**, **Costo del servicio**, **Precio neto sugerido**, **Precio con IVA**, **Precio de catálogo**, **Margen actual**. Del producto: **Costo**, **Precio neto sugerido**, **Precio con IVA**, **Precio actual**, **Margen actual**. Montos con `formatClp`; márgenes como `74%`; `null` como "—".
- **`src/pages/taller/calculadora.astro`** (nuevo, < 400 líneas): `getDb()` → `now` → `requireAdmin` (303 a `loginRedirect`) → `can(user.role, "costs.view")` o `forbiddenResponse()` → `cache-control: no-store` → 405 si no es GET ni POST. En POST, `isAllowedOrigin` antes de leer el cuerpo, y `z.enum(["save", "suggest", "service", "product"])` sobre `action`:
  - `save` → `saveCostProfile`; `ok` → 303 a `/taller/calculadora?hecho=gastos`; `forbidden` → 403; `validation_error` → 422 con "Escribe un número entero en pesos." en cada campo (u horas 0 a 744, margen 0 a 90) y los valores enviados.
  - `suggest` → no escribe; rellena el formulario del mes con `suggestedMonthlyCosts`; 200.
  - `service` → `serviceQuote`; `hours_missing` → 422 "Guarda primero las horas facturables del mes."; `not_found` → 404 "No se encontró ese servicio en tu taller."; `validation_error` → 422 por campo.
  - `product` → `productQuote`, igual (`not_found`: "No se encontró ese producto en tu taller.").
  - GET (y el render después de un POST): `getCostProfile`, `suggestedMonthlyCosts`, `listCatalog` (solo activos) y `listProducts` (solo activos). `hecho=gastos` → `<p role="status">Gastos mensuales guardados.</p>`; errores con `role="alert"`.
  - Marcado: `TallerLayout` con `title={`Calculadora de costos — ${PLATFORM.name}`}` y `path="/taller/calculadora"`; `PageHeader title="Calculadora de costos" subtitle="Gastos del mes, costo por hora y precio con margen."`; tres `Card`: "Gastos del mes", "Costo de un servicio", "Precio de un producto", cada una con su propio `<form method="post">`. Al final, un párrafo: "Cifras aproximadas: no incluyen comisiones de cobro, descuentos ni gastos que no escribiste. Los repuestos se cobran aparte en cada orden. Precio sugerido; redondéalo al fijar el precio de lista."
- **`src/layouts/TallerLayout.astro`**: en "Gestión", `{ label: "Calculadora", href: "/taller/calculadora", action: "costs.view" }` después de Indicadores.

## No cambiar

- `src/server/taller/rules.ts`, `src/server/db/schema-orders.ts` y todo lo de FX-04; ningún otro esquema ni CHECK.
- Pantallas y módulos de inventario, catálogo, gastos e indicadores (salvo el `export` de `expenseTotals`); firmas exportadas existentes.
- Precios guardados: nada en este encargo escribe `products.price_clp` ni `service_prices`.
- Ninguna isla ni `<script>` nuevo; ningún hex nuevo; `global.css` no se toca.
- Regla 14: ningún nombre, monto ni dato de un taller en `src/` (las ayudas no llevan montos de ejemplo).
- Regla 17: recepción y mecánico reciben 403 en la página y `forbidden`/`null` en cada función; nunca un costo.
- Pruebas existentes: solo el cambio autorizado en `llave15-layouts.test.ts`. `e2e/fixtures.ts` y `e2e/global-setup.ts` no cambian.
- `drizzle/` a mano; `.env.example`; secretos.

## Pruebas (primero, verlas fallar)

- **`tests/unit/costing-rules.test.ts`** (nuevo, estilo `tests/unit/order-status-rules.test.ts`, `it.each`): cada ejemplo de la tabla de reglas; `priceForMargin(1000, 100)` lanza `RangeError`; `priceTable(1500)` devuelve las cuatro filas en orden; ida y vuelta `marginOfPrice(c, priceForMargin(c, m).netClp) === m` para `c` en {1.500, 9.000, 12.345} y `m` en {20, 30, 40, 50}.
- **`tests/integration/costing.test.ts`** (nuevo, PGlite como `expenses.test.ts`, usuarios de los cuatro roles, `NOW = 2026-11-14T15:00:00Z`):
  - `getCostProfile` del dueño sin fila → montos 0, horas 0, margen 30, `saved: false`; del mecánico → `null`.
  - `saveCostProfile` del dueño con `{ rentClp: "250.000", utilitiesClp: "50000", wagesClp: "0", taxesClp: 20000, otherClp: 30000, suppliesClp: 50000, billableHoursMonth: "100", targetMarginPct: 30 }` → `ok`; una fila con `updatedBy` del dueño y una auditoría `costing.profile_saved`; un segundo guardado con `rentClp: 300000` y otra hora → sigue una fila, `updatedAt` nuevo. Administración → `ok`. Recepción y mecánico → `forbidden` sin filas nuevas.
  - Validación → `validation_error` con el campo: `targetMarginPct: 95`, `billableHoursMonth: -1`, `billableHoursMonth: 745`, `rentClp: "abc"`, `rentClp: "1.5"`.
  - `suggestedMonthlyCosts`: gastos de octubre arriendo 250.000, servicios 45.000, sueldos 600.000, insumos 20.000, repuestos 80.000, otros 5.000; además arriendo 999.000 el 2026-11-01, arriendo 1.000 el 2026-09-30 y un arriendo de 100.000 en octubre anulado → rango 2026-10-01..2026-10-31, valores 250.000 / 45.000 / 600.000 / 0 / 20.000 / 5.000, total 920.000, `hasExpenses: true`. Con `now = 2026-12-01T03:30:00Z` → rango de noviembre. Mecánico → `null`.
  - `serviceQuote` (perfil 400.000 y 100 h; servicio "Mantención general" de 90 minutos con MTB a 35.000): `{ serviceId, bikeType: "mtb", suppliesClp: "3000" }` → minutos 90, costo hora 4.000, mano de obra 6.000, costo 9.000, margen 30, neto 12.858, con IVA 15.301, precio de catálogo 35.000, margen actual 74, cuatro filas, `values.minutes === "90"`. Con `minutes: "60", marginPct: "40"` → costo 7.000, neto 11.667, con IVA 13.884. Con `packCostClp: "50000", packJobs: "60"` y sin `suppliesClp` → insumos 834. Sin perfil → `hours_missing`. uuid inexistente → `not_found`. Sin servicio ni minutos → `validation_error`. Recepción y mecánico → `forbidden`.
  - `productQuote` (producto con costo 1.500 y precio 2.500, sin perfil): `{ productId }` → costo 1.500, margen 30, neto 2.143, con IVA 2.550, precio actual 2.500, margen actual 40. `{ productId, costClp: "2000" }` → neto 2.858, con IVA 3.401. `{ costClp: "1500" }` sin producto → neto 2.143. Recepción y mecánico → `forbidden`.
- **`tests/integration/costing-isolation.test.ts`** (nuevo, `seedTwoShops`): el dueño de un taller guarda su perfil y el del otro sigue leyendo valores por defecto; al guardar los dos hay dos filas con `branch_id` distinto; los gastos de octubre de un taller no aparecen en la sugerencia del otro (todo en 0, `hasExpenses: false`); `productQuote` y `serviceQuote` con ids del otro taller → `not_found`; guardar de nuevo en uno no cambia la fila del otro.
- **`tests/integration/calculadora-page.test.ts`** (nuevo, AstroContainer como `lineas-un-formulario.test.ts`): mecánico → 403; dueño → 200 con las etiquetas "Arriendo", "Horas facturables al mes", "Producto del inventario" y los botones "Guardar gastos", "Calcular servicio", "Calcular producto"; POST sin `Origin` válido → 403; POST `action=save` válido → 303 a `/taller/calculadora?hecho=gastos`; POST `action=product` con `costClp=1500` → 200 con `$2.143` y `$2.550`; POST `action=service` sin perfil → 422 con "Guarda primero las horas facturables del mes.".
- **`tests/integration/llave15-layouts.test.ts`**: solo el cambio autorizado.
- **`e2e/calculadora.spec.ts`** (nuevo; tablet, `.tap()`, controles por rol o etiqueta). Dueño: crea en `/taller/inventario/nuevo` el producto `E2E-COSTO-1` "Lubricante E2E" (costo neto 1500, precio neto 2500); entra por el menú a "Calculadora"; escribe Arriendo 250000, Servicios básicos 50000, Impuestos y patentes 20000, Otros gastos 30000, Insumos del taller 50000, Horas facturables al mes 100; toca "Guardar gastos" → estado "Gastos mensuales guardados." y "Costo por hora" $4.000; elige "Mantención general", tipo "MTB", Insumos del servicio 3000 → "Calcular servicio" → Minutos con valor 90, "Costo del servicio" $9.000, "Precio neto sugerido" $12.858, "Precio con IVA" $15.301, "Precio de catálogo" $35.000, "Margen actual" 74%; elige el producto → "Calcular producto" → "Costo" $1.500, "Precio neto sugerido" $2.143, "Precio con IVA" $2.550, "Margen actual" 40%. Mecánico: `page.goto("/taller/calculadora")` → 403. Codex no lo corre; lo corre Claude.

## Documentación

- Decisión BG-D57 en `blueprints/bike-garage/blueprint.md` §20.3.
- `README.md`: sección `### Calculadora de costos` después de `### Indicadores`: quién la usa, la fórmula en tres líneas (gasto del mes ÷ horas = costo por hora; minutos × costo hora + insumos = costo del servicio; precio = costo ÷ (1 − margen)), que la ganancia es sobre el precio de venta y que nunca cambia precios.
- `CLAUDE.md` (fila "Esquema" y fila nueva "Reglas de costeo | `src/server/taller/costing-rules.ts`" en "Dónde vive cada cosa"), `AGENTS.md` (línea 73) y `.claude/rules/database.md` (línea 11 y la lista de arreglos): "catorce" → "quince" archivos, `← schema-costing.ts (cost_profiles, perfil de costos por sucursal, BG-D57)` al final de la cadena y `costingTables` en la lista.
- `.claude/rules/taller-ui.md` línea 11: agregar "calculadora de costos" a las pantallas de escritorio.
- `docs/ventanas/fx-08-calculadora.md` (nuevo): publicar en Replit propaga la tabla `cost_profiles` vacía; no hay datos que migrar ni script que correr; cada taller guarda su perfil desde la página.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0.
2. Claude: `pnpm db:migrate && pnpm db:check` (base dev), `pnpm test isolation`, `pnpm build && pnpm test:tablet e2e/calculadora.spec.ts`, `pnpm format && pnpm gate` → exit 0; capturas 820×1180 y 1280×800 de `/taller/calculadora` con resultados.

## Reporte

Archivo por archivo: qué cambió y por qué; archivo generado en `drizzle/`; pruebas nuevas (una línea cada una) y el único cambio en `llave15-layouts.test.ts`; tamaño en líneas de `costing.ts` y `calculadora.astro`; lo que no pudiste resolver.
