# Llave 15

Sistema multi-taller para talleres de bicicletas (antes, el sistema de Vector Bikes, Av. Kennedy 7666, Vitacura, que es su primer taller): reservas en línea por taller (`/<slug>/reservar`), API, panel `/admin`, recordatorios, el área interna `/taller` (recepción en tablet, órdenes de trabajo, historial, inventario, caja y ventas de mostrador) y la administración de la plataforma (`/plataforma`), en Replit (`llave15.cl`). El sitio informativo de Vector Bikes vive en `web/vector-bikes/` hasta que sale a `vector-bikes-web`.

## Comandos

| Tarea | Comando |
|---|---|
| Instalar | `pnpm install --frozen-lockfile` |
| Dev | `pnpm dev` — http://localhost:4321 |
| Formatear | `pnpm format` |
| Chequeo estático | `pnpm check` (biome ci + astro check + tsc --noEmit) |
| Tests unit + integración | `pnpm test` · un archivo: `pnpm test tests/unit/slots.test.ts` · solo dos talleres: `pnpm test isolation` |
| Build | `pnpm build` |
| Tests sobre el build | `pnpm test:build` (requiere `pnpm build` antes) |
| Tests de tablet (Playwright, `/taller` y `/<slug>/reservar`) | `pnpm test:tablet` · un archivo: `pnpm test:tablet e2e/login.spec.ts` (requiere `pnpm build` antes y Postgres local) |
| Navegador de Playwright | `pnpm exec playwright install chromium` (solo en el Mac; nunca en el build de Replit) |
| Smoke del servidor | `pnpm smoke` (= `sh scripts/smoke.sh`) |
| Sitio de Vector Bikes (desde BG-39) | `pnpm test:web` (chequeo, build, pruebas y redirecciones de `web/vector-bikes/`) |
| Compuerta completa | `pnpm gate` = check + test + build + test:build + test:tablet + smoke (+ test:web desde BG-39) (nunca `pnpm ci`) |
| Paridad de expectativas (desde BG-01) | `node scripts/bg-expect-parity.ts [--base <ref>] [--allow <texto>] [--skip <ruta>]` (sale 0/1/2) |
| Migraciones (solo base dev) | `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:check` |
| Migración de datos del primer taller (desde BG-05) | `pnpm bg:backfill [--dry-run] [--logo <ruta>]` (sale 0/1/2) |
| Salud de la plataforma (desde BG-39) | `pnpm bg:check` (sale 0 sano, 1 cruce de sucursal, 2 sin conexión) |
| Marca de administrador de plataforma (desde BG-45) | `pnpm platform:admin <correo> [--off]` |
| Clave del dueño | `ADMIN_EMAIL=… ADMIN_PASSWORD=… pnpm admin:set-password` (escribe en `users`, rol dueño) |
| Recordatorios (respaldo manual) | `pnpm reminders:send` |
| Inventario inicial · salud de la fase 2 | `pnpm inventory:import <archivo.csv> <correo> [--dry-run]` (CSV fuera del repo) · `pnpm f2:check` (salen 0/1/2) |
| Biblioteca técnica | `pnpm library:import [--dry-run] [ruta]` · `pnpm library:export [ruta]` · `pnpm library:check` (sale 0/1/2) |

**Compuerta:** `pnpm gate` pasa antes de marcar cualquier tarea como hecha y antes de publicar. Antes de cada Verify, `pnpm format`.

Node 24 (`.nvmrc`), pnpm 12.4.2. La versión de pnpm se fija en el `build` de `[deployment]` en `.replit` (`corepack pnpm@12.4.2 …`), no en `packageManager`: Replit reescribe `package.json` al publicar y, si el campo existe, su instalación con pnpm 10 intenta autoinstalar pnpm 12 y aborta. No agregues `packageManager` a `package.json`. Las versiones exactas están en `pnpm-lock.yaml`: léelo, no adivines. `web/vector-bikes/` no es paquete del workspace: usa los mismos paquetes desde `node_modules` de la raíz.

