# Llave 15 — instrucciones para agentes

Sistema multi-taller para talleres de bicicletas (primer taller: Vector Bikes, Vitacura): reservas en línea por taller (`/<slug>/reservar`), el área interna `/taller` (recepción en tablet, órdenes de trabajo, historial, inventario, caja y ventas de mostrador) y la administración de la plataforma (`/plataforma`): Astro 7 + Preact + Postgres (Drizzle) en Replit. El sitio informativo de Vector Bikes vive en `web/vector-bikes/`.

**Antes de terminar cualquier tarea:** `pnpm format` y después `pnpm gate` en verde. Nunca se marca una tarea como hecha con la compuerta fallando ni se edita un comando de Verify para que pase.

## Comandos

| Tarea | Comando |
|---|---|
| Instalar | `pnpm install --frozen-lockfile` |
| Formatear | `pnpm format` |
| Chequeo estático | `pnpm check` |
| Tests | `pnpm test` · un archivo: `pnpm test <ruta>` · solo dos talleres: `pnpm test isolation` |
| Build + tests del build | `pnpm build && pnpm test:build` |
| Tests de tablet | `pnpm build && pnpm test:tablet` · un spec: `pnpm test:tablet e2e/<archivo>.spec.ts` |
| Navegador de Playwright | `pnpm exec playwright install chromium` (solo en el Mac) |
| Smoke | `pnpm smoke` |
| Sitio de Vector Bikes (desde BG-39) | `pnpm test:web` · por partes: `pnpm exec astro check --root web/vector-bikes` · `pnpm exec astro build --root web/vector-bikes` · `pnpm exec vitest run --config web/vector-bikes/vitest.config.ts` |
| Compuerta completa | `pnpm gate` (check + test + build + test:build + test:tablet + smoke, + test:web desde BG-39) |
| Paridad de expectativas (desde BG-01) | `node scripts/bg-expect-parity.ts [--base <ref>] [--allow <texto>] [--skip <ruta>]` |
| Migraciones (solo base dev) | `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:check` |
| Migración de datos del primer taller (desde BG-05) | `pnpm bg:backfill [--dry-run] [--logo <ruta>]` |
| Salud de la plataforma (desde BG-39) | `pnpm bg:check` |
| Marca de plataforma (desde BG-45) | `pnpm platform:admin <correo> [--off]` |
| Inventario inicial | `pnpm inventory:import <archivo.csv> <correo> [--dry-run]` |
| Salud de la fase 2 | `pnpm f2:check` |
| Biblioteca | `pnpm library:import [--dry-run]` · `pnpm library:export [ruta]` · `pnpm library:check` |

Orden de trabajo de la fase Llave 15: `blueprints/bike-garage/tasks.json` y `blueprints/bike-garage/epics/`; cada tarea llega como un encargo `docs/encargos/BG-NN-*.md`. `blueprints/vector-taller-f1/`, `blueprints/vector-taller-f2/` y `blueprints/vector-bikes/` son registros de fases terminadas y no se tocan. Todo comando se ejecuta desde la raíz del proyecto. El sandbox de Codex no tiene red ni Postgres (ni siquiera `127.0.0.1`): corre `format`, `check`, `test` y `build`; `db:migrate`, `db:check`, `bg:backfill`, `bg:check`, `test:tablet`, `test:web`, `smoke`, `gate` y los commits los hace la sesión coordinadora.

## Reglas de código

1. Importaciones relativas con extensión `.ts`/`.tsx` explícita (`../db/client.ts`). Sin alias, sin barrels.
2. Nada de `enum`, `namespace` ni parameter properties (`erasableSyntaxOnly`): Node ejecuta `scripts/` quitando tipos.
3. Importaciones solo de tipos con `import type` (`verbatimModuleSyntax`).
4. La lógica de `src/server/**` recibe `db: AppDb` y `now: Date`; nunca `new Date()` dentro de la lógica.
5. Toda entrada externa pasa por zod antes de tocar `src/server/**`.
6. Ningún correo, `fetch`, subida al almacenamiento ni espera larga dentro de una transacción.
7. Archivos < 400 líneas, funciones < 50 líneas. Única excepción: `src/styles/global.css` (diseño aprobado; no partirlo; los tokens viven en `src/styles/tokens.css` desde BG-22).
8. Textos para el usuario en español de Chile; identificadores en inglés.
9. Todo elemento no-void cerrado en `.astro` (Astro 7 falla si no).
10. `set:html` solo para el JSON-LD de `Base.astro`.
11. Entorno solo por `src/lib/env.ts`; nunca `process.env` en otro lado (excepción: `e2e/**` y `playwright.config.ts`, que son infraestructura de pruebas). Logs por `src/lib/log.ts`.
12. En `/taller` y `/admin`, cada página y endpoint: sesión (`requireAdmin`) → permiso (`can` de `src/server/auth/permissions.ts`) → zod → `src/server/taller/**`. En `/plataforma`: sesión → `isPlatformAdmin` → zod → `src/server/shops/**`. El permiso se decide en el servidor.
13. Primero se sube el objeto al almacenamiento, después se escribe la fila; si la fila falla, se borra el objeto.
14. Ningún dato de un taller en `src/` (nombre, dirección, comunas, teléfono, tarifa, dominio): lo que ve el personal usa `PLATFORM.name` (`src/lib/platform.ts`); lo que ve el cliente, el perfil del taller (`ShopProfile`). La guardia `tests/unit/shop-literals.test.ts` lo hace cumplir.
15. Un error descubierto dentro de una transacción después de escribir se lanza (error centinela) y se traduce a `{ ok: false, code }` afuera.
16. Toda función que lee o escribe reservas recibe el alcance del taller (`BookingScope`, `src/server/shops/scope.ts`) o la sucursal; sin él, `singleShopScope` lanza cuando hay dos talleres. Las páginas y los handlers siempre lo pasan explícito.

