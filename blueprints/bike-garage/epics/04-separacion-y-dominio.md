# Epic 04: Separación y nuevo dominio

> Después de esta épica Bike Garage arma enlaces, cookie y defensa CSRF con `APP_URL` (aceptando, durante la convivencia, el origen heredado `PUBLIC_SITE_URL`); el seguimiento tiene su propio secreto sin romper los enlaces ya enviados; las tareas diarias recorren todos los talleres activos en una llamada; el sitio nuevo de Vector Bikes vive en `web/vector-bikes/` (portada, privacidad, botón "Reservar" a `https://bikegarage.cl/vector-bikes/reservar` y redirecciones permanentes de las rutas antiguas), con sus pruebas dentro de `pnpm gate`; existe `pnpm bg:check` y el plan de corte del dominio está escrito.

| | |
|---|---|
| **Epic id** | `04-separacion-y-dominio` |
| **Tasks** | `E4-T1` … `E4-T7` (pasos BG-34 … BG-40) |
| **Depends on** | `03-reservas-por-taller` |
| **Unlocks** | `05-administracion-plataforma` |
| **Parallel with** | ninguna |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Astro 7 SSR (sistema y sitio) · TypeScript 6 · Postgres 16 · Drizzle ORM 0.45 · zod 4 · Vitest + PGlite. `pnpm` 12.4.2; Node 24. Ninguna dependencia nueva: `web/vector-bikes/` resuelve los paquetes desde `node_modules` de la raíz.

| Task | Command |
|---|---|
| Formatear | `pnpm format` |
| Test (un archivo) | `pnpm test tests/integration/<archivo>.test.ts` |
| Sitio: chequeo, build, pruebas | `pnpm exec astro check --root web/vector-bikes` · `pnpm exec astro build --root web/vector-bikes` · `pnpm exec vitest run --config web/vector-bikes/vitest.config.ts` |
| Sitio completo (desde E4-T6) | `pnpm test:web` |
| Salud de la plataforma (desde E4-T6) | `pnpm bg:check` |
| Compuerta | `pnpm gate` |

**Gate:** `pnpm format && pnpm gate` (desde E4-T6 incluye `pnpm test:web`). **Reparto:** Codex implementa y corre solo `pnpm format && pnpm check && pnpm test && pnpm build` (y en E4-T4/T5 los comandos de chequeo, build y pruebas del sitio, que no usan red); la sesión coordinadora corre el resto del Verify, `test:web`, `bg:check` y `gate`, commitea y pone el tag. Reversión: `git reset --hard bg-<anterior>` (sin esquema).

**Reglas transversales de cada tarea:** pruebas primero; ≤ 5 archivos (E4-T1 es excepción declarada: una línea en trece llamadas); **ningún valor esperado de una prueba existente cambia** (sin `APP_URL` ni `TRACKING_TOKEN_SECRET` todo funciona como hoy); entorno solo por `src/lib/env.ts`; `.env.example` al día, ningún secreto commiteado; `web/vector-bikes/**` nunca importa `src/**` y `src/` nunca importa `web/**` (salvo la excepción de la portada heredada hacia `web/vector-bikes/src/content/site.ts`, BG-D14); ningún hex nuevo; `web/vector-bikes/{package.json,astro.config.mjs,tsconfig.json,vitest.config.ts}` los entrega el Bootstrap y **ninguna tarea los edita**. **Checkpoint:** `git add --` con las rutas del paso (en E4-T1, `git add -u -- src` + nuevos por nombre); nunca `git add -A`. **Verify en shell POSIX:** sin sustitución de procesos (`<(…)`); las comparaciones de conjuntos se hacen con `node -e`.

## Directory subtree

```
src/lib/env.ts · src/server/api/handlers.ts · .env.example     # edit (E4-T1: APP_URL; E4-T2: TRACKING_TOKEN_SECRET)
13 llamadas a getSiteEnv() en src/                              # edit (E4-T1, mecánico)
src/server/taller/tracking.ts                                   # edit (E4-T2)
src/server/api/task-handlers.ts · src/server/shops/scope.ts · src/server/whatsapp/cron.ts   # edit (E4-T3)
web/vector-bikes/                                               # configs del Bootstrap (§19.6)
  src/layouts/SiteLayout.astro · src/components/Home.astro · src/pages/index.astro · src/styles/site.css · tests/content.test.ts   # NEW (E4-T4)
  public/brand/* · public/favicon.svg                           # copias (E4-T4)
  src/pages/privacidad.astro · src/lib/redirects.ts · src/pages/[...path].ts · scripts/check-redirects.ts · tests/redirects.test.ts   # NEW (E4-T5)
  public/robots.txt                                             # copia (E4-T5)
  scripts/test-web.sh                                           # NEW (E4-T6)
package.json · src/server/shops/health.ts · scripts/bg-check.ts # edit/NEW (E4-T6)
docs/corte-bike-garage.md                                       # NEW (E4-T7)
```