## Estado del build

Orden de construcción: `blueprints/bike-garage/tasks.json` (una tarea = un paso `BG-NN`, tag `bg-NN`) y `blueprints/bike-garage/epics/`. Decisiones: `blueprints/bike-garage/blueprint.md` (§20.3, numeradas `BG-D#`; paridad y corte en §9.1); definición: `blueprints/bike-garage/FASE-BIKE-GARAGE.md`. Antes de cada pase a Codex, la sesión coordinadora escribe el encargo `docs/encargos/BG-NN-<tema>.md` con la plantilla de `docs/encargos/README.md`. Ventanas: `docs/ventanas/bg-v1.md`, `bg-v2.md`, `bg-v3.md`; corte del dominio: `docs/corte-bike-garage.md`. `blueprints/vector-taller-f1/` (decisiones globales 1–57), `blueprints/vector-taller-f2/` y `blueprints/vector-bikes/` son registros de solo lectura. Diseño visual aprobado: `docs/design-preview.html`; manual de marca de Llave 15: `docs/marca/`.

## Stack

Astro 7 (output server, @astrojs/node standalone) · TypeScript 6 · Preact (islas: reserva, firma, fotos) · Tailwind 4 + CSS portado del prototipo · Postgres 16 de Replit · Drizzle ORM · multi-taller por `shops` + `branch_id` · sesión propia sobre `users` con roles y la marca `is_platform_admin` · Resend · Cloudflare Turnstile · sharp · @replit/object-storage · Playwright · Replit Autoscale + cron externo (Make.com).

## Arquitectura

- **Reserva.** `/<slug>/reservar` → `BookingIsland.tsx` (props del taller) → `POST /api/reservas` con `taller` → `handleCreateBooking` en `src/server/api/handlers.ts` (taller por `scopeBySlug` → rate limit por taller → zod con la configuración del taller → Turnstile con `cdata` = slug) → `createBooking(db, input, now, scope)` en `src/server/booking/create-booking.ts` (transacción: lock de `booking_days` por sucursal y fecha, advisory lock por teléfono, revalidación con `slots.ts`, insert con `branch_id`) → commit → correos con la marca del taller → 201.
- **Alcance.** `BookingScope = { shopId, slug, branchId, config }` (`src/server/shops/scope.ts`): `scopeForBranch`, `scopeBySlug`, `activeShopScopes`; sin alcance, `singleShopScope` usa el único taller y **lanza con dos**. El perfil (`ShopProfile`, `src/server/shops/profile.ts`) sale por sucursal, slug o token.
- **Recepción.** tablet → `src/pages/taller/recepcion/nueva.astro` (POST) → `startReception` en `src/server/taller/orders.ts` (cliente y bici, número y régimen con `allocateNewOrder`, orden `reservada`, historial y auditoría) → `/taller/ordenes/<id>/recepcion` → `/taller/ordenes/<id>/cierre` (`PhotoCapture` → `fotos.ts`; `SignaturePad` en el POST) → `finalizeReception` en `src/server/taller/reception.ts` → `recibida`.
- **Landing y demo (BG-D52).** `/` es SSR: `isPlatformHost` (`src/server/shops/host.ts`) muestra en `llave15.cl` la landing (`src/components/llave15/PlatformLanding.astro` en `PlatformSiteLayout`, textos en `src/lib/platform-site.ts`) y en el dominio heredado la portada de Vector Bikes, hasta BG-DC1. `/demo` (POST) → `submitDemoRequest` en `src/server/shops/demo-submit.ts` (zod → Turnstile `cdata` `demo` → 3 por IP por hora → fila `demo_requests` → aviso a los administradores de plataforma y acuse al solicitante, después de guardar) → 303. Se gestionan en `/plataforma/solicitudes`; aviso legal en `/aviso-de-privacidad`. `robots.txt` y el sitemap son SSR por dominio (`src/server/shops/site-seo.ts`): cada dominio anuncia solo sus páginas; las de Llave 15 llevan canonical en `APP_URL`.
- **Venta de mostrador.** `src/pages/taller/ventas/nueva.astro` ("Calcular total" → `previewSale`; "Registrar venta" → `createSale` en `src/server/taller/sales.ts`): número `VM-00001`, precio y costo congelados, `applyStockMovement(venta)`, pago con `sale_id`; efectivo con caja habilitada exige `requireOpenCashSession` y crea el `cash_movements`.

