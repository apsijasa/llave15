Panel de indicadores, Etapa C: la pantalla

## Contexto y autorización (Andrés, 26-nov)

C-01 dejó `dashboardIndicators` en `src/server/taller/indicators-dashboard.ts` (decisión BG-D55). `src/pages/taller/indicadores.astro` sigue mostrando solo tablas. Andrés quiere que la pantalla sea el panel de `blueprints/roadmap/dashboard-financiero.md`: cinco secciones con cifras comparadas contra el período anterior y gráficos dibujados en el servidor, con la identidad Llave 15 (`.claude/rules/ui-design.md`), y al pie el detalle en tablas que ya existe, sin cambiar ninguna prueba existente.

Amplía la **decisión BG-D55** en `blueprints/bike-garage/blueprint.md` §20.3 agregando al final de su primera columna:

> La pantalla (encargo C-02) dibuja los gráficos como SVG en el servidor, sin JavaScript ni islas, con tokens y texto en cada marca (nunca solo color): línea sólida en `--ink` para ingresos y punteada en `--accent` para gastos; segmentos de anillo sólido, rayado y claro; barras con su valor escrito. Cada gráfico lleva `<figure>` con `<figcaption>` y una tabla equivalente para lectores de pantalla. Las tablas de las Etapas A y B quedan al pie como "Detalle del período".

## Lee antes

`AGENTS.md`; `.claude/rules/taller-ui.md`; `.claude/rules/ui-design.md`; `.claude/rules/server-api.md`; `.claude/rules/e2e.md`.

## Rama y reparto

Rama `feat/panel-indicadores`, sobre el último commit (árbol limpio). Pruebas primero, en rojo; `pnpm format && pnpm check && pnpm test && pnpm build` en verde; sin commits ni push (Claude corre `pnpm gate`, toma capturas y commitea: `feat: redraw the indicators page as a dashboard`). Escribe primero y verifica una vez al final. El sandbox no tiene red: no corras `pnpm db:*`, `pnpm test:tablet`, `pnpm smoke` ni `pnpm gate`.

## Reglas de negocio decididas

