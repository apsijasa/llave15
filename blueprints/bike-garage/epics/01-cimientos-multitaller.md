# Epic 01: Cimientos multi-taller

> Después de esta épica existe la tabla `shops` con el taller Vector Bikes sembrado con los valores de hoy, `branches.shop_id` y `branch_id` NOT NULL en las siete tablas de reserva, `booking_days` con clave (`branch_id`, `service_date`), índices únicos por taller, CHECK de reserva relajados, un motor de reservas que lee la configuración del taller por un `BookingScope`, el filtro por sucursal en toda lectura de reservas (API pública, reserva manual, reprogramación, agenda y mes de `/admin`, bloqueos, tablero, indicadores, recepción desde reserva, recordatorios y WhatsApp), la prueba de dos talleres y la guardia de literales. **Nada cambia a la vista**: ninguna prueba existente cambia un valor esperado.

| | |
|---|---|
| **Epic id** | `01-cimientos-multitaller` |
| **Tasks** | `E1-T1` … `E1-T16` (pasos BG-01 … BG-16) |
| **Depends on** | nada — es la primera (precondición: Bootstrap de `blueprint.md` §10 y sin duplicados de iCloud) |
| **Unlocks** | `02-identidad` |
| **Parallel with** | ninguna |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Astro 7 SSR · TypeScript 6 · Postgres 16 · Drizzle ORM 0.45 · zod 4 · luxon · Vitest + PGlite · Playwright (tablet 820×1180). `pnpm` 12.4.2; Node 24; versiones en `pnpm-lock.yaml`. Ninguna dependencia nueva.

| Task | Command |
|---|---|
| Formatear | `pnpm format` |
| Test (un archivo) | `pnpm test tests/integration/<archivo>.test.ts` |
| Prueba de dos talleres | `pnpm test isolation` |
| Paridad de expectativas | `node scripts/bg-expect-parity.ts` (desde E1-T1) |
| Migraciones (solo base dev) | `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:check` |
| Migración de datos | `pnpm bg:backfill [--dry-run] [--logo <ruta>]` (desde E1-T5) |
| Tablet | `pnpm build && pnpm test:tablet e2e/<archivo>.spec.ts` |
| Compuerta | `pnpm gate` |

**Gate:** `pnpm format && pnpm gate`. Servicio: Postgres local (`vector_bikes`, `vector_bikes_e2e`). **Reparto:** Codex implementa con pruebas primero y corre solo `pnpm format && pnpm check && pnpm test && pnpm build` (su sandbox no tiene red, ni siquiera `127.0.0.1`; nunca commitea). La sesión coordinadora escribe el encargo `docs/encargos/BG-NN-<tema>.md`, corre `db:migrate`, `db:check`, `bg:backfill`, `test:tablet`, `smoke`, el Verify completo y `gate`, commitea y pone el tag. El dueño publica. Reversión: `git reset --hard bg-<anterior>` y, si hace falta, el reinicio de la base dev de `blueprint.md` §12 (lo aprueba el operador).

**Reglas transversales de cada tarea:** pruebas primero, en rojo; ≤ 5 archivos escritos a mano (salvo E1-T4, excepción declarada); las pruebas existentes solo cambian por **firma o siembra** y se listan en la tarea; **ningún valor esperado de una prueba existente cambia en esta épica** (`node scripts/bg-expect-parity.ts` sale 0 en cada Verify); **releer cada archivo antes de tocarlo**; **ningún dato de un taller en `src/`** (la guardia de E1-T1 no deja crecer ningún conteo); nunca editar `drizzle/`; `db:migrate` solo en la base dev; nada se borra; `db` y `now` como argumentos; zod en toda entrada; correos después del commit. **Alcance:** toda función que lee o escribe reservas recibe el `BookingScope` o la sucursal como último argumento opcional; sin él usa `singleShopScope`, que lanza con dos talleres. **Checkpoint:** `git add --` solo con las rutas del paso (y `drizzle` en pasos de esquema, después de la guarda de duplicados de iCloud); nunca `git add -A`.

**Cobertura de tablet:** E1-T4 corre `e2e/login.spec.ts` con la siembra nueva; E1-T15 corre `e2e/recepcion-inicio.spec.ts` y `e2e/recepcion-completa.spec.ts` (recepción desde reserva).

## Directory subtree

```
tests/unit/shop-literals.test.ts · shop-literals-baseline.json · bg-expect-parity.test.ts   # NEW (E1-T1)
scripts/bg-expect-parity.ts                         # NEW (E1-T1)
src/lib/time.ts · tests/unit/time.test.ts           # NEW (E1-T2)
src/server/booking/rules.ts · slots.ts              # edit (E1-T2 reexporta; E1-T6 configuración opcional)
src/server/db/schema-shops.ts                       # NEW (E1-T3): shops, shopTables, onlyShopId
src/server/db/schema.ts                             # edit (E1-T3 expand; E1-T9, T10, T11 contract)
src/server/db/schema-taller.ts                      # edit (E1-T10): uq_customers_rut por sucursal
scripts/db-check.ts                                 # edit (E1-T3)
scripts/vector-bikes-profile.ts                     # NEW (E1-T4)
tests/helpers/shops.ts · tests/helpers/pglite.ts    # NEW/edit (E1-T4)
src/server/shops/backfill.ts · scripts/bg-backfill.ts · docs/ventanas/bg-v1.md   # NEW (E1-T5)
src/server/booking/config.ts · src/server/shops/scope.ts                          # NEW (E1-T6)
src/server/booking/create-booking.ts · day-state.ts · availability.ts             # edit (E1-T7)
tests/helpers/two-shops.ts                          # NEW (E1-T7)
src/server/api/handlers.ts · docs/ventanas/bg-v2.md # edit/NEW (E1-T8)
docs/ventanas/bg-v3.md                              # NEW (E1-T11)
src/server/taller/manual-booking.ts · src/pages/taller/reservas/{nueva,index}.astro   # edit (E1-T12)
src/server/booking/reschedule-booking.ts · src/server/admin/agenda.ts · 2 páginas      # edit (E1-T13)
src/server/admin/month.ts · src/pages/admin/{index,bloqueos}.astro                    # edit (E1-T14)
src/server/taller/{dashboard,indicators-customers,booking-reception,orders}.ts        # edit (E1-T15)
src/server/email/reminders.ts · src/server/whatsapp/{service,order-notices}.ts        # edit (E1-T16)
tests/integration/<archivo>.test.ts                 # uno nuevo por tarea; las de aislamiento terminan en -isolation
```

## Data model touched here

**`schema-shops.ts`** (nuevo, cabeza de la cadena; define sus propios `instant`/`createdAt`/`updatedAt`; no importa otro archivo de esquema)

