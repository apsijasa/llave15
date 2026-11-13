Pantalla /taller/indicadores

## Contexto y autorización (Andrés, 12-nov)

A-07 dejó `workshopIndicators` en `src/server/taller/indicators.ts` (decisión 54). Falta la pantalla de escritorio para el dueño y la administración, con el rango Desde/Hasta y los bloques del módulo, en el menú "Gestión" de `src/layouts/TallerLayout.astro`.

Amplía la **decisión 54** en `blueprints/vector-taller-f1/blueprint.md` §20.3 agregando al final:

> La pantalla `/taller/indicadores` (encargo A-08) toma el rango por `GET ?desde=&hasta=` validado con zod; sin parámetros, el mes en curso; atajos Hoy / Esta semana / Este mes / Mes anterior como enlaces. Un rango inválido responde 422 con el aviso y los valores por defecto. Es una pantalla de escritorio: se comprueba que no se rompe en tablet, pero no se diseña para ella.

## Lee antes

`AGENTS.md`; `.claude/rules/taller-ui.md`; `.claude/rules/server-api.md`; `.claude/rules/e2e.md`.

## Rama y reparto

Rama `feat/etapa-a`, sobre el último commit. Pruebas primero; `pnpm format && pnpm check && pnpm test && pnpm build` en verde; sin commits ni push (Claude corre `pnpm gate` y commitea). Commits que hará Claude: `feat: add the workshop indicators page` y `docs: record the indicators page in decision 54`.

## Reglas de negocio decididas

| Tema | Regla |
|---|---|
| Acceso | `requireAdmin` → `can(user.role, "dashboard.finance")` (403 para recepción y mecánico) → zod sobre `desde`/`hasta` → `workshopIndicators`. `cache-control: no-store`. Solo GET. |
| Rango | `desde`/`hasta` en `yyyy-MM-dd`; ausentes → `defaultRange(now)`; inválidos → 422, `<p role="alert">El rango no es válido: usa fechas yyyy-mm-dd, Desde anterior o igual a Hasta y hasta un año.</p>` y la pantalla con el rango por defecto. |
| Atajos | Enlaces `?desde=…&hasta=…` calculados en el servidor con luxon en `TIMEZONE`: Hoy, Esta semana (lunes a hoy), Este mes, Mes anterior. El activo lleva `aria-current="page"`. |
| Formulario | `<form method="get">` con dos `<input type="date">` etiquetados "Desde" y "Hasta" y un botón "Aplicar". |
| Bloques | Cifras: Ingresos, Pagos, Entregas, Ticket promedio, Órdenes creadas, Clientes atendidos (nuevos / recurrentes), Conversión de reservas. Tablas: Ingresos por medio de pago; Pagos del período (máx. 200); Órdenes por estado (creadas en el período) y Abiertas hoy; Servicios más pedidos (cantidad y monto); Reservas (recibidas, canceladas, no asistió, convertidas); Cobertura (checklist, control de calidad, informes). Montos con `formatClp`, `tabular-nums`. |
| Menú | `TallerLayout`: `{ label: "Indicadores", href: "/taller/indicadores", action: "dashboard.finance" }` en "Gestión", después de "Catálogo". |

## Qué hacer

- **`src/pages/taller/indicadores.astro` (nuevo, < 300 líneas).** Patrón de `src/pages/taller/usuarios.astro` para sesión y permiso; `PageHeader` con título "Indicadores"; `Card` por bloque; tablas `class="dense"` dentro de `div.scroll-x` como en el detalle de la orden; estilos propios solo en `<style is:global>` bajo `.taller` y con tokens (una grilla de cifras `.kpis` con `grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))`). Sin JavaScript.
- **`src/layouts/TallerLayout.astro`**: el enlace.

## No cambiar

- `/taller` (inicio), `adminDashboard`, `indicators.ts` (salvo un bug que las pruebas de A-07 no cubrieron: reportarlo), `global.css`, `taller-layout.css`, `taller-components.css`.
- Fotos por orden: sin tope. Ninguna prueba existente.

## Pruebas (primero, verlas fallar)

**`tests/integration/indicadores-page.test.ts`** (patrón de `users-admin.test.ts`: `loginAdmin`, cookie `vb_admin_session`, mock de `getDb`, `vi.useFakeTimers({ toFake: ["Date"] })`):
- Dueño GET sin parámetros → 200, `cache-control: no-store`, contiene "Indicadores", "Ingresos", "Ticket promedio", "Por medio de pago", y los `input` `desde`/`hasta` con el mes en curso.
- `?desde=2026-11-01&hasta=2026-11-12` → las cifras sembradas (un pago de $20.000 → "$20.000").
- Recepción → 403; mecánico → 403; sin sesión → 303 a `/admin/login?next=%2Ftaller%2Findicadores`.
- `?desde=2026-13-01` → 422 con el aviso y el rango por defecto en los `input`.
- POST → 405 o 404 (lo que haga el patrón de la página; documentarlo en la prueba).

**`e2e/indicadores.spec.ts`** (solo `@playwright/test` y `e2e/fixtures.ts`; `.tap()`): el dueño entra a `/taller`, toca "Menú", toca "Indicadores", ve el `h1` "Indicadores" y la tabla con caption "Ingresos por medio de pago"; toca "Mes anterior" y la URL lleva `desde=`. El mecánico abre `/taller/indicadores` y recibe 403 (texto "No tienes permiso").

Ninguna prueba existente se modifica (`admin-layout.test.ts` y los specs del menú deben seguir pasando).

## Documentación

- Decisión 54 ampliada.
- `README.md`, "Operación del taller": sección nueva "Indicadores" antes de "Tareas diarias y respaldos": "Dueño y administrador ven en **Indicadores** los ingresos por medio de pago, las entregas y el ticket promedio, las órdenes por estado, los servicios más pedidos, los clientes nuevos y recurrentes, la conversión de reservas y la cobertura de checklist, control e informes, para el rango de fechas que elijan (hasta un año). Es la primera etapa del panel financiero; la caja diaria con apertura y cierre llega con la fase 2."
- `blueprints/roadmap/dashboard-financiero.md`: en "Etapas propuestas", marcar la Etapa A como hecha (`/taller/indicadores`, decisión 54).

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0. Claude: `pnpm gate` → exit 0.
2. Con `pnpm dev`: entrar como dueño, abrir Indicadores, cambiar el rango, probar los atajos; comprobar a 1280×800 y 820×1180, claro y oscuro.

## Reporte

La cola de `pnpm check`, `pnpm test` y `pnpm build`, líneas finales de `indicadores.astro`, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
