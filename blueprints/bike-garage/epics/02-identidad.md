# Epic 02: Identidad

> Después de esta épica el perfil del taller sale de `shops` por la sesión, el token o el `slug`; `SITE` ya no existe (nace `PLATFORM`, Bike Garage); el personal ve Bike Garage en ingreso, menú y títulos; el cliente de cada taller ve la marca de su taller en correos, seguimiento, aprobación, cancelación e informe, con la línea `con Bike Garage`; los correos salen como `<Taller> · Bike Garage`, con `Reply-To` y copias del taller; los tokens de diseño viven en `tokens.css`; el sistema deja de cargar la portada (`AppLayout`, `PublicLayout`); el contenido de la portada de Vector Bikes vive en `web/vector-bikes/src/content/site.ts`; ninguna prueba importa `src/lib/site.ts`; el motor de reservas ya no tiene constantes del taller y la línea base de la guardia es `{}`.

| | |
|---|---|
| **Epic id** | `02-identidad` |
| **Tasks** | `E2-T1` … `E2-T12` (pasos BG-17 … BG-28) |
| **Depends on** | `01-cimientos-multitaller` |
| **Unlocks** | `03-reservas-por-taller` |
| **Parallel with** | ninguna |

You do not need any other file to complete this epic. Everything below is repeated here on purpose.

---

## Stack

Astro 7 SSR · TypeScript 6 · Postgres 16 · Drizzle ORM 0.45 · zod 4 · luxon · Preact (isla de reserva) · Vitest + PGlite · Playwright (tablet 820×1180). `pnpm` 12.4.2; Node 24. Ninguna dependencia nueva.

| Task | Command |
|---|---|
| Formatear | `pnpm format` |
| Test (un archivo) | `pnpm test tests/<carpeta>/<archivo>.test.ts` |
| Prueba de dos talleres | `pnpm test isolation` |
| Paridad con cambios declarados | `node scripts/bg-expect-parity.ts --allow '<texto>'` |
| Build + pruebas del build | `pnpm build && pnpm test:build` |
| Tablet | `pnpm build && pnpm test:tablet e2e/<archivo>.spec.ts` |
| Compuerta | `pnpm gate` |

**Gate:** `pnpm format && pnpm gate`. **Reparto:** Codex implementa y corre solo `pnpm format && pnpm check && pnpm test && pnpm build` (sin red, sin commits); la sesión coordinadora escribe el encargo `docs/encargos/BG-NN-<tema>.md`, corre `test:tablet`, `test:build`, `smoke`, el Verify completo y `gate`, commitea y pone el tag. Reversión: `git reset --hard bg-<anterior>` (esta épica no toca el esquema).

**Reglas transversales de cada tarea:** pruebas primero; ≤ 5 archivos escritos a mano (salvo E2-T11 y E2-T12, excepciones declaradas); las pruebas existentes cambian solo por **firma, siembra o su línea de import** (lista en la tarea) o en los **valores declarados**; **valores esperados que pueden cambiar en esta épica, y solo donde la tarea lo declara:** la línea `con Bike Garage` al pie de correos y páginas del cliente; el remitente `<Taller> · Bike Garage <…>`; los títulos y la marca del personal que pasan a `Bike Garage`; la URL del logo, que pasa de `/brand/vector-bikes-logo.png` a `/vector-bikes/logo`. Los valores de Vector Bikes (nombre, dirección, comunas, tarifas, horarios) no cambian. **Ningún dato de un taller en `src/`**; nunca editar `drizzle/`; correos después del commit; sin PII en logs; ningún hex nuevo; ninguna isla nueva. **Checkpoint:** `git add --` con las rutas del paso (en E2-T11 y E2-T12, `git add -u -- <carpetas>` + los nuevos por nombre); nunca `git add -A`.

**Pruebas que importan `src/lib/site.ts`** (once en `8bca898`, más `tests/unit/vector-bikes-profile.test.ts` de E1-T4): dejan de importarlo en la tarea que toca lo que prueban, **cambiando solo la línea de import o el armado de la marca, nunca la cola de un matcher**. Las que leen `SITE` importan desde E2-T2 el accesorio `SITE` de `tests/helpers/shops.ts` (mismos campos y valores que `src/lib/site.ts` en `8bca898`, copiados con `git show 8bca898:src/lib/site.ts`); las que hacen `vi.mock` de `src/lib/site.ts` arman la marca con los valores del mock y la pasan como argumento, y quitan el `vi.mock` cuando ya nada de lo que prueban usa `SITE`. Reparto: `rescheduled-email` (E2-T2); `received-email`, `ready-email`, `pricing-emails` (E2-T3); `part-added-email` y el `vi.mock` de `email-brand` (E2-T4); `delivery-date-email` (E2-T5); el `vi.mock` de `report-view-brand` (E2-T8); `low-stock`, `lineas-aviso-repuesto`, `tests/build/landing.test.ts` (`whatsappHref`) y `vector-bikes-profile` (E2-T11). Ninguna prueba importa `src/lib/faq.ts`.

**Cobertura de tablet:** E2-T3 corre `e2e/recepcion-completa.spec.ts` y `e2e/control-calidad.spec.ts`; E2-T7 `e2e/seguimiento-enlace.spec.ts`; E2-T8 `e2e/etiqueta.spec.ts`; E2-T11 todo `pnpm test:tablet`.

## Directory subtree

```
src/server/shops/profile.ts · src/server/email/brand.ts · src/lib/platform.ts · src/pages/[slug]/logo.ts   # NEW (E2-T1)
src/server/email/booking/templates.ts                                  # NEW (E2-T2)
src/server/email/templates.ts · notifications.ts · reminders.ts         # edit (E2-T2, T3)
tests/helpers/shops.ts                                                 # edit (E2-T2: SITE de prueba y vectorBikesBrand(); E2-T12: VECTOR_BIKES_BOOKING_CONFIG)
src/server/email/garage/templates.ts                                   # NEW (E2-T3)
src/server/taller/reception.ts · qc.ts                                 # edit (E2-T3)
src/server/email/order-templates.ts · src/server/taller/quotes.ts · part-notice.ts   # edit (E2-T4)
src/server/taller/delivery-notice.ts · maintenance-plan.ts · maintenance.ts           # edit (E2-T5)
src/styles/tokens.css · src/layouts/AppLayout.astro · PublicLayout.astro             # NEW (E2-T6)
src/pages/seguimiento/[token].astro · aprobacion/[token].astro · reservas/cancelar.astro   # edit (E2-T7)
src/pages/informe/[token].astro · src/components/taller/ReportView.astro · taller/ordenes/[id]/informe.astro · src/server/taller/label.ts   # edit (E2-T8)
src/components/islands/{BookingIsland,booking-state,BookingFields}.* · src/components/Landing.astro   # edit (E2-T9)
web/vector-bikes/src/content/site.ts                                   # NEW (E2-T10)
src/layouts/Base.astro · islands/BookingSchedule.tsx · BookingTicket.tsx  # edit (E2-T10)
src/lib/site.ts · src/lib/faq.ts                                       # DELETE (E2-T11) · src/lib/whatsapp.ts NEW
páginas de /taller y /admin con títulos                                # edit (E2-T11, mecánico)
src/server/booking/{rules,config,slots}.ts + importadores de tiempo    # edit (E2-T12, mecánico)
```