| Tema | Regla |
|---|---|
| Acceso y rango | Sin cambios: `requireAdmin` → `can(user.role, "dashboard.finance")` → zod sobre `desde`/`hasta` → 422 con el aviso y el rango por defecto; 405 fuera de GET; `cache-control: no-store`; atajos Hoy / Esta semana / Este mes / Mes anterior con `aria-current`. Un solo `h1` ("Indicadores"). |
| Datos | La página llama en paralelo `workshopIndicators`, `financeIndicators` y `dashboardIndicators` (los tres con `db, user, range, now`); si alguno devuelve `null`, `forbiddenResponse()`. Nada de SQL ni cálculo de negocio en la página: `dashboardView` arma todo. |
| Encabezado | `PageHeader` con título "Indicadores" y bajada `<nombre del taller> · <rango>`: el nombre sale de `profileForBranch(db, user.branchId)` (`src/server/shops/profile.ts`, como `src/pages/taller/index.astro`; sin perfil, solo el rango); el rango como `1 nov – 26 nov 2026` (`Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short" })` y el año una vez). Nunca un nombre de taller literal. |
| Secciones | Cinco, en este orden, cada una con `SectionHeader` (sobretítulo, `h2`, bajada): **Visión general** / "El taller en una mirada" / "Las cuatro señales principales para entender el período." · **Lectura financiera** / "Cómo se movió el dinero" / "Evolución, resultado y origen de los ingresos." · **Pulso operativo** / "Qué está moviendo el taller" / "Servicios, días y estados que concentran la carga de trabajo." · **Oportunidades** / "De consultas a clientes" / "Adicionales, agenda y recurrencia de clientes." · **Control y calidad** / "Una operación bajo control" / "Checklist, inventario y registro de pagos." Después, `h2` "Detalle del período" con las tablas actuales. |
| Visión general | Cuatro `KpiTile` principales: Ingresos (`headline.income`), Ticket promedio (`headline.averageTicket`), Trabajos abiertos (`openOrders.count`, detalle "N días promedio para cerrar"), Balance neto (`headline.netBalance`). Cuatro secundarios: Ritmo del taller ("1,5 trabajos por día activo", coma decimal), Top 3 servicios por ingreso (lista `description · $monto` de `topServices.byAmount.slice(0, 3)`; "Sin servicios en el período" si está vacío), Clientes recurrentes (`returningCount / served` en %, detalle "N de M atendidos"), Monto por revisar (`rhythm.amountToReview.totalClp`, detalle "N órdenes abiertas con saldo"). |
| Delta | Texto `▲ +12%` / `▼ −5%` / `= 0%` seguido de "vs. período anterior"; `direction` `up` usa `--status-ready-ink`, `down` `--status-blocking-ink`, `flat` `--ink-2`; sin base (`deltaPct === null`), `direction: "none"` y el texto "Sin período anterior comparable". El glifo y la palabra siempre están: nunca solo color. |
| Lectura financiera | `LineChart` "Evolución diaria" con `daily.days` (ingresos `--ink` sólida 2px, gastos `--accent` `stroke-dasharray="4 3"`), leyenda en texto con los totales, eje con el primer y el último día (`1 nov`, `26 nov`), y tres cifras arriba: Promedio diario, Mejor día (`14 nov · $11.900`, o "Sin ingresos"), Días con movimiento. `Donut` "Resultado del período": porcentaje retenido al centro (`balanceClp × 100 / netClp`, 0 si `netClp ≤ 0`, entero) con segmentos Balance (sólido), Devoluciones (rayado) y Gastos (claro) sobre `netClp`; leyenda Ingresos netos, Devoluciones, Gastos, Balance, "Gastos / ingresos NN%". `Donut` "Mix de ingresos" con Servicios, Repuestos y Ventas de mostrador (`finance.mix`), total al centro, leyenda con monto y %. |
| Pulso operativo | "Servicios más comunes" (`Funnel` horizontal con las 6 de `topServices.byQuantity`: descripción, cantidad; vacío → "No hay servicios en este período"). "Trabajos por día" (`BarChart` con `weekday`, etiquetas Lun…Dom). "Trabajos por estado" (`Funnel` con `openNow`: etiqueta como `<span class="status status--<estado>">`, conteo; título con "N abiertos"). "Antigüedad de abiertos" (`BarChart` con `ages`, etiquetas 0–3, 4–7, 8–14, 15+ días). |
| Oportunidades | "Adicionales" (`Funnel`: Creados, Pendientes, Aprobados, Rechazados; pie "Valor aceptado $X" y sobretítulo "NN% conversión"). "Agendamiento" (`Funnel`: Recibidas, Pendientes (`bookingsPending`), Convertidas, Canceladas, No asistió; sobretítulo "NN% conversión" de `bookings.conversionPct`). "Clientes" (cuatro cifras: Atendidos, Nuevos, Recurrentes, Nuevos que volvieron; `Donut` chico con % recurrentes). |
| Control y calidad | "Checklist y calidad": tres porcentajes (Checklist de ingreso, Control de calidad, Informes compartidos) con `Donut` de cobertura del checklist al centro y "sobre N órdenes recibidas". "Inventario": Activos, Bajo mínimo, Sin stock (con `status--bajo` / `status--sin-stock` como en `src/pages/taller/inventario/index.astro`) y "Valor a costo" solo si `finance.inventory.valueAtCostClp` existe. "Registro de pago": `Donut` con `completePct` al centro, "Sin pago registrado N", "Monto por revisar $X". |
| Detalle del período | Debajo de "Detalle del período", **exactamente el marcado actual** de `indicadores.astro`: la fila `.kpis` de siete cifras (Ingresos, Pagos, Entregas, Ticket promedio, Órdenes creadas, Clientes atendidos, Conversión de reservas), "Por medio de pago" (`<caption>Ingresos por medio de pago</caption>`), "Pagos del período", "Órdenes por estado", "Abiertas hoy", "Servicios más pedidos", "Reservas", "Cobertura" y `FinanceBlocks` (Egresos del período, Balance, Mix de ingresos, POS por proveedor, Inventario). Los `h2`, `caption`, `th scope="row"` y `td class="mono"` no cambian: `tests/integration/indicadores-page.test.ts`, `indicadores-finance-page.test.ts` y `e2e/indicadores.spec.ts` los afirman. |
| Gráficos | SVG inline del servidor con `viewBox`, `width="100%"`, `role="img"` y `aria-label` con el título; colores solo con `var(--ink)`, `var(--ink-2)`, `var(--steel)`, `var(--rule)`, `var(--hatch)`, `var(--accent)`, `var(--surface)`; sin hex, sin degradados, sin sombras, sin `<script>`; texto en `font-family: var(--body)` 12px, `tabular-nums`. Cada gráfico va en `<figure class="chart">` con `<figcaption>` (el título) y, después del SVG, una `<table class="dense chart-data">` con los mismos datos, oculta visualmente con `.chart-data { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }` (defínela una vez en `SectionHeader.astro` o en la página). Las barras escriben su valor encima; los anillos usan tres rellenos: sólido `--ink`, rayado (`<pattern>` de líneas `--ink-2` a 45° sobre `--surface`) y claro (`--hatch` con borde `--steel`). |
| Grilla y forma | `.panel-kpis` con 4 columnas desde 1024px y 2 en tablet; `.panel-grid` de tarjetas con `repeat(auto-fit, minmax(300px, 1fr))`; tarjetas `Card` (`var(--radius-card)`, regla de 1px); espaciado múltiplo de 4px; objetivos táctiles ≥ 48px en los atajos y el botón Aplicar (ya cumplen). Sin `!important`, sin `:hover` que esconda información. A 820×1180 nada desborda horizontalmente. |
| Vista | `dashboardView` entrega solo cadenas y números ya formateados (`formatClp`, porcentajes con `%`, decimales con coma); los componentes de `src/components/taller/indicators/` no importan `src/server/**` ni `src/lib/**`. |