**Fronteras.**

| Capa | Puede importar | Nunca |
|---|---|---|
| `src/pages/**` | `server`, `lib`, `components`, `layouts` | SQL propio o lógica de negocio |
| `src/layouts/**` | `src/lib/**`, componentes, `src/server/auth/permissions.ts` (pura) | el resto de `src/server/**` |
| `src/components/**` | otros componentes, `booking-state.ts` | `src/server/**` (habla por `fetch` a `/api/*` o por un `input` del formulario; recibe montos y marca ya formateados) |
| `src/server/**` (incluye `taller/`, `shops/` y `storage/`) | `src/server/**`, `src/lib/**`, `src/data/**` | `astro`, `astro:*`, componentes |
| `src/lib/**` | paquetes npm | `src/server/**`, `astro` |
| `scripts/**` | `src/server/**`, `src/lib/**` | `astro` |
| `tests/**` | todo lo anterior | red real |
| `e2e/**` | `@playwright/test`, `e2e/fixtures.ts`; `global-setup.ts` además `hashPassword` de `src/server/auth/admin-auth.ts` y `scripts/vector-bikes-profile.ts` | el resto de `src/` (habla por HTTP) |
| `web/vector-bikes/**` | paquetes npm, su propio código | `src/**`. Excepción inversa hasta BG-DC1: `Base.astro`, `Landing.astro`, `src/pages/index.astro` y `privacidad.astro` importan `web/vector-bikes/src/content/site.ts` |

**Dónde vive cada cosa.**

| Tema | Única fuente de verdad |
|---|---|
| Esquema | catorce archivos que importan en un solo sentido: `src/server/db/schema-shops.ts` (talleres; desde BG-03) ← `schema.ts` (reservas, sucursal, usuarios) ← `schema-taller.ts` ← `schema-inventory.ts` ← `schema-orders.ts` ← `schema-reports.ts` ← `schema-cash.ts` ← `schema-sales.ts` ← `schema-payments.ts` ← `schema-library-catalog.ts` ← `schema-library-knowledge.ts` ← `schema-library-procedures.ts` ← `schema-library-private.ts` (biblioteca; tablas globales sin `branch_id`, BT-D1) ← `schema-platform.ts` (`demo_requests`, sin `branch_id`, BG-D51) → `pnpm db:generate` → `pnpm db:migrate` |
| Conexión | `src/server/db/client.ts` (`getDb()`, tipo `AppDb`); los módulos reciben `db` como argumento |
| Entorno | `src/lib/env.ts` (accesores por funcionalidad, `getAppEnv`, `getTrackingEnv`); nunca `process.env` en otro lado |
| Perfil y configuración del taller | la fila de `shops`; `src/server/shops/profile.ts` (`ShopProfile`), `src/server/booking/config.ts` (`BookingConfig`), alcance en `src/server/shops/scope.ts` |
| Marca de la plataforma | `PLATFORM` (`src/lib/platform.ts`, Llave 15; desde BG-17; `descriptor` desde BG-47). `SITE` deja de existir en BG-27. Logo provisional en `public/brand/llave15-*.svg` (BG-46, 47) |
| Tiempo y zona | `src/lib/time.ts` (`TIMEZONE`, `localToday`, `addDays`, `localToInstant`) |
| Reglas genéricas de reserva | `src/server/booking/rules.ts` (`blocksFor`, `MAX_BIKES_PER_BOOKING`); los valores del taller, en `shops` |
| Reglas del taller (estados, transiciones, checklists, capacidad, etiqueta, categorías, medios de pago, IVA) | `src/server/taller/rules.ts` (`VAT_RATE_PERCENT`, `vatOfNet`, `netOfGross`) |
| Totales de la orden (régimen `final`/`neto`) | `src/server/taller/order-totals.ts` (`recomputeOrderTotals`, reexportado por `items.ts`) |
| Stock · Caja | `src/server/taller/stock.ts` (`applyStockMovement`, el único que cambia `products.stock_qty`) · `src/server/taller/cash.ts` (`requireOpenCashSession`, `recordCashMovement`) |
| Permisos · Sesión | `src/server/auth/permissions.ts` (`can(role, action)`; costos solo con `costs.view`; `shop.manage` solo dueño) · `src/server/auth/admin-auth.ts` (`requireAdmin`, `loginRedirect`) |
| Auditoría | `src/server/taller/audit.ts` (`recordAudit`, dentro de la transacción) |
| Almacenamiento de imágenes | `src/server/storage/storage.ts` (`getStorage()`); pipeline en `src/server/storage/images.ts`; logos en `shops/<id>/logo.png` |
| Correos | `src/server/email/brand.ts` (remitente `<Taller> · Llave 15`, `Reply-To`, pie `Gestionado con Llave 15`), `email/booking/*`, `email/garage/*` |
| Feriados · Tokens de diseño · Logs | `src/data/feriados-cl.json` · `src/styles/tokens.css` (desde BG-22; `:root.l15` desde BG-47) · `src/lib/log.ts` |
| Biblioteca técnica | `src/server/library/**` (reglas en `library/rules.ts`, acceso en `access.ts`); decisiones en `blueprints/vector-biblioteca/BIBLIOTECA.md` |

