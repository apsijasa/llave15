BG-18 · Correos de reserva con la marca del taller

## Contexto y autorización (Andrés, 18-nov)

Paso 18 de la fase Llave 15 (decisión 57; nombre en BG-D31) y primero de la etapa 2 (identidad) que cambia correos. Hoy los seis correos de reserva de `src/server/email/templates.ts` leen `SITE` (`src/lib/site.ts`, siempre Vector Bikes) y `notifications.ts` manda la copia del taller a `SHOP_NOTIFY_EMAIL`. Después de este paso, cada correo de reserva lleva la marca **del taller de la reserva**: remitente `<Taller> · Llave 15 <dirección de EMAIL_FROM>`, `Reply-To` al correo del taller, copia al correo de avisos del taller, nombre, dirección, horario y logo del perfil, y la línea final `Gestionado con Llave 15`. El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-18 — Correos de reserva con la marca del taller (E2-T2)"**, y en `tasks.json` (tarea `E2-T2`). Ese texto manda.

Contexto ya construido en BG-17: `src/server/shops/profile.ts` (`ShopProfile`, `profileForBranch`), `src/server/email/brand.ts` (`EmailBrand`, `emailBrand(profile)`, `senderFor(profile, emailFrom)`) y `src/lib/platform.ts` (`PLATFORM`, con `footerLine: "Gestionado con Llave 15"`). Las reservas tienen `branch_id` NOT NULL (BG-09).

## Lee antes

`AGENTS.md` (sección "Diseño por paso": los correos siguen el monocromo); `.claude/rules/taller-domain.md`, `.claude/rules/shops.md`, `.claude/rules/booking-engine.md`; el encabezado del blueprint (reparto de las pruebas que dejan de importar `src/lib/site.ts`, BG-D13), el bloque de BG-18 y el párrafo de apertura de la épica 02 (tipos de cambio declarados); `src/server/email/templates.ts`, `notifications.ts`, `reminders.ts`, `brand.ts`; `src/server/shops/profile.ts`; `tests/helpers/shops.ts`, `tests/helpers/two-shops.ts`.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-17`). Prueba nueva primero, en rojo; después el código. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo, `pnpm gate` y el Checkpoint con el tag `bg-18`.

## Qué hacer

Cinco archivos escritos a mano:

1. `src/server/email/booking/templates.ts` (nuevo): mueve ahí `customerConfirmationEmail`, `shopNewBookingEmail`, `bookingRescheduledEmail`, `shopRescheduledEmail`, `reminderEmail` y `shopCancellationEmail`, con `brand: EmailBrand` como **primer** argumento (los demás argumentos, en el mismo orden de hoy). Nombre, dirección, horario, logo y pie salen de la marca, no de `SITE`. `reminderEmail` dice `Te recordamos tu reserva en <nombre del taller>.` Los asuntos y el cuerpo quedan iguales a hoy salvo la línea final `Gestionado con Llave 15` en `text` y `html` y la URL del logo (`/vector-bikes/logo`, la `logoPath` de la marca).
2. `src/server/email/templates.ts`: queda con lo compartido (`render`, `escapeHtml`, `formatClp`, filas, etc.) y las plantillas de la orden, que **no cambian en este paso** (siguen con `SITE` hasta BG-19/BG-20). Si las plantillas de reserva necesitan helpers privados, expórtalos desde aquí o dales un parámetro de marca; `render` puede recibir la marca como argumento opcional al final, de modo que las plantillas de la orden sigan igual.
3. `src/server/email/notifications.ts`: resuelve `profileForBranch(db, booking.branchId)` → `emailBrand`; arma `from` con `senderFor(profile, EMAIL_FROM)`, `replyTo` con el correo del taller y la copia al taller con `notifyEmail` (ya no `SHOP_NOTIFY_EMAIL`); el ICS lleva la dirección del perfil. Si alguna función de aviso de reserva hoy no recibe `db`, agrégala como argumento opcional **al final** sin cambiar el orden de los existentes.
4. `src/server/email/reminders.ts`: pasa a `reminderEmail` la marca del taller de cada reserva (perfil por `booking.branchId`; cachéalo por sucursal dentro de la corrida).
5. `tests/integration/booking-emails-isolation.test.ts` (nuevo): los criterios 1 a 4 con `seedTwoShops`.

Siembra y firma declaradas (no cuentan como archivos y **son los únicos cambios permitidos en pruebas existentes**):

- `tests/helpers/shops.ts`: agrega `vectorBikesBrand()` (la `EmailBrand` de Vector Bikes con los valores de `VECTOR_BIKES_PROFILE`) y el accesorio `SITE` con **los mismos campos y valores** que tenía `src/lib/site.ts` en el commit `8bca898` (léelo con `git show 8bca898:src/lib/site.ts`).
- `tests/unit/multi-bike-email.test.ts` y `tests/integration/email.test.ts`: pasan `vectorBikesBrand()` como primer argumento a las plantillas de reserva (y cambian su import a `email/booking/templates.ts`). Nada más.
- `tests/unit/rescheduled-email.test.ts`: pasa la marca y su `import { SITE }` pasa a `../helpers/shops.ts`. Nada más.
- `tests/unit/email-brand.test.ts`: arma la marca con los valores que hoy fija su `vi.mock` de `src/lib/site.ts` y la pasa a las plantillas de reserva; el `vi.mock` **se queda** (la prueba también cubre plantillas de la orden).

En esas pruebas, solo cambian líneas de import, el armado de la marca y el primer argumento de la llamada; **ninguna cola de matcher**, salvo las expectativas declaradas: la línea `Gestionado con Llave 15`, el remitente `Vector Bikes · Llave 15 <reservas@send.vectorbikes.cl>` y la URL `/vector-bikes/logo`.

## Riesgo conocido

Si otra prueba existente (por ejemplo `cancel-flow.test.ts`, `reschedule-notification.test.ts`, `reminders.test.ts`) falla por la nueva marca, **no la modifiques**: repórtala (archivo, línea, error) y termina el resto. Si una prueba sin sucursal no puede resolver el perfil, repórtalo en vez de inventar un respaldo.

## No cambiar

- Asuntos, condiciones de envío y el envío después del commit (regla 6: ningún correo dentro de una transacción). Plantillas de la orden (recepción, retiro, cotización, repuesto, mantención): van en BG-19 y BG-20.
- Firmas exportadas fuera de las seis plantillas de reserva (lo nuevo va al final y es opcional); `e2e/`, `drizzle/`, el esquema, `package.json` ni el lockfile. No migrar. No leer ni escribir archivos de entorno.
- Regla 14 (ningún dato de un taller en `src/`; las plantillas movidas no pueden dejar literales de Vector Bikes), No negociable 4 (nunca registrar correos, teléfonos ni tokens sin redactar).
- Archivos bajo 400 líneas: `src/server/email/templates.ts` y `src/server/email/booking/templates.ts`, cada uno < 400.
- Diseño: el HTML de los correos conserva su estructura y estilos de hoy (monocromo); solo cambia el contenido de marca.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; `node scripts/bg-expect-parity.ts --allow 'Llave 15' --allow '/vector-bikes/logo'` → 0; `wc -l` de las dos plantillas < 400.
2. Claude: el Verify completo del bloque BG-18 y `pnpm gate` → exit 0.

## Reporte

Los archivos con sus líneas, qué cambió en cada prueba existente declarada (línea por línea), la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad con sus `--allow`, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