## Qué hacer

**`src/server/taller/indicators-view.ts` (nuevo, < 300 líneas).** `export type DeltaView = { text: string; direction: "up" | "down" | "flat" | "none"; caption: string }`, `export type DashboardView = { … }` (un objeto por sección con las cadenas que listan las reglas: `overview`, `finance`, `pulse`, `opportunities`, `control`, más `rangeLabel`) y `export function dashboardView(indicators: Indicators, finance: FinanceIndicators, dashboard: DashboardIndicators): DashboardView`. Puro: sin `db`, sin `Date` nuevo. `formatClp` de `src/server/email/templates.ts`; `STATUS_LABELS` ya vienen en `openNow`. Funciones < 50 líneas: una por sección y helpers `deltaView`, `pct`, `oneDecimal`.

**`src/components/taller/indicators/` (nuevos, cada uno < 200 líneas, estilos en su `<style is:global>` bajo `.taller`):**
- `SectionHeader.astro` — props `{ eyebrow: string; title: string; subtitle: string; id: string }` → `<div class="panel-section-head"><p class="label">eyebrow</p><h2 id>title</h2><p class="muted">subtitle</p></div>`.
- `KpiTile.astro` — props `{ label: string; value: string; delta?: DeltaView; detail?: string; lines?: string[] }` (las `lines` son la lista del top 3) → `Card` con `label`, valor grande `tabular-nums`, delta y detalle.
- `LineChart.astro` — props `{ title: string; points: { label: string; income: number; expenses: number }[]; incomeLabel: string; expensesLabel: string; firstLabel: string; lastLabel: string; formatted: { label: string; income: string; expenses: string }[] }`; dibuja dos polilíneas normalizadas al máximo, eje base, dos etiquetas de fecha, leyenda y la tabla oculta con `formatted`.
- `BarChart.astro` — props `{ title: string; bars: { label: string; value: number; text: string }[] }`; barras verticales `--ink`, valor en texto sobre cada barra, etiqueta abajo.
- `Donut.astro` — props `{ title: string; center: string; centerCaption?: string; segments: { label: string; value: number; text: string }[]; footer?: { label: string; value: string }[] }`; anillo con `stroke-dasharray` sobre un círculo por segmento (sólido / rayado / claro en ese orden), centro con texto, leyenda con marca, etiqueta y `text`.
- `Funnel.astro` — props `{ title: string; eyebrow?: string; rows: { label: string; value: number; text: string; status?: string }[]; footer?: string; empty?: string }`; barras horizontales proporcionales al máximo con etiqueta (o `span.status` si viene `status`) y valor.
- `DetailTables.astro` — el marcado actual de las tablas, con props ya formateadas desde la página: `{ kpis, byMethod, payments, statusTables, serviceTables, summaryTables, financeSections }`; usa `FinanceBlocks.astro` para `financeSections`.