## Data model touched here

Ninguna tabla cambia. `order_tracking_tokens.token_hash` se lee para reemitir el token heredado (E4-T2). `platformHealth` lee `shops`, `branches`, `bookings`, `booking_blocks` y `work_orders.booking_id` (E4-T6).

## Contracts

**Consumed:** `getSiteEnv`, `getCancelEnv`, `EnvError`, `scopeForBranch`, `sendReminders(db, now, deps?, scope?)`, `sendPendingReminders(…, scope?)`, `sendOverdueDigest`, `hashShareToken`, `VECTOR_BIKES_SITE`, `BOOKING_URL`.

**Produced:**

| Export | Signature |
|---|---|
| `env.ts` → `getAppEnv` | `getAppEnv(source?): { APP_URL: string }` (`APP_URL` opcional `z.url()`; sin ella, `PUBLIC_SITE_URL`) |
| `env.ts` → `getTrackingEnv` | `getTrackingEnv(source?): { TRACKING_TOKEN_SECRET: string }` (opcional, ≥ 32; sin ella, `CANCEL_TOKEN_SECRET`) |
| `handlers.ts` → `isAllowedOrigin` | `isAllowedOrigin(request, appUrl?, legacyUrl?)`: acepta los dos orígenes, con y sin `www.` |
| `scope.ts` → `activeShopScopes` | `activeShopScopes(db): Promise<BookingScope[]>` |
| `web/vector-bikes/src/lib/redirects.ts` → `legacyRedirect` | `legacyRedirect(url: URL): string \| null` |
| `web/vector-bikes/src/pages/[...path].ts` → `ALL`, `prerender = false` | 301 GET/HEAD, 308 el resto, 404 sin destino |
| `web/vector-bikes/scripts/check-redirects.ts` | `node web/vector-bikes/scripts/check-redirects.ts <url-base>`, sale 0/1/2 |
| `src/server/shops/health.ts` → `platformHealth` | `platformHealth(db): Promise<{ ok; shopsWithoutSingleBranch; blocksCrossBranch; ordersBookingCrossBranch }>` |
| scripts de `package.json` | `test:web` = `sh web/vector-bikes/scripts/test-web.sh`; `bg:check` = `node --env-file-if-exists=.env scripts/bg-check.ts`; `gate` = el de hoy + ` && pnpm test:web` |

## Conventions that bite in this area

- Durante la convivencia, el personal puede seguir en `vectorbikes.cl/taller`: la cookie es de host y CSRF acepta ambos orígenes hasta BG-DC3.
- Un enlace de seguimiento ya enviado nunca se rompe: si la orden ya tiene fila, se reemite el token cuyo hash coincide (secreto propio o heredado).
- El sitio construye en `web/vector-bikes/dist/`; `.gitignore` ya ignora `dist/`, `.astro/` y `*.log`.
- `check-redirects.ts` afirma `Location` exacto `https://bikegarage.cl` + ruta + consulta, sin importar la URL base que recorre.
- Las tareas omiten talleres `suspendido` y conservan la forma de sus respuestas.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/server-api.md`, `shops.md`, `ui-design.md`, `taller-domain.md`.

---

## Tasks

### `E4-T1` — BG-34 Use app URL for links, cookie and CSRF (excepción declarada)

**Depends on:** `E3-T5` · **Priority:** p0

1. `tests/integration/app-url.test.ts` primero (fuentes de entorno explícitas).
2. `env.ts`: `getAppEnv()`. `handlers.ts`: `isAllowedOrigin(request, appUrl?, legacyUrl?)` con los dos orígenes.
3. Llamadas mecánicas (una línea cada una, `getSiteEnv().PUBLIC_SITE_URL` → `getAppEnv().APP_URL`): `src/pages/admin/login.astro` (cookie y redirección), `src/server/email/notifications.ts`, `src/pages/taller/ordenes/[id]/etiqueta.ts`, `src/pages/taller/ordenes/[id]/adicional.astro`, `src/pages/taller/ordenes/[id]/index.astro`, `src/pages/taller/ordenes/[id]/informe.astro`, `src/server/taller/part-notice.ts`, `src/pages/taller/index.astro`, `src/server/taller/quotes.ts`, `src/server/taller/reception.ts`, `src/server/taller/qc.ts`, `src/server/taller/maintenance-plan.ts`, `src/server/taller/delivery-notice.ts`.
4. `.env.example`: `APP_URL=` con comentario (`# Origen de Bike Garage (https://bikegarage.cl); vacío = PUBLIC_SITE_URL.`).

