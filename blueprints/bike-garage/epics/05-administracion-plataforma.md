# Epic 05: Administración de la plataforma

> Después de esta épica existe la marca `users.is_platform_admin` con su pantalla `/plataforma` (lista de talleres con conteos de uso, sin datos de clientes); el administrador de plataforma crea un taller con su primer dueño y una plantilla de catálogo, lo suspende y lo reactiva; el dueño de cada taller edita "Mi taller" (perfil, horarios, capacidad, retiro, comunas, tarifa, correo de avisos y logo); `pnpm platform:admin` pone o quita la marca; `docs/nuevo-taller.md` y la sección `## Operación de Bike Garage` del `README.md` cierran la fase.

| | |
|---|---|
| **Epic id** | `05-administracion-plataforma` |
| **Tasks** | `E5-T1` … `E5-T5` (pasos BG-41 … BG-45) |
| **Depends on** | `04-separacion-y-dominio` |
| **Unlocks** | nada — es la última |
| **Parallel with** | ninguna |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Astro 7 SSR · TypeScript 6 · Postgres 16 · Drizzle ORM 0.45 · zod 4 · sharp (logo) · Vitest + PGlite. `pnpm` 12.4.2; Node 24. Ninguna dependencia nueva.

| Task | Command |
|---|---|
| Formatear | `pnpm format` |
| Test (un archivo) | `pnpm test tests/<carpeta>/<archivo>.test.ts` |
| Prueba de dos talleres | `pnpm test isolation` |
| Marca de plataforma (desde E5-T5) | `pnpm platform:admin <correo> [--off]` |
| Compuerta | `pnpm gate` (incluye `pnpm test:web`) |

**Gate:** `pnpm format && pnpm gate`. **Reparto:** Codex implementa y corre solo `pnpm format && pnpm check && pnpm test && pnpm build`; la sesión coordinadora corre el resto del Verify y `gate`, commitea y pone el tag. Reversión: `git reset --hard bg-<anterior>` (sin esquema: la marca existe desde E1-T3).

**Reglas transversales de cada tarea:** pruebas primero; ≤ 5 archivos; **ningún valor esperado cambia salvo `tests/unit/permissions.test.ts` en E5-T4** (acción `shop.manage`); páginas `/plataforma/**`: sesión → marca (`isPlatformAdmin`, 403 sin ella) → `isAllowedOrigin` en los POST → zod → `src/server/shops/**`; `/taller/mi-taller`: sesión → `can(role, "shop.manage")` → zod; **la marca nunca abre datos de otro taller** (todo `/taller` y `/admin` sigue filtrando por `user.branchId`); `/plataforma` muestra solo metadatos y conteos; primero el objeto al almacenamiento y después la fila; claves con `hashPassword` (scrypt), mínimo 12 caracteres; ninguna isla nueva; objetivos ≥ 48px. **Checkpoint:** `git add --` con las rutas del paso; nunca `git add -A`.

## Directory subtree

```
src/server/auth/admin-auth.ts                 # edit (E5-T1: marca en SessionUser; E5-T3: taller suspendido)
src/server/shops/platform-shops.ts            # NEW (E5-T1), edit (E5-T3)
src/pages/plataforma/index.astro              # NEW (E5-T1)
src/layouts/TallerLayout.astro                # edit (E5-T1 enlace Plataforma; E5-T4 enlace Mi taller)
src/server/shops/create-shop.ts · catalog-copy.ts · src/pages/plataforma/talleres/nuevo.astro   # NEW (E5-T2)
src/pages/plataforma/talleres/[id].astro      # NEW (E5-T3)
src/server/shops/my-shop.ts · src/pages/taller/mi-taller.astro   # NEW (E5-T4)
src/server/auth/permissions.ts                # edit (E5-T4: shop.manage)
scripts/platform-admin.ts · docs/nuevo-taller.md · README.md · package.json   # NEW/edit (E5-T5)
```

## Data model touched here