## Diseño por paso

Hasta BG-46 rige el monocromo aprobado (`docs/design-preview.html`: radio 2px, botón primario `--ink` que invierte en hover, Michroma/Archivo/IBM Plex Mono, ningún hex nuevo). La identidad Llave 15 del manual de marca (`docs/marca/`, `blueprint.md` §7) entra solo en su paso y nunca antes: tokens en `:root.l15` de `src/styles/tokens.css` (solo claro) e Inter en BG-47; botones `--accent`, foco `--focus`, radios 8/12px y colores de estado en BG-48 (`src/styles/llave15.css`, bajo `.l15`); menú del personal en grafito con la firma y pie `<Taller> · Gestionado con Llave 15` en BG-49. Desde BG-47, hex solo en `src/styles/tokens.css` (y en `public/brand/llave15-*.svg`). Los estados conservan siempre su forma y su texto. La portada heredada (`Base.astro`) y `web/vector-bikes/` no cambian de diseño. Detalle en `.claude/rules/ui-design.md` y `taller-ui.md`.

## Fronteras de importación

| Capa | Puede importar | Nunca |
|---|---|---|
| `src/pages/**` | `server`, `lib`, `components`, `layouts` | SQL propio o lógica de negocio |
| `src/layouts/**` | `src/lib/**`, componentes, `src/server/auth/permissions.ts` (pura) | el resto de `src/server/**` |
| `src/components/**` | otros componentes, `booking-state.ts` | `src/server/**` (habla por `fetch` a `/api/*` o por un `input` del formulario) |
| `src/server/**` (incluye `taller/`, `shops/` y `storage/`) | `src/server/**`, `src/lib/**`, `src/data/**` | `astro`, `astro:*`, componentes |
| `src/lib/**` | paquetes npm | `src/server/**`, `astro` |
| `scripts/**` | `src/server/**`, `src/lib/**` | `astro` |
| `tests/**` | todo lo anterior | red real |
| `e2e/**` | `@playwright/test`, `e2e/fixtures.ts`; `global-setup.ts` además `hashPassword` de `src/server/auth/admin-auth.ts` y `scripts/vector-bikes-profile.ts` | el resto de `src/` (habla por HTTP) |
| `web/vector-bikes/**` | paquetes npm, su propio código | `src/**` |

Excepción hasta la decomisión BG-DC1: `src/layouts/Base.astro`, `src/components/Landing.astro`, `src/pages/index.astro` y `src/pages/privacidad.astro` importan `web/vector-bikes/src/content/site.ts`.

## Esquema

El esquema vive en catorce archivos, que importan en un solo sentido: `src/server/db/schema-shops.ts` (talleres; lo crea BG-03) ← `schema.ts` (reservas, sucursal, usuarios) ← `schema-taller.ts` (auditoría, catálogo, clientes, bicis) ← `schema-inventory.ts` (productos, stock, proveedores, compras) ← `schema-orders.ts` (órdenes y lo que cuelga) ← `schema-reports.ts` (informe, seguimiento y avisos al cliente) ← `schema-cash.ts` (caja y gastos) ← `schema-sales.ts` (ventas) ← `schema-payments.ts` (pagos y componentes) ← `schema-library-catalog.ts` (catálogo técnico global) ← `schema-library-knowledge.ts` (artículos, versiones, índice) ← `schema-library-procedures.ts` (procedimientos, compatibilidad) ← `schema-library-private.ts` (propuestas, diagnósticos, notas, consultas al asistente) ← `schema-platform.ts` (solicitudes de demo de la landing; sin `branch_id`, BG-D51). Las tablas del conocimiento global de la biblioteca no llevan `branch_id` (decisión BT-D1); las privadas sí. Desde BG-09 todas las tablas de reserva llevan `branch_id` NOT NULL. Después, `pnpm db:generate` → `pnpm db:migrate`. Cada tabla nueva va al arreglo de su archivo (`shopTables`, `allTables`, `tallerTables`, `inventoryTables`, `orderTables`, `reportTables`, `cashTables`, `saleTables`, `paymentTables`, `libraryCatalogTables`, `libraryKnowledgeTables`, `libraryProcedureTables`, `libraryPrivateTables`, `platformTables`). Detalle en `.claude/rules/database.md`.