| Entity | Campos | Notas |
|---|---|---|
| `shops` (E1-T3) | `id uuid pk defaultRandom`, `slug text not null`, `name text not null`, `legal_name text`, `rut text`, `email text not null`, `notify_email text not null`, `phone text not null`, `phone_display text not null`, `street_address text not null`, `address_short text not null`, `locality text not null`, `region text not null`, `maps_url text`, `instagram_url text`, `logo_key text`, `certifications text[] not null default '{}'`, `timezone text not null default 'America/Santiago'`, `reception_hours jsonb not null`, `pickup_hours jsonb not null`, `daily_capacity integer not null`, `block_minutes integer not null`, `min_notice_minutes integer not null`, `horizon_days integer not null`, `pickup_enabled boolean not null default false`, `pickup_fee_clp integer not null default 0`, `pickup_comunas text[] not null default '{}'`, `code_prefix text not null`, `status text not null default 'activo'`, `created_at`, `updated_at` | únicos `uq_shops_slug (slug)`, `uq_shops_code_prefix (code_prefix)`; CHECK `shops_slug_check` `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 40`, `shops_status_check` `status in ('activo', 'suspendido')`, `shops_capacity_check` `daily_capacity between 1 and 20`, `shops_block_minutes_check` `block_minutes in (15, 20, 30, 45, 60)`, `shops_notice_check` `min_notice_minutes between 0 and 10080`, `shops_horizon_check` `horizon_days between 1 and 120`, `shops_pickup_fee_check` `pickup_fee_clp >= 0`, `shops_pickup_check` `not pickup_enabled or cardinality(pickup_comunas) > 0`, `shops_code_prefix_check` `code_prefix ~ '^[A-Z]{2,4}$'`, `shops_timezone_check` `timezone = 'America/Santiago'`; `export const shopTables = [shops] as const` |
| `branches` | + `shop_id uuid → shops restrict` | nulable en E1-T3 con `$defaultFn(onlyShopId)`; NOT NULL en E1-T9; `uq_branches_name` pasa a (`shop_id`, `name`) en E1-T10 |
| `users` | + `is_platform_admin boolean not null default false` | E1-T3 |
| `bookings`, `booking_bikes`, `booking_blocks`, `booking_days`, `blocked_periods`, `booking_requests`, `whatsapp_messages` | + `branch_id uuid → branches restrict` | nulable en E1-T3 con `$defaultFn(onlyBranchId)`; NOT NULL en E1-T9 |
| índices no únicos (E1-T3) | `idx_bookings_branch_service_date (branch_id, service_date)`, `idx_booking_blocks_branch_service_date (branch_id, service_date)`, `idx_blocked_periods_branch_service_date (branch_id, service_date)`, `idx_booking_requests_branch_ip_created (branch_id, ip_hash, created_at)` | |
| `booking_days` (E1-T9) | PK (`branch_id`, `service_date`) | antes `service_date` |
| índices únicos (E1-T10, mismo nombre) | `uq_bookings_code (branch_id, code)`, `uq_booking_blocks_active_slot (branch_id, service_date, block_start) where is_active = true`, `uq_branches_name (shop_id, name)`, `uq_customers_rut (branch_id, rut) where rut is not null` | |
| CHECK (E1-T11) | `bookings_fee_check` `(mode = 'taller' and pickup_fee_clp = 0) or (mode = 'retiro' and pickup_fee_clp >= 0)`; `bookings_retiro_address_check` `mode = 'taller' or (length(trim(comuna)) > 0 and address is not null)` | |

Valores por defecto de compatibilidad (BG-D3), literales:

```ts
// schema-shops.ts
export const onlyShopId = () => sql`(select "id" from "shops" where (select count(*) from "shops") = 1)`;

// schema.ts
const onlyBranchId = () =>
  sql`(select "id" from "branches" where (select count(*) from "branches") = 1)`;

const bookingBranchReference = () =>
  uuid("branch_id")
    .references((): AnyPgColumn => branches.id, { onDelete: "restrict" })
    .$defaultFn(onlyBranchId);
```

Perfil literal de Vector Bikes (`scripts/vector-bikes-profile.ts`, E1-T4): ver `blueprint.md` §4 "Datos iniciales" — `slug` `vector-bikes`, `name` `Vector Bikes`, `email` y `notifyEmail` `info@vectorbikes.cl`, `phone` `+56985095780`, `phoneDisplay` `+56 9 8509 5780`, `streetAddress` `Avenida Kennedy 7666`, `addressShort` `Av. Kennedy 7666, Vitacura`, `locality` `Vitacura`, `region` `Región Metropolitana`, `mapsUrl` `https://www.google.com/maps/search/?api=1&query=Avenida+Kennedy+7666+Vitacura`, `instagramUrl` `https://instagram.com/vector.bikes`, `certifications` `[]`, recepción L–V `15:00`–`20:00`, sáb. `10:00`–`14:00`, dom. `null`; retiro L–V `09:00`–`20:00`, sáb. `10:00`–`14:00`, dom. `null`; `dailyCapacity` 4, `blockMinutes` 30, `minNoticeMinutes` 120, `horizonDays` 30, `pickupEnabled` true, `pickupFeeClp` 15000, `pickupComunas` `["Vitacura", "Las Condes"]`, `codePrefix` `VB`, `status` `activo`, `legalName` y `rut` `null`, `timezone` `America/Santiago`.

Perfil del Taller Demo (`tests/helpers/shops.ts`, `DEMO_SHOP_PROFILE`): `slug` `taller-demo`, `name` `Taller Demo`, `email` `hola@tallerdemo.cl`, `notifyEmail` `avisos@tallerdemo.cl`, `phone` `+56911112222`, `phoneDisplay` `+56 9 1111 2222`, `streetAddress` `Avenida Irarrázaval 1000`, `addressShort` `Av. Irarrázaval 1000, Ñuñoa`, `locality` `Ñuñoa`, `region` `Región Metropolitana`, `instagramUrl` `https://instagram.com/tallerdemo`, recepción y retiro L–V `10:00`–`13:00` (sáb. y dom. `null`), `dailyCapacity` 2, `blockMinutes` 60, `minNoticeMinutes` 60, `horizonDays` 14, `pickupEnabled` true, `pickupFeeClp` 9000, `pickupComunas` `["Ñuñoa", "Providencia"]`, `codePrefix` `TD`.

## Contracts

**Consumed:** `createTestDb` (`tests/helpers/pglite.ts`), `getDb`, `getEmailEnv`, `getStorage`, `isUniqueViolation`, `hashCancelToken`, `HOLIDAYS`, `requireAdmin`, `can`.

**Produced:**

| Export | Signature |
|---|---|
| `src/lib/time.ts` → `TIMEZONE`, `localToday`, `addDays`, `localToInstant` | `localToday(now: Date): string`; `addDays(date: string, days: number): string`; `localToInstant(date: string, hhmm: string): Date \| null` |
| `schema-shops.ts` → `shops`, `shopTables`, `onlyShopId`, `WeekHours` | tablas Drizzle |
| `scripts/bg-expect-parity.ts` → `compareMatcherTails` | `compareMatcherTails(diff: string, allow: string[]): { removed: string[]; added: string[] }`; CLI `[--base <ref>] [--allow <texto>]… [--skip <ruta>]…`, sale 0/1/2 |
| `scripts/vector-bikes-profile.ts` → `VECTOR_BIKES_PROFILE` | objeto `as const` |
| `tests/helpers/shops.ts` → `VECTOR_BIKES_PROFILE`, `DEMO_SHOP_PROFILE`, `seedShop`, `insertBranchForShop` | `seedShop(db, profile)`; `insertBranchForShop(db, shopId, name)` |
| `tests/helpers/pglite.ts` → `createTestDb`, `createBookingTestDb` | `createBookingTestDb(): Promise<TestDb>` |
| `tests/helpers/two-shops.ts` → `seedTwoShops` | `seedTwoShops(db)` → `{ vector, demo }`, cada uno `{ shopId, branchId, ownerId, mechanicId, scope }` |
| `src/server/shops/backfill.ts` → `backfillFirstShop` | `(db, { profile, notifyEmail, logo?, storage?, dryRun }, now)` → `{ ok: true, dryRun, shopCreated, branchesLinked, filled, pending, logoStored } \| { ok: false, code: "ambiguous" }` |
| `src/server/booking/config.ts` → `BookingConfig`, `weekHoursSchema`, `bookingConfigFromShop`, `LEGACY_BOOKING_CONFIG` (transitorio) | `bookingConfigFromShop(row): BookingConfig` |
| `src/server/shops/scope.ts` → `BookingScope`, `ShopScopeError`, `scopeForBranch`, `singleShopScope` | `BookingScope = { shopId; slug; branchId; config }`; `scopeForBranch(db, branchId): Promise<BookingScope \| null>`; `singleShopScope(db): Promise<BookingScope>` (lanza `ambiguous` o `missing`) |
| booking y admin | `createBooking(db, input, now, scope?)`; `readDay(tx, serviceDate, excludeBookingId?, branchId?)`; `readRange(db, from, to, excludeBookingId?, branchId?)`; `rescheduleBooking(…, scope?)`; `agendaForDate`, `bookingDetail`, `applyAdminAction`, `listUpcomingBlocks`, `createBlock`, `deleteBlock` con `branchId?` al final; `monthOverview(db, month, now, scope?)`; `listUpcomingBookings(db, today, days?, branchId?)`; `sendReminders(db, now, deps?, scope?)`; `sendPendingReminders(…, scope?)`; `listNotices(db, bookingId, branchId?)` |