## Data model touched here

Ninguna tabla cambia. Se leen de `shops`: `name`, `email`, `notify_email`, `phone`, `phone_display`, `street_address`, `address_short`, `locality`, `region`, `maps_url`, `instagram_url`, `logo_key`, `certifications`, `reception_hours`, `pickup_hours`, `slug` y la configuración de reserva.

## Contracts

**Consumed:** `scopeForBranch`, `singleShopScope`, `BookingScope`, `BookingConfig` (épica 01); `hashCancelToken` (`booking/tokens.ts`); `hashShareToken` (`taller/share-tokens.ts`); `getStorage`; `getEmailEnv`; `formatClp`; `can`.

**Produced:**

| Export | Signature |
|---|---|
| `src/lib/platform.ts` → `PLATFORM` | `{ name: "Bike Garage", domain: "bikegarage.cl", footerLine: "con Bike Garage" } as const` |
| `src/server/shops/profile.ts` → `ShopProfile`, `profileForBranch`, `profileBySlug`, `profileForCancelToken`, `profileForShareToken` | `(db, branchId)`, `(db, slug)`, `(db, token)`, `(db, "seguimiento" \| "informe" \| "aprobacion", token)` → `ShopProfile \| null` |
| `src/server/email/brand.ts` → `EmailBrand`, `emailBrand`, `senderFor` | `emailBrand(profile): EmailBrand` (`shopName`, `replyTo`, `notifyEmail`, `footerLine`, `logoPath`, `addressShort`, `receptionHours`, …); `senderFor(profile, emailFrom): string` |
| plantillas | `customerConfirmationEmail(brand, …)`, `shopNewBookingEmail(brand, …)`, `bookingRescheduledEmail(brand, …)`, `shopRescheduledEmail(brand, …)`, `reminderEmail(brand, …)`, `shopCancellationEmail(brand, …)`, `receivedBikeEmail(brand, order)`, `readyForPickupEmail(brand, order)`, `quoteEmail(brand, input)`, `partAddedEmail(brand, input)`, `deliveryDateChangedEmail(brand, input)`, `maintenanceReminderEmail(brand, input)` |
| `src/layouts/AppLayout.astro`, `PublicLayout.astro` | props `title`, `description`, `noindex?`; `PublicLayout` además `profile` ya formateado |
| `booking-state.ts` → `IslandShop`, `ShopContext`, `consentTexts` | `consentTexts(name): [string, string]` |
| `web/vector-bikes/src/content/site.ts` → `VECTOR_BIKES_SITE`, `BOOKING_URL` | datos; solo tipos importados |
| `src/lib/whatsapp.ts` → `whatsappHref` (E2-T11) | la misma firma que tenía en `src/lib/site.ts` |
| `tests/helpers/shops.ts` (siembra) → `SITE` y `vectorBikesBrand()` (E2-T2), `VECTOR_BIKES_BOOKING_CONFIG` (E2-T12) | ayudantes de prueba; `SITE` con los campos y valores de `src/lib/site.ts` en `8bca898` |

## Conventions that bite in this area

- Remitente `<nombre del taller> · Bike Garage <dirección de EMAIL_FROM>` (la dirección es lo que está entre `<>`; si no hay, todo `EMAIL_FROM`); `Reply-To` = correo del taller; copias = correo de avisos del taller.
- Pie `con Bike Garage` en todo correo (cliente y copias) y en `PublicLayout`.
- Las páginas por token resuelven el perfil desde el token, nunca desde la sesión.
- Los componentes nunca importan `src/server/**`: `ReportView` y `PublicLayout` reciben datos ya formateados.
- Títulos del personal con `PLATFORM.name`; textos que van al cliente con el nombre del perfil.
- `global.css` sigue siendo el diseño aprobado: solo sale el bloque `:root` a `tokens.css`, copiado literal.
- Una prueba que deja de importar `src/lib/site.ts` no cambia ninguna expectativa: si `SITE.name` o `SITE.url` aparecen dentro de un matcher, siguen ahí, leídos del accesorio `SITE` de `tests/helpers/shops.ts`.

Full project rules: `CLAUDE.md`. Area rules: `.claude/rules/shops.md`, `taller-domain.md`, `taller-ui.md`, `ui-design.md`, `server-api.md`, `booking-engine.md`.

---

## Tasks

### `E2-T1` — BG-17 Add shop profile, email brand and logo route

**Depends on:** `E1-T16` · **Priority:** p0

1. `tests/integration/shop-profile.test.ts` primero (con `seedTwoShops`; tokens de cancelación, seguimiento, informe y aprobación del Taller Demo; logo con almacenamiento local temporal).
2. `profile.ts`: `ShopProfile` (`shopId`, `slug`, `name`, `email`, `notifyEmail`, `phone`, `phoneDisplay`, `streetAddress`, `addressShort`, `locality`, `region`, `mapsUrl`, `instagramUrl`, `instagramHandle` = `@` + último segmento de `instagram_url`, `logoKey`, `logoPath` = `/<slug>/logo` o `null`, `certifications`, `receptionHours`, `pickupHours`); `profileForBranch`, `profileBySlug`, `profileForCancelToken` (hash de `tokens.ts` contra `bookings.cancel_token_hash`), `profileForShareToken` (hash de `share-tokens.ts` contra `order_tracking_tokens.token_hash`, `service_reports.share_token_hash`, `work_order_approvals.token_hash`).
3. `platform.ts`: `PLATFORM`. `brand.ts`: `EmailBrand`, `emailBrand`, `senderFor`.
4. `src/pages/[slug]/logo.ts`: GET, `prerender = false`; `getStorage()`; 404 sin taller, sin logo o con slug reservado; `cache-control: public, max-age=86400`.

**Files**
- `src/server/shops/profile.ts` — new
- `src/server/email/brand.ts` — new
- `src/lib/platform.ts` — new
- `src/pages/[slug]/logo.ts` — new
- `tests/integration/shop-profile.test.ts` — new

Reglas: `shops.md`, `server-api.md`. RC 14.

**Acceptance**

1. **WHEN** `profileForBranch` recibe la sucursal del Taller Demo **THE SYSTEM SHALL** devolver su nombre, contacto, dirección, horarios, correo de avisos y `instagramHandle` igual a `@tallerdemo`
2. **WHEN** `profileForCancelToken`, o `profileForShareToken` con `seguimiento`, `informe` o `aprobacion`, reciben un token válido de una reserva u orden del Taller Demo **THE SYSTEM SHALL** devolver el perfil del Taller Demo, y con un token desconocido SHALL devolver `null`
3. **WHEN** `senderFor` recibe el perfil `Taller Demo` y `Vector Bikes <reservas@send.vectorbikes.cl>` **THE SYSTEM SHALL** devolver `Taller Demo · Bike Garage <reservas@send.vectorbikes.cl>`
4. **WHEN** `emailBrand` recibe un perfil **THE SYSTEM SHALL** devolver `replyTo` igual al correo del taller, `notifyEmail` igual a su correo de avisos y `footerLine` igual a `con Bike Garage`
5. **WHEN** se pide `GET /vector-bikes/logo` con `logo_key` guardado **THE SYSTEM SHALL** responder 200 con la imagen y `cache-control: public, max-age=86400`, y un taller sin logo o un slug desconocido SHALL responder 404
6. **WHEN** se lee `src/lib/platform.ts` **THE SYSTEM SHALL** exportar `PLATFORM` con `name` igual a `Bike Garage`