## Reglas de código

1. Importaciones relativas con extensión `.ts`/`.tsx` explícita (`../db/client.ts`). Sin alias, sin barrels.
2. Nada de `enum`, `namespace` ni parameter properties (`erasableSyntaxOnly`): Node ejecuta `scripts/` quitando tipos.
3. Importaciones solo de tipos con `import type` (`verbatimModuleSyntax`).
4. La lógica de `src/server/**` recibe `db: AppDb` y `now: Date`; nunca `new Date()` dentro de la lógica.
5. Toda entrada externa pasa por zod antes de tocar `src/server/**`.
6. Ningún correo, `fetch`, subida al almacenamiento ni espera larga dentro de una transacción.
7. Archivos < 400 líneas, funciones < 50 líneas. **Única excepción: `src/styles/global.css`** — es el diseño aprobado portado desde `docs/design-preview.html` y partirlo fragmentaría el sistema visual (los tokens viven en `tokens.css` desde BG-22).
8. Textos para el usuario en español de Chile; identificadores en inglés.
9. Todo elemento no-void cerrado en `.astro` (Astro 7 falla si no).
10. `set:html` solo para el JSON-LD de `Base.astro`.
11. En `/taller` y `/admin`, cada página y endpoint: sesión (`requireAdmin`) → permiso (`can`) → zod → `src/server/taller/**`. En `/plataforma`: sesión → `isPlatformAdmin` → zod → `src/server/shops/**`. El permiso se decide en el servidor; un botón oculto no es un permiso.
12. Primero se sube el objeto al almacenamiento, después se escribe la fila; si la fila falla, se borra el objeto.
13. Un error descubierto dentro de una transacción después de escribir se lanza (error centinela) y se traduce a `{ ok: false, code }` afuera: devolverlo no revierte.
14. **Ningún dato de un taller en `src/`** (nombre, dirección, comunas, teléfono, tarifa, dominio): lo que ve el personal usa `PLATFORM.name`; lo que ve el cliente, el perfil del taller. La guardia `tests/unit/shop-literals.test.ts` lo hace cumplir (desde BG-01; línea base vacía desde BG-28).
15. Toda función que lee o escribe reservas recibe el alcance del taller (`BookingScope`) o la sucursal; las páginas y los handlers siempre lo pasan explícito.