Ninguna tabla cambia. Se escriben `shops` (alta, estado, "Mi taller"), `branches` (alta), `users` (dueño; `is_platform_admin`), `admin_sessions` (revocación), `services` y `service_prices` (copia de catálogo con el `branch_id` nuevo). Se cuentan, sin leer datos personales: usuarios activos, órdenes abiertas, reservas y ventas de los últimos 30 días.

## Contracts

**Consumed:** `requireAdmin`, `loginAdmin`, `hashPassword`, `revokeUserSessions`, `can`, `isAllowedOrigin`, `slugSchema`, `weekHoursSchema`, `scopeBySlug`, `getStorage`, `sharp`, `shops`, `branches`, `users`, `services`, `servicePrices`.

**Produced:**

| Export | Signature |
|---|---|
| `SessionUser` | + `isPlatformAdmin?: true` (presente solo si la marca es verdadera); `libraryCurator` = `library_curator or is_platform_admin` |
| `platform-shops.ts` → `listShopsWithUsage`, `setShopStatus`, `shopUsage` | `(db, actor, now)` → filas o `null` sin la marca; `setShopStatus(db, actor, shopId, "activo" \| "suspendido", now)` → `{ ok: true } \| { ok: false, code: "forbidden" \| "not_found" }` |
| `create-shop.ts` → `createShopSchema`, `createShop` | `createShop(db, actor, input, now)` → `{ ok: true, shopId } \| { ok: false, code: "forbidden" \| "validation_error", fields? }` |
| `catalog-copy.ts` → `copyCatalog` | `copyCatalog(tx, fromBranchId, toBranchId, now)` |
| `my-shop.ts` → `myShopSchema`, `myShop`, `updateMyShop`, `uploadShopLogo` | `(db, actor, …, now)`; sin `shop.manage` → `forbidden` |
| `permissions.ts` | acción `shop.manage` (solo `owner`), al final de `ACTIONS` |
| `scripts/platform-admin.ts` → `setPlatformAdmin` | `setPlatformAdmin(db, email, on, now)` → `{ ok: true } \| { ok: false, code: "not_found" }`; CLI `<correo> [--off]`, sale 0/1/2 |

## Conventions that bite in this area