**Files**
- `src/lib/env.ts` — edit
- `src/server/api/handlers.ts` — edit
- `.env.example` — edit
- `tests/integration/app-url.test.ts` — new
- Las trece llamadas del punto 3 — edit (mecánico)

Reglas: `server-api.md`. RC 11. No negociable 4.

**Acceptance**

1. **WHEN** `APP_URL` es `https://bikegarage.cl` y `PUBLIC_SITE_URL` es `https://vectorbikes.cl` **THE SYSTEM SHALL** aceptar un POST con `Origin` de cualquiera de los dos, con o sin `www.`, y rechazar con 403 uno de otro origen o `null`
2. **WHEN** `APP_URL` está definido **THE SYSTEM SHALL** armar con él los enlaces de seguimiento, informe, aprobación, cancelación y el QR de la etiqueta
3. **WHEN** `APP_URL` no está definido **THE SYSTEM SHALL** usar `PUBLIC_SITE_URL` como hoy
4. **WHEN** el ingreso responde con `APP_URL` en `https` **THE SYSTEM SHALL** emitir la cookie de sesión con `secure`
5. **WHEN** se busca `getSiteEnv(` en `src/` **THE SYSTEM SHALL** encontrarlo solo en `src/lib/env.ts` y `src/server/api/handlers.ts`
6. **WHEN** se lee `.env.example` **THE SYSTEM SHALL** contener una línea `APP_URL=` con su comentario

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

### `E4-T2` — BG-35 Add tracking token secret keeping sent links

**Depends on:** `E4-T1` · **Priority:** p0

1. `tests/integration/tracking-secret.test.ts` primero.
2. `env.ts`: `getTrackingEnv()`.
3. `tracking.ts`: `trackingTokenFor(orderId, secret = getTrackingEnv().TRACKING_TOKEN_SECRET)`; `ensureTrackingLink`: si la orden ya tiene fila, calcula los candidatos con el secreto propio y con `CANCEL_TOKEN_SECRET` y reemite el que coincide con el `token_hash`; si no tiene, emite con el secreto propio. `viewTrackingByToken` no cambia.
4. `.env.example`: `TRACKING_TOKEN_SECRET=` con comentario (`# Secreto de los enlaces de seguimiento (mínimo 32); vacío = CANCEL_TOKEN_SECRET.`).

**Files**
- `src/lib/env.ts` — edit
- `src/server/taller/tracking.ts` — edit
- `.env.example` — edit
- `tests/integration/tracking-secret.test.ts` — new

Reglas: `server-api.md`, `taller-domain.md`. No negociables 4, 11.

**Acceptance**

1. **WHEN** `TRACKING_TOKEN_SECRET` está definido y una orden no tiene fila de seguimiento **THE SYSTEM SHALL** emitir un token derivado de `TRACKING_TOKEN_SECRET`
2. **WHEN** una orden ya tiene fila con el hash de un token derivado de `CANCEL_TOKEN_SECRET` **THE SYSTEM SHALL** volver a emitir ese mismo token, y el enlace ya enviado SHALL seguir abriendo `/seguimiento/<token>`
3. **WHEN** `TRACKING_TOKEN_SECRET` no está definido **THE SYSTEM SHALL** usar `CANCEL_TOKEN_SECRET` como hoy
4. **WHEN** `TRACKING_TOKEN_SECRET` tiene menos de 32 caracteres **THE SYSTEM SHALL** lanzar `EnvError` que lo nombra
5. **WHEN** se lee `.env.example` **THE SYSTEM SHALL** contener una línea `TRACKING_TOKEN_SECRET=` con su comentario

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

### `E4-T3` — BG-36 Run daily tasks for every active shop

