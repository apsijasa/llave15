# Vector Bikes — instrucciones para agentes

Sitio y reservas en línea del taller Vector Bikes (Vitacura) y su área interna `/taller` (recepción en tablet, órdenes de trabajo, historial, inventario, caja y ventas de mostrador): Astro 7 + Preact + Postgres (Drizzle) en Replit.

**Antes de terminar cualquier tarea:** `pnpm format` y después `pnpm gate` en verde. Nunca se marca una tarea como hecha con la compuerta fallando ni se edita un comando de Verify para que pase.

## Comandos

| Tarea | Comando |
|---|---|
| Instalar | `pnpm install --frozen-lockfile` |
| Formatear | `pnpm format` |
| Chequeo estático | `pnpm check` |
| Tests | `pnpm test` · un archivo: `pnpm test <ruta>` |
| Build + tests del build | `pnpm build && pnpm test:build` |
| Tests de tablet | `pnpm build && pnpm test:tablet` · un spec: `pnpm test:tablet e2e/<archivo>.spec.ts` |
| Navegador de Playwright | `pnpm exec playwright install chromium` (solo en el Mac) |
| Smoke | `pnpm smoke` |
| Compuerta completa | `pnpm gate` (check + test + build + test:build + test:tablet + smoke) |
| Migraciones (solo base dev) | `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:check` |
| Inventario inicial (desde F2-06) | `pnpm inventory:import <archivo.csv> <correo> [--dry-run]` |
| Salud de la fase 2 (desde F2-35) | `pnpm f2:check` |
| Biblioteca (desde BT-04, BT-15, BT-22) | `pnpm library:import [--dry-run]` · `pnpm library:export [ruta]` · `pnpm library:check` |

Orden de trabajo de la fase 2: `blueprints/vector-taller-f2/tasks.json` y `blueprints/vector-taller-f2/epics/`; cada tarea llega como un encargo `docs/encargos/F2-NN-*.md`. `blueprints/vector-taller-f1/` y `blueprints/vector-bikes/` son registros de fases terminadas y no se tocan. Todo comando se ejecuta desde la raíz del proyecto. El sandbox de Codex no tiene red ni Postgres: corre `format`, `check`, `test` y `build`; `db:migrate`, `db:check`, `test:tablet`, `smoke`, `gate` y los commits los hace la sesión coordinadora.

## Reglas de código

1. Importaciones relativas con extensión `.ts`/`.tsx` explícita (`../db/client.ts`). Sin alias, sin barrels.
2. Nada de `enum`, `namespace` ni parameter properties (`erasableSyntaxOnly`): Node ejecuta `scripts/` quitando tipos.
3. Importaciones solo de tipos con `import type` (`verbatimModuleSyntax`).
4. La lógica de `src/server/**` recibe `db: AppDb` y `now: Date`; nunca `new Date()` dentro de la lógica.
5. Toda entrada externa pasa por zod antes de tocar `src/server/**`.
6. Ningún correo, `fetch`, subida al almacenamiento ni espera larga dentro de una transacción.
7. Archivos < 400 líneas, funciones < 50 líneas. Única excepción: `src/styles/global.css` (diseño aprobado; no partirlo).
8. Textos para el usuario en español de Chile; identificadores en inglés.
9. Todo elemento no-void cerrado en `.astro` (Astro 7 falla si no).
10. `set:html` solo para el JSON-LD de `Base.astro`.
11. Entorno solo por `src/lib/env.ts`; nunca `process.env` en otro lado (excepción: `e2e/**` y `playwright.config.ts`, que son infraestructura de pruebas). Logs por `src/lib/log.ts`.
12. En `/taller` y `/admin`, cada página y endpoint: sesión (`requireAdmin`) → permiso (`can` de `src/server/auth/permissions.ts`) → zod → `src/server/taller/**`. El permiso se decide en el servidor.
13. Primero se sube el objeto al almacenamiento, después se escribe la fila; si la fila falla, se borra el objeto.
14. Ningún texto para el usuario, correo, asunto, título ni página escribe el nombre del taller literal: se usa `SITE.name` o el perfil del taller.
15. Un error descubierto dentro de una transacción después de escribir se lanza (error centinela) y se traduce a `{ ok: false, code }` afuera.