- Una persona, una cuenta (decisión 6): `uq_users_email` es global; un correo existente en otro taller → `Ese correo ya tiene cuenta.`.
- Suspender revoca sesiones y bloquea el ingreso; la página pública, la API y las tareas ya ignoran talleres `suspendido` (épicas 03 y 04).
- `slug` y `code_prefix` no se editan en "Mi taller" (cambiar el slug rompería enlaces).
- Logo: JPG o PNG ≤ 2 MB → `sharp` a PNG de 512 px → `shops/<id>/logo.png` → `logo_key`; si la fila falla, se borra el objeto.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/shops.md`, `server-api.md`, `taller-ui.md`, `taller-domain.md`.

---

## Tasks

### `E5-T1` — BG-41 Add platform admin flag and shops list

**Depends on:** `E4-T7` · **Priority:** p0

1. `tests/integration/platform-isolation.test.ts` primero.
2. `admin-auth.ts`: `requireAdmin` lee `is_platform_admin` y agrega `isPlatformAdmin: true` solo cuando es verdadero; `libraryCurator` = `library_curator or is_platform_admin`.
3. `platform-shops.ts`: `listShopsWithUsage(db, actor, now)`.
4. `/plataforma`: sesión (303 a `loginRedirect`) → marca (403) → lista (`Activo`/`Suspendido` con `span.status` + texto; vacío: `No hay talleres.`).
5. `TallerLayout.astro`: enlace `Plataforma` (`/plataforma`) solo con `user.isPlatformAdmin`.

**Files**
- `src/server/auth/admin-auth.ts` — edit
- `src/server/shops/platform-shops.ts` — new
- `src/pages/plataforma/index.astro` — new
- `src/layouts/TallerLayout.astro` — edit
- `tests/integration/platform-isolation.test.ts` — new

Reglas: `server-api.md`, `shops.md`, `taller-ui.md`.

**Acceptance**

1. **WHEN** un usuario con `is_platform_admin` abre `/plataforma` **THE SYSTEM SHALL** listar cada taller con `slug`, nombre, estado, usuarios activos, órdenes abiertas y reservas de los últimos 30 días, sin nombres, teléfonos ni correos de clientes
2. **WHEN** un usuario sin la marca pide `/plataforma` **THE SYSTEM SHALL** responder 403, y sin sesión SHALL redirigir 303 al ingreso
3. **WHEN** el administrador de plataforma, usuario de Vector Bikes, abre `/taller/ordenes` o `/admin` **THE SYSTEM SHALL** mostrar solo datos de Vector Bikes
4. **WHEN** `requireAdmin` devuelve un usuario sin la marca **THE SYSTEM SHALL** devolver el mismo objeto de hoy (`admin-auth.test.ts` sin cambios)
5. **WHEN** un usuario tiene `is_platform_admin` **THE SYSTEM SHALL** tratarlo como curador de la biblioteca
6. **WHEN** se renderiza el menú para el administrador de plataforma **THE SYSTEM SHALL** mostrar `Plataforma`, y para cualquier otro usuario SHALL no mostrarlo

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

### `E5-T2` — BG-42 Create a shop with its first owner

**Depends on:** `E5-T1` · **Priority:** p0

1. `tests/integration/create-shop.test.ts` primero.
2. `create-shop.ts`: `createShopSchema` (zod: `slugSchema`, perfil, `weekHoursSchema` para recepción y retiro, capacidad, bloque, antelación, horizonte, retiro, comunas, tarifa, prefijo `^[A-Z]{2,4}$`, correo de avisos, dueño: nombre, correo, clave ≥ 12, `templateShopId`); `createShop`: solo `isPlatformAdmin`; una transacción: `shops` `activo`, una sucursal (nombre = `locality`), el `owner` con `hashPassword`, `copyCatalog`. Correo duplicado (`uq_users_email`) → `validation_error` en `ownerEmail` con `Ese correo ya tiene cuenta.`; slug o prefijo repetidos (`23505`) → `validation_error` en el campo.
3. `catalog-copy.ts`: `copyCatalog(tx, fromBranchId, toBranchId, now)` copia `services` y `service_prices` con el `branch_id` nuevo.
4. `/plataforma/talleres/nuevo`: sesión → marca → `isAllowedOrigin` → zod → `createShop` → 303 a `/plataforma?hecho=crear`; errores con `role="alert"` y `aria-invalid`; horarios por día en `fieldset`/`legend`; select del taller plantilla.

**Files**
- `src/server/shops/create-shop.ts` — new
- `src/server/shops/catalog-copy.ts` — new
- `src/pages/plataforma/talleres/nuevo.astro` — new
- `tests/integration/create-shop.test.ts` — new

Reglas: `server-api.md`, `shops.md`, `taller-domain.md`. No negociable 8.

**Acceptance**

1. **WHEN** el administrador de plataforma crea `taller-demo` con su perfil, horarios, comunas, tarifa, prefijo `TD` y un dueño con clave de 12 caracteres **THE SYSTEM SHALL** crear en una transacción el taller `activo`, una sucursal, el usuario `owner` con la clave en scrypt y los servicios y precios del catálogo del taller elegido como plantilla
2. **WHEN** el `slug` es reservado, ya existe o no cumple el formato, o el prefijo ya existe **THE SYSTEM SHALL** responder 422 con el campo y no escribir nada
3. **WHEN** el correo del dueño ya existe en otro taller **THE SYSTEM SHALL** responder 422 con `Ese correo ya tiene cuenta.` sin escribir
4. **WHEN** la clave tiene menos de 12 caracteres **THE SYSTEM SHALL** responder 422
5. **WHEN** el dueño nuevo entra a `/taller` **THE SYSTEM SHALL** ver su taller sin ningún dato de Vector Bikes, y su catálogo SHALL tener los servicios copiados con su propio `branch_id`
6. **WHEN** un usuario sin la marca hace POST en `/plataforma/talleres/nuevo` **THE SYSTEM SHALL** responder 403 sin escribir, y un POST con `Origin` ajeno SHALL responder 403

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

### `E5-T3` — BG-43 Suspend shops and show usage

**Depends on:** `E5-T2` · **Priority:** p0

1. `tests/integration/suspend-shop.test.ts` primero.
2. `platform-shops.ts`: `setShopStatus` (solo la marca; al suspender, `revokeUserSessions` de cada usuario del taller); `shopUsage` (usuarios activos, órdenes abiertas, reservas y ventas de los últimos 30 días).
3. `admin-auth.ts`: `loginAdmin` y `requireAdmin` rechazan a usuarios de un taller `suspendido` como a un usuario inactivo (mismo resultado y mensaje de hoy).
4. `/plataforma/talleres/[id]`: uso + botón `Suspender`/`Reactivar` (POST con `isAllowedOrigin`, 303 a `?hecho=estado`).

**Files**
- `src/server/shops/platform-shops.ts` — edit
- `src/pages/plataforma/talleres/[id].astro` — new
- `src/server/auth/admin-auth.ts` — edit
- `tests/integration/suspend-shop.test.ts` — new

Reglas: `server-api.md`, `shops.md`. No cambia: mensajes de ingreso fallido.

**Acceptance**

1. **WHEN** el administrador de plataforma suspende el Taller Demo **THE SYSTEM SHALL** dejar `status = 'suspendido'` y revocar las sesiones abiertas de sus usuarios
2. **WHEN** un usuario de un taller suspendido intenta entrar o usa una sesión **THE SYSTEM SHALL** rechazarlo como hoy rechaza a un usuario inactivo
3. **WHEN** se pide `/taller-demo/reservar` o `POST /api/reservas` con `taller-demo` suspendido **THE SYSTEM SHALL** responder 404
4. **WHEN** el administrador reactiva el taller **THE SYSTEM SHALL** volver a `activo` y sus usuarios SHALL poder entrar
5. **WHEN** `/plataforma/talleres/<id>` se renderiza **THE SYSTEM SHALL** mostrar el uso del taller sin datos personales
6. **WHEN** un usuario sin la marca hace POST en esa página **THE SYSTEM SHALL** responder 403

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

### `E5-T4` — BG-44 Add My shop page for owners

**Depends on:** `E5-T3` · **Priority:** p0

1. `tests/integration/my-shop.test.ts` primero (almacenamiento local temporal; imagen generada con `sharp({ create: … })`).
2. `permissions.ts`: `shop.manage` (solo `owner`) al final de `ACTIONS`. **Valor declarado:** `tests/unit/permissions.test.ts` pasa a 37 acciones y agrega `shop.manage` al dueño (autorizado por esta fase).
3. `my-shop.ts`: `myShopSchema` (perfil, horarios, capacidad, bloque, antelación, horizonte, retiro, comunas, tarifa, correo de avisos; `slug` y `code_prefix` fuera del esquema), `myShop`, `updateMyShop`, `uploadShopLogo` (JPG o PNG ≤ 2 MB → `sharp` a PNG de 512 px → almacenamiento → `logo_key`; si la fila falla, borra el objeto).
4. `/taller/mi-taller`: formulario sin isla, `multipart/form-data` para el logo; `isAllowedOrigin`; 303 a `?hecho=guardar` o `?hecho=logo`.
5. `TallerLayout.astro`: enlace `Mi taller` con la acción `shop.manage`.

**Files**
- `src/server/shops/my-shop.ts` — new
- `src/pages/taller/mi-taller.astro` — new
- `src/server/auth/permissions.ts` — edit
- `src/layouts/TallerLayout.astro` — edit
- `tests/integration/my-shop.test.ts` — new
- Valor declarado: `tests/unit/permissions.test.ts` — edit

Reglas: `server-api.md`, `taller-ui.md`, `shops.md`. RC 11, 13. No negociable 12.

**Acceptance**

1. **WHEN** el dueño guarda "Mi taller" con nuevos horarios, capacidad, comunas, tarifa y correo de avisos **THE SYSTEM SHALL** actualizar su fila de `shops` y la disponibilidad pública SHALL usar los valores nuevos
2. **WHEN** el dueño envía otro `slug` o `code_prefix` **THE SYSTEM SHALL** ignorar esos campos
3. **WHEN** `admin`, `reception` o `mechanic` piden `/taller/mi-taller` **THE SYSTEM SHALL** responder 403
4. **WHEN** el dueño sube un logo JPG o PNG de hasta 2 MB **THE SYSTEM SHALL** guardarlo primero en el almacenamiento como `shops/<id>/logo.png` y después `logo_key`, y `/<slug>/logo` SHALL servirlo
5. **WHEN** los horarios traen `open` mayor o igual que `close` **THE SYSTEM SHALL** responder 422 sin cambiar la fila
6. **WHEN** se lee `ACTIONS` **THE SYSTEM SHALL** tener `shop.manage` solo para `owner`, y `tests/unit/permissions.test.ts` SHALL ser la única prueba existente que cambia

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

### `E5-T5` — BG-45 Add platform admin script and close the phase

**Depends on:** `E5-T4` · **Priority:** p1

1. `tests/integration/platform-admin-script.test.ts` primero (importa `setPlatformAdmin`).
2. `scripts/platform-admin.ts <correo> [--off]`: exporta `setPlatformAdmin(db, email, on, now)` (marca o quita y revoca sesiones); `main` con la guarda de `import.meta.url`; sale 0, 1 (correo inexistente), 2 (uso o sin conexión); salida sin el correo completo.
3. `package.json`: `"platform:admin": "node --env-file-if-exists=.env scripts/platform-admin.ts"`.
4. `docs/nuevo-taller.md`: `## Antes de dar de alta` (términos con el taller, política de privacidad, procedimiento de supresión, FASE §7), `## Alta en /plataforma`, `## Primer ingreso del dueño`, `## Verificación` (`pnpm bg:check`, `/<slug>/reservar`).
5. `README.md`: `## Operación de Bike Garage` (scripts `bg:backfill`, `bg:check`, `test:web`, `platform:admin`; ventanas; tabla de criterios FASE §14 → prueba de `blueprint.md` §9).