## Sistema de diseño

**Por paso (BG-D32–BG-D40).** Hasta BG-46 rige el monocromo aprobado (`docs/design-preview.html`). Desde BG-47, todo lo que carga `AppLayout` (ingreso, `/taller`, `/admin`, `/plataforma`, páginas del cliente en `PublicLayout`) usa la identidad Llave 15 (`docs/marca/`, `blueprint.md` §7) por partes: tokens y tipos en BG-47, componentes y estados en BG-48, layouts y firma en BG-49; nunca antes. La portada heredada (`Base.astro`) y `web/vector-bikes/` siguen en monocromo. Detalle en `.claude/rules/ui-design.md`.

| Token | Hasta BG-46 (claro · oscuro) | Desde BG-47 (`:root.l15`, solo claro) | Uso |
|---|---|---|---|
| `--ground` | #F6F6F4 · #0C0D0E | #F5F4F1 | Fondo |
| `--surface` | #FFFFFF · #151618 | #FFFFFF | Controles, tarjetas, tablas, ticket |
| `--ink` | #0C0D0E · #F1F1EE | #171C22 | Texto; desde BG-49 menú del personal |
| `--ink-2` | #2A2C2F · #C8C9CB | #515A64 | Texto secundario |
| `--steel` | #5A5E63 · #9C9FA4 | #515A64 | Etiquetas, ayudas |
| `--rule` | #D9D9D5 · #2B2D30 | #D9D9D9 | Divisores (solo decorativos) |
| `--hatch` | #E3E3DF · #1E2022 | #E3E3DF | Rayado reservado/deshabilitado |
| `--on-ink` | #F6F6F4 · #0C0D0E | #FFFFFF | Texto sobre `--ink` y `--accent` |
| `--field-border` | = `--steel` | #858E97 | Bordes de controles |
| `--accent` · `--accent-hover` | — | #AE3718 · #8D2B13 | Botón primario (desde BG-48) |
| `--brand-on-dark` · `--focus` | — | #FF774F · #195FAF | Marca sobre grafito · anillo de foco |
| `--status-<grupo>-bg` · `-ink` | — | cinco grupos (`ui-design.md`) | Estados (desde BG-48) |

- **Tipos:** hasta BG-46, Michroma 400 (h1/h2, con moderación) · Archivo Variable 400/600, cuerpo 16px/1.55 · IBM Plex Mono 400/500, etiquetas .72rem mayúsculas tracking .14em. Desde BG-47, Inter Variable 400–700 (respaldo Arial, sans-serif); desde BG-48, 28/36 títulos, 20/28 secciones, 16/24 cuerpo, 14/20 datos densos. Siempre `tabular-nums` en montos y tablas.
- **Forma:** reglas de 1px y sin sombras siempre; radio 2px hasta BG-47; desde BG-48, 8px controles y 12px tarjetas, espaciado múltiplo de 4px.
- **Botón primario:** hasta BG-47, `--ink` + `--on-ink` con **hover que invierte** (fondo `--surface`, texto y borde `--ink`); desde BG-48, `--accent` + `--on-ink`, hover `--accent-hover`, una acción primaria por zona y las demás `.btn.ghost`. Foco: hasta BG-47 2px `--ink` a 3px; desde BG-48 2px `--focus` a 2px, blanco sobre grafito. Nav: `.nav a:not(.btn)`.
- **Formularios:** etiqueta arriba; `.fields{align-items:start}`, `.field{align-content:start}`.
- **Movimiento:** `--dur-fast` 140ms, `--dur` 160ms, máx. 250ms, `--ease: cubic-bezier(.2,.7,.2,1)`; `prefers-reduced-motion` → 0ms.
- **Layout:** `.wrap` máx. 1180px; objetivos táctiles ≥ 44px. `AppLayout` (raíz del sistema) ← `TallerLayout` (personal) y `PublicLayout` (cliente: manda el nombre o logo del taller; pie `Gestionado con Llave 15`, desde BG-49 `<Taller> · Gestionado con Llave 15`). Desde BG-49 el menú del personal va en grafito con la firma invertida (`alt="Llave 15"`).
- **Área `/taller`:** mismos tokens; hex solo en `tokens.css` (hasta BG-46, ningún hex nuevo); objetivos ≥ 48px; estados con forma + texto (desde BG-48, además el color de su grupo); tablas densas con `tabular-nums`; órdenes `neto` con `OrderAmounts.astro`; ninguna isla nueva. Detalle en `.claude/rules/taller-ui.md`.