**Verify**

```bash
pnpm test tests/integration/shop-profile.test.ts   # expect: exit 0, 0 failed
grep -qF 'name: "Bike Garage"' src/lib/platform.ts   # expect: exit 0
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/server/shops/profile.ts src/server/email/brand.ts src/lib/platform.ts 'src/pages/[slug]/logo.ts' tests/integration/shop-profile.test.ts
git commit -m "feat: bg-17 add shop profile email brand and logo route" && git tag bg-17
git tag -l bg-17 | grep -qx bg-17   # expect: exit 0
```

### `E2-T2` — BG-18 Brand booking emails per shop

**Depends on:** `E2-T1` · **Priority:** p0

1. `tests/integration/booking-emails-isolation.test.ts` primero.
2. Mover `customerConfirmationEmail`, `shopNewBookingEmail`, `bookingRescheduledEmail`, `shopRescheduledEmail`, `reminderEmail` y `shopCancellationEmail` a `src/server/email/booking/templates.ts`, con `brand` primero (nombre, dirección, horario, logo, pie). `templates.ts:257` pasa a `Te recordamos tu reserva en ${brand.shopName}.`.
3. `notifications.ts`: `profileForBranch(db, booking.branchId)`; `from` = `senderFor`, `replyTo`, copia a `notifyEmail`; ICS con la dirección del perfil. `reminders.ts`: la marca de cada reserva.
4. **Siembra declarada:** `tests/helpers/shops.ts` agrega `vectorBikesBrand()` y el accesorio `SITE` (mismos campos y valores que `src/lib/site.ts` en `8bca898`, copiados con `git show 8bca898:src/lib/site.ts`).
5. **Firma declarada:** `tests/unit/multi-bike-email.test.ts` y `tests/integration/email.test.ts` pasan `vectorBikesBrand()` como primer argumento; `tests/unit/rescheduled-email.test.ts` pasa la marca y **deja de importar `src/lib/site.ts`** (su `import { SITE }` pasa a `../helpers/shops.ts`, sin tocar ninguna expectativa); `tests/unit/email-brand.test.ts` arma la marca con los valores que hoy fija su `vi.mock` de `src/lib/site.ts` y la pasa a las plantillas de reserva (el `vi.mock` sigue hasta E2-T4, porque la prueba también cubre plantillas de la orden).
6. **Valores declarados:** línea final `con Bike Garage`; remitente `Vector Bikes · Bike Garage <reservas@send.vectorbikes.cl>`; logo `/vector-bikes/logo`.

**Files**
- `src/server/email/booking/templates.ts` — new
- `src/server/email/templates.ts` — edit
- `src/server/email/notifications.ts` — edit
- `src/server/email/reminders.ts` — edit
- `tests/integration/booking-emails-isolation.test.ts` — new
- Siembra declarada: `tests/helpers/shops.ts` (`vectorBikesBrand()` y accesorio `SITE`) — edit
- Firma declarada: `tests/unit/multi-bike-email.test.ts`, `tests/unit/rescheduled-email.test.ts`, `tests/unit/email-brand.test.ts`, `tests/integration/email.test.ts` — edit

Reglas: `taller-domain.md`. RC 6, 14. No negociable 4.

**Acceptance**

1. **WHEN** una reserva del Taller Demo se crea **THE SYSTEM SHALL** enviar la confirmación al cliente con remitente `Taller Demo · Bike Garage <reservas@send.vectorbikes.cl>`, `Reply-To` igual al correo del Taller Demo, el nombre y la dirección del Taller Demo en el cuerpo y en el ICS, y la línea `con Bike Garage`
2. **WHEN** una reserva del Taller Demo se crea, cancela o reprograma **THE SYSTEM SHALL** mandar la copia al correo de avisos del Taller Demo y no a `SHOP_NOTIFY_EMAIL`
3. **WHEN** una reserva de Vector Bikes se crea **THE SYSTEM SHALL** producir el mismo asunto y cuerpo de hoy más la línea final `con Bike Garage`
4. **WHEN** `reminderEmail` arma el recordatorio de una reserva del Taller Demo **THE SYSTEM SHALL** decir `Te recordamos tu reserva en Taller Demo.`
5. **WHEN** corre `node scripts/bg-expect-parity.ts --allow 'Bike Garage' --allow '/vector-bikes/logo'` **THE SYSTEM SHALL** salir 0
6. **WHEN** se cuentan las líneas de `src/server/email/templates.ts` y `src/server/email/booking/templates.ts` **THE SYSTEM SHALL** tener menos de 400 cada uno

**Verify**

```bash
pnpm test tests/integration/booking-emails-isolation.test.ts tests/integration/email.test.ts tests/unit/multi-bike-email.test.ts tests/unit/rescheduled-email.test.ts tests/unit/email-brand.test.ts tests/integration/cancel-flow.test.ts tests/integration/reschedule-notification.test.ts tests/integration/reminders.test.ts   # expect: exit 0, 0 failed
test "$(wc -l < src/server/email/templates.ts | tr -d ' ')" -lt 400 && test "$(wc -l < src/server/email/booking/templates.ts | tr -d ' ')" -lt 400   # expect: exit 0
node scripts/bg-expect-parity.ts --allow 'Bike Garage' --allow '/vector-bikes/logo'   # expect: exit 0 — solo cambian expectativas declaradas
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/server/email/booking/templates.ts src/server/email/templates.ts src/server/email/notifications.ts src/server/email/reminders.ts tests/integration/booking-emails-isolation.test.ts tests/helpers/shops.ts tests/unit/multi-bike-email.test.ts tests/unit/rescheduled-email.test.ts tests/unit/email-brand.test.ts tests/integration/email.test.ts
git commit -m "feat: bg-18 brand booking emails per shop" && git tag bg-18
git tag -l bg-18 | grep -qx bg-18   # expect: exit 0
```

### `E2-T3` — BG-19 Brand received and ready emails per shop

**Depends on:** `E2-T2` · **Priority:** p0

1. `tests/integration/order-emails-isolation.test.ts` primero.
2. Mover `receivedBikeEmail` y `readyForPickupEmail` a `src/server/email/garage/templates.ts` con `brand` primero (dirección y horario de recepción del perfil en vez de `SITE` y `RECEPTION_HOURS`); `templates.ts` queda con el render compartido.
3. `reception.ts` y `qc.ts`: `profileForBranch(db, order.branchId)`; remitente, `Reply-To` y copia del taller, después del commit.
4. **Firma declarada:** `tests/unit/tracking-in-emails.test.ts` pasa la marca; `tests/unit/received-email.test.ts`, `tests/unit/ready-email.test.ts` y `tests/unit/pricing-emails.test.ts` pasan la marca y **dejan de importar `src/lib/site.ts`** (su `import { SITE }` pasa a `../helpers/shops.ts`, sin tocar ninguna expectativa); `tests/unit/email-brand.test.ts` pasa a `receivedBikeEmail` y `readyForPickupEmail` la marca armada con los valores de su `vi.mock`.
5. **Valores declarados:** los mismos tres de E2-T2.