**Depends on:** `E4-T2` · **Priority:** p0

1. `tests/integration/tasks-isolation.test.ts` primero (con `seedTwoShops` y un taller suspendido).
2. `scope.ts`: `activeShopScopes(db)`.
3. `task-handlers.ts`: `handleRemindersTask` llama `sendReminders(db, now, deps, scope)` por taller activo y suma `sent`/`failed`; `handleAlertsTask` omite los suspendidos (el envío por taller es de E2-T5); `handleMaintenanceTask` y `handleRetentionTask` no cambian.
4. `whatsapp/cron.ts`: `handleWhatsAppCron` recorre `activeShopScopes`.

**Files**
- `src/server/api/task-handlers.ts` — edit
- `src/server/shops/scope.ts` — edit
- `src/server/whatsapp/cron.ts` — edit
- `tests/integration/tasks-isolation.test.ts` — new

Reglas: `server-api.md`, `shops.md`. No cambia: autorización de tareas, formas de respuesta.

**Acceptance**

1. **WHEN** `/api/tareas/recordatorios` corre con dos talleres activos y reservas de mañana en ambos **THE SYSTEM SHALL** enviar los recordatorios de los dos, cada uno con la marca de su taller, en una sola llamada, y responder `ok: true` con `sent` igual al total
2. **WHEN** un taller está `suspendido` **THE SYSTEM SHALL** omitir sus recordatorios, su resumen y sus avisos de WhatsApp
3. **WHEN** `/api/tareas/alertas` corre **THE SYSTEM SHALL** enviar a cada taller activo solo sus órdenes atrasadas y su stock bajo, a su correo de avisos
4. **WHEN** el cron de WhatsApp corre **THE SYSTEM SHALL** procesar las reservas de cada taller activo con su alcance
5. **WHEN** la base tiene un solo taller **THE SYSTEM SHALL** responder como hoy (`tasks.test.ts`, `tasks-maintenance.test.ts` y `tasks-maintenance-reminders.test.ts` sin cambios)

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

### `E4-T4` — BG-37 Add Vector Bikes site home

**Depends on:** `E4-T3` · **Priority:** p0

Precondición: `web/vector-bikes/{package.json,astro.config.mjs,tsconfig.json,vitest.config.ts}` existen desde el Bootstrap.

1. Copias (comandos, no se escriben a mano): `mkdir -p web/vector-bikes/public/brand && cp public/brand/* web/vector-bikes/public/brand/ && cp public/favicon.svg web/vector-bikes/public/`.
2. `web/vector-bikes/tests/content.test.ts` primero (datos de `VECTOR_BIKES_SITE`; `BOOKING_URL`).
3. `src/styles/site.css` = `src/styles/tokens.css` + `src/styles/global.css` concatenados tal cual (sin hex nuevos).
4. `SiteLayout.astro`: el `<head>` y el cromo de `src/layouts/Base.astro` (fuentes, JSON-LD, FAQ, Open Graph) con `VECTOR_BIKES_SITE`. `Home.astro`: el marcado de `Landing.astro` **sin la isla**; en su lugar, un enlace `.btn` con texto `Reservar` a `BOOKING_URL`. `pages/index.astro`: `prerender = true`. Nada de `web/` importa `src/`.

**Files**
- `web/vector-bikes/src/layouts/SiteLayout.astro` — new
- `web/vector-bikes/src/components/Home.astro` — new
- `web/vector-bikes/src/pages/index.astro` — new
- `web/vector-bikes/src/styles/site.css` — new (copia)
- `web/vector-bikes/tests/content.test.ts` — new

Reglas: `ui-design.md`, `shops.md` (sitio). No cambia: textos, estructura y datos estructurados de la portada de hoy.

**Acceptance**

1. **WHEN** corre `pnpm exec astro build --root web/vector-bikes` **THE SYSTEM SHALL** salir 0 y generar `web/vector-bikes/dist/client/index.html`
2. **WHEN** se lee ese HTML **THE SYSTEM SHALL** contener el título y la descripción de la portada de hoy, el JSON-LD con los datos de Vector Bikes y un enlace `Reservar` a `https://bikegarage.cl/vector-bikes/reservar`
3. **WHEN** se busca en ese HTML **THE SYSTEM SHALL** no encontrar el script de Turnstile ni la isla de reserva
4. **WHEN** se comparan los hex de `web/vector-bikes/src/styles/site.css` con los de `src/styles/global.css` y `src/styles/tokens.css` **THE SYSTEM SHALL** no encontrar ninguno nuevo
5. **WHEN** corren `pnpm exec astro check --root web/vector-bikes` y `pnpm exec vitest run --config web/vector-bikes/vitest.config.ts` **THE SYSTEM SHALL** salir 0