## Fronteras de importación

| Capa | Puede importar | Nunca |
|---|---|---|
| `src/pages/**` | `server`, `lib`, `components`, `layouts` | SQL propio o lógica de negocio |
| `src/layouts/**` | `src/lib/**`, componentes, `src/server/auth/permissions.ts` (pura) | el resto de `src/server/**` |
| `src/components/**` | otros componentes, `booking-state.ts` | `src/server/**` (habla por `fetch` a `/api/*` o por un `input` del formulario) |
| `src/server/**` (incluye `taller/` y `storage/`) | `src/server/**`, `src/lib/**`, `src/data/**` | `astro`, `astro:*`, componentes |
| `src/lib/**` | paquetes npm | `src/server/**`, `astro` |
| `scripts/**` | `src/server/**`, `src/lib/**` | `astro` |
| `tests/**` | todo lo anterior | red real |
| `e2e/**` | `@playwright/test`, `e2e/fixtures.ts`; `global-setup.ts` además `hashPassword` de `src/server/auth/admin-auth.ts` | el resto de `src/` (habla por HTTP) |

## Esquema

El esquema vive en doce archivos, que importan en un solo sentido: `src/server/db/schema.ts` (base, sucursal, usuarios) ← `schema-taller.ts` (auditoría, catálogo, clientes, bicis) ← `schema-inventory.ts` (productos, stock, proveedores, compras) ← `schema-orders.ts` (órdenes y lo que cuelga) ← `schema-reports.ts` (informe, seguimiento y avisos al cliente) ← `schema-cash.ts` (caja y gastos) ← `schema-sales.ts` (ventas) ← `schema-payments.ts` (pagos y componentes) ← `schema-library-catalog.ts` (catálogo técnico global) ← `schema-library-knowledge.ts` (artículos, versiones, índice) ← `schema-library-procedures.ts` (procedimientos, compatibilidad) ← `schema-library-private.ts` (propuestas, diagnósticos, notas, consultas al asistente). Las tablas del conocimiento global de la biblioteca no llevan `branch_id` (decisión BT-D1); las privadas sí. Después, `pnpm db:generate` → `pnpm db:migrate`. Cada tabla nueva va al arreglo de su archivo (`allTables`, `tallerTables`, `inventoryTables`, `orderTables`, `reportTables`, `cashTables`, `saleTables`, `paymentTables`, `libraryCatalogTables`, `libraryKnowledgeTables`, `libraryProcedureTables`, `libraryPrivateTables`). Detalle en `.claude/rules/database.md`.

## Reglas por carpeta

Antes de tocar archivos en estas rutas, leer el archivo de reglas correspondiente. No son opcionales.

| Archivo | Aplica a |
|---|---|
| `.claude/rules/database.md` | `src/server/db/**`, `drizzle/**`, `scripts/db-*.ts` |
| `.claude/rules/booking-engine.md` | `src/server/booking/**`, `src/data/**` |
| `.claude/rules/server-api.md` | `src/server/api/**`, `src/server/auth/**`, `src/pages/api/**`, `src/pages/admin/**`, `src/pages/reservas/**`, `src/pages/taller/**`, `src/pages/aprobacion/**`, `src/pages/informe/**`, `src/server/taller/**`, `src/server/storage/**` |
| `.claude/rules/ui-design.md` | `src/components/**`, `src/layouts/**`, `src/styles/**`, `src/pages/*.astro` |
| `.claude/rules/taller-ui.md` | `src/pages/taller/**`, `src/components/taller/**`, `src/layouts/TallerLayout.astro` |
| `.claude/rules/taller-domain.md` | `src/server/taller/**`, `src/server/storage/**` |
| `.claude/rules/e2e.md` | `e2e/**`, `playwright.config.ts` |
| `.claude/rules/library.md` | `src/server/library/**`, `src/pages/taller/biblioteca/**`, `src/components/taller/library/**`, `src/data/library/**`, `scripts/library-*.ts` |