**Files**
- `src/server/email/garage/templates.ts` — new
- `src/server/email/templates.ts` — edit
- `src/server/taller/reception.ts` — edit
- `src/server/taller/qc.ts` — edit
- `tests/integration/order-emails-isolation.test.ts` — new
- Firma declarada: `tests/unit/received-email.test.ts`, `tests/unit/ready-email.test.ts`, `tests/unit/tracking-in-emails.test.ts`, `tests/unit/pricing-emails.test.ts`, `tests/unit/email-brand.test.ts` — edit

Reglas: `taller-domain.md`. RC 6, 14. No negociable 13.

**Acceptance**

1. **WHEN** se finaliza la recepción de una orden del Taller Demo **THE SYSTEM SHALL** enviar `Recibimos tu bicicleta` con el nombre, la dirección y el horario de recepción del Taller Demo, remitente `Taller Demo · Bike Garage <reservas@send.vectorbikes.cl>` y copia a su correo de avisos
2. **WHEN** una orden del Taller Demo queda lista para retirar **THE SYSTEM SHALL** enviar el aviso con la marca del Taller Demo y la línea `con Bike Garage`
3. **WHEN** las plantillas reciben la marca de Vector Bikes **THE SYSTEM SHALL** producir el mismo `subject`, `html` y `text` de hoy más la línea `con Bike Garage`
4. **WHEN** corre `pnpm test:tablet e2e/recepcion-completa.spec.ts e2e/control-calidad.spec.ts` **THE SYSTEM SHALL** pasar
5. **WHEN** corre `node scripts/bg-expect-parity.ts --allow 'Bike Garage' --allow '/vector-bikes/logo'` **THE SYSTEM SHALL** salir 0
6. **WHEN** se cuentan las líneas de `reception.ts`, `qc.ts`, `templates.ts` y `garage/templates.ts` **THE SYSTEM SHALL** tener menos de 400 cada uno

**Verify**

```bash
pnpm test tests/integration/order-emails-isolation.test.ts tests/unit/received-email.test.ts tests/unit/ready-email.test.ts tests/unit/tracking-in-emails.test.ts tests/unit/pricing-emails.test.ts tests/unit/email-brand.test.ts tests/integration/received-notification.test.ts tests/integration/ready-notification.test.ts   # expect: exit 0, 0 failed
for f in src/server/taller/reception.ts src/server/taller/qc.ts src/server/email/templates.ts src/server/email/garage/templates.ts; do test "$(wc -l < "$f" | tr -d ' ')" -lt 400 || echo "$f"; done | grep -q .; test $? -eq 1   # expect: 1 = ningún archivo llega a 400 → la línea sale 0
pnpm build && pnpm test:tablet e2e/recepcion-completa.spec.ts e2e/control-calidad.spec.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts --allow 'Bike Garage' --allow '/vector-bikes/logo'   # expect: exit 0 — solo cambian expectativas declaradas
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/server/email/garage/templates.ts src/server/email/templates.ts src/server/taller/reception.ts src/server/taller/qc.ts tests/integration/order-emails-isolation.test.ts tests/unit/received-email.test.ts tests/unit/ready-email.test.ts tests/unit/tracking-in-emails.test.ts tests/unit/pricing-emails.test.ts tests/unit/email-brand.test.ts
git commit -m "feat: bg-19 brand received and ready emails per shop" && git tag bg-19
git tag -l bg-19 | grep -qx bg-19   # expect: exit 0
```

### `E2-T4` — BG-20 Brand quote and part added emails per shop

**Depends on:** `E2-T3` · **Priority:** p0

1. `tests/integration/quote-part-emails-isolation.test.ts` primero.
2. `quoteEmail` y `partAddedEmail` con `brand` primero (fuera `SITE.name` de `order-templates.ts:49,145`); `quotes.ts` y `part-notice.ts` resuelven el perfil por la sucursal de la orden.
3. **Firma declarada:** `tests/unit/quote-email.test.ts` y `tests/unit/pricing-emails.test.ts` pasan la marca; `tests/unit/part-added-email.test.ts` pasa la marca y **deja de importar `src/lib/site.ts`** (su `import { SITE }` pasa a `../helpers/shops.ts`, sin tocar ninguna expectativa); `tests/unit/email-brand.test.ts` pasa a `quoteEmail` la marca armada con los valores de su `vi.mock` y, como ya ninguna plantilla que prueba usa `SITE`, **quita el `vi.mock` de `src/lib/site.ts`** (sus expectativas no cambian).
4. **Valores declarados:** los mismos tres de E2-T2.

**Files**
- `src/server/email/order-templates.ts` — edit
- `src/server/taller/quotes.ts` — edit
- `src/server/taller/part-notice.ts` — edit
- `tests/integration/quote-part-emails-isolation.test.ts` — new
- Firma declarada: `tests/unit/quote-email.test.ts`, `tests/unit/part-added-email.test.ts`, `tests/unit/pricing-emails.test.ts`, `tests/unit/email-brand.test.ts` — edit

Reglas: `taller-domain.md`. RC 6, 14. No negociable 17 (sin costos en correos).

**Acceptance**

1. **WHEN** se envía la cotización de una orden del Taller Demo **THE SYSTEM SHALL** usar el nombre del Taller Demo en el asunto y el cuerpo, su remitente y su copia de avisos
2. **WHEN** se agrega un repuesto a una orden del Taller Demo **THE SYSTEM SHALL** enviar `Agregamos un repuesto a tu orden` con la marca del Taller Demo y la línea `con Bike Garage`
3. **WHEN** las dos plantillas reciben la marca de Vector Bikes **THE SYSTEM SHALL** producir el mismo `subject`, `html` y `text` de hoy más la línea `con Bike Garage`
4. **WHEN** corre `node scripts/bg-expect-parity.ts --allow 'Bike Garage' --allow '/vector-bikes/logo'` **THE SYSTEM SHALL** salir 0

**Verify**

```bash
pnpm test tests/integration/quote-part-emails-isolation.test.ts tests/unit/quote-email.test.ts tests/unit/part-added-email.test.ts tests/unit/pricing-emails.test.ts tests/unit/email-brand.test.ts tests/integration/quotes.test.ts tests/integration/part-notice.test.ts   # expect: exit 0, 0 failed
grep -q 'lib/site.ts' tests/unit/email-brand.test.ts tests/unit/part-added-email.test.ts; test $? -eq 1   # expect: 1 = ya no importan ni mockean src/lib/site.ts → la línea sale 0
node scripts/bg-expect-parity.ts --allow 'Bike Garage' --allow '/vector-bikes/logo'   # expect: exit 0 — solo cambian expectativas declaradas
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/server/email/order-templates.ts src/server/taller/quotes.ts src/server/taller/part-notice.ts tests/integration/quote-part-emails-isolation.test.ts tests/unit/quote-email.test.ts tests/unit/part-added-email.test.ts tests/unit/pricing-emails.test.ts tests/unit/email-brand.test.ts
git commit -m "feat: bg-20 brand quote and part added emails per shop" && git tag bg-20
git tag -l bg-20 | grep -qx bg-20   # expect: exit 0
```

