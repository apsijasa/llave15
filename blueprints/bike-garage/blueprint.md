# Llave 15 — El sistema del taller como producto para muchos talleres — Blueprint de cambio

> Generado por The Architect el 2026-11-17 (modo brownfield, `/the-architect:architect-brownfield`)
> Forma: herramienta interna multi-taller (`internal-tool`) sobre el sitio + taller existentes
> Runtime track: el del repo (Node 24, pnpm 12.4.2, Astro 7, TypeScript 6) — pins de `pnpm-lock.yaml`
> Modo de emisión: bundle (`blueprint.md`, `tasks.json`, `epics/01…05`, `workspace/`, `WORKSPACE_BASE`)
> Versión del blueprint: 3 (la 2 corrige la ronda 1 de validación: 1 BLOCKER, 1 MAJOR, 2 MINOR; la 3 agrega la identidad visual Llave 15, BG-46 … BG-49, decisiones BG-D32 … BG-D40) · Versiones: fijadas por el lockfile en `8bca898`, 2026-11-17, más `@fontsource-variable/inter` 5.3.0 (BG-47, verificada el 2026-11-18) — ver §11
> Fuente autoritativa: `blueprints/bike-garage/FASE-BIKE-GARAGE.md` (en adelante **FASE**), aprobado por el dueño el 17-11-2026 (decisión 57). Este documento no la modifica.

Identificadores: cada paso se llama `BG-NN` (de `BG-01` a `BG-49`; BG-46 … BG-49, la identidad visual Llave 15, se agregaron después y se construyen entre BG-28 y BG-29, BG-D40); su tarea en `tasks.json` es `E<etapa>-T<n>` y su tag de checkpoint es `bg-NN`. Las cinco épicas son las cinco etapas de FASE §3. Las decisiones propias de este blueprint se numeran `BG-D1`, `BG-D2`, …; las globales 1–57 viven en `blueprints/vector-taller-f1/blueprint.md` §20.3 (la 57 abre esta fase). Las tareas de decomisión se llaman `BG-DC1` … `BG-DC4` y no son pasos de §9. Equivalencias en el mapa de §9.

La construcción es **supervisada**, igual que las fases 1 y 2: la sesión coordinadora (Claude) escribe un encargo por paso (`docs/encargos/BG-NN-<tema>.md`, plantilla de `docs/encargos/README.md`); Codex implementa con pruebas primero y corre solo `pnpm format && pnpm check && pnpm test && pnpm build` (su sandbox no tiene red, ni siquiera `127.0.0.1`: nunca corre `db:migrate`, `db:check`, `test:tablet`, `smoke`, `test:web` ni `gate`, y nunca commitea); Claude revisa, aplica las migraciones a la base dev, corre el Verify completo y `pnpm gate`, commitea y pone el tag. El dueño sube y publica en Replit. Este blueprint se escribió sobre el commit `8bca898`: **cada paso relee los archivos que toca** y no confía en los conteos de líneas citados aquí.

**Paridad (regla aprobada por el dueño):** con el taller Vector Bikes sembrado con los valores de hoy, la suite existente pasa **sin cambiar valores esperados hasta la etapa 2**. Se permiten, declarados por paso, los **cambios de firma o de siembra** en pruebas existentes (agregar `branch_id`, sembrar el taller, pasar el alcance o la configuración a una función cuya firma cambió, cambiar la línea de import de un módulo que se mueve). Ningún valor esperado cambia antes de BG-17; desde la etapa 2, cada paso que cambia un texto visible declara exactamente qué valores esperados cambian, y `scripts/bg-expect-parity.ts` (BG-01) lo hace decidible por script.

**Regla transversal de esta fase:** ningún dato de un taller en `src/` (nombre, dirección, comunas, teléfono, tarifa, dominio). Lo que ve el personal usa `PLATFORM` (Llave 15, `src/lib/platform.ts`); lo que ve el cliente usa el perfil del taller (`ShopProfile`). La guardia `tests/unit/shop-literals.test.ts` (BG-01) lo hace cumplir y su línea base queda vacía en BG-28.

**Pruebas que importan `src/lib/site.ts`** (once en `8bca898`, más `tests/unit/vector-bikes-profile.test.ts` de BG-04): dejan de importarlo en el paso que toca lo que prueban, siempre **cambiando solo la línea de import o el armado de la marca, nunca la cola de un matcher**. Las que leen `SITE` (`SITE.name`, `SITE.url`, …) importan desde BG-18 el accesorio `SITE` de `tests/helpers/shops.ts`, con los mismos campos y valores que `src/lib/site.ts` tenía en `8bca898`; las que hacen `vi.mock` de `src/lib/site.ts` arman la marca con los valores del mock y la pasan como argumento, y quitan el `vi.mock` cuando ya nada de lo que prueban usa `SITE`. Reparto: `rescheduled-email` (BG-18), `received-email`, `ready-email`, `pricing-emails` (BG-19), `part-added-email` y el `vi.mock` de `email-brand` (BG-20), `delivery-date-email` (BG-21), el `vi.mock` de `report-view-brand` (BG-24), y `low-stock`, `lineas-aviso-repuesto`, `tests/build/landing.test.ts` (`whatsappHref`) y `vector-bikes-profile` (BG-27).

---

## 1. Visión general y No-Objetivos

### Visión
Que **Llave 15** sea un solo sistema, en su propio dominio (`llave15.cl`), donde cada taller de bicicletas entra con sus usuarios y ve solo lo suyo: agenda, reservas en línea, recepción, órdenes, inventario, caja, ventas, informes y avisos al cliente. El sitio de Vector Bikes queda como un sitio informativo aparte (`web/vector-bikes/`, después repositorio `vector-bikes-web`), cuyo botón "Reservar" lleva a `https://llave15.cl/vector-bikes/reservar` (FASE §1). Escala: de 1 a 20 talleres, una sucursal por taller, Chile. Principio central (FASE §4): ninguna consulta, tarea, correo ni página ve datos de un taller distinto al del usuario, el token o el `slug` que la origina.

### Current state
Repo en la rama `docs/bike-garage`, base `8bca898`. Astro 7 SSR en Replit Autoscale (`.replit`, `astro.config.mjs` con `site` = `PUBLIC_SITE_URL` o `https://vectorbikes.cl`), Postgres 16 vía Drizzle 0.45. Esquema en doce archivos con importación en un sentido, cabeza `src/server/db/schema.ts` (291 líneas: `bookings`, `whatsapp_messages`, `booking_blocks`, `booking_days` con PK `service_date`, `blocked_periods`, `branches`, `users`, `admin_sessions`, `login_attempts`, `booking_requests`, `booking_bikes`). Las tablas de reserva **no tienen `branch_id`**; los índices `uq_bookings_code`, `uq_booking_blocks_active_slot`, `uq_customers_rut` y `uq_branches_name` son globales; los CHECK `bookings_fee_check` (tarifa = 15000) y `bookings_retiro_address_check` (comuna `Vitacura` o `Las Condes`) llevan los valores del taller. Las reglas de reserva son constantes de `src/server/booking/rules.ts` (`TIMEZONE`, `BLOCK_MINUTES` 30, `DAILY_CAPACITY` 4, `MIN_NOTICE_MINUTES` 120, `HORIZON_DAYS` 30, `PICKUP_FEE_CLP` 15000, `PICKUP_COMUNAS`, `RECEPTION_HOURS`, `PICKUP_HOURS`); `localToday`, `addDays` y `localToInstant` viven en `slots.ts`; el código de reserva es `VB-AAMMDD-HHMM` (`create-booking.ts:38`). La identidad es la constante `SITE` (`src/lib/site.ts`, importada por 44 archivos de `src/` y 11 de `tests/`) y hay 82 literales del taller en 43 archivos de `src/` (incluidos títulos `— Vector Bikes`, `label.ts:43`, `templates.ts:257`, `Base.astro`, `BookingFields.tsx:185,205`). `TallerLayout` hereda `Base.astro` (portada: fuentes, `global.css`, FAQ, JSON-LD, wordmark). El seguimiento usa `CANCEL_TOKEN_SECRET` (`tracking.ts`); CSRF y cookie se atan a `PUBLIC_SITE_URL`. `createOwner` toma la primera sucursal o crea una (`admin-auth.ts:92-120`). La guardia de la regla 14 no existe, aunque `CLAUDE.md` la da por hecha (FASE §6). Pruebas: Vitest + PGlite (una conexión), specs de Playwright en tablet, `scripts/smoke.sh`, compuerta `pnpm gate`.

### Target state
Mismo repo (se convierte en `bike-garage`), misma base y mismo Replit (decisión 14), con `llave15.cl` agregado. Cadena de esquema: `schema-shops.ts` ← `schema.ts` ← `schema-taller.ts` ← … ← `schema-library-private.ts` (BG-D1). Tabla `shops` con el perfil y la configuración de cada taller; `branches.shop_id` NOT NULL; `branch_id` NOT NULL en las siete tablas de reserva; `booking_days` con PK (`branch_id`, `service_date`); unicidad por taller; CHECK relajados (FASE §2.3 punto 13). Motor de reservas que recibe un `BookingScope` (`shopId`, `branchId`, `config`) cargado desde `shops`; tiempo en `src/lib/time.ts`. Perfil del taller por sesión, token o `slug` (`src/server/shops/profile.ts`); `SITE` desaparece y nace `PLATFORM`; correos con remitente `<Taller> · Llave 15`, `Reply-To` del taller, copias a su correo de avisos y la línea `Gestionado con Llave 15`. Página pública `/<slug>/reservar` y `/<slug>/privacidad`; `api/reservas` y `api/disponibilidad` reciben el taller; Turnstile y límite por taller. `APP_URL` para cookie, CSRF y enlaces; `TRACKING_TOKEN_SECRET` propio sin romper enlaces enviados. Tareas diarias que recorren los talleres activos. Sitio nuevo de Vector Bikes en `web/vector-bikes/` con redirecciones permanentes. Pantallas `/plataforma` (crear, suspender, ver uso) y `/taller/mi-taller`. Prueba de dos talleres y guardia de literales en `pnpm gate`. Identidad visual Llave 15 del manual de marca del dueño (paleta en `:root.l15`, Inter, controles y estados con color, firma provisional en SVG) en todo lo que carga `AppLayout`; la portada heredada y el sitio de Vector Bikes conservan su diseño (BG-D32).

### Usuarios
| Persona | Qué viene a hacer | Frecuencia |
|---|---|---|
| Personal de un taller (`owner`, `admin`, `reception`, `mechanic`) | Lo mismo que hoy, viendo solo su taller y la marca Llave 15 | Diaria |
| Cliente de un taller | Reservar en `/<slug>/reservar`, abrir enlaces de seguimiento, informe, aprobación y cancelación con la marca de su taller | Ocasional |
| Administrador de plataforma (`users.is_platform_admin`, Andrés) | Crear, suspender y ver el uso de los talleres en `/plataforma` | Semanal |
| Dueño de un taller nuevo | Entrar, editar "Mi taller" y operar | Diaria |

### Objetivos — alcance de esta fase
1. Etapa 1 — cimientos: `shops`, `branch_id` en reservas (expand → migrar → contract), unicidad por taller, motor por configuración, CHECK relajados, filtro por taller en toda lectura de reservas, prueba de dos talleres, guardia de literales.
2. Etapa 2 — identidad: perfil desde `shops`, marca Llave 15 para el personal y del taller para el cliente, `tokens.css`, el sistema deja de cargar la portada, remitente y copias por taller, y la identidad visual Llave 15 del manual de marca (BG-46 … BG-49).
3. Etapa 3 — reservas por taller: `/<slug>/reservar`, API con taller, Turnstile y límite por taller, enlaces a la página del taller.
4. Etapa 4 — separación y dominio: `APP_URL`, secreto propio del seguimiento, tareas por taller, sitio `web/vector-bikes/` con redirecciones, corte de dominio.
5. Etapa 5 — plataforma: administrador de plataforma, alta de talleres con primer dueño y plantilla de catálogo, suspensión, "Mi taller", `docs/nuevo-taller.md`.

### No-Objetivos — fuera de alcance
**El builder no implementa nada de esta tabla.** Si un paso parece requerirlo, es un defecto del blueprint: detenerse y reportarlo. Las filas "Tema" reproducen la cerca de FASE §2.3; las filas **Constante** son las interfaces congeladas de §5.

| No se construye | Por qué no ahora | Se revisa cuando |
|---|---|---|
| Cobro, planes, licencias, facturación a talleres | Es negocio (FASE §2.3) | Segundo taller interesado |
| Alta autoservicio de talleres | El administrador de plataforma da de alta a mano | — |
| Dominio propio por taller (`reservas.mitaller.cl`) | Certificados y DNS por taller | Fase posterior |
| Multi-sucursal | Un taller = una sucursal | Fase 4 |
| Otros países, monedas o impuestos | IVA, RUT, feriados y comunas son de Chile | — |
| App móvil | La tablet usa el navegador | — |
| Mercado Pago integrado, asistente de WhatsApp, Strava | Igual que hoy | Fase 3 |
| Catálogo de servicios compartido entre talleres | Cada taller tiene el suyo; se copia una plantilla al crear el taller | — |
| Portal de clientes con cuenta | El cliente usa enlaces con token | — |
| Términos con cada taller, política de privacidad de Llave 15, procedimiento de supresión (FASE §7) | Son documentos del dueño, no código | Antes del segundo taller real (checklist §20.1) |
| **Constante:** los enlaces de seguimiento, informe, aprobación y cancelación ya enviados siguen funcionando | FASE §13.5 | — |
| **Constante:** forma de las respuestas de `POST /api/reservas` (201 `{ code, service_date, start, end, mode, fee }`, errores `{ error, code, fields? }`) y de `GET /api/disponibilidad` (`{ timezone, modo, capacity, days }`) | Interfaz congelada (§5) | — |
| **Constante:** reglas de reserva de Vector Bikes (bloque 30, capacidad 4, antelación 120, horizonte 30, retiro 15.000 en Vitacura y Las Condes, horarios, código `VB-AAMMDD-HHMM`) | Viven en su fila de `shops` con los valores de hoy | El dueño las cambia en "Mi taller" |
| **Constante:** numeración de órdenes, ventas y compras por sucursal (`OT-`, `VM-`, `OC-`) | Ya es por sucursal | — |
| **Constante:** No negociables 1–19 de `CLAUDE.md` (stock por `applyStockMovement`, caja, costos solo con `costs.view`, nunca borrar, tokens con hash, mecánico sin precios, archivos < 400, funciones < 50, ninguna isla nueva en `/taller`, ningún hex fuera de `src/styles/tokens.css` (hasta BG-46 ningún hex nuevo; desde BG-47 la paleta del manual de marca, BG-D33), fotos por orden sin tope) | FASE §13.7 | — |
| Rediseño de `web/vector-bikes/` o de la portada heredada con la identidad Llave 15 | Es el sitio de Vector Bikes, con su propio diseño (BG-D32) | El dueño lo pide en `vector-bikes-web` |
| Modo oscuro de Llave 15 | El manual de marca no lo define (BG-D33) | El taller piloto lo pide |
| Reescribir los textos con la microcopia del manual | Es guía para pantallas nuevas; los textos de hoy los afirman las pruebas (BG-D39) | El dueño pide la reescritura |
| Logo definitivo de Llave 15 | Los originales no existen todavía; va un SVG provisional (BG-D37) | Llegan los originales (checklist §20.1) |
| **Constante:** biblioteca técnica global (BT-D1) y su paquete `library:export`/`library:import` | Se comparte entre talleres (decisión 12) | — |

### Métricas de éxito
| Métrica | Meta | Cómo se mide |
|---|---|---|
| Aislamiento | 0 cruces entre talleres | `pnpm test isolation` en verde en cada paso; `pnpm bg:check` sale 0 en producción |
| Paridad de Vector Bikes | Ningún valor esperado cambia en la etapa 1 | `node scripts/bg-expect-parity.ts --base 8bca898 --skip tests/integration/customers.test.ts` sale 0 en `bg-16` (BG-D43) |
| Enlaces antiguos | 100 % redirigen | `node web/vector-bikes/scripts/check-redirects.ts https://vectorbikes.cl` sale 0 después del corte |
| Criterio de término (FASE §1) | Un segundo taller opera un mes junto a Vector Bikes sin cruces | El dueño lo confirma (checklist §20.1) |

---

## 2. Stack

**Runtime track: el del repo.** Esta fase agrega una sola dependencia, `@fontsource-variable/inter` 5.3.0 (BG-47, BG-D34), y no actualiza ninguna (§11); `web/vector-bikes/` reutiliza los mismos paquetes y no usa Inter.

| Capa | Elección | Por qué esto y no lo otro |
|---|---|---|
| Lenguaje / runtime | TypeScript 6 sobre Node 24 | El del repo; Node quita tipos en `scripts/` |
| Framework | Astro 7 SSR (`@astrojs/node` standalone) | Patrón probado; rechazado: un framework nuevo para la plataforma |
| Multi-taller | Una base, una app, `branch_id` en toda tabla de operación + `shops` | Decisión 1; rechazado: base por taller (decisión 56, reemplazada) |
| Estilos | `tokens.css` (BG-22, mismos valores; desde BG-47 además `:root.l15`, solo claro) + `global.css` + `llave15.css` (BG-48, bajo `.l15`) + CSS del taller | FASE §9 (ningún color nuevo) hasta BG-46; desde BG-47, la paleta del manual de marca del dueño, solo en las superficies de Llave 15 (BG-D32, BG-D33) |
| Componentes | Servidor + formularios POST; única isla pública `BookingIsland` (ahora con props del taller) | Ninguna isla nueva en `/taller` |
| Base de datos | Postgres 16 de Replit (la de producción, sin mudarla) | Decisión 14 |
| Acceso a datos | Drizzle; reglas en CHECK e índices, sin triggers | `drizzle/` solo por `pnpm db:generate` |
| Auth | Sesión propia + `can(role, action)` + marca `is_platform_admin` | Decisión 7: la marca no es un quinto rol |
| Correo | Resend, dominio de envío `send.llave15.cl` | Decisión 10 |
| Segundo plano | `/api/tareas/*` (Make.com), una llamada para todos los talleres activos | Decisión 11 |
| Hosting | Replit actual = Llave 15 (`llave15.cl`); Replit nuevo = `vectorbikes.cl` | Decisión 14 |
| Sitio de Vector Bikes | `web/vector-bikes/`: Astro con portada y privacidad prerenderizadas y un endpoint comodín de redirecciones | Decisión 15 |
| Gestor | pnpm 12.4.2 vía corepack (en `.replit`, nunca `packageManager`) | El del repo |

### Chequeo de compatibilidad
Revisado contra `knowledge/stack-compatibility.md`: no hay combinación nueva; el stack es el de las fases 1 y 2. Riesgo propio: `$defaultFn` de Drizzle devolviendo un `sql` con subconsulta (BG-D3) — el insert lo emite literal; la coordinadora lo confirmó en `drizzle-orm` 0.45.2 (`insert.js`, línea 380: el resultado de `defaultFn` se usa tal cual si es un `SQL`) y la prueba de BG-03 lo vuelve a comprobar en PGlite (§20.2).

---

## 3. Estructura de directorios

```
bike-garage/  (hoy vector-bikes/)
├── CLAUDE.md · AGENTS.md · tsconfig.json · .claude/settings.json · .claude/rules/*.md
│   · .claude/skills/add-migration/SKILL.md                     # workspace/ (Bootstrap)
├── docs/ventanas/bg-v1.md (BG-05) · bg-v2.md (BG-08) · bg-v3.md (BG-11)
├── docs/corte-bike-garage.md (BG-40) · docs/nuevo-taller.md (BG-45)
├── drizzle/                                                    # solo pnpm db:generate (BG-03, 09, 10, 11)
├── e2e/global-setup.ts (BG-04, 33) · fixtures.ts (BG-33) · reservar-taller.spec.ts (BG-33)
├── scripts/bg-expect-parity.ts (BG-01) · vector-bikes-profile.ts (BG-04) · bg-backfill.ts (BG-05)
│   · bg-check.ts (BG-39) · platform-admin.ts (BG-45) · db-check.ts (BG-03)
├── package.json (BG-05, 39, 45: scripts; BG-47: la dependencia de Inter) · README.md (BG-45)
├── public/brand/llave15-{distintivo,firma,firma-invertida,firma-mono}.svg (BG-46) · llave15-favicon-16.svg (BG-47)
├── src/
│   ├── lib/time.ts (BG-02) · platform.ts (BG-17) · whatsapp.ts (BG-27) · env.ts (BG-34, 35)
│   │   · site.ts y faq.ts (se borran en BG-27)
│   ├── styles/tokens.css (BG-22, 47) · global.css (BG-22) · llave15.css (BG-48) · taller-components.css (BG-48)
│   │   · taller-layout.css (BG-49)
│   ├── layouts/AppLayout.astro (BG-22, 47, 48) · PublicLayout.astro (BG-22, 49) · TallerLayout.astro (BG-27, 41, 44, 49)
│   │   · Base.astro (BG-26, 27; se borra en BG-DC1)
│   ├── components/Landing.astro (BG-25, 26) · islands/{BookingIsland,booking-state,BookingFields,
│   │   BookingSchedule,BookingTicket,turnstile} (BG-25, 26, 30) · taller/ReportView.astro (BG-24)
│   ├── pages/[slug]/logo.ts (BG-17) · [slug]/reservar.astro · [slug]/privacidad.astro (BG-31)
│   │   · plataforma/index.astro (BG-41) · plataforma/talleres/nuevo.astro (BG-42) · [id].astro (BG-43)
│   │   · taller/mi-taller.astro (BG-44) · las páginas existentes que nombra cada paso
│   └── server/
│       ├── db/schema-shops.ts (BG-03, nuevo, cabeza) · schema.ts (BG-03, 09, 10, 11) · schema-taller.ts (BG-10)
│       ├── shops/scope.ts (BG-06, 29, 36) · profile.ts (BG-17) · backfill.ts (BG-05) · slugs.ts (BG-29)
│       │   · health.ts (BG-39) · platform-shops.ts (BG-41, 43) · create-shop.ts · catalog-copy.ts (BG-42)
│       │   · my-shop.ts (BG-44)
│       ├── booking/config.ts (BG-06, 28) · slots.ts · rules.ts (BG-02, 06, 28) · create-booking.ts
│       │   · day-state.ts · availability.ts (BG-07) · reschedule-booking.ts (BG-13)
│       ├── email/brand.ts (BG-17) · booking/templates.ts (BG-18) · garage/templates.ts (BG-19)
│       │   · templates.ts · notifications.ts · reminders.ts · order-templates.ts (BG-16, 18–21; templates.ts también BG-49)
│       ├── api/handlers.ts (BG-08, 30, 34) · turnstile.ts (BG-30) · task-handlers.ts (BG-36)
│       ├── admin/agenda.ts (BG-13) · month.ts (BG-14) · auth/admin-auth.ts (BG-41, 43)
│       │   · auth/permissions.ts (BG-44) · whatsapp/{service,order-notices,cron}.ts (BG-16, 36)
│       └── taller/ manual-booking (BG-12) · dashboard · indicators-customers · booking-reception
│                   · orders (BG-15) · reception · qc (BG-19) · quotes · part-notice (BG-20)
│                   · delivery-notice · maintenance-plan · maintenance (BG-21, 32) · tracking (BG-35)
│                   · label (BG-24) (.ts, modificados)
├── tests/unit/shop-literals.test.ts · shop-literals-baseline.json · bg-expect-parity.test.ts (BG-01)
│   · time.test.ts (BG-02) · vector-bikes-profile.test.ts (BG-04; reescrita en BG-27) · island-shop.test.ts (BG-25)
│   · reserved-slugs.test.ts (BG-29) · llave15-brand.test.ts (BG-46)
├── tests/helpers/shops.ts · pglite.ts (BG-04; shops.ts gana el accesorio `SITE` y `vectorBikesBrand()` en BG-18)
│   · two-shops.ts (BG-07)
├── tests/integration/<archivo>.test.ts                         # uno nuevo por paso; las de aislamiento terminan en -isolation
└── web/vector-bikes/                                           # decisión 15; sale a vector-bikes-web en BG-DC4
    ├── package.json · astro.config.mjs · tsconfig.json · vitest.config.ts   # workspace/ (§19.6)
    ├── src/content/site.ts (BG-26) · layouts/SiteLayout.astro · components/Home.astro
    │   · pages/index.astro · styles/site.css (BG-37) · pages/privacidad.astro · pages/[...path].ts
    │   · lib/redirects.ts (BG-38)
    ├── public/ (copias de public/brand/*, favicon.svg y robots.txt; BG-37, 38)
    ├── scripts/check-redirects.ts (BG-38) · test-web.sh (BG-39)
    └── tests/content.test.ts (BG-37) · redirects.test.ts (BG-38)
```

**Reglas de frontera.** Las de `CLAUDE.md` siguen, con tres agregados (BG-D14, BG-D22): `src/server/shops/**` es parte de `src/server/**`; `web/vector-bikes/**` nunca importa `src/**` ni `src/` importa `web/**`, **salvo** `src/layouts/Base.astro`, `src/components/Landing.astro`, `src/pages/index.astro` y `src/pages/privacidad.astro`, que importan `web/vector-bikes/src/content/site.ts` hasta BG-DC1; `e2e/global-setup.ts` puede importar además `scripts/vector-bikes-profile.ts`. La convención de importación se reconcilia en §19.6.

### Delta
- **Nuevos:** `schema-shops.ts`, 9 módulos en `src/server/shops/`, `booking/config.ts`, `email/brand.ts`, `email/booking/templates.ts`, `email/garage/templates.ts`, `lib/time.ts`, `lib/platform.ts`, `lib/whatsapp.ts`, `styles/tokens.css`, `styles/llave15.css`, `AppLayout.astro`, `PublicLayout.astro`, 5 SVG provisionales de la marca en `public/brand/`, 7 páginas, 5 scripts, 1 spec, 5 documentos, la app `web/vector-bikes/` y las pruebas de cada paso.
- **Modificados:** los archivos que nombra cada paso de §9 (el mapa de acoplamiento de FASE §6 completo), `package.json` (scripts y, en BG-47, la dependencia de Inter), `pnpm-lock.yaml` (BG-47), `.env.example`, `README.md`, `e2e/global-setup.ts` y `e2e/fixtures.ts` (BG-D19), y las pruebas existentes con cambios declarados de firma, siembra o import.
- **Eliminados:** `src/lib/site.ts` y `src/lib/faq.ts` (BG-27); los literales del taller en `src/`. En BG-DC1, la portada heredada del sistema. Ninguna fila de la base se borra.

---

## 4. Modelo de datos

Reglas (`database.md`): `id uuid defaultRandom()`, timestamps con los helpers de su archivo, dinero `integer` CLP, FKs `restrict`, CHECK con SQL literal, sin triggers, nombres de restricción con el prefijo de su tabla.

### Entidades (paso que crea entre paréntesis)

**`schema-shops.ts`** (nuevo, cabeza de la cadena, `shopTables`, BG-03; no importa ningún otro archivo de esquema y define sus propios `instant`/`createdAt`/`updatedAt`, BG-D1)
- `shops`: `slug text not null`, `name text not null`, `legal_name text`, `rut text`, `email text not null`, `notify_email text not null`, `phone text not null`, `phone_display text not null`, `street_address text not null`, `address_short text not null` (BG-D9), `locality text not null`, `region text not null`, `maps_url text`, `instagram_url text`, `logo_key text` (clave de almacenamiento, BG-D10), `certifications text[] not null default '{}'` (BG-D9), `timezone text not null default 'America/Santiago'`, `reception_hours jsonb not null`, `pickup_hours jsonb not null` (forma `{ "1": { "open": "HH:MM", "close": "HH:MM" } | null, …, "7": … }`, validada con zod en `booking/config.ts`), `daily_capacity integer not null`, `block_minutes integer not null`, `min_notice_minutes integer not null`, `horizon_days integer not null`, `pickup_enabled boolean not null default false`, `pickup_fee_clp integer not null default 0`, `pickup_comunas text[] not null default '{}'`, `code_prefix text not null`, `status text not null default 'activo'`, timestamps.
  Únicos `uq_shops_slug (slug)`, `uq_shops_code_prefix (code_prefix)`. CHECK: `shops_slug_check` `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 40`; `shops_status_check` `status in ('activo', 'suspendido')`; `shops_capacity_check` `daily_capacity between 1 and 20`; `shops_block_minutes_check` `block_minutes in (15, 20, 30, 45, 60)`; `shops_notice_check` `min_notice_minutes between 0 and 10080`; `shops_horizon_check` `horizon_days between 1 and 120`; `shops_pickup_fee_check` `pickup_fee_clp >= 0`; `shops_pickup_check` `not pickup_enabled or cardinality(pickup_comunas) > 0`; `shops_code_prefix_check` `code_prefix ~ '^[A-Z]{2,4}$'`; `shops_timezone_check` `timezone = 'America/Santiago'` (BG-D12).

**`schema.ts`** (BG-03 expand; BG-09, BG-10, BG-11 contract)
- `branches` + `shop_id uuid → shops restrict` (nulable en BG-03, NOT NULL en BG-09), con el valor por defecto de compatibilidad `onlyShopId` (BG-D3).
- `users` + `is_platform_admin boolean not null default false` (BG-03).
- `bookings`, `booking_bikes`, `booking_blocks`, `booking_days`, `blocked_periods`, `booking_requests`, `whatsapp_messages` + `branch_id uuid → branches restrict` (nulable en BG-03, NOT NULL en BG-09), con el valor por defecto de compatibilidad `onlyBranchId` (BG-D3).
- Índices nuevos no únicos (BG-03): `idx_bookings_branch_service_date (branch_id, service_date)`, `idx_booking_blocks_branch_service_date (branch_id, service_date)`, `idx_blocked_periods_branch_service_date (branch_id, service_date)`, `idx_booking_requests_branch_ip_created (branch_id, ip_hash, created_at)`.
- `booking_days`: PK pasa de `service_date` a (`branch_id`, `service_date`) (BG-09).
- Índices únicos recreados **con el mismo nombre** (BG-10, BG-D11): `uq_bookings_code (branch_id, code)`, `uq_booking_blocks_active_slot (branch_id, service_date, block_start) where is_active = true`, `uq_branches_name (shop_id, name)`; en `schema-taller.ts`, `uq_customers_rut (branch_id, rut) where rut is not null`.
- CHECK relajados (BG-11): `bookings_fee_check` `(mode = 'taller' and pickup_fee_clp = 0) or (mode = 'retiro' and pickup_fee_clp >= 0)`; `bookings_retiro_address_check` `mode = 'taller' or (length(trim(comuna)) > 0 and address is not null)`. Los valores del taller se validan con zod desde `shops` (decisión 13).

### Relaciones
shops 1—1 branches (en esta fase; FASE decisión 4) · branches 1—N users, bookings y todas las tablas de operación · bookings 1—N booking_blocks, booking_bikes, whatsapp_messages · booking_days por (sucursal, fecha). Borrado: `restrict` en todo; nada se borra.

### Índices
| Tabla | Índice | Por qué |
|---|---|---|
| `shops` | `uq_shops_slug`, `uq_shops_code_prefix` | Página `/<slug>/reservar`; códigos de reserva legibles por taller |
| `bookings` | `(branch_id, service_date)`; `uq_bookings_code (branch_id, code)` | Agenda y disponibilidad por taller; código único por taller |
| `booking_blocks` | `uq_booking_blocks_active_slot (branch_id, service_date, block_start) where is_active` | No negociable 1, ahora por taller |
| `booking_days` | PK (`branch_id`, `service_date`) | Lock del día por taller |
| `booking_requests` | `(branch_id, ip_hash, created_at)` | Límite de solicitudes por taller (BG-30) |
| `branches` | `uq_branches_name (shop_id, name)` | Nombres por taller |
| `customers` | `uq_customers_rut (branch_id, rut)` | El mismo cliente puede estar en dos talleres |

### Schema
Patrón obligatorio de `schema-shops.ts` (BG-03); el resto de columnas y CHECK según la lista de arriba:

```ts
import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// Cabeza de la cadena: no importa otros archivos de esquema (BG-D1).
const instant = (name: string) => timestamp(name, { withTimezone: true });

export type WeekHours = Record<string, { open: string; close: string } | null>;

export const shops = pgTable(
  "shops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    // … columnas de §4 en este orden …
    receptionHours: jsonb("reception_hours").$type<WeekHours>().notNull(),
    pickupComunas: text("pickup_comunas").array().notNull().default(sql`'{}'::text[]`),
    codePrefix: text("code_prefix").notNull(),
    status: text("status").notNull().default("activo"),
    createdAt: instant("created_at").notNull().defaultNow(),
    updatedAt: instant("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("uq_shops_slug").on(t.slug),
    uniqueIndex("uq_shops_code_prefix").on(t.codePrefix),
    check("shops_status_check", sql`status in ('activo', 'suspendido')`),
    // … el resto de CHECK de §4 …
  ],
);

export const shopTables = [shops] as const;

/** BG-D3: con exactamente un taller, una sucursal nueva sin `shopId` se enlaza a él; con dos, queda null. */
export const onlyShopId = () => sql`(select "id" from "shops" where (select count(*) from "shops") = 1)`;
```

En `schema.ts` (BG-03), el mismo patrón para las tablas de reserva:

```ts
/** BG-D3: con exactamente una sucursal, una fila nueva sin `branchId` se enlaza a ella; con dos, queda null. */
const onlyBranchId = () =>
  sql`(select "id" from "branches" where (select count(*) from "branches") = 1)`;

const bookingBranchReference = () =>
  uuid("branch_id")
    .references((): AnyPgColumn => branches.id, { onDelete: "restrict" })
    .$defaultFn(onlyBranchId);
// BG-09 agrega .notNull() a esta función y a branches.shopId.
```

### Migraciones
`pnpm db:generate` emite el SQL con nombre elegido por drizzle-kit ("la migración que emite `pnpm db:generate`"). Cinco generaciones: BG-03 (aditiva: tabla, columnas nulables, índices no únicos), BG-09 en dos (`SET NOT NULL` con `DROP TABLE "booking_days"`, y `booking_days` de nuevo con su PK compuesta; BG-D42), BG-10 (índices únicos reemplazados), BG-11 (dos CHECK reemplazados). Nunca `--custom`, nunca editar `drizzle/`; si drizzle-kit pregunta algo, detenerse. Los datos se migran con un script TypeScript idempotente (`pnpm bg:backfill`, BG-05), no con SQL. `pnpm db:migrate` solo contra la base dev. Replit propaga el esquema al publicar, sin datos y sin correr `drizzle/` (`database.md`). Ventanas: V-BG1 (expand, `bg-05`), V-BG2 (migrar datos + código con alcance, `bg-08`), V-BG3 (contract: las tres migraciones de BG-09, BG-10 y BG-11, `bg-11`) (BG-D5).

### Datos iniciales
Producción: `pnpm bg:backfill --logo public/brand/vector-bikes-logo.png` crea el taller `vector-bikes` con los valores de hoy (`scripts/vector-bikes-profile.ts`; el correo de avisos sale de `SHOP_NOTIFY_EMAIL` de producción), enlaza la sucursal y completa `branch_id` en las siete tablas (V-BG2). Pruebas: `createTestDb()` siembra el taller Vector Bikes (sin sucursal); `createBookingTestDb()` además la sucursal `Vitacura`; `seedTwoShops()` agrega el Taller Demo (`tests/helpers/shops.ts`, `two-shops.ts`). E2E: `global-setup.ts` siembra el taller y su sucursal (BG-04) y el Taller Demo E2E (BG-33).

Perfil literal de Vector Bikes (`scripts/vector-bikes-profile.ts`, BG-04), copiado de `src/lib/site.ts` y `src/server/booking/rules.ts` en `8bca898`:

```ts
const weekdays = { open: "15:00", close: "20:00" };
const pickupWeekdays = { open: "09:00", close: "20:00" };
const saturday = { open: "10:00", close: "14:00" };

export const VECTOR_BIKES_PROFILE = {
  slug: "vector-bikes",
  name: "Vector Bikes",
  legalName: null,
  rut: null,
  email: "info@vectorbikes.cl",
  notifyEmail: "info@vectorbikes.cl",
  phone: "+56985095780",
  phoneDisplay: "+56 9 8509 5780",
  streetAddress: "Avenida Kennedy 7666",
  addressShort: "Av. Kennedy 7666, Vitacura",
  locality: "Vitacura",
  region: "Región Metropolitana",
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Avenida+Kennedy+7666+Vitacura",
  instagramUrl: "https://instagram.com/vector.bikes",
  certifications: [],
  timezone: "America/Santiago",
  receptionHours: { "1": weekdays, "2": weekdays, "3": weekdays, "4": weekdays, "5": weekdays, "6": saturday, "7": null },
  pickupHours: { "1": pickupWeekdays, "2": pickupWeekdays, "3": pickupWeekdays, "4": pickupWeekdays, "5": pickupWeekdays, "6": saturday, "7": null },
  dailyCapacity: 4,
  blockMinutes: 30,
  minNoticeMinutes: 120,
  horizonDays: 30,
  pickupEnabled: true,
  pickupFeeClp: 15000,
  pickupComunas: ["Vitacura", "Las Condes"],
  codePrefix: "VB",
  status: "activo",
} as const;
```
(Las dos líneas de horarios las parte `pnpm format` según el ancho de 100.)

Perfil del Taller Demo (`tests/helpers/shops.ts`, `DEMO_SHOP_PROFILE`, BG-04): `slug` `taller-demo`, `name` `Taller Demo`, `email` `hola@tallerdemo.cl`, `notifyEmail` `avisos@tallerdemo.cl`, `phone` `+56911112222`, `phoneDisplay` `+56 9 1111 2222`, `streetAddress` `Avenida Irarrázaval 1000`, `addressShort` `Av. Irarrázaval 1000, Ñuñoa`, `locality` `Ñuñoa`, `region` `Región Metropolitana`, `instagramUrl` `https://instagram.com/tallerdemo`, `certifications` `[]`, horarios de recepción y retiro lunes a viernes `10:00`–`13:00` (sábado y domingo `null`), `dailyCapacity` 2, `blockMinutes` 60, `minNoticeMinutes` 60, `horizonDays` 14, `pickupEnabled` true, `pickupFeeClp` 9000, `pickupComunas` `["Ñuñoa", "Providencia"]`, `codePrefix` `TD`.

Accesorio de prueba `SITE` (`tests/helpers/shops.ts`, BG-18): un objeto con exactamente los campos y valores de la constante `SITE` de `src/lib/site.ts` en `8bca898` (copiados al escribir el paso con `git show 8bca898:src/lib/site.ts`). Existe para que las pruebas existentes que leen `SITE.name`, `SITE.url` u otro campo cambien solo su línea de import cuando `src/lib/site.ts` desaparece; vive en `tests/`, fuera del alcance de la guardia.

### Delta
+1 tabla (`shops`); +1 columna en `branches` y en `users`; +1 columna `branch_id` en siete tablas; PK de `booking_days` compuesta; 4 índices únicos redefinidos con el mismo nombre; 2 CHECK relajados; 4 índices no únicos nuevos.

---

## 5. Diseño de API

### Conventions
- Funciones de dominio: `(db, actor, …, now)` → `{ ok: true, … } | { ok: false, code }`; solo lo inesperado lanza.
- **Alcance del taller (BG-D4):** toda función que lee o escribe reservas recibe un `BookingScope = { shopId, slug, branchId, config }` o la sucursal (`branchId`) como **último argumento opcional**. Si falta, `singleShopScope(db)` usa el único taller con su única sucursal y **lanza `ShopScopeError`** (`ambiguous` o `missing`) cuando hay dos o ninguno: con un taller todo funciona como hoy; con dos, cualquier camino que olvidó el alcance falla fuerte en vez de cruzar datos. Las páginas y los handlers siempre pasan el alcance explícito; la prueba de dos talleres lo comprueba por pantalla y por tarea.
- Códigos nuevos: `shop_not_found` (404), `ambiguous` (backfill), `forbidden`, `validation_error`.
- Páginas `/plataforma/**` y `/taller/mi-taller`: sesión → marca o permiso → zod → `src/server/shops/**`; POST con `isAllowedOrigin` y 303 a `?hecho=<acción>`.
- Mensaje de comunas: `Elige ` + las comunas del taller unidas con `, ` y la última con ` o ` + `.` (`Elige Vitacura o Las Condes.` para Vector Bikes, igual que hoy).
- Remitente: `<nombre del taller> · Llave 15 <dirección de EMAIL_FROM>`; `Reply-To` = `shops.email`; copias al taller → `shops.notify_email`; pie `Gestionado con Llave 15` en todo correo (BG-D16).

### Routes
| Método | Ruta | Descripción | Auth | Límite |
|---|---|---|---|---|
| GET | `/<slug>/reservar` | Reserva pública del taller (BG-31) | pública | — |
| GET | `/<slug>/privacidad` | Aviso de privacidad del taller (BG-31) | pública | — |
| GET | `/<slug>/logo` | Logo del taller desde el almacenamiento (BG-17) | pública | `cache-control: public, max-age=86400` |
| GET | `/api/disponibilidad?desde&dias&modo&taller` | Igual que hoy + `taller` (BG-30) | pública | 1–31 días |
| POST | `/api/reservas` | Igual que hoy + campo `taller` (BG-30) | Turnstile con `cdata` = slug | 5 por IP y taller cada 10 min |
| POST | `/api/tareas/*` | Recorren todos los talleres activos (BG-36) | Bearer `TASKS_SECRET` | — |
| GET/POST | `/plataforma`, `/plataforma/talleres/nuevo`, `/plataforma/talleres/[id]` | Lista, alta, suspensión y uso (BG-41–43) | `is_platform_admin` | — |
| GET/POST | `/taller/mi-taller` | Perfil y configuración del taller (BG-44) | `shop.manage` (dueño) | logo ≤ 2 MB |

### Critical endpoints
- **`createBooking(db, input, now, scope?)`** (BG-07, BG-11): igual que hoy, con `booking_days` (`branch_id`, `service_date`) `FOR UPDATE` → advisory lock por teléfono; límite de teléfono, bloques, cupo y código (`<code_prefix>-AAMMDD-HHMM`, correlativo por sucursal) por sucursal; tarifa `scope.config.pickupFeeClp` en retiro.
- **`handleCreateBooking(request, ctx)`** (BG-08, BG-30): rate limit por (sucursal, IP) → zod con la configuración del taller → Turnstile (`cdata` = slug) → transacción → correos post-commit. `taller` desconocido, reservado o suspendido → 404 `shop_not_found` sin registrar el intento.
- **`backfillFirstShop(db, input, now)`** (BG-05): idempotente, una transacción; logo al almacenamiento antes de la fila.
- **`createShop(db, actor, input, now)`** (BG-42): solo `is_platform_admin`; una transacción: taller, sucursal, dueño (scrypt), copia del catálogo del taller plantilla.

### Delta
Nuevas: las rutas de la tabla y los módulos de `src/server/shops/**`. Modificadas: `createBooking`, `readDay`, `readRange`, `rescheduleBooking`, `agendaForDate`, `bookingDetail`, `applyAdminAction`, `listUpcomingBlocks`, `createBlock`, `deleteBlock`, `monthOverview`, `listUpcomingBookings`, `freeBlocks`, `createManualBooking`, `sendReminders`, `sendPendingReminders`, `listNotices` (alcance opcional al final); `computeDay`, `checkStart`, `gridForDate`, `calendarClosure`, `hoursFor` (configuración opcional hasta BG-28, obligatoria después); plantillas de correo (marca como primer argumento); `isAllowedOrigin` (dos orígenes); `trackingTokenFor` (secreto propio con reemisión del token heredado).

### Interfaces held constant
| Interfaz | Garantía | Prueba |
|---|---|---|
| Respuestas de `POST /api/reservas` y `GET /api/disponibilidad` | Misma forma; solo se agrega el parámetro opcional `taller` | `api.test.ts` sin cambios; `api-by-shop.test.ts` |
| Enlaces enviados antes de la etapa 4 | `/seguimiento`, `/informe`, `/aprobacion`, `/reservas/cancelar` siguen en el mismo sistema; en `vectorbikes.cl` redirigen con 301/308 conservando ruta y consulta; el token de seguimiento heredado se sigue aceptando y reemitiendo | `tracking*.test.ts`, `tracking-secret.test.ts`, `redirects.test.ts`, `check-redirects.ts` |
| Reglas de reserva de Vector Bikes | Las de hoy, desde su fila de `shops` | `create-booking.test.ts`, `concurrency.test.ts`, `slots.test.ts` sin cambios de valores |
| Numeración `OT-`, `VM-`, `OC-` y código `VB-AAMMDD-HHMM` | Por sucursal, igual que hoy | `work-orders.test.ts`, `sales.test.ts`, `create-booking.test.ts` |
| Nombres de índices y restricciones existentes | Se conservan (BG-D11) | `users-schema.test.ts`, `customers.test.ts` |
| `SessionUser` de un usuario sin la marca | El mismo objeto de hoy | `admin-auth.test.ts` sin cambios |

---

## 6. Arquitectura de frontend

### Routes
| Ruta | Página | Datos | Auth |
|---|---|---|---|
| `/<slug>/reservar` | Reserva del taller (BG-31) | `scopeBySlug`, `profileBySlug` | pública |
| `/<slug>/privacidad` | Privacidad del taller (BG-31) | `profileBySlug` | pública |
| `/seguimiento/[token]`, `/informe/[token]`, `/aprobacion/[token]`, `/reservas/cancelar` | `PublicLayout` con la marca del taller (BG-23, 24) | `profileForShareToken`, `profileForCancelToken` | token |
| `/plataforma`, `/plataforma/talleres/nuevo`, `/plataforma/talleres/[id]` | Administración de plataforma (BG-41–43) | `platform-shops.ts`, `create-shop.ts` | `is_platform_admin` |
| `/taller/mi-taller` | Mi taller (BG-44) | `my-shop.ts` | `shop.manage` |
| `/`, `/privacidad` | Portada heredada de Vector Bikes, prerenderizada, con el contenido de `web/vector-bikes/src/content/site.ts` hasta BG-DC1 | — | pública |

### Rendering strategy
`/taller/**`, `/admin/**`, `/plataforma/**`, `/<slug>/**` y páginas por token con `prerender = false` y `cache-control: no-store`; `/` y `/privacidad` siguen prerenderizadas. Layouts: `AppLayout` (raíz del sistema: fuentes, `tokens.css`, `global.css`, sin FAQ, JSON-LD ni wordmark; desde BG-47 `class="l15"` en `<html>`, Inter y los íconos de Llave 15; desde BG-48 `llave15.css`) ← `TallerLayout` (personal, marca `PLATFORM`) y `PublicLayout` (cliente, marca del taller, pie `Gestionado con Llave 15`). `Base.astro` queda solo para la portada heredada (BG-D15).

### Component hierarchy
```
PublicLayout (servidor; profile → encabezado con logo /<slug>/logo o nombre; pie "Gestionado con Llave 15", desde BG-49 "<Taller> · Gestionado con Llave 15")
└─ [slug]/reservar.astro (servidor)
   └─ BookingIsland (client:visible; props shop = { slug, name, addressShort, pickupEnabled,
      pickupComunas, pickupFeeClp, horizonDays, blockMinutes, codePrefix, privacyHref })
      ├─ ShopContext (Preact) → BookingFields · BookingSchedule · BookingTicket
      └─ turnstile.ts (cdata = slug)
```

### State management
Isla de reserva: el estado de hoy (`booking-state.ts`) con la configuración del taller en props y contexto; envía `taller` en la consulta y en el cuerpo (BG-30). Todo lo demás en el servidor; cada POST recarga.

### Loading, empty, and error states
Como hoy. Nuevos: `/<slug>/reservar` de un taller desconocido o suspendido → 404; `/plataforma` sin talleres → "No hay talleres."; errores de formulario con `role="alert"` y `aria-invalid`; resultados con `role="status"`; estado de taller con `span.status` + texto (`Activo`, `Suspendido`), nunca solo color.

---

## 7. Sistema de diseño

**Por paso (BG-D32 … BG-D40).** Hasta BG-46 se mantiene el sistema monocromo aprobado (tabla literal en `workspace/CLAUDE.md`, `docs/design-preview.html`): **ningún token ni hex nuevo** (FASE §9); los nueve tokens pasan de `global.css` a `src/styles/tokens.css` con los mismos valores (BG-22) y `global.css` lo importa. Desde BG-47, todo lo que carga `AppLayout` (ingreso, `/taller`, `/admin`, `/plataforma` y las páginas del cliente en `PublicLayout`) lleva `class="l15"` en `<html>` y usa la identidad Llave 15 del manual de marca del dueño (`docs/marca/Manual_de_marca_Llave_15.docx`, `docs/marca/llave15-portada.png`, `llave15-variantes.png`, `llave15-muestra-orden.png`), por partes y nunca antes: tokens y tipos en BG-47, componentes y estados en BG-48, layouts y firma en BG-49. La portada heredada (`Base.astro`, sin la clase) y `web/vector-bikes/` conservan el monocromo. En lo que ve el cliente, el nombre o el logo del taller sigue siendo el identificador principal y Llave 15 solo firma.

### Colors
Hasta BG-46: los nueve tokens, claro y oscuro, sin cambios; contraste ya medido en la fase 1. Desde BG-47, bloque `:root.l15` de `tokens.css`, solo claro (los dos bloques oscuros pasan a `:not(.l15)`, BG-D33), hex en minúsculas:

| Token | Valor | Uso | Contraste (manual) |
|---|---|---|---|
| `--ground` | `#f5f4f1` blanco cálido | Fondo de la app | texto principal sobre él 15,58:1 |
| `--surface` | `#ffffff` blanco | Tarjetas, formularios, tablas | — |
| `--ink` | `#171c22` grafito | Texto principal; desde BG-49 el menú del personal | — |
| `--ink-2`, `--steel` | `#515a64` gris acero | Texto secundario, etiquetas, ayudas | 7,01:1 sobre blanco |
| `--rule` | `#d9d9d9` | Bordes decorativos | — |
| `--field-border` | `#858e97` | Borde de controles | 3,02:1 |
| `--on-ink` | `#ffffff` | Texto sobre grafito y sobre `--accent` | 6,25:1 sobre `--accent` |
| `--hatch` | `#e3e3df` (el de hoy) | Rayado reservado/deshabilitado | — |
| `--accent` · `--accent-hover` | `#ae3718` naranja óxido · `#8d2b13` óxido oscuro | Botón primario y su hover | — |
| `--brand-on-dark` | `#ff774f` naranja claro | Marca sobre grafito | — |
| `--focus` | `#195faf` azul de foco | Anillo de foco sobre claro (sobre oscuro, `--on-ink`) | 6,37:1 |
| `--status-neutral-bg` · `-ink` | `#eceff2` · `#48525d` | Neutro: `reservada`, `recibida`, `entregada`, `cancelada` | — |
| `--status-progress-bg` · `-ink` | `#e6eef8` · `#235285` | En curso: `diagnostico`, `en_reparacion`, `control_calidad` | — |
| `--status-waiting-bg` · `-ink` | `#fff2d9` · `#734800` | Espera: `esperando_aprobacion`, `esperando_repuesto` | — |
| `--status-ready-bg` · `-ink` | `#dfefe5` · `#1a5d3b` | Listo: `lista_para_retirar` | — |
| `--status-blocking-bg` · `-ink` | `#fbe5e2` · `#942b2b` | Bloqueo: `trabajo_rechazado` y el aviso de saldo pendiente para entregar | — |
| `--radius-control` · `--radius-card` | `8px` · `12px` | Controles · tarjetas (desde BG-48) | — |

Son 19 hex nuevos (todos menos `#ffffff` y `#e3e3df`, que ya existían). Hex solo en `tokens.css`; los SVG de `public/brand/llave15-*.svg` llevan la paleta literal porque un `<img>` no lee variables CSS. El mapa de cada clase de estado de inventario, caja, biblioteca y plataforma a los cinco grupos está en BG-48 y en `.claude/rules/ui-design.md` (BG-D36).

### Typography
Hasta BG-46: Michroma (h1), Archivo Variable (cuerpo), IBM Plex Mono para códigos (`VB-…`, `TD-…`), montos y `slug`. Desde BG-47, en `AppLayout`: Inter Variable 400/500/600/700 (`@fontsource-variable/inter` 5.3.0), respaldo Arial, sans-serif, también para códigos y montos (`--display`, `--body` y `--mono` de `:root.l15`); desde BG-48, 28/36 títulos, 20/28 secciones, 16/24 cuerpo y 14/20 datos densos; `tabular-nums` en montos y tablas. El logotipo (DIN Condensed Bold en el manual) va en trazos dentro del SVG: esa fuente nunca se carga (BG-D34).

### Spacing, radius, elevation
Hasta BG-47: radio 2px, reglas 1px, sin sombras. Desde BG-48: espaciado en múltiplos de 4px, radio 8px en controles (`--radius-control`) y 12px en tarjetas (`--radius-card`), reglas 1px, sin sombras (BG-D35). Siempre: objetivos ≥ 48px en `/taller` y `/plataforma`, ≥ 44px en lo público.

### Motion
`--dur-fast` 140ms, `--dur` 160ms; `prefers-reduced-motion` → 0ms. Nada nuevo anima.

### Component style
Botón primario: hasta BG-47, `--ink` que invierte en hover; desde BG-48, `--accent` + `--on-ink` con hover `--accent-hover`, una acción primaria por zona de trabajo y las secundarias neutras (`.btn.ghost`). Foco: hasta BG-47, 2px `--ink` separado 3px; desde BG-48, 2px `--focus` separado 2px, blanco sobre grafito. Estados: su forma y su texto de siempre y, desde BG-48, el color de su grupo (BG-D36); nunca solo color. Logo del taller en lo que ve su cliente (`/<slug>/logo`; sin logo, el nombre). Marca de Llave 15: hasta BG-47, "Llave 15" en texto en lo del personal; desde BG-48, la firma principal en `/admin/login`; desde BG-49, el menú del personal en grafito con la firma invertida (`/brand/llave15-firma-invertida.svg`, `alt="Llave 15"`, 132px). Pie público: hasta BG-48, `Gestionado con Llave 15` en `--steel`; desde BG-49, el distintivo decorativo de 24px + `<Taller> · Gestionado con Llave 15`, la misma línea que el pie de los correos. Logo provisional dibujado desde el manual, hasta que lleguen los originales (BG-D37). Iconos lineales de una sola familia y con texto en las acciones poco familiares: guía del manual para pantallas nuevas, igual que su tabla de microcopia (BG-D39).

---

## 8. Autenticación y autorización

### Provider
Sesión propia existente (`vb_admin_session`), sin cambios de nombre. Desde BG-34 la cookie se emite con `secure` según `APP_URL`; es una cookie de host, una por dominio durante la convivencia.

### Flows
`requireAdmin` → `can` → zod → dominio en cada página. Desde BG-43, `requireAdmin` rechaza a los usuarios de un taller `suspendido` igual que a un usuario inactivo. `/plataforma/**`: sesión + `isPlatformAdmin`.

### Route protection
| Superficie | Regla | Dónde |
|---|---|---|
| `/taller/**`, `/admin/**` | sesión + acción; toda consulta filtra por `user.branchId` | cada página + dominio |
| `/plataforma/**` | sesión + `is_platform_admin`; solo metadatos y conteos, nunca filas de clientes | `platform-shops.ts` |
| `/taller/mi-taller` | `shop.manage` (solo `owner`) | `my-shop.ts` |
| `/<slug>/**`, `/api/reservas`, `/api/disponibilidad` | taller `activo` por `slug` | `scopeBySlug` |
| Páginas por token | el token es la credencial; el perfil sale del token | `profile.ts` |

**Regla:** la autorización se decide en el servidor en cada petición; ocultar un enlace no es un permiso. La marca `is_platform_admin` **no** abre datos de otro taller: para operar un taller hace falta un usuario en ese taller (decisión 7).

### Roles and permissions
| Acción | owner | admin | reception | mechanic |
|---|---|---|---|---|
| `shop.manage` (nueva, BG-44) | ✓ | — | — | — |

Las 36 acciones existentes no cambian. `is_platform_admin` es una marca aparte, además curador de la biblioteca (decisión 12; BG-41).

### Sessions
Sin cambios, salvo: suspender un taller revoca las sesiones de sus usuarios (BG-43); `pnpm platform:admin` revoca las del usuario marcado (BG-45).

### Multi-tenancy / row-level isolation
**Toda** consulta a una tabla de operación filtra por la sucursal del alcance (`scope.branchId` o `actor.branchId`); toda fila nueva lleva esa `branch_id`. Las tareas sin actor recorren `activeShopScopes(db)` y procesan cada taller con su alcance (BG-36). La prueba de dos talleres (`tests/helpers/two-shops.ts`, archivos `*-isolation.test.ts`) siembra Vector Bikes y el Taller Demo con datos parecidos y verifica, pantalla por pantalla y tarea por tarea, que nada cruza; corre en `pnpm test` y por lo tanto en `pnpm gate` (`pnpm test isolation` la corre sola). Defensa adicional: los valores por defecto de compatibilidad (BG-D3) y `singleShopScope` (BG-D4) fallan con dos talleres.

---

## 9. ORDEN DE CONSTRUCCIÓN

### Reglas de un paso
1. Una sesión por paso; **≤ 5 archivos escritos a mano** (lo generado en `drizzle/` no cuenta). Las pruebas existentes que solo cambian **por firma, por siembra o por su línea de import** se listan aparte en el paso y no cuentan (BG-D6): su cambio es mecánico y `node scripts/bg-expect-parity.ts` comprueba que ninguna expectativa cambió. **Excepciones declaradas** (mecánicas, F2-D2 como precedente): BG-04 (siembra), BG-27 (marca del personal y fin de `SITE`), BG-28 (limpieza del motor) y BG-34 (`APP_URL` en sus llamadas); `package.json` y `pnpm-lock.yaml` cambiados solo por un comando `pnpm add` declarado (BG-47) tampoco cuentan (BG-D34). ≤ 6 criterios.
2. Pruebas primero, en rojo; después la implementación. Cada paso lleva Archivos, Hacer, Reglas, Done when, Verify y Checkpoint; la dirección completa está en su épica, que es autocontenida.
3. Verify es shell POSIX literal desde la raíz; toda línea sale 0 cuando el paso es correcto; los fallos esperados afirman su código. La última línea siempre es `pnpm format && pnpm gate   # expect: exit 0`. El sandbox de Codex corre solo `format`, `check`, `test` y `build`; `db:migrate`, `db:check`, `bg:backfill`, `bg:check`, `test:tablet`, `test:web`, `smoke` y `gate` los corre la sesión coordinadora.
4. Ningún Verify afirma estado de commit: los `git` de Verify comparan el árbol de trabajo contra `HEAD` o contra `8bca898`, y comprueban que `git` respondió antes de leer su salida.
5. Un paso no está hecho hasta que su Verify pasa y `pnpm gate` sigue en verde. La regresión de lo anterior la cubren `pnpm gate` y §20.1.
6. **Checkpoint:** `git add -- <archivos del paso>` (en pasos de esquema también `drizzle`, después de la guarda de duplicados de iCloud; en las excepciones, `git add -u -- <carpetas>` + los archivos nuevos por nombre), luego `git commit -m "<tipo>: bg-NN <descripción en inglés>" && git tag bg-NN` (sin trailers). **Nunca `git add -A`** (BG-D29). Reversión: `git reset --hard bg-<NN-1>` y, si el paso migró la base dev, reiniciarla con el comando de §12 (lo aprueba el operador).
7. Nunca saltar adelante; un paso bloqueado se reporta.
8. Pasos de esquema: editar → `pnpm db:generate` (si pregunta, detenerse) → pruebas PGlite → `pnpm db:migrate` → `pnpm db:check`.
9. **Cada paso relee los archivos que toca**; los conteos de líneas citados son orientativos; el criterio es "< 400" sobre el archivo real.
10. **Ningún dato de un taller en `src/`**: lo nuevo usa `PLATFORM` o el perfil; la guardia (BG-01) no deja crecer ningún conteo.
11. **Prueba en tablet** para todo paso que toca recepción, control de calidad, venta, caja o ajuste de stock: el spec existente se corre en su Verify; la tablet real es línea del checklist (§20.1).
12. **Paridad:** antes de BG-17, `node scripts/bg-expect-parity.ts` sin `--allow`; desde BG-17, cada paso declara en su Verify los únicos textos que pueden cambiar en una expectativa (`--allow`).

### Un paso, una unidad
49 pasos = 49 tareas = 49 bloques en 5 épicas (16 + 16 + 5 + 7 + 5); los cuatro de la identidad visual (BG-46 … BG-49) se agregaron después, con el manual de marca, y los 45 originales son los que se explican a continuación (BG-D40). Sobre el rango de FASE §10 (35–45, con la etapa 1 en 12–14) por el límite de 5 archivos, las tres generaciones de contract y las cuatro plantillas de correo (BG-D28).

### Mapa de pasos
| Paso | Tarea | Tag | Título | Depende de | Épica | Ventana |
|---|---|---|---|---|---|---|
| BG-01 | E1-T1 | bg-01 | Guardias: literales del taller y paridad de expectativas | — | 01 | — |
| BG-02 | E1-T2 | bg-02 | Helpers de tiempo en `src/lib/time.ts` | BG-01 | 01 | — |
| BG-03 | E1-T3 | bg-03 | Esquema expand: `shops`, `shop_id`, `branch_id` en reservas | BG-02 | 01 | V-BG1 |
| BG-04 | E1-T4 | bg-04 | Siembra del taller Vector Bikes en las pruebas (excepción) | BG-03 | 01 | V-BG1 |
| BG-05 | E1-T5 | bg-05 | Migración de datos `pnpm bg:backfill` y ventana V-BG1 | BG-04 | 01 | V-BG1 |
| BG-06 | E1-T6 | bg-06 | Configuración y alcance del taller; horarios por configuración | BG-05 | 01 | V-BG2 |
| BG-07 | E1-T7 | bg-07 | Reservas por sucursal y arnés de dos talleres | BG-06 | 01 | V-BG2 |
| BG-08 | E1-T8 | bg-08 | API pública con la configuración del taller y ventana V-BG2 | BG-07 | 01 | V-BG2 |
| BG-09 | E1-T9 | bg-09 | Contract A: NOT NULL y clave de `booking_days` | BG-08 | 01 | V-BG3 |
| BG-10 | E1-T10 | bg-10 | Contract B: índices únicos por taller | BG-09 | 01 | V-BG3 |
| BG-11 | E1-T11 | bg-11 | Contract C: CHECK relajados y ventana V-BG3 | BG-10 | 01 | V-BG3 |
| BG-12 | E1-T12 | bg-12 | Reserva manual por taller | BG-11 | 01 | — |
| BG-13 | E1-T13 | bg-13 | Reprogramación y agenda de `/admin` por sucursal | BG-12 | 01 | — |
| BG-14 | E1-T14 | bg-14 | Mes y bloqueos de `/admin` por sucursal | BG-13 | 01 | — |
| BG-15 | E1-T15 | bg-15 | Tablero, indicadores y recepción desde reserva | BG-14 | 01 | — |
| BG-16 | E1-T16 | bg-16 | Recordatorios y WhatsApp por sucursal | BG-15 | 01 | — |
| BG-17 | E2-T1 | bg-17 | Perfil del taller, marca de correo y logo | BG-16 | 02 | — |
| BG-18 | E2-T2 | bg-18 | Correos de reserva con la marca del taller | BG-17 | 02 | — |
| BG-19 | E2-T3 | bg-19 | Correos de recepción y de retiro | BG-18 | 02 | — |
| BG-20 | E2-T4 | bg-20 | Cotización y aviso de repuesto | BG-19 | 02 | — |
| BG-21 | E2-T5 | bg-21 | Cambio de fecha, mantención y resumen diario | BG-20 | 02 | — |
| BG-22 | E2-T6 | bg-22 | Tokens de diseño y layouts del sistema | BG-21 | 02 | — |
| BG-23 | E2-T7 | bg-23 | Páginas por token con la marca del taller | BG-22 | 02 | — |
| BG-24 | E2-T8 | bg-24 | Informe, etiqueta y textos de la orden | BG-23 | 02 | — |
| BG-25 | E2-T9 | bg-25 | Isla de reserva por props | BG-24 | 02 | — |
| BG-26 | E2-T10 | bg-26 | Contenido del sitio heredado fuera de `src/` | BG-25 | 02 | — |
| BG-27 | E2-T11 | bg-27 | Páginas heredadas, marca del personal y fin de `SITE` (excepción) | BG-26 | 02 | — |
| BG-28 | E2-T12 | bg-28 | Motor sin constantes del taller y guardia vacía (excepción) | BG-27 | 02 | — |
| BG-46 | E2-T13 | bg-46 | Marca provisional de Llave 15: distintivo y firma | BG-28 | 02 | — |
| BG-47 | E2-T14 | bg-47 | Tokens, tipografía Inter y favicon de Llave 15 | BG-28, BG-46 | 02 | — |
| BG-48 | E2-T15 | bg-48 | Controles, foco, estados e ingreso de Llave 15 | BG-28, BG-47 | 02 | — |
| BG-49 | E2-T16 | bg-49 | Firma de Llave 15 en el menú, el pie del cliente y los correos | BG-28, BG-48 | 02 | — |
| BG-29 | E3-T1 | bg-29 | Slugs reservados y alcance por slug | BG-28, BG-49 | 03 | — |
| BG-30 | E3-T2 | bg-30 | API de reservas por taller | BG-29 | 03 | — |
| BG-31 | E3-T3 | bg-31 | Página `/<slug>/reservar` y privacidad del taller | BG-30 | 03 | — |
| BG-32 | E3-T4 | bg-32 | Enlaces a la página de reservas del taller | BG-31 | 03 | — |
| BG-33 | E3-T5 | bg-33 | Spec de navegador de la reserva por taller | BG-32 | 03 | — |
| BG-34 | E4-T1 | bg-34 | `APP_URL` en enlaces, cookie y CSRF (excepción) | BG-33 | 04 | — |
| BG-35 | E4-T2 | bg-35 | Secreto propio del seguimiento sin romper enlaces | BG-34 | 04 | — |
| BG-36 | E4-T3 | bg-36 | Tareas diarias por taller activo | BG-35 | 04 | — |
| BG-37 | E4-T4 | bg-37 | Sitio de Vector Bikes: portada | BG-36 | 04 | — |
| BG-38 | E4-T5 | bg-38 | Sitio de Vector Bikes: privacidad y redirecciones permanentes | BG-37 | 04 | — |
| BG-39 | E4-T6 | bg-39 | Compuerta del sitio y salud de la plataforma | BG-38 | 04 | — |
| BG-40 | E4-T7 | bg-40 | Plan de corte del dominio | BG-39 | 04 | — |
| BG-41 | E5-T1 | bg-41 | Administrador de plataforma y lista de talleres | BG-40 | 05 | — |
| BG-42 | E5-T2 | bg-42 | Crear un taller con su primer dueño | BG-41 | 05 | — |
| BG-43 | E5-T3 | bg-43 | Suspender un taller y ver su uso | BG-42 | 05 | — |
| BG-44 | E5-T4 | bg-44 | "Mi taller" para el dueño | BG-43 | 05 | — |
| BG-45 | E5-T5 | bg-45 | Alta documentada y cierre de la fase | BG-44 | 05 | — |

La cadena es lineal a propósito: un solo builder (Codex) por vez, un encargo por tarea. Orden de ejecución en la etapa 2: BG-17 … BG-28 → BG-46 → BG-47 → BG-48 → BG-49 → BG-29 (BG-D40); el paso anterior de BG-46 es BG-28 y el de BG-29 es BG-49 (reversión `git reset --hard bg-<anterior>`).

**Reglas por paso (abreviatura):** R-db = `.claude/rules/database.md` · R-book = `booking-engine.md` · R-api = `server-api.md` · R-ui = `ui-design.md` · R-tui = `taller-ui.md` · R-dom = `taller-domain.md` · R-e2e = `e2e.md` · R-shops = `shops.md` · NN = No negociables de `CLAUDE.md` · RC = reglas de código (siempre: NN 2, 4, 5, 7 y RC 14).

**Líneas comunes de Verify:** `P0` = `node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió`. Cada bloque de abajo la escribe completa.

---

### Épica 01 — Cimientos multi-taller (etapa 1, sin cambios visibles)

#### BG-01 — Guardias: literales del taller y paridad de expectativas (E1-T1)
**Archivos:** `tests/unit/shop-literals.test.ts` (nuevo) · `tests/unit/shop-literals-baseline.json` (nuevo) · `scripts/bg-expect-parity.ts` (nuevo) · `tests/unit/bg-expect-parity.test.ts` (nuevo)
**Hacer:** (1) La guardia recorre todo archivo bajo `src/` y cuenta, por archivo, las ocurrencias no superpuestas de nueve patrones literales: `Vector Bikes`, `Vitacura`, `Las Condes`, `Kennedy`, `vectorbikes`, `vector.bikes`, `$15.000`, `85095780`, `8509 5780` (nunca el número suelto `15000`: `whatsapp/service.ts` lo usa como tiempo de espera). Falla, nombrando archivo y patrón, si un archivo con ocurrencias no está en la línea base o supera su conteo. La línea base es `{ "src/…": n }` con el conteo de este paso, claves ordenadas. Incluye un caso que escanea un directorio temporal con un archivo que contiene `Vitacura`. (2) `scripts/bg-expect-parity.ts [--base <ref>] [--allow <texto>]… [--skip <ruta>]…`: corre `git diff <ref, por defecto HEAD> -U0 --no-color -- tests e2e`, ignora archivos nuevos y los de `--skip`, toma de cada línea quitada y agregada la "cola de matcher" (desde `.toBe(`, `.toEqual(`, `.toStrictEqual(`, `.toContain(`, `.toContainEqual(`, `.toMatch(`, `.toMatchObject(`, `.toHaveLength(`, `.toHaveProperty(`, `.toThrow(`, `.toBeNull(`, `.toBeTruthy(`, `.toBeFalsy(`, `.toBeDefined(`, `.toBeUndefined(`, `.toBeGreaterThan(`, `.toBeLessThan(`, con `.not.` opcional, hasta el fin de línea), descarta las que contienen un texto de `--allow` y compara los dos multiconjuntos. Sale 0 si son iguales, 1 si difieren (imprime las colas), 2 por uso o si `git` falla. Exporta la función pura `compareMatcherTails(diff, allow)`; el `main` corre solo si `import.meta.url === pathToFileURL(process.argv[1]).href`.
**Reglas:** RC 14 · No cambia: ningún archivo de `src/`.
**Done when**
- [ ] WHEN corre `tests/unit/shop-literals.test.ts` sobre el árbol del paso THE SYSTEM SHALL pasar, con cada archivo de `src/` que contiene uno de los nueve patrones listado en `shop-literals-baseline.json` con su conteo actual
- [ ] WHEN el escáner de la guardia recorre un directorio temporal con un archivo que contiene `Vitacura` THE SYSTEM SHALL reportar ese archivo con conteo 1 y la guardia SHALL fallar si ese archivo no está en la línea base
- [ ] WHEN se suman los conteos de `shop-literals-baseline.json` THE SYSTEM SHALL dar el mismo total que `grep -rFoI` con los nueve patrones sobre `src/`
- [ ] WHEN `compareMatcherTails` recibe un diff donde una línea con `.toBe(` cambia su argumento THE SYSTEM SHALL devolver esa diferencia, y con un diff que solo cambia argumentos fuera del matcher SHALL devolver listas vacías
- [ ] WHEN `compareMatcherTails` recibe un texto en `allow` THE SYSTEM SHALL ignorar las colas de matcher que lo contienen
- [ ] WHEN `node scripts/bg-expect-parity.ts --x` corre THE SYSTEM SHALL salir con código 2 y un mensaje de uso, y sin cambios en `tests/` ni `e2e/` SHALL salir 0
**Verify**
```bash
pnpm test tests/unit/shop-literals.test.ts tests/unit/bg-expect-parity.test.ts   # expect: exit 0, 0 failed
test "$(grep -rFoI -e 'Vector Bikes' -e 'Vitacura' -e 'Las Condes' -e 'Kennedy' -e 'vectorbikes' -e 'vector.bikes' -e '$15.000' -e '85095780' -e '8509 5780' src | wc -l | tr -d ' ')" = "$(node -p "Object.values(require('./tests/unit/shop-literals-baseline.json')).reduce((a, b) => a + b, 0)")"   # expect: exit 0 — la línea base cuenta lo mismo que grep
node scripts/bg-expect-parity.ts --x; test $? -eq 2   # expect: código 2 (uso) → la línea sale 0
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- tests/unit/shop-literals.test.ts tests/unit/shop-literals-baseline.json scripts/bg-expect-parity.ts tests/unit/bg-expect-parity.test.ts
git commit -m "test: bg-01 add shop literal guard and expectation parity script" && git tag bg-01
git tag -l bg-01 | grep -qx bg-01   # expect: exit 0
```

#### BG-02 — Helpers de tiempo en `src/lib/time.ts` (E1-T2)
**Archivos:** `src/lib/time.ts` (nuevo) · `src/server/booking/rules.ts` · `src/server/booking/slots.ts` · `tests/unit/time.test.ts` (nuevo)
**Hacer:** mover `TIMEZONE` (de `rules.ts`) y `localToday`, `addDays`, `localToInstant` (de `slots.ts`) a `src/lib/time.ts`, que solo importa `luxon`. `rules.ts` reexporta `TIMEZONE` y `slots.ts` reexporta las tres funciones desde `../../lib/time.ts`, para que ningún importador cambie todavía (se quitan en BG-28).
**Reglas:** R-book · RC 1, 3 · No cambia: ninguna firma ni importador.
**Done when**
- [ ] WHEN se importa `src/lib/time.ts` THE SYSTEM SHALL exportar `TIMEZONE` igual a `America/Santiago`, `localToday`, `addDays` y `localToInstant`, sin importar nada de `src/server/**`
- [ ] WHEN `localToday` recibe el instante `2026-10-05T02:30:00Z` THE SYSTEM SHALL devolver `2026-10-04`
- [ ] WHEN la prueba busca con luxon la primera hora local inexistente de septiembre de 2026 en `America/Santiago` THE SYSTEM SHALL obtener `null` de `localToInstant` para esa hora
- [ ] WHEN se importan `TIMEZONE` desde `src/server/booking/rules.ts` y `localToday`, `addDays` y `localToInstant` desde `src/server/booking/slots.ts` THE SYSTEM SHALL entregar los mismos valores y funciones de `src/lib/time.ts`
- [ ] WHEN corren `slots.test.ts`, `pickup-hours.test.ts` y `multi-bike-slots.test.ts` THE SYSTEM SHALL pasar sin cambios en esos archivos
**Verify**
```bash
pnpm test tests/unit/time.test.ts tests/unit/slots.test.ts tests/unit/pickup-hours.test.ts tests/unit/multi-bike-slots.test.ts   # expect: exit 0, 0 failed
grep -q 'server/' src/lib/time.ts; test $? -eq 1   # expect: 1 = time.ts no importa src/server → la línea sale 0
grep -q 'lib/time.ts' src/server/booking/rules.ts && grep -q 'lib/time.ts' src/server/booking/slots.ts   # expect: exit 0
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/lib/time.ts src/server/booking/rules.ts src/server/booking/slots.ts tests/unit/time.test.ts
git commit -m "refactor: bg-02 move time helpers to src/lib/time.ts" && git tag bg-02
git tag -l bg-02 | grep -qx bg-02   # expect: exit 0
```

#### BG-03 — Esquema expand: `shops`, `shop_id`, `branch_id` en reservas (E1-T3)
**Confirmación previa del operador (no es compuerta):** respaldos de la base de Replit activos. Confirmado por la coordinadora: `drizzle-orm` 0.45.2 acepta un `SQL` devuelto por `$defaultFn` (`insert.js`, línea 380).
**Archivos:** `src/server/db/schema-shops.ts` (nuevo) · `src/server/db/schema.ts` · `scripts/db-check.ts` · `tests/integration/shops-schema.test.ts` (nuevo)
**Hacer:** `shops` y `shopTables` según §4 (patrón literal de §4); `onlyShopId`; en `schema.ts`: `branches.shopId` nulable con `$defaultFn(onlyShopId)`, `users.isPlatformAdmin`, `bookingBranchReference()` nulable en las siete tablas de reserva y los cuatro índices no únicos de §4. `db-check.ts` recorre también `shopTables`. Una sola generación, aditiva.
**Reglas:** R-db · NN 5, 8 · No cambia: ninguna columna, índice ni CHECK existente.
**Done when**
- [ ] WHEN `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` THE SYSTEM SHALL crear `shops` y agregar `branches.shop_id`, `users.is_platform_admin` y `branch_id` en `bookings`, `booking_bikes`, `booking_blocks`, `booking_days`, `blocked_periods`, `booking_requests` y `whatsapp_messages`, nulables, sin borrar, renombrar ni volver NOT NULL nada existente
- [ ] WHEN se inserta un usuario sin `is_platform_admin` THE SYSTEM SHALL guardar `false`
- [ ] WHEN se guarda un taller con `slug` fuera de `^[a-z0-9]+(-[a-z0-9]+)*$`, `code_prefix` fuera de `^[A-Z]{2,4}$`, `daily_capacity` 0, `pickup_fee_clp` negativo, `status` fuera de `activo` y `suspendido`, o `pickup_enabled` con `pickup_comunas` vacío THE SYSTEM SHALL rechazarlo con código `23514`, y dos talleres con el mismo `slug` o el mismo `code_prefix` SHALL rechazarse con `23505`
- [ ] WHEN la base tiene un solo taller y se inserta una sucursal con Drizzle sin `shopId` THE SYSTEM SHALL guardarla con el id de ese taller, y con dos talleres SHALL dejar `shop_id` nulo
- [ ] WHEN la base tiene una sola sucursal y se inserta una reserva con Drizzle sin `branchId` THE SYSTEM SHALL guardarla con el id de esa sucursal, y con dos sucursales SHALL dejar `branch_id` nulo
- [ ] WHEN `pnpm db:check` corre THE SYSTEM SHALL revisar también las columnas de `shopTables` y salir 0
**Verify**
```bash
pnpm test tests/integration/shops-schema.test.ts tests/integration/foundation.test.ts tests/integration/users-schema.test.ts   # expect: exit 0, 0 failed
f="$(ls drizzle/*.sql | sort | tail -1)"; grep -Eq 'DROP |RENAME|SET NOT NULL' "$f"; test $? -eq 1   # expect: 1 = la migración nueva es aditiva → la línea sale 0
grep -Eq 'CREATE TABLE ("public"\.)?"shops"' "$(ls drizzle/*.sql | sort | tail -1)"   # expect: exit 0
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
test "$(wc -l < src/server/db/schema.ts | tr -d ' ')" -lt 400   # expect: exit 0
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
u="$(git ls-files --others --exclude-standard)" && test -z "$(printf '%s\n' "$u" | grep -E ' 2(\.[^/]*)?$')"   # expect: exit 0 — sin duplicados de iCloud antes de agregar drizzle/
git add -- src/server/db/schema-shops.ts src/server/db/schema.ts scripts/db-check.ts tests/integration/shops-schema.test.ts drizzle
git commit -m "feat: bg-03 add shops table and nullable branch columns" && git tag bg-03
git tag -l bg-03 | grep -qx bg-03   # expect: exit 0
```

#### BG-04 — Siembra del taller Vector Bikes en las pruebas (E1-T4) — excepción declarada (BG-D6)
**Archivos propios:** `scripts/vector-bikes-profile.ts` (nuevo, perfil literal de §4) · `tests/helpers/shops.ts` (nuevo: reexporta `VECTOR_BIKES_PROFILE`; `DEMO_SHOP_PROFILE` de §4; `seedShop(db, profile)`; `insertBranchForShop(db, shopId, name)`) · `tests/helpers/pglite.ts` (`createTestDb()` siembra el taller Vector Bikes; nuevo `createBookingTestDb()` = `createTestDb()` + sucursal `Vitacura` de ese taller) · `tests/unit/vector-bikes-profile.test.ts` (nuevo)
**Siembra declarada (no cuenta; solo líneas de siembra, ninguna expectativa):** `tests/integration/{api,create-booking,concurrency,cancel-flow,email,reminders,tasks,whatsapp,admin-panel,admin-month,foundation}.test.ts` (pasan de `createTestDb` a `createBookingTestDb`); `tests/integration/{users-schema,reports,history}.test.ts` (sus `INSERT` crudos de `branches` agregan `shop_id` y el de `bookings` en `users-schema` agrega `branch_id`); `e2e/global-setup.ts` (con `hasTable(sql, "shops")`, inserta el taller desde `VECTOR_BIKES_PROFILE` antes de la sucursal, la sucursal con `shop_id` y las reservas con `branch_id`).
**Reglas:** R-db · R-e2e (excepción BG-D19) · NN 7 · No cambia: ninguna expectativa.
**Done when**
- [ ] WHEN `createTestDb()` termina THE SYSTEM SHALL tener exactamente un taller, con `slug` `vector-bikes` y los valores de `VECTOR_BIKES_PROFILE`, y ninguna sucursal
- [ ] WHEN `createBookingTestDb()` termina THE SYSTEM SHALL tener además una sola sucursal `Vitacura` enlazada a ese taller
- [ ] WHEN corre `tests/unit/vector-bikes-profile.test.ts` THE SYSTEM SHALL comprobar que nombre, correo, teléfonos, direcciones, comuna, región, enlaces, horarios, capacidad, bloque, antelación, horizonte, tarifa y comunas de retiro de `VECTOR_BIKES_PROFILE` son iguales a los de `src/lib/site.ts` y `src/server/booking/rules.ts`, y que `codePrefix` es `VB`
- [ ] WHEN se compara `tests/` y `e2e/` con `HEAD` THE SYSTEM SHALL mostrar cambios exactamente en los quince archivos de siembra declarados y `tests/helpers/pglite.ts`
- [ ] WHEN corre `node scripts/bg-expect-parity.ts` THE SYSTEM SHALL salir 0
- [ ] WHEN corren `pnpm test` y `pnpm test:tablet e2e/login.spec.ts` THE SYSTEM SHALL pasar con 0 fallas
**Verify**
```bash
pnpm test tests/unit/vector-bikes-profile.test.ts tests/integration/foundation.test.ts tests/integration/users-schema.test.ts tests/integration/api.test.ts tests/integration/create-booking.test.ts   # expect: exit 0, 0 failed
d="$(git diff HEAD --name-only -- tests e2e)" && test "$(printf '%s\n' "$d" | LC_ALL=C sort)" = "$(printf '%s\n' e2e/global-setup.ts tests/helpers/pglite.ts tests/integration/admin-month.test.ts tests/integration/admin-panel.test.ts tests/integration/api.test.ts tests/integration/cancel-flow.test.ts tests/integration/concurrency.test.ts tests/integration/create-booking.test.ts tests/integration/email.test.ts tests/integration/foundation.test.ts tests/integration/history.test.ts tests/integration/reminders.test.ts tests/integration/reports.test.ts tests/integration/tasks.test.ts tests/integration/users-schema.test.ts tests/integration/whatsapp.test.ts | LC_ALL=C sort)"   # expect: exit 0 — git respondió y cambiaron exactamente los archivos declarados
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm test   # expect: exit 0, 0 failed
pnpm build && pnpm test:tablet e2e/login.spec.ts   # expect: exit 0 — la siembra E2E con el taller funciona
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- scripts/vector-bikes-profile.ts tests/helpers/shops.ts tests/helpers/pglite.ts tests/unit/vector-bikes-profile.test.ts e2e/global-setup.ts tests/integration/api.test.ts tests/integration/create-booking.test.ts tests/integration/concurrency.test.ts tests/integration/cancel-flow.test.ts tests/integration/email.test.ts tests/integration/reminders.test.ts tests/integration/tasks.test.ts tests/integration/whatsapp.test.ts tests/integration/admin-panel.test.ts tests/integration/admin-month.test.ts tests/integration/foundation.test.ts tests/integration/users-schema.test.ts tests/integration/reports.test.ts tests/integration/history.test.ts
git commit -m "test: bg-04 seed the vector bikes shop in tests" && git tag bg-04
git tag -l bg-04 | grep -qx bg-04   # expect: exit 0
```

#### BG-05 — Migración de datos `pnpm bg:backfill` y ventana V-BG1 (E1-T5)
**Archivos:** `src/server/shops/backfill.ts` (nuevo) · `scripts/bg-backfill.ts` (nuevo) · `package.json` (solo el script) · `tests/integration/bg-backfill.test.ts` (nuevo) · `docs/ventanas/bg-v1.md` (nuevo)
**Hacer:** `backfillFirstShop(db, { profile, notifyEmail, logo?, storage?, dryRun }, now)`: si no hay taller con `profile.slug` y la tabla está vacía, lo crea; si hay sucursales con `shop_id` nulo y no hay exactamente una sucursal, devuelve `{ ok: false, code: "ambiguous" }` sin escribir; enlaza la sucursal; completa `branch_id` nulo en las siete tablas con esa sucursal; todo en una transacción. Con `logo` y `logo_key` nulo, sube el archivo con la clave `shops/<id del taller>/logo.png` **antes** de la transacción que guarda `logo_key` (si la fila falla, borra el objeto; RC 13). Devuelve `{ ok: true, dryRun, shopCreated, branchesLinked, filled, pending, logoStored }`. Script: `[--dry-run] [--logo <ruta>]`; argumento desconocido → 2 con uso; sin conexión → 2 con `No se pudo conectar`; `ambiguous` o `pending > 0` después de escribir → 1; si no, 0. Imprime una línea JSON sin datos personales. El correo de avisos sale de `getEmailEnv().SHOP_NOTIFY_EMAIL` y solo se lee al escribir. `docs/ventanas/bg-v1.md`: migración de BG-03 (nombre real del archivo), precondiciones, pasos en Replit y verificación (BITACORA §2 "Publicar con cambios de esquema").
**Reglas:** R-db · R-shops · NN 2, 4 · No cambia: ninguna dependencia de `package.json`.
**Done when**
- [ ] WHEN `backfillFirstShop` corre sobre una base con una sucursal sin taller y reservas, bloques, días, bicis, bloqueos, intentos y mensajes de WhatsApp con `branch_id` nulo THE SYSTEM SHALL crear el taller `vector-bikes` con los valores del perfil y el correo de avisos recibido, enlazar la sucursal y completar `branch_id` en las siete tablas, en una transacción
- [ ] WHEN corre por segunda vez, o con `dryRun` THE SYSTEM SHALL no escribir ninguna fila, devolver con `dryRun` los conteos pendientes y en la segunda corrida `pending` 0
- [ ] WHEN la base tiene dos sucursales sin taller THE SYSTEM SHALL devolver `ok: false` con código `ambiguous` sin escribir
- [ ] WHEN recibe un logo y el taller no tiene `logo_key` THE SYSTEM SHALL subirlo al almacenamiento con la clave `shops/<id del taller>/logo.png` antes de guardar `logo_key`
- [ ] WHEN `node scripts/bg-backfill.ts --x` corre THE SYSTEM SHALL salir 2 con un mensaje de uso, con un `DATABASE_URL` inalcanzable SHALL salir 2 con `No se pudo conectar`, y `package.json` SHALL tener `bg:backfill` igual a `node --env-file-if-exists=.env scripts/bg-backfill.ts`
- [ ] WHEN se lee `docs/ventanas/bg-v1.md` THE SYSTEM SHALL contener `## Precondiciones`, `## Pasos en Replit` y `## Verificación después de publicar` y el nombre de la migración que crea `shops`
**Verify**
```bash
pnpm test tests/integration/bg-backfill.test.ts   # expect: exit 0, 0 failed
node scripts/bg-backfill.ts --x; test $? -eq 2   # expect: código 2 (uso) → la línea sale 0
out="$(DATABASE_URL=postgres://127.0.0.1:1/x node scripts/bg-backfill.ts --dry-run 2>&1)"; test $? -eq 2 && printf '%s' "$out" | grep -q 'No se pudo conectar'   # expect: exit 0 — código 2 (conexión), no 1
test "$(node -p "require('./package.json').scripts['bg:backfill']")" = "node --env-file-if-exists=.env scripts/bg-backfill.ts"   # expect: exit 0
f="$(grep -lE 'CREATE TABLE ("public"\.)?"shops"' drizzle/*.sql)"; test "$(printf '%s\n' "$f" | grep -c .)" = 1 && grep -qF "$(basename "$f")" docs/ventanas/bg-v1.md   # expect: exit 0
grep -qF '## Precondiciones' docs/ventanas/bg-v1.md && grep -qF '## Pasos en Replit' docs/ventanas/bg-v1.md && grep -qF '## Verificación después de publicar' docs/ventanas/bg-v1.md   # expect: exit 0
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/shops/backfill.ts scripts/bg-backfill.ts package.json tests/integration/bg-backfill.test.ts docs/ventanas/bg-v1.md
git commit -m "feat: bg-05 add first shop backfill and window v-bg1" && git tag bg-05
git tag -l bg-05 | grep -qx bg-05   # expect: exit 0
git ls-files --error-unmatch docs/ventanas/bg-v1.md   # expect: exit 0 — commiteado una línea arriba
```

#### BG-06 — Configuración y alcance del taller; horarios por configuración (E1-T6)
**Archivos:** `src/server/booking/config.ts` (nuevo) · `src/server/shops/scope.ts` (nuevo) · `src/server/booking/slots.ts` · `src/server/booking/rules.ts` · `tests/integration/shop-config.test.ts` (nuevo)
**Hacer:** `config.ts`: `BookingConfig` (`blockMinutes`, `dailyCapacity`, `minNoticeMinutes`, `horizonDays`, `pickupEnabled`, `pickupFeeClp`, `pickupComunas`, `receptionHours`, `pickupHours`, `codePrefix`), `weekHoursSchema` (zod: claves `"1"`…`"7"`, valor `null` o `{ open, close }` en `HH:MM` con `open < close`), `bookingConfigFromShop(row)` y `LEGACY_BOOKING_CONFIG` armado con las constantes de `rules.ts` (transitorio; se borra en BG-28). `scope.ts`: `BookingScope`, `ShopScopeError` (`ambiguous`, `missing`), `scopeForBranch(db, branchId)` (sucursal → taller; `null` si no existe), `singleShopScope(db)` (exactamente un taller con exactamente una sucursal). `slots.ts`: `DayInput.config?`, `gridForDate(date, mode?, config?)`, `calendarClosure(…, config?)`; `rules.ts`: `hoursFor(mode, weekday, config?)`; sin configuración, `LEGACY_BOOKING_CONFIG`.
**Reglas:** R-book · R-shops · RC 4 · No cambia: resultados sin configuración.
**Done when**
- [ ] WHEN `bookingConfigFromShop` recibe la fila del taller Vector Bikes THE SYSTEM SHALL devolver un `BookingConfig` igual a `LEGACY_BOOKING_CONFIG` con `codePrefix` `VB`
- [ ] WHEN `bookingConfigFromShop` recibe `reception_hours` con una hora `25:00` o con `open` mayor o igual que `close` THE SYSTEM SHALL lanzar un error de validación
- [ ] WHEN `gridForDate` recibe el lunes `2026-10-05` con la configuración del Taller Demo THE SYSTEM SHALL devolver `10:00`, `11:00` y `12:00`
- [ ] WHEN `computeDay` recibe la configuración del Taller Demo con 2 bicis ya reservadas THE SYSTEM SHALL devolver `full`, una fecha a 15 días SHALL devolver `closed` y un inicio a menos de 60 minutos SHALL quedar `late`
- [ ] WHEN `computeDay`, `checkStart`, `gridForDate` y `hoursFor` se llaman sin configuración THE SYSTEM SHALL dar los mismos resultados de hoy (`slots.test.ts`, `multi-bike-slots.test.ts` y `pickup-hours.test.ts` sin cambios)
- [ ] WHEN `singleShopScope` corre con un taller y una sucursal THE SYSTEM SHALL devolver su `shopId`, `slug`, `branchId` y configuración, y con dos talleres SHALL lanzar `ShopScopeError` con código `ambiguous`
**Verify**
```bash
pnpm test tests/integration/shop-config.test.ts tests/unit/slots.test.ts tests/unit/multi-bike-slots.test.ts tests/unit/pickup-hours.test.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/booking/config.ts src/server/shops/scope.ts src/server/booking/slots.ts src/server/booking/rules.ts tests/integration/shop-config.test.ts
git commit -m "feat: bg-06 load booking config and scope from shops" && git tag bg-06
git tag -l bg-06 | grep -qx bg-06   # expect: exit 0
```

#### BG-07 — Reservas por sucursal y arnés de dos talleres (E1-T7)
**Archivos:** `src/server/booking/create-booking.ts` · `src/server/booking/day-state.ts` · `src/server/booking/availability.ts` · `tests/helpers/two-shops.ts` (nuevo) · `tests/integration/booking-isolation.test.ts` (nuevo)
**Hacer:** `createBooking(db, input, now, scope?)` (sin alcance: `singleShopScope`); toda fila con `scope.branchId`; `booking_days` se inserta con (`branchId`, `serviceDate`) y se bloquea con `FOR UPDATE` filtrando sucursal y fecha (orden de locks intacto); límite de teléfono por sucursal; `nextCode` por sucursal con `${config.codePrefix}-AAMMDD-HHMM`; tarifa desde `config`. `readDay(tx, serviceDate, excludeBookingId?, branchId?)` y `readRange(db, from, to, excludeBookingId?, branchId?)` filtran por sucursal (sin ella, `singleShopScope`). `two-shops.ts`: `seedTwoShops(db)` → `{ vector, demo }` con taller, sucursal, dueño, mecánico y alcance de cada uno. En la prueba, el Taller Demo solo reserva `taller` (los CHECK se relajan en BG-11) y a horas distintas de Vector Bikes (el índice de bloques es global hasta BG-10).
**Reglas:** R-book · R-shops · NN 1, 3 · No cambia: firma existente (el alcance es opcional al final), forma de `CreateBookingResult`.
**Done when**
- [ ] WHEN `createBooking` recibe el alcance del Taller Demo THE SYSTEM SHALL guardar la reserva, sus bloques y su día con el `branch_id` del Taller Demo, con código `TD-AAMMDD-HHMM`
- [ ] WHEN el Taller Demo ya tiene 2 bicis reservadas un día THE SYSTEM SHALL responder `slot_unavailable` a una tercera en ese taller y aceptar una reserva de Vector Bikes el mismo día a otra hora
- [ ] WHEN un teléfono tiene una reserva futura en Vector Bikes THE SYSTEM SHALL aceptar una reserva del mismo teléfono en el Taller Demo y responder `phone_limit` a una segunda en Vector Bikes
- [ ] WHEN `readRange` corre con la sucursal de Vector Bikes THE SYSTEM SHALL no contar bloques, bloqueos ni bicis del Taller Demo
- [ ] WHEN `createBooking` corre sin alcance en una base con dos talleres THE SYSTEM SHALL lanzar `ShopScopeError` sin escribir filas
- [ ] WHEN corren `create-booking.test.ts`, `concurrency.test.ts`, `multi-bike-booking.test.ts` y `api.test.ts` THE SYSTEM SHALL pasar sin cambios en esos archivos
**Verify**
```bash
pnpm test tests/integration/booking-isolation.test.ts tests/integration/create-booking.test.ts tests/integration/concurrency.test.ts tests/integration/multi-bike-booking.test.ts tests/integration/api.test.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/booking/create-booking.ts src/server/booking/day-state.ts src/server/booking/availability.ts tests/helpers/two-shops.ts tests/integration/booking-isolation.test.ts
git commit -m "feat: bg-07 scope booking writes and reads by branch" && git tag bg-07
git tag -l bg-07 | grep -qx bg-07   # expect: exit 0
```

#### BG-08 — API pública con la configuración del taller y ventana V-BG2 (E1-T8)
**Confirmación previa del operador (no es compuerta):** la base dev tiene exactamente una sucursal (`select count(*) from branches` devuelve 1). Si tiene más, `pnpm bg:backfill` sale 1 con `ambiguous`: la coordinadora reinicia la base dev con el comando de §12 (o deja una sola sucursal) antes de empezar el paso.
**Archivos:** `src/server/api/handlers.ts` · `tests/integration/api-shop-config.test.ts` (nuevo) · `docs/ventanas/bg-v2.md` (nuevo)
**Hacer:** `HandlerContext.scope?`; sin él, `singleShopScope(ctx.db)`. `bookingSchemaFor(config)`: `comuna` validada contra `config.pickupComunas` con el mensaje de §5; retiro rechazado si `!config.pickupEnabled`; `handleAvailability` usa `config` (capacidad y horario) y mantiene la forma `{ timezone, modo, capacity, days }`. `docs/ventanas/bg-v2.md`: precondición V-BG1 publicada; en producción, con el taller cerrado y respaldo del día, `pnpm bg:backfill --dry-run`, `pnpm bg:backfill --logo public/brand/vector-bikes-logo.png`, `pnpm bg:backfill --dry-run` con `"pending":0`, y recién entonces publicar `bg-08`. El Verify completa la base dev (requisito de BG-09).
**Reglas:** R-api · R-book · NN 2 · No cambia: forma de las respuestas, orden rate limit → zod → Turnstile.
**Done when**
- [ ] WHEN `handleAvailability` corre con el alcance del Taller Demo THE SYSTEM SHALL responder 200 con `capacity` 2 y bloques de 60 minutos, con la misma forma de respuesta de hoy (`timezone`, `modo`, `capacity`, `days`)
- [ ] WHEN `handleCreateBooking` recibe un retiro con comuna `Vitacura` para el Taller Demo THE SYSTEM SHALL responder 422 `validation_error` con el campo `comuna` igual a `Elige Ñuñoa o Providencia.`
- [ ] WHEN `handleCreateBooking` recibe para Vector Bikes una comuna fuera de sus comunas THE SYSTEM SHALL responder 422 con `Elige Vitacura o Las Condes.`, igual que hoy
- [ ] WHEN el contexto no trae alcance y la base tiene un solo taller THE SYSTEM SHALL usar ese taller, y `api.test.ts` SHALL pasar sin cambios
- [ ] WHEN `pnpm bg:backfill --dry-run` corre contra la base dev después de `pnpm bg:backfill --logo public/brand/vector-bikes-logo.png` THE SYSTEM SHALL imprimir `"pending":0` y salir 0
- [ ] WHEN se lee `docs/ventanas/bg-v2.md` THE SYSTEM SHALL contener `## Precondiciones`, `## Migración de datos en producción`, `## Pasos en Replit` y `## Verificación después de publicar`
**Verify**
```bash
pnpm test tests/integration/api-shop-config.test.ts tests/integration/api.test.ts   # expect: exit 0, 0 failed
test -f public/brand/vector-bikes-logo.png   # expect: exit 0
pnpm bg:backfill --logo public/brand/vector-bikes-logo.png   # expect: exit 0 — completa la base dev; idempotente
pnpm bg:backfill --dry-run | grep -qF '"pending":0'   # expect: exit 0
grep -qF '## Precondiciones' docs/ventanas/bg-v2.md && grep -qF '## Migración de datos en producción' docs/ventanas/bg-v2.md && grep -qF '## Pasos en Replit' docs/ventanas/bg-v2.md && grep -qF '## Verificación después de publicar' docs/ventanas/bg-v2.md   # expect: exit 0
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/api/handlers.ts tests/integration/api-shop-config.test.ts docs/ventanas/bg-v2.md
git commit -m "feat: bg-08 validate public booking with shop config and window v-bg2" && git tag bg-08
git tag -l bg-08 | grep -qx bg-08   # expect: exit 0
git ls-files --error-unmatch docs/ventanas/bg-v2.md   # expect: exit 0 — commiteado arriba
```

#### BG-09 — Contract A: NOT NULL y clave de `booking_days` (E1-T9)
**Archivos:** `src/server/db/schema.ts` · `tests/integration/shops-contract.test.ts` (nuevo)
**Hacer:** `.notNull()` en `branches.shopId` y en `bookingBranchReference()`; `booking_days` con `primaryKey({ columns: [t.branchId, t.serviceDate] })` (deja de ser PK `service_date`). **Dos generaciones (BG-D42):** drizzle-kit 0.31 no sabe borrar la PK de columna (deja el `DROP CONSTRAINT` comentado), así que la primera generación pone los NOT NULL y quita `booking_days` del esquema (`DROP TABLE`), y la segunda la vuelve a agregar con la PK compuesta (`CREATE TABLE`); las filas son anclas de bloqueo que `createBooking` recrea. **Siembra declarada (no cuenta):** `tests/helpers/legacy-db.ts` (nuevo: `createLegacyTestDb()`, la base migrada hasta `0038`, como producción antes de V-BG3), `tests/integration/bg-backfill.test.ts`, `tests/integration/shop-config.test.ts` y `tests/integration/shops-schema.test.ts` (sus filas sin taller o sin sucursal pasan a esa base) y `tests/unit/email-brand.test.ts` (`branchId` de la fixture con un id); además, siete pruebas cuyas filas no pasaban por el valor por defecto de compatibilidad (SQL crudo o dos sucursales): `inventory-schema`, `cash-schema`, `sales-schema`, `payments-extension` y `cash-links-schema` (sus `insert into branches` agregan el `shop_id` de `vector-bikes`), `dashboard` y `work-orders` (sus reservas pasan la sucursal). **Código (sexto archivo):** `src/server/api/handlers.ts` — `recordAttempt(ctx, branchId?)` guarda el intento en la sucursal del taller (con dos talleres el valor por defecto era null y respondía 500). **Valor esperado que cambia (declarado):** en `booking-isolation.test.ts` la tabla `booking_days` pasa de 1 a 2 filas en el límite telefónico por sucursal: desde la PK compuesta cada taller tiene su fila de día (cierra el hueco de BG-07); la paridad corre con `--skip` de ese archivo. Los valores por defecto de compatibilidad se conservan (BG-D3).
**Reglas:** R-db · NN 5, 8 · No cambia: tablas, columnas, nombres de índices.
**Done when**
- [ ] WHEN `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` THE SYSTEM SHALL dejar NOT NULL `branches.shop_id` y `branch_id` en las siete tablas de reserva, y la clave primaria de `booking_days` en (`branch_id`, `service_date`), sin borrar columnas; `booking_days`, que solo guarda anclas de bloqueo, se borra y se vuelve a crear con esa clave en una segunda generación (BG-D42)
- [ ] WHEN se inserta una sucursal sin `shop_id` en una base con dos talleres THE SYSTEM SHALL rechazarla con código `23502`
- [ ] WHEN se inserta una reserva sin `branch_id` en una base con dos sucursales THE SYSTEM SHALL rechazarla con código `23502`
- [ ] WHEN dos sucursales guardan el mismo `service_date` en `booking_days` THE SYSTEM SHALL aceptar ambas, y la misma sucursal dos veces SHALL rechazarse con `23505`
- [ ] WHEN `pnpm bg:backfill --dry-run` corre antes de migrar la base dev THE SYSTEM SHALL imprimir `"pending":0`
- [ ] WHEN corre `pnpm test` THE SYSTEM SHALL pasar sin cambios en las pruebas existentes
**Verify**
```bash
pnpm bg:backfill --dry-run | grep -qF '"pending":0'   # expect: exit 0 — la base dev ya está completa (BG-08)
pnpm test tests/integration/shops-contract.test.ts tests/integration/booking-isolation.test.ts tests/integration/users-schema.test.ts   # expect: exit 0, 0 failed
a="$(ls drizzle/*.sql | sort | tail -2 | head -1)"; b="$(ls drizzle/*.sql | sort | tail -1)"; grep -q 'SET NOT NULL' "$a" && test "$(grep -c 'DROP TABLE' "$a")" = 1 && grep -q 'DROP TABLE "booking_days"' "$a" && { grep -Eq 'DROP COLUMN|CREATE TABLE|RENAME' "$a"; test $? -eq 1; } && grep -q 'CREATE TABLE "booking_days"' "$b" && { grep -Eq 'DROP|SET NOT NULL|RENAME' "$b"; test $? -eq 1; }   # expect: exit 0 — dos generaciones: NOT NULL y borrado de booking_days, después booking_days con su clave (BG-D42)
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
test "$(wc -l < src/server/db/schema.ts | tr -d ' ')" -lt 400   # expect: exit 0
node scripts/bg-expect-parity.ts --skip tests/integration/booking-isolation.test.ts   # expect: exit 0 — la única expectativa que cambia es la declarada en booking-isolation (BG-D42)
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
u="$(git ls-files --others --exclude-standard)" && test -z "$(printf '%s\n' "$u" | grep -E ' 2(\.[^/]*)?$')"   # expect: exit 0 — sin duplicados de iCloud
git add -- src/server/db/schema.ts tests/integration/shops-contract.test.ts tests/helpers/legacy-db.ts tests/integration/bg-backfill.test.ts tests/integration/shop-config.test.ts tests/integration/shops-schema.test.ts tests/integration/booking-isolation.test.ts tests/unit/email-brand.test.ts src/server/api/handlers.ts tests/integration/inventory-schema.test.ts tests/integration/cash-schema.test.ts tests/integration/sales-schema.test.ts tests/integration/payments-extension.test.ts tests/integration/cash-links-schema.test.ts tests/integration/dashboard.test.ts tests/integration/work-orders.test.ts drizzle
git commit -m "feat: bg-09 make shop and branch columns not null" && git tag bg-09
git tag -l bg-09 | grep -qx bg-09   # expect: exit 0
```

#### BG-10 — Contract B: índices únicos por taller (E1-T10)
**Archivos:** `src/server/db/schema.ts` · `src/server/db/schema-taller.ts` · `tests/integration/shops-unique.test.ts` (nuevo)
**Hacer:** redefinir con el mismo nombre (BG-D11) `uq_bookings_code`, `uq_booking_blocks_active_slot`, `uq_branches_name` y `uq_customers_rut` según §4. Una generación. **Código (cuarto archivo):** `src/server/taller/customers.ts` — el `onConflictDoNothing` del alta apunta a (`branch_id`, `rut`), el índice nuevo (si no, PostgreSQL responde `42P10`). **Valores esperados que cambian (declarados, BG-D43):** cinco pruebas de `customers.test.ts` afirmaban el RUT único global de la fase 1 entre dos sucursales; FASE §5 lo hace por sucursal, así que pasan a afirmar que el mismo RUT en otra sucursal se acepta sin ver la ficha ajena y que en la misma se rechaza. La paridad corre con `--skip` de ese archivo.
**Reglas:** R-db · NN 1, 5 · No cambia: nombres de índices.
**Done when**
- [ ] WHEN `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` THE SYSTEM SHALL recrear con el mismo nombre `uq_bookings_code` sobre (`branch_id`, `code`), `uq_booking_blocks_active_slot` sobre (`branch_id`, `service_date`, `block_start`) con `is_active = true`, `uq_branches_name` sobre (`shop_id`, `name`) y `uq_customers_rut` sobre (`branch_id`, `rut`) con `rut is not null`, sin tocar tablas ni columnas
- [ ] WHEN Vector Bikes y el Taller Demo reservan la misma fecha y hora THE SYSTEM SHALL aceptar ambas reservas
- [ ] WHEN la misma sucursal recibe un segundo bloque activo en la misma fecha y hora THE SYSTEM SHALL rechazarlo con `23505`
- [ ] WHEN dos talleres guardan un cliente con el mismo RUT, o una sucursal con el mismo nombre THE SYSTEM SHALL aceptarlo, y en el mismo taller SHALL rechazarlo con `23505` nombrando el índice de siempre
- [ ] WHEN corren `foundation.test.ts`, `customers.test.ts`, `users-schema.test.ts` y `concurrency.test.ts` THE SYSTEM SHALL pasar, sin cambios salvo las cinco pruebas de RUT de `customers.test.ts` declaradas (BG-D43)
**Verify**
```bash
pnpm test tests/integration/shops-unique.test.ts tests/integration/foundation.test.ts tests/integration/customers.test.ts tests/integration/users-schema.test.ts tests/integration/concurrency.test.ts   # expect: exit 0, 0 failed
f="$(ls drizzle/*.sql | sort | tail -1)"; grep -q 'DROP INDEX' "$f" && grep -q 'CREATE UNIQUE INDEX' "$f" && { grep -Eq 'DROP TABLE|DROP COLUMN|CREATE TABLE|RENAME' "$f"; test $? -eq 1; }   # expect: exit 0
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
node scripts/bg-expect-parity.ts --skip tests/integration/customers.test.ts   # expect: exit 0 — solo cambian las cinco pruebas de RUT global declaradas (BG-D43)
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
u="$(git ls-files --others --exclude-standard)" && test -z "$(printf '%s\n' "$u" | grep -E ' 2(\.[^/]*)?$')"   # expect: exit 0 — sin duplicados de iCloud
git add -- src/server/db/schema.ts src/server/db/schema-taller.ts src/server/taller/customers.ts tests/integration/shops-unique.test.ts tests/integration/customers.test.ts drizzle
git commit -m "feat: bg-10 make unique indexes per shop" && git tag bg-10
git tag -l bg-10 | grep -qx bg-10   # expect: exit 0
```

#### BG-11 — Contract C: CHECK relajados y ventana V-BG3 (E1-T11)
**Archivos:** `src/server/db/schema.ts` · `tests/integration/shops-checks.test.ts` (nuevo) · `docs/ventanas/bg-v3.md` (nuevo)
**Hacer:** reemplazar `bookings_fee_check` y `bookings_retiro_address_check` por los de §4 (salen de `schema.ts` los literales `Vitacura` y `Las Condes`). `bg-v3.md`: las cuatro migraciones de BG-09 (dos, BG-D42), BG-10 y BG-11 (nombres reales), el aviso de cambio destructivo que mostrará Replit, precondición `pnpm bg:backfill --dry-run` con `"pending":0` en producción, pasos y verificación.
**Reglas:** R-db · NN 5 · No cambia: ningún otro CHECK.
**Done when**
- [ ] WHEN `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` THE SYSTEM SHALL reemplazar solo `bookings_fee_check` y `bookings_retiro_address_check` por sus versiones de §4, con cuatro sentencias `ALTER TABLE`
- [ ] WHEN `createBooking` recibe un retiro del Taller Demo en `Ñuñoa` THE SYSTEM SHALL guardarlo con `pickup_fee_clp = 9000`
- [ ] WHEN se guarda una reserva `taller` con `pickup_fee_clp` 100, o un retiro con comuna vacía o sin dirección THE SYSTEM SHALL rechazarla con código `23514`
- [ ] WHEN corren `create-booking.test.ts`, `multi-bike-booking.test.ts` y `manual-booking.test.ts` THE SYSTEM SHALL pasar sin cambios
- [ ] WHEN se lee `docs/ventanas/bg-v3.md` THE SYSTEM SHALL nombrar las cuatro migraciones más nuevas de `drizzle/` y contener `## Precondiciones`, `## Pasos en Replit` y `## Verificación después de publicar`
**Verify**
```bash
pnpm test tests/integration/shops-checks.test.ts tests/integration/create-booking.test.ts tests/integration/multi-bike-booking.test.ts tests/integration/manual-booking.test.ts   # expect: exit 0, 0 failed
f="$(ls drizzle/*.sql | sort | tail -1)"; grep -q 'DROP CONSTRAINT "bookings_fee_check"' "$f" && grep -q 'DROP CONSTRAINT "bookings_retiro_address_check"' "$f" && test "$(grep -c 'ALTER TABLE' "$f")" = 4   # expect: exit 0 — solo las cuatro sentencias de los dos CHECK
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
n=0; for f in $(ls drizzle/*.sql | sort | tail -4); do grep -qF "$(basename "$f")" docs/ventanas/bg-v3.md && n=$((n + 1)); done; test "$n" = 4   # expect: exit 0
grep -qF '## Precondiciones' docs/ventanas/bg-v3.md && grep -qF '## Pasos en Replit' docs/ventanas/bg-v3.md && grep -qF '## Verificación después de publicar' docs/ventanas/bg-v3.md   # expect: exit 0
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
u="$(git ls-files --others --exclude-standard)" && test -z "$(printf '%s\n' "$u" | grep -E ' 2(\.[^/]*)?$')"   # expect: exit 0 — sin duplicados de iCloud
git add -- src/server/db/schema.ts tests/integration/shops-checks.test.ts docs/ventanas/bg-v3.md drizzle
git commit -m "feat: bg-11 relax booking checks and window v-bg3" && git tag bg-11
git tag -l bg-11 | grep -qx bg-11   # expect: exit 0
git ls-files --error-unmatch docs/ventanas/bg-v3.md   # expect: exit 0 — commiteado arriba
```

#### BG-12 — Reserva manual por taller (E1-T12)
**Archivos:** `src/server/taller/manual-booking.ts` · `src/pages/taller/reservas/nueva.astro` · `src/pages/taller/reservas/index.astro` · `tests/integration/manual-booking-isolation.test.ts` (nuevo)
**Hacer:** `createManualBooking` carga `scopeForBranch(db, actor.branchId)`; zod con comunas, tarifa y retiro de `scope.config` (fuera los literales de `manual-booking.ts:49,77`); `createBooking(…, scope)`. `listUpcomingBookings(db, today, days?, branchId?)` y `freeBlocks(…, branchId?)` filtran por sucursal. Las páginas pasan `user.branchId` y muestran comunas y tarifa de la configuración (fuera los literales de `nueva.astro:181,228`).
**Reglas:** R-api · R-tui · R-shops · NN 1, 3 · No cambia: firmas (alcance opcional al final).
**Done when**
- [ ] WHEN el dueño del Taller Demo crea una reserva manual THE SYSTEM SHALL guardarla en su sucursal con las comunas, la tarifa y los horarios del Taller Demo
- [ ] WHEN el dueño de Vector Bikes elige una comuna del Taller Demo THE SYSTEM SHALL rechazarla con el mensaje de comunas de Vector Bikes
- [ ] WHEN `listUpcomingBookings` corre con la sucursal de Vector Bikes THE SYSTEM SHALL no devolver reservas del Taller Demo
- [ ] WHEN se renderiza `/taller/reservas/nueva` para el dueño del Taller Demo THE SYSTEM SHALL mostrar `Ñuñoa`, `Providencia` y `$9.000`, sin `Vitacura`
- [ ] WHEN se renderiza `/taller/reservas` para cada dueño THE SYSTEM SHALL listar solo las reservas de su taller
- [ ] WHEN corren `manual-booking.test.ts`, `auditoria-reservas-taller.test.ts`, `bloques-libres-propia-reserva.test.ts` y `multi-bike-list.test.ts` THE SYSTEM SHALL pasar sin cambios
**Verify**
```bash
pnpm test tests/integration/manual-booking-isolation.test.ts tests/integration/manual-booking.test.ts tests/integration/auditoria-reservas-taller.test.ts tests/integration/bloques-libres-propia-reserva.test.ts tests/integration/multi-bike-list.test.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/taller/manual-booking.ts src/pages/taller/reservas/nueva.astro src/pages/taller/reservas/index.astro tests/integration/manual-booking-isolation.test.ts
git commit -m "feat: bg-12 scope manual bookings by shop" && git tag bg-12
git tag -l bg-12 | grep -qx bg-12   # expect: exit 0
```

#### BG-13 — Reprogramación y agenda de `/admin` por sucursal (E1-T13)
**Archivos:** `src/server/booking/reschedule-booking.ts` · `src/server/admin/agenda.ts` · `src/pages/taller/reservas/[id]/reprogramar.astro` · `src/pages/admin/reservas/[id].astro` · `tests/integration/admin-agenda-isolation.test.ts` (nuevo)
**Hacer:** `rescheduleBooking(…, scope?)` valida con la configuración y lee/escribe por sucursal; en `agenda.ts`, `agendaForDate`, `bookingDetail`, `applyAdminAction`, `listUpcomingBlocks`, `createBlock` y `deleteBlock` reciben `branchId?` al final y filtran por él (`createBlock` lo escribe). Las dos páginas pasan `user.branchId`; una reserva de otra sucursal es 404.
**Reglas:** R-api · R-book · R-shops · NN 3 · No cambia: firmas (sucursal opcional al final).
**Done when**
- [ ] WHEN `bookingDetail` recibe el id de una reserva del Taller Demo con la sucursal de Vector Bikes THE SYSTEM SHALL devolver `null`, y `applyAdminAction` con esa sucursal SHALL no cambiar la fila
- [ ] WHEN `agendaForDate` corre con la sucursal de Vector Bikes THE SYSTEM SHALL devolver solo reservas de Vector Bikes
- [ ] WHEN `rescheduleBooking` mueve una reserva del Taller Demo THE SYSTEM SHALL validar contra los horarios y la capacidad del Taller Demo y dejar los bloques nuevos en su sucursal
- [ ] WHEN el dueño de Vector Bikes pide `/admin/reservas/<id>` o `/taller/reservas/<id>/reprogramar` de una reserva del Taller Demo THE SYSTEM SHALL responder 404
- [ ] WHEN corren `admin-panel.test.ts`, `reschedule-booking.test.ts`, `reschedule-page.test.ts` y `reschedule-notification.test.ts` THE SYSTEM SHALL pasar sin cambios
**Verify**
```bash
pnpm test tests/integration/admin-agenda-isolation.test.ts tests/integration/admin-panel.test.ts tests/integration/reschedule-booking.test.ts tests/integration/reschedule-page.test.ts tests/integration/reschedule-notification.test.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/booking/reschedule-booking.ts src/server/admin/agenda.ts 'src/pages/taller/reservas/[id]/reprogramar.astro' 'src/pages/admin/reservas/[id].astro' tests/integration/admin-agenda-isolation.test.ts
git commit -m "feat: bg-13 scope reschedule and admin agenda by branch" && git tag bg-13
git tag -l bg-13 | grep -qx bg-13   # expect: exit 0
```

#### BG-14 — Mes y bloqueos de `/admin` por sucursal (E1-T14)
**Archivos:** `src/server/admin/month.ts` · `src/pages/admin/index.astro` · `src/pages/admin/bloqueos.astro` · `tests/integration/admin-month-isolation.test.ts` (nuevo)
**Hacer:** `monthOverview(db, month, now, scope?)` con la configuración y la sucursal del alcance; `/admin` y `/admin/bloqueos` cargan `scopeForBranch(db, user.branchId)` y lo pasan a `agendaForDate`, `monthOverview`, `listUpcomingBlocks`, `createBlock` y `deleteBlock`.
**Reglas:** R-api · R-book · R-shops · No cambia: forma de `MonthView`.
**Done when**
- [ ] WHEN `monthOverview` corre con el alcance de Vector Bikes THE SYSTEM SHALL contar solo reservas y bloqueos de Vector Bikes con su capacidad y su horizonte
- [ ] WHEN `monthOverview` corre con el alcance del Taller Demo THE SYSTEM SHALL marcar llenos los días con 2 bicis
- [ ] WHEN el dueño del Taller Demo crea un bloqueo en `/admin/bloqueos` THE SYSTEM SHALL guardarlo con su sucursal, y `/admin/bloqueos` de Vector Bikes SHALL no mostrarlo
- [ ] WHEN el dueño de Vector Bikes intenta borrar un bloqueo del Taller Demo THE SYSTEM SHALL no borrarlo
- [ ] WHEN `/admin` se renderiza para cada dueño THE SYSTEM SHALL mostrar solo las reservas del día de su taller
- [ ] WHEN corren `admin-month.test.ts` y `admin-panel.test.ts` THE SYSTEM SHALL pasar sin cambios
**Verify**
```bash
pnpm test tests/integration/admin-month-isolation.test.ts tests/integration/admin-month.test.ts tests/integration/admin-panel.test.ts tests/integration/admin-layout.test.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/admin/month.ts src/pages/admin/index.astro src/pages/admin/bloqueos.astro tests/integration/admin-month-isolation.test.ts
git commit -m "feat: bg-14 scope admin month and blocks by branch" && git tag bg-14
git tag -l bg-14 | grep -qx bg-14   # expect: exit 0
```

#### BG-15 — Tablero, indicadores y recepción desde reserva (E1-T15)
**Archivos:** `src/server/taller/dashboard.ts` · `src/server/taller/indicators-customers.ts` · `src/server/taller/booking-reception.ts` · `src/server/taller/orders.ts` · `tests/integration/taller-bookings-isolation.test.ts` (nuevo)
**Hacer:** toda lectura de `bookings`, `booking_blocks` y `booking_bikes` en estos cuatro módulos filtra por `actor.branchId` (`activeBookings` del tablero, `bookingIndicators`, `nextBookingReception`, y las tres lecturas de reservas de `orders.ts`, entre ellas la de `startReception` con `bookingId`).
**Reglas:** R-dom · R-shops · NN 13 · No cambia: firmas, forma de los resultados.
**Done when**
- [ ] WHEN `adminDashboard` corre para el dueño de Vector Bikes THE SYSTEM SHALL contar como reservas activas solo las de su sucursal
- [ ] WHEN `bookingIndicators` corre para el dueño de Vector Bikes THE SYSTEM SHALL no contar reservas del Taller Demo
- [ ] WHEN `nextBookingReception` recibe el id de una reserva del Taller Demo con un usuario de Vector Bikes THE SYSTEM SHALL devolver `null`
- [ ] WHEN `startReception` recibe un `bookingId` de otro taller THE SYSTEM SHALL devolver `ok: false` sin crear la orden
- [ ] WHEN corren `dashboard.test.ts`, `indicators.test.ts`, `reception.test.ts`, `recepcion-finalizada.test.ts` y `multi-bike-reception.test.ts` THE SYSTEM SHALL pasar sin cambios
- [ ] WHEN corre `pnpm test:tablet e2e/recepcion-inicio.spec.ts e2e/recepcion-completa.spec.ts` THE SYSTEM SHALL pasar
**Verify**
```bash
pnpm test tests/integration/taller-bookings-isolation.test.ts tests/integration/dashboard.test.ts tests/integration/indicators.test.ts tests/integration/reception.test.ts tests/integration/recepcion-finalizada.test.ts tests/integration/multi-bike-reception.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/taller/orders.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm build && pnpm test:tablet e2e/recepcion-inicio.spec.ts e2e/recepcion-completa.spec.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/taller/dashboard.ts src/server/taller/indicators-customers.ts src/server/taller/booking-reception.ts src/server/taller/orders.ts tests/integration/taller-bookings-isolation.test.ts
git commit -m "feat: bg-15 filter dashboard indicators and reception bookings by branch" && git tag bg-15
git tag -l bg-15 | grep -qx bg-15   # expect: exit 0
```

#### BG-16 — Recordatorios y WhatsApp por sucursal (E1-T16)
**Archivos:** `src/server/email/reminders.ts` · `src/server/whatsapp/service.ts` · `src/server/whatsapp/order-notices.ts` · `tests/integration/reminders-isolation.test.ts` (nuevo)
**Hacer:** `sendReminders(db, now, deps?, scope?)`, `sendPendingReminders(…, scope?)` y `listNotices(db, bookingId, branchId?)` filtran por sucursal; `whatsapp_messages` se inserta con el `branch_id` de la reserva; la lectura de reservas de `order-notices.ts` filtra por la sucursal de la orden. Las tareas siguen llamando sin alcance (un taller) hasta BG-36.
**Reglas:** R-dom · R-shops · NN 4 · No cambia: forma de los resultados `{ sent, failed }`.
**Done when**
- [ ] WHEN `sendReminders` corre con el alcance de Vector Bikes THE SYSTEM SHALL enviar recordatorios solo de reservas de Vector Bikes de mañana
- [ ] WHEN `sendReminders` corre sin alcance en una base con un solo taller THE SYSTEM SHALL comportarse como hoy (`reminders.test.ts` y `tasks.test.ts` sin cambios)
- [ ] WHEN `sendPendingReminders` de WhatsApp corre con el alcance del Taller Demo THE SYSTEM SHALL crear `whatsapp_messages` solo para sus reservas, con su `branch_id`
- [ ] WHEN `listNotices` recibe el id de una reserva de otro taller THE SYSTEM SHALL devolver una lista vacía
- [ ] WHEN corren `whatsapp.test.ts`, `whatsapp-orden.test.ts` y `qc-whatsapp.test.ts` THE SYSTEM SHALL pasar sin cambios
**Verify**
```bash
pnpm test tests/integration/reminders-isolation.test.ts tests/integration/reminders.test.ts tests/integration/tasks.test.ts tests/integration/whatsapp.test.ts tests/integration/whatsapp-orden.test.ts tests/integration/qc-whatsapp.test.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts --base 8bca898 --skip tests/integration/customers.test.ts   # expect: exit 0 — cierre de la etapa 1: ninguna expectativa cambió desde la base salvo las cinco de RUT declaradas (BG-D43)
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/email/reminders.ts src/server/whatsapp/service.ts src/server/whatsapp/order-notices.ts tests/integration/reminders-isolation.test.ts
git commit -m "feat: bg-16 scope reminders and whatsapp by branch" && git tag bg-16
git tag -l bg-16 | grep -qx bg-16   # expect: exit 0
```

---

### Épica 02 — Identidad (etapa 2)

Desde aquí los valores esperados pueden cambiar **solo** donde cada paso lo declara. Los cambios declarados son siempre de uno de estos tipos: la línea `Gestionado con Llave 15` al pie de correos y páginas del cliente; el remitente `<Taller> · Llave 15 <…>`; los títulos y la marca del personal que pasan a `Llave 15`; la URL del logo, que pasa de `/brand/vector-bikes-logo.png` a `/vector-bikes/logo`; en el sub-bloque de identidad visual, el `descriptor` de `PLATFORM` y el conjunto de tokens de `layouts.test.ts` (BG-47), y la marca del menú y la línea `<Taller> · Gestionado con Llave 15` (BG-49). Los valores de Vector Bikes (nombre, dirección, comunas, tarifas, horarios) no cambian. Las pruebas que dejan de importar `src/lib/site.ts` lo hacen según el reparto del encabezado de este documento: solo cambia su línea de import (al accesorio `SITE` de `tests/helpers/shops.ts`) o el armado de la marca, nunca la cola de un matcher.

#### BG-17 — Perfil del taller, marca de correo y logo (E2-T1)
**Archivos:** `src/server/shops/profile.ts` (nuevo) · `src/server/email/brand.ts` (nuevo) · `src/lib/platform.ts` (nuevo) · `src/pages/[slug]/logo.ts` (nuevo) · `tests/integration/shop-profile.test.ts` (nuevo)
**Hacer:** `profile.ts`: `ShopProfile` (`shopId`, `slug`, `name`, `email`, `notifyEmail`, `phone`, `phoneDisplay`, `streetAddress`, `addressShort`, `locality`, `region`, `mapsUrl`, `instagramUrl`, `instagramHandle` = `@` + último segmento de `instagram_url`, `logoKey`, `logoPath` = `/<slug>/logo` o `null`, `certifications`, `receptionHours`, `pickupHours`), `profileForBranch`, `profileBySlug`, `profileForCancelToken` (hash de `tokens.ts`), `profileForShareToken(db, "seguimiento" | "informe" | "aprobacion", token)` (hash de `share-tokens.ts` contra `order_tracking_tokens`, `service_reports.share_token_hash` y `work_order_approvals.token_hash`). `platform.ts`: `PLATFORM = { name: "Llave 15", domain: "llave15.cl", footerLine: "Gestionado con Llave 15" } as const`. `brand.ts`: `EmailBrand`, `emailBrand(profile)`, `senderFor(profile, emailFrom)` (toma la dirección entre `<>` de `EMAIL_FROM`, o todo si no hay). `[slug]/logo.ts`: GET; `getStorage()`; 404 sin taller, sin logo o con slug reservado.
**Reglas:** R-shops · R-api · RC 14 · No cambia: nada existente.
**Done when**
- [ ] WHEN `profileForBranch` recibe la sucursal del Taller Demo THE SYSTEM SHALL devolver su nombre, contacto, dirección, horarios, correo de avisos y `instagramHandle` igual a `@tallerdemo`
- [ ] WHEN `profileForCancelToken`, o `profileForShareToken` con `seguimiento`, `informe` o `aprobacion`, reciben un token válido de una reserva u orden del Taller Demo THE SYSTEM SHALL devolver el perfil del Taller Demo, y con un token desconocido SHALL devolver `null`
- [ ] WHEN `senderFor` recibe el perfil `Taller Demo` y `Vector Bikes <reservas@send.vectorbikes.cl>` THE SYSTEM SHALL devolver `Taller Demo · Llave 15 <reservas@send.vectorbikes.cl>`
- [ ] WHEN `emailBrand` recibe un perfil THE SYSTEM SHALL devolver `replyTo` igual al correo del taller, `notifyEmail` igual a su correo de avisos y `footerLine` igual a `Gestionado con Llave 15`
- [ ] WHEN se pide `GET /vector-bikes/logo` con `logo_key` guardado THE SYSTEM SHALL responder 200 con la imagen y `cache-control: public, max-age=86400`, y un taller sin logo o un slug desconocido SHALL responder 404
- [ ] WHEN se lee `src/lib/platform.ts` THE SYSTEM SHALL exportar `PLATFORM` con `name` igual a `Llave 15`
**Verify**
```bash
pnpm test tests/integration/shop-profile.test.ts   # expect: exit 0, 0 failed
grep -qF 'name: "Llave 15"' src/lib/platform.ts   # expect: exit 0
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/shops/profile.ts src/server/email/brand.ts src/lib/platform.ts 'src/pages/[slug]/logo.ts' tests/integration/shop-profile.test.ts
git commit -m "feat: bg-17 add shop profile email brand and logo route" && git tag bg-17
git tag -l bg-17 | grep -qx bg-17   # expect: exit 0
```

#### BG-18 — Correos de reserva con la marca del taller (E2-T2)
**Archivos:** `src/server/email/booking/templates.ts` (nuevo) · `src/server/email/templates.ts` · `src/server/email/notifications.ts` · `src/server/email/reminders.ts` · `tests/integration/booking-emails-isolation.test.ts` (nuevo)
**Siembra y firma declaradas (no cuentan):** `tests/helpers/shops.ts` (siembra: agrega `vectorBikesBrand()` y el accesorio `SITE` de §4); `tests/unit/multi-bike-email.test.ts` y `tests/integration/email.test.ts` (pasan `vectorBikesBrand()` como primer argumento); `tests/unit/rescheduled-email.test.ts` (pasa la marca y **deja de importar `src/lib/site.ts`**: su `import { SITE }` pasa a `../helpers/shops.ts`, sin tocar ninguna expectativa); `tests/unit/email-brand.test.ts` (arma la marca con los valores que hoy fija su `vi.mock` de `src/lib/site.ts` y la pasa a las plantillas de reserva; el `vi.mock` sigue hasta BG-20 porque la prueba también cubre plantillas de la orden).
**Valores esperados que cambian (declarados):** la línea final `Gestionado con Llave 15` en `text` y `html`; el remitente `Vector Bikes · Llave 15 <reservas@send.vectorbikes.cl>`; la URL del logo `/vector-bikes/logo`. Nada más.
**Hacer:** mover `customerConfirmationEmail`, `shopNewBookingEmail`, `bookingRescheduledEmail`, `shopRescheduledEmail`, `reminderEmail` y `shopCancellationEmail` a `email/booking/templates.ts`, con `brand: EmailBrand` como primer argumento (nombre, dirección, horario, logo, pie; `templates.ts:257` usa el nombre del perfil); `notifications.ts` resuelve `profileForBranch(db, booking.branchId)`, arma `from`, `replyTo` y la copia a `notifyEmail`, y el ICS con la dirección del perfil; `reminders.ts` pasa la marca de cada reserva.
**Reglas:** R-dom · RC 6, 14 · NN 4 · No cambia: asuntos, condiciones de envío, envío post-commit.
**Done when**
- [ ] WHEN una reserva del Taller Demo se crea THE SYSTEM SHALL enviar la confirmación al cliente con remitente `Taller Demo · Llave 15 <reservas@send.vectorbikes.cl>`, `Reply-To` igual al correo del Taller Demo, el nombre y la dirección del Taller Demo en el cuerpo y en el ICS, y la línea `Gestionado con Llave 15`
- [ ] WHEN una reserva del Taller Demo se crea, cancela o reprograma THE SYSTEM SHALL mandar la copia al correo de avisos del Taller Demo y no a `SHOP_NOTIFY_EMAIL`
- [ ] WHEN una reserva de Vector Bikes se crea THE SYSTEM SHALL producir el mismo asunto y cuerpo de hoy más la línea final `Gestionado con Llave 15`
- [ ] WHEN `reminderEmail` arma el recordatorio de una reserva del Taller Demo THE SYSTEM SHALL decir `Te recordamos tu reserva en Taller Demo.`
- [ ] WHEN corre `node scripts/bg-expect-parity.ts --allow 'Llave 15' --allow '/vector-bikes/logo'` THE SYSTEM SHALL salir 0
- [ ] WHEN se cuentan las líneas de `src/server/email/templates.ts` y `src/server/email/booking/templates.ts` THE SYSTEM SHALL tener menos de 400 cada uno
**Verify**
```bash
pnpm test tests/integration/booking-emails-isolation.test.ts tests/integration/email.test.ts tests/unit/multi-bike-email.test.ts tests/unit/rescheduled-email.test.ts tests/unit/email-brand.test.ts tests/integration/cancel-flow.test.ts tests/integration/reschedule-notification.test.ts tests/integration/reminders.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/email/templates.ts | tr -d ' ')" -lt 400 && test "$(wc -l < src/server/email/booking/templates.ts | tr -d ' ')" -lt 400   # expect: exit 0
node scripts/bg-expect-parity.ts --allow 'Llave 15' --allow '/vector-bikes/logo'   # expect: exit 0 — solo cambian expectativas declaradas
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/email/booking/templates.ts src/server/email/templates.ts src/server/email/notifications.ts src/server/email/reminders.ts tests/integration/booking-emails-isolation.test.ts tests/helpers/shops.ts tests/unit/multi-bike-email.test.ts tests/unit/rescheduled-email.test.ts tests/unit/email-brand.test.ts tests/integration/email.test.ts
git commit -m "feat: bg-18 brand booking emails per shop" && git tag bg-18
git tag -l bg-18 | grep -qx bg-18   # expect: exit 0
```

#### BG-19 — Correos de recepción y de retiro (E2-T3)
**Archivos:** `src/server/email/garage/templates.ts` (nuevo) · `src/server/email/templates.ts` · `src/server/taller/reception.ts` · `src/server/taller/qc.ts` · `tests/integration/order-emails-isolation.test.ts` (nuevo)
**Firma declarada (no cuenta):** `tests/unit/tracking-in-emails.test.ts` (pasa la marca); `tests/unit/received-email.test.ts`, `tests/unit/ready-email.test.ts` y `tests/unit/pricing-emails.test.ts` (pasan la marca y **dejan de importar `src/lib/site.ts`**: su `import { SITE }` pasa a `../helpers/shops.ts`, sin tocar ninguna expectativa); `tests/unit/email-brand.test.ts` (pasa a `receivedBikeEmail` y `readyForPickupEmail` la marca armada con los valores de su `vi.mock`).
**Valores esperados que cambian (declarados):** los mismos tres de BG-18.
**Hacer:** mover `receivedBikeEmail` y `readyForPickupEmail` a `email/garage/templates.ts` con `brand` primero (dirección y horario de recepción del perfil en vez de `SITE` y `RECEPTION_HOURS`); `templates.ts` queda con el render compartido; `reception.ts` y `qc.ts` resuelven `profileForBranch(db, order.branchId)` y envían con remitente, `Reply-To` y copia del taller, después del commit.
**Reglas:** R-dom · RC 6, 14 · NN 13 · No cambia: condiciones de envío, auditoría `notify.*`.
**Done when**
- [ ] WHEN se finaliza la recepción de una orden del Taller Demo THE SYSTEM SHALL enviar `Recibimos tu bicicleta` con el nombre, la dirección y el horario de recepción del Taller Demo, remitente `Taller Demo · Llave 15 <reservas@send.vectorbikes.cl>` y copia a su correo de avisos
- [ ] WHEN una orden del Taller Demo queda lista para retirar THE SYSTEM SHALL enviar el aviso con la marca del Taller Demo y la línea `Gestionado con Llave 15`
- [ ] WHEN las plantillas reciben la marca de Vector Bikes THE SYSTEM SHALL producir el mismo `subject`, `html` y `text` de hoy más la línea `Gestionado con Llave 15`
- [ ] WHEN corre `pnpm test:tablet e2e/recepcion-completa.spec.ts e2e/control-calidad.spec.ts` THE SYSTEM SHALL pasar
- [ ] WHEN corre `node scripts/bg-expect-parity.ts --allow 'Llave 15' --allow '/vector-bikes/logo'` THE SYSTEM SHALL salir 0
- [ ] WHEN se cuentan las líneas de `reception.ts`, `qc.ts`, `templates.ts` y `garage/templates.ts` THE SYSTEM SHALL tener menos de 400 cada uno
**Verify**
```bash
pnpm test tests/integration/order-emails-isolation.test.ts tests/unit/received-email.test.ts tests/unit/ready-email.test.ts tests/unit/tracking-in-emails.test.ts tests/unit/pricing-emails.test.ts tests/unit/email-brand.test.ts tests/integration/received-notification.test.ts tests/integration/ready-notification.test.ts   # expect: exit 0, 0 failed
for f in src/server/taller/reception.ts src/server/taller/qc.ts src/server/email/templates.ts src/server/email/garage/templates.ts; do test "$(wc -l < "$f" | tr -d ' ')" -lt 400 || echo "$f"; done | grep -q .; test $? -eq 1   # expect: 1 = ningún archivo llega a 400 → la línea sale 0
pnpm build && pnpm test:tablet e2e/recepcion-completa.spec.ts e2e/control-calidad.spec.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts --allow 'Llave 15' --allow '/vector-bikes/logo'   # expect: exit 0 — solo cambian expectativas declaradas
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/email/garage/templates.ts src/server/email/templates.ts src/server/taller/reception.ts src/server/taller/qc.ts tests/integration/order-emails-isolation.test.ts tests/unit/received-email.test.ts tests/unit/ready-email.test.ts tests/unit/tracking-in-emails.test.ts tests/unit/pricing-emails.test.ts tests/unit/email-brand.test.ts
git commit -m "feat: bg-19 brand received and ready emails per shop" && git tag bg-19
git tag -l bg-19 | grep -qx bg-19   # expect: exit 0
```

#### BG-20 — Cotización y aviso de repuesto (E2-T4)
**Archivos:** `src/server/email/order-templates.ts` · `src/server/taller/quotes.ts` · `src/server/taller/part-notice.ts` · `tests/integration/quote-part-emails-isolation.test.ts` (nuevo)
**Firma declarada (no cuenta):** `tests/unit/quote-email.test.ts` y `tests/unit/pricing-emails.test.ts` (pasan la marca); `tests/unit/part-added-email.test.ts` (pasa la marca y **deja de importar `src/lib/site.ts`**: su `import { SITE }` pasa a `../helpers/shops.ts`, sin tocar ninguna expectativa); `tests/unit/email-brand.test.ts` (pasa a `quoteEmail` la marca armada con los valores de su `vi.mock` y, como ya ninguna plantilla que prueba usa `SITE`, **quita el `vi.mock` de `src/lib/site.ts`**; sus expectativas no cambian).
**Valores esperados que cambian (declarados):** los mismos tres de BG-18.
**Hacer:** `quoteEmail` y `partAddedEmail` reciben `brand` primero (fuera `SITE.name` de `order-templates.ts:49,145`); `quotes.ts` y `part-notice.ts` resuelven el perfil por la sucursal de la orden.
**Reglas:** R-dom · RC 6, 14 · NN 17 · No cambia: los correos nunca llevan costos ni márgenes.
**Done when**
- [ ] WHEN se envía la cotización de una orden del Taller Demo THE SYSTEM SHALL usar el nombre del Taller Demo en el asunto y el cuerpo, su remitente y su copia de avisos
- [ ] WHEN se agrega un repuesto a una orden del Taller Demo THE SYSTEM SHALL enviar `Agregamos un repuesto a tu orden` con la marca del Taller Demo y la línea `Gestionado con Llave 15`
- [ ] WHEN las dos plantillas reciben la marca de Vector Bikes THE SYSTEM SHALL producir el mismo `subject`, `html` y `text` de hoy más la línea `Gestionado con Llave 15`
- [ ] WHEN corre `node scripts/bg-expect-parity.ts --allow 'Llave 15' --allow '/vector-bikes/logo'` THE SYSTEM SHALL salir 0
**Verify**
```bash
pnpm test tests/integration/quote-part-emails-isolation.test.ts tests/unit/quote-email.test.ts tests/unit/part-added-email.test.ts tests/unit/pricing-emails.test.ts tests/unit/email-brand.test.ts tests/integration/quotes.test.ts tests/integration/part-notice.test.ts   # expect: exit 0, 0 failed
grep -q 'lib/site.ts' tests/unit/email-brand.test.ts tests/unit/part-added-email.test.ts; test $? -eq 1   # expect: 1 = ya no importan ni mockean src/lib/site.ts → la línea sale 0
node scripts/bg-expect-parity.ts --allow 'Llave 15' --allow '/vector-bikes/logo'   # expect: exit 0 — solo cambian expectativas declaradas
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/email/order-templates.ts src/server/taller/quotes.ts src/server/taller/part-notice.ts tests/integration/quote-part-emails-isolation.test.ts tests/unit/quote-email.test.ts tests/unit/part-added-email.test.ts tests/unit/pricing-emails.test.ts tests/unit/email-brand.test.ts
git commit -m "feat: bg-20 brand quote and part added emails per shop" && git tag bg-20
git tag -l bg-20 | grep -qx bg-20   # expect: exit 0
```

#### BG-21 — Cambio de fecha, mantención y resumen diario (E2-T5)
**Archivos:** `src/server/email/order-templates.ts` · `src/server/taller/delivery-notice.ts` · `src/server/taller/maintenance-plan.ts` · `src/server/taller/maintenance.ts` · `tests/integration/notices-isolation.test.ts` (nuevo)
**Firma declarada (no cuenta):** `tests/unit/maintenance-email.test.ts` (pasa la marca); `tests/unit/delivery-date-email.test.ts` (pasa la marca y **deja de importar `src/lib/site.ts`**: su `import { SITE }` pasa a `../helpers/shops.ts`, sin tocar ninguna expectativa).
**Valores esperados que cambian (declarados):** los mismos tres de BG-18.
**Hacer:** `deliveryDateChangedEmail` y `maintenanceReminderEmail` con `brand` primero; `delivery-notice.ts` y `maintenance-plan.ts` resuelven el perfil de cada orden; `sendOverdueDigest` (`maintenance.ts:91-92`) agrupa por sucursal y manda **un correo por taller** con atrasos o stock bajo a su correo de avisos, con el nombre del taller en el asunto; la respuesta conserva `{ ok, overdue, sent, lowStock? }` con los totales.
**Reglas:** R-dom · RC 6, 14 · No cambia: con un taller, el mismo correo de hoy más la línea `Gestionado con Llave 15`.
**Done when**
- [ ] WHEN cambia la fecha de entrega de una orden del Taller Demo THE SYSTEM SHALL enviar `Cambiamos la fecha de entrega` con la marca del Taller Demo y copia a su correo de avisos
- [ ] WHEN se envía el recordatorio de mantención de una orden del Taller Demo THE SYSTEM SHALL usar el nombre y el remitente del Taller Demo
- [ ] WHEN `sendOverdueDigest` corre con órdenes atrasadas en los dos talleres THE SYSTEM SHALL enviar dos correos, cada uno a su correo de avisos y solo con sus órdenes
- [ ] WHEN `sendOverdueDigest` corre con un solo taller THE SYSTEM SHALL responder como hoy (`tasks-maintenance.test.ts` y `low-stock.test.ts` sin cambios de valores)
- [ ] WHEN corre `node scripts/bg-expect-parity.ts --allow 'Llave 15' --allow '/vector-bikes/logo'` THE SYSTEM SHALL salir 0
**Verify**
```bash
pnpm test tests/integration/notices-isolation.test.ts tests/unit/delivery-date-email.test.ts tests/unit/maintenance-email.test.ts tests/integration/delivery-notice.test.ts tests/integration/maintenance-plan.test.ts tests/integration/tasks-maintenance.test.ts tests/integration/low-stock.test.ts tests/integration/tasks-maintenance-reminders.test.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts --allow 'Llave 15' --allow '/vector-bikes/logo'   # expect: exit 0 — solo cambian expectativas declaradas
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/email/order-templates.ts src/server/taller/delivery-notice.ts src/server/taller/maintenance-plan.ts src/server/taller/maintenance.ts tests/integration/notices-isolation.test.ts tests/unit/delivery-date-email.test.ts tests/unit/maintenance-email.test.ts
git commit -m "feat: bg-21 brand notices and send one digest per shop" && git tag bg-21
git tag -l bg-21 | grep -qx bg-21   # expect: exit 0
```

#### BG-22 — Tokens de diseño y layouts del sistema (E2-T6)
**Archivos:** `src/styles/tokens.css` (nuevo) · `src/styles/global.css` · `src/layouts/AppLayout.astro` (nuevo) · `src/layouts/PublicLayout.astro` (nuevo) · `tests/integration/layouts.test.ts` (nuevo)
**Hacer:** mover el bloque `:root` (claro y oscuro) de `global.css` a `tokens.css` **copiando los valores literalmente**; `global.css` lo importa al inicio. `AppLayout`: `<html lang="es-CL">`, fuentes, `tokens.css` y `global.css`, `title`, `noindex` opcional; sin FAQ, JSON-LD, wordmark ni `Base.astro`. `PublicLayout` (sobre `AppLayout`): recibe `profile` ya formateado (nombre, `logoPath`, dirección, correo); encabezado con logo o nombre, pie con `PLATFORM.footerLine`; `noindex` por defecto.
**Reglas:** R-ui · FASE §9 · No cambia: ningún valor de token; `global.css` sigue siendo la excepción de la regla 7.
**Done when**
- [ ] WHEN se lee `src/styles/tokens.css` THE SYSTEM SHALL contener los nueve tokens de `:root` en claro y oscuro con los mismos valores que `global.css` tenía en `8bca898`, y `global.css` SHALL importarlo y ya no declararlos
- [ ] WHEN se comparan los hex de `global.css` y `tokens.css` con los de `global.css` en `8bca898` THE SYSTEM SHALL encontrar exactamente el mismo conjunto
- [ ] WHEN se renderiza `PublicLayout` con el perfil del Taller Demo THE SYSTEM SHALL mostrar `Taller Demo` en el encabezado, la línea `Gestionado con Llave 15` al pie, `noindex` y ningún `application/ld+json`
- [ ] WHEN se renderiza `AppLayout` THE SYSTEM SHALL no incluir el FAQ, el JSON-LD ni el wordmark de la portada
**Verify**
```bash
pnpm test tests/integration/layouts.test.ts   # expect: exit 0, 0 failed
test "$(git show 8bca898:src/styles/global.css | grep -oE '#[0-9A-Fa-f]{6}' | LC_ALL=C sort -u)" = "$(cat src/styles/global.css src/styles/tokens.css | grep -oE '#[0-9A-Fa-f]{6}' | LC_ALL=C sort -u)"   # expect: exit 0 — mismos hex, ninguno nuevo ni perdido
grep -q 'tokens.css' src/styles/global.css   # expect: exit 0
pnpm build && pnpm test:build   # expect: exit 0
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/styles/tokens.css src/styles/global.css src/layouts/AppLayout.astro src/layouts/PublicLayout.astro tests/integration/layouts.test.ts
git commit -m "feat: bg-22 split design tokens and add system layouts" && git tag bg-22
git tag -l bg-22 | grep -qx bg-22   # expect: exit 0
```

#### BG-23 — Páginas por token con la marca del taller (E2-T7)
**Archivos:** `src/pages/seguimiento/[token].astro` · `src/pages/aprobacion/[token].astro` · `src/pages/reservas/cancelar.astro` · `tests/integration/token-pages-isolation.test.ts` (nuevo)
**Valores esperados que cambian (declarados):** la línea `Gestionado con Llave 15` y el cambio de `Base.astro` a `PublicLayout` en esas tres páginas (los títulos siguen `… — <nombre del taller>`, igual para Vector Bikes).
**Hacer:** las tres páginas usan `PublicLayout` y el perfil de `profileForShareToken`/`profileForCancelToken` (dirección, horario de recepción, correo); conservan `no-store`, `noindex`, `no-referrer`, `originForLog` y solo el primer nombre.
**Reglas:** R-api · R-ui · RC 10, 14 · No cambia: comportamiento del token, códigos de respuesta.
**Done when**
- [ ] WHEN se abre `/seguimiento/<token>` de una orden del Taller Demo THE SYSTEM SHALL mostrar el nombre, la dirección y el horario de recepción del Taller Demo, la línea `Gestionado con Llave 15`, `no-store`, `noindex` y `no-referrer`, sin ningún dato de Vector Bikes
- [ ] WHEN se abre `/aprobacion/<token>` de una propuesta del Taller Demo THE SYSTEM SHALL mostrar la marca del Taller Demo
- [ ] WHEN se abre `/reservas/cancelar?token=<token>` de una reserva del Taller Demo THE SYSTEM SHALL mostrar el correo del Taller Demo como contacto
- [ ] WHEN un token no existe THE SYSTEM SHALL responder 404 como hoy
- [ ] WHEN corren `tracking-page.test.ts`, `approval-page.test.ts`, `cancel-flow.test.ts` y `pnpm test:tablet e2e/seguimiento-enlace.spec.ts` THE SYSTEM SHALL pasar, y `node scripts/bg-expect-parity.ts --allow 'Llave 15'` SHALL salir 0
**Verify**
```bash
pnpm test tests/integration/token-pages-isolation.test.ts tests/integration/tracking-page.test.ts tests/integration/approval-page.test.ts tests/integration/cancel-flow.test.ts   # expect: exit 0, 0 failed
pnpm build && pnpm test:tablet e2e/seguimiento-enlace.spec.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts --allow 'Llave 15'   # expect: exit 0 — solo cambian expectativas declaradas
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- 'src/pages/seguimiento/[token].astro' 'src/pages/aprobacion/[token].astro' src/pages/reservas/cancelar.astro tests/integration/token-pages-isolation.test.ts
git commit -m "feat: bg-23 brand token pages per shop" && git tag bg-23
git tag -l bg-23 | grep -qx bg-23   # expect: exit 0
```

#### BG-24 — Informe, etiqueta y textos de la orden (E2-T8)
**Archivos:** `src/pages/informe/[token].astro` · `src/components/taller/ReportView.astro` · `src/pages/taller/ordenes/[id]/informe.astro` · `src/server/taller/label.ts` · `tests/integration/report-brand-isolation.test.ts` (nuevo)
**Firma declarada (no cuenta):** `tests/integration/report-view-brand.test.ts` (pasa a `ReportView` la marca armada con los valores que hoy fija su `vi.mock` de `src/lib/site.ts` y, como `ReportView` ya no usa `SITE`, **quita ese `vi.mock` y deja de importar `src/lib/site.ts`**; sus expectativas no cambian).
**Valores esperados que cambian (declarados):** `Gestionado con Llave 15`; logo `/vector-bikes/logo`; títulos del personal `… — Llave 15` en `taller/ordenes/[id]/informe.astro` y en la etiqueta (`Etiqueta <número> — Llave 15`).
**Hacer:** `ReportView` recibe `brand` ya formateado (nombre, `addressShort`, correo, teléfono, certificaciones, `logoPath`) en vez de `SITE` (líneas 117-118); `/informe/[token]` usa `PublicLayout` y el perfil del token; el texto de WhatsApp de `taller/ordenes/[id]/informe.astro:111` usa el nombre del perfil de la sucursal del usuario; títulos del personal con `PLATFORM.name`.
**Reglas:** R-ui · R-tui · R-api · RC 14 · No cambia: snapshot v1 del informe, tokens.
**Done when**
- [ ] WHEN se abre `/informe/<token>` de una orden del Taller Demo THE SYSTEM SHALL mostrar el nombre, la dirección, el correo, el teléfono y las certificaciones del Taller Demo, su logo si lo tiene, y la línea `Gestionado con Llave 15`
- [ ] WHEN se abre el informe de una orden de Vector Bikes THE SYSTEM SHALL mostrar los mismos datos de hoy, con el logo servido desde `/vector-bikes/logo`
- [ ] WHEN el personal del Taller Demo abre `/taller/ordenes/<id>/informe` THE SYSTEM SHALL armar el texto de WhatsApp con `en Taller Demo` y titular la página con `— Llave 15`
- [ ] WHEN se genera la etiqueta de una orden THE SYSTEM SHALL titularla `Etiqueta <número> — Llave 15`
- [ ] WHEN corren `report-page.test.ts`, `report-view.test.ts`, `report-page-brand.test.ts`, `report-view-brand.test.ts`, `label.test.ts` y `pnpm test:tablet e2e/etiqueta.spec.ts` THE SYSTEM SHALL pasar, y `node scripts/bg-expect-parity.ts --allow 'Llave 15' --allow '/vector-bikes/logo'` SHALL salir 0
**Verify**
```bash
pnpm test tests/integration/report-brand-isolation.test.ts tests/integration/report-page.test.ts tests/integration/report-view.test.ts tests/integration/report-page-brand.test.ts tests/integration/report-view-brand.test.ts tests/integration/label.test.ts tests/integration/informe-mantencion-page.test.ts   # expect: exit 0, 0 failed
grep -q 'lib/site.ts' tests/integration/report-view-brand.test.ts; test $? -eq 1   # expect: 1 = ya no mockea src/lib/site.ts → la línea sale 0
pnpm build && pnpm test:tablet e2e/etiqueta.spec.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts --allow 'Llave 15' --allow '/vector-bikes/logo'   # expect: exit 0 — solo cambian expectativas declaradas
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- 'src/pages/informe/[token].astro' src/components/taller/ReportView.astro 'src/pages/taller/ordenes/[id]/informe.astro' src/server/taller/label.ts tests/integration/report-brand-isolation.test.ts tests/integration/report-view-brand.test.ts
git commit -m "feat: bg-24 brand report label and order texts per shop" && git tag bg-24
git tag -l bg-24 | grep -qx bg-24   # expect: exit 0
```

#### BG-25 — Isla de reserva por props (E2-T9)
**Archivos:** `src/components/islands/BookingIsland.tsx` · `src/components/islands/booking-state.ts` · `src/components/islands/BookingFields.tsx` · `src/components/Landing.astro` · `tests/unit/island-shop.test.ts` (nuevo)
**Firma declarada (no cuenta):** `tests/unit/booking-state.test.ts`.
**Hacer:** `IslandShop` (`slug`, `name`, `addressShort`, `pickupEnabled`, `pickupComunas`, `pickupFeeClp`, `horizonDays`, `blockMinutes`, `codePrefix`, `privacyHref`); `BookingIsland` recibe `shop` y lo pone en un `ShopContext` de Preact (creado en `booking-state.ts`) para los hijos; `booking-state.ts:263,339,347` y `BookingFields.tsx:161,185,205` usan el taller (comunas, tarifa, `consentTexts(name)`). `Landing.astro` pasa `shop` armado con `SITE` y las constantes de `rules.ts` (transitorio hasta BG-26). La isla todavía no envía `taller` (BG-30).
**Reglas:** R-ui · RC 14 · No cambia: comportamiento de la isla con Vector Bikes; ninguna isla nueva.
**Done when**
- [ ] WHEN `booking-state` arma el formulario con las props del Taller Demo THE SYSTEM SHALL ofrecer `Ñuñoa` y `Providencia` como comunas y mostrar el retiro a `$9.000`
- [ ] WHEN las props dicen `pickupEnabled: false` THE SYSTEM SHALL no ofrecer el retiro
- [ ] WHEN `consentTexts` recibe `Taller Demo` THE SYSTEM SHALL devolver `Acepto que Taller Demo use estos datos solo para gestionar mi reserva, según el` y `Autorizo que Taller Demo me contacte por WhatsApp al número indicado para coordinar`
- [ ] WHEN la portada se construye THE SYSTEM SHALL renderizar la isla con los valores de Vector Bikes de hoy (`tests/build/landing.test.ts` sin cambios)
- [ ] WHEN corren `booking-state.test.ts` y `node scripts/bg-expect-parity.ts` THE SYSTEM SHALL pasar y salir 0
**Verify**
```bash
pnpm test tests/unit/island-shop.test.ts tests/unit/booking-state.test.ts   # expect: exit 0, 0 failed
pnpm build && pnpm test:build   # expect: exit 0
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/components/islands/BookingIsland.tsx src/components/islands/booking-state.ts src/components/islands/BookingFields.tsx src/components/Landing.astro tests/unit/island-shop.test.ts tests/unit/booking-state.test.ts
git commit -m "feat: bg-25 pass shop props to the booking island" && git tag bg-25
git tag -l bg-25 | grep -qx bg-25   # expect: exit 0
```

#### BG-26 — Contenido del sitio heredado fuera de `src/` (E2-T10)
**Archivos:** `web/vector-bikes/src/content/site.ts` (nuevo) · `src/layouts/Base.astro` · `src/components/Landing.astro` · `src/components/islands/BookingSchedule.tsx` · `src/components/islands/BookingTicket.tsx`
**Hacer:** `site.ts` exporta `VECTOR_BIKES_SITE` (nombre, direcciones, teléfonos, correo, Instagram, mapa, certificaciones, FAQ copiado de `src/lib/faq.ts`, títulos y descripciones de `/` y `/privacidad` copiados de `index.astro` y `privacidad.astro`, el texto del aviso de privacidad, `islandShop` con los valores de reserva de hoy) y `BOOKING_URL = "https://llave15.cl/vector-bikes/reservar"`; solo importa tipos, ningún archivo de `src/`. `Base.astro` y `Landing.astro` toman sus datos de `VECTOR_BIKES_SITE` (excepción de frontera BG-D14); `Base.astro` sigue importando `whatsappHref` de `src/lib/site.ts` hasta BG-27. `BookingSchedule.tsx` (incluida la línea 127) y `BookingTicket.tsx:21` toman nombre, dirección y tarifa de `ShopContext`.
**Reglas:** R-ui · RC 14 · No cambia: HTML construido de la portada.
**Done when**
- [ ] WHEN se lee `web/vector-bikes/src/content/site.ts` THE SYSTEM SHALL exportar `VECTOR_BIKES_SITE` con los datos de la portada y de privacidad de hoy y `BOOKING_URL` igual a `https://llave15.cl/vector-bikes/reservar`
- [ ] WHEN `Base.astro` y `Landing.astro` se renderizan THE SYSTEM SHALL tomar sus datos de `VECTOR_BIKES_SITE` y no de `SITE`
- [ ] WHEN corre `pnpm build && pnpm test:build` THE SYSTEM SHALL pasar sin cambios en `tests/build/landing.test.ts` ni `tests/build/seo.test.ts`
- [ ] WHEN `BookingSchedule` y `BookingTicket` se renderizan THE SYSTEM SHALL tomar el nombre, la dirección y la tarifa del taller del `ShopContext`
- [ ] WHEN se buscan los nueve patrones de la guardia en `Base.astro`, `Landing.astro`, `BookingSchedule.tsx` y `BookingTicket.tsx` THE SYSTEM SHALL no encontrar ninguno
**Verify**
```bash
pnpm build && pnpm test:build   # expect: exit 0
test -z "$(grep -lFI -e 'Vector Bikes' -e 'Vitacura' -e 'Las Condes' -e 'Kennedy' -e 'vectorbikes' -e 'vector.bikes' -e '$15.000' -e '85095780' -e '8509 5780' src/layouts/Base.astro src/components/Landing.astro src/components/islands/BookingSchedule.tsx src/components/islands/BookingTicket.tsx)"   # expect: exit 0
grep -Eq '(^|[^_A-Z])SITE\.' src/layouts/Base.astro src/components/Landing.astro; test $? -eq 1   # expect: 1 = ningún uso de la constante SITE (VECTOR_BIKES_SITE no cuenta) → la línea sale 0
grep -qF 'https://llave15.cl/vector-bikes/reservar' web/vector-bikes/src/content/site.ts   # expect: exit 0
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- web/vector-bikes/src/content/site.ts src/layouts/Base.astro src/components/Landing.astro src/components/islands/BookingSchedule.tsx src/components/islands/BookingTicket.tsx
git commit -m "refactor: bg-26 move vector bikes site content out of src" && git tag bg-26
git tag -l bg-26 | grep -qx bg-26   # expect: exit 0
```

#### BG-27 — Páginas heredadas, marca del personal y fin de `SITE` (E2-T11) — excepción declarada
**Archivos (excepción mecánica, BG-D6):** `src/pages/index.astro`, `src/pages/privacidad.astro`, `src/pages/404.astro` (contenido de `VECTOR_BIKES_SITE`; 404 con `PLATFORM.name`); `src/lib/faq.ts` (se borra; `Base.astro` importa el FAQ de `VECTOR_BIKES_SITE`); `src/lib/site.ts` (se borra); `src/lib/whatsapp.ts` (nuevo: `whatsappHref` tal cual); `src/layouts/Base.astro` (imports); `src/layouts/TallerLayout.astro` (sobre `AppLayout`, marca `{PLATFORM.name} · Taller`); `src/pages/admin/login.astro` (sobre `AppLayout`, título `Ingresar — Llave 15`); y cada página de `src/pages/taller/**` y `src/pages/admin/**` con `— Vector Bikes` literal o `SITE.name` (lista de §19.6). Regla de reemplazo: en `title=` y en la marca del menú → `PLATFORM.name`; en un texto que va al cliente (WhatsApp, cotización) → nombre del perfil de `profileForBranch(db, user.branchId)`.
**Pruebas existentes de la excepción (firma de import, no cuentan):** las últimas que importan `src/lib/site.ts` (BG-18 a BG-24 ya movieron las demás). `tests/integration/low-stock.test.ts` y `tests/integration/lineas-aviso-repuesto.test.ts`: su `import { SITE } from "../../src/lib/site.ts"` pasa a `import { SITE } from "../helpers/shops.ts"`; `SITE.name` y `SITE.url` siguen dentro de sus expectativas con los mismos valores (las de `low-stock.test.ts` en las líneas 160, 173 y 190), así que ninguna cola de matcher cambia. `tests/build/landing.test.ts`: su import de `whatsappHref` pasa a `../../src/lib/whatsapp.ts`; nada más. `tests/unit/vector-bikes-profile.test.ts` (prueba de esta fase, BG-04): se reescribe para comparar el perfil con `VECTOR_BIKES_SITE` (identidad y `islandShop`: comunas, tarifa, horizonte, bloque, prefijo) y con valores literales en la prueba para horarios, capacidad y antelación; ya no importa `src/lib/site.ts` ni `src/server/booking/rules.ts`, así que BG-28 no la toca.
**Valores esperados que cambian (declarados):** títulos `… — Vector Bikes` y `… · Vector Bikes` del personal y del ingreso → `Llave 15`; marca del menú `Vector Bikes · Taller` → `Llave 15 · Taller`; título del 404 → `Página no encontrada — Llave 15`; y las expectativas de `tests/unit/vector-bikes-profile.test.ts` (prueba de esta fase, `--skip`).
**Reglas:** R-tui · R-ui · R-api · RC 14 · No cambia: rutas, permisos, `global.css`.
**Done when**
- [ ] WHEN se busca `lib/site.ts` en `src/`, `tests/` y `e2e/` THE SYSTEM SHALL no encontrar ningún importador, y `src/lib/site.ts` y `src/lib/faq.ts` SHALL no existir
- [ ] WHEN se renderiza una página de `/taller` o `/admin` THE SYSTEM SHALL titularla con `— Llave 15` y el menú SHALL decir `Llave 15 · Taller`
- [ ] WHEN un texto de esas páginas va al cliente THE SYSTEM SHALL usar el nombre del taller del perfil de la sucursal del usuario
- [ ] WHEN `TallerLayout` y `/admin/login` se renderizan THE SYSTEM SHALL usar `AppLayout` y no `Base.astro`
- [ ] WHEN corren `pnpm test`, `pnpm test:build` y `pnpm test:tablet` THE SYSTEM SHALL pasar, y `node scripts/bg-expect-parity.ts --allow 'Llave 15' --skip tests/unit/vector-bikes-profile.test.ts` SHALL salir 0
- [ ] WHEN se buscan los nueve patrones de la guardia en `src/pages`, `src/layouts` y `src/lib` THE SYSTEM SHALL no encontrar ninguno
**Verify**
```bash
test ! -e src/lib/site.ts && test ! -e src/lib/faq.ts   # expect: exit 0
grep -rq 'lib/site.ts' src tests e2e; test $? -eq 1   # expect: 1 = ningún importador en src, tests ni e2e → la línea sale 0
test -z "$(grep -rlFI -e 'Vector Bikes' -e 'Vitacura' -e 'Las Condes' -e 'Kennedy' -e 'vectorbikes' -e 'vector.bikes' -e '$15.000' -e '85095780' -e '8509 5780' src/pages src/layouts src/lib)"   # expect: exit 0
grep -q 'AppLayout' src/layouts/TallerLayout.astro && { grep -q 'Base.astro' src/layouts/TallerLayout.astro; test $? -eq 1; }   # expect: exit 0
pnpm test   # expect: exit 0, 0 failed
pnpm build && pnpm test:build && pnpm test:tablet   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts --allow 'Llave 15' --skip tests/unit/vector-bikes-profile.test.ts   # expect: exit 0 — solo cambian expectativas declaradas
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -u -- src tests e2e && git add -- src/lib/whatsapp.ts   # -u: solo archivos ya seguidos (también los borrados); nunca duplicados de iCloud sin seguimiento
git commit -m "feat: bg-27 brand staff pages with Llave 15 and remove site constant" && git tag bg-27
git tag -l bg-27 | grep -qx bg-27   # expect: exit 0
```

#### BG-28 — Motor sin constantes del taller y guardia vacía (E2-T12) — excepción declarada
**Archivos (excepción mecánica, BG-D6):** `src/server/booking/rules.ts` (fuera `TIMEZONE` reexportado, `BLOCK_MINUTES`, `DAILY_CAPACITY`, `MIN_NOTICE_MINUTES`, `HORIZON_DAYS`, `PICKUP_FEE_CLP`, `PICKUP_COMUNAS`, `RECEPTION_HOURS`, `PICKUP_HOURS`; quedan `BLOCKS_PER_MODE`, `BookingMode`, `MAX_BIKES_PER_BOOKING`, `blocksFor`, `hoursFor(config, mode, weekday)`); `src/server/booking/config.ts` (fuera `LEGACY_BOOKING_CONFIG`); `src/server/booking/slots.ts` (configuración obligatoria; ya no reexporta `localToday`, `addDays` ni `localToInstant`); todo importador de esos cuatro nombres por las rutas antiguas en `src/`, `scripts/`, `tests/` y `e2e/` (solo la línea de import → `src/lib/time.ts`); `tests/unit/{slots,multi-bike-slots,pickup-hours,ready-email}.test.ts` (firma: configuración de `VECTOR_BIKES_BOOKING_CONFIG`, que se agrega a `tests/helpers/shops.ts`; `ready-email` además cambia su import de `RECEPTION_HOURS` a ese accesorio); `tests/unit/shop-literals-baseline.json` → `{}`.
**Reglas:** R-book · RC 1, 3 · No cambia: ningún resultado del motor; `tests/unit/vector-bikes-profile.test.ts` (ya reescrita en BG-27).
**Done when**
- [ ] WHEN se lee `src/server/booking/rules.ts` THE SYSTEM SHALL no exportar `TIMEZONE`, `BLOCK_MINUTES`, `DAILY_CAPACITY`, `MIN_NOTICE_MINUTES`, `HORIZON_DAYS`, `PICKUP_FEE_CLP`, `PICKUP_COMUNAS`, `RECEPTION_HOURS` ni `PICKUP_HOURS`, y ningún archivo SHALL mencionar `LEGACY_BOOKING_CONFIG`
- [ ] WHEN se llama `computeDay`, `checkStart`, `gridForDate` o `hoursFor` THE SYSTEM SHALL exigir la configuración (tipo obligatorio, `pnpm check` en verde)
- [ ] WHEN se leen `rules.ts` y `slots.ts` THE SYSTEM SHALL no encontrar ninguna reexportación de `TIMEZONE`, `localToday`, `addDays` ni `localToInstant`
- [ ] WHEN se lee `tests/unit/shop-literals-baseline.json` THE SYSTEM SHALL ser `{}` y `grep -rFoI` con los nueve patrones sobre `src/` SHALL no encontrar nada
- [ ] WHEN corre `pnpm test` THE SYSTEM SHALL pasar y `node scripts/bg-expect-parity.ts` SHALL salir 0
**Verify**
```bash
grep -Eq 'export const (TIMEZONE|BLOCK_MINUTES|DAILY_CAPACITY|MIN_NOTICE_MINUTES|HORIZON_DAYS|PICKUP_FEE_CLP|PICKUP_COMUNAS|RECEPTION_HOURS|PICKUP_HOURS)\b' src/server/booking/rules.ts; test $? -eq 1   # expect: 1 = ninguna constante del taller → la línea sale 0
grep -rq 'LEGACY_BOOKING_CONFIG' src scripts tests; test $? -eq 1   # expect: 1 = sin configuración heredada → la línea sale 0
node -e "const fs = require('fs'); const t = fs.readFileSync('src/server/booking/rules.ts', 'utf8') + fs.readFileSync('src/server/booking/slots.ts', 'utf8'); process.exit(/export\s*\{[^}]*\b(TIMEZONE|localToday|addDays|localToInstant)\b[^}]*\}\s*from/s.test(t) ? 1 : 0)"   # expect: exit 0 — sin reexportaciones de tiempo
test "$(node -p "Object.keys(require('./tests/unit/shop-literals-baseline.json')).length")" = 0   # expect: exit 0
test "$(grep -rFoI -e 'Vector Bikes' -e 'Vitacura' -e 'Las Condes' -e 'Kennedy' -e 'vectorbikes' -e 'vector.bikes' -e '$15.000' -e '85095780' -e '8509 5780' src | wc -l | tr -d ' ')" = 0   # expect: exit 0
pnpm check && pnpm test   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts   # expect: exit 0 — solo cambian imports y llamadas
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -u -- src scripts tests e2e   # -u: solo archivos ya seguidos; nunca duplicados de iCloud sin seguimiento
git commit -m "refactor: bg-28 remove shop constants from the booking engine" && git tag bg-28
git tag -l bg-28 | grep -qx bg-28   # expect: exit 0
```

#### Sub-bloque: identidad visual Llave 15 (BG-46 … BG-49)

Se agregó después de la validación (BG-D40): cuatro pasos de la etapa 2 que se construyen **después de BG-28 y antes de BG-29** (dependencias en el mapa y en `tasks.json`); no se renumera nada. Fuente: el manual de marca del dueño (`docs/marca/Manual_de_marca_Llave_15.docx`; imágenes `docs/marca/llave15-portada.png`, `llave15-variantes.png`, `llave15-muestra-orden.png`) y las decisiones BG-D32 … BG-D39. **Regla de entrada:** cada parte del aspecto Llave 15 entra en su paso y nunca antes (marca sin uso en BG-46; tokens y tipos en BG-47; controles, foco, estados e ingreso en BG-48; menú, pie y correos en BG-49); `CLAUDE.md`, `AGENTS.md`, `ui-design.md` y `taller-ui.md` lo dicen con "hasta BG-46 / desde BG-47". **Ámbito (BG-D32):** `AppLayout` pone `class="l15"` en `<html>`; los valores viven en `:root.l15` y las reglas nuevas cuelgan de `.l15` o de `.taller`, así que la portada heredada (`Base.astro`, sin la clase) y `web/vector-bikes/` no cambian, y `global.css` no se toca. **Textos (BG-D39):** ningún texto visible cambia salvo la firma: el `descriptor` nuevo en el ingreso (BG-48), la marca del menú y el pie del cliente y de los correos (BG-49). **Hex:** solo en `src/styles/tokens.css`; los SVG de la marca llevan la paleta literal y su prueba los limita a ella.

#### BG-46 — Marca provisional de Llave 15: distintivo y firma (E2-T13)
**Archivos:** `public/brand/llave15-distintivo.svg` (nuevo) · `public/brand/llave15-firma.svg` (nuevo) · `public/brand/llave15-firma-invertida.svg` (nuevo) · `public/brand/llave15-firma-mono.svg` (nuevo) · `tests/unit/llave15-brand.test.ts` (nuevo)
**Hacer:** dibujar a mano, desde `docs/marca/llave15-portada.png` y `docs/marca/llave15-variantes.png`, cuatro SVG provisionales (BG-D37) sin `<text>`, `<image>`, `<style>`, `<script>`, `font-family` ni referencias externas: la letra es trazo (`<path>`), así DIN Condensed nunca se carga. Cada archivo lleva `xmlns="http://www.w3.org/2000/svg"`, `viewBox`, `role="img"`, `aria-label="Llave 15"` y `<title>Llave 15</title>` como primer hijo, y hex en minúsculas. **Distintivo** (`viewBox="0 0 40 40"`): cuadrado de radio 6 con un corte oblicuo en la esquina superior derecha (el borde superior termina en x = 29 y baja en diagonal hasta (40, 11)), relleno `#ae3718`, con "15" en cifras condensadas en negrita, en trazos, relleno `#ffffff`, centrado. **Firma** (`viewBox="0 0 176 40"`): el distintivo en x 0–40 y `LLAVE 15` en mayúsculas condensadas en negrita, en trazos, desde x = 50 (separación = ¼ del lado del distintivo), alto de mayúscula 26. Variantes: `llave15-firma.svg`, principal, para fondos claros (distintivo `#ae3718` con "15" `#ffffff`, letras `#171c22`); `llave15-firma-invertida.svg`, para grafito (distintivo `#ff774f` con "15" `#171c22`, letras `#ffffff`); `llave15-firma-mono.svg` (distintivo `#171c22` con "15" `#ffffff`, letras `#171c22`). La prueba lee cada archivo, comprueba esas marcas y que sus hex sean un subconjunto de los de su variante, y lo rasteriza con `sharp` (cada firma a 132 px de ancho, el distintivo a 24 px) para probar que es un SVG válido. Ningún archivo de `src/` cambia: nadie los usa todavía.
**Reglas:** R-ui · BG-D37 · No cambia: `public/favicon.svg` ni los archivos de Vector Bikes de `public/brand/` (los copia BG-37 al sitio).
**Done when**
- [ ] WHEN `tests/unit/llave15-brand.test.ts` lee los cuatro SVG de `public/brand/` THE SYSTEM SHALL encontrar en cada uno `xmlns="http://www.w3.org/2000/svg"`, un `viewBox`, `role="img"`, `aria-label="Llave 15"` y `<title>Llave 15</title>`
- [ ] WHEN se buscan `<text`, `<image`, `<style`, `<script` y `font-family` en los cuatro SVG THE SYSTEM SHALL no encontrar ninguno
- [ ] WHEN la prueba extrae los hex de cada SVG THE SYSTEM SHALL encontrar solo `#ae3718` y `#ffffff` en el distintivo, `#ae3718`, `#ffffff` y `#171c22` en la firma principal, `#ff774f`, `#171c22` y `#ffffff` en la invertida, y `#171c22` y `#ffffff` en la monocromática
- [ ] WHEN `sharp` rasteriza cada firma a 132 px de ancho y el distintivo a 24 px THE SYSTEM SHALL producir un PNG de ese ancho sin error
- [ ] WHEN corre `git diff HEAD --name-only -- src` THE SYSTEM SHALL no listar ningún archivo
**Verify**
```bash
pnpm test tests/unit/llave15-brand.test.ts   # expect: exit 0, 0 failed
for f in distintivo firma firma-invertida firma-mono; do test -f "public/brand/llave15-$f.svg" || echo "$f"; done | grep -q .; test $? -eq 1   # expect: 1 = no falta ninguno → la línea sale 0
grep -lE '<text|<image|<style|<script|font-family' public/brand/llave15-distintivo.svg public/brand/llave15-firma.svg public/brand/llave15-firma-invertida.svg public/brand/llave15-firma-mono.svg; test $? -eq 1   # expect: 1 = letra en trazos, sin texto ni estilos → la línea sale 0
d="$(git diff HEAD --name-only -- src)" && test -z "$d"   # expect: exit 0 — ningún archivo de src cambió
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- public/brand/llave15-distintivo.svg public/brand/llave15-firma.svg public/brand/llave15-firma-invertida.svg public/brand/llave15-firma-mono.svg tests/unit/llave15-brand.test.ts
git commit -m "feat: bg-46 add provisional llave 15 brand marks" && git tag bg-46
git tag -l bg-46 | grep -qx bg-46   # expect: exit 0
```

#### BG-47 — Tokens, tipografía Inter y favicon de Llave 15 (E2-T14)
**Archivos:** `src/styles/tokens.css` · `src/layouts/AppLayout.astro` · `public/brand/llave15-favicon-16.svg` (nuevo) · `src/lib/platform.ts` · `tests/integration/llave15-tokens.test.ts` (nuevo)
**Dependencia declarada (comando, no se escribe a mano; BG-D34):** `pnpm add -w --save-exact @fontsource-variable/inter@5.3.0`. La corre la sesión coordinadora en el Mac antes del pase a Codex (el sandbox no tiene red); cambia solo `dependencies` de `package.json` y `pnpm-lock.yaml`, que entran en el Checkpoint.
**Valores esperados que cambian (declarados):** `tests/integration/layouts.test.ts` (prueba de esta fase, BG-22): si compara el conjunto completo de hex o de bloques de `tokens.css`, o el `<html lang="es-CL">` literal, esa expectativa pasa a aceptar el bloque `:root.l15` y `class="l15"`; nada más (`--skip` en la paridad). Si una prueba compara `PLATFORM` completo, gana `descriptor` (`--allow`).
**Hacer:** (1) `tokens.css`: el bloque `:root` y los dos bloques oscuros de BG-22 conservan sus valores; los selectores oscuros pasan a `:root:not([data-theme="light"]):not(.l15)` y `:root[data-theme="dark"]:not(.l15)` (Llave 15 es solo claro, BG-D33). Bloque nuevo `:root.l15`, hex en minúsculas: `--ground` `#f5f4f1`, `--surface` `#ffffff`, `--ink` `#171c22`, `--ink-2` y `--steel` `#515a64`, `--rule` `#d9d9d9`, `--hatch` `#e3e3df`, `--on-ink` `#ffffff`, `--field-border` `#858e97`, `--logo-filter` `none`, `--accent` `#ae3718`, `--accent-hover` `#8d2b13`, `--brand-on-dark` `#ff774f`, `--focus` `#195faf`, `--status-neutral-bg` `#eceff2`, `--status-neutral-ink` `#48525d`, `--status-progress-bg` `#e6eef8`, `--status-progress-ink` `#235285`, `--status-waiting-bg` `#fff2d9`, `--status-waiting-ink` `#734800`, `--status-ready-bg` `#dfefe5`, `--status-ready-ink` `#1a5d3b`, `--status-blocking-bg` `#fbe5e2`, `--status-blocking-ink` `#942b2b`, `--radius-control` `8px`, `--radius-card` `12px`, y `--display`, `--body` y `--mono` = `"Inter Variable", Arial, sans-serif`. (2) `AppLayout`: `<html lang="es-CL" class="l15">`; importa `@fontsource-variable/inter/index.css` y precarga `@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url` (el mismo patrón que `Base.astro` usa con Archivo) en vez de Michroma, Archivo e IBM Plex Mono, cuyos paquetes se quedan para la portada heredada; íconos `<link rel="icon" type="image/svg+xml" href="/brand/llave15-distintivo.svg" />` y `<link rel="icon" type="image/svg+xml" sizes="16x16" href="/brand/llave15-favicon-16.svg" />`. (3) `llave15-favicon-16.svg`: el distintivo simplificado para 16 px (`viewBox="0 0 16 16"`, corte más simple, "15" en trazos gruesos), con las mismas marcas de accesibilidad y las mismas prohibiciones de BG-46, hex `#ae3718` y `#ffffff`. (4) `platform.ts`: `PLATFORM` gana `descriptor: "Software de gestión para talleres de bicicletas"`. La prueba lee `tokens.css` (el mapa exacto de `:root.l15` y los dos selectores con `:not(.l15)`), lee `AppLayout.astro` (importa Inter, no las fuentes del monocromo), renderiza `AppLayout` con la Container API, rasteriza el favicon a 16 px con `sharp` y comprueba `PLATFORM.descriptor`.
**Reglas:** R-ui · BG-D33, BG-D34 · No cambia: `global.css`, `Base.astro`, la portada heredada (`pnpm test:build` sin cambios), ningún componente ni ninguna página.
**Done when**
- [ ] WHEN `tests/integration/llave15-tokens.test.ts` lee `src/styles/tokens.css` THE SYSTEM SHALL encontrar en `:root.l15` exactamente los valores de Llave 15 de este paso y los dos selectores oscuros con `:not(.l15)`
- [ ] WHEN se comparan los hex de `tokens.css` y `global.css` con los de `global.css` en `8bca898` THE SYSTEM SHALL no perder ninguno y sumar exactamente los 19 de la paleta Llave 15
- [ ] WHEN se renderiza `AppLayout` THE SYSTEM SHALL emitir `<html lang="es-CL" class="l15">` y los íconos `/brand/llave15-distintivo.svg` y `/brand/llave15-favicon-16.svg`, y `AppLayout.astro` SHALL importar `@fontsource-variable/inter` y no `@fontsource/michroma`, `@fontsource-variable/archivo` ni `@fontsource/ibm-plex-mono`
- [ ] WHEN se lee `package.json` THE SYSTEM SHALL tener `@fontsource-variable/inter` igual a `5.3.0` en `dependencies`, y `node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2` SHALL existir
- [ ] WHEN `sharp` rasteriza `public/brand/llave15-favicon-16.svg` a 16 px THE SYSTEM SHALL producir un PNG de 16 px sin error, y `PLATFORM.descriptor` SHALL ser `Software de gestión para talleres de bicicletas`
- [ ] WHEN corren `pnpm build && pnpm test:build` y `node scripts/bg-expect-parity.ts --allow 'Software de gestión para talleres de bicicletas' --skip tests/integration/layouts.test.ts` THE SYSTEM SHALL salir 0
**Verify**
```bash
pnpm test tests/integration/llave15-tokens.test.ts tests/integration/layouts.test.ts   # expect: exit 0, 0 failed
test "$(node -p "require('./package.json').dependencies['@fontsource-variable/inter']")" = 5.3.0   # expect: exit 0
test -f node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2   # expect: exit 0
node -e "const { execFileSync } = require('child_process'); const fs = require('fs'); const hex = (t) => new Set((t.match(/#[0-9a-f]{6}/gi) || []).map((h) => h.toLowerCase())); const old = hex(execFileSync('git', ['show', '8bca898:src/styles/global.css'], { encoding: 'utf8' })); const now = hex(fs.readFileSync('src/styles/tokens.css', 'utf8') + fs.readFileSync('src/styles/global.css', 'utf8')); const lost = [...old].filter((h) => !now.has(h)); const added = [...now].filter((h) => !old.has(h)).sort().join(' '); const want = '#171c22 #195faf #1a5d3b #235285 #48525d #515a64 #734800 #858e97 #8d2b13 #942b2b #ae3718 #d9d9d9 #dfefe5 #e6eef8 #eceff2 #f5f4f1 #fbe5e2 #ff774f #fff2d9'; if (lost.length > 0 || added !== want) { console.error('perdidos:', lost.join(' '), 'nuevos:', added); process.exit(1); }"   # expect: exit 0 — ningún hex perdido y exactamente los 19 nuevos
grep -qE '@fontsource/michroma|@fontsource-variable/archivo|@fontsource/ibm-plex-mono' src/layouts/AppLayout.astro; test $? -eq 1   # expect: 1 = AppLayout ya no carga las fuentes del monocromo → la línea sale 0
d="$(git diff HEAD --name-only -- src/styles/global.css src/layouts/Base.astro)" && test -z "$d"   # expect: exit 0 — ni global.css ni Base.astro cambiaron
pnpm build && pnpm test:build   # expect: exit 0 — la portada heredada no cambia
node scripts/bg-expect-parity.ts --allow 'Software de gestión para talleres de bicicletas' --skip tests/integration/layouts.test.ts   # expect: exit 0 — solo cambian expectativas declaradas
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/styles/tokens.css src/layouts/AppLayout.astro public/brand/llave15-favicon-16.svg src/lib/platform.ts tests/integration/llave15-tokens.test.ts tests/integration/layouts.test.ts package.json pnpm-lock.yaml && git add -u -- tests e2e   # -u: solo las pruebas existentes con los valores declarados; nunca duplicados de iCloud sin seguimiento
git commit -m "feat: bg-47 add llave 15 tokens inter type and favicon" && git tag bg-47
git tag -l bg-47 | grep -qx bg-47   # expect: exit 0
```

#### BG-48 — Controles, foco, estados e ingreso de Llave 15 (E2-T15)
**Archivos:** `src/styles/llave15.css` (nuevo) · `src/styles/taller-components.css` · `src/layouts/AppLayout.astro` · `src/pages/admin/login.astro` · `tests/integration/llave15-components.test.ts` (nuevo)
**Hacer:** (1) `llave15.css`, todo bajo `.l15`, sin hex, sin sombras, sin `!important`, menos de 400 líneas: tipos (`h1` 600 28px/36px, `h2` 600 20px/28px, cuerpo 16px/24px, `table.dense` y `.label` 14px/20px; `.label` sin mayúsculas forzadas ni tracking; `font-variant-numeric: tabular-nums` en `table`, `.mono`, `.status` y montos); botones (`.btn`: fondo y borde `var(--accent)`, texto `var(--on-ink)`, radio `var(--radius-control)`; `.btn:hover`: `var(--accent-hover)`; `.btn.ghost`: fondo `var(--surface)`, texto `var(--ink)`, borde `var(--field-border)` y en hover borde `var(--ink)`); controles (`input`, `select`, `textarea`, `button`: radio `var(--radius-control)`, borde `var(--field-border)`); las superficies de `global.css` con radio 2px (tarjetas, ticket, avisos) con `var(--radius-card)`; foco `:focus-visible` con `outline: 2px solid var(--focus)` y `outline-offset: 2px`, y `var(--on-ink)` dentro de `.on-dark`; estados: `.status` (neutro por omisión) y cada `.status--<clase>` fijan `--status-bg` y `--status-ink` de su grupo (BG-D36). Neutro: `reservada`, `recibida`, `entregada`, `cancelada`, `anulada`, `draft`, `published`, `withdrawn`, `sin_dato_verificado`, `no_verificada`. En curso: `diagnostico`, `en_reparacion`, `control_calidad`, `abierta`, `submitted`, `in_review`, `en_revision`. Espera: `esperando_aprobacion`, `esperando_repuesto`, `bajo`, `needs_changes`, `condicionado`, `condicionada`, `desactualizado`, `media`, `baja`. Listo: `lista_para_retirar`, `verificado`, `oficial_confirmada`, `approved`, `alta`, `activo`. Bloqueo: `trabajo_rechazado`, `sin-stock`, `diferencia`, `rejected`, `incompatible`, `suspendido`. (2) `taller-components.css`: `.taller .status` gana `background: var(--status-bg, transparent)`, `color: var(--status-ink, inherit)`, borde `currentColor` y radio `var(--radius-control)`; los bordes dobles pasan de `var(--ink)` a `currentColor`; los rayados usan `var(--status-bg, var(--surface))` en lugar de `var(--surface)`; cada `border-style` y cada `::before` quedan iguales; `.taller .btn` y su hover como en `llave15.css`, `.taller .btn.ghost` neutro; `.card`, `[role="status"]`, `[role="alert"]` y `.lib-category` con `var(--radius-card)`; `.options label` y las fotos con `var(--radius-control)`; `[role="alert"]` con fondo `var(--status-blocking-bg)` y texto `var(--status-blocking-ink)` (incluye "Hay saldo pendiente: registra el pago antes de entregar"); `:focus-visible` como en `llave15.css`. Sigue bajo 400 líneas. (3) `AppLayout`: `import "../styles/llave15.css";` después de `global.css`. (4) `/admin/login`: la firma principal sobre el formulario (`<img src="/brand/llave15-firma.svg" alt="Llave 15" width="176" height="40" />`, con espacio libre de al menos 10 px) y un `<p>` con `PLATFORM.descriptor`; ningún otro texto cambia. La prueba parsea los bloques (selectores y declaraciones) de `llave15.css` y `taller-components.css` y renderiza `/admin/login` con la Container API.
**Reglas:** R-ui · R-tui · BG-D35, BG-D36 · No cambia: `global.css` (excepción de la regla 7, intacto), las formas y las etiquetas de los estados (`biblioteca-pages.test.ts` sin cambios), ningún texto visible salvo el `descriptor` nuevo del ingreso.
**Done when**
- [ ] WHEN `tests/integration/llave15-components.test.ts` lee `src/styles/llave15.css` THE SYSTEM SHALL encontrar cada clase de estado de este paso en exactamente uno de los cinco grupos, con `--status-bg` y `--status-ink` de ese grupo
- [ ] WHEN la prueba lee `src/styles/taller-components.css` THE SYSTEM SHALL encontrar `background: var(--status-bg, transparent)` en `.taller .status` y conservar la regla `.taller .status--<estado>::before` de cada estado de `STATUS_LABELS`
- [ ] WHEN la prueba lee `.l15 .btn` en `llave15.css` y `.taller .btn` en `taller-components.css` THE SYSTEM SHALL encontrar fondo `var(--accent)` y en `:hover` `var(--accent-hover)`, y la regla `:focus-visible` de cada archivo SHALL tener `outline: 2px solid var(--focus)` y `outline-offset: 2px`
- [ ] WHEN se buscan hex en `llave15.css` y `taller-components.css` y `box-shadow` en `llave15.css` THE SYSTEM SHALL no encontrar ninguno
- [ ] WHEN se renderiza `/admin/login` THE SYSTEM SHALL mostrar `<img src="/brand/llave15-firma.svg" alt="Llave 15"` y `Software de gestión para talleres de bicicletas` junto a los textos de hoy del formulario
- [ ] WHEN corren `pnpm build && pnpm test:build && pnpm test:tablet` y `node scripts/bg-expect-parity.ts` THE SYSTEM SHALL salir 0
**Verify**
```bash
pnpm test tests/integration/llave15-components.test.ts tests/integration/biblioteca-pages.test.ts   # expect: exit 0, 0 failed
grep -nE '#[0-9A-Fa-f]{3,8}([^0-9A-Za-z]|$)' src/styles/llave15.css src/styles/taller-components.css; test $? -eq 1   # expect: 1 = ningún hex fuera de tokens.css → la línea sale 0
grep -q 'box-shadow' src/styles/llave15.css; test $? -eq 1   # expect: 1 = sin sombras → la línea sale 0
for f in src/styles/llave15.css src/styles/taller-components.css; do test "$(wc -l < "$f" | tr -d ' ')" -lt 400 || echo "$f"; done | grep -q .; test $? -eq 1   # expect: 1 = ninguno llega a 400 → la línea sale 0
d="$(git diff HEAD --name-only -- src/styles/global.css src/layouts/Base.astro)" && test -z "$d"   # expect: exit 0 — global.css y Base.astro intactos
pnpm build && pnpm test:build && pnpm test:tablet   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/styles/llave15.css src/styles/taller-components.css src/layouts/AppLayout.astro src/pages/admin/login.astro tests/integration/llave15-components.test.ts
git commit -m "feat: bg-48 restyle controls focus and status badges for llave 15" && git tag bg-48
git tag -l bg-48 | grep -qx bg-48   # expect: exit 0
```

#### BG-49 — Firma de Llave 15 en el menú, el pie del cliente y los correos (E2-T16)
**Archivos:** `src/layouts/TallerLayout.astro` · `src/styles/taller-layout.css` · `src/layouts/PublicLayout.astro` · `src/server/email/templates.ts` · `tests/integration/llave15-layouts.test.ts` (nuevo)
**Valores esperados que cambian (declarados):** la marca del menú `Llave 15 · Taller` (BG-27) pasa a la firma `<img … alt="Llave 15">` seguida de `Taller`; la línea `Gestionado con Llave 15` del pie del cliente y de los correos pasa a `<nombre del taller> · Gestionado con Llave 15` (`Vector Bikes · Gestionado con Llave 15` para Vector Bikes). Cambian solo las expectativas que contienen esas cadenas, en las pruebas existentes que las afirman (`git add -u -- tests` en el Checkpoint); nada más (`--allow 'Llave 15'`).
**Hacer:** (1) `TallerLayout`: `<p class="taller-brand">` pasa a `<a class="taller-brand on-dark" href="/taller"><img src="/brand/llave15-firma-invertida.svg" alt="Llave 15" width="132" height="30" /><span class="taller-area">Taller</span></a>`; la línea del usuario (nombre · rol), el menú, sus grupos, enlaces, permisos y `Salir` no cambian. (2) `taller-layout.css`: `.taller .taller-aside` con `background: var(--ink)` y `color: var(--on-ink)` (grafito; en tablet es la barra superior); en escritorio, los enlaces del panel en `var(--on-ink)`, el actual con fondo `var(--surface)` y texto `var(--ink)`, el hover con borde `var(--on-ink)`; el cajón de tablet (`:popover-open` bajo 1024px) sigue en `var(--surface)` con texto `var(--ink)`; `.taller-user` en `var(--on-ink)`; foco blanco dentro del grafito (`.taller-aside :focus-visible`, salvo dentro del cajón abierto); controles del área con `var(--radius-control)` y el cajón con `var(--radius-card)`; espacio libre de la firma de al menos 8px (¼ del distintivo de 30px); los objetivos de 48px y la compactación con mouse quedan iguales. (3) `PublicLayout`: el encabezado con el nombre o el logo del taller no cambia; el pie pasa a `<img src="/brand/llave15-distintivo.svg" alt="" width="24" height="24" />` (decorativo: el texto la nombra) + `{profile.name} · {PLATFORM.footerLine}`. (4) `templates.ts`: el pie compartido escribe `${brand.shopName} · ${brand.footerLine}` en `text` y en `html`, sin imágenes nuevas; si el pie se arma en más de un archivo, detenerse y reportarlo. La prueba renderiza `TallerLayout` y `PublicLayout` con la Container API, lee `taller-layout.css` y arma la confirmación de una reserva del Taller Demo.
**Reglas:** R-ui · R-tui · R-dom · RC 6, 14 · BG-D38, BG-D39 · No cambia: rutas, permisos, textos del menú, asuntos y condiciones de envío de los correos, el encabezado del cliente.
**Done when**
- [ ] WHEN se renderiza `TallerLayout` THE SYSTEM SHALL mostrar `<img src="/brand/llave15-firma-invertida.svg" alt="Llave 15"` con `width="132"` y el texto `Taller`, y los mismos enlaces de menú de hoy para cada rol
- [ ] WHEN `tests/integration/llave15-layouts.test.ts` lee `src/styles/taller-layout.css` THE SYSTEM SHALL encontrar `.taller .taller-aside` con `background: var(--ink)` y `color: var(--on-ink)`, y ningún hex
- [ ] WHEN se renderiza `PublicLayout` con el perfil del Taller Demo THE SYSTEM SHALL mostrar `Taller Demo` en el encabezado y `Taller Demo · Gestionado con Llave 15` al pie junto a `/brand/llave15-distintivo.svg`
- [ ] WHEN se arma la confirmación de una reserva del Taller Demo THE SYSTEM SHALL cerrar `text` y `html` con la línea `Taller Demo · Gestionado con Llave 15`
- [ ] WHEN corren `pnpm test`, `pnpm test:build` y `pnpm test:tablet` completos THE SYSTEM SHALL pasar
- [ ] WHEN corre `node scripts/bg-expect-parity.ts --allow 'Llave 15'` THE SYSTEM SHALL salir 0
**Verify**
```bash
pnpm test tests/integration/llave15-layouts.test.ts tests/integration/layouts.test.ts tests/integration/booking-emails-isolation.test.ts tests/integration/email.test.ts   # expect: exit 0, 0 failed
grep -nE '#[0-9A-Fa-f]{3,8}([^0-9A-Za-z]|$)' src/styles/taller-layout.css; test $? -eq 1   # expect: 1 = ningún hex fuera de tokens.css → la línea sale 0
test "$(wc -l < src/server/email/templates.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm test   # expect: exit 0, 0 failed
pnpm build && pnpm test:build && pnpm test:tablet   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts --allow 'Llave 15'   # expect: exit 0 — solo cambian expectativas declaradas
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/layouts/TallerLayout.astro src/styles/taller-layout.css src/layouts/PublicLayout.astro src/server/email/templates.ts tests/integration/llave15-layouts.test.ts && git add -u -- tests e2e   # -u: solo las pruebas existentes con los valores declarados; nunca duplicados de iCloud sin seguimiento
git commit -m "feat: bg-49 apply llave 15 signature to staff customer and email layouts" && git tag bg-49
git tag -l bg-49 | grep -qx bg-49   # expect: exit 0
```

---

### Épica 03 — Reservas en línea por taller (etapa 3)

#### BG-29 — Slugs reservados y alcance por slug (E3-T1)
**Archivos:** `src/server/shops/slugs.ts` (nuevo) · `src/server/shops/scope.ts` · `tests/unit/reserved-slugs.test.ts` (nuevo) · `tests/integration/scope-by-slug.test.ts` (nuevo)
**Hacer:** `RESERVED_SLUGS` = `taller`, `admin`, `api`, `seguimiento`, `informe`, `aprobacion`, `reservas`, `privacidad`, `plataforma`, `brand`, `_astro`, `_image`, `_server-islands`, `favicon`, `robots`, `sitemap-index`, `sitemap-0`, `404`, `500`, `index`, `www`, `app`, `send`, `mail`, `logo`, `ingresar`; `slugSchema` (zod: formato y largo de `shops_slug_check`, no reservado, mensaje `Ese nombre está reservado.`); `scopeBySlug(db, slug)` → alcance de un taller `activo` o `null`.
**Reglas:** R-shops · No cambia: `scopeForBranch`, `singleShopScope`.
**Done when**
- [ ] WHEN `slugSchema` recibe `taller`, `api`, `admin`, `seguimiento`, `informe`, `aprobacion`, `reservas`, `brand`, `_astro` o `favicon` THE SYSTEM SHALL rechazarlo con el mensaje `Ese nombre está reservado.`
- [ ] WHEN `slugSchema` recibe `Taller Demo`, `ab` o `-demo` THE SYSTEM SHALL rechazarlo, y `taller-demo` SHALL aceptarlo
- [ ] WHEN la prueba lista las entradas de primer nivel de `src/pages/` (salvo las que empiezan con `[`) y de `public/` THE SYSTEM SHALL encontrar cada una, sin extensión, en `RESERVED_SLUGS`
- [ ] WHEN `scopeBySlug` recibe `taller-demo` THE SYSTEM SHALL devolver el alcance del Taller Demo, y con un slug desconocido, reservado o de un taller `suspendido` SHALL devolver `null`
**Verify**
```bash
pnpm test tests/unit/reserved-slugs.test.ts tests/integration/scope-by-slug.test.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/shops/slugs.ts src/server/shops/scope.ts tests/unit/reserved-slugs.test.ts tests/integration/scope-by-slug.test.ts
git commit -m "feat: bg-29 add reserved slugs and scope by slug" && git tag bg-29
git tag -l bg-29 | grep -qx bg-29   # expect: exit 0
```

#### BG-30 — API de reservas por taller (E3-T2)
**Archivos:** `src/server/api/handlers.ts` · `src/server/api/turnstile.ts` · `src/components/islands/BookingIsland.tsx` · `src/components/islands/turnstile.ts` · `tests/integration/api-by-shop.test.ts` (nuevo)
**Hacer:** `taller` opcional en la consulta de disponibilidad y en el cuerpo estricto de la reserva; con `taller`, `scopeBySlug` (`null` → 404 `{ error: "No encontramos ese taller.", code: "shop_not_found" }` antes del rate limit y sin registrar el intento); sin `taller`, `singleShopScope` (si lanza, 422 `validation_error` con `{ taller: "Falta el taller." }`). Rate limit por (`branch_id`, `ip_hash`) e intento guardado con `branch_id`. `verifyTurnstile` devuelve también `cdata`; si viene y no es el `slug`, 403 `turnstile_failed`. La isla envía `taller: shop.slug` en el cuerpo y en `/api/disponibilidad`, y `useTurnstile` pasa `cdata: shop.slug` al widget.
**Reglas:** R-api · R-book · RC 5 · No cambia: forma de las respuestas, orden rate limit → zod → Turnstile.
**Done when**
- [ ] WHEN `GET /api/disponibilidad` llega con `taller=taller-demo` THE SYSTEM SHALL responder 200 con la capacidad y los bloques del Taller Demo y la misma forma de respuesta
- [ ] WHEN `POST /api/reservas` llega con `taller` igual a `taller-demo` y datos válidos THE SYSTEM SHALL responder 201 con `{ code, service_date, start, end, mode, fee }` y la reserva en la sucursal del Taller Demo
- [ ] WHEN `taller` es desconocido, reservado o de un taller `suspendido` THE SYSTEM SHALL responder 404 con código `shop_not_found` sin registrar el intento
- [ ] WHEN una IP hizo 5 intentos en el Taller Demo en 10 minutos THE SYSTEM SHALL responder 429 en el Taller Demo y seguir aceptando esa IP en Vector Bikes
- [ ] WHEN Turnstile devuelve un `cdata` distinto del `slug` del taller pedido THE SYSTEM SHALL responder 403 `turnstile_failed`
- [ ] WHEN la petición no trae `taller` y la base tiene un solo taller THE SYSTEM SHALL usar ese taller (`api.test.ts` sin cambios)
**Verify**
```bash
pnpm test tests/integration/api-by-shop.test.ts tests/integration/api.test.ts tests/integration/api-shop-config.test.ts tests/unit/booking-state.test.ts   # expect: exit 0, 0 failed
pnpm build && pnpm test:build   # expect: exit 0
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/api/handlers.ts src/server/api/turnstile.ts src/components/islands/BookingIsland.tsx src/components/islands/turnstile.ts tests/integration/api-by-shop.test.ts
git commit -m "feat: bg-30 route public booking api by shop slug" && git tag bg-30
git tag -l bg-30 | grep -qx bg-30   # expect: exit 0
```

#### BG-31 — Página `/<slug>/reservar` y privacidad del taller (E3-T3)
**Archivos:** `src/pages/[slug]/reservar.astro` (nuevo) · `src/pages/[slug]/privacidad.astro` (nuevo) · `tests/integration/booking-page.test.ts` (nuevo)
**Hacer:** `reservar.astro`: `prerender = false`, `scopeBySlug` + `profileBySlug` (404 si `null`), `PublicLayout`, `h1` con el nombre, `BookingIsland client:visible` con las props del taller (`privacyHref` = `/<slug>/privacidad`) y `PUBLIC_TURNSTILE_SITE_KEY`; `cache-control: no-store`; indexable. `privacidad.astro`: el texto del aviso de `8bca898:src/pages/privacidad.astro` con los datos del perfil en vez de los literales; `noindex`.
**Reglas:** R-ui · R-api · RC 14 · No cambia: ninguna isla nueva (la de reserva es la misma).
**Done when**
- [ ] WHEN se pide `/taller-demo/reservar` THE SYSTEM SHALL responder 200 con `PublicLayout`, `Taller Demo` en el `h1`, la isla con las props del Taller Demo y la línea `Gestionado con Llave 15`
- [ ] WHEN se pide `/no-existe/reservar` o la página de un taller `suspendido` THE SYSTEM SHALL responder 404
- [ ] WHEN se pide `/vector-bikes/reservar` THE SYSTEM SHALL mostrar la isla con los valores de Vector Bikes
- [ ] WHEN se pide `/taller-demo/privacidad` THE SYSTEM SHALL mostrar el aviso de privacidad con el nombre, la dirección y el correo del Taller Demo, sin datos de Vector Bikes
- [ ] WHEN se pide `/taller-demo/reservar` THE SYSTEM SHALL responder con `cache-control: no-store` y sin `noindex`
**Verify**
```bash
pnpm test tests/integration/booking-page.test.ts   # expect: exit 0, 0 failed
pnpm build && pnpm test:build   # expect: exit 0
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- 'src/pages/[slug]/reservar.astro' 'src/pages/[slug]/privacidad.astro' tests/integration/booking-page.test.ts
git commit -m "feat: bg-31 add per shop booking and privacy pages" && git tag bg-31
git tag -l bg-31 | grep -qx bg-31   # expect: exit 0
```

#### BG-32 — Enlaces a la página de reservas del taller (E3-T4)
**Archivos:** `src/server/taller/maintenance-plan.ts` · `src/pages/taller/index.astro` · `tests/integration/booking-links.test.ts` (nuevo)
**Valores esperados que cambian (declarados):** el enlace del recordatorio de mantención pasa de `/#reserva` (ancla incorrecta hoy, FASE §6) a `/vector-bikes/reservar`.
**Hacer:** `maintenance-plan.ts:217` enlaza a `<sitio>/<slug>/reservar` con el `slug` del perfil de la orden; el enlace de `taller/index.astro` que hoy va a `/#reservar` apunta a `/<slug del taller del usuario>/reservar`.
**Reglas:** R-dom · R-tui · No cambia: el resto del correo.
**Done when**
- [ ] WHEN se envía el recordatorio de mantención de una orden del Taller Demo THE SYSTEM SHALL enlazar a `/taller-demo/reservar` del sitio
- [ ] WHEN se envía el de una orden de Vector Bikes THE SYSTEM SHALL enlazar a `/vector-bikes/reservar` en lugar de `/#reserva`
- [ ] WHEN el personal abre `/taller` THE SYSTEM SHALL apuntar el enlace que hoy va a `/#reservar` a `/<slug de su taller>/reservar`
- [ ] WHEN corre `node scripts/bg-expect-parity.ts --allow '/vector-bikes/reservar'` THE SYSTEM SHALL salir 0
**Verify**
```bash
pnpm test tests/integration/booking-links.test.ts tests/integration/maintenance-plan.test.ts tests/integration/tasks-maintenance-reminders.test.ts tests/integration/dashboard.test.ts   # expect: exit 0, 0 failed
grep -Eq '#reserva([^r]|$)' src/server/taller/maintenance-plan.ts; test $? -eq 1   # expect: 1 = sin el ancla rota (#reservar no cuenta) → la línea sale 0
node scripts/bg-expect-parity.ts --allow '/vector-bikes/reservar'   # expect: exit 0 — solo cambian expectativas declaradas
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/taller/maintenance-plan.ts src/pages/taller/index.astro tests/integration/booking-links.test.ts
git commit -m "fix: bg-32 link maintenance and dashboard to the shop booking page" && git tag bg-32
git tag -l bg-32 | grep -qx bg-32   # expect: exit 0
```

#### BG-33 — Spec de navegador de la reserva por taller (E3-T5) — excepción a "sin E2E fuera de `/taller`" (BG-D19)
**Archivos:** `e2e/reservar-taller.spec.ts` (nuevo) · `e2e/global-setup.ts` · `e2e/fixtures.ts`
**Hacer:** `fixtures.ts`: `SEED.demoShopId`, `SEED.demoBranchId`. `global-setup.ts` (con `hasTable`): el Taller Demo E2E (`slug` `taller-demo`, `name` `Taller Demo E2E`, valores de `DEMO_SHOP_PROFILE` escritos en el archivo, prefijo `TD`) y su sucursal. El spec **no envía** la reserva (Turnstile necesita red): comprueba marca, comunas, línea `Gestionado con Llave 15` y que los bloques mostrados vengan de `/api/disponibilidad` con el `taller` de la página (`page.waitForResponse`).
**Reglas:** R-e2e (excepción BG-D19) · No cambia: los specs existentes, `playwright.config.ts`.
**Done when**
- [ ] WHEN el spec abre `/vector-bikes/reservar` en el viewport de tablet THE SYSTEM SHALL mostrar `Vector Bikes`, las comunas `Vitacura` y `Las Condes` al elegir retiro y la línea `Gestionado con Llave 15`
- [ ] WHEN abre `/taller-demo/reservar` THE SYSTEM SHALL mostrar `Taller Demo E2E`, las comunas del Taller Demo y ningún texto `Vitacura`
- [ ] WHEN el spec elige un día en cada página THE SYSTEM SHALL mostrar los bloques que devuelve `/api/disponibilidad` con el `taller` de esa página, de 60 minutos en el Taller Demo
- [ ] WHEN corre `pnpm test:tablet` completo THE SYSTEM SHALL pasar con los specs existentes sin cambios
**Verify**
```bash
pnpm build && pnpm test:tablet e2e/reservar-taller.spec.ts   # expect: exit 0, 0 failed
d="$(git diff HEAD --name-only -- e2e)" && test "$(printf '%s\n' "$d" | LC_ALL=C sort)" = "$(printf '%s\n' e2e/fixtures.ts e2e/global-setup.ts | LC_ALL=C sort)"   # expect: exit 0 — solo la siembra E2E cambió
pnpm test:tablet   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- e2e/reservar-taller.spec.ts e2e/global-setup.ts e2e/fixtures.ts
git commit -m "test: bg-33 add browser spec for per shop booking page" && git tag bg-33
git tag -l bg-33 | grep -qx bg-33   # expect: exit 0
```

---

### Épica 04 — Separación y nuevo dominio (etapa 4)

#### BG-34 — `APP_URL` en enlaces, cookie y CSRF (E4-T1) — excepción declarada
**Archivos propios:** `src/lib/env.ts` (`getAppEnv()`: `APP_URL` `z.url()` opcional; sin él, `PUBLIC_SITE_URL`) · `src/server/api/handlers.ts` (`isAllowedOrigin(request, appUrl?, legacyUrl?)` acepta el origen de `APP_URL` y, durante la convivencia, el de `PUBLIC_SITE_URL`, cada uno con y sin `www.`) · `.env.example` · `tests/integration/app-url.test.ts` (nuevo).
**Llamadas mecánicas (excepción BG-D6, una línea cada una: `getSiteEnv().PUBLIC_SITE_URL` → `getAppEnv().APP_URL`):** `src/pages/admin/login.astro` (cookie y redirección), `src/server/email/notifications.ts`, `src/pages/taller/ordenes/[id]/etiqueta.ts`, `src/pages/taller/ordenes/[id]/adicional.astro`, `src/pages/taller/ordenes/[id]/index.astro`, `src/pages/taller/ordenes/[id]/informe.astro`, `src/server/taller/part-notice.ts`, `src/pages/taller/index.astro`, `src/server/taller/quotes.ts`, `src/server/taller/reception.ts`, `src/server/taller/qc.ts`, `src/server/taller/maintenance-plan.ts`, `src/server/taller/delivery-notice.ts`.
**Reglas:** R-api · RC 11 · NN 4 · No cambia: sin `APP_URL`, todo igual que hoy.
**Done when**
- [ ] WHEN `APP_URL` es `https://llave15.cl` y `PUBLIC_SITE_URL` es `https://vectorbikes.cl` THE SYSTEM SHALL aceptar un POST con `Origin` de cualquiera de los dos, con o sin `www.`, y rechazar con 403 uno de otro origen o `null`
- [ ] WHEN `APP_URL` está definido THE SYSTEM SHALL armar con él los enlaces de seguimiento, informe, aprobación, cancelación y el QR de la etiqueta
- [ ] WHEN `APP_URL` no está definido THE SYSTEM SHALL usar `PUBLIC_SITE_URL` como hoy
- [ ] WHEN el ingreso responde con `APP_URL` en `https` THE SYSTEM SHALL emitir la cookie de sesión con `secure`
- [ ] WHEN se busca `getSiteEnv(` en `src/` THE SYSTEM SHALL encontrarlo solo en `src/lib/env.ts` y `src/server/api/handlers.ts`
- [ ] WHEN se lee `.env.example` THE SYSTEM SHALL contener una línea `APP_URL=` con su comentario
**Verify**
```bash
pnpm test tests/integration/app-url.test.ts tests/integration/api.test.ts tests/unit/origin-guard.test.ts tests/integration/admin-login-next.test.ts tests/integration/label.test.ts   # expect: exit 0, 0 failed
test -z "$(grep -rl 'getSiteEnv(' src | grep -vxE 'src/lib/env.ts|src/server/api/handlers.ts')"   # expect: exit 0
grep -q '^APP_URL=' .env.example   # expect: exit 0
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -u -- src && git add -- .env.example tests/integration/app-url.test.ts   # -u: solo archivos ya seguidos de src/
git commit -m "feat: bg-34 use app url for links cookie and csrf" && git tag bg-34
git tag -l bg-34 | grep -qx bg-34   # expect: exit 0
```

#### BG-35 — Secreto propio del seguimiento sin romper enlaces (E4-T2)
**Archivos:** `src/lib/env.ts` · `src/server/taller/tracking.ts` · `.env.example` · `tests/integration/tracking-secret.test.ts` (nuevo)
**Hacer:** `getTrackingEnv()`: `TRACKING_TOKEN_SECRET` opcional, mínimo 32; sin él, `CANCEL_TOKEN_SECRET`. `ensureTrackingLink`: si la orden ya tiene fila, calcula los candidatos con el secreto propio y con `CANCEL_TOKEN_SECRET` y reemite el que coincide con el `token_hash` guardado; si no tiene, emite con el secreto propio. `viewTrackingByToken` no cambia (busca por hash). Decomisión `BG-DC2` en §9.1.
**Reglas:** R-api · R-dom · NN 4, 11 · No cambia: enlaces ya enviados.
**Done when**
- [ ] WHEN `TRACKING_TOKEN_SECRET` está definido y una orden no tiene fila de seguimiento THE SYSTEM SHALL emitir un token derivado de `TRACKING_TOKEN_SECRET`
- [ ] WHEN una orden ya tiene fila con el hash de un token derivado de `CANCEL_TOKEN_SECRET` THE SYSTEM SHALL volver a emitir ese mismo token, y el enlace ya enviado SHALL seguir abriendo `/seguimiento/<token>`
- [ ] WHEN `TRACKING_TOKEN_SECRET` no está definido THE SYSTEM SHALL usar `CANCEL_TOKEN_SECRET` como hoy
- [ ] WHEN `TRACKING_TOKEN_SECRET` tiene menos de 32 caracteres THE SYSTEM SHALL lanzar `EnvError` que lo nombra
- [ ] WHEN se lee `.env.example` THE SYSTEM SHALL contener una línea `TRACKING_TOKEN_SECRET=` con su comentario
**Verify**
```bash
pnpm test tests/integration/tracking-secret.test.ts tests/integration/tracking.test.ts tests/integration/tracking-page.test.ts tests/integration/tracking-notifications.test.ts   # expect: exit 0, 0 failed
grep -q '^TRACKING_TOKEN_SECRET=' .env.example   # expect: exit 0
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/lib/env.ts src/server/taller/tracking.ts .env.example tests/integration/tracking-secret.test.ts
git commit -m "feat: bg-35 add tracking token secret keeping sent links" && git tag bg-35
git tag -l bg-35 | grep -qx bg-35   # expect: exit 0
```

#### BG-36 — Tareas diarias por taller activo (E4-T3)
**Archivos:** `src/server/api/task-handlers.ts` · `src/server/shops/scope.ts` · `src/server/whatsapp/cron.ts` · `tests/integration/tasks-isolation.test.ts` (nuevo)
**Hacer:** `activeShopScopes(db)` (talleres `activo` con su sucursal); `handleRemindersTask` llama `sendReminders(db, now, deps, scope)` por taller y suma `sent`/`failed`; `handleAlertsTask` ya agrupa por taller (BG-21) y omite los suspendidos; `handleWhatsAppCron` recorre los talleres; `handleMaintenanceTask` y `handleRetentionTask` no cambian (por orden y global). Las respuestas conservan su forma.
**Reglas:** R-api · R-shops · No cambia: autorización de tareas, formas de respuesta.
**Done when**
- [ ] WHEN `/api/tareas/recordatorios` corre con dos talleres activos y reservas de mañana en ambos THE SYSTEM SHALL enviar los recordatorios de los dos, cada uno con la marca de su taller, en una sola llamada, y responder `ok: true` con `sent` igual al total
- [ ] WHEN un taller está `suspendido` THE SYSTEM SHALL omitir sus recordatorios, su resumen y sus avisos de WhatsApp
- [ ] WHEN `/api/tareas/alertas` corre THE SYSTEM SHALL enviar a cada taller activo solo sus órdenes atrasadas y su stock bajo, a su correo de avisos
- [ ] WHEN el cron de WhatsApp corre THE SYSTEM SHALL procesar las reservas de cada taller activo con su alcance
- [ ] WHEN la base tiene un solo taller THE SYSTEM SHALL responder como hoy (`tasks.test.ts`, `tasks-maintenance.test.ts` y `tasks-maintenance-reminders.test.ts` sin cambios)
**Verify**
```bash
pnpm test tests/integration/tasks-isolation.test.ts tests/integration/tasks.test.ts tests/integration/tasks-maintenance.test.ts tests/integration/tasks-maintenance-reminders.test.ts tests/integration/whatsapp.test.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/api/task-handlers.ts src/server/shops/scope.ts src/server/whatsapp/cron.ts tests/integration/tasks-isolation.test.ts
git commit -m "feat: bg-36 run daily tasks for every active shop" && git tag bg-36
git tag -l bg-36 | grep -qx bg-36   # expect: exit 0
```

#### BG-37 — Sitio de Vector Bikes: portada (E4-T4)
**Precondición:** `web/vector-bikes/{package.json,astro.config.mjs,tsconfig.json,vitest.config.ts}` existen desde el Bootstrap (§19.6).
**Archivos:** `web/vector-bikes/src/layouts/SiteLayout.astro` (nuevo) · `web/vector-bikes/src/components/Home.astro` (nuevo) · `web/vector-bikes/src/pages/index.astro` (nuevo) · `web/vector-bikes/src/styles/site.css` (nuevo) · `web/vector-bikes/tests/content.test.ts` (nuevo)
**Copias (comandos, no se escriben a mano):** `mkdir -p web/vector-bikes/public/brand && cp public/brand/vector-bikes-logo.png public/brand/favicon-32.png public/brand/apple-touch-icon.png web/vector-bikes/public/brand/ && cp public/favicon.svg web/vector-bikes/public/` (solo los archivos de Vector Bikes: los `llave15-*.svg` de BG-46 y BG-47 no van al sitio, BG-D32; el bloque `:root.l15` que `site.css` copia de `tokens.css` no aplica sin la clase `l15`).
**Hacer:** `site.css` = `src/styles/tokens.css` + `src/styles/global.css` concatenados tal cual (sin hex nuevos). `SiteLayout`: el `<head>` y el cromo de `src/layouts/Base.astro` (fuentes, JSON-LD, FAQ, Open Graph) con `VECTOR_BIKES_SITE`. `Home`: el marcado de `Landing.astro` **sin la isla**: en su lugar, un enlace `.btn` con texto `Reservar` a `BOOKING_URL`. `index.astro`: `prerender = true`. Nada de `web/` importa `src/`.
**Reglas:** R-ui · BG-D22 · No cambia: textos, estructura y datos estructurados de la portada de hoy.
**Done when**
- [ ] WHEN corre `pnpm exec astro build --root web/vector-bikes` THE SYSTEM SHALL salir 0 y generar `web/vector-bikes/dist/client/index.html`
- [ ] WHEN se lee ese HTML THE SYSTEM SHALL contener el título y la descripción de la portada de hoy, el JSON-LD con los datos de Vector Bikes y un enlace `Reservar` a `https://llave15.cl/vector-bikes/reservar`
- [ ] WHEN se busca en ese HTML THE SYSTEM SHALL no encontrar el script de Turnstile ni la isla de reserva
- [ ] WHEN se comparan los hex de `web/vector-bikes/src/styles/site.css` con los de `src/styles/global.css` y `src/styles/tokens.css` THE SYSTEM SHALL no encontrar ninguno nuevo
- [ ] WHEN corren `pnpm exec astro check --root web/vector-bikes` y `pnpm exec vitest run --config web/vector-bikes/vitest.config.ts` THE SYSTEM SHALL salir 0
**Verify**
```bash
pnpm exec astro check --root web/vector-bikes   # expect: exit 0
pnpm exec astro build --root web/vector-bikes && test -f web/vector-bikes/dist/client/index.html   # expect: exit 0
grep -qF 'href="https://llave15.cl/vector-bikes/reservar"' web/vector-bikes/dist/client/index.html   # expect: exit 0
grep -q 'challenges.cloudflare.com' web/vector-bikes/dist/client/index.html; test $? -eq 1   # expect: 1 = sin Turnstile → la línea sale 0
node -e "const fs = require('fs'); const hex = (f) => new Set(fs.readFileSync(f, 'utf8').match(/#[0-9A-Fa-f]{6}/g) || []); const base = new Set([...hex('src/styles/global.css'), ...hex('src/styles/tokens.css')]); const extra = [...hex('web/vector-bikes/src/styles/site.css')].filter((h) => !base.has(h)); if (extra.length > 0) console.error(extra.join(' ')); process.exit(extra.length > 0 ? 1 : 0)"   # expect: exit 0 — ningún hex nuevo
pnpm exec vitest run --config web/vector-bikes/vitest.config.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- web/vector-bikes/src/layouts/SiteLayout.astro web/vector-bikes/src/components/Home.astro web/vector-bikes/src/pages/index.astro web/vector-bikes/src/styles/site.css web/vector-bikes/tests/content.test.ts web/vector-bikes/public
git commit -m "feat: bg-37 add vector bikes site home" && git tag bg-37
git tag -l bg-37 | grep -qx bg-37   # expect: exit 0
```

#### BG-38 — Sitio de Vector Bikes: privacidad y redirecciones permanentes (E4-T5)
**Archivos:** `web/vector-bikes/src/pages/privacidad.astro` (nuevo) · `web/vector-bikes/src/lib/redirects.ts` (nuevo) · `web/vector-bikes/src/pages/[...path].ts` (nuevo) · `web/vector-bikes/scripts/check-redirects.ts` (nuevo) · `web/vector-bikes/tests/redirects.test.ts` (nuevo)
**Copia (comando):** `cp public/robots.txt web/vector-bikes/public/robots.txt`.
**Hacer:** `privacidad.astro` prerenderizada con el texto de hoy (de `VECTOR_BIKES_SITE`). `legacyRedirect(url)`: si `pathname` es `/taller`, `/admin`, `/seguimiento`, `/informe` o `/aprobacion`, o empieza con alguno seguido de `/`, o es `/reservas/cancelar`, devuelve `https://llave15.cl` + `pathname` + `search`; si no, `null`. `[...path].ts`: `prerender = false`, exporta `ALL`: con destino, 301 en `GET`/`HEAD` y 308 en los demás métodos; sin destino, 404. `check-redirects.ts <url-base>`: pide con `redirect: "manual"` `/taller`, `/taller/ordenes/abc?x=1`, `/admin/login?next=%2Ftaller`, `/seguimiento/TOKEN`, `/informe/TOKEN`, `/aprobacion/TOKEN`, `/reservas/cancelar?token=abc` (301 y `Location` exacto) y `/`, `/privacidad` (200) y `/no-existe` (404); sale 0 si todo coincide, 1 si algo no, 2 por uso o sin conexión.
**Reglas:** R-ui · BG-D23 · No cambia: URLs y SEO de la portada.
**Done when**
- [ ] WHEN `legacyRedirect` recibe `/seguimiento/abc?utm=x` THE SYSTEM SHALL devolver `https://llave15.cl/seguimiento/abc?utm=x`, y lo mismo para rutas bajo `/taller`, `/admin`, `/informe` y `/aprobacion` y para `/reservas/cancelar?token=t`
- [ ] WHEN recibe `/`, `/privacidad`, `/talleres` o `/reservas` THE SYSTEM SHALL devolver `null`
- [ ] WHEN el endpoint recibe `GET /taller/ordenes/1?a=b` THE SYSTEM SHALL responder 301 con `Location` igual a `https://llave15.cl/taller/ordenes/1?a=b`, y un `POST /reservas/cancelar?token=t` SHALL responder 308 al mismo destino
- [ ] WHEN `node web/vector-bikes/scripts/check-redirects.ts` corre sin argumentos THE SYSTEM SHALL salir 2 con un mensaje de uso
- [ ] WHEN se construye el sitio THE SYSTEM SHALL generar `/privacidad` con el texto de privacidad de hoy de Vector Bikes
**Verify**
```bash
pnpm exec astro check --root web/vector-bikes   # expect: exit 0
pnpm exec astro build --root web/vector-bikes && test -f web/vector-bikes/dist/client/privacidad/index.html   # expect: exit 0
pnpm exec vitest run --config web/vector-bikes/vitest.config.ts   # expect: exit 0, 0 failed
node web/vector-bikes/scripts/check-redirects.ts; test $? -eq 2   # expect: código 2 (uso) → la línea sale 0
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- web/vector-bikes/src/pages/privacidad.astro web/vector-bikes/src/lib/redirects.ts 'web/vector-bikes/src/pages/[...path].ts' web/vector-bikes/scripts/check-redirects.ts web/vector-bikes/tests/redirects.test.ts web/vector-bikes/public/robots.txt
git commit -m "feat: bg-38 add vector bikes privacy page and permanent redirects" && git tag bg-38
git tag -l bg-38 | grep -qx bg-38   # expect: exit 0
```

#### BG-39 — Compuerta del sitio y salud de la plataforma (E4-T6)
**Archivos:** `package.json` (scripts `test:web`, `bg:check` y `gate`) · `web/vector-bikes/scripts/test-web.sh` (nuevo) · `src/server/shops/health.ts` (nuevo) · `scripts/bg-check.ts` (nuevo) · `tests/integration/bg-health.test.ts` (nuevo)
**Hacer:** `test-web.sh` (`set -eu`, patrón de `scripts/smoke.sh`): `pnpm exec astro check --root web/vector-bikes`, `pnpm exec astro build --root web/vector-bikes`, `pnpm exec vitest run --config web/vector-bikes/vitest.config.ts`, arranca `HOST=127.0.0.1 PORT="${WEB_PORT:-4398}" node web/vector-bikes/dist/server/entry.mjs >.web.log 2>&1 &`, espera `/` hasta 30 s, corre `node web/vector-bikes/scripts/check-redirects.ts "http://127.0.0.1:$PORT"`, y lo detiene con `trap`. `platformHealth(db)`: `shopsWithoutSingleBranch` (talleres activos sin exactamente una sucursal), `blocksCrossBranch` (bloques cuya sucursal no es la de su reserva), `ordersBookingCrossBranch` (órdenes con `booking_id` de otra sucursal); `ok` si todos son 0. `bg-check.ts`: imprime el JSON; sale 0 sano, 1 algún conteo > 0, 2 sin conexión. Scripts: `test:web` = `sh web/vector-bikes/scripts/test-web.sh`; `bg:check` = `node --env-file-if-exists=.env scripts/bg-check.ts`; `gate` = el de hoy + ` && pnpm test:web`.
**Reglas:** R-shops · NN 4 · No cambia: ninguna dependencia.
**Done when**
- [ ] WHEN `platformHealth` corre sobre una base sana con dos talleres THE SYSTEM SHALL devolver `ok: true` con `shopsWithoutSingleBranch`, `blocksCrossBranch` y `ordersBookingCrossBranch` en 0
- [ ] WHEN una orden apunta a una reserva de otra sucursal, o un bloque a una reserva de otra sucursal THE SYSTEM SHALL contarlo y devolver `ok: false`
- [ ] WHEN `node scripts/bg-check.ts` corre con un `DATABASE_URL` inalcanzable THE SYSTEM SHALL salir 2 con `No se pudo conectar`
- [ ] WHEN se lee `package.json` THE SYSTEM SHALL tener `test:web` igual a `sh web/vector-bikes/scripts/test-web.sh`, `bg:check` igual a `node --env-file-if-exists=.env scripts/bg-check.ts` y `gate` terminado en `&& pnpm test:web`
- [ ] WHEN corre `pnpm test:web` THE SYSTEM SHALL salir 0
- [ ] WHEN corre `pnpm bg:check` contra la base dev THE SYSTEM SHALL salir 0
**Verify**
```bash
pnpm test tests/integration/bg-health.test.ts   # expect: exit 0, 0 failed
out="$(DATABASE_URL=postgres://127.0.0.1:1/x node scripts/bg-check.ts 2>&1)"; test $? -eq 2 && printf '%s' "$out" | grep -q 'No se pudo conectar'   # expect: exit 0 — código 2 (conexión), no 1
test "$(node -p "require('./package.json').scripts['test:web']")" = "sh web/vector-bikes/scripts/test-web.sh"   # expect: exit 0
test "$(node -p "require('./package.json').scripts['bg:check']")" = "node --env-file-if-exists=.env scripts/bg-check.ts"   # expect: exit 0
node -p "require('./package.json').scripts.gate" | grep -q '&& pnpm test:web$'   # expect: exit 0
pnpm test:web   # expect: exit 0
pnpm bg:check   # expect: exit 0, {"ok":true,...}
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- package.json web/vector-bikes/scripts/test-web.sh src/server/shops/health.ts scripts/bg-check.ts tests/integration/bg-health.test.ts
git commit -m "feat: bg-39 gate the vector bikes site and add platform health check" && git tag bg-39
git tag -l bg-39 | grep -qx bg-39   # expect: exit 0
```

#### BG-40 — Plan de corte del dominio (E4-T7)
**Archivos:** `docs/corte-bike-garage.md` (nuevo)
**Hacer:** el plan de §9.1 "Corte" como documento operativo: precondiciones (clave de la base rotada, `send.llave15.cl` verificado en Resend, widget de Turnstile para `llave15.cl`), secuencia C6–C8 con los comandos literales, criterios de aborto con umbrales y guardia (Andrés), reversión por fase y tareas de decomisión `BG-DC1`–`BG-DC4`.
**Reglas:** NN 2, 4 · No cambia: nada de código.
**Done when**
- [ ] WHEN se lee `docs/corte-bike-garage.md` THE SYSTEM SHALL contener `## Precondiciones`, `## Secuencia de corte`, `## Criterios de aborto`, `## Reversión` y `## Decomisión`
- [ ] WHEN se busca en ese documento THE SYSTEM SHALL encontrar los comandos `node web/vector-bikes/scripts/check-redirects.ts https://vectorbikes.cl` y `pnpm bg:check`
- [ ] WHEN se busca en ese documento THE SYSTEM SHALL encontrar las variables `APP_URL`, `TRACKING_TOKEN_SECRET`, `EMAIL_FROM` y `PUBLIC_TURNSTILE_SITE_KEY`
**Verify**
```bash
for s in '## Precondiciones' '## Secuencia de corte' '## Criterios de aborto' '## Reversión' '## Decomisión'; do grep -qF "$s" docs/corte-bike-garage.md || echo "$s"; done | grep -q .; test $? -eq 1   # expect: 1 = no falta ninguna sección → la línea sale 0
grep -qF 'node web/vector-bikes/scripts/check-redirects.ts https://vectorbikes.cl' docs/corte-bike-garage.md && grep -qF 'pnpm bg:check' docs/corte-bike-garage.md   # expect: exit 0
grep -q 'APP_URL' docs/corte-bike-garage.md && grep -q 'TRACKING_TOKEN_SECRET' docs/corte-bike-garage.md && grep -q 'EMAIL_FROM' docs/corte-bike-garage.md && grep -q 'PUBLIC_TURNSTILE_SITE_KEY' docs/corte-bike-garage.md   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- docs/corte-bike-garage.md
git commit -m "docs: bg-40 write the domain cutover plan" && git tag bg-40
git tag -l bg-40 | grep -qx bg-40   # expect: exit 0
git ls-files --error-unmatch docs/corte-bike-garage.md   # expect: exit 0 — commiteado arriba
```

---

### Épica 05 — Administración de la plataforma (etapa 5)

#### BG-41 — Administrador de plataforma y lista de talleres (E5-T1)
**Archivos:** `src/server/auth/admin-auth.ts` · `src/server/shops/platform-shops.ts` (nuevo) · `src/pages/plataforma/index.astro` (nuevo) · `src/layouts/TallerLayout.astro` · `tests/integration/platform-isolation.test.ts` (nuevo)
**Hacer:** `requireAdmin` lee `is_platform_admin` y agrega `isPlatformAdmin: true` al `SessionUser` **solo** cuando es verdadero (un usuario sin la marca recibe el mismo objeto de hoy); `libraryCurator` es `library_curator or is_platform_admin` (decisión 12). `listShopsWithUsage(db, actor, now)`: `null` sin la marca; por taller, `slug`, nombre, estado, usuarios activos, órdenes abiertas y reservas de los últimos 30 días (solo conteos). `/plataforma`: sesión → marca (403) → lista; `TallerLayout` muestra el enlace `Plataforma` solo con la marca.
**Reglas:** R-api · R-shops · R-tui · No cambia: `can`, roles, `SessionUser` sin la marca.
**Done when**
- [ ] WHEN un usuario con `is_platform_admin` abre `/plataforma` THE SYSTEM SHALL listar cada taller con `slug`, nombre, estado, usuarios activos, órdenes abiertas y reservas de los últimos 30 días, sin nombres, teléfonos ni correos de clientes
- [ ] WHEN un usuario sin la marca pide `/plataforma` THE SYSTEM SHALL responder 403, y sin sesión SHALL redirigir 303 al ingreso
- [ ] WHEN el administrador de plataforma, usuario de Vector Bikes, abre `/taller/ordenes` o `/admin` THE SYSTEM SHALL mostrar solo datos de Vector Bikes
- [ ] WHEN `requireAdmin` devuelve un usuario sin la marca THE SYSTEM SHALL devolver el mismo objeto de hoy (`admin-auth.test.ts` sin cambios)
- [ ] WHEN un usuario tiene `is_platform_admin` THE SYSTEM SHALL tratarlo como curador de la biblioteca
- [ ] WHEN se renderiza el menú para el administrador de plataforma THE SYSTEM SHALL mostrar `Plataforma`, y para cualquier otro usuario SHALL no mostrarlo
**Verify**
```bash
pnpm test tests/integration/platform-isolation.test.ts tests/integration/admin-auth.test.ts tests/integration/admin-layout.test.ts tests/integration/library-access.test.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/auth/admin-auth.ts src/server/shops/platform-shops.ts src/pages/plataforma/index.astro src/layouts/TallerLayout.astro tests/integration/platform-isolation.test.ts
git commit -m "feat: bg-41 add platform admin flag and shops list" && git tag bg-41
git tag -l bg-41 | grep -qx bg-41   # expect: exit 0
```

#### BG-42 — Crear un taller con su primer dueño (E5-T2)
**Archivos:** `src/server/shops/create-shop.ts` (nuevo) · `src/server/shops/catalog-copy.ts` (nuevo) · `src/pages/plataforma/talleres/nuevo.astro` (nuevo) · `tests/integration/create-shop.test.ts` (nuevo)
**Hacer:** `createShopSchema` (zod: `slugSchema`, perfil, `weekHoursSchema`, capacidad, bloque, antelación, horizonte, retiro, comunas, tarifa, prefijo, correo de avisos, dueño: nombre, correo, clave ≥ 12, `templateShopId`); `createShop(db, actor, input, now)`: solo `isPlatformAdmin`; una transacción: `shops` `activo`, una sucursal (nombre = `locality`), el `owner` con `hashPassword`, y `copyCatalog(tx, fromBranchId, toBranchId, now)` (servicios y precios del taller plantilla, con el `branch_id` nuevo). Correo duplicado (`uq_users_email`) → `validation_error` en `ownerEmail` con `Ese correo ya tiene cuenta.`. La página: sesión → marca → `isAllowedOrigin` → zod → `createShop` → 303 a `/plataforma?hecho=crear`.
**Reglas:** R-api · R-shops · R-dom · NN 8 · No cambia: `setAdminPassword`, `createOwner`.
**Done when**
- [ ] WHEN el administrador de plataforma crea `taller-demo` con su perfil, horarios, comunas, tarifa, prefijo `TD` y un dueño con clave de 12 caracteres THE SYSTEM SHALL crear en una transacción el taller `activo`, una sucursal, el usuario `owner` con la clave en scrypt y los servicios y precios del catálogo del taller elegido como plantilla
- [ ] WHEN el `slug` es reservado, ya existe o no cumple el formato, o el prefijo ya existe THE SYSTEM SHALL responder 422 con el campo y no escribir nada
- [ ] WHEN el correo del dueño ya existe en otro taller THE SYSTEM SHALL responder 422 con `Ese correo ya tiene cuenta.` sin escribir
- [ ] WHEN la clave tiene menos de 12 caracteres THE SYSTEM SHALL responder 422
- [ ] WHEN el dueño nuevo entra a `/taller` THE SYSTEM SHALL ver su taller sin ningún dato de Vector Bikes, y su catálogo SHALL tener los servicios copiados con su propio `branch_id`
- [ ] WHEN un usuario sin la marca hace POST en `/plataforma/talleres/nuevo` THE SYSTEM SHALL responder 403 sin escribir, y un POST con `Origin` ajeno SHALL responder 403
**Verify**
```bash
pnpm test tests/integration/create-shop.test.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/shops/create-shop.ts src/server/shops/catalog-copy.ts src/pages/plataforma/talleres/nuevo.astro tests/integration/create-shop.test.ts
git commit -m "feat: bg-42 create a shop with its first owner" && git tag bg-42
git tag -l bg-42 | grep -qx bg-42   # expect: exit 0
```

#### BG-43 — Suspender un taller y ver su uso (E5-T3)
**Archivos:** `src/server/shops/platform-shops.ts` · `src/pages/plataforma/talleres/[id].astro` (nuevo) · `src/server/auth/admin-auth.ts` · `tests/integration/suspend-shop.test.ts` (nuevo)
**Hacer:** `setShopStatus(db, actor, shopId, status, now)` (solo la marca; al suspender revoca las sesiones abiertas de los usuarios del taller); `shopUsage(db, actor, shopId, now)` (usuarios activos, órdenes abiertas, reservas y ventas de los últimos 30 días); `loginAdmin` y `requireAdmin` rechazan a usuarios de un taller `suspendido` como a un inactivo; la página muestra uso y el botón Suspender/Reactivar.
**Reglas:** R-api · R-shops · No cambia: mensajes de ingreso fallido.
**Done when**
- [ ] WHEN el administrador de plataforma suspende el Taller Demo THE SYSTEM SHALL dejar `status = 'suspendido'` y revocar las sesiones abiertas de sus usuarios
- [ ] WHEN un usuario de un taller suspendido intenta entrar o usa una sesión THE SYSTEM SHALL rechazarlo como hoy rechaza a un usuario inactivo
- [ ] WHEN se pide `/taller-demo/reservar` o `POST /api/reservas` con `taller-demo` suspendido THE SYSTEM SHALL responder 404
- [ ] WHEN el administrador reactiva el taller THE SYSTEM SHALL volver a `activo` y sus usuarios SHALL poder entrar
- [ ] WHEN `/plataforma/talleres/<id>` se renderiza THE SYSTEM SHALL mostrar el uso del taller sin datos personales
- [ ] WHEN un usuario sin la marca hace POST en esa página THE SYSTEM SHALL responder 403
**Verify**
```bash
pnpm test tests/integration/suspend-shop.test.ts tests/integration/admin-auth.test.ts tests/integration/booking-page.test.ts tests/integration/api-by-shop.test.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/shops/platform-shops.ts 'src/pages/plataforma/talleres/[id].astro' src/server/auth/admin-auth.ts tests/integration/suspend-shop.test.ts
git commit -m "feat: bg-43 suspend shops and show usage" && git tag bg-43
git tag -l bg-43 | grep -qx bg-43   # expect: exit 0
```

#### BG-44 — "Mi taller" para el dueño (E5-T4)
**Archivos:** `src/server/shops/my-shop.ts` (nuevo) · `src/pages/taller/mi-taller.astro` (nuevo) · `src/server/auth/permissions.ts` · `src/layouts/TallerLayout.astro` · `tests/integration/my-shop.test.ts` (nuevo)
**Valores esperados que cambian (declarados):** `tests/unit/permissions.test.ts` (37 acciones; `shop.manage` solo `owner`), autorizado por esta fase.
**Hacer:** acción `shop.manage` (solo `owner`) al final de `ACTIONS`; `myShop(db, actor)` y `updateMyShop(db, actor, input, now)` (zod; `slug` y `code_prefix` no editables, BG-D27); logo: formulario `multipart/form-data` sin isla, JPG o PNG ≤ 2 MB → `sharp` a PNG de 512 px → almacenamiento `shops/<id>/logo.png` → recién entonces `logo_key` (RC 13); enlace `Mi taller` con `shop.manage` en el menú.
**Reglas:** R-api · R-tui · R-shops · RC 11, 13 · NN 12 · No cambia: las 36 acciones existentes.
**Done when**
- [ ] WHEN el dueño guarda "Mi taller" con nuevos horarios, capacidad, comunas, tarifa y correo de avisos THE SYSTEM SHALL actualizar su fila de `shops` y la disponibilidad pública SHALL usar los valores nuevos
- [ ] WHEN el dueño envía otro `slug` o `code_prefix` THE SYSTEM SHALL ignorar esos campos
- [ ] WHEN `admin`, `reception` o `mechanic` piden `/taller/mi-taller` THE SYSTEM SHALL responder 403
- [ ] WHEN el dueño sube un logo JPG o PNG de hasta 2 MB THE SYSTEM SHALL guardarlo primero en el almacenamiento como `shops/<id>/logo.png` y después `logo_key`, y `/<slug>/logo` SHALL servirlo
- [ ] WHEN los horarios traen `open` mayor o igual que `close` THE SYSTEM SHALL responder 422 sin cambiar la fila
- [ ] WHEN se lee `ACTIONS` THE SYSTEM SHALL tener `shop.manage` solo para `owner`, y `tests/unit/permissions.test.ts` SHALL ser la única prueba existente que cambia
**Verify**
```bash
pnpm test tests/integration/my-shop.test.ts tests/unit/permissions.test.ts   # expect: exit 0, 0 failed
d="$(git diff HEAD --name-only -- tests e2e)" && test "$d" = "tests/unit/permissions.test.ts"   # expect: exit 0 — git respondió y solo cambió la prueba autorizada
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- src/server/shops/my-shop.ts src/pages/taller/mi-taller.astro src/server/auth/permissions.ts src/layouts/TallerLayout.astro tests/integration/my-shop.test.ts tests/unit/permissions.test.ts
git commit -m "feat: bg-44 add my shop page for owners" && git tag bg-44
git tag -l bg-44 | grep -qx bg-44   # expect: exit 0
```

#### BG-45 — Alta documentada y cierre de la fase (E5-T5)
**Archivos:** `scripts/platform-admin.ts` (nuevo) · `package.json` (solo el script) · `docs/nuevo-taller.md` (nuevo) · `README.md` · `tests/integration/platform-admin-script.test.ts` (nuevo)
**Hacer:** `platform-admin.ts <correo> [--off]`: exporta `setPlatformAdmin(db, email, on, now)` (marca o quita y revoca sesiones); `main` con la guarda de BG-01; sale 0, 1 (correo inexistente), 2 (uso o sin conexión). `package.json`: `platform:admin` = `node --env-file-if-exists=.env scripts/platform-admin.ts`. `docs/nuevo-taller.md`: antes del alta (términos, privacidad, FASE §7), alta en `/plataforma`, primer ingreso del dueño, verificación (`pnpm bg:check`, `/<slug>/reservar`). `README.md`: `## Operación de Llave 15` con la tabla FASE §14 → prueba (al final de §9).
**Reglas:** R-shops · NN 4 · No cambia: ninguna dependencia.
**Done when**
- [ ] WHEN `setPlatformAdmin` recibe un correo existente THE SYSTEM SHALL marcar `is_platform_admin = true` y revocar sus sesiones, y con `on: false` SHALL quitar la marca
- [ ] WHEN el correo no existe THE SYSTEM SHALL devolver `not_found` sin cambios, y `node scripts/platform-admin.ts` sin argumentos SHALL salir 2
- [ ] WHEN se lee `docs/nuevo-taller.md` THE SYSTEM SHALL contener `## Antes de dar de alta`, `## Alta en /plataforma`, `## Primer ingreso del dueño` y `## Verificación`
- [ ] WHEN se lee `README.md` THE SYSTEM SHALL contener `## Operación de Llave 15`
- [ ] WHEN se lee `package.json` THE SYSTEM SHALL tener `platform:admin` igual a `node --env-file-if-exists=.env scripts/platform-admin.ts`
**Verify**
```bash
pnpm test tests/integration/platform-admin-script.test.ts   # expect: exit 0, 0 failed
node scripts/platform-admin.ts; test $? -eq 2   # expect: código 2 (uso) → la línea sale 0
for s in '## Antes de dar de alta' '## Alta en /plataforma' '## Primer ingreso del dueño' '## Verificación'; do grep -qF "$s" docs/nuevo-taller.md || echo "$s"; done | grep -q .; test $? -eq 1   # expect: 1 = no falta ninguna sección → la línea sale 0
grep -qF '## Operación de Llave 15' README.md   # expect: exit 0
test "$(node -p "require('./package.json').scripts['platform:admin']")" = "node --env-file-if-exists=.env scripts/platform-admin.ts"   # expect: exit 0
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```
**Checkpoint**
```bash
git add -- scripts/platform-admin.ts package.json docs/nuevo-taller.md README.md tests/integration/platform-admin-script.test.ts
git commit -m "feat: bg-45 add platform admin script and close the phase" && git tag bg-45
git tag -l bg-45 | grep -qx bg-45   # expect: exit 0
```

**Criterios FASE §14 → prueba** (también en `README.md` y §20.1): 1 los `*-isolation.test.ts` (BG-07, 12–16, 18–21, 23, 24, 36, 41) + `pnpm gate` · 2 `shops-contract.test.ts` (BG-09) + `shops-unique.test.ts` (BG-10) · 3 `api-by-shop.test.ts` (BG-30) + `booking-page.test.ts` (BG-31) + `e2e/reservar-taller.spec.ts` (BG-33) · 4 `shop-literals.test.ts` (BG-01, línea base vacía en BG-28) · 5 `layouts.test.ts`, BG-27 (títulos), `booking-emails-isolation.test.ts`, `token-pages-isolation.test.ts`, `report-brand-isolation.test.ts`, `llave15-brand.test.ts`, `llave15-tokens.test.ts`, `llave15-components.test.ts`, `llave15-layouts.test.ts` (BG-46–49) · 6 `app-url.test.ts` (BG-34) + `pnpm test:web` (BG-39) + checklist de corte · 7 `tracking-secret.test.ts` (BG-35) + `redirects.test.ts` y `check-redirects.ts` (BG-38) · 8 `create-shop.test.ts` (BG-42) + `my-shop.test.ts` (BG-44) · 9 `tasks-isolation.test.ts` (BG-36) · 10 `pnpm gate` en cada paso · 11 checklist de lanzamiento (§20.1).

---

### 9.1 Paridad y corte

Dos migraciones a la vez: **(a) de datos** — Vector Bikes pasa de "el único taller implícito" a una fila de `shops` con `branch_id` en todas sus reservas; **(b) de dominio y despliegue** — el Replit actual pasa a ser Llave 15 en `llave15.cl` y `vectorbikes.cl` se muda a un Replit nuevo con el sitio de `web/vector-bikes/`.

#### Parity set
Leído del código en `8bca898` (`booking/*`, `handlers.ts`, `manual-booking.ts`, `email/*`, `tracking.ts`, `label.ts`, `task-handlers.ts`, `whatsapp/*`, `astro.config.mjs`, `public/robots.txt`).

| # | Comportamiento constante | Cómo se prueba | Tolerancia |
|---|---|---|---|
| p1 | Reglas de reserva de Vector Bikes: bloque 30, capacidad 4 bicis por día, antelación 120 min, horizonte 30 días, retiro = 2 bloques y 1 reserva, máx. 3 bicis, tarifa 15.000, comunas Vitacura y Las Condes, horarios L–V 15–20 (retiro 9–20), sáb. 10–14, dom. cerrado, feriados de `feriados-cl.json` | `slots.test.ts`, `multi-bike-slots.test.ts`, `pickup-hours.test.ts`, `create-booking.test.ts`, `concurrency.test.ts`, `manual-booking.test.ts` sin cambios de valores + `vector-bikes-profile.test.ts` | Exacta |
| p2 | Código `VB-AAMMDD-HHMM` y sufijo `-n` | `create-booking.test.ts` | Exacta |
| p3 | Respuestas de `/api/reservas` y `/api/disponibilidad` | `api.test.ts` | Exacta |
| p4 | Correos de reserva, recordatorio, cancelación, reprogramación, recepción, retiro, cotización, repuesto, fecha y mantención de Vector Bikes | pruebas unitarias e integración de correos | Byte a byte salvo lo declarado en BG-18–21 (`Gestionado con Llave 15`, remitente, logo) |
| p5 | Enlaces de cancelación, seguimiento, informe, aprobación y QR de etiqueta | `cancel-flow.test.ts`, `tracking*.test.ts`, `report-page.test.ts`, `approval-page.test.ts`, `label.test.ts`, `tracking-secret.test.ts`, `redirects.test.ts` | Funcionan antes y después del corte |
| p6 | Informe del servicio (snapshot v1) | `reports.test.ts`, `report-view.test.ts` | Exacta salvo logo y pie declarados |
| p7 | Numeración `OT-`, `VM-`, `OC-` por sucursal | `work-orders.test.ts`, `sales.test.ts`, `purchases.test.ts` | Exacta |
| p8 | Tareas `/api/tareas/*` con un taller | `tasks.test.ts`, `tasks-maintenance*.test.ts` | Exacta en forma; un correo por taller |
| p9 | Portada de `vectorbikes.cl` (títulos, JSON-LD, FAQ, privacidad) | `tests/build/landing.test.ts`, `seo.test.ts` hasta el corte; `web/vector-bikes/tests/content.test.ts` después | Mismo contenido; el botón cambia de isla a enlace |

**Harness:**
- `node scripts/bg-expect-parity.ts --base 8bca898` (etapa 1, sin `--allow`) y con los `--allow` declarados en las etapas siguientes;
- `pnpm test` (suite existente + prueba de dos talleres; `pnpm test isolation` la corre sola);
- `pnpm test:web` (sitio, pruebas y `node web/vector-bikes/scripts/check-redirects.ts http://127.0.0.1:4398`);
- `pnpm bg:check` (sin cruces de sucursal en la base).

**Convivencia:** desde BG-34 el Replit actual sirve los dos dominios: `vectorbikes.cl` (portada heredada y todas las rutas antiguas, que funcionan directo) y `llave15.cl` (mismo sistema). `isAllowedOrigin` acepta los dos orígenes y la cookie es de host (una sesión por dominio). Los enlaces nuevos salen con `APP_URL`; los antiguos siguen funcionando. Sin escritura doble: una sola base y una sola app. **Período sombra:** desde la publicación de BG-40 hasta el cambio de DNS (al menos 7 días), el sitio nuevo corre en su Replit nuevo con su URL `*.replit.app` y `check-redirects.ts` se corre contra esa URL cada día.

#### Corte
| Fase | Qué cambia | Afecta a | Done when (decidible en el Mac) | Reversible por | Verify |
|---|---|---|---|---|---|
| C1. Ventana V-BG1 | Esquema expand + `bg:backfill` | Nadie | WHEN corre el Verify de BG-05 en el tag `bg-05` THE SYSTEM SHALL salir 0 | Republicar el deployment anterior (solo crecieron columnas nulables) | Verify de BG-05 |
| C2. Ventana V-BG2 | Datos migrados en producción + código con alcance | Vector Bikes (sin cambio visible) | WHEN corre el Verify de BG-08 en el tag `bg-08` THE SYSTEM SHALL salir 0 (incluye `pnpm bg:backfill --dry-run` con `"pending":0` en la base dev) | Republicar `bg-05`; los datos completados no estorban | Verify de BG-08 |
| C3. Ventana V-BG3 | NOT NULL, PK, índices y CHECK | Vector Bikes | WHEN corre el Verify de BG-11 en el tag `bg-11` THE SYSTEM SHALL salir 0 | Republicar `bg-08`: su código escribe `branch_id` y cumple los índices nuevos | Verify de BG-11 |
| C4. Etapas 2 y 3 publicadas | Marca, `/<slug>/reservar` | Personal y clientes | WHEN corre `pnpm gate` en `bg-33` THE SYSTEM SHALL salir 0 y la línea base de la guardia SHALL ser `{}` | Republicar el anterior (sin esquema) | `pnpm gate` |
| C5. Etapa 4 publicada con `llave15.cl` agregado | `APP_URL`, `TRACKING_TOKEN_SECRET`, `EMAIL_FROM` nuevos (checklist) | Enlaces nuevos | WHEN corre `pnpm gate` en `bg-40` THE SYSTEM SHALL salir 0, incluido `pnpm test:web` | Quitar `APP_URL` de Secrets y republicar: vuelve a `PUBLIC_SITE_URL` | `pnpm gate` |
| C6. Sitio nuevo en el Replit nuevo | `web/vector-bikes/` publicado en `*.replit.app` | Nadie todavía | WHEN `node web/vector-bikes/scripts/check-redirects.ts <url replit.app>` corre THE SYSTEM SHALL salir 0 | Despublicar | el mismo comando |
| C7. DNS de `vectorbikes.cl` al Replit nuevo (checklist) | Rutas antiguas redirigen a `llave15.cl` | Clientes y enlaces antiguos | WHEN `node web/vector-bikes/scripts/check-redirects.ts https://vectorbikes.cl` corre THE SYSTEM SHALL salir 0 | Volver el DNS al Replit actual, que sigue sirviendo todo | el mismo comando |
| C8. Decomisiones | `BG-DC1`…`BG-DC4` | — | El "Done when" de cada una (abajo) | Un commit revertible cada una | El de cada una |

#### Criterios de aborto
De guardia: **Andrés**. Se evalúan durante la primera semana después de cada publicación (C1–C5) y de C7.
- [ ] WHEN `pnpm bg:check` contra producción sale 1 (algún cruce de sucursal) THE SYSTEM SHALL detener la publicación siguiente, restaurar el respaldo del día si el cruce es de datos y reportar (umbral: 1).
- [ ] WHEN Replit muestra más de 5 respuestas 5xx en una hora, o una sola 500 de `/api/reservas`, en las 24 horas siguientes a una publicación THE SYSTEM SHALL republicar el deployment anterior (umbral: 5 por hora o 1 de reservas).
- [ ] WHEN Vector Bikes no recibe ninguna reserva web en 3 días hábiles seguidos después de C2, C4 o C7 THE SYSTEM SHALL revisar la isla y la API con `node web/vector-bikes/scripts/check-redirects.ts https://vectorbikes.cl` y una reserva de prueba, y volver al deployment anterior si falla (umbral: 3 días).
- [ ] WHEN `pnpm test isolation` falla en cualquier paso THE SYSTEM SHALL no publicar ese paso (umbral: 1 prueba).
- [ ] WHEN `check-redirects.ts https://vectorbikes.cl` sale distinto de 0 después de C7 THE SYSTEM SHALL volver el DNS al Replit actual (umbral: 1 ruta).
- [ ] WHEN Resend muestra más de 5 % de rebotes en un día después del cambio de `EMAIL_FROM` THE SYSTEM SHALL volver `EMAIL_FROM` al dominio anterior (umbral: 5 %).

#### Migración de datos
- **Qué:** una fila nueva en `shops` (Vector Bikes, valores de hoy), `branches.shop_id` y `branch_id` en `bookings`, `booking_bikes`, `booking_blocks`, `booking_days`, `blocked_periods`, `booking_requests` y `whatsapp_messages`; el logo al almacenamiento.
- **Cómo:** `pnpm bg:backfill` (BG-05), idempotente, en una transacción, contra producción desde el Shell del Replit con el taller cerrado y respaldo del día (`docs/ventanas/bg-v2.md`).
- **Verificación:** `pnpm bg:backfill --dry-run` imprime `"pending":0`; después de C3, el NOT NULL lo garantiza la base; `pnpm bg:check` sale 0.
- **Punto de no retorno:** la publicación de V-BG3 (C3). Desde ahí, volver atrás exige restaurar el respaldo del día de esa ventana; hasta ahí, republicar es suficiente.

#### Decomisión
Ninguna es un paso de §9 ni de `tasks.json`; cada una se ejecuta como un encargo propio (`docs/encargos/BG-DCn-*.md`) cuando se cumple su precondición.

**`BG-DC1` — Retirar el sitio heredado del sistema.** Precondición: C7 hecho y 7 días con `check-redirects.ts https://vectorbikes.cl` en 0. Qué: `src/pages/index.astro` pasa a ser la portada mínima de Llave 15 (`PublicLayout`, `PLATFORM.name`, enlace `Ingresar` a `/admin/login`); se borran `src/pages/privacidad.astro`, `src/layouts/Base.astro`, `src/components/Landing.astro`, la excepción de frontera hacia `web/vector-bikes/src/content/site.ts` y las reglas de la portada en `global.css`; `astro.config.mjs` usa `APP_URL` como `site` y el sitemap solo `/`; `public/robots.txt` de Llave 15 (`Disallow: /taller`, `/admin`, `/plataforma`, `/api`); `tests/build/landing.test.ts` y `seo.test.ts` se reescriben (autorización del dueño en el encargo). Qué se conserva: `/<slug>/reservar`, `/<slug>/privacidad`, páginas por token. Done when: WHEN se pide `/` en `llave15.cl` THE SYSTEM SHALL mostrar la portada de Llave 15 con `Ingresar`, y `grep -r 'web/vector-bikes' src` SHALL no encontrar nada. Verify: `pnpm gate`.

**`BG-DC2` — Retirar el secreto heredado del seguimiento.** Precondición: ninguna orden no terminada tiene fila con token derivado de `CANCEL_TOKEN_SECRET` (consulta en el encargo) y pasaron 30 días desde la última. Qué: `ensureTrackingLink` deja de probar `CANCEL_TOKEN_SECRET`; `CANCEL_TOKEN_SECRET` queda solo para cancelaciones. Done when: WHEN se emite un enlace de seguimiento THE SYSTEM SHALL derivarlo solo de `TRACKING_TOKEN_SECRET`. Verify: `pnpm test tests/integration/tracking-secret.test.ts` (ajustada en ese encargo) y `pnpm gate`.

**`BG-DC3` — Fin de la convivencia de dominios.** Precondición: 30 días desde C7. Qué: `isAllowedOrigin` deja de aceptar el origen de `PUBLIC_SITE_URL`; `APP_URL` pasa a obligatoria; `SHOP_NOTIFY_EMAIL` y `EMAIL_REPLY_TO` salen de `getEmailEnv` y de `.env.example` (los usan solo `bg:backfill` desde BG-18). Done when: WHEN llega un POST con `Origin` de `vectorbikes.cl` THE SYSTEM SHALL responder 403. Verify: `pnpm test tests/integration/app-url.test.ts` (ajustada) y `pnpm gate`.

**`BG-DC4` — Sacar el sitio a `vector-bikes-web`.** Precondición: C7 hecho. Qué: el dueño crea el repositorio `vector-bikes-web` con el contenido de `web/vector-bikes/` (su `package.json` ya trae los pins), corre `pnpm install` allí y lo conecta al Replit nuevo; en este repo se borran `web/vector-bikes/`, `test:web` y el tramo `&& pnpm test:web` de `gate`, y la exclusión `web` de `tsconfig.json`. Done when: WHEN corre `pnpm gate` en este repo THE SYSTEM SHALL salir 0 sin `test:web`, y en `vector-bikes-web` `pnpm build` SHALL salir 0.

---

## 10. Configuración del entorno

### Prerrequisitos
| Herramienta | Versión | Check |
|---|---|---|
| Node | 24 (`.nvmrc`) | `node -v` → `v24.…` |
| pnpm | 12.4.2 (corepack si el global es más antiguo) | `pnpm --version` imprime `12.4.2` |
| Postgres local + `psql` | 16 en `127.0.0.1:5432`, con el rol de `.env` (bases `vector_bikes` y `vector_bikes_e2e`) | `pg_isready -h 127.0.0.1 -p 5432` |
| Chromium de Playwright | el de `@playwright/test` | lo deja el Bootstrap |
| git, rsync, cmp | los de macOS | `git --version` |
| **Sin duplicados de iCloud sin seguimiento** | — | `u="$(git ls-files --others --exclude-standard)" && test -z "$(printf '%s\n' "$u" \| grep -E ' 2(\.[^/]*)?$')"`; la coordinadora confirma que son copias y las borra antes del Bootstrap |

### Cuentas
Ninguna nueva para el build. Para el lanzamiento (checklist §20.1, del dueño): dominio `llave15.cl` agregado al Replit actual; dominio de envío `send.llave15.cl` verificado en Resend (SPF, DKIM, DMARC); widget de Cloudflare Turnstile para `llave15.cl` y `vectorbikes.cl`; un Replit nuevo para `vectorbikes.cl`.

### Variables de entorno
Accesores solo en `src/lib/env.ts` (RC 11). Los scripts nuevos se cargan con `node --env-file-if-exists=.env` (scripts de `package.json`); el `DATABASE_URL` del entorno tiene prioridad sobre `.env`, que es lo que usan los Verify con la base inalcanzable.

| Variable | Propósito | Dónde se obtiene | Requerida desde | Secreta |
|---|---|---|---|---|
| `APP_URL` | Origen de Llave 15 para cookie, CSRF y enlaces; sin ella, `PUBLIC_SITE_URL` | `https://llave15.cl` en Secrets de Replit (C5) | Opcional desde BG-34; obligatoria en BG-DC3 | No |
| `TRACKING_TOKEN_SECRET` | Secreto propio de los enlaces de seguimiento (≥ 32); sin ella, `CANCEL_TOKEN_SECRET` | `openssl rand -base64 48` en Secrets (C5) | Opcional desde BG-35 | Sí |
| `PUBLIC_SITE_URL` | Origen heredado (`vectorbikes.cl`) aceptado durante la convivencia; `site` de la portada heredada | existente | existente; deja de usarse en CSRF en BG-DC3 | No |
| `EMAIL_FROM` | Dirección de envío (`reservas@send.llave15.cl` desde C5); el nombre visible lo arma el sistema por taller | Resend | existente | No |
| `SHOP_NOTIFY_EMAIL`, `EMAIL_REPLY_TO` | Desde BG-18 solo los lee `pnpm bg:backfill` (correo de avisos de Vector Bikes); el envío usa `shops` | existentes | existentes; salen en BG-DC3 | No |
| `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Turnstile con el widget de `llave15.cl` (C5) | Cloudflare | existentes | La secreta, sí |

Las demás variables de `CLAUDE.md` no cambian. `.env.example` gana `APP_URL=` (BG-34) y `TRACKING_TOKEN_SECRET=` (BG-35) con su comentario.

### Archivos que deben commitearse
| Archivo | Por qué | Excepción en el ignore |
|---|---|---|
| `CLAUDE.md`, `AGENTS.md`, `tsconfig.json`, `.claude/settings.json`, `.claude/rules/*.md`, `.claude/skills/add-migration/SKILL.md` | Agentes y herramientas | — ningún patrón de `.gitignore` los cubre |
| `web/vector-bikes/{package.json,astro.config.mjs,tsconfig.json,vitest.config.ts}` | Configuración del sitio (§19.6) | — (`dist/` y `.astro/` sí se ignoran, y deben ignorarse) |
| `docs/ventanas/bg-v*.md`, `docs/corte-bike-garage.md`, `docs/nuevo-taller.md` | Operación | — |
| `drizzle/**` | Migraciones generadas | — |
| `package.json`, `pnpm-lock.yaml` | Scripts nuevos; la dependencia de Inter y su lockfile en BG-47 (la única vez que el lockfile cambia) | — |
| `public/brand/llave15-*.svg`, `src/styles/llave15.css` | Marca provisional y estilos de Llave 15 (BG-46–48) | — ningún patrón de `.gitignore` los cubre |
| `.env.example` | Plantilla de variables | `!.env.example` (existente, después de `.env.*`) |
| `.web.log`, `.smoke.log` | **No** se commitean | `*.log` (existente) |

### Bootstrap
```bash
# Desde la raíz del repo, con el bundle commiteado y pnpm --version = 12.4.2.
# El orden importa: precondiciones (repo, duplicados de iCloud, base del workspace) → archivos que
# gobiernan a agentes y herramientas (workspace/: CLAUDE.md, AGENTS.md, reglas, tsconfig.json con la
# exclusión de web/, configuración de web/vector-bikes/) → install → navegador → .env → chequeo
# estático → commit de rutas nombradas. El .gitignore ya existe y no cambia. No toca ninguna base.
git rev-parse --git-dir >/dev/null 2>&1 || git init -b main   # el repo ya existe: no hace nada
u="$(git ls-files --others --exclude-standard)" && test -z "$(printf '%s\n' "$u" | grep -E ' 2(\.[^/]*)?$')"   # precondición: sin duplicados de iCloud
base="$(cat blueprints/bike-garage/WORKSPACE_BASE)"; for f in CLAUDE.md AGENTS.md tsconfig.json .claude/settings.json .claude/rules/database.md .claude/rules/booking-engine.md .claude/rules/server-api.md .claude/rules/e2e.md .claude/rules/ui-design.md .claude/rules/taller-domain.md .claude/rules/taller-ui.md .claude/skills/add-migration/SKILL.md; do cmp -s "$f" "blueprints/bike-garage/workspace/$f" || git show "$base:$f" | cmp -s - "$f" || { echo "$f cambió después de $base: re-fusionar workspace/ y actualizar WORKSPACE_BASE"; exit 1; }; done   # guarda: cada archivo es la versión base o ya la fusionada; sale 0 en ambas
for f in .claude/rules/shops.md web/vector-bikes/package.json web/vector-bikes/astro.config.mjs web/vector-bikes/tsconfig.json web/vector-bikes/vitest.config.ts; do test ! -e "$f" || cmp -s "$f" "blueprints/bike-garage/workspace/$f" || { echo "$f existe y no es la versión del bundle"; exit 1; }; done   # guarda de archivos nuevos: no existe o ya es la del bundle; sale 0 en ambas
rsync -a blueprints/bike-garage/workspace/ ./   # reemplaza con las versiones fusionadas; sale 0 aunque no haya cambios (BSD y GNU)
pnpm install --frozen-lockfile
pnpm exec playwright install chromium   # ya instalado: sale 0
test -f .env || cp .env.example .env
pnpm check
git add -- CLAUDE.md AGENTS.md tsconfig.json .claude/settings.json .claude/rules .claude/skills web/vector-bikes && (git diff --cached --quiet || git commit -m "chore: bootstrap bike garage workspace")
```
**Re-fusión:** si un archivo administrado cambió en la rama después de `WORKSPACE_BASE`, la guarda se detiene. La coordinadora lleva esos cambios a las copias de `workspace/` (sin perder lo de esta fase), escribe en `WORKSPACE_BASE` el hash sobre el que fusionó, commitea el bundle y vuelve a correr el bloque.
**Seguro de correr dos veces.** Ningún paso edita un archivo que entrega `workspace/` (`package.json`, el lockfile y `.gitignore` nunca están ahí), así que la segunda corrida encuentra cada archivo igual a la versión fusionada (`cmp` sale 0), `rsync` no cambia nada, `pnpm install --frozen-lockfile`, `playwright install`, `test -f .env ||` y el commit condicionado salen 0. El `git add` nombra rutas: no arrastra archivos ajenos sin seguimiento. Archivos que el Bootstrap nunca sobrescribe después de la primera corrida: `package.json`, `pnpm-lock.yaml`, `.env`.
**Permisos:** el `.claude/settings.json` nuevo incluye la línea literal de `rsync` de esta fase, `cmp`, `git show` y todo comando de Verify (§19.3).

---

## 11. Dependencias

**Una dependencia nueva, ninguna actualización** (BG-D22, BG-D34). Pins leídos de `package.json` y `pnpm-lock.yaml` en `8bca898`; fuente: el lockfile; fecha: 2026-11-17; estado: **fijado por el lockfile, sin cambio**. Todos los instala la línea `pnpm install --frozen-lockfile` del Bootstrap (§10), salvo `@fontsource-variable/inter`, que entra en BG-47 con `pnpm add -w --save-exact @fontsource-variable/inter@5.3.0` (la corre la sesión coordinadora: el sandbox de Codex no tiene red) y desde ahí queda en el lockfile y la instala la misma línea. `web/vector-bikes/` no es un paquete del workspace de pnpm: resuelve los mismos paquetes desde `node_modules` de la raíz, y su `package.json` repite los pins para el repositorio `vector-bikes-web` (BG-DC4).

### Runtime
| Paquete | Versión | Fuente | Verificado | Instalado por | Propósito |
|---|---|---|---|---|---|
| astro | 7.3.2 | `pnpm-lock.yaml` | 2026-11-17 (fijado por el lockfile, sin cambio) | §10 Bootstrap (`pnpm install --frozen-lockfile`) | Sistema y sitio de Vector Bikes |
| @astrojs/node | 11.1.5 | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | Adaptador standalone de ambos |
| @astrojs/preact | 6.0.5 | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | Isla de reserva |
| @astrojs/sitemap | 3.7.4 | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | Sitemap de la portada |
| @tailwindcss/vite, tailwindcss | 4.3.3 | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | Directivas de `global.css` (y su copia) |
| @fontsource-variable/archivo, @fontsource/ibm-plex-mono, @fontsource/michroma | 5.3.0 | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | Tipografía de la portada heredada (`Base.astro`); `AppLayout` deja de cargarlas en BG-47 |
| @fontsource-variable/inter | 5.3.0 (exacta) | registro de npm, https://www.npmjs.com/package/@fontsource-variable/inter (publicada el 2026-07-19, última estable) | 2026-11-18 (verificada por la sesión coordinadora) | BG-47 (`pnpm add -w --save-exact @fontsource-variable/inter@5.3.0`) | Inter 400–700 de las superficies de Llave 15 (BG-D34) |
| preact | 10.29.8 | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | Isla |
| drizzle-orm | 0.45.2 | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | Esquema, `$defaultFn` (BG-D3) |
| postgres | 3.4.9 | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | Cliente de la app y de los scripts |
| zod | 4.6.5 | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | Validación de perfil, horarios, slugs |
| luxon | 3.7.2 | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | `src/lib/time.ts` |
| resend | 6.28.1 | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | Correo |
| sharp | 0.35.5 | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | Logo de "Mi taller" |
| @replit/object-storage | 1.0.0 | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | Logos en el almacenamiento |
| ics, qrcode, signature_pad | 3.12.0, 1.5.4, 5.1.4 | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | Existentes, sin cambio de uso |

### Desarrollo
| Paquete | Versión | Fuente | Verificado | Instalado por | Propósito |
|---|---|---|---|---|---|
| drizzle-kit | 0.31.10 | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | `pnpm db:generate` |
| vitest | 5.0.1 (rango `^5.0.1`) | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | Pruebas del sistema y del sitio |
| @electric-sql/pglite | 0.5.8 | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | Base por prueba |
| @playwright/test | 1.63.0 | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | Specs de tablet y de reserva |
| typescript | 6.0.3 (rango `~6.0.3`) | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | `tsc --noEmit` |
| @biomejs/biome | 2.5.13 | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | Formato y lint |
| @astrojs/check | 0.9.10 | `pnpm-lock.yaml` | 2026-11-17 (ídem) | §10 Bootstrap | `astro check` (raíz y `--root web/vector-bikes`) |

Runtimes y sistema (Node 24, pnpm 12.4.2 vía corepack, Postgres 16, Chromium): §10.

### Deliberadamente no usados
| Rechazado | En su lugar | Por qué |
|---|---|---|
| Postgres RLS por taller | Filtro por `branch_id` en `src/server/**` + prueba de dos talleres | Exigiría SQL a mano en `drizzle/` y cambiar la conexión por petición |
| Paquete del workspace de pnpm para `web/vector-bikes/` | Resolución desde la raíz + `package.json` propio para el repo nuevo | Cambiaría el lockfile; el sitio sale a otro repo (BG-D22) |
| Librería de redirecciones o proxy | Endpoint comodín de Astro (BG-D23) | Cinco prefijos y una ruta |
| Generador de slugs (`slugify`) | El slug lo escribe el administrador y lo valida zod | Sin dependencia nueva |

---

## 12. Estrategia de despliegue

### Hosting
Replit Autoscale actual = Llave 15 (decisión 14), `.replit` intacto. Replit nuevo para `vectorbikes.cl` con el sitio de `web/vector-bikes/` (después `vector-bikes-web`), construido con `corepack pnpm@12.4.2 install --frozen-lockfile && corepack pnpm@12.4.2 build` en su propio repo (BG-DC4) o, mientras vive aquí, publicado desde un repo clonado con `web/vector-bikes/` como raíz (lo decide el dueño en C6; `docs/corte-bike-garage.md`). Se construye en el Mac; el dueño publica.

### Environments
| Entorno | Rama | URL | Base | Terceros |
|---|---|---|---|---|
| Local (Mac) | — | http://localhost:4321 (sistema), http://127.0.0.1:4398 (sitio en `test:web`) | `vector_bikes` (dev), `vector_bikes_e2e` | correo `console` |
| Producción Llave 15 | `main` | `https://llave15.cl` (y `https://vectorbikes.cl` hasta C7) | Postgres de producción | Resend, Turnstile |
| Producción sitio | — | `https://vectorbikes.cl` desde C7 | ninguna | ninguno |

### CI/CD
Sin CI externo: `pnpm gate` (desde BG-39 incluye `pnpm test:web`) en el Mac antes de cada commit de paso y de cada publicación.

### Release and rollback
| Etapa | Publicaciones | Reversión |
|---|---|---|
| 1 — Cimientos | V-BG1 (`bg-05`), V-BG2 (`bg-08`, con `bg:backfill` en producción), V-BG3 (`bg-11`), luego `bg-16` sin ventana | Antes de V-BG3: republicar el anterior. Después: republicar `bg-08` (compatible con el esquema contraído); si hay que deshacer el contract, restaurar el respaldo del día de V-BG3 |
| 2 — Identidad | `bg-49` (BG-17 … BG-28 y BG-46 … BG-49), sin esquema | Republicar `bg-16` |
| 3 — Reservas por taller | `bg-33`, sin esquema | Republicar `bg-49` (o `bg-28` para volver al aspecto monocromo; no hay esquema de por medio) |
| 4 — Separación | `bg-40` + secretos nuevos (C5), sitio nuevo (C6), DNS (C7) | C5: quitar `APP_URL` y republicar `bg-33`; C7: volver el DNS |
| 5 — Plataforma | `bg-45`, sin esquema (la marca y `shop.manage` no tocan el esquema) | Republicar `bg-40`; los talleres creados quedan en la base sin uso |

Cada ventana con el taller cerrado, respaldo del día y los pasos de `docs/ventanas/bg-v*.md` (`corepack pnpm@12.4.2 install --frozen-lockfile`, `db:migrate` y `db:check` en el workspace de Replit, `rm -rf node_modules`, Republish). La app nunca migra al arrancar.
- **Local, identidad visual:** el paso anterior de BG-46 es `bg-28` y el de BG-29 es `bg-49` (orden de §9). Volver a `bg-46` o antes deja `package.json` y `pnpm-lock.yaml` sin Inter: después del `git reset --hard`, `pnpm install --frozen-lockfile` iguala `node_modules` al lockfile.
- **Local:** `git reset --hard bg-<NN-1>` y, si la base dev tiene migraciones de pasos revertidos, reiniciarla (solo la de `.env`, se niega dentro de un deployment; lo aprueba el operador cada vez) y volver a completar los datos:
  ```bash
  test -z "$REPLIT_DEPLOYMENT" && psql "$(node --env-file-if-exists=.env -p 'process.env.DATABASE_URL')" -v ON_ERROR_STOP=1 -c 'drop schema public cascade; create schema public; drop schema if exists drizzle cascade;' && pnpm db:migrate
  ```

### Domain, DNS, TLS
`llave15.cl` se agrega al Replit actual (C5; TLS de Replit). `vectorbikes.cl` sigue en el Replit actual hasta C7 y después apunta al Replit nuevo. `send.llave15.cl` en Resend con SPF, DKIM y DMARC. Pasos y verificación en `docs/corte-bike-garage.md`.

---

## 13. Estrategia de pruebas

| Capa | Framework | Cubre | Dónde | Corre |
|---|---|---|---|---|
| Guardias | Vitest + script | literales del taller en `src/`; expectativas que cambian | `tests/unit/shop-literals.test.ts`, `scripts/bg-expect-parity.ts` | `pnpm test`; Verify de cada paso |
| Unit | Vitest | tiempo, horarios por configuración, slugs, plantillas de correo, isla | `tests/unit/` | `pnpm test` |
| Integración | Vitest + PGlite | esquema, backfill, alcance, aislamiento de dos talleres por pantalla y tarea, páginas con Container API | `tests/integration/` | `pnpm test` (`pnpm test isolation`) |
| Build | Vitest | portada heredada | `tests/build/` | `pnpm test:build` |
| Tablet E2E | Playwright 820×1180 | recepción, control de calidad, seguimiento, etiqueta + página de reservas por taller (BG-33) | `e2e/` | `pnpm test:tablet` |
| Sitio | astro check + Vitest + `check-redirects.ts` | portada, privacidad, redirecciones contra el sitio construido | `web/vector-bikes/` | `pnpm test:web` |
| Smoke | sh + curl | servidor construido | `scripts/smoke.sh` | `pnpm smoke` |
| Salud | `platformHealth` | cruces de sucursal | `pnpm bg:check` | después de cada publicación |
| Manual | iPad real, navegador | reserva en `/<slug>/reservar`, recepción con dos talleres | §20.1 | antes de cerrar la fase |

### Flujos críticos E2E
1. Página de reservas de Vector Bikes y del Taller Demo E2E con su marca, comunas y disponibilidad propia (`reservar-taller.spec.ts`).
2. Los specs de tablet existentes con el taller sembrado (recepción, control de calidad, entrega, caja, venta, inventario, biblioteca).

### Datos de prueba
PGlite nuevo por prueba con todas las migraciones de `drizzle/`; `createTestDb()` siembra el taller Vector Bikes; las pruebas de reserva usan `createBookingTestDb()`; la prueba de dos talleres usa `seedTwoShops()` con Vector Bikes y el Taller Demo (§4), con datos parecidos (mismo teléfono de cliente, mismos días y horas cuando el paso lo permite). Las pruebas que leían `SITE` usan el accesorio `SITE` de `tests/helpers/shops.ts` (§4). Concurrencia: PGlite es de una conexión; los locks se prueban en secuencia contra el índice único (BITACORA §8).

### Lo que no se prueba
El envío real de una reserva desde el navegador (Turnstile necesita red; la API se prueba en integración); la publicación en Replit; el DNS (lo verifica `check-redirects.ts` contra el dominio real en C7); la entrega real de correos de `send.llave15.cl`.

---

## 14. Seguridad y secretos

| Tema | Control | Dónde |
|---|---|---|
| Aislamiento entre talleres | `branch_id` en toda tabla de operación; filtro en `src/server/**`; alcance obligatorio con dos talleres; prueba por pantalla y por tarea; `pnpm bg:check` | §8, BG-07–16, 36, 39 |
| Administrador de plataforma | Marca aparte; `/plataforma` solo metadatos y conteos; no abre datos de otro taller | BG-41–43 |
| Secretos | `TRACKING_TOKEN_SECRET` nuevo; ninguno en el repo; en Secrets de Replit | §10 |
| Validación | zod en todo borde (perfil, horarios, slugs, `taller`, alta) | `src/server/shops/**`, `handlers.ts` |
| CSRF | `isAllowedOrigin` con `APP_URL` y, en convivencia, `PUBLIC_SITE_URL`; páginas por token sin `Origin` | BG-34 |
| Turnstile y abuso | `cdata` = slug; límite por (taller, IP) | BG-30 |
| Tokens | Solo hash; el de seguimiento acepta el heredado hasta BG-DC2 | BG-35 |
| Datos personales | Llave 15 es encargado del tratamiento (Ley 21.719, FASE §7); logs sin PII; `bg:backfill` y `bg:check` imprimen solo conteos | `log.ts`, scripts |
| Comandos destructivos | Reinicio de la base dev y `git reset --hard`: confirmación del operador; `rm -rf`, `git push`, `git add -A`, `drizzle-kit push/drop/--custom` en `deny` | `.claude/settings.json` |
| Producción | Claude nunca la toca; el dueño corre `bg:backfill`, `bg:check` y `platform:admin` contra producción | checklist §20.1 |

---

## 15. Accesibilidad

WCAG 2.2 AA. Desde BG-47, los contrastes del manual de marca de Llave 15: texto principal sobre blanco cálido 15,58:1, secundario sobre blanco 7,01:1, etiqueta blanca sobre naranja 6,25:1, borde de control 3,02:1 y foco azul 6,37:1; anillo de foco 2px separado 2px, blanco sobre grafito; estados con texto además del color; la firma lleva `alt="Llave 15"` y el distintivo del pie del cliente es decorativo (`alt=""`) porque el texto lo nombra. En `/<slug>/reservar`: un solo `h1` con el nombre del taller, `label` en todo control, mensajes de error en texto con `aria-invalid`, foco visible, objetivos ≥ 44px, `prefers-reduced-motion`. En `/plataforma` y `/taller/mi-taller`: objetivos ≥ 48px, `fieldset`/`legend` para horarios por día, estados `Activo`/`Suspendido` con forma + texto. Manual antes de cerrar: teclado y VoiceOver en `/<slug>/reservar`, zoom 200 % en "Mi taller".

---

## 16. Observabilidad y costo

| Señal | Herramienta | Qué | Quién |
|---|---|---|---|
| Logs | `log.ts` → Replit | 5xx, errores de tareas y correos, `ShopScopeError` | Andrés |
| Salud de la plataforma | `pnpm bg:check` | cruces de sucursal | Andrés, después de cada publicación y semanal |
| Redirecciones | `check-redirects.ts https://vectorbikes.cl` | rutas antiguas | Andrés, diario la primera semana después de C7 |
| Correo | panel de Resend | rebotes del dominio de envío | Andrés |

| Métrica | Meta | Alerta |
|---|---|---|
| `bg:check` | `ok: true` | cualquier conteo > 0 |
| 5xx | 0 | > 5 por hora o 1 de `/api/reservas` |
| Rebotes | < 1 % | > 5 % en un día |

**Costo:** un Replit nuevo y pequeño para `vectorbikes.cl` y el dominio `llave15.cl`; Llave 15 escala por taller sin publicaciones nuevas (FASE §11).

---

## 17. Enrutamiento de modelos

NOT APPLICABLE — esta fase no agrega ni cambia llamadas a un modelo de lenguaje; el asistente de la biblioteca (BT-17) queda igual y es de la plataforma (decisión 12).

---

## 18. Skills para usar durante el build

| Skill | Pasos | Por qué | Instalación |
|---|---|---|---|
| playwright-cli (se activa sola) | BG-04, 15, 19, 23, 24, 27, 33 | Depurar specs de tablet y el de la página de reservas | `npm install -g @playwright/cli@latest` y luego `playwright-cli install --skills` |
| frontend-design (se activa sola) | BG-22, 25, 31, 37, 41, 44, 46–49 | Layouts, página de reservas, sitio y pantallas de plataforma fieles al sistema existente | `/plugin marketplace add anthropics/skills` y luego `/plugin install example-skills@anthropic-agent-skills` |

Si una no está instalada, se sigue con este blueprint y se anota en una línea. Las skills del proyecto `add-migration` (actualizada, §19.4) y `add-holidays` se conservan.

---

## 19. Espacio de trabajo del agente

`workspace/` refleja la raíz del repo y lo copia el Bootstrap (§10). **En brownfield, los archivos de `workspace/` que ya existen en el repo son versiones fusionadas**: conservan el contenido del repo en `WORKSPACE_BASE` (`8bca898`) y agregan lo de esta fase; reemplazan a los actuales al copiarse, solo después de la guarda. Ningún paso edita un archivo de esta lista. Nunca se emite `.claude/commands/`. Los archivos bajo `workspace/` son la fuente literal; esta sección describe su contenido.

### 19.1 `CLAUDE.md`
`workspace/CLAUDE.md` (< 200 líneas): el `CLAUDE.md` del repo completo, con: título y descripción de Llave 15 (primer taller: Vector Bikes); comandos nuevos (`node scripts/bg-expect-parity.ts`, `pnpm bg:backfill`, `pnpm bg:check`, `pnpm test:web`, `pnpm platform:admin`, con el paso desde el que existen) y la compuerta con `test:web`; "Estado del build" apuntando a `blueprints/bike-garage/` y a los encargos `docs/encargos/BG-NN-<tema>.md`; caminos de reserva y de alcance; fronteras con `src/server/shops/**` y `web/vector-bikes/**`; "Dónde vive cada cosa" con `schema-shops.ts` a la cabeza de la cadena de trece archivos, perfil y alcance del taller, `src/lib/time.ts`, `PLATFORM`; regla de código 14 reescrita (guardia) y regla 15 (alcance); tokens en `tokens.css`; variables `APP_URL` y `TRACKING_TOKEN_SECRET`; regla diferida `shops.md`; No negociable 6 enmendado (decisión 57) y 20–22 nuevos; "Reparto con Codex" literal; "Sistema de diseño" con la regla por paso (hasta BG-46 el monocromo, desde BG-47 Llave 15; BG-D40) en una sola tabla de tokens con las dos columnas, y el manual de marca en "Estado del build".

### 19.2 `AGENTS.md`
`workspace/AGENTS.md`: el del repo completo con los mismos cambios en comandos, orden de trabajo, reglas de código (14 y 16), fronteras, esquema, reglas por carpeta, No negociables 20–22 y la sección "Diseño por paso" (BG-D40): Codex lee solo `AGENTS.md`, así que la regla de entrada del aspecto Llave 15 también vive ahí.

### 19.3 `.claude/settings.json`
El allowlist existente completo más: la línea literal `rsync -a blueprints/bike-garage/workspace/ ./`; `node scripts/bg-expect-parity.ts` (con y sin argumentos); `node scripts/bg-backfill.ts:*`, `DATABASE_URL=postgres://127.0.0.1:1/x node scripts/bg-backfill.ts --dry-run 2>&1`, `pnpm bg:backfill:*`; `pnpm bg:check`, `DATABASE_URL=postgres://127.0.0.1:1/x node scripts/bg-check.ts 2>&1`; `pnpm test:web`, `sh web/vector-bikes/scripts/test-web.sh`, `node web/vector-bikes/scripts/check-redirects.ts:*`; `pnpm platform:admin:*`, `node scripts/platform-admin.ts:*`; `cp public/brand/*:*`, `cp public/favicon.svg:*`, `cp public/robots.txt:*`; `psql:*` (reinicio de §12, con confirmación). Deny agrega `git add -A`. Con la identidad visual (BG-D40) suma la línea literal `pnpm add -w --save-exact @fontsource-variable/inter@5.3.0` (BG-47) y la copia literal de BG-37 `cp public/brand/vector-bikes-logo.png public/brand/favicon-32.png public/brand/apple-touch-icon.png web/vector-bikes/public/brand/`. Cubre cada Verify, cada Checkpoint y §20.1.

### 19.4 Skills del proyecto
| Skill | Se activa con | Automatiza |
|---|---|---|
| add-migration (actualizada) | "agregar un campo", "nueva tabla", "migración" | cadena de trece archivos con `schema-shops.ts` a la cabeza; `branch_id` y alcance; expand → `bg:backfill` → contract |
| add-holidays (sin cambios) | feriados de un año nuevo | carga y prueba de feriados |

### 19.5 `.claude/rules/*.md`
| Archivo | `paths` | Cambio |
|---|---|---|
| `database.md` (fusionado) | sin cambios | cadena con `schema-shops.ts` (BG-D1); valores por defecto de compatibilidad (BG-D3); tres ventanas; índices por taller con el mismo nombre |
| `booking-engine.md` (fusionado) | sin cambios | configuración por taller (`BookingScope`), `src/lib/time.ts`, código con prefijo, lock por (sucursal, día) |
| `server-api.md` (fusionado) | + `src/pages/[slug]/**`, `src/pages/plataforma/**` | `taller` en la API, `shop_not_found`, Turnstile `cdata`, límite por taller, `APP_URL` y dos orígenes, `/plataforma` |
| `e2e.md` (fusionado) | sin cambios | excepción de la página de reservas (BG-D19); `global-setup.ts`/`fixtures.ts` los editan solo BG-04 y BG-33 |
| `ui-design.md` (fusionado) | + `src/pages/[slug]/**` | `tokens.css`, `PublicLayout`, pie `Gestionado con Llave 15`, portada heredada desde `web/vector-bikes/src/content/site.ts`; diseño por paso: hasta BG-46 el monocromo, desde BG-47 Llave 15 (paleta, Inter, forma, botón, foco, grupos de estado, marca provisional; BG-D32 … BG-D39) |
| `taller-domain.md` (fusionado) | sin cambios | `PLATFORM` y perfil del taller en vez de `SITE` |
| `taller-ui.md` (fusionado) | sin cambios | títulos con `PLATFORM.name`; "Mi taller"; diseño por paso (color de grupo en los estados desde BG-48, menú en grafito con la firma desde BG-49, `status--activo` y `status--suspendido` para `/plataforma`) |
| `shops.md` (nuevo) | `src/server/shops/**`, `src/pages/plataforma/**`, `scripts/bg-*.ts`, `scripts/platform-admin.ts`, `web/vector-bikes/**` | alcance, aislamiento, plataforma, slugs, sitio |
| `library.md`, demás | — | sin cambios (no se entregan) |

### 19.6 Configuración crítica para las compuertas
| Archivo | Ruta | Verify que lo necesita | Resolución / entorno | Exclusión del bundle |
|---|---|---|---|---|
| `tsconfig.json` (fusionado, **emitido**) | raíz | `pnpm check` de todo paso | agrega `"web"` a `exclude`: el sitio se chequea con su propio `tsconfig`; los imports de `src/` hacia `web/vector-bikes/src/content/site.ts` se siguen igual | `"blueprints"` en `exclude` (existente) |
| `web/vector-bikes/package.json` (**emitido**) | `web/vector-bikes/` | BG-37–39 (documenta pins; no es paquete del workspace) | ninguna instalación propia mientras vive aquí | n/a: no lo recorre ninguna herramienta de la raíz salvo Biome |
| `web/vector-bikes/astro.config.mjs` (**emitido**) | `web/vector-bikes/` | BG-37–39 (`astro check/build --root`) | importa `@astrojs/node`, `@astrojs/sitemap`, `@tailwindcss/vite`, `astro/config` desde `node_modules` de la raíz (resolución ascendente de Node) | su raíz es `web/vector-bikes/`: no ve `blueprints/` |
| `web/vector-bikes/tsconfig.json` (**emitido**) | `web/vector-bikes/` | `astro check --root web/vector-bikes` | extiende `astro/tsconfigs/strict` (resuelto hacia arriba); mismas banderas de la raíz (`allowImportingTsExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`) | `include` relativo a `web/vector-bikes/` |
| `web/vector-bikes/vitest.config.ts` (**emitido**) | `web/vector-bikes/` | `vitest run --config web/vector-bikes/vitest.config.ts` (BG-37–39) | `root` = su carpeta; `include: ["tests/**/*.test.ts"]` | su `root` no contiene `blueprints/` |
| `vitest.config.ts` | raíz (existente, sin cambios) | todo `pnpm test` | `getViteConfig`; `tests/setup.ts` fija el entorno; solo `tests/unit` y `tests/integration` | `exclude: "blueprints/**"` (existente) |
| `playwright.config.ts` | raíz (existente, sin cambios) | BG-04, 15, 19, 23, 24, 27, 33 | `env` explícito al servidor | `testDir: "./e2e"` |
| `e2e/global-setup.ts`, `e2e/fixtures.ts` | `e2e/` (los editan BG-04 y BG-33) | ídem | vacía todas las tablas de `public` y siembra el taller, su sucursal y el Taller Demo E2E | n/a |
| `drizzle.config.ts` | raíz (sin cambios) | pasos de esquema | `process.loadEnvFile(".env")`; `schema: "./src/server/db/schema*.ts"` toma `schema-shops.ts` sin edición | el glob solo mira `src/server/db/` |
| `tests/helpers/pglite.ts` | `tests/helpers/` (BG-04) | toda prueba de integración | migra desde `drizzle/` y siembra el taller | n/a |
| `biome.json` | raíz (sin cambios) | `pnpm check` | formatea también `web/vector-bikes/**` | `"!!**/blueprints"` (existente) |
| `pnpm-workspace.yaml` | raíz (sin cambios) | `pnpm install` | `packages: [".", "!blueprints/**"]`: ni el bundle ni `web/` son paquetes | `"!blueprints/**"` (existente) |

Ningún servicio en contenedor: Postgres local es prerrequisito (§10). Cargadores de entorno: `bg-backfill.ts`, `bg-check.ts` y `platform-admin.ts` leen `DATABASE_URL` con `getDbEnv()` y se invocan siempre por su script de `package.json` (`node --env-file-if-exists=.env`) o, en los Verify de conexión, con `DATABASE_URL` explícito en la misma línea; `drizzle.config.ts` carga `.env` solo; el sitio no lee variables.

**Páginas de la excepción de BG-27** (títulos `— Vector Bikes` o `SITE.name`): `src/pages/admin/{index,bloqueos,login}.astro`, `src/pages/admin/reservas/[id].astro`, `src/pages/taller/{index,indicadores,buscar,usuarios}.astro`, `src/pages/taller/bicicletas/[id].astro`, `src/pages/taller/clientes/{index,nuevo,[id]}.astro`, `src/pages/taller/reservas/{index,nueva}.astro`, `src/pages/taller/reservas/[id]/reprogramar.astro`, `src/pages/taller/recepcion/nueva.astro`, `src/pages/taller/ordenes/index.astro`, `src/pages/taller/ordenes/[id]/{index,componentes,galeria,cierre,control,lineas,adicional,recepcion,entrega,biblioteca}.astro`, `src/pages/taller/catalogo/{index,[id]}.astro`, `src/pages/taller/caja/index.astro`, `src/pages/taller/ventas/{index,nueva}.astro`, `src/pages/taller/compras/{index,[id]}.astro`, `src/pages/taller/gastos/index.astro`, `src/pages/taller/inventario/{index,nuevo,[id]}.astro`, `src/pages/taller/proveedores/index.astro`, `src/pages/taller/biblioteca/{index,buscar,asistente,herramientas,compatibilidad}.astro`, `src/pages/taller/biblioteca/{revision,propuestas}/index.astro`, `src/pages/taller/biblioteca/revision/[id].astro`, `src/pages/taller/biblioteca/propuestas/{nueva,[id]}.astro`, `src/pages/taller/biblioteca/{procedimientos,componentes,documentos}/[id].astro`.

**Pruebas de la excepción de BG-27** (solo línea de import, salvo la de esta fase): `tests/integration/low-stock.test.ts`, `tests/integration/lineas-aviso-repuesto.test.ts` (`SITE` → `tests/helpers/shops.ts`), `tests/build/landing.test.ts` (`whatsappHref` → `src/lib/whatsapp.ts`) y `tests/unit/vector-bikes-profile.test.ts` (reescrita contra `VECTOR_BIKES_SITE`; `--skip` en la paridad).

#### Resolution convention matrix
**Convención:** importación relativa con extensión `.ts`/`.tsx` explícita, sin alias ni barrels. Reexportaciones transitorias declaradas: `TIMEZONE` en `booking/rules.ts` y `localToday`/`addDays`/`localToInstant` en `booking/slots.ts` (BG-02 → se quitan en BG-28).

| Contexto | Comando | Forma | Config que lo hace funcionar |
|---|---|---|---|
| App | `pnpm build` / `pnpm dev` | `../shops/scope.ts`, `../../../web/vector-bikes/src/content/site.ts` | `tsconfig.json` `allowImportingTsExtensions`; Vite resuelve la ruta literal, también fuera de `src/` (dentro de la raíz del repo) |
| Tests | `pnpm test` | igual | `vitest.config.ts` (`getViteConfig`) |
| Scripts | `node --env-file-if-exists=.env scripts/bg-backfill.ts`, `… scripts/bg-check.ts`, `… scripts/platform-admin.ts`, `node scripts/bg-expect-parity.ts`, `node web/vector-bikes/scripts/check-redirects.ts` | igual | Node 24 quita tipos y resuelve la ruta literal (`erasableSyntaxOnly`); `tsc` la acepta por `allowImportingTsExtensions` + `noEmit` |
| Build | `pnpm build` | salida `dist/server/entry.mjs` | Vite reescribe los especificadores |
| Sitio | `pnpm exec astro build --root web/vector-bikes` | `../content/site.ts`; paquetes desde `node_modules` de la raíz | `web/vector-bikes/astro.config.mjs` + `web/vector-bikes/tsconfig.json` (mismas banderas) |
| Pruebas del sitio | `pnpm exec vitest run --config web/vector-bikes/vitest.config.ts` | `../src/lib/redirects.ts` | `root` del config del sitio |
| drizzle-kit | `pnpm db:generate` | `./schema-shops.ts` desde `schema.ts` | cargador TS de drizzle-kit; glob de `drizzle.config.ts` |
| Playwright | `pnpm test:tablet` | `./fixtures.ts`; `../scripts/vector-bikes-profile.ts` desde `global-setup.ts` | transformación TS de Playwright |

Un paquete nuevo, `@fontsource-variable/inter` (BG-47): `AppLayout` importa su CSS (`@fontsource-variable/inter/index.css`) y el `.woff2` latino con `?url` para precargarlo, igual que `Base.astro` hace hoy con Archivo; lo resuelve Vite en la app, en el build y en Vitest (`getViteConfig`), y ningún script ni `web/vector-bikes/` lo importa. El nombre `inter-latin-wght-normal.woff2` lo confirma el Verify de BG-47 (`test -f`).

#### Cross-artifact value reconciliation
| Valor | Fuente | Literal | Otras apariciones | Comparado |
|---|---|---|---|---|
| Base del workspace | `WORKSPACE_BASE` | `8bca898` | §10 (guarda), Verify de BG-22, harness de §9.1 | yes |
| Copia del workspace | §10 | `rsync -a blueprints/bike-garage/workspace/ ./` | `settings.json` (literal) | yes |
| Cadena de esquema | `database.md` (workspace) | `schema-shops.ts ← schema.ts ← schema-taller.ts ← schema-inventory.ts ← schema-orders.ts ← schema-reports.ts ← schema-cash.ts ← schema-sales.ts ← schema-payments.ts ← schema-library-catalog.ts ← schema-library-knowledge.ts ← schema-library-procedures.ts ← schema-library-private.ts` | `CLAUDE.md`, `AGENTS.md`, add-migration, §1 | yes |
| Glob de esquema | `drizzle.config.ts` | `./src/server/db/schema*.ts` | `database.md` | yes |
| Script de migración de datos | `package.json` (BG-05) | `node --env-file-if-exists=.env scripts/bg-backfill.ts` | Verify de BG-05, `CLAUDE.md`, `AGENTS.md`, `settings.json` (`pnpm bg:backfill:*`) | yes |
| Script de salud | `package.json` (BG-39) | `node --env-file-if-exists=.env scripts/bg-check.ts` | Verify de BG-39, `CLAUDE.md`, `AGENTS.md`, `settings.json`, `docs/corte-bike-garage.md` | yes |
| Script del sitio | `package.json` (BG-39) | `sh web/vector-bikes/scripts/test-web.sh` | Verify de BG-39, `CLAUDE.md`, `AGENTS.md`, `settings.json` | yes |
| Script de la marca | `package.json` (BG-45) | `node --env-file-if-exists=.env scripts/platform-admin.ts` | Verify de BG-45, `CLAUDE.md`, `AGENTS.md`, `settings.json` | yes |
| Puerto del sitio en pruebas | `test-web.sh` (BG-39) | `4398` | §9.1 harness, §12 | yes |
| Entrada del sitio construido | `web/vector-bikes/astro.config.mjs` (`output: "server"`, `outDir` por defecto) | `web/vector-bikes/dist/server/entry.mjs` | `test-web.sh` (BG-39) | yes |
| HTML de la portada del sitio | `astro.config.mjs` del sitio (`build.format` por defecto `directory`) | `web/vector-bikes/dist/client/index.html`, `web/vector-bikes/dist/client/privacidad/index.html` | Verify de BG-37 y BG-38 | yes |
| URL de reserva de Vector Bikes | `web/vector-bikes/src/content/site.ts` (BG-26) | `https://llave15.cl/vector-bikes/reservar` | Verify de BG-26 y BG-37, FASE decisión 15 | yes |
| Origen de las redirecciones | `web/vector-bikes/src/lib/redirects.ts` (BG-38) | `https://llave15.cl` | `check-redirects.ts`, `docs/corte-bike-garage.md`, `.env` de producción `APP_URL` | yes |
| Slug de Vector Bikes | `scripts/vector-bikes-profile.ts` | `vector-bikes` | `site.ts` del sitio, `global-setup.ts`, URL de reserva, logo `/vector-bikes/logo`, spec BG-33 | yes |
| Prefijos de código | perfiles | `VB`, `TD` | Verify y criterios de BG-04, BG-07, `global-setup.ts` | yes |
| Pie del cliente | `src/lib/platform.ts` (`PLATFORM.footerLine`) | `Gestionado con Llave 15`; desde BG-49 precedido de `<nombre del taller> · ` | `brand.ts`, `PublicLayout`, `email/templates.ts` (BG-49), criterios BG-17–24, 31, 33, 49 | yes |
| Rutas de la marca de Llave 15 | archivos de `public/brand/` (BG-46, BG-47) | `/brand/llave15-distintivo.svg`, `/brand/llave15-firma.svg`, `/brand/llave15-firma-invertida.svg`, `/brand/llave15-firma-mono.svg`, `/brand/llave15-favicon-16.svg` | `AppLayout` (íconos, BG-47), `/admin/login` (BG-48), `TallerLayout` y `PublicLayout` (BG-49), pruebas `llave15-*.test.ts`, `ui-design.md`, `taller-ui.md` | yes |
| Ámbito de Llave 15 | `AppLayout` (BG-47) | `l15` (`<html lang="es-CL" class="l15">`) | `:root.l15` y `:not(.l15)` de `tokens.css` (BG-47), `.l15` de `llave15.css` (BG-48), `llave15-tokens.test.ts` | yes |
| Familia de la interfaz | CSS de `@fontsource-variable/inter` | `"Inter Variable"` | `--display`, `--body` y `--mono` de `:root.l15` (BG-47) | yes |
| Pin de Inter | §11 | `5.3.0` | comando `pnpm add` y Verify de BG-47, `settings.json`, `package.json` | yes |
| Hex nuevos de la paleta | `:root.l15` de `tokens.css` (BG-47) | los 19 de §7, en minúsculas | lista literal del Verify de BG-47, §7, `ui-design.md`; `CLAUDE.md` los muestra en mayúsculas como el resto de su tabla (las pruebas comparan sin distinguir); los SVG de BG-46 y BG-47 usan un subconjunto | yes |
| Texto del descriptor | `src/lib/platform.ts` (`PLATFORM.descriptor`, BG-47) | `Software de gestión para talleres de bicicletas` | `/admin/login` (BG-48), criterios y `--allow` de BG-47, criterio de BG-48 | yes |
| Remitente | `src/server/email/brand.ts` (`senderFor`) | `<Taller> · Llave 15 <dirección>` | criterios BG-17–19, §5 | yes |
| Nueve patrones de la guardia | `tests/unit/shop-literals.test.ts` | `Vector Bikes`, `Vitacura`, `Las Condes`, `Kennedy`, `vectorbikes`, `vector.bikes`, `$15.000`, `85095780`, `8509 5780` | Verify de BG-01, BG-26, BG-27, BG-28 | yes |
| Pruebas de siembra de BG-04 | §9 BG-04 | las quince + `tests/helpers/pglite.ts` | Verify y Checkpoint de BG-04, `tasks.json` `files`, épica 01 | yes |
| Accesorio `SITE` de pruebas | `tests/helpers/shops.ts` (BG-18) | mismos campos y valores que `src/lib/site.ts` en `8bca898` | imports de `rescheduled-email`, `received-email`, `ready-email`, `pricing-emails`, `part-added-email`, `delivery-date-email`, `low-stock`, `lineas-aviso-repuesto` | yes |
| Ruta del bundle | — | `blueprints/` | `biome.json`, `tsconfig.json` (raíz), `vitest.config.ts`, `pnpm-workspace.yaml` | yes |

Cada contrato se ejerce en el primer paso donde existen ambos lados: el backfill se ejecuta en BG-08 contra la base dev; el sitio se construye y se sirve en BG-37–39 (`test-web.sh` arranca `dist/server/entry.mjs` y corre el verificador); los scripts se ejecutan en su propio Verify (BG-01, 05, 39, 45); el servidor del sistema corre en cada `pnpm gate` (smoke + Playwright).

#### Byte-exact artifact reconciliation
| Artefacto | Autor | Primer diff | Reglas que lo restringen | Llamada del runtime | Confirmado |
|---|---|---|---|---|---|
| `VECTOR_BIKES_PROFILE` (§4) | BG-04 | BG-04 (`vector-bikes-profile.test.ts`) | `src/lib/site.ts` y `src/server/booking/rules.ts` en `8bca898`, leídos campo por campo al escribir §4 | n/a (datos) | yes |
| Accesorio `SITE` de pruebas | BG-18 | BG-18 (pruebas que lo importan) | copia literal de `git show 8bca898:src/lib/site.ts` | n/a (datos) | yes |
| `Elige Vitacura o Las Condes.`, `Elige Ñuñoa o Providencia.` | BG-08 | BG-08 | mensaje de hoy en `handlers.ts:176,185,195`; regla de unión de §5 | n/a (concatenación) | yes |
| `TD-AAMMDD-HHMM`, `VB-AAMMDD-HHMM` | BG-07 | BG-07 | `nextCode` de `create-booking.ts:38` con el prefijo | n/a | yes |
| `Taller Demo · Llave 15 <reservas@send.vectorbikes.cl>` | BG-17 | BG-17 | `EMAIL_FROM` de `tests/setup.ts` (`Vector Bikes <reservas@send.vectorbikes.cl>`); regla de §5 | n/a (concatenación) | yes |
| `Te recordamos tu reserva en Taller Demo.` | BG-18 | BG-18 | `templates.ts:257` (`Te recordamos tu reserva en Vector Bikes.`) con el nombre del perfil | n/a | yes |
| `$9.000` | BG-12, 25 | mismo paso | `formatClp` del repo (regex, sin `Intl`) | determinista | yes |
| `10:00`, `11:00`, `12:00` (Taller Demo, lunes `2026-10-05`) | BG-06 | BG-06 | grilla de `slots.ts`: inicio + bloque mientras termine antes del cierre (13:00); `2026-10-05` es lunes (mismo día que usa `foundation.test.ts`) | luxon `weekday` | yes |
| `2026-10-04` para `2026-10-05T02:30:00Z` | BG-02 | BG-02 | Chile está en UTC−3 en octubre (horario de verano desde el primer domingo de septiembre) | luxon `setZone("America/Santiago")` | yes — la hora inexistente de septiembre la busca la propia prueba, sin literal |
| Texto de las migraciones que buscan los Verify de BG-03, 09, 10, 11 (`CREATE TABLE "shops"`, `SET NOT NULL`, `DROP INDEX`, `CREATE UNIQUE INDEX`, `DROP CONSTRAINT "…"`, `ALTER TABLE`) | drizzle-kit 0.31.10 | mismo paso | los Verify buscan presencia de sentencias y ausencia de borrados, no cuentan líneas salvo las cuatro `ALTER TABLE` de BG-11 | evidencia del formato en el propio repo: `drizzle/0001_huge_ultron.sql` (citado en el blueprint de la fase 2) `ALTER TABLE "bookings" DROP CONSTRAINT "bookings_status_check";--> statement-breakpoint`, una sentencia por línea | yes |
| `"pending":0` | BG-05 | BG-08 | `JSON.stringify` sin espacios | determinista | yes |
| `Location: https://llave15.cl/taller/ordenes/1?a=b` | BG-38 | BG-38 | `legacyRedirect` = origen + `pathname` + `search` | `URL` de Node (normaliza igual en `pathname`/`search`) | yes |

---

## 20. Compuerta de aceptación, riesgos y registro de decisiones

### 20.1 Compuerta global de aceptación
```bash
pnpm install --frozen-lockfile   # expect: exit 0, lockfile sin cambios
pnpm check                       # expect: exit 0
pnpm test                        # expect: exit 0, 0 failed, 0 skipped (incluye la prueba de dos talleres y la guardia)
pnpm test isolation              # expect: exit 0, 0 failed
pnpm db:migrate                  # expect: exit 0
pnpm db:check                    # expect: exit 0, {"ok":true,...}
pnpm bg:backfill --dry-run | grep -qF '"pending":0'   # expect: exit 0
pnpm bg:check                    # expect: exit 0, {"ok":true,...}
pnpm build                       # expect: exit 0
pnpm test:build                  # expect: exit 0
pnpm test:tablet                 # expect: exit 0, 0 failed
pnpm test:web                    # expect: exit 0
sh scripts/smoke.sh              # expect: exit 0
test "$(node -p "Object.keys(require('./tests/unit/shop-literals-baseline.json')).length")" = 0   # expect: exit 0 — guardia vacía
git rev-parse --verify -q bg-16 >/dev/null && git diff --quiet 8bca898 bg-16 -- tests/build   # expect: exit 0 — el tag existe y la etapa 1 no tocó las pruebas del build
node scripts/bg-expect-parity.ts --base 8bca898 --allow 'Llave 15' --allow '/vector-bikes/logo' --allow '/vector-bikes/reservar' --skip tests/unit/vector-bikes-profile.test.ts --skip tests/unit/permissions.test.ts --skip tests/integration/customers.test.ts   # expect: exit 0 — solo cambiaron las expectativas declaradas
pnpm gate                        # expect: exit 0
```
**Criterios FASE §14 → prueba:** tabla al final de BG-45 (§9).

**Compuertas manuales (una vez, después del build):**
- [ ] Un tag por paso: `test "$(git tag -l 'bg-*' | wc -l | tr -d ' ')" = 49` sale 0.
- [ ] Archivos commiteados, uno por invocación: `git ls-files --error-unmatch CLAUDE.md`, `… AGENTS.md`, `… tsconfig.json`, `… .claude/settings.json`, `… .claude/rules/shops.md`, `… web/vector-bikes/package.json`, `… web/vector-bikes/astro.config.mjs`, `… docs/ventanas/bg-v1.md`, `… docs/ventanas/bg-v2.md`, `… docs/ventanas/bg-v3.md`, `… docs/corte-bike-garage.md`, `… docs/nuevo-taller.md` — cada uno sale 0; y `git check-ignore -q web/vector-bikes/package.json; test $? -eq 1` y `git check-ignore -q docs/corte-bike-garage.md; test $? -eq 1` (1 = no ignorado; 128 = uso, y entonces falla).
- [ ] Ningún duplicado de iCloud commiteado: `test -z "$(git ls-files | grep -E ' 2(\.[^/]*)?$')"` sale 0.
- [ ] Ninguna prueba importa `src/lib/site.ts`: `grep -rq 'lib/site.ts' tests e2e; test $? -eq 1` sale 0.
- [ ] Bootstrap re-ejecutado sobre el árbol terminado: **sale 0**, `package.json` conserva `bg:backfill`, `bg:check`, `test:web` y `platform:admin`, y `pnpm test` sigue en 0.
- [ ] §19.6: cada fila dice `Comparado: yes` y `pnpm check` se corrió con `blueprints/bike-garage/` presente.
- [ ] Ningún No-Objetivo de §1 construido.
- [ ] **Lanzamiento — ventanas:** V-BG1 (`bg-05`), V-BG2 (`bg-08`, con `pnpm bg:backfill --logo public/brand/vector-bikes-logo.png` en producción y `--dry-run` con `"pending":0`) y V-BG3 (`bg-11`) publicadas por el dueño con el taller cerrado, respaldo del día y `docs/ventanas/bg-v*.md`.
- [ ] **Lanzamiento — clave de la base de producción rotada** antes de la etapa 4 (FASE §12).
- [ ] **Lanzamiento — dominio y correo:** `llave15.cl` agregado al Replit actual; `send.llave15.cl` verificado en Resend; widget de Turnstile para `llave15.cl` y `vectorbikes.cl`; `APP_URL`, `TRACKING_TOKEN_SECRET`, `EMAIL_FROM` y `PUBLIC_TURNSTILE_SITE_KEY` en Secrets (C5).
- [ ] **Lanzamiento — sitio y DNS:** Replit nuevo con `web/vector-bikes/` (C6) y DNS de `vectorbikes.cl` (C7); después, `node web/vector-bikes/scripts/check-redirects.ts https://vectorbikes.cl` sale 0.
- [ ] **Lanzamiento — Make.com:** las cuatro tareas llaman a `https://llave15.cl/api/tareas/*` con el mismo `TASKS_SECRET`.
- [ ] **Lanzamiento — marca de plataforma:** `pnpm platform:admin <correo de Andrés>` contra producción sale 0.
- [ ] **Lanzamiento — documentos (FASE §7):** términos con cada taller, política de privacidad de Llave 15 y procedimiento de supresión, antes del segundo taller real.
- [ ] **Lanzamiento — tablet real y navegador:** recepción y control de calidad en el iPad con dos talleres en la base; una reserva real en `/vector-bikes/reservar` desde un teléfono.
- [ ] **Lanzamiento — logo de Llave 15:** los SVG provisionales de BG-46 y BG-47 (BG-D37) se reemplazan por los originales del dueño en las mismas rutas de `public/brand/` cuando lleguen; después, `pnpm test tests/unit/llave15-brand.test.ts tests/integration/llave15-tokens.test.ts` y `pnpm gate` salen 0.
- [ ] **Lanzamiento — revisión visual de Llave 15:** el dueño compara en el iPad y en escritorio una orden de `/taller/ordenes/<id>`, `/admin/login` y `/vector-bikes/reservar` con `docs/marca/llave15-muestra-orden.png` y `docs/marca/llave15-variantes.png` (menú en grafito con la firma, botón primario naranja, estados con forma, texto y color, pie `Vector Bikes · Gestionado con Llave 15`).
- [ ] **Decomisiones:** `BG-DC1` a `BG-DC4` según §9.1.
- [ ] **Cierre de fase (FASE §14.11):** un segundo taller opera un mes junto a Vector Bikes sin cruces; `pnpm bg:check` sale 0 cada semana del mes.

### 20.2 Registro de riesgos
| Riesgo | Prob. | Impacto | Señal temprana | Mitigación |
|---|---|---|---|---|
| Un taller ve datos de otro (FASE §11) | M | A | Prueba de dos talleres en rojo; `bg:check` > 0 | `branch_id` obligatorio; alcance que falla con dos talleres (BG-D4); prueba por pantalla y tarea; revisión de seguridad antes de la etapa 4 (dueño: la coordinadora) |
| Migración de reservas en producción (FASE §11) | M | A | `db:check`, `bg:backfill --dry-run` o el smoke fallan en la ventana | Taller cerrado, respaldo del día, expand → migrar → contract en tres publicaciones; `bg:backfill` idempotente |
| Enlaces ya enviados dejan de funcionar (FASE §11) | B | A | Un cliente reporta un enlace roto | Redirecciones permanentes (BG-38) + verificador contra el dominio real; secreto heredado del seguimiento (BG-35) |
| Regresión visible para Vector Bikes (FASE §11) | M | A | `bg-expect-parity.ts` sale 1 | Paridad hasta la etapa 2; cambios declarados por paso |
| SEO de vectorbikes.cl (FASE §11) | M | M | Search Console pierde páginas | El sitio nuevo conserva URLs, títulos y JSON-LD; sitemap igual |
| Costo de operación (FASE §11) | B | B | Dos Replit y dos dominios | Replit pequeño para el sitio; Llave 15 escala sin publicaciones nuevas |
| Correos marcados como spam (FASE §11) | M | M | Rebotes en Resend | `send.llave15.cl` con SPF, DKIM y DMARC; criterio de aborto 5 % |
| `$defaultFn` de drizzle-orm 0.45.2 con un `SQL` | B | A | La prueba de BG-03 falla en los criterios 4–5 | **Mitigado:** la coordinadora confirmó en `drizzle-orm` 0.45.2 (`insert.js`, línea 380) que el resultado de `defaultFn` se usa tal cual cuando es un `SQL`; la prueba de BG-03 lo vuelve a comprobar en PGlite |
| La base dev tiene más de una sucursal | M | M | `pnpm bg:backfill` sale 1 (`ambiguous`) en BG-08 | Confirmación previa de BG-08: la coordinadora reinicia la base dev (§12) o la deja con una sucursal antes del paso |
| `bg-expect-parity.ts` no ve una expectativa que cambió dentro de un objeto de varias líneas | M | M | Revisión del diff de `tests/` | La revisión de cada pase sigue la lista de `docs/encargos/README.md` (`git diff -- tests/`) |
| Pruebas que importan `src/lib/site.ts` se rompen al borrarlo | M | A | `pnpm check` falla en BG-27 por un import inexistente | Reparto por paso (encabezado del documento): cada una cambia solo su import en el paso que toca lo que prueba; BG-27 y §20.1 comprueban que ninguna lo importa |
| Pasos mecánicos grandes (BG-04, 27, 28, 34) | M | M | El pase de Codex excede una sesión | Mecánicos y con Verify que limita qué cambia; si se atoran dos veces, vuelven a la coordinadora |
| iCloud duplica archivos (`* 2.*`) | A | M | Un `… 2.sql` en `drizzle/` | Guarda en Bootstrap y en los Checkpoints de esquema; `git add -u` en las excepciones |
| Bundles viejos de la isla en caché sin `taller` | M | B | 422 `taller` en logs con dos talleres | Sin `taller` y con un taller funciona; la isla nueva siempre lo envía |
| Límites del sandbox de Codex (sin red ni Postgres) | A | B | Codex no puede correr `db:migrate`, `test:tablet`, `test:web` ni `gate` | Reparto: Codex genera y corre check/test/build; Claude migra, verifica y commitea |
| `pnpm add` sin red en el sandbox de Codex (BG-47) | A | B | Codex no puede instalar Inter | La sesión coordinadora corre `pnpm add -w --save-exact @fontsource-variable/inter@5.3.0` antes del pase y el lockfile entra en el Checkpoint |
| El `.woff2` de Inter tiene otro nombre que el previsto | B | B | `test -f node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2` falla en BG-47 | La coordinadora lista esa carpeta después del `pnpm add`; si el nombre difiere, detiene el paso y corrige el blueprint antes del pase (nunca el Verify dentro del encargo) |
| Los SVG provisionales difieren de los originales | A | B | El dueño los compara con el manual | Mismas rutas en `public/brand/`; el reemplazo no toca código (BG-D37, checklist §20.1) |
| La identidad Llave 15 se filtra a la portada heredada o al sitio de Vector Bikes | B | M | `pnpm test:build` falla o el sitio cambia de aspecto en C6 | Ámbito `l15` en `<html>` de `AppLayout` (BG-D32); `global.css` y `Base.astro` intactos en BG-47 y BG-48; BG-37 copia solo los archivos de Vector Bikes |
| Un encargo anterior a BG-47 aplica el aspecto nuevo antes de tiempo | M | M | El diff de un paso anterior toca colores, radios o fuentes | "Hasta BG-46 / desde BG-47" en `CLAUDE.md`, `AGENTS.md`, `ui-design.md` y `taller-ui.md` (BG-D40); la revisión de cada pase mira `git diff -- src/styles src/layouts` |

### 20.3 Registro de decisiones
Numeración propia de este blueprint (`BG-D#`). Las decisiones globales 1–57 viven en `blueprints/vector-taller-f1/blueprint.md` §20.3; la 57 abre esta fase.

| # | Decisión | Alternativa rechazada | Por qué | Se revierte si |
|---|---|---|---|---|
| BG-D1 | `shops` vive en `src/server/db/schema-shops.ts`, nueva cabeza de la cadena, con sus propios helpers de tiempo | `shops` dentro de `schema.ts` sobre `branches` | `schema.ts` (291 líneas) recibe además siete columnas, índices, compatibilidad y contract; un archivo propio deja margen bajo 400 y no rompe el sentido de la cadena | `schema.ts` necesita importar algo que dependa de `shops` y ya no cabe el orden |
| BG-D2 | `database.md`, `CLAUDE.md` y `AGENTS.md` describen la cadena nueva desde el Bootstrap ("se crea en BG-03"), no en el mismo paso | Editar la regla y la fila "Esquema" en BG-03 | Ningún paso edita un archivo de `workspace/` (guarda de `WORKSPACE_BASE`, F2-D24); es el mismo patrón de la fase 2 | — |
| BG-D3 | Valores por defecto de compatibilidad con `$defaultFn` (`onlyShopId`, `onlyBranchId`): con exactamente un taller o una sucursal, la fila sin la columna se enlaza sola; con dos, queda null y el NOT NULL la rechaza | Editar las 121 pruebas que insertan sucursales y las que insertan reservas | Paridad sin tocar valores; con dos talleres el valor es null y falla fuerte, nunca cruza | Una prueba de dos talleres muestra un camino de producción que dependía del valor por defecto |
| BG-D4 | Alcance (`BookingScope` o `branchId`) como último argumento opcional; sin él, `singleShopScope`, que lanza con dos talleres | Alcance obligatorio en todas las firmas desde el primer paso | Mantiene las firmas y la suite; con dos talleres un olvido es un 500 visible (criterio de aborto), no un cruce | Se encuentra un olvido en producción después del segundo taller |
| BG-D5 | Tres ventanas: V-BG1 expand, V-BG2 migrar datos + código, V-BG3 contract con **tres generaciones separadas** (NOT NULL+PK, índices, CHECK) publicadas juntas | Una ventana por cambio destructivo (FASE §5 "cada una en su propia ventana") | La coordinadora fijó tres ventanas; cada cambio destructivo va en su propio paso, generación y Verify, y la reversión a `bg-08` es compatible con las tres | El dueño prefiere cinco publicaciones: se parte V-BG3 por paso sin cambiar el código |
| BG-D6 | Pruebas existentes con cambios **solo de firma, de siembra o de su línea de import** no cuentan para el límite de 5 archivos; cuatro pasos mecánicos son excepciones declaradas (BG-04, 27, 28, 34) | Repartir 121 + 30 archivos de prueba en pasos de 5 | Son cambios mecánicos y `bg-expect-parity.ts` los vuelve decidibles; F2-D2 es el precedente | Un pase mecánico se atora dos veces |
| BG-D7 | Paridad por script (`bg-expect-parity.ts`: colas de matcher en el diff de `tests/` y `e2e/`, con `--allow` declarado) | Revisión manual del diff | Hace decidible "sin cambiar valores esperados" | — |
| BG-D8 | El perfil de Vector Bikes vive fuera de `src/` (`scripts/vector-bikes-profile.ts`); el correo de avisos de producción sale de `SHOP_NOTIFY_EMAIL` | Constante en `src/` | Regla 14 y guardia; el valor real de avisos solo está en Secrets | — |
| BG-D9 | `shops` agrega `address_short` y `certifications` a la lista de FASE §5; `instagramHandle` se deriva de la URL | Derivar la dirección corta con texto | Los correos y el informe usan hoy la forma corta exacta (`Av. Kennedy 7666, Vitacura`) y las certificaciones | — |
| BG-D10 | Logo en el almacenamiento (`shops/<id>/logo.png`), servido por `/<slug>/logo`; `bg:backfill --logo` sube el de Vector Bikes | Archivos estáticos por taller en `public/` | Un taller nuevo no exige publicar; FASE §5 (`logo_key`) | — |
| BG-D11 | Los índices por taller conservan su nombre | Nombres nuevos | `users-schema.test.ts` y `customers.test.ts` afirman los nombres | — |
| BG-D12 | `shops.timezone` fijado a `America/Santiago` por CHECK; el motor usa `TIMEZONE` de `src/lib/time.ts` | Zona por taller en el motor | Otros países están fuera (FASE §2.3) | Se abre otro país |
| BG-D13 | `SITE` se borra; nace `PLATFORM` (Llave 15) y el perfil del taller. Las pruebas que leían `SITE` importan un accesorio `SITE` de `tests/helpers/shops.ts` con los valores de `8bca898` | Reutilizar `SITE` para Llave 15, o reescribir las expectativas de esas pruebas | Un solo nombre para dos cosas confunde; el accesorio deja intactas las colas de matcher | — |
| BG-D14 | El contenido de la portada de Vector Bikes vive desde BG-26 en `web/vector-bikes/src/content/site.ts`; la portada heredada del sistema lo importa hasta BG-DC1 (excepción de frontera) | Portada heredada con literales hasta el corte, o portada desde la base | Cumple "guardia vacía al cerrar la etapa 2" sin cortar `vectorbikes.cl` antes de la etapa 4; el contenido nace donde se va a quedar | — |
| BG-D15 | `AppLayout` sigue cargando `global.css`; las reglas propias de la portada se podan en BG-DC1 | Partir `global.css` en la etapa 2 | `global.css` es el diseño aprobado (regla 7); FASE §9 solo separa los tokens | — |
| BG-D16 | Todo correo (cliente y copias al taller) sale como `<Taller> · Llave 15 <dirección de EMAIL_FROM>`, `Reply-To` del taller, con la línea `Gestionado con Llave 15` | Remitente distinto para el personal | Decisiones 8 y 10; una sola regla | — |
| BG-D17 | La API recibe `taller` (cuerpo y consulta); sin él, un solo taller; desconocido → 404 `shop_not_found` | Rutas `/api/<slug>/…` | Mantiene las rutas y las respuestas congeladas | — |
| BG-D18 | Turnstile por taller = `cdata` igual al slug; límite por (sucursal, IP) | Una clave de Turnstile por taller | Sin cuentas de Cloudflare por taller | Un taller pide su propio widget |
| BG-D19 | Spec de navegador de `/<slug>/reservar` como excepción a "sin E2E fuera de `/taller`", sin enviar la reserva; `global-setup.ts` y `fixtures.ts` los editan BG-04 y BG-33 | Sin spec | El dueño aprobó la reserva dentro de Llave 15; la página es parte del sistema | — |
| BG-D20 | `APP_URL` opcional con respaldo en `PUBLIC_SITE_URL`; CSRF acepta ambos orígenes hasta BG-DC3 | Cambiar de dominio de una vez | Convivencia sin cortar la sesión del personal en `vectorbikes.cl` | — |
| BG-D21 | `TRACKING_TOKEN_SECRET` reemite el token heredado cuando la orden ya tiene fila; BG-DC2 lo retira | Reescribir los hash de las filas existentes | Reescribir rompería los enlaces enviados | — |
| BG-D22 | `web/vector-bikes/` no es paquete del workspace: resuelve desde `node_modules` de la raíz; su `package.json` repite los pins para el repo nuevo; la raíz lo excluye de `tsconfig` y lo chequea con `pnpm test:web` dentro del gate | Paquete del workspace | Sin cambiar el lockfile ni agregar dependencias; sale a otro repo (BG-DC4) | — |
| BG-D23 | Redirecciones con un endpoint comodín (`[...path].ts`): 301 en GET/HEAD, 308 en el resto, conservando ruta y consulta | `redirects` de Astro o del hosting | Control exacto de consulta y método, probado por función pura y por servidor | — |
| BG-D24 | Orden del corte: sitio nuevo en su Replit (C6) → `llave15.cl` en el Replit actual (C5 antes) → DNS de `vectorbikes.cl` (C7); `llave15.cl/` muestra la portada heredada hasta BG-DC1 | Portada por host en el sistema | Evita lógica por host para un período de días | — |
| BG-D25 | `is_platform_admin` es marca, no rol; `/plataforma` muestra solo metadatos y conteos; además es curador de la biblioteca | Quinto rol | Decisión 7 y 12 | — |
| BG-D26 | La plantilla de catálogo es el catálogo (servicios y precios) de un taller existente que elige el administrador de plataforma | Catálogo genérico escrito en el repo | No inventa contenido; el dueño ajusta precios en `/taller/catalogo` | El dueño quiere una plantilla neutra |
| BG-D27 | "Mi taller" con acción nueva `shop.manage` (solo `owner`); `slug` y `code_prefix` no editables | Reutilizar una acción existente | Ninguna existente es solo del dueño y de la configuración del taller; cambiar el slug rompe enlaces | — |
| BG-D28 | 49 pasos (16 + 16 + 5 + 7 + 5): los 45 originales, en el borde superior de FASE §10, más los cuatro de la identidad visual (BG-D40) | Pasos más grandes | Límite de 5 archivos, tres generaciones de contract, cuatro grupos de plantillas, y la identidad repartida en marca, tokens, componentes y layouts | — |
| BG-D29 | Checkpoints con rutas nombradas (`git add -u` + nuevos por nombre en las excepciones); nunca `git add -A` | `git add -A` | Repo en iCloud con copias `* 2.*` (F2-D26) | El repo sale de iCloud |
| BG-D30 | Lista de slugs reservados con una prueba que recorre las rutas de primer nivel | Lista fija sin prueba | Una ruta nueva sin reservar chocaría con un taller | — |
| BG-D31 | El producto se llama **Llave 15** (con espacio y mayúscula; `LLAVE 15` solo en el logo, según el manual de marca `docs/marca/`) y su dominio es `llave15.cl` (dueño, 18-11-2026, antes de BG-02); los identificadores internos (`BG-NN`, `bg-NN`, `bg:*`, `blueprints/bike-garage/`, `feat/bike-garage`) se conservan | Renombrar también los identificadores internos | El nombre aún no estaba en `src/`; cambiar los identificadores rompería el historial y las referencias sin cambio visible | — |
| BG-D32 | La identidad visual del manual de marca de Llave 15 (`docs/marca/`) aplica a todo lo que carga `AppLayout` (ingreso, `/taller`, `/admin`, `/plataforma` y las páginas del cliente en `PublicLayout`: reserva, seguimiento, informe, aprobación, cancelación) y al pie de los correos, con la clase `l15` en `<html>` como ámbito; en lo del cliente, el nombre o el logo del taller sigue siendo el identificador principal y Llave 15 firma `<Taller> · Gestionado con Llave 15`; la portada heredada (`Base.astro`) y `web/vector-bikes/` conservan su diseño, y BG-37 copia al sitio solo los archivos de Vector Bikes de `public/brand/` | Cambiar los valores de `:root` para todo el repo | La portada heredada sirve `vectorbikes.cl` hasta C7 y `site.css` (BG-37) copia `tokens.css`: un `:root` nuevo cambiaría el sitio de Vector Bikes; con el ámbito queda intacto y BG-DC1 lo retira | El dueño quiere otro diseño para el sitio de Vector Bikes (se hace en su repositorio) |
| BG-D33 | Paleta del manual como tokens en `:root.l15` de `src/styles/tokens.css`: los nombres existentes (`--ground`, `--surface`, `--ink`, `--ink-2`, `--steel`, `--rule`, `--field-border`, `--on-ink`, `--hatch`) con los valores de Llave 15 y los nuevos `--accent`, `--accent-hover`, `--brand-on-dark`, `--focus`, `--status-*` y `--radius-*`; solo claro (los bloques oscuros pasan a `:not(.l15)`); desde BG-47 reemplaza el "ningún color nuevo" de FASE §9 para las superficies de Llave 15, con hex solo en `tokens.css` (y en los SVG de la marca) | Mantener el monocromo, o una paleta clara y otra oscura | El dueño entregó el manual de marca con la paleta y los contrastes medidos (WCAG 2.2 AA); el manual no define modo oscuro y no se inventa | El taller piloto pide modo oscuro |
| BG-D34 | Interfaz en Inter 400/500/600/700 con `@fontsource-variable/inter` 5.3.0 (verificada en npm el 2026-11-18, última estable, publicada el 2026-07-19), respaldo Arial, sans-serif, cifras tabulares; `AppLayout` deja de cargar Michroma, Archivo y Plex, cuyos paquetes se quedan para la portada heredada; el logotipo va en trazos y DIN Condensed nunca se carga; `package.json` y el lockfile que cambia el comando `pnpm add` declarado no cuentan para el límite de 5 archivos | Inter desde Google Fonts, o la fuente del sistema | Fuente servida por la propia app, como las de hoy, sin un tercero en cada carga; un paquete y una familia | El dueño entrega otra tipografía de interfaz |
| BG-D35 | Forma de Llave 15 desde BG-48: espaciado en múltiplos de 4px, radio 8px en controles y 12px en tarjetas, reglas de 1px, sin sombras; botón primario `--accent` con hover `--accent-hover` en lugar del hover que invierte; una acción primaria por zona de trabajo y las demás neutras; foco 2px `--focus` separado 2px, blanco sobre grafito; objetivos ≥ 48px en `/taller` (más estricto que los 44 del manual) y ≥ 44px en lo demás | Los 44px del manual también en `/taller` | La tablet se usa con las manos sucias (FASE1); 48 cumple igual el manual | — |
| BG-D36 | Estados: cada uno conserva su forma propia y su texto y suma el color de uno de cinco grupos (neutro, en curso, espera, listo, bloqueo) con `--status-bg`/`--status-ink`; inventario, caja, biblioteca y plataforma usan los mismos grupos (`bajo`, `condicionado`, `desactualizado` y `needs_changes` en espera; `sin-stock`, `diferencia`, `rejected`, `incompatible` y `suspendido` en bloqueo; `anulada`, `draft`, `published` y `withdrawn` en neutro; `abierta`, `submitted`, `in_review` y `en_revision` en curso; `verificado`, `approved`, `alta` y `activo` en listo); los avisos `role="alert"`, incluido el de saldo pendiente para entregar, usan el grupo bloqueo | Solo color, o color en lugar de la forma | La regla del taller es nunca solo color (WCAG 1.4.1); el manual define los cinco grupos | El dueño reasigna una clase a otro grupo |
| BG-D37 | Logo provisional dibujado a mano en SVG desde las imágenes del manual (distintivo, firma principal, invertida y monocromática en BG-46; favicon simplificado de 16 px en BG-47), en `public/brand/llave15-*.svg`, con nombre accesible `Llave 15`, firma ≥ 132px, distintivo ≥ 24px y espacio libre ¼ del lado del distintivo; aprobado por el dueño hasta que lleguen los originales | Esperar los originales | La identidad no queda bloqueada; reemplazar un archivo no toca código | Llegan los originales: se reemplazan los cinco archivos en las mismas rutas, corren las pruebas de BG-46 y BG-47 y `pnpm gate` |
| BG-D38 | Menú del personal en grafito con la firma invertida (`alt="Llave 15"`) + `Taller`; ingreso con la firma principal y el descriptor `Software de gestión para talleres de bicicletas`; pie del cliente con el distintivo decorativo + `<Taller> · Gestionado con Llave 15`; pie de los correos con la misma línea, sin imágenes nuevas. La línea `Taller / Sucursal` de la muestra de orden no entra en BG-49 | Pasar el nombre del taller y de la sucursal a cada página del personal en BG-49 | El layout no lee la base y `SessionUser` está congelado (§5): exigiría tocar decenas de páginas, fuera del límite de 5 archivos | El dueño la pide: paso propio (§20.4) |
| BG-D39 | Voz: los textos visibles de hoy se conservan (las pruebas los afirman); cambian solo los de la firma (BG-49) y se agrega el descriptor del ingreso (BG-48); la tabla de microcopia y la guía de iconos del manual son para pantallas nuevas; los montos siguen con `formatClp` | Reescribir los textos con el manual | Paridad declarada por paso; reescribir cambiaría cientos de expectativas sin que el dueño lo pidiera | El dueño pide la reescritura |
| BG-D40 | La identidad visual entra en cuatro pasos nuevos, BG-46 … BG-49 (`E2-T13` … `E2-T16`, épica `02-identidad`), que se construyen después de BG-28 y antes de BG-29 (cada uno depende de BG-28 y del anterior; BG-29 depende además de BG-49), sin renumerar; `CLAUDE.md`, `AGENTS.md`, `ui-design.md` y `taller-ui.md` se actualizan en el bundle, en la raíz y en `workspace/`, con "hasta BG-46 / desde BG-47" (patrón BG-D2) | Renumerar BG-29 … BG-45, o un solo paso de identidad | BG-01 … BG-05 ya están construidos y los tags, los encargos y las decisiones citan los números; cuatro pasos respetan el límite de 5 archivos | — |
| BG-D41 | `readRange`/`readDay` sin sucursal la resuelven con una subconsulta (única sucursal del único taller) dentro de sus tres consultas; con dos talleres no ven filas (falla cerrada). `createBooking` sin alcance sí lanza `ShopScopeError` (BG-07, coordinadora, 18-11-2026) | `singleShopScope` en `readRange` (dos consultas más) | `admin-month.test.ts` afirma tres consultas fijas por mes (paridad); leer vacío nunca cruza talleres y las páginas pasan el alcance desde la etapa 1 | Una pantalla con dos talleres muestra un calendario vacío por no pasar el alcance |
| BG-D42 | La PK de `booking_days` cambia en dos generaciones: NOT NULL + `DROP TABLE "booking_days"`, y después `CREATE TABLE "booking_days"` con PK (`branch_id`, `service_date`) (BG-09, coordinadora, 18-11-2026) | Una generación (drizzle-kit 0.31 deja el `DROP CONSTRAINT` de la PK de columna comentado y la migración falla) o editar `drizzle/` a mano (prohibido) | Las filas de `booking_days` son solo anclas de bloqueo que `createBooking` recrea con `onConflictDoNothing`; se pierde nada; la ventana V-BG3 corre con el taller cerrado | drizzle-kit sabe nombrar la PK al cambiarla |
| BG-D43 | El RUT del cliente es único por sucursal (`uq_customers_rut` en (`branch_id`, `rut`)); cinco pruebas de `customers.test.ts` que afirmaban el RUT global de la fase 1 cambian su valor esperado en BG-10 (coordinadora, 18-11-2026; FASE §5 aprobada) | Conservar el RUT global | Un ciclista que va a dos talleres no podría registrarse en el segundo y el rechazo revelaría que existe en otro; con un taller = una sucursal, por sucursal equivale a por taller | Llega multi-sucursal (fase 4): el RUT pasa a ser por taller con `shop_id` en `customers` |
| BG-D44 | En BG-15, `prefillFromBooking` lee la reserva por taller (cualquier sucursal del taller del actor, `bookingInActorShop` en `booking-reception.ts`) y no por sucursal; las demás lecturas de reservas de la recepción filtran por sucursal (coordinadora, 19-11-2026) | Filtrar también por `actor.branchId` | `work-orders.test.ts` prueba 3 afirma que otra sucursal del mismo taller prellena la reserva sin ficha; la paridad prohíbe cambiar esa expectativa, y el aislamiento que exige la fase es entre talleres (un taller = una sucursal) | Llega multi-sucursal (fase 4): se decide si la recepción cruza sucursales del mismo taller |
| BG-D45 | Los avisos de reserva reciben db opcional al final; sin db usan la marca heredada de SITE y del entorno (solo pruebas que llaman a los avisos directamente), con db el perfil del taller; los llamadores de src/ (manual-booking, reschedule-booking, cancel-flow, api/reservas) pasan db como propagación mecánica (coordinadora, 19-11-2026) | getDb() como respaldo, o reescribir las pruebas que llaman sin base | getDb() rompe las pruebas sin DATABASE_URL; la paridad prohíbe cambiar sus llamadas | BG-27 borra SITE: db pasa a ser obligatorio y esas pruebas pasan la base |
| BG-D46 | En BG-23, /seguimiento/[token] usa AppLayout sin encabezado ni pie, con el nombre del taller en el texto y la línea Gestionado con Llave 15 al final del contenido; la dirección y el horario siguen apareciendo solo con la orden lista para retirar. Aprobación y cancelación usan PublicLayout (coordinadora, 19-11-2026) | PublicLayout también en el seguimiento | La página de seguimiento no tiene encabezado ni pie y muestra la dirección solo al estar lista (decisión A-01; tracking-page.test.ts:154 y :209); la paridad prohíbe cambiar esas expectativas | El dueño pide la misma cabecera en el seguimiento |
| BG-D47 | En BG-24, /informe/[token] usa AppLayout sin encabezado ni pie, con el logo del perfil antes del h1 y la línea Gestionado con Llave 15 al final del contenido; report-page-brand.test.ts e informe-mantencion-page.test.ts siembran el logo_key de Vector Bikes, como en producción tras bg:backfill (coordinadora, 19-11-2026) | PublicLayout también en el informe; seguir sirviendo /brand/vector-bikes-logo.png | El informe no tiene encabezado ni pie (report-page.test.ts:179); el logo del taller se sirve desde /<slug>/logo (BG-17) y la siembra de pruebas no tenía logo | El dueño pide la misma cabecera en el informe |

### 20.4 Qué construir después
Desde la cerca de FASE §2.3:
1. **Cobro, planes y facturación a talleres** — cuando haya un segundo taller interesado.
2. **Alta autoservicio** — después de varias altas manuales con `docs/nuevo-taller.md`.
3. **Dominio propio por taller** (`reservas.mitaller.cl`) — fase posterior.
4. **Multi-sucursal** — fase 4; `shops` 1—N `branches` ya es posible en el esquema.
5. **Mercado Pago integrado, asistente de WhatsApp, Strava** — fase 3.
6. **Portal de clientes con cuenta** — fuera por ahora.
7. **`Taller / Sucursal` en la barra del personal** (muestra de orden del manual de marca) — necesita el nombre del taller y de la sucursal en cada página del personal; un paso propio cuando el dueño lo pida (BG-D38).

---

*Fin del blueprint. El orden de construcción es §9. Detenerse cuando §20.1 esté en verde.*