## Al recibir un encargo delegado

- Trabajar solo en los archivos que nombra el encargo. Si hace falta tocar otro, detenerse y reportarlo en vez de ampliarlo.
- Releer cada archivo antes de tocarlo; no confiar en fragmentos o conteos de líneas citados en el blueprint.
- No cambiar firmas exportadas ni comportamiento fuera del alcance pedido.
- No agregar dependencias nuevas sin que el encargo lo autorice.
- Si una prueba existente se rompe, detenerse y reportarlo: no borrarla ni ajustarla para que pase.
- Terminar con un resumen archivo por archivo: qué cambió, qué se verificó y qué quedó pendiente.

## No negociable

1. Nunca más de 1 bici por bloque ni más de 4 reservas por día: la garantía vive en la base (índice único parcial + locks), no solo en la UI.
2. `pnpm db:migrate` solo contra la base del workspace; la app nunca migra al arrancar ni contra producción.
3. Nunca borrar reservas: se cambia `status`.
4. Nunca commitear secretos ni `.env`; nunca registrar correos, teléfonos ni tokens sin redactar.
5. Nunca editar a mano `drizzle/` (se regenera desde el esquema); nunca `drizzle-kit generate --custom`.
6. No construir nada de los No-Objetivos de `blueprint.md` §1 (pago en línea, cuentas de clientes, reprogramación, E2E con navegador fuera de `/taller`, feriados 2027 inventados) ni de la cerca de la fase 2 (`blueprints/vector-taller-f2/FASE2.md` §2.5: pago en línea, Strava/kilómetros, asistente de WhatsApp, multi-sucursal, entre otros). Inventario, caja, proveedores, compras, gastos y ventas de mostrador se construyen desde la decisión 55. Bike Garage multi-taller (tabla `shops`, `branch_id` en las reservas, página de reservas por taller, separación del sitio) se construye desde la decisión 57 (`blueprints/bike-garage/FASE-BIKE-GARAGE.md`), dentro de su cerca §2.3; multi-sucursal sigue fuera.
7. Nunca marcar una tarea como hecha con una compuerta fallando, ni editar un comando de Verify para que pase.
8. `branch_id` NOT NULL en toda tabla de operación nueva.
9. Nunca borrar una orden, línea, componente, aprobación, foto de informe, venta, compra, gasto ni movimiento: se marcan con `voided_at`.
10. Saldo cero antes de `entregada` y control de calidad antes de `lista_para_retirar`: garantizados por CHECK en la base.
11. Token de aprobación de un solo uso, guardado como hash; nunca en claro.
12. El mecánico nunca cambia un precio: el servidor responde 403.
13. La recepción y el control de calidad, y desde la fase 2 la venta, el cobro en efectivo con caja abierta y el ajuste de stock, se prueban en tablet (spec de Playwright + tablet real) antes de darse por hechos.
14. El stock solo cambia por `stock_movements` (`applyStockMovement`); nunca un `update` directo de `products.stock_qty`, que tiene CHECK `>= 0`.
15. Una sesión de caja abierta por sucursal; con la caja habilitada, sin sesión abierta no entra ni sale efectivo (`cash_closed`).
16. Pagos, movimientos de stock y de caja no se editan: se anulan y se crea otro.
17. `cost_clp`, `unit_cost_clp`, `fee_clp` y `net_clp` solo salen de `src/server/**` para roles con `costs.view`; el mecánico nunca los recibe (prueba de omisión por rol).
18. Una orden nunca cambia de régimen: `pricing_mode` se fija al crearla; el interruptor de la sucursal solo afecta a las órdenes nuevas.
19. Mercado Pago solo como registro: nada de credenciales ni llamadas a su API.

Arquitectura completa, fronteras y tokens de diseño: `CLAUDE.md` en este mismo directorio.