### `E2-T5` — BG-21 Brand notices and send one digest per shop

**Depends on:** `E2-T4` · **Priority:** p0

1. `tests/integration/notices-isolation.test.ts` primero.
2. `deliveryDateChangedEmail` y `maintenanceReminderEmail` con `brand` primero; `delivery-notice.ts` y `maintenance-plan.ts` resuelven el perfil de cada orden.
3. `sendOverdueDigest` (`maintenance.ts:91-92`): agrupa por sucursal y manda un correo por taller con atrasos o stock bajo, a su correo de avisos, con su nombre en el asunto; la respuesta conserva `{ ok, overdue, sent, lowStock? }` con los totales.
4. **Firma declarada:** `tests/unit/maintenance-email.test.ts` pasa la marca; `tests/unit/delivery-date-email.test.ts` pasa la marca y **deja de importar `src/lib/site.ts`** (su `import { SITE }` pasa a `../helpers/shops.ts`, sin tocar ninguna expectativa).
5. **Valores declarados:** los mismos tres de E2-T2.

**Files**
- `src/server/email/order-templates.ts` — edit
- `src/server/taller/delivery-notice.ts` — edit
- `src/server/taller/maintenance-plan.ts` — edit
- `src/server/taller/maintenance.ts` — edit
- `tests/integration/notices-isolation.test.ts` — new
- Firma declarada: `tests/unit/delivery-date-email.test.ts`, `tests/unit/maintenance-email.test.ts` — edit

Reglas: `taller-domain.md`. RC 6, 14.

**Acceptance**

1. **WHEN** cambia la fecha de entrega de una orden del Taller Demo **THE SYSTEM SHALL** enviar `Cambiamos la fecha de entrega` con la marca del Taller Demo y copia a su correo de avisos
2. **WHEN** se envía el recordatorio de mantención de una orden del Taller Demo **THE SYSTEM SHALL** usar el nombre y el remitente del Taller Demo
3. **WHEN** `sendOverdueDigest` corre con órdenes atrasadas en los dos talleres **THE SYSTEM SHALL** enviar dos correos, cada uno a su correo de avisos y solo con sus órdenes
4. **WHEN** `sendOverdueDigest` corre con un solo taller **THE SYSTEM SHALL** responder como hoy (`tasks-maintenance.test.ts` y `low-stock.test.ts` sin cambios de valores)
5. **WHEN** corre `node scripts/bg-expect-parity.ts --allow 'Bike Garage' --allow '/vector-bikes/logo'` **THE SYSTEM SHALL** salir 0

**Verify**

```bash
pnpm test tests/integration/notices-isolation.test.ts tests/unit/delivery-date-email.test.ts tests/unit/maintenance-email.test.ts tests/integration/delivery-notice.test.ts tests/integration/maintenance-plan.test.ts tests/integration/tasks-maintenance.test.ts tests/integration/low-stock.test.ts tests/integration/tasks-maintenance-reminders.test.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts --allow 'Bike Garage' --allow '/vector-bikes/logo'   # expect: exit 0 — solo cambian expectativas declaradas
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- src/server/email/order-templates.ts src/server/taller/delivery-notice.ts src/server/taller/maintenance-plan.ts src/server/taller/maintenance.ts tests/integration/notices-isolation.test.ts tests/unit/delivery-date-email.test.ts tests/unit/maintenance-email.test.ts
git commit -m "feat: bg-21 brand notices and send one digest per shop" && git tag bg-21
git tag -l bg-21 | grep -qx bg-21   # expect: exit 0
```

### `E2-T6` — BG-22 Split design tokens and add system layouts

**Depends on:** `E2-T5` · **Priority:** p0

1. `tests/integration/layouts.test.ts` primero (Container API).
2. `tokens.css`: el bloque `:root` (claro y oscuro) de `global.css`, **copiado literal**; `global.css` lo importa al inicio y ya no lo declara.
3. `AppLayout.astro`: `<html lang="es-CL">`, fuentes, `tokens.css` y `global.css`, `title`, `description`, `noindex?`; sin FAQ, JSON-LD, wordmark ni `Base.astro`.
4. `PublicLayout.astro` (sobre `AppLayout`): `profile` formateado (nombre, `logoPath`, dirección, correo); encabezado con logo o nombre; pie con `PLATFORM.footerLine`; `noindex` por defecto.

**Files**
- `src/styles/tokens.css` — new
- `src/styles/global.css` — edit
- `src/layouts/AppLayout.astro` — new
- `src/layouts/PublicLayout.astro` — new
- `tests/integration/layouts.test.ts` — new

Reglas: `ui-design.md`. FASE §9 (ningún color nuevo).

**Acceptance**

1. **WHEN** se lee `src/styles/tokens.css` **THE SYSTEM SHALL** contener los nueve tokens de `:root` en claro y oscuro con los mismos valores que `global.css` tenía en `8bca898`, y `global.css` SHALL importarlo y ya no declararlos
2. **WHEN** se comparan los hex de `global.css` y `tokens.css` con los de `global.css` en `8bca898` **THE SYSTEM SHALL** encontrar exactamente el mismo conjunto
3. **WHEN** se renderiza `PublicLayout` con el perfil del Taller Demo **THE SYSTEM SHALL** mostrar `Taller Demo` en el encabezado, la línea `con Bike Garage` al pie, `noindex` y ningún `application/ld+json`
4. **WHEN** se renderiza `AppLayout` **THE SYSTEM SHALL** no incluir el FAQ, el JSON-LD ni el wordmark de la portada

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

### `E2-T7` — BG-23 Brand token pages per shop

**Depends on:** `E2-T6` · **Priority:** p0

1. `tests/integration/token-pages-isolation.test.ts` primero.
2. Las tres páginas usan `PublicLayout` y el perfil de `profileForShareToken`/`profileForCancelToken` (dirección, horario de recepción, correo); conservan `no-store`, `noindex`, `no-referrer`, `originForLog` y solo el primer nombre.
3. **Valores declarados:** la línea `con Bike Garage` y el cambio de `Base.astro` a `PublicLayout` en esas tres páginas (los títulos siguen `… — <nombre del taller>`, iguales para Vector Bikes).

**Files**
- `src/pages/seguimiento/[token].astro` — edit
- `src/pages/aprobacion/[token].astro` — edit
- `src/pages/reservas/cancelar.astro` — edit
- `tests/integration/token-pages-isolation.test.ts` — new

Reglas: `server-api.md`, `ui-design.md`. RC 10, 14.

**Acceptance**