## Conventions that bite in this area

- **Paridad:** ninguna expectativa cambia. Si una prueba existente falla, detenerse y reportar con el diff; nunca ajustar la expectativa.
- El código de reserva es `${config.codePrefix}-AAMMDD-HHMM` (correlativo `-n` por sucursal); Vector Bikes sigue en `VB-…`.
- Orden de locks intacto: `booking_days` (`branch_id`, `service_date`) `FOR UPDATE` → `pg_advisory_xact_lock(hashtext(phone))`.
- Antes del contract (E1-T9…T11) los índices únicos y los CHECK siguen globales: las pruebas del Taller Demo reservan `taller` y a horas distintas de Vector Bikes hasta E1-T10 y E1-T11.
- `drizzle-kit generate` no debe preguntar nada; si pregunta, el cambio no es el declarado: detenerse.
- PGlite es de una conexión: los locks se prueban en secuencia contra el índice único.
- Mensaje de comunas: `Elige ` + comunas unidas con `, ` y la última con ` o ` + `.`.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/database.md`, `booking-engine.md`, `server-api.md`, `shops.md`, `taller-domain.md`, `e2e.md`.

---

## Tasks

### `E1-T1` — BG-01 Add shop literal guard and expectation parity script

**Depends on:** — · **Priority:** p0

1. `tests/unit/shop-literals.test.ts`: recorre todo archivo bajo `src/` y cuenta por archivo las ocurrencias no superpuestas de `Vector Bikes`, `Vitacura`, `Las Condes`, `Kennedy`, `vectorbikes`, `vector.bikes`, `$15.000`, `85095780`, `8509 5780` (nunca el número suelto `15000`). Falla, nombrando archivo y patrón, si un archivo con ocurrencias no está en la línea base o supera su conteo. Incluye un caso con un directorio temporal y un archivo con `Vitacura`.
2. `tests/unit/shop-literals-baseline.json`: `{ "src/…": n }` con los conteos de este paso, claves ordenadas.
3. `scripts/bg-expect-parity.ts`: `[--base <ref>] [--allow <texto>]… [--skip <ruta>]…`; corre `git diff <ref|HEAD> -U0 --no-color -- tests e2e`, ignora archivos nuevos y los de `--skip`, toma la "cola de matcher" de cada línea quitada y agregada (desde `.toBe(`, `.toEqual(`, `.toStrictEqual(`, `.toContain(`, `.toContainEqual(`, `.toMatch(`, `.toMatchObject(`, `.toHaveLength(`, `.toHaveProperty(`, `.toThrow(`, `.toBeNull(`, `.toBeTruthy(`, `.toBeFalsy(`, `.toBeDefined(`, `.toBeUndefined(`, `.toBeGreaterThan(`, `.toBeLessThan(`, con `.not.` opcional, hasta el fin de línea), descarta las que contienen un texto de `--allow` y compara los multiconjuntos; sale 0 iguales, 1 distintos (imprime), 2 uso o `git` falló. Exporta `compareMatcherTails`; `main` solo si `import.meta.url === pathToFileURL(process.argv[1]).href`.
4. `tests/unit/bg-expect-parity.test.ts` con diffs de ejemplo.

**Files**
- `tests/unit/shop-literals.test.ts` — new
- `tests/unit/shop-literals-baseline.json` — new
- `scripts/bg-expect-parity.ts` — new
- `tests/unit/bg-expect-parity.test.ts` — new

Reglas: RC 14. No cambia: ningún archivo de `src/`.

**Acceptance**

1. **WHEN** corre `tests/unit/shop-literals.test.ts` sobre el árbol del paso **THE SYSTEM SHALL** pasar, con cada archivo de `src/` que contiene uno de los nueve patrones listado en `shop-literals-baseline.json` con su conteo actual
2. **WHEN** el escáner de la guardia recorre un directorio temporal con un archivo que contiene `Vitacura` **THE SYSTEM SHALL** reportar ese archivo con conteo 1 y la guardia SHALL fallar si ese archivo no está en la línea base
3. **WHEN** se suman los conteos de `shop-literals-baseline.json` **THE SYSTEM SHALL** dar el mismo total que `grep -rFoI` con los nueve patrones sobre `src/`
4. **WHEN** `compareMatcherTails` recibe un diff donde una línea con `.toBe(` cambia su argumento **THE SYSTEM SHALL** devolver esa diferencia, y con un diff que solo cambia argumentos fuera del matcher SHALL devolver listas vacías
5. **WHEN** `compareMatcherTails` recibe un texto en `allow` **THE SYSTEM SHALL** ignorar las colas de matcher que lo contienen
6. **WHEN** `node scripts/bg-expect-parity.ts --x` corre **THE SYSTEM SHALL** salir con código 2 y un mensaje de uso, y sin cambios en `tests/` ni `e2e/` SHALL salir 0

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

### `E1-T2` — BG-02 Move time helpers to src/lib/time.ts

**Depends on:** `E1-T1` · **Priority:** p0

1. `tests/unit/time.test.ts` primero.
2. `src/lib/time.ts`: `TIMEZONE` (de `rules.ts`), `localToday`, `addDays`, `localToInstant` (de `slots.ts`), tal cual; solo importa `luxon`.
3. `rules.ts` reexporta `TIMEZONE`; `slots.ts` reexporta las tres funciones desde `../../lib/time.ts`. Ningún importador cambia (se quitan en E2-T12).

**Files**
- `src/lib/time.ts` — new
- `src/server/booking/rules.ts` — edit
- `src/server/booking/slots.ts` — edit
- `tests/unit/time.test.ts` — new

Reglas: `booking-engine.md`. RC 1, 3.

**Acceptance**

1. **WHEN** se importa `src/lib/time.ts` **THE SYSTEM SHALL** exportar `TIMEZONE` igual a `America/Santiago`, `localToday`, `addDays` y `localToInstant`, sin importar nada de `src/server/**`
2. **WHEN** `localToday` recibe el instante `2026-10-05T02:30:00Z` **THE SYSTEM SHALL** devolver `2026-10-04`
3. **WHEN** la prueba busca con luxon la primera hora local inexistente de septiembre de 2026 en `America/Santiago` **THE SYSTEM SHALL** obtener `null` de `localToInstant` para esa hora
4. **WHEN** se importan `TIMEZONE` desde `src/server/booking/rules.ts` y `localToday`, `addDays` y `localToInstant` desde `src/server/booking/slots.ts` **THE SYSTEM SHALL** entregar los mismos valores y funciones de `src/lib/time.ts`
5. **WHEN** corren `slots.test.ts`, `pickup-hours.test.ts` y `multi-bike-slots.test.ts` **THE SYSTEM SHALL** pasar sin cambios en esos archivos

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

### `E1-T3` — BG-03 Add shops table and nullable branch columns

**Depends on:** `E1-T2` · **Priority:** p0

Confirmación previa del operador (no es compuerta): respaldos de Replit activos. Confirmado por la coordinadora: `drizzle-orm` 0.45.2 acepta un `SQL` devuelto por `$defaultFn` (`insert.js`, línea 380).

1. `tests/integration/shops-schema.test.ts` primero (CHECK `23514`, únicos `23505`, compatibilidad con uno y dos talleres o sucursales).
2. `schema-shops.ts`: `shops`, `shopTables`, `onlyShopId`, `WeekHours` según "Data model".
3. `schema.ts`: `branches.shopId` nulable con `$defaultFn(onlyShopId)`; `users.isPlatformAdmin`; `bookingBranchReference()` nulable en las siete tablas de reserva; los cuatro índices no únicos.
4. `scripts/db-check.ts`: recorre también `shopTables`.
5. `pnpm db:generate` (si pregunta, detenerse) → pruebas → migrate → check.

**Files**
- `src/server/db/schema-shops.ts` — new
- `src/server/db/schema.ts` — edit
- `scripts/db-check.ts` — edit
- `tests/integration/shops-schema.test.ts` — new

Reglas: `database.md`. No negociables 5, 8. No cambia: ninguna columna, índice ni CHECK existente.

**Acceptance**

1. **WHEN** `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` **THE SYSTEM SHALL** crear `shops` y agregar `branches.shop_id`, `users.is_platform_admin` y `branch_id` en `bookings`, `booking_bikes`, `booking_blocks`, `booking_days`, `blocked_periods`, `booking_requests` y `whatsapp_messages`, nulables, sin borrar, renombrar ni volver NOT NULL nada existente
2. **WHEN** se inserta un usuario sin `is_platform_admin` **THE SYSTEM SHALL** guardar `false`
3. **WHEN** se guarda un taller con `slug` fuera de `^[a-z0-9]+(-[a-z0-9]+)*$`, `code_prefix` fuera de `^[A-Z]{2,4}$`, `daily_capacity` 0, `pickup_fee_clp` negativo, `status` fuera de `activo` y `suspendido`, o `pickup_enabled` con `pickup_comunas` vacío **THE SYSTEM SHALL** rechazarlo con código `23514`, y dos talleres con el mismo `slug` o el mismo `code_prefix` SHALL rechazarse con `23505`
4. **WHEN** la base tiene un solo taller y se inserta una sucursal con Drizzle sin `shopId` **THE SYSTEM SHALL** guardarla con el id de ese taller, y con dos talleres SHALL dejar `shop_id` nulo
5. **WHEN** la base tiene una sola sucursal y se inserta una reserva con Drizzle sin `branchId` **THE SYSTEM SHALL** guardarla con el id de esa sucursal, y con dos sucursales SHALL dejar `branch_id` nulo
6. **WHEN** `pnpm db:check` corre **THE SYSTEM SHALL** revisar también las columnas de `shopTables` y salir 0

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

### `E1-T4` — BG-04 Seed the Vector Bikes shop in tests (excepción declarada BG-D6)

**Depends on:** `E1-T3` · **Priority:** p0

1. `scripts/vector-bikes-profile.ts`: `VECTOR_BIKES_PROFILE` literal ("Data model").
2. `tests/helpers/shops.ts`: reexporta `VECTOR_BIKES_PROFILE`; `DEMO_SHOP_PROFILE`; `seedShop(db, profile)`; `insertBranchForShop(db, shopId, name)`.
3. `tests/helpers/pglite.ts`: `createTestDb()` siembra el taller Vector Bikes (sin sucursal); `createBookingTestDb()` = `createTestDb()` + sucursal `Vitacura` de ese taller.
4. `tests/unit/vector-bikes-profile.test.ts`: compara el perfil con `SITE` y las constantes de `rules.ts` (se reescribe en E2-T11, cuando `src/lib/site.ts` desaparece).
5. **Siembra declarada (no cuenta; ninguna expectativa):** `tests/integration/{api,create-booking,concurrency,cancel-flow,email,reminders,tasks,whatsapp,admin-panel,admin-month,foundation}.test.ts` pasan de `createTestDb` a `createBookingTestDb`; los `INSERT` crudos de `branches` en `tests/integration/{users-schema,reports,history}.test.ts` agregan `shop_id` (`(select id from shops limit 1)` o el id sembrado) y el de `bookings` en `users-schema` agrega `branch_id`; `e2e/global-setup.ts` (con `hasTable(sql, "shops")`) inserta el taller desde `VECTOR_BIKES_PROFILE` antes de la sucursal, la sucursal con `shop_id` y las reservas con `branch_id` (excepción BG-D19: puede importar `scripts/vector-bikes-profile.ts`).

**Files**
- `scripts/vector-bikes-profile.ts` — new
- `tests/helpers/shops.ts` — new
- `tests/helpers/pglite.ts` — edit
- `tests/unit/vector-bikes-profile.test.ts` — new
- Siembra declarada: `e2e/global-setup.ts` y las catorce pruebas de integración del punto 5 — edit (solo siembra)

Reglas: `database.md`, `e2e.md` (excepción BG-D19). No negociable 7. No cambia: ninguna expectativa.

**Acceptance**

1. **WHEN** `createTestDb()` termina **THE SYSTEM SHALL** tener exactamente un taller, con `slug` `vector-bikes` y los valores de `VECTOR_BIKES_PROFILE`, y ninguna sucursal
2. **WHEN** `createBookingTestDb()` termina **THE SYSTEM SHALL** tener además una sola sucursal `Vitacura` enlazada a ese taller
3. **WHEN** corre `tests/unit/vector-bikes-profile.test.ts` **THE SYSTEM SHALL** comprobar que nombre, correo, teléfonos, direcciones, comuna, región, enlaces, horarios, capacidad, bloque, antelación, horizonte, tarifa y comunas de retiro de `VECTOR_BIKES_PROFILE` son iguales a los de `src/lib/site.ts` y `src/server/booking/rules.ts`, y que `codePrefix` es `VB`
4. **WHEN** se compara `tests/` y `e2e/` con `HEAD` **THE SYSTEM SHALL** mostrar cambios exactamente en los quince archivos de siembra declarados y `tests/helpers/pglite.ts`
5. **WHEN** corre `node scripts/bg-expect-parity.ts` **THE SYSTEM SHALL** salir 0
6. **WHEN** corren `pnpm test` y `pnpm test:tablet e2e/login.spec.ts` **THE SYSTEM SHALL** pasar con 0 fallas

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

### `E1-T5` — BG-05 Add first shop backfill and window V-BG1

**Depends on:** `E1-T4` · **Priority:** p0

1. `tests/integration/bg-backfill.test.ts` primero (con `createTestDb` sin sembrar el taller: la prueba borra la fila sembrada o usa una base PGlite propia sin taller; almacenamiento local temporal).
2. `src/server/shops/backfill.ts`: `backfillFirstShop(db, { profile, notifyEmail, logo?, storage?, dryRun }, now)` — si no hay taller con `profile.slug` y la tabla está vacía, lo crea; con sucursales de `shop_id` nulo y ≠ 1 sucursal → `{ ok: false, code: "ambiguous" }` sin escribir; enlaza la sucursal; completa `branch_id` nulo en las siete tablas; una transacción. Logo (`logo` y `logo_key` nulo): sube `shops/<id del taller>/logo.png` **antes** de la transacción que guarda `logo_key`; si la fila falla, borra el objeto.
3. `scripts/bg-backfill.ts`: `[--dry-run] [--logo <ruta>]`; desconocido → 2 + uso; sin conexión → 2 `No se pudo conectar`; `ambiguous` o `pending > 0` después de escribir → 1; si no, 0. Una línea JSON sin datos personales (`JSON.stringify`, sin espacios). `notifyEmail` = `getEmailEnv().SHOP_NOTIFY_EMAIL`, leído solo al escribir. `main` con la guarda de `import.meta.url`.
4. `package.json`: `"bg:backfill": "node --env-file-if-exists=.env scripts/bg-backfill.ts"` (solo el script).
5. `docs/ventanas/bg-v1.md`: migración de BG-03 (nombre real), `## Precondiciones` (taller cerrado, respaldo del día), `## Pasos en Replit` (`corepack pnpm@12.4.2 install --frozen-lockfile`, `pnpm db:migrate`, `pnpm db:check`, `rm -rf node_modules`, Republish), `## Verificación después de publicar`.

**Files**
- `src/server/shops/backfill.ts` — new
- `scripts/bg-backfill.ts` — new
- `package.json` — edit (solo el script)
- `tests/integration/bg-backfill.test.ts` — new
- `docs/ventanas/bg-v1.md` — new

Reglas: `database.md`, `shops.md`. No negociables 2, 4. No cambia: ninguna dependencia.

**Acceptance**

1. **WHEN** `backfillFirstShop` corre sobre una base con una sucursal sin taller y reservas, bloques, días, bicis, bloqueos, intentos y mensajes de WhatsApp con `branch_id` nulo **THE SYSTEM SHALL** crear el taller `vector-bikes` con los valores del perfil y el correo de avisos recibido, enlazar la sucursal y completar `branch_id` en las siete tablas, en una transacción
2. **WHEN** corre por segunda vez, o con `dryRun` **THE SYSTEM SHALL** no escribir ninguna fila, devolver con `dryRun` los conteos pendientes y en la segunda corrida `pending` 0
3. **WHEN** la base tiene dos sucursales sin taller **THE SYSTEM SHALL** devolver `ok: false` con código `ambiguous` sin escribir
4. **WHEN** recibe un logo y el taller no tiene `logo_key` **THE SYSTEM SHALL** subirlo al almacenamiento con la clave `shops/<id del taller>/logo.png` antes de guardar `logo_key`
5. **WHEN** `node scripts/bg-backfill.ts --x` corre **THE SYSTEM SHALL** salir 2 con un mensaje de uso, con un `DATABASE_URL` inalcanzable SHALL salir 2 con `No se pudo conectar`, y `package.json` SHALL tener `bg:backfill` igual a `node --env-file-if-exists=.env scripts/bg-backfill.ts`
6. **WHEN** se lee `docs/ventanas/bg-v1.md` **THE SYSTEM SHALL** contener `## Precondiciones`, `## Pasos en Replit` y `## Verificación después de publicar` y el nombre de la migración que crea `shops`

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

### `E1-T6` — BG-06 Load booking config and scope from shops

**Depends on:** `E1-T5` · **Priority:** p0

1. `tests/integration/shop-config.test.ts` primero (configuración, grilla, capacidad, horizonte, antelación, `singleShopScope`).
2. `src/server/booking/config.ts`: `BookingConfig` (`blockMinutes`, `dailyCapacity`, `minNoticeMinutes`, `horizonDays`, `pickupEnabled`, `pickupFeeClp`, `pickupComunas`, `receptionHours`, `pickupHours`, `codePrefix`); `weekHoursSchema` (claves `"1"`…`"7"`, `null` o `{ open, close }` `HH:MM` con `open < close`); `bookingConfigFromShop(row)`; `LEGACY_BOOKING_CONFIG` con las constantes de `rules.ts` (transitorio, se borra en E2-T12).
3. `src/server/shops/scope.ts`: `BookingScope`, `ShopScopeError` (`ambiguous`, `missing`), `scopeForBranch`, `singleShopScope`.
4. `slots.ts`: `DayInput.config?`, `gridForDate(date, mode?, config?)`, `calendarClosure(…, config?)`; `rules.ts`: `hoursFor(mode, weekday, config?)`; sin configuración, `LEGACY_BOOKING_CONFIG`.

**Files**
- `src/server/booking/config.ts` — new
- `src/server/shops/scope.ts` — new
- `src/server/booking/slots.ts` — edit
- `src/server/booking/rules.ts` — edit
- `tests/integration/shop-config.test.ts` — new

Reglas: `booking-engine.md`, `shops.md`. RC 4.

**Acceptance**

1. **WHEN** `bookingConfigFromShop` recibe la fila del taller Vector Bikes **THE SYSTEM SHALL** devolver un `BookingConfig` igual a `LEGACY_BOOKING_CONFIG` con `codePrefix` `VB`
2. **WHEN** `bookingConfigFromShop` recibe `reception_hours` con una hora `25:00` o con `open` mayor o igual que `close` **THE SYSTEM SHALL** lanzar un error de validación
3. **WHEN** `gridForDate` recibe el lunes `2026-10-05` con la configuración del Taller Demo **THE SYSTEM SHALL** devolver `10:00`, `11:00` y `12:00`
4. **WHEN** `computeDay` recibe la configuración del Taller Demo con 2 bicis ya reservadas **THE SYSTEM SHALL** devolver `full`, una fecha a 15 días SHALL devolver `closed` y un inicio a menos de 60 minutos SHALL quedar `late`
5. **WHEN** `computeDay`, `checkStart`, `gridForDate` y `hoursFor` se llaman sin configuración **THE SYSTEM SHALL** dar los mismos resultados de hoy (`slots.test.ts`, `multi-bike-slots.test.ts` y `pickup-hours.test.ts` sin cambios)
6. **WHEN** `singleShopScope` corre con un taller y una sucursal **THE SYSTEM SHALL** devolver su `shopId`, `slug`, `branchId` y configuración, y con dos talleres SHALL lanzar `ShopScopeError` con código `ambiguous`

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

### `E1-T7` — BG-07 Scope booking writes and reads by branch

**Depends on:** `E1-T6` · **Priority:** p0

1. `tests/helpers/two-shops.ts`: `seedTwoShops(db)` → `{ vector, demo }` (usa el taller Vector Bikes de `createTestDb`, crea su sucursal, crea el Taller Demo y su sucursal, un `owner` y un `mechanic` por taller, y el alcance de cada uno con `scopeForBranch`).
2. `tests/integration/booking-isolation.test.ts` primero. El Taller Demo reserva solo `taller` y a horas distintas de Vector Bikes (los CHECK y el índice de bloques son globales hasta E1-T10 y E1-T11).
3. `createBooking(db, input, now, scope?)`: sin alcance, `singleShopScope`; todo con `scope.branchId`; `booking_days` (`branchId`, `serviceDate`) con `onConflictDoNothing` y `FOR UPDATE` por sucursal y fecha; límite de teléfono por sucursal; `nextCode` por sucursal con `${config.codePrefix}-AAMMDD-HHMM`; tarifa de `config`.
4. `readDay(tx, serviceDate, excludeBookingId?, branchId?)` y `readRange(db, from, to, excludeBookingId?, branchId?)` filtran por sucursal.

**Files**
- `src/server/booking/create-booking.ts` — edit
- `src/server/booking/day-state.ts` — edit
- `src/server/booking/availability.ts` — edit
- `tests/helpers/two-shops.ts` — new
- `tests/integration/booking-isolation.test.ts` — new

Reglas: `booking-engine.md`, `shops.md`. No negociables 1, 3. No cambia: forma de `CreateBookingResult`.

**Acceptance**

1. **WHEN** `createBooking` recibe el alcance del Taller Demo **THE SYSTEM SHALL** guardar la reserva, sus bloques y su día con el `branch_id` del Taller Demo, con código `TD-AAMMDD-HHMM`
2. **WHEN** el Taller Demo ya tiene 2 bicis reservadas un día **THE SYSTEM SHALL** responder `slot_unavailable` a una tercera en ese taller y aceptar una reserva de Vector Bikes el mismo día a otra hora
3. **WHEN** un teléfono tiene una reserva futura en Vector Bikes **THE SYSTEM SHALL** aceptar una reserva del mismo teléfono en el Taller Demo y responder `phone_limit` a una segunda en Vector Bikes
4. **WHEN** `readRange` corre con la sucursal de Vector Bikes **THE SYSTEM SHALL** no contar bloques, bloqueos ni bicis del Taller Demo
5. **WHEN** `createBooking` corre sin alcance en una base con dos talleres **THE SYSTEM SHALL** lanzar `ShopScopeError` sin escribir filas
6. **WHEN** corren `create-booking.test.ts`, `concurrency.test.ts`, `multi-bike-booking.test.ts` y `api.test.ts` **THE SYSTEM SHALL** pasar sin cambios en esos archivos

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

### `E1-T8` — BG-08 Validate public booking with shop config and window V-BG2

**Depends on:** `E1-T7` · **Priority:** p0

Confirmación previa del operador (no es compuerta): la base dev tiene exactamente una sucursal (`select count(*) from branches` devuelve 1). Si tiene más, `pnpm bg:backfill` sale 1 con `ambiguous`: la coordinadora reinicia la base dev con el comando de `blueprint.md` §12 (o deja una sola sucursal) antes de empezar el paso.

1. `tests/integration/api-shop-config.test.ts` primero.
2. `handlers.ts`: `HandlerContext.scope?` (sin él, `singleShopScope(ctx.db)`); `bookingSchemaFor(config)`: `comuna` contra `config.pickupComunas` con el mensaje de comunas; retiro rechazado si `!config.pickupEnabled`; `handleAvailability` con `config` y la forma `{ timezone, modo, capacity, days }`.
3. `docs/ventanas/bg-v2.md`: `## Precondiciones` (V-BG1 publicada, taller cerrado, respaldo del día), `## Migración de datos en producción` (`pnpm bg:backfill --dry-run`, `pnpm bg:backfill --logo public/brand/vector-bikes-logo.png`, `pnpm bg:backfill --dry-run` con `"pending":0`), `## Pasos en Replit` (publicar `bg-08`), `## Verificación después de publicar`.
4. La coordinadora completa la base dev en el Verify (lo necesita E1-T9).

**Files**
- `src/server/api/handlers.ts` — edit
- `tests/integration/api-shop-config.test.ts` — new
- `docs/ventanas/bg-v2.md` — new

Reglas: `server-api.md`, `booking-engine.md`. No negociable 2. No cambia: forma de las respuestas, orden rate limit → zod → Turnstile.

**Acceptance**

1. **WHEN** `handleAvailability` corre con el alcance del Taller Demo **THE SYSTEM SHALL** responder 200 con `capacity` 2 y bloques de 60 minutos, con la misma forma de respuesta de hoy (`timezone`, `modo`, `capacity`, `days`)
2. **WHEN** `handleCreateBooking` recibe un retiro con comuna `Vitacura` para el Taller Demo **THE SYSTEM SHALL** responder 422 `validation_error` con el campo `comuna` igual a `Elige Ñuñoa o Providencia.`
3. **WHEN** `handleCreateBooking` recibe para Vector Bikes una comuna fuera de sus comunas **THE SYSTEM SHALL** responder 422 con `Elige Vitacura o Las Condes.`, igual que hoy
4. **WHEN** el contexto no trae alcance y la base tiene un solo taller **THE SYSTEM SHALL** usar ese taller, y `api.test.ts` SHALL pasar sin cambios
5. **WHEN** `pnpm bg:backfill --dry-run` corre contra la base dev después de `pnpm bg:backfill --logo public/brand/vector-bikes-logo.png` **THE SYSTEM SHALL** imprimir `"pending":0` y salir 0
6. **WHEN** se lee `docs/ventanas/bg-v2.md` **THE SYSTEM SHALL** contener `## Precondiciones`, `## Migración de datos en producción`, `## Pasos en Replit` y `## Verificación después de publicar`

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

### `E1-T9` — BG-09 Make shop and branch columns not null

**Depends on:** `E1-T8` · **Priority:** p0

1. `tests/integration/shops-contract.test.ts` primero (`23502` con dos talleres o sucursales; PK compuesta `23505`).
2. `schema.ts`: `.notNull()` en `branches.shopId` y en `bookingBranchReference()`; `booking_days` con `primaryKey({ columns: [t.branchId, t.serviceDate] })`. Los valores por defecto de compatibilidad se conservan.
3. **Dos generaciones (BG-D42):** `pnpm db:generate` con `booking_days` fuera del esquema (NOT NULL + `DROP TABLE`), y otra vez con `booking_days` y su PK compuesta (`CREATE TABLE`); si pregunta, detenerse → pruebas → migrate (después de comprobar la base dev completa) → check.
4. Siembra declarada (no cuenta): `tests/helpers/legacy-db.ts` (`createLegacyTestDb()`, migrada hasta `0038`), `bg-backfill.test.ts`, `shop-config.test.ts` y `shops-schema.test.ts` (filas sin taller o sucursal en esa base) y `email-brand.test.ts` (`branchId` con un id). Valor declarado: `booking-isolation.test.ts` pasa de 1 a 2 filas de `booking_days` (una por taller); paridad con `--skip` de ese archivo.

**Files**
- `src/server/db/schema.ts` — edit
- `tests/integration/shops-contract.test.ts` — new
- `tests/helpers/legacy-db.ts` — new (siembra declarada)
- `tests/integration/bg-backfill.test.ts`, `tests/integration/shop-config.test.ts`, `tests/integration/shops-schema.test.ts`, `tests/unit/email-brand.test.ts` — edit (siembra declarada)
- `tests/integration/booking-isolation.test.ts` — edit (valor declarado)
- `src/server/api/handlers.ts` — edit (`recordAttempt` con la sucursal del taller)
- `tests/integration/{inventory-schema,cash-schema,sales-schema,payments-extension,cash-links-schema,dashboard,work-orders}.test.ts` — edit (siembra declarada: `shop_id` en sus `insert into branches`, sucursal en sus reservas)

Reglas: `database.md`. No negociables 5, 8.

**Acceptance**

1. **WHEN** `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` **THE SYSTEM SHALL** dejar NOT NULL `branches.shop_id` y `branch_id` en las siete tablas de reserva, y la clave primaria de `booking_days` en (`branch_id`, `service_date`), sin borrar columnas; `booking_days`, que solo guarda anclas de bloqueo, se borra y se vuelve a crear con esa clave en una segunda generación (BG-D42)
2. **WHEN** se inserta una sucursal sin `shop_id` en una base con dos talleres **THE SYSTEM SHALL** rechazarla con código `23502`
3. **WHEN** se inserta una reserva sin `branch_id` en una base con dos sucursales **THE SYSTEM SHALL** rechazarla con código `23502`
4. **WHEN** dos sucursales guardan el mismo `service_date` en `booking_days` **THE SYSTEM SHALL** aceptar ambas, y la misma sucursal dos veces SHALL rechazarse con `23505`
5. **WHEN** `pnpm bg:backfill --dry-run` corre antes de migrar la base dev **THE SYSTEM SHALL** imprimir `"pending":0`
6. **WHEN** corre `pnpm test` **THE SYSTEM SHALL** pasar sin cambios en las pruebas existentes

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

### `E1-T10` — BG-10 Make unique indexes per shop

**Depends on:** `E1-T9` · **Priority:** p0

1. `tests/integration/shops-unique.test.ts` primero.
2. `schema.ts`: `uq_bookings_code` (`branchId`, `code`), `uq_booking_blocks_active_slot` (`branchId`, `serviceDate`, `blockStart`) `where is_active = true`, `uq_branches_name` (`shopId`, `name`); `schema-taller.ts`: `uq_customers_rut` (`branchId`, `rut`) `where rut is not null`. Mismos nombres.
3. `pnpm db:generate` → pruebas → migrate → check.

**Files**
- `src/server/db/schema.ts` — edit
- `src/server/db/schema-taller.ts` — edit
- `tests/integration/shops-unique.test.ts` — new

Reglas: `database.md`. No negociables 1, 5.

**Acceptance**

1. **WHEN** `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` **THE SYSTEM SHALL** recrear con el mismo nombre `uq_bookings_code` sobre (`branch_id`, `code`), `uq_booking_blocks_active_slot` sobre (`branch_id`, `service_date`, `block_start`) con `is_active = true`, `uq_branches_name` sobre (`shop_id`, `name`) y `uq_customers_rut` sobre (`branch_id`, `rut`) con `rut is not null`, sin tocar tablas ni columnas
2. **WHEN** Vector Bikes y el Taller Demo reservan la misma fecha y hora **THE SYSTEM SHALL** aceptar ambas reservas
3. **WHEN** la misma sucursal recibe un segundo bloque activo en la misma fecha y hora **THE SYSTEM SHALL** rechazarlo con `23505`
4. **WHEN** dos talleres guardan un cliente con el mismo RUT, o una sucursal con el mismo nombre **THE SYSTEM SHALL** aceptarlo, y en el mismo taller SHALL rechazarlo con `23505` nombrando el índice de siempre
5. **WHEN** corren `foundation.test.ts`, `customers.test.ts`, `users-schema.test.ts` y `concurrency.test.ts` **THE SYSTEM SHALL** pasar sin cambios

**Verify**

```bash
pnpm test tests/integration/shops-unique.test.ts tests/integration/foundation.test.ts tests/integration/customers.test.ts tests/integration/users-schema.test.ts tests/integration/concurrency.test.ts   # expect: exit 0, 0 failed
f="$(ls drizzle/*.sql | sort | tail -1)"; grep -q 'DROP INDEX' "$f" && grep -q 'CREATE UNIQUE INDEX' "$f" && { grep -Eq 'DROP TABLE|DROP COLUMN|CREATE TABLE|RENAME' "$f"; test $? -eq 1; }   # expect: exit 0
pnpm db:migrate   # expect: exit 0
pnpm db:check   # expect: exit 0, {"ok":true,...}
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
u="$(git ls-files --others --exclude-standard)" && test -z "$(printf '%s\n' "$u" | grep -E ' 2(\.[^/]*)?$')"   # expect: exit 0 — sin duplicados de iCloud
git add -- src/server/db/schema.ts src/server/db/schema-taller.ts tests/integration/shops-unique.test.ts drizzle
git commit -m "feat: bg-10 make unique indexes per shop" && git tag bg-10
git tag -l bg-10 | grep -qx bg-10   # expect: exit 0
```

### `E1-T11` — BG-11 Relax booking checks and window V-BG3

**Depends on:** `E1-T10` · **Priority:** p0

1. `tests/integration/shops-checks.test.ts` primero.
2. `schema.ts`: los dos CHECK de "Data model" (salen `Vitacura` y `Las Condes`).
3. `pnpm db:generate` → pruebas → migrate → check.
4. `docs/ventanas/bg-v3.md`: las cuatro migraciones de E1-T9 (dos), T10 y T11 (nombres reales), el aviso de cambio destructivo que mostrará Replit, `## Precondiciones` (`pnpm bg:backfill --dry-run` con `"pending":0` en producción, taller cerrado, respaldo del día), `## Pasos en Replit`, `## Verificación después de publicar`.

**Files**
- `src/server/db/schema.ts` — edit
- `tests/integration/shops-checks.test.ts` — new
- `docs/ventanas/bg-v3.md` — new

Reglas: `database.md`. No negociable 5.

**Acceptance**

1. **WHEN** `pnpm db:migrate` aplica la migración que emite `pnpm db:generate` **THE SYSTEM SHALL** reemplazar solo `bookings_fee_check` y `bookings_retiro_address_check` por sus versiones de §4, con cuatro sentencias `ALTER TABLE`
2. **WHEN** `createBooking` recibe un retiro del Taller Demo en `Ñuñoa` **THE SYSTEM SHALL** guardarlo con `pickup_fee_clp = 9000`
3. **WHEN** se guarda una reserva `taller` con `pickup_fee_clp` 100, o un retiro con comuna vacía o sin dirección **THE SYSTEM SHALL** rechazarla con código `23514`
4. **WHEN** corren `create-booking.test.ts`, `multi-bike-booking.test.ts` y `manual-booking.test.ts` **THE SYSTEM SHALL** pasar sin cambios
5. **WHEN** se lee `docs/ventanas/bg-v3.md` **THE SYSTEM SHALL** nombrar las cuatro migraciones más nuevas de `drizzle/` y contener `## Precondiciones`, `## Pasos en Replit` y `## Verificación después de publicar`

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

### `E1-T12` — BG-12 Scope manual bookings by shop

**Depends on:** `E1-T11` · **Priority:** p0

1. `tests/integration/manual-booking-isolation.test.ts` primero (con `seedTwoShops`; páginas con Container API + `vi.mock` de `getDb`, como `tests/integration/indicadores-page.test.ts`).
2. `manual-booking.ts`: `scopeForBranch(db, actor.branchId)`; zod con comunas, tarifa y retiro de `scope.config` (fuera los literales de las líneas 49 y 77); `createBooking(…, scope)`; `listUpcomingBookings(db, today, days?, branchId?)` y `freeBlocks(…, branchId?)` por sucursal.
3. `reservas/nueva.astro` (fuera los literales de las líneas 181 y 228) y `reservas/index.astro` pasan `user.branchId` y muestran comunas y tarifa de la configuración.

**Files**
- `src/server/taller/manual-booking.ts` — edit
- `src/pages/taller/reservas/nueva.astro` — edit
- `src/pages/taller/reservas/index.astro` — edit
- `tests/integration/manual-booking-isolation.test.ts` — new

Reglas: `server-api.md`, `taller-ui.md`, `shops.md`. No negociables 1, 3.

**Acceptance**

1. **WHEN** el dueño del Taller Demo crea una reserva manual **THE SYSTEM SHALL** guardarla en su sucursal con las comunas, la tarifa y los horarios del Taller Demo
2. **WHEN** el dueño de Vector Bikes elige una comuna del Taller Demo **THE SYSTEM SHALL** rechazarla con el mensaje de comunas de Vector Bikes
3. **WHEN** `listUpcomingBookings` corre con la sucursal de Vector Bikes **THE SYSTEM SHALL** no devolver reservas del Taller Demo
4. **WHEN** se renderiza `/taller/reservas/nueva` para el dueño del Taller Demo **THE SYSTEM SHALL** mostrar `Ñuñoa`, `Providencia` y `$9.000`, sin `Vitacura`
5. **WHEN** se renderiza `/taller/reservas` para cada dueño **THE SYSTEM SHALL** listar solo las reservas de su taller
6. **WHEN** corren `manual-booking.test.ts`, `auditoria-reservas-taller.test.ts`, `bloques-libres-propia-reserva.test.ts` y `multi-bike-list.test.ts` **THE SYSTEM SHALL** pasar sin cambios

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

### `E1-T13` — BG-13 Scope reschedule and admin agenda by branch

**Depends on:** `E1-T12` · **Priority:** p0

1. `tests/integration/admin-agenda-isolation.test.ts` primero.
2. `rescheduleBooking(…, scope?)`: configuración y sucursal del alcance en `readDay`/`readRange` y en las escrituras.
3. `agenda.ts`: `agendaForDate`, `bookingDetail`, `applyAdminAction`, `listUpcomingBlocks`, `createBlock`, `deleteBlock` con `branchId?` al final; filtran por él; `createBlock` lo escribe.
4. `reprogramar.astro` y `admin/reservas/[id].astro` pasan `user.branchId`; una reserva de otra sucursal es 404.

**Files**
- `src/server/booking/reschedule-booking.ts` — edit
- `src/server/admin/agenda.ts` — edit
- `src/pages/taller/reservas/[id]/reprogramar.astro` — edit
- `src/pages/admin/reservas/[id].astro` — edit
- `tests/integration/admin-agenda-isolation.test.ts` — new

Reglas: `server-api.md`, `booking-engine.md`, `shops.md`. No negociable 3.

**Acceptance**

1. **WHEN** `bookingDetail` recibe el id de una reserva del Taller Demo con la sucursal de Vector Bikes **THE SYSTEM SHALL** devolver `null`, y `applyAdminAction` con esa sucursal SHALL no cambiar la fila
2. **WHEN** `agendaForDate` corre con la sucursal de Vector Bikes **THE SYSTEM SHALL** devolver solo reservas de Vector Bikes
3. **WHEN** `rescheduleBooking` mueve una reserva del Taller Demo **THE SYSTEM SHALL** validar contra los horarios y la capacidad del Taller Demo y dejar los bloques nuevos en su sucursal
4. **WHEN** el dueño de Vector Bikes pide `/admin/reservas/<id>` o `/taller/reservas/<id>/reprogramar` de una reserva del Taller Demo **THE SYSTEM SHALL** responder 404
5. **WHEN** corren `admin-panel.test.ts`, `reschedule-booking.test.ts`, `reschedule-page.test.ts` y `reschedule-notification.test.ts` **THE SYSTEM SHALL** pasar sin cambios

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

### `E1-T14` — BG-14 Scope admin month and blocks by branch

**Depends on:** `E1-T13` · **Priority:** p0

1. `tests/integration/admin-month-isolation.test.ts` primero.
2. `monthOverview(db, month, now, scope?)` con configuración y sucursal del alcance.
3. `/admin` y `/admin/bloqueos`: `scopeForBranch(db, user.branchId)` y se lo pasan a `agendaForDate`, `monthOverview`, `listUpcomingBlocks`, `createBlock`, `deleteBlock`.

**Files**
- `src/server/admin/month.ts` — edit
- `src/pages/admin/index.astro` — edit
- `src/pages/admin/bloqueos.astro` — edit
- `tests/integration/admin-month-isolation.test.ts` — new

Reglas: `server-api.md`, `booking-engine.md`, `shops.md`. No cambia: forma de `MonthView`.

**Acceptance**

1. **WHEN** `monthOverview` corre con el alcance de Vector Bikes **THE SYSTEM SHALL** contar solo reservas y bloqueos de Vector Bikes con su capacidad y su horizonte
2. **WHEN** `monthOverview` corre con el alcance del Taller Demo **THE SYSTEM SHALL** marcar llenos los días con 2 bicis
3. **WHEN** el dueño del Taller Demo crea un bloqueo en `/admin/bloqueos` **THE SYSTEM SHALL** guardarlo con su sucursal, y `/admin/bloqueos` de Vector Bikes SHALL no mostrarlo
4. **WHEN** el dueño de Vector Bikes intenta borrar un bloqueo del Taller Demo **THE SYSTEM SHALL** no borrarlo
5. **WHEN** `/admin` se renderiza para cada dueño **THE SYSTEM SHALL** mostrar solo las reservas del día de su taller
6. **WHEN** corren `admin-month.test.ts` y `admin-panel.test.ts` **THE SYSTEM SHALL** pasar sin cambios

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

### `E1-T15` — BG-15 Filter dashboard, indicators and reception bookings by branch

**Depends on:** `E1-T14` · **Priority:** p0

1. `tests/integration/taller-bookings-isolation.test.ts` primero.
2. Toda lectura de `bookings`, `booking_blocks` y `booking_bikes` en `dashboard.ts` (`activeBookings`), `indicators-customers.ts` (`bookingIndicators`), `booking-reception.ts` (`nextBookingReception`) y `orders.ts` (tres lecturas, entre ellas la de `startReception` con `bookingId`) filtra por `actor.branchId`.

**Files**
- `src/server/taller/dashboard.ts` — edit
- `src/server/taller/indicators-customers.ts` — edit
- `src/server/taller/booking-reception.ts` — edit
- `src/server/taller/orders.ts` — edit
- `tests/integration/taller-bookings-isolation.test.ts` — new

Reglas: `taller-domain.md`, `shops.md`. No negociable 13 (recepción en tablet).

**Acceptance**

1. **WHEN** `adminDashboard` corre para el dueño de Vector Bikes **THE SYSTEM SHALL** contar como reservas activas solo las de su sucursal
2. **WHEN** `bookingIndicators` corre para el dueño de Vector Bikes **THE SYSTEM SHALL** no contar reservas del Taller Demo
3. **WHEN** `nextBookingReception` recibe el id de una reserva del Taller Demo con un usuario de Vector Bikes **THE SYSTEM SHALL** devolver `null`
4. **WHEN** `startReception` recibe un `bookingId` de otro taller **THE SYSTEM SHALL** devolver `ok: false` sin crear la orden
5. **WHEN** corren `dashboard.test.ts`, `indicators.test.ts`, `reception.test.ts`, `recepcion-finalizada.test.ts` y `multi-bike-reception.test.ts` **THE SYSTEM SHALL** pasar sin cambios
6. **WHEN** corre `pnpm test:tablet e2e/recepcion-inicio.spec.ts e2e/recepcion-completa.spec.ts` **THE SYSTEM SHALL** pasar

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

### `E1-T16` — BG-16 Scope reminders and WhatsApp by branch

**Depends on:** `E1-T15` · **Priority:** p0

1. `tests/integration/reminders-isolation.test.ts` primero.
2. `sendReminders(db, now, deps?, scope?)`, `sendPendingReminders(…, scope?)` y `listNotices(db, bookingId, branchId?)` filtran por sucursal; `whatsapp_messages` se inserta con el `branch_id` de la reserva; la lectura de reservas de `order-notices.ts` filtra por la sucursal de la orden. Las tareas siguen llamando sin alcance hasta E4-T3.

**Files**
- `src/server/email/reminders.ts` — edit
- `src/server/whatsapp/service.ts` — edit
- `src/server/whatsapp/order-notices.ts` — edit
- `tests/integration/reminders-isolation.test.ts` — new

Reglas: `taller-domain.md`, `shops.md`. No negociable 4. No cambia: forma `{ sent, failed }`.

**Acceptance**

1. **WHEN** `sendReminders` corre con el alcance de Vector Bikes **THE SYSTEM SHALL** enviar recordatorios solo de reservas de Vector Bikes de mañana
2. **WHEN** `sendReminders` corre sin alcance en una base con un solo taller **THE SYSTEM SHALL** comportarse como hoy (`reminders.test.ts` y `tasks.test.ts` sin cambios)
3. **WHEN** `sendPendingReminders` de WhatsApp corre con el alcance del Taller Demo **THE SYSTEM SHALL** crear `whatsapp_messages` solo para sus reservas, con su `branch_id`
4. **WHEN** `listNotices` recibe el id de una reserva de otro taller **THE SYSTEM SHALL** devolver una lista vacía
5. **WHEN** corren `whatsapp.test.ts`, `whatsapp-orden.test.ts` y `qc-whatsapp.test.ts` **THE SYSTEM SHALL** pasar sin cambios

**Verify**

```bash
pnpm test tests/integration/reminders-isolation.test.ts tests/integration/reminders.test.ts tests/integration/tasks.test.ts tests/integration/whatsapp.test.ts tests/integration/whatsapp-orden.test.ts tests/integration/qc-whatsapp.test.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts --base 8bca898   # expect: exit 0 — cierre de la etapa 1: ninguna expectativa cambió desde la base
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/server/email/reminders.ts src/server/whatsapp/service.ts src/server/whatsapp/order-notices.ts tests/integration/reminders-isolation.test.ts
git commit -m "feat: bg-16 scope reminders and whatsapp by branch" && git tag bg-16
git tag -l bg-16 | grep -qx bg-16   # expect: exit 0
```