**`src/pages/taller/indicadores.astro` (reescrita, < 400 líneas).** Sesión → permiso → zod → datos (`Promise.all` de los tres módulos y `profileForBranch`) → `dashboardView` → marcado: `PageHeader`, tarjeta "Rango de fechas" (sin cambios), las cinco secciones con sus componentes dentro de `.panel-grid`, `h2` "Detalle del período" y `DetailTables`. La página mantiene los estilos de `.indicators-range`, `.indicators-shortcuts`, `.kpis` y `.kpi-value` que hoy tiene y agrega `.panel-section-head`, `.panel-kpis`, `.panel-grid`, `.chart`, `.chart-data`, `.delta`, `.delta--up`, `.delta--down`, `.delta--flat`.

## No cambiar

- `indicators.ts`, `indicators-finance.ts`, `indicators-customers.ts`, `indicators-dashboard.ts`, `indicators-series.ts`, `indicators-funnels.ts`, `dashboard.ts`, `rules.ts`, `permissions.ts`, `profile.ts`.
- `src/layouts/TallerLayout.astro` (el menú ya tiene "Indicadores"), `global.css`, `tokens.css`, `llave15.css`, `taller-layout.css`, `taller-components.css`, `Card.astro`, `PageHeader.astro`, `FinanceBlocks.astro`.
- Ninguna isla: nada de `client:*`, ningún `.tsx` nuevo, ningún `<script>`.
- El esquema y `drizzle/`; `e2e/global-setup.ts`, `e2e/fixtures.ts`, `playwright.config.ts`.
- Ninguna prueba existente (`indicadores-page.test.ts`, `indicadores-finance-page.test.ts`, `llave15-layouts.test.ts`, `e2e/indicadores.spec.ts`). Si una falla, detente y reporta con el diff.
- Fotos por orden: sin tope.

## Pruebas (primero, verlas fallar)

**`tests/unit/indicators-view.test.ts`:** `deltaView` → `{ text: "▲ +19%", direction: "up" }`, `▼ −5%` con `down`, `= 0%` con `flat`, `null` → `direction: "none"` y "Sin período anterior comparable"; `rangeLabel` para `{ from: "2026-11-01", to: "2026-11-26" }` → `1 nov – 26 nov 2026`; ritmo `1.5` → `1,5 trabajos por día activo`; porcentaje retenido con `netClp 0` → `0%`; el mix suma 100% o 0% sin ingresos; `dashboardView` no contiene ninguna clave con `cost`, `fee` ni `net_clp` salvo lo que ya expone `financeIndicators` para el dueño.