1. **WHEN** se abre `/seguimiento/<token>` de una orden del Taller Demo **THE SYSTEM SHALL** mostrar el nombre, la dirección y el horario de recepción del Taller Demo, la línea `con Bike Garage`, `no-store`, `noindex` y `no-referrer`, sin ningún dato de Vector Bikes
2. **WHEN** se abre `/aprobacion/<token>` de una propuesta del Taller Demo **THE SYSTEM SHALL** mostrar la marca del Taller Demo
3. **WHEN** se abre `/reservas/cancelar?token=<token>` de una reserva del Taller Demo **THE SYSTEM SHALL** mostrar el correo del Taller Demo como contacto
4. **WHEN** un token no existe **THE SYSTEM SHALL** responder 404 como hoy
5. **WHEN** corren `tracking-page.test.ts`, `approval-page.test.ts`, `cancel-flow.test.ts` y `pnpm test:tablet e2e/seguimiento-enlace.spec.ts` **THE SYSTEM SHALL** pasar, y `node scripts/bg-expect-parity.ts --allow 'Bike Garage'` SHALL salir 0

**Verify**

```bash
pnpm test tests/integration/token-pages-isolation.test.ts tests/integration/tracking-page.test.ts tests/integration/approval-page.test.ts tests/integration/cancel-flow.test.ts   # expect: exit 0, 0 failed
pnpm build && pnpm test:tablet e2e/seguimiento-enlace.spec.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts --allow 'Bike Garage'   # expect: exit 0 — solo cambian expectativas declaradas
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- 'src/pages/seguimiento/[token].astro' 'src/pages/aprobacion/[token].astro' src/pages/reservas/cancelar.astro tests/integration/token-pages-isolation.test.ts
git commit -m "feat: bg-23 brand token pages per shop" && git tag bg-23
git tag -l bg-23 | grep -qx bg-23   # expect: exit 0
```

### `E2-T8` — BG-24 Brand report, label and order texts per shop

**Depends on:** `E2-T7` · **Priority:** p0

1. `tests/integration/report-brand-isolation.test.ts` primero.
2. `ReportView` recibe `brand` formateado (nombre, `addressShort`, correo, teléfono, certificaciones, `logoPath`) en vez de `SITE` (líneas 117-118); `/informe/[token]` usa `PublicLayout` y el perfil del token.
3. `taller/ordenes/[id]/informe.astro`: el texto de WhatsApp (línea 111) usa el nombre del perfil de la sucursal del usuario; título con `PLATFORM.name`. `label.ts:43`: `Etiqueta ${label} — ${PLATFORM.name}`.
4. **Firma declarada:** `tests/integration/report-view-brand.test.ts` pasa a `ReportView` la marca armada con los valores que hoy fija su `vi.mock` de `src/lib/site.ts` y, como `ReportView` ya no usa `SITE`, **quita ese `vi.mock` y deja de importar `src/lib/site.ts`** (sus expectativas no cambian).
5. **Valores declarados:** `con Bike Garage`; logo `/vector-bikes/logo`; títulos del personal `… — Bike Garage` en esa página y en la etiqueta.

**Files**
- `src/pages/informe/[token].astro` — edit
- `src/components/taller/ReportView.astro` — edit
- `src/pages/taller/ordenes/[id]/informe.astro` — edit
- `src/server/taller/label.ts` — edit
- `tests/integration/report-brand-isolation.test.ts` — new
- Firma declarada: `tests/integration/report-view-brand.test.ts` — edit

Reglas: `ui-design.md`, `taller-ui.md`, `server-api.md`. RC 14. No cambia: snapshot v1 del informe.

**Acceptance**

1. **WHEN** se abre `/informe/<token>` de una orden del Taller Demo **THE SYSTEM SHALL** mostrar el nombre, la dirección, el correo, el teléfono y las certificaciones del Taller Demo, su logo si lo tiene, y la línea `con Bike Garage`
2. **WHEN** se abre el informe de una orden de Vector Bikes **THE SYSTEM SHALL** mostrar los mismos datos de hoy, con el logo servido desde `/vector-bikes/logo`
3. **WHEN** el personal del Taller Demo abre `/taller/ordenes/<id>/informe` **THE SYSTEM SHALL** armar el texto de WhatsApp con `en Taller Demo` y titular la página con `— Bike Garage`
4. **WHEN** se genera la etiqueta de una orden **THE SYSTEM SHALL** titularla `Etiqueta <número> — Bike Garage`
5. **WHEN** corren `report-page.test.ts`, `report-view.test.ts`, `report-page-brand.test.ts`, `report-view-brand.test.ts`, `label.test.ts` y `pnpm test:tablet e2e/etiqueta.spec.ts` **THE SYSTEM SHALL** pasar, y `node scripts/bg-expect-parity.ts --allow 'Bike Garage' --allow '/vector-bikes/logo'` SHALL salir 0

**Verify**

```bash
pnpm test tests/integration/report-brand-isolation.test.ts tests/integration/report-page.test.ts tests/integration/report-view.test.ts tests/integration/report-page-brand.test.ts tests/integration/report-view-brand.test.ts tests/integration/label.test.ts tests/integration/informe-mantencion-page.test.ts   # expect: exit 0, 0 failed
grep -q 'lib/site.ts' tests/integration/report-view-brand.test.ts; test $? -eq 1   # expect: 1 = ya no mockea src/lib/site.ts → la línea sale 0
pnpm build && pnpm test:tablet e2e/etiqueta.spec.ts   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts --allow 'Bike Garage' --allow '/vector-bikes/logo'   # expect: exit 0 — solo cambian expectativas declaradas
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- 'src/pages/informe/[token].astro' src/components/taller/ReportView.astro 'src/pages/taller/ordenes/[id]/informe.astro' src/server/taller/label.ts tests/integration/report-brand-isolation.test.ts tests/integration/report-view-brand.test.ts
git commit -m "feat: bg-24 brand report label and order texts per shop" && git tag bg-24
git tag -l bg-24 | grep -qx bg-24   # expect: exit 0
```

### `E2-T9` — BG-25 Pass shop props to the booking island

**Depends on:** `E2-T8` · **Priority:** p0

1. `tests/unit/island-shop.test.ts` primero (funciones puras de `booking-state.ts`; entorno `node`, sin DOM).
2. `booking-state.ts`: `IslandShop` (`slug`, `name`, `addressShort`, `pickupEnabled`, `pickupComunas`, `pickupFeeClp`, `horizonDays`, `blockMinutes`, `codePrefix`, `privacyHref`), `ShopContext` (Preact `createContext`), `consentTexts(name)`; líneas 263, 339 y 347 con el taller.
3. `BookingIsland.tsx` recibe `shop` y provee `ShopContext`; `BookingFields.tsx` (líneas 161, 185, 205) usa comunas y `consentTexts`.
4. `Landing.astro` pasa `shop` armado con `SITE` y las constantes de `rules.ts` (transitorio hasta E2-T10). La isla todavía no envía `taller` (E3-T2).
5. **Firma declarada:** `tests/unit/booking-state.test.ts`.

**Files**
- `src/components/islands/BookingIsland.tsx` — edit
- `src/components/islands/booking-state.ts` — edit
- `src/components/islands/BookingFields.tsx` — edit
- `src/components/Landing.astro` — edit
- `tests/unit/island-shop.test.ts` — new
- Firma declarada: `tests/unit/booking-state.test.ts` — edit

Reglas: `ui-design.md`. RC 14. Ninguna isla nueva.

**Acceptance**