## Reglas por carpeta

Antes de tocar archivos en estas rutas, leer el archivo de reglas correspondiente. No son opcionales.

| Archivo | Aplica a |
|---|---|
| `.claude/rules/database.md` | `src/server/db/**`, `drizzle/**`, `scripts/db-*.ts` |
| `.claude/rules/booking-engine.md` | `src/server/booking/**`, `src/data/**` |
| `.claude/rules/server-api.md` | `src/server/api/**`, `src/server/auth/**`, `src/pages/api/**`, `src/pages/admin/**`, `src/pages/reservas/**`, `src/pages/taller/**`, `src/pages/aprobacion/**`, `src/pages/informe/**`, `src/pages/seguimiento/**`, `src/pages/[slug]/**`, `src/pages/plataforma/**`, `src/server/taller/**`, `src/server/storage/**` |
| `.claude/rules/ui-design.md` | `src/components/**`, `src/layouts/**`, `src/styles/**`, `src/pages/*.astro`, `src/pages/[slug]/**` |
| `.claude/rules/taller-ui.md` | `src/pages/taller/**`, `src/components/taller/**`, `src/layouts/TallerLayout.astro` |
| `.claude/rules/taller-domain.md` | `src/server/taller/**`, `src/server/storage/**` |
| `.claude/rules/e2e.md` | `e2e/**`, `playwright.config.ts` |
| `.claude/rules/library.md` | `src/server/library/**`, `src/pages/taller/biblioteca/**`, `src/components/taller/library/**`, `src/data/library/**`, `scripts/library-*.ts` |
| `.claude/rules/shops.md` | `src/server/shops/**`, `src/pages/plataforma/**`, `scripts/bg-*.ts`, `scripts/platform-admin.ts`, `web/vector-bikes/**` |

## Al recibir un encargo delegado

- Trabajar solo en los archivos que nombra el encargo. Si hace falta tocar otro, detenerse y reportarlo en vez de ampliarlo.
- Releer cada archivo antes de tocarlo; no confiar en fragmentos o conteos de líneas citados en el blueprint.
- No cambiar firmas exportadas ni comportamiento fuera del alcance pedido.
- No agregar dependencias nuevas sin que el encargo lo autorice.
- Si una prueba existente se rompe, detenerse y reportarlo: no borrarla ni ajustarla para que pase. Las únicas ediciones permitidas en pruebas existentes son las de firma o siembra, o los valores declarados, que nombra el encargo.
- Terminar con un resumen archivo por archivo: qué cambió, qué se verificó y qué quedó pendiente.

## No negociable

1. Nunca más de 1 bici por bloque ni más de la capacidad diaria del taller por día: la garantía vive en la base (índice único parcial por sucursal + locks), no solo en la UI.
2. `pnpm db:migrate` solo contra la base del workspace; la app nunca migra al arrancar ni contra producción.
3. Nunca borrar reservas: se cambia `status`.
4. Nunca commitear secretos ni `.env`; nunca registrar correos, teléfonos ni tokens sin redactar.
5. Nunca editar a mano `drizzle/` (se regenera desde el esquema); nunca `drizzle-kit generate --custom`.
6. No construir nada de los No-Objetivos de `blueprint.md` §1 (pago en línea, cuentas de clientes, reprogramación por el cliente, feriados 2027 inventados) ni de la cerca de la fase 2 (`blueprints/vector-taller-f2/FASE2.md` §2.5: pago en línea, Strava/kilómetros, asistente de WhatsApp, multi-sucursal, entre otros). Inventario, caja, proveedores, compras, gastos y ventas de mostrador se construyen desde la decisión 55. Llave 15 multi-taller (tabla `shops`, `branch_id` en las reservas, página de reservas por taller, separación del sitio) se construye desde la decisión 57 (`blueprints/bike-garage/FASE-BIKE-GARAGE.md`), dentro de su cerca §2.3; multi-sucursal sigue fuera. Specs de navegador solo en `/taller` y, por excepción BG-D19, en `/<slug>/reservar`.
7. Nunca marcar una tarea como hecha con una compuerta fallando, ni editar un comando de Verify para que pase.
8. `branch_id` NOT NULL en toda tabla de operación, incluidas las de reserva desde BG-09.
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
20. Ninguna consulta sin filtro de taller sobre una tabla de operación; la prueba de dos talleres (`*-isolation.test.ts`) corre en `pnpm gate`.
21. Los enlaces enviados antes de la etapa 4 siguen funcionando: redirecciones permanentes en `vectorbikes.cl` y token de seguimiento heredado aceptado hasta BG-DC2.
22. La marca `is_platform_admin` nunca abre datos de otro taller: `/plataforma` muestra solo metadatos y conteos.

Arquitectura completa, fronteras y tokens de diseño: `CLAUDE.md` en este mismo directorio.