## Entorno

| Variable | Requerida desde | Usada por |
|---|---|---|
| `DATABASE_URL` | paso 2 | `client.ts`, scripts (`db-*`, `inventory-import`, `f2-check`, `bg-backfill`, `bg-check`, `platform-admin`) |
| `CANCEL_TOKEN_SECRET` | paso 4 | `tokens.ts` (y seguimiento heredado hasta BG-DC2) |
| `TURNSTILE_SECRET_KEY`, `SESSION_SECRET` | paso 5 | `handlers.ts` |
| `PUBLIC_WHATSAPP_NUMBER` (opcional) · `PUBLIC_TURNSTILE_SITE_KEY` | pasos 6 · 7 | `Base.astro` · `index.astro`, `[slug]/reservar.astro` (build) |
| `PUBLIC_SITE_URL`, `EMAIL_TRANSPORT`, `EMAIL_FROM` | paso 8 | origen heredado (convivencia hasta BG-DC3), dirección de envío |
| `EMAIL_REPLY_TO`, `SHOP_NOTIFY_EMAIL` | paso 8; desde BG-18 solo `bg:backfill` | se retiran en BG-DC3 |
| `RESEND_API_KEY` | paso 8, solo con `resend` | `transport.ts` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | solo el script | `admin-set-password.ts` |
| `WHATSAPP_*` (opcionales) · `CRON_SECRET` (≥ 32, opcional) | existentes | `src/server/whatsapp/**` · `src/server/whatsapp/cron.ts` |
| `TASKS_SECRET` (≥ 32) | F1-01 | `src/server/api/task-handlers.ts` (`/api/tareas/*`) |
| `E2E_DATABASE_URL` (opcional; por defecto `…/vector_bikes_e2e`) | F1-06 | `e2e/**`, `playwright.config.ts` |
| `STORAGE_DRIVER` (`local`/`replit`), `STORAGE_LOCAL_DIR`, `STORAGE_BUCKET_ID` | F1-08 | `src/server/storage/storage.ts` |
| `AI_PROVIDER` (`none`/`anthropic`, opcional), `ANTHROPIC_API_KEY` (solo con `anthropic`), `AI_MODEL` (opcional, `claude-opus-5-5`) | BT-17 | `src/lib/env.ts` (`getAiEnv`), `src/server/library/ai-provider.ts` |
| `APP_URL` (opcional; vacío = `PUBLIC_SITE_URL`) | BG-34 | cookie, CSRF y enlaces del sistema |
| `TRACKING_TOKEN_SECRET` (≥ 32, opcional; vacío = `CANCEL_TOKEN_SECRET`) | BG-35 | `src/server/taller/tracking.ts` |

`.env.example` se commitea y se mantiene al día. En Replit, los valores reales van en *Secrets*.

## Reglas diferidas