1. **WHEN** `booking-state` arma el formulario con las props del Taller Demo **THE SYSTEM SHALL** ofrecer `Ñuñoa` y `Providencia` como comunas y mostrar el retiro a `$9.000`
2. **WHEN** las props dicen `pickupEnabled: false` **THE SYSTEM SHALL** no ofrecer el retiro
3. **WHEN** `consentTexts` recibe `Taller Demo` **THE SYSTEM SHALL** devolver `Acepto que Taller Demo use estos datos solo para gestionar mi reserva, según el` y `Autorizo que Taller Demo me contacte por WhatsApp al número indicado para coordinar`
4. **WHEN** la portada se construye **THE SYSTEM SHALL** renderizar la isla con los valores de Vector Bikes de hoy (`tests/build/landing.test.ts` sin cambios)
5. **WHEN** corren `booking-state.test.ts` y `node scripts/bg-expect-parity.ts` **THE SYSTEM SHALL** pasar y salir 0

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

### `E2-T10` — BG-26 Move Vector Bikes site content out of src

**Depends on:** `E2-T9` · **Priority:** p0

1. `web/vector-bikes/src/content/site.ts`: `VECTOR_BIKES_SITE` (nombre, direcciones, teléfonos, correo, Instagram y su handle, mapa, certificaciones, FAQ copiado de `src/lib/faq.ts`, títulos y descripciones de `/` y `/privacidad` copiados de `index.astro` y `privacidad.astro`, el texto del aviso de privacidad, `islandShop` con los valores de reserva de hoy y `slug` `vector-bikes`) y `BOOKING_URL = "https://bikegarage.cl/vector-bikes/reservar"`; solo importa tipos, ningún archivo de `src/`.
2. `Base.astro` y `Landing.astro` toman sus datos de `VECTOR_BIKES_SITE` (excepción de frontera BG-D14); `Base.astro` sigue importando `whatsappHref` de `src/lib/site.ts` hasta E2-T11.
3. `BookingSchedule.tsx` (incluida la línea 127) y `BookingTicket.tsx:21` toman nombre, dirección y tarifa de `ShopContext`.

**Files**
- `web/vector-bikes/src/content/site.ts` — new
- `src/layouts/Base.astro` — edit
- `src/components/Landing.astro` — edit
- `src/components/islands/BookingSchedule.tsx` — edit
- `src/components/islands/BookingTicket.tsx` — edit

Reglas: `ui-design.md`. RC 14. No cambia: HTML construido de la portada.

**Acceptance**

1. **WHEN** se lee `web/vector-bikes/src/content/site.ts` **THE SYSTEM SHALL** exportar `VECTOR_BIKES_SITE` con los datos de la portada y de privacidad de hoy y `BOOKING_URL` igual a `https://bikegarage.cl/vector-bikes/reservar`
2. **WHEN** `Base.astro` y `Landing.astro` se renderizan **THE SYSTEM SHALL** tomar sus datos de `VECTOR_BIKES_SITE` y no de `SITE`
3. **WHEN** corre `pnpm build && pnpm test:build` **THE SYSTEM SHALL** pasar sin cambios en `tests/build/landing.test.ts` ni `tests/build/seo.test.ts`
4. **WHEN** `BookingSchedule` y `BookingTicket` se renderizan **THE SYSTEM SHALL** tomar el nombre, la dirección y la tarifa del taller del `ShopContext`
5. **WHEN** se buscan los nueve patrones de la guardia en `Base.astro`, `Landing.astro`, `BookingSchedule.tsx` y `BookingTicket.tsx` **THE SYSTEM SHALL** no encontrar ninguno

**Verify**

```bash
pnpm build && pnpm test:build   # expect: exit 0
test -z "$(grep -lFI -e 'Vector Bikes' -e 'Vitacura' -e 'Las Condes' -e 'Kennedy' -e 'vectorbikes' -e 'vector.bikes' -e '$15.000' -e '85095780' -e '8509 5780' src/layouts/Base.astro src/components/Landing.astro src/components/islands/BookingSchedule.tsx src/components/islands/BookingTicket.tsx)"   # expect: exit 0
grep -Eq '(^|[^_A-Z])SITE\.' src/layouts/Base.astro src/components/Landing.astro; test $? -eq 1   # expect: 1 = ningún uso de la constante SITE (VECTOR_BIKES_SITE no cuenta) → la línea sale 0
grep -qF 'https://bikegarage.cl/vector-bikes/reservar' web/vector-bikes/src/content/site.ts   # expect: exit 0
node scripts/bg-expect-parity.ts   # expect: exit 0 — ninguna expectativa de una prueba existente cambió
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -- web/vector-bikes/src/content/site.ts src/layouts/Base.astro src/components/Landing.astro src/components/islands/BookingSchedule.tsx src/components/islands/BookingTicket.tsx
git commit -m "refactor: bg-26 move vector bikes site content out of src" && git tag bg-26
git tag -l bg-26 | grep -qx bg-26   # expect: exit 0
```

### `E2-T11` — BG-27 Brand staff pages with Bike Garage and remove the site constant (excepción declarada)

**Depends on:** `E2-T10` · **Priority:** p0

1. `src/pages/index.astro`, `src/pages/privacidad.astro`: contenido de `VECTOR_BIKES_SITE`; `src/pages/404.astro`: título `Página no encontrada — Bike Garage` con `PLATFORM.name`.
2. `src/lib/faq.ts` se borra (el FAQ ya está en `VECTOR_BIKES_SITE`); `src/lib/whatsapp.ts` (nuevo) con `whatsappHref` tal cual; `src/lib/site.ts` se borra; `Base.astro` ajusta sus imports.
3. `TallerLayout.astro` sobre `AppLayout`, marca `{PLATFORM.name} · Taller`; `admin/login.astro` sobre `AppLayout`, título `Ingresar — Bike Garage`.
4. Cada página de `/taller` y `/admin` con `— Vector Bikes` literal o `SITE.name` (lista de `blueprint.md` §19.6): en `title=` y en la marca del menú → `PLATFORM.name`; en un texto que va al cliente (WhatsApp, cotización) → nombre de `profileForBranch(db, user.branchId)`.
5. **Pruebas existentes de la excepción (firma de import, no cuentan):** las últimas que importan `src/lib/site.ts`. `tests/integration/low-stock.test.ts` y `tests/integration/lineas-aviso-repuesto.test.ts`: su `import { SITE } from "../../src/lib/site.ts"` pasa a `import { SITE } from "../helpers/shops.ts"`; `SITE.name` y `SITE.url` siguen dentro de sus expectativas con los mismos valores (las de `low-stock.test.ts` en las líneas 160, 173 y 190), así que ninguna cola de matcher cambia. `tests/build/landing.test.ts`: su import de `whatsappHref` pasa a `../../src/lib/whatsapp.ts`; nada más.
6. **Prueba de esta fase reescrita:** `tests/unit/vector-bikes-profile.test.ts` compara el perfil con `VECTOR_BIKES_SITE` (identidad e `islandShop`: comunas, tarifa, horizonte, bloque, prefijo) y con valores literales en la prueba para horarios, capacidad 4 y antelación 120; ya no importa `src/lib/site.ts` ni `src/server/booking/rules.ts` (E2-T12 no la toca). Va con `--skip` en la paridad.
7. **Valores declarados:** títulos `… — Vector Bikes` y `… · Vector Bikes` del personal y del ingreso → `Bike Garage`; marca del menú `Vector Bikes · Taller` → `Bike Garage · Taller`; título del 404 → `Página no encontrada — Bike Garage`; y las expectativas de `tests/unit/vector-bikes-profile.test.ts`.