**Files**
- `scripts/platform-admin.ts` — new
- `package.json` — edit (solo el script)
- `docs/nuevo-taller.md` — new
- `README.md` — edit
- `tests/integration/platform-admin-script.test.ts` — new

Reglas: `shops.md`. No negociable 4.

**Acceptance**

1. **WHEN** `setPlatformAdmin` recibe un correo existente **THE SYSTEM SHALL** marcar `is_platform_admin = true` y revocar sus sesiones, y con `on: false` SHALL quitar la marca
2. **WHEN** el correo no existe **THE SYSTEM SHALL** devolver `not_found` sin cambios, y `node scripts/platform-admin.ts` sin argumentos SHALL salir 2
3. **WHEN** se lee `docs/nuevo-taller.md` **THE SYSTEM SHALL** contener `## Antes de dar de alta`, `## Alta en /plataforma`, `## Primer ingreso del dueño` y `## Verificación`
4. **WHEN** se lee `README.md` **THE SYSTEM SHALL** contener `## Operación de Bike Garage`
5. **WHEN** se lee `package.json` **THE SYSTEM SHALL** tener `platform:admin` igual a `node --env-file-if-exists=.env scripts/platform-admin.ts`

**Verify**

```bash
pnpm test tests/integration/platform-admin-script.test.ts   # expect: exit 0, 0 failed
node scripts/platform-admin.ts; test $? -eq 2   # expect: código 2 (uso) → la línea sale 0
for s in '## Antes de dar de alta' '## Alta en /plataforma' '## Primer ingreso del dueño' '## Verificación'; do grep -qF "$s" docs/nuevo-taller.md || echo "$s"; done | grep -q .; test $? -eq 1   # expect: 1 = no falta ninguna sección → la línea sale 0
grep -qF '## Operación de Bike Garage' README.md   # expect: exit 0
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
