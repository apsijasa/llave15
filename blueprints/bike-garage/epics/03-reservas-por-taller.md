# Epic 03: Reservas en línea por taller

> Después de esta épica cada taller tiene su página pública `/<slug>/reservar` (y `/<slug>/privacidad`) con la isla de reserva de siempre, su marca y su configuración; `api/reservas` y `api/disponibilidad` reciben el taller (`taller`), con Turnstile atado al taller (`cdata`) y límite de solicitudes por (taller, IP); los slugs reservados se validan; el recordatorio de mantención y el tablero enlazan a la página del taller; un spec de navegador recorre las páginas de Vector Bikes y del Taller Demo E2E.

| | |
|---|---|
| **Epic id** | `03-reservas-por-taller` |
| **Tasks** | `E3-T1` … `E3-T5` (pasos BG-29 … BG-33) |
| **Depends on** | `02-identidad` |
| **Unlocks** | `04-separacion-y-dominio` |
| **Parallel with** | ninguna |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Astro 7 SSR · TypeScript 6 · Postgres 16 · Drizzle ORM 0.45 · zod 4 · Preact (isla de reserva) · Vitest + PGlite · Playwright. `pnpm` 12.4.2; Node 24. Ninguna dependencia nueva.

| Task | Command |
|---|---|
| Formatear | `pnpm format` |
| Test (un archivo) | `pnpm test tests/<carpeta>/<archivo>.test.ts` |
| Build + pruebas del build | `pnpm build && pnpm test:build` |
| Navegador | `pnpm build && pnpm test:tablet e2e/reservar-taller.spec.ts` |
| Compuerta | `pnpm gate` |

**Gate:** `pnpm format && pnpm gate`. **Reparto:** Codex implementa y corre solo `pnpm format && pnpm check && pnpm test && pnpm build`; la sesión coordinadora escribe el encargo, corre el resto del Verify y `gate`, commitea y pone el tag. Reversión: `git reset --hard bg-<anterior>` (sin esquema).

**Reglas transversales de cada tarea:** pruebas primero; ≤ 5 archivos; **ningún valor esperado cambia salvo el declarado en E3-T4** (`/vector-bikes/reservar`); las respuestas de `/api/reservas` (201 `{ code, service_date, start, end, mode, fee }`) y `/api/disponibilidad` (`{ timezone, modo, capacity, days }`) conservan su forma; ningún dato de un taller en `src/`; ninguna isla nueva (la de reserva es la misma); páginas públicas con `no-store`. **Checkpoint:** `git add --` con las rutas del paso; nunca `git add -A`.

## Directory subtree

```
src/server/shops/slugs.ts                          # NEW (E3-T1): RESERVED_SLUGS, slugSchema
src/server/shops/scope.ts                          # edit (E3-T1): scopeBySlug
src/server/api/handlers.ts · src/server/api/turnstile.ts   # edit (E3-T2)
src/components/islands/BookingIsland.tsx · turnstile.ts    # edit (E3-T2): envía taller y cdata
src/pages/[slug]/reservar.astro · [slug]/privacidad.astro  # NEW (E3-T3)
src/server/taller/maintenance-plan.ts · src/pages/taller/index.astro   # edit (E3-T4)
e2e/reservar-taller.spec.ts · e2e/global-setup.ts · e2e/fixtures.ts   # NEW/edit (E3-T5)
```

## Data model touched here

Ninguna tabla cambia. `booking_requests.branch_id` (épica 01) se usa para el límite por taller. `shops.status` decide si la página y la API responden.

## Contracts

**Consumed:** `scopeForBranch`, `singleShopScope`, `ShopScopeError`, `BookingScope`, `profileBySlug`, `PublicLayout`, `IslandShop`, `PLATFORM`.

**Produced:**

| Export | Signature |
|---|---|
| `slugs.ts` → `RESERVED_SLUGS`, `slugSchema` | `slugSchema: z.ZodString` (formato `^[a-z0-9]+(-[a-z0-9]+)*$`, 3 a 40, no reservado, mensaje `Ese nombre está reservado.`) |
| `scope.ts` → `scopeBySlug` | `scopeBySlug(db, slug): Promise<BookingScope \| null>` (solo talleres `activo`) |
| `turnstile.ts` (servidor) → `verifyTurnstile` | devuelve también `cdata` del siteverify |
| `/api/disponibilidad?…&taller=<slug>`, cuerpo de `POST /api/reservas` con `taller` | 404 `{ error: "No encontramos ese taller.", code: "shop_not_found" }`; sin `taller` y sin un solo taller: 422 `validation_error` con `{ taller: "Falta el taller." }` |