**Files**
- `src/pages/index.astro`, `src/pages/privacidad.astro`, `src/pages/404.astro` — edit
- `src/lib/faq.ts`, `src/lib/site.ts` — delete
- `src/lib/whatsapp.ts` — new
- `src/layouts/Base.astro`, `src/layouts/TallerLayout.astro`, `src/pages/admin/login.astro` — edit
- Páginas de `/taller` y `/admin` de la lista de §19.6 — edit (mecánico)
- Firma de import: `tests/integration/low-stock.test.ts`, `tests/integration/lineas-aviso-repuesto.test.ts`, `tests/build/landing.test.ts` — edit
- Reescrita: `tests/unit/vector-bikes-profile.test.ts` — edit

Reglas: `taller-ui.md`, `ui-design.md`, `server-api.md`. RC 14.

**Acceptance**

1. **WHEN** se busca `lib/site.ts` en `src/`, `tests/` y `e2e/` **THE SYSTEM SHALL** no encontrar ningún importador, y `src/lib/site.ts` y `src/lib/faq.ts` SHALL no existir
2. **WHEN** se renderiza una página de `/taller` o `/admin` **THE SYSTEM SHALL** titularla con `— Bike Garage` y el menú SHALL decir `Bike Garage · Taller`
3. **WHEN** un texto de esas páginas va al cliente **THE SYSTEM SHALL** usar el nombre del taller del perfil de la sucursal del usuario
4. **WHEN** `TallerLayout` y `/admin/login` se renderizan **THE SYSTEM SHALL** usar `AppLayout` y no `Base.astro`
5. **WHEN** corren `pnpm test`, `pnpm test:build` y `pnpm test:tablet` **THE SYSTEM SHALL** pasar, y `node scripts/bg-expect-parity.ts --allow 'Bike Garage' --skip tests/unit/vector-bikes-profile.test.ts` SHALL salir 0
6. **WHEN** se buscan los nueve patrones de la guardia en `src/pages`, `src/layouts` y `src/lib` **THE SYSTEM SHALL** no encontrar ninguno

**Verify**

```bash
test ! -e src/lib/site.ts && test ! -e src/lib/faq.ts   # expect: exit 0
grep -rq 'lib/site.ts' src tests e2e; test $? -eq 1   # expect: 1 = ningún importador en src, tests ni e2e → la línea sale 0
test -z "$(grep -rlFI -e 'Vector Bikes' -e 'Vitacura' -e 'Las Condes' -e 'Kennedy' -e 'vectorbikes' -e 'vector.bikes' -e '$15.000' -e '85095780' -e '8509 5780' src/pages src/layouts src/lib)"   # expect: exit 0
grep -q 'AppLayout' src/layouts/TallerLayout.astro && { grep -q 'Base.astro' src/layouts/TallerLayout.astro; test $? -eq 1; }   # expect: exit 0
pnpm test   # expect: exit 0, 0 failed
pnpm build && pnpm test:build && pnpm test:tablet   # expect: exit 0, 0 failed
node scripts/bg-expect-parity.ts --allow 'Bike Garage' --skip tests/unit/vector-bikes-profile.test.ts   # expect: exit 0 — solo cambian expectativas declaradas
pnpm format && pnpm gate   # expect: exit 0
```

**Checkpoint**

```bash
git add -u -- src tests e2e && git add -- src/lib/whatsapp.ts   # -u: solo archivos ya seguidos (también los borrados); nunca duplicados de iCloud sin seguimiento
git commit -m "feat: bg-27 brand staff pages with bike garage and remove site constant" && git tag bg-27
git tag -l bg-27 | grep -qx bg-27   # expect: exit 0
```

### `E2-T12` — BG-28 Remove shop constants from the booking engine (excepción declarada)

**Depends on:** `E2-T11` · **Priority:** p0

1. `rules.ts`: fuera la reexportación de `TIMEZONE` y `BLOCK_MINUTES`, `DAILY_CAPACITY`, `MIN_NOTICE_MINUTES`, `HORIZON_DAYS`, `PICKUP_FEE_CLP`, `PICKUP_COMUNAS`, `RECEPTION_HOURS`, `PICKUP_HOURS`; quedan `BLOCKS_PER_MODE`, `BookingMode`, `MAX_BIKES_PER_BOOKING`, `blocksFor`, `hoursFor(config, mode, weekday)`.
2. `config.ts`: fuera `LEGACY_BOOKING_CONFIG`. `slots.ts`: configuración obligatoria; ya no reexporta `localToday`, `addDays` ni `localToInstant`.
3. Todo importador de esos cuatro nombres por las rutas antiguas en `src/`, `scripts/`, `tests/` y `e2e/`: solo la línea de import → `src/lib/time.ts`.
4. **Firma declarada:** `tests/unit/{slots,multi-bike-slots,pickup-hours,ready-email}.test.ts` reciben `VECTOR_BIKES_BOOKING_CONFIG` (nuevo en `tests/helpers/shops.ts`); `ready-email` además cambia su import de `RECEPTION_HOURS` a ese accesorio. `tests/unit/shop-literals-baseline.json` → `{}`. `tests/unit/vector-bikes-profile.test.ts` no se toca (ya reescrita en E2-T11).

**Files**
- `src/server/booking/rules.ts`, `src/server/booking/config.ts`, `src/server/booking/slots.ts` — edit
- Importadores de tiempo en `src/`, `scripts/`, `tests/`, `e2e/` — edit (solo imports)
- `tests/helpers/shops.ts`, las cuatro pruebas unitarias del punto 4, `tests/unit/shop-literals-baseline.json` — edit

Reglas: `booking-engine.md`. RC 1, 3.

**Acceptance**

1. **WHEN** se lee `src/server/booking/rules.ts` **THE SYSTEM SHALL** no exportar `TIMEZONE`, `BLOCK_MINUTES`, `DAILY_CAPACITY`, `MIN_NOTICE_MINUTES`, `HORIZON_DAYS`, `PICKUP_FEE_CLP`, `PICKUP_COMUNAS`, `RECEPTION_HOURS` ni `PICKUP_HOURS`, y ningún archivo SHALL mencionar `LEGACY_BOOKING_CONFIG`
2. **WHEN** se llama `computeDay`, `checkStart`, `gridForDate` o `hoursFor` **THE SYSTEM SHALL** exigir la configuración (tipo obligatorio, `pnpm check` en verde)
3. **WHEN** se leen `rules.ts` y `slots.ts` **THE SYSTEM SHALL** no encontrar ninguna reexportación de `TIMEZONE`, `localToday`, `addDays` ni `localToInstant`
4. **WHEN** se lee `tests/unit/shop-literals-baseline.json` **THE SYSTEM SHALL** ser `{}` y `grep -rFoI` con los nueve patrones sobre `src/` SHALL no encontrar nada
5. **WHEN** corre `pnpm test` **THE SYSTEM SHALL** pasar y `node scripts/bg-expect-parity.ts` SHALL salir 0

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