**`tests/integration/indicadores-panel-page.test.ts`** (patrón de `indicadores-page.test.ts`: `loginAdmin`, cookie, mock de `getDb`, `vi.useFakeTimers`, `AstroContainer`):
- Dueño GET → 200 con los `h2` "El taller en una mirada", "Cómo se movió el dinero", "Qué está moviendo el taller", "De consultas a clientes", "Una operación bajo control" y "Detalle del período"; al menos 8 `<svg` con `role="img"` y `aria-label`; cada `<figure` lleva `<figcaption>` y una `table` con `chart-data`; el nombre del taller sembrado aparece en la bajada; ningún `<script`.
- Con un pago de $20.000 en el rango y otro de $10.000 en el período anterior → "▲ +100%"; sin pago anterior → "Sin período anterior comparable".
- Las tablas de detalle siguen: `<caption>Ingresos por medio de pago</caption>` y `h2` "Balance".
- Recepción → 403; sin sesión → 303 a `/admin/login?next=%2Ftaller%2Findicadores`.
- Siembra las órdenes abiertas solo con `diagnostico`, `esperando_aprobacion` o `lista_para_retirar` y las cerradas con `entregada` o `cancelada` (una rama paralela retira `reservada`, `recibida`, `en_reparacion`, `control_calidad` y `trabajo_rechazado`); nunca los uses en código ni en pruebas nuevas.

**`e2e/panel-indicadores.spec.ts`** (solo `@playwright/test` y `e2e/fixtures.ts`; `.tap()`): el dueño entra a `/taller/indicadores` y ve el `h1` "Indicadores", el `h2` "El taller en una mirada", la figura con nombre "Evolución diaria" (`getByRole("figure", { name: "Evolución diaria" })`) y el `h2` "Detalle del período"; `document.documentElement.scrollWidth <= window.innerWidth` a 820×1180.

Ninguna prueba existente se modifica.

## Documentación

- Decisión BG-D55 ampliada.
- `README.md`, sección "Indicadores": agregar "Desde la Etapa C la pantalla es un panel: cuatro señales comparadas con el período anterior (ingresos, ticket promedio, trabajos abiertos y balance neto), evolución diaria de ingresos y gastos, mix de ingresos, servicios y estados que concentran la carga, antigüedad de los trabajos abiertos, embudos de adicionales y de agenda, recurrencia de clientes, cobertura de checklist, inventario y calidad del registro de pagos. Las tablas de siempre quedan al pie como detalle."
- `blueprints/roadmap/dashboard-financiero.md`, "Etapas propuestas": Etapa C marcada como parcial: comparativas y gráficos hechos (`feat/panel-indicadores`, BG-D55); metas y reportes descargables pendientes; "cotizaciones" resueltas con los adicionales.
- `docs/encargos/README.md`: tabla "Etapa C (noviembre 2026)" con C-01 y C-02 (decisión BG-D55, sin esquema, tag `c-01`/`c-02`).

## Verificación

1. Codex: `pnpm test tests/unit/indicators-view.test.ts tests/integration/indicadores-panel-page.test.ts tests/integration/indicadores-page.test.ts tests/integration/indicadores-finance-page.test.ts tests/integration/llave15-layouts.test.ts tests/integration/indicators-dashboard.test.ts` → 0 failed; `pnpm exec astro check && pnpm exec tsc --noEmit && pnpm build` → exit 0.
2. Biome ignora toda ruta bajo `.claude/` (`biome.json`, `!!**/.claude`) y este worktree vive ahí: para `pnpm format` y `biome ci`, usa una copia fuera de `.claude` como en C-01 y aplica de vuelta solo los cambios de formato de tus archivos. En C-01 la suite completa falló en tu sandbox por PGlite (`pglite.data`) y `chai`, ajenos al código: si vuelve a pasar, repórtalo y no lo cuentes como fallo; Claude corre la suite completa fuera del sandbox.
3. Claude: `pnpm gate` → exit 0; capturas a 1280×800 y 820×1180 como dueño.

## Reporte

Archivos creados y modificados con sus líneas finales (`indicadores.astro` debe quedar < 400), la cola de `pnpm check`, `pnpm test` y `pnpm build`, el HTML de un `KpiTile` con delta y de un `Donut` tal como los genera la prueba, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