**Verify**

```bash
pnpm exec astro check --root web/vector-bikes   # expect: exit 0
pnpm exec astro build --root web/vector-bikes && test -f web/vector-bikes/dist/client/index.html   # expect: exit 0
grep -qF 'href="https://bikegarage.cl/vector-bikes/reservar"' web/vector-bikes/dist/client/index.html   # expect: exit 0
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

### `E4-T5` — BG-38 Add Vector Bikes privacy page and permanent redirects

**Depends on:** `E4-T4` · **Priority:** p0

1. Copia (comando): `cp public/robots.txt web/vector-bikes/public/robots.txt`.
2. `web/vector-bikes/tests/redirects.test.ts` primero (`legacyRedirect` y el handler `ALL` con `Request` construidos en la prueba).
3. `src/lib/redirects.ts`: `legacyRedirect(url)` — si `pathname` es `/taller`, `/admin`, `/seguimiento`, `/informe` o `/aprobacion`, o empieza con alguno seguido de `/`, o es `/reservas/cancelar`, devuelve `https://bikegarage.cl` + `pathname` + `search`; si no, `null`.
4. `src/pages/[...path].ts`: `prerender = false`; `ALL`: con destino, 301 en `GET`/`HEAD` y 308 en los demás; sin destino, 404.
5. `src/pages/privacidad.astro`: prerenderizada con el texto de hoy (`VECTOR_BIKES_SITE`).
6. `scripts/check-redirects.ts <url-base>`: con `redirect: "manual"` pide `/taller`, `/taller/ordenes/abc?x=1`, `/admin/login?next=%2Ftaller`, `/seguimiento/TOKEN`, `/informe/TOKEN`, `/aprobacion/TOKEN`, `/reservas/cancelar?token=abc` (301 y `Location` exacto) y `/`, `/privacidad` (200), `/no-existe` (404); sale 0, 1 o 2 (uso o sin conexión). Importa `../src/lib/redirects.ts`.

**Files**
- `web/vector-bikes/src/pages/privacidad.astro` — new
- `web/vector-bikes/src/lib/redirects.ts` — new
- `web/vector-bikes/src/pages/[...path].ts` — new
- `web/vector-bikes/scripts/check-redirects.ts` — new
- `web/vector-bikes/tests/redirects.test.ts` — new

Reglas: `ui-design.md`, `shops.md` (sitio). No cambia: URLs y SEO de la portada.

**Acceptance**

1. **WHEN** `legacyRedirect` recibe `/seguimiento/abc?utm=x` **THE SYSTEM SHALL** devolver `https://bikegarage.cl/seguimiento/abc?utm=x`, y lo mismo para rutas bajo `/taller`, `/admin`, `/informe` y `/aprobacion` y para `/reservas/cancelar?token=t`
2. **WHEN** recibe `/`, `/privacidad`, `/talleres` o `/reservas` **THE SYSTEM SHALL** devolver `null`
3. **WHEN** el endpoint recibe `GET /taller/ordenes/1?a=b` **THE SYSTEM SHALL** responder 301 con `Location` igual a `https://bikegarage.cl/taller/ordenes/1?a=b`, y un `POST /reservas/cancelar?token=t` SHALL responder 308 al mismo destino
4. **WHEN** `node web/vector-bikes/scripts/check-redirects.ts` corre sin argumentos **THE SYSTEM SHALL** salir 2 con un mensaje de uso
5. **WHEN** se construye el sitio **THE SYSTEM SHALL** generar `/privacidad` con el texto de privacidad de hoy de Vector Bikes

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

### `E4-T6` — BG-39 Gate the Vector Bikes site and add platform health check

**Depends on:** `E4-T5` · **Priority:** p0

