Panel de indicadores, Etapa C: reportes descargables

## Contexto y autorización (Andrés, 27-nov)

C-01 y C-02 dejaron `/taller/indicadores` como panel (decisión BG-D55, PR #2 en `main`). Falta la última pieza de la Etapa C que Andrés pidió (`blueprints/roadmap/dashboard-financiero.md`, "Encabezado: sección de reportes descargables"). Decidió el 27-11-2026:

- **Formato:** CSV para Excel. Sin PDF.
- **Reportes:** tres: *Ingresos y egresos*, *Resumen del período* y *Por mecánico*.
- **Datos de clientes:** ninguno. Ni nombre, teléfono, correo ni RUT del cliente; tampoco texto libre que pueda traerlos (descripción del gasto, notas). Se identifica por número de orden (`OT-00001`) o de venta (`VM-00001`).

Agrega la **decisión BG-D56** en `blueprints/bike-garage/blueprint.md` §20.3, como fila nueva después de BG-D55:

> | BG-D56 | **Reportes descargables del panel** (decisión del dueño, 2026-11-27, rama `feat/reportes-indicadores`, encargo `docs/encargos/C-03-reportes-descargables.md`): `/taller/indicadores/<reporte>.csv?desde&hasta` entrega en CSV para Excel (UTF-8 con BOM, separador `;`, fin de línea CRLF, montos como enteros sin formato) tres reportes del mismo rango del panel: `ingresos-egresos` (cada pago, devolución y gasto vigente, con totales), `resumen` (las cifras del panel con su período anterior y variación) y `mecanicos` (entregas, montos y días de cierre por mecánico). Mismo permiso `dashboard.finance`, filtro por `branch_id` y sin datos personales de clientes ni texto libre; comisión y neto de cada pago solo con `costs.view`. Las celdas de texto que empiezan con `=`, `+`, `-`, `@`, tabulador o retorno se escapan con `'` (inyección de fórmulas). Sin esquema nuevo. | Etapa C del panel; PDF fuera de alcance. |

## Lee antes

`AGENTS.md`; `.claude/rules/server-api.md`; `.claude/rules/taller-domain.md`; `.claude/rules/taller-ui.md`; `.claude/rules/ui-design.md`; `src/server/taller/indicators.ts`, `indicators-finance.ts`, `indicators-dashboard.ts` (para usar las mismas definiciones y límites de día).

## No negociables que tocan este encargo

- Regla 14: ningún dato de un taller en `src/` (ni nombre, ni dominio): el nombre del archivo no lleva el nombre del taller.
- Regla 17: `fee_clp` y `net_clp` solo para roles con `costs.view`; sin el permiso la columna no aparece (prueba de omisión por rol).
- Regla 20: ninguna consulta sin `branch_id`; prueba de dos talleres.
- No editar `drizzle/`, no migrar, no commitear secretos ni `.env`. Este encargo no cambia el esquema.

## Rama y reparto

Rama `feat/reportes-indicadores`, sobre el último commit (árbol limpio). Pruebas primero, en rojo; `pnpm format && pnpm check && pnpm test && pnpm build` en verde; sin commits ni push (Claude corre `pnpm gate`, revisa en el navegador y commitea: `feat: download the indicators reports as CSV`).

## Reglas de negocio decididas

| Tema | Regla |
|---|---|
| Ruta | `GET /taller/indicadores/<reporte>.csv?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`, con `<reporte>` en `ingresos-egresos`, `resumen`, `mecanicos`. Archivo: `src/pages/taller/indicadores/[report].csv.ts` (envoltorio, sin SQL). |
| Acceso | `requireAdmin` → sin sesión, 303 a `loginRedirect(ruta + query)` con `cache-control: no-store`; `can(user.role, "dashboard.finance")` → sin permiso, `forbiddenResponse()` (403). Reporte desconocido → 404 `{ error, code: "not_found" }`. Rango: `indicatorsRangeSchema` con `desde`/`hasta` (por defecto `defaultRange(now)`), inválido → 422 `{ error, code: "validation_error", fields }`. Solo GET. |
| Respuesta | 200, `content-type: text/csv; charset=utf-8`, `content-disposition: attachment; filename="indicadores-<reporte>-<desde>-<hasta>.csv"`, `cache-control: no-store`, `x-content-type-options: nosniff`. Cuerpo: BOM `﻿` + filas separadas por `\r\n`. |
| Formato CSV | Separador `;` (Excel en español). Montos en pesos como entero sin `$` ni puntos (`-5000` para egresos). Fechas `AAAA-MM-DD` y horas `HH:mm` en `America/Santiago` (`TIMEZONE`). Porcentajes y decimales como texto con coma decimal (`12,5`) y la unidad en su columna. Celdas con `;`, `"`, `\r` o `\n` van entre comillas dobles con `"` duplicadas. Celdas de **texto** que empiezan con `=`, `+`, `-`, `@`, `\t` o `\r` llevan un `'` delante; los números nunca. |
| Ingresos y egresos | Cabecera `Fecha;Hora;Tipo;Documento;Medio;Detalle;Monto` (+ `;Comisión;Neto` solo con `costs.view`). Una fila por: **pago** vigente del rango (`payments`, `voided_at` nulo, `received_at` en el rango con los mismos límites de día que `financeIndicators`): Tipo `Ingreso`, Documento `OT-…` o `VM-…`, Medio con `PAYMENT_METHOD_LABELS`, Detalle `Abono` o `Pago final`, Monto positivo; **devolución** (`cash_movements` `egreso` con `reference_kind` `sale_refund`/`order_refund`, vigente, `created_at` en el rango): Tipo `Devolución`, Documento de la orden o venta referida si se resuelve (si no, vacío), Medio `Efectivo`, Monto negativo; **gasto** vigente (`expenses`, `expense_date` en el rango): Tipo `Egreso`, Hora vacía, Documento `<tipo> <número>` si existe, Medio con las etiquetas de método de gasto (si `rules.ts` no tiene `EXPENSE_METHOD_LABELS`, agrégalo ahí: Efectivo, Transferencia, Tarjeta, Otro), Detalle con `EXPENSE_CATEGORY_LABELS`, Monto negativo. **Nunca** la descripción del gasto, el proveedor ni el nombre de quien recibió. Orden por fecha y hora. Al final, una fila vacía y cuatro filas de totales: `Total ingresos` (= `financeIndicators(...).income.grossClp`), `Total devoluciones`, `Total egresos` (= `expenses.totalClp`, negativo) y `Movimiento neto` (suma de las tres). |
| Resumen | Cabecera `Sección;Indicador;Valor;Unidad;Período anterior;Variación (%)`. Primeras filas: `Período;Desde;<desde>` y `Período;Hasta;<hasta>`. Luego, con las mismas cifras que muestra el panel (de `workshopIndicators`, `financeIndicators` y `dashboardIndicators`, sin recalcular): Visión general (Ingresos, Ticket promedio y Balance neto con período anterior y variación; sin base, `Período anterior` 0 y `Variación` vacía; Trabajos abiertos, Días promedio para cerrar, Trabajos por día activo, Monto por revisar y su cantidad), Lectura financiera (Gastos, % retenido, Gastos / ingresos, mix Servicios / Repuestos / Ventas de mostrador, ingresos por medio de pago, gastos por categoría), Clientes (atendidos, nuevos, recurrentes, nuevos que volvieron), Reservas y adicionales (recibidas, pendientes, convertidas, conversión; adicionales creados, aprobados, rechazados, valor aceptado, conversión), Control (cobertura de checklist, control de calidad, informes; inventario activos, bajo mínimo, sin stock; calidad de pago). Unidades: `CLP`, `%`, `órdenes`, `días`, `clientes`, `reservas`, `productos`. Valor de inventario y margen de repuestos solo con `costs.view`. |
| Por mecánico | Cabecera `Mecánico;Órdenes entregadas;Monto entregado;Monto de servicios;Días promedio de cierre;Órdenes abiertas hoy`. Una fila por usuario del taller con órdenes entregadas en el rango (misma definición de entrega que `workshopIndicators.delivered`) u órdenes abiertas asignadas hoy (estado no terminal según `rules.ts`); nombre del usuario (`users.name`: es personal del taller, no cliente). Monto entregado = suma de `total_clp`; Monto de servicios = suma de `quantity * unit_price_clp` de las líneas `servicio` vigentes de esas órdenes; Días promedio = `delivered_at − received_at` redondeado (vacío sin datos). Una fila `Sin asignar` para órdenes sin `assigned_mechanic_id`. Orden por Monto entregado descendente. Órdenes anuladas fuera. |
| Pantalla | Tarjeta "Descargar reportes" en `indicadores.astro`, junto a la tarjeta "Rango de fechas": tres enlaces `a.btn.ghost` con `download` ("Ingresos y egresos (CSV)", "Resumen del período (CSV)", "Por mecánico (CSV)") que llevan el rango que el panel está mostrando, y un texto `muted`: "Archivos CSV para Excel, sin datos personales de clientes." Objetivos ≥ 48px. Componente nuevo `src/components/taller/indicators/ReportDownloads.astro` (props: `links: { label: string; href: string }[]`), sin `<script>`. `indicadores.astro` debe quedar < 400 líneas. |

## Qué hacer

**`src/lib/csv.ts` (nuevo, < 80 líneas, sin importar `src/server/**`).** `export type CsvCell = string | number | null`; `export function toCsv(rows: readonly (readonly CsvCell[])[]): string` (BOM + filas con `\r\n`, reglas de formato de la tabla; `null` → celda vacía; números enteros con `String(n)`; los decimales los entrega el servidor ya como cadena con coma).

**`src/server/taller/indicators-export.ts` (nuevo, < 400 líneas; si no cabe, separa en `indicators-export-ledger.ts` para ingresos y egresos).** `export const REPORT_KINDS = ["ingresos-egresos", "resumen", "mecanicos"] as const`; `export type ReportKind`; `export async function exportIndicatorsReport(db: AppDb, actor: SessionUser, kind: ReportKind, range: Range, now: Date): Promise<{ ok: true; filename: string; rows: CsvCell[][] } | { ok: false; code: "forbidden" }>`. Sin `dashboard.finance` → `forbidden` sin consultar. Reutiliza `workshopIndicators`, `financeIndicators` y `dashboardIndicators` para el resumen y los totales; consultas propias solo para las filas del libro y la tabla por mecánico, siempre con el `branch_id` del actor. Funciones < 50 líneas; `now` por parámetro.

**`src/pages/taller/indicadores/[report].csv.ts` (nuevo).** `export const prerender = false; export const GET: APIRoute` → sesión → permiso → `REPORT_KINDS` → zod del rango → `exportIndicatorsReport` → `new Response(toCsv(rows), { headers })`. Nada de SQL.

**`src/components/taller/indicators/ReportDownloads.astro` (nuevo)** y su uso en **`src/pages/taller/indicadores.astro`** (solo agregar la tarjeta y armar los `href` con `encodeURIComponent` del rango vigente).

## No cambiar

- `indicators.ts`, `indicators-finance.ts`, `indicators-customers.ts`, `indicators-dashboard.ts`, `indicators-series.ts`, `indicators-funnels.ts`, `indicators-view.ts`, `permissions.ts`, `profile.ts`; en `rules.ts` solo se permite agregar `EXPENSE_METHOD_LABELS` si falta.
- Los componentes existentes de `src/components/taller/indicators/`, `TallerLayout.astro`, los CSS globales.
- El esquema y `drizzle/`; `e2e/global-setup.ts`, `e2e/fixtures.ts`, `playwright.config.ts`.
- Ninguna prueba existente. Si una falla, detente y reporta con el diff.
- Siembra órdenes solo con estados nuevos (`creado`, `en_progreso`, `en_pausa`, `diagnostico`, `esperando_aprobacion`, `esperando_repuesto`, `lista_para_retirar`, `pagado`, `entregada`, `cancelada`); nunca los heredados.

## Pruebas (primero, verlas fallar)

**`tests/unit/csv.test.ts`:** BOM al inicio; `;` y `\r\n`; celda con `;`, `"` o salto de línea entre comillas y `"` duplicada; `=SUMA(A1)`, `+5`, `-x`, `@a` como texto → con `'` delante; `-5000` como número → sin `'`; `null` → vacío.

**`tests/integration/indicators-export.test.ts`** (PGlite, patrón de `indicators-dashboard.test.ts`):
- Recepción y mecánico → `{ ok: false, code: "forbidden" }`.
- Ingresos y egresos: un abono y un pago final de una orden, un pago de una venta, un pago anulado (no aparece), un pago fuera del rango (no aparece), una devolución y dos gastos (uno anulado) → filas esperadas en orden, montos con signo, Documento `OT-00001`/`VM-00001`; `Total ingresos` igual a `financeIndicators(...).income.grossClp`; ninguna celda contiene el nombre, teléfono, correo ni RUT del cliente sembrado ni la descripción del gasto; con dueño están `Comisión` y `Neto`.
- Resumen: Ingresos con período anterior y `Variación (%)` = `100` cuando el anterior es la mitad; sin base, variación vacía; las cifras coinciden con `dashboardIndicators`.
- Por mecánico: dos mecánicos y una orden sin asignar → tres filas, orden por monto, días promedio redondeados, `Órdenes abiertas hoy` cuenta solo estados no terminales; una orden anulada no cuenta.

**`tests/integration/indicators-export-isolation.test.ts`** (`seedTwoShops`): los tres reportes del taller A no traen pagos, gastos, órdenes ni mecánicos del taller B.

**`tests/integration/indicadores-export-page.test.ts`** (patrón de `indicadores-panel-page.test.ts`: `loginAdmin`, cookie, mock de `getDb`, `vi.useFakeTimers`; para el endpoint, llama `GET` del módulo con un `APIContext` mínimo o `AstroContainer`): dueño → 200 con `content-type`, `content-disposition` (nombre con el rango), `cache-control: no-store`, `nosniff`, cuerpo con BOM; reporte `otro.csv` → 404; `desde=2026-13-01` → 422 `validation_error`; recepción → 403; sin sesión → 303 a `/admin/login?next=…`. La página `/taller/indicadores` muestra "Descargar reportes" con los tres enlaces y el rango en el `href`.

Ninguna prueba existente se modifica.

## Documentación

- Decisión BG-D56 (texto arriba).
- `README.md`, sección "Indicadores": párrafo nuevo con los tres reportes CSV, su ruta, que no llevan datos personales de clientes y que comisión y neto solo salen con `costs.view`.
- `blueprints/roadmap/dashboard-financiero.md`, "Etapas propuestas": la Etapa C pasa a "reportes descargables en CSV hechos (`feat/reportes-indicadores`, BG-D56); metas pendientes; PDF fuera de alcance". En "Preguntas abiertas", la 4 queda respondida: "CSV para Excel (27-11-2026)".
- `docs/encargos/README.md`, tabla "Etapa C": fila `C-03 | [Panel: reportes descargables](C-03-reportes-descargables.md) | BG-D56 | — | c-03`.

## Verificación

1. Codex: `pnpm test tests/unit/csv.test.ts tests/integration/indicators-export.test.ts tests/integration/indicators-export-isolation.test.ts tests/integration/indicadores-export-page.test.ts tests/integration/indicadores-panel-page.test.ts tests/integration/indicadores-page.test.ts tests/integration/indicadores-finance-page.test.ts` → 0 failed; `pnpm check` y `pnpm build` en verde.
2. Biome ignora toda ruta bajo `.claude/` (`biome.json`, `!!**/.claude`) y este worktree vive ahí: para `pnpm format` y `biome ci`, usa una copia fuera de `.claude` y aplica de vuelta solo los cambios de formato de tus archivos. Si la suite completa falla en tu sandbox por PGlite o por falta de red, repórtalo; Claude la corre afuera.
3. Claude: `pnpm gate` → exit 0; descarga de los tres CSV como dueño en el build local y apertura revisada.

## Reporte

Archivos creados y modificados con sus líneas finales (`indicadores.astro` < 400), la cola de `pnpm check`, `pnpm test` y `pnpm build`, las primeras 6 líneas de cada CSV tal como las genera la prueba, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