| Archivo | Aplica a |
|---|---|
| `.claude/rules/database.md` | `src/server/db/**`, `drizzle/**`, `scripts/db-*.ts` |
| `.claude/rules/booking-engine.md` | `src/server/booking/**`, `src/data/**` |
| `.claude/rules/server-api.md` | `src/server/api/**`, `src/server/auth/**`, `src/pages/{api,admin,reservas,taller,aprobacion,informe,seguimiento,[slug],plataforma}/**`, `src/server/taller/**`, `src/server/storage/**` |
| `.claude/rules/ui-design.md` | `src/components/**`, `src/layouts/**`, `src/styles/**`, `src/pages/*.astro`, `src/pages/[slug]/**` |
| `.claude/rules/taller-ui.md` | `src/pages/taller/**`, `src/components/taller/**`, `src/layouts/TallerLayout.astro` |
| `.claude/rules/taller-domain.md` | `src/server/taller/**`, `src/server/storage/**` |
| `.claude/rules/e2e.md` | `e2e/**`, `playwright.config.ts` |
| `.claude/rules/library.md` | `src/server/library/**`, `src/pages/taller/biblioteca/**`, `src/components/taller/library/**`, `src/data/library/**`, `scripts/library-*.ts` |
| `.claude/rules/shops.md` | `src/server/shops/**`, `src/pages/plataforma/**`, `scripts/bg-*.ts`, `scripts/platform-admin.ts`, `web/vector-bikes/**` |

## No negociable

1. Nunca más de 1 bici por bloque ni más de la capacidad diaria del taller (4 en Vector Bikes): la garantía vive en la base (índice único parcial por sucursal + locks), no solo en la UI.
2. `pnpm db:migrate` solo contra la base del workspace; la app nunca migra al arrancar ni contra producción.
3. Nunca borrar reservas: se cambia `status`.
4. Nunca commitear secretos ni `.env`; nunca registrar correos, teléfonos ni tokens sin redactar.
5. Nunca editar a mano `drizzle/` (se regenera desde el esquema); nunca `drizzle-kit generate --custom`.
6. No construir nada de los No-Objetivos de `blueprint.md` §1 (pago en línea, cuentas de clientes, reprogramación por el cliente, feriados 2027 inventados) ni de la cerca de la fase 2 (`blueprints/vector-taller-f2/FASE2.md` §2.5). Inventario, caja, proveedores, compras, gastos y ventas de mostrador se construyen desde la decisión 55. Llave 15 multi-taller (tabla `shops`, `branch_id` en las reservas, página de reservas por taller, separación del sitio) se construye desde la decisión 57 (`blueprints/bike-garage/FASE-BIKE-GARAGE.md`), dentro de su cerca §2.3; multi-sucursal sigue fuera. Specs de navegador solo en `/taller` y, por excepción BG-D19, en `/<slug>/reservar`.
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

## Reparto con Codex

Me quedo con entender el problema, planear, decidir la arquitectura y revisar lo que vuelve. Esa parte no se delega. La construcción repetitiva, los refactors grandes y los errores atorados se le pasan a Codex con el subagente `codex-rescue`, por mi cuenta, sin esperar que me lo pidan. Una tarea de `tasks.json` = un pase a Codex. Nunca dos pases a la vez: espero el resultado, lo leo y recién entonces sigo.

Codex lee `AGENTS.md`, no este archivo ni `.claude/rules/`. Por eso cada encargo incluye: la tarea de `tasks.json` y los archivos exactos que toca; la regla de `.claude/rules/` que aplica, nombrada por ruta; los puntos de "No negociable" que tocan esa tarea (siempre: no editar `drizzle/`, no migrar fuera de la base dev, no commitear secretos ni `.env`, y la regla 14); qué NO debe cambiar (firmas exportadas, otros módulos, el diseño aprobado, los valores esperados de las pruebas existentes); y el cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en su sandbox (sin red, ni siquiera `127.0.0.1`); el Verify completo, las migraciones, `pnpm gate` y el commit los hago yo.

Antes de cada pase el árbol de git está limpio (commiteado). Si lo que vuelve está mal, se revierte con `git checkout .` y no se parcha encima. Nada de lo que vuelve de Codex se da por bueno sin que yo lo revise y sin `pnpm gate` en verde. En cada pase cuento qué le pedí y qué volvió, en dos líneas. Si Codex falla dos veces en la misma tarea, esa tarea vuelve a mí: cuando algo se atora dos veces, lo que está mal es el encargo, no quién lo ejecuta.