`RESERVED_SLUGS`: `taller`, `admin`, `api`, `seguimiento`, `informe`, `aprobacion`, `reservas`, `privacidad`, `plataforma`, `brand`, `_astro`, `_image`, `_server-islands`, `favicon`, `robots`, `sitemap-index`, `sitemap-0`, `404`, `500`, `index`, `www`, `app`, `send`, `mail`, `logo`, `ingresar`.

## Conventions that bite in this area

- Orden en `POST /api/reservas`: resolución del taller → rate limit por (sucursal, IP) → zod con la configuración → Turnstile (`cdata` = slug) → transacción → correos post-commit. Un taller desconocido no registra intento.
- Las rutas estáticas de Astro ganan a `[slug]`; aun así, todo slug de primer nivel está en `RESERVED_SLUGS` y una prueba lo comprueba.
- El spec de navegador es una excepción declarada a "sin E2E fuera de `/taller`" (BG-D19) y **no envía** la reserva (Turnstile necesita red).
- La isla siempre envía `taller`; sin él, la API usa el único taller (bundles viejos en caché).
- `#reserva` (el ancla rota) es prefijo de `#reservar` (el ancla correcta): toda búsqueda del ancla rota exige que después no venga una `r`.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/server-api.md`, `shops.md`, `ui-design.md`, `booking-engine.md`, `e2e.md`.

---

## Tasks

### `E3-T1` — BG-29 Add reserved slugs and scope by slug

**Depends on:** `E2-T12`, `E2-T16` (la identidad visual BG-46 … BG-49 se construye antes) · **Priority:** p0

1. `tests/unit/reserved-slugs.test.ts` (incluye el recorrido de `src/pages/` y `public/` con `readdirSync`) y `tests/integration/scope-by-slug.test.ts` primero.
2. `slugs.ts`: `RESERVED_SLUGS` y `slugSchema` ("Contracts").
3. `scope.ts`: `scopeBySlug(db, slug)` → alcance de un taller `activo` o `null`.

**Files**
- `src/server/shops/slugs.ts` — new
- `src/server/shops/scope.ts` — edit
- `tests/unit/reserved-slugs.test.ts` — new
- `tests/integration/scope-by-slug.test.ts` — new

Reglas: `shops.md`.

**Acceptance**

1. **WHEN** `slugSchema` recibe `taller`, `api`, `admin`, `seguimiento`, `informe`, `aprobacion`, `reservas`, `brand`, `_astro` o `favicon` **THE SYSTEM SHALL** rechazarlo con el mensaje `Ese nombre está reservado.`
2. **WHEN** `slugSchema` recibe `Taller Demo`, `ab` o `-demo` **THE SYSTEM SHALL** rechazarlo, y `taller-demo` SHALL aceptarlo
3. **WHEN** la prueba lista las entradas de primer nivel de `src/pages/` (salvo las que empiezan con `[`) y de `public/` **THE SYSTEM SHALL** encontrar cada una, sin extensión, en `RESERVED_SLUGS`
4. **WHEN** `scopeBySlug` recibe `taller-demo` **THE SYSTEM SHALL** devolver el alcance del Taller Demo, y con un slug desconocido, reservado o de un taller `suspendido` SHALL devolver `null`

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

### `E3-T2` — BG-30 Route public booking API by shop slug

**Depends on:** `E3-T1` · **Priority:** p0

1. `tests/integration/api-by-shop.test.ts` primero (`fetchFn` simulado para Turnstile con `cdata`).
2. `handlers.ts`: `taller` opcional en la consulta de disponibilidad y en el cuerpo estricto; con `taller`, `scopeBySlug` (`null` → 404 `shop_not_found` antes del rate limit); sin `taller`, `singleShopScope` (si lanza, 422 `validation_error` con `{ taller: "Falta el taller." }`). Rate limit por (`branch_id`, `ip_hash`); intento con `branch_id`.
3. `src/server/api/turnstile.ts`: `verifyTurnstile` devuelve también `cdata`; si viene y no es el slug, 403 `turnstile_failed`.
4. `BookingIsland.tsx`: envía `taller: shop.slug` en el cuerpo y en `/api/disponibilidad`; `src/components/islands/turnstile.ts`: `useTurnstile` pasa `cdata: shop.slug` al widget.

**Files**
- `src/server/api/handlers.ts` — edit
- `src/server/api/turnstile.ts` — edit
- `src/components/islands/BookingIsland.tsx` — edit
- `src/components/islands/turnstile.ts` — edit
- `tests/integration/api-by-shop.test.ts` — new

Reglas: `server-api.md`, `booking-engine.md`. RC 5.

**Acceptance**

1. **WHEN** `GET /api/disponibilidad` llega con `taller=taller-demo` **THE SYSTEM SHALL** responder 200 con la capacidad y los bloques del Taller Demo y la misma forma de respuesta
2. **WHEN** `POST /api/reservas` llega con `taller` igual a `taller-demo` y datos válidos **THE SYSTEM SHALL** responder 201 con `{ code, service_date, start, end, mode, fee }` y la reserva en la sucursal del Taller Demo
3. **WHEN** `taller` es desconocido, reservado o de un taller `suspendido` **THE SYSTEM SHALL** responder 404 con código `shop_not_found` sin registrar el intento
4. **WHEN** una IP hizo 5 intentos en el Taller Demo en 10 minutos **THE SYSTEM SHALL** responder 429 en el Taller Demo y seguir aceptando esa IP en Vector Bikes
5. **WHEN** Turnstile devuelve un `cdata` distinto del `slug` del taller pedido **THE SYSTEM SHALL** responder 403 `turnstile_failed`
6. **WHEN** la petición no trae `taller` y la base tiene un solo taller **THE SYSTEM SHALL** usar ese taller (`api.test.ts` sin cambios)

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

### `E3-T3` — BG-31 Add per shop booking and privacy pages

**Depends on:** `E3-T2` · **Priority:** p0

1. `tests/integration/booking-page.test.ts` primero (Container API + `vi.mock` de `getDb`).
2. `src/pages/[slug]/reservar.astro`: `prerender = false`; `scopeBySlug` + `profileBySlug` (404 si `null`); `PublicLayout`; `h1` con el nombre; `BookingIsland client:visible` con las props del taller (`privacyHref` = `/<slug>/privacidad`) y `PUBLIC_TURNSTILE_SITE_KEY`; `cache-control: no-store`; sin `noindex`.
3. `src/pages/[slug]/privacidad.astro`: el texto del aviso de `8bca898:src/pages/privacidad.astro` con los datos del perfil en vez de los literales; `noindex`.

**Files**
- `src/pages/[slug]/reservar.astro` — new
- `src/pages/[slug]/privacidad.astro` — new
- `tests/integration/booking-page.test.ts` — new

Reglas: `ui-design.md`, `server-api.md`. RC 14.

**Acceptance**

1. **WHEN** se pide `/taller-demo/reservar` **THE SYSTEM SHALL** responder 200 con `PublicLayout`, `Taller Demo` en el `h1`, la isla con las props del Taller Demo y la línea `Gestionado con Llave 15`
2. **WHEN** se pide `/no-existe/reservar` o la página de un taller `suspendido` **THE SYSTEM SHALL** responder 404
3. **WHEN** se pide `/vector-bikes/reservar` **THE SYSTEM SHALL** mostrar la isla con los valores de Vector Bikes
4. **WHEN** se pide `/taller-demo/privacidad` **THE SYSTEM SHALL** mostrar el aviso de privacidad con el nombre, la dirección y el correo del Taller Demo, sin datos de Vector Bikes
5. **WHEN** se pide `/taller-demo/reservar` **THE SYSTEM SHALL** responder con `cache-control: no-store` y sin `noindex`

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

### `E3-T4` — BG-32 Link maintenance and dashboard to the shop booking page

**Depends on:** `E3-T3` · **Priority:** p1

1. `tests/integration/booking-links.test.ts` primero.
2. `maintenance-plan.ts:217`: el enlace pasa de `/#reserva` (ancla rota hoy) a `<sitio>/<slug>/reservar` con el `slug` del perfil de la orden.
3. `taller/index.astro`: el enlace que hoy va a `/#reservar` apunta a `/<slug del taller del usuario>/reservar`.
4. **Valor declarado:** el enlace del recordatorio de mantención pasa a `/vector-bikes/reservar`.

**Files**
- `src/server/taller/maintenance-plan.ts` — edit
- `src/pages/taller/index.astro` — edit
- `tests/integration/booking-links.test.ts` — new

Reglas: `taller-domain.md`, `taller-ui.md`.

**Acceptance**

1. **WHEN** se envía el recordatorio de mantención de una orden del Taller Demo **THE SYSTEM SHALL** enlazar a `/taller-demo/reservar` del sitio
2. **WHEN** se envía el de una orden de Vector Bikes **THE SYSTEM SHALL** enlazar a `/vector-bikes/reservar` en lugar de `/#reserva`
3. **WHEN** el personal abre `/taller` **THE SYSTEM SHALL** apuntar el enlace que hoy va a `/#reservar` a `/<slug de su taller>/reservar`
4. **WHEN** corre `node scripts/bg-expect-parity.ts --allow '/vector-bikes/reservar' --allow '/#reserva'` **THE SYSTEM SHALL** salir 0

**Verify**

```bash
pnpm test tests/integration/booking-links.test.ts tests/integration/maintenance-plan.test.ts tests/integration/tasks-maintenance-reminders.test.ts tests/integration/dashboard.test.ts   # expect: exit 0, 0 failed
grep -Eq '#reserva([^r]|$)' src/server/taller/maintenance-plan.ts; test $? -eq 1   # expect: 1 = sin el ancla rota (#reservar no cuenta) → la línea sale 0
node scripts/bg-expect-parity.ts --allow '/vector-bikes/reservar' --allow '/#reserva'   # expect: exit 0 — solo cambian expectativas declaradas
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/server/taller/maintenance-plan.ts src/pages/taller/index.astro tests/integration/booking-links.test.ts
git commit -m "fix: bg-32 link maintenance and dashboard to the shop booking page" && git tag bg-32
git tag -l bg-32 | grep -qx bg-32   # expect: exit 0
```

### `E3-T5` — BG-33 Add browser spec for the per shop booking page (excepción BG-D19)

**Depends on:** `E3-T4` · **Priority:** p1

1. `e2e/fixtures.ts`: `SEED.demoShopId`, `SEED.demoBranchId` (uuid fijos).
2. `e2e/global-setup.ts` (con `hasTable`): el Taller Demo E2E (`slug` `taller-demo`, `name` `Taller Demo E2E`, los valores de `DEMO_SHOP_PROFILE` escritos en el archivo, prefijo `TD`) y su sucursal, después del taller Vector Bikes.
3. `e2e/reservar-taller.spec.ts`: proyecto `tablet`; **no envía** la reserva; comprueba marca, comunas al elegir retiro, línea `Gestionado con Llave 15` y que los bloques mostrados vengan de `/api/disponibilidad` con el `taller` de la página (`page.waitForResponse`); controles por rol y nombre accesible.

**Files**
- `e2e/reservar-taller.spec.ts` — new
- `e2e/global-setup.ts` — edit
- `e2e/fixtures.ts` — edit

Reglas: `e2e.md` (excepción BG-D19). No cambia: specs existentes, `playwright.config.ts`.

**Acceptance**

1. **WHEN** el spec abre `/vector-bikes/reservar` en el viewport de tablet **THE SYSTEM SHALL** mostrar `Vector Bikes`, las comunas `Vitacura` y `Las Condes` al elegir retiro y la línea `Gestionado con Llave 15`
2. **WHEN** abre `/taller-demo/reservar` **THE SYSTEM SHALL** mostrar `Taller Demo E2E`, las comunas del Taller Demo y ningún texto `Vitacura`
3. **WHEN** el spec elige un día en cada página **THE SYSTEM SHALL** mostrar los bloques que devuelve `/api/disponibilidad` con el `taller` de esa página, de 60 minutos en el Taller Demo
4. **WHEN** corre `pnpm test:tablet` completo **THE SYSTEM SHALL** pasar con los specs existentes sin cambios

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