1. `tests/integration/bg-health.test.ts` primero.
2. `web/vector-bikes/scripts/test-web.sh` (`set -eu`, patrón de `scripts/smoke.sh`): `pnpm exec astro check --root web/vector-bikes`; `pnpm exec astro build --root web/vector-bikes`; `pnpm exec vitest run --config web/vector-bikes/vitest.config.ts`; `PORT="${WEB_PORT:-4398}"`; `HOST=127.0.0.1 PORT="$PORT" node web/vector-bikes/dist/server/entry.mjs >.web.log 2>&1 &`; `trap` que lo detiene; espera `/` hasta 30 s (si no, muestra `.web.log` y sale 1); `node web/vector-bikes/scripts/check-redirects.ts "http://127.0.0.1:$PORT"`.
3. `src/server/shops/health.ts`: `platformHealth(db)`; `scripts/bg-check.ts`: imprime el JSON, sale 0 sano, 1 algún conteo > 0, 2 sin conexión (`No se pudo conectar`); `main` con la guarda de `import.meta.url`.
4. `package.json`: `test:web`, `bg:check` y `gate` (el de hoy + ` && pnpm test:web`).

**Files**
- `package.json` — edit (solo scripts)
- `web/vector-bikes/scripts/test-web.sh` — new
- `src/server/shops/health.ts` — new
- `scripts/bg-check.ts` — new
- `tests/integration/bg-health.test.ts` — new

Reglas: `shops.md`. No negociable 4 (solo conteos en la salida).

**Acceptance**

1. **WHEN** `platformHealth` corre sobre una base sana con dos talleres **THE SYSTEM SHALL** devolver `ok: true` con `shopsWithoutSingleBranch`, `blocksCrossBranch` y `ordersBookingCrossBranch` en 0
2. **WHEN** una orden apunta a una reserva de otra sucursal, o un bloque a una reserva de otra sucursal **THE SYSTEM SHALL** contarlo y devolver `ok: false`
3. **WHEN** `node scripts/bg-check.ts` corre con un `DATABASE_URL` inalcanzable **THE SYSTEM SHALL** salir 2 con `No se pudo conectar`
4. **WHEN** se lee `package.json` **THE SYSTEM SHALL** tener `test:web` igual a `sh web/vector-bikes/scripts/test-web.sh`, `bg:check` igual a `node --env-file-if-exists=.env scripts/bg-check.ts` y `gate` terminado en `&& pnpm test:web`
5. **WHEN** corre `pnpm test:web` **THE SYSTEM SHALL** salir 0
6. **WHEN** corre `pnpm bg:check` contra la base dev **THE SYSTEM SHALL** salir 0

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

### `E4-T7` — BG-40 Write the domain cutover plan

**Depends on:** `E4-T6` · **Priority:** p1

1. `docs/corte-bike-garage.md`: `## Precondiciones` (clave de la base rotada, `send.bikegarage.cl` verificado en Resend con SPF/DKIM/DMARC, widget de Turnstile para `bikegarage.cl` y `vectorbikes.cl`, Replit nuevo creado); `## Secuencia de corte` (C5: agregar `bikegarage.cl` al Replit actual, Secrets `APP_URL`, `TRACKING_TOKEN_SECRET`, `EMAIL_FROM`, `PUBLIC_TURNSTILE_SITE_KEY`, publicar `bg-40`, Make.com a `https://bikegarage.cl/api/tareas/*`; C6: publicar el sitio en el Replit nuevo y `node web/vector-bikes/scripts/check-redirects.ts <url replit.app>`; C7: DNS de `vectorbikes.cl` y `node web/vector-bikes/scripts/check-redirects.ts https://vectorbikes.cl`; `pnpm bg:check` después de cada publicación); `## Criterios de aborto` (los de `blueprint.md` §9.1, con umbrales y Andrés de guardia); `## Reversión` (por fase); `## Decomisión` (`BG-DC1` … `BG-DC4`).

**Files**
- `docs/corte-bike-garage.md` — new

Reglas: No negociables 2, 4.

**Acceptance**

1. **WHEN** se lee `docs/corte-bike-garage.md` **THE SYSTEM SHALL** contener `## Precondiciones`, `## Secuencia de corte`, `## Criterios de aborto`, `## Reversión` y `## Decomisión`
2. **WHEN** se busca en ese documento **THE SYSTEM SHALL** encontrar los comandos `node web/vector-bikes/scripts/check-redirects.ts https://vectorbikes.cl` y `pnpm bg:check`
3. **WHEN** se busca en ese documento **THE SYSTEM SHALL** encontrar las variables `APP_URL`, `TRACKING_TOKEN_SECRET`, `EMAIL_FROM` y `PUBLIC_TURNSTILE_SITE_KEY`

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
