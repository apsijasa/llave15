BG-19 · Correos de recepción y de retiro con la marca del taller

## Contexto y autorización (Andrés, 18-nov)

Paso 19 de la fase Llave 15 (decisión 57; nombre en BG-D31). BG-18 llevó los seis correos de reserva a `src/server/email/booking/templates.ts` con `brand: EmailBrand` primero. Ahora toca lo mismo con los dos correos de la orden que envían la recepción y el control de calidad: `receivedBikeEmail` y `readyForPickupEmail`, que hoy leen `SITE` y `RECEPTION_HOURS` en `src/server/email/templates.ts`. El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-19 — Correos de recepción y de retiro (E2-T3)"**, y en `tasks.json` (tarea `E2-T3`). Ese texto manda.

Patrón ya construido en BG-18 (léelo y repítelo): `src/server/email/notifications.ts`, función privada que resuelve `profileForBranch(db, booking.branchId)`, arma la marca con `emailBrand(profile)` y el entorno con `EMAIL_FROM: senderFor(profile, env.EMAIL_FROM)` y `EMAIL_REPLY_TO` del taller, y la copia con `sendShopCopy` al `notifyEmail` del taller.

## Lee antes

`AGENTS.md` ("Diseño por paso": los correos siguen el monocromo); `.claude/rules/taller-domain.md`, `.claude/rules/shops.md`; el bloque de BG-19 del blueprint y el párrafo de apertura de la épica 02; `src/server/email/templates.ts`, `src/server/email/booking/templates.ts`, `src/server/email/notifications.ts` (`sendShopCopy` y el patrón de BG-18), `src/server/email/brand.ts`, `src/server/shops/profile.ts`, `src/server/taller/reception.ts` (`notifyReceived`), `src/server/taller/qc.ts` (aviso de lista para retirar), `tests/helpers/shops.ts`, `tests/helpers/two-shops.ts`.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-18`). Prueba nueva primero, en rojo; después el código. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo (incluidas las pruebas de tablet), `pnpm gate` y el Checkpoint con el tag `bg-19`.

## Qué hacer

Cinco archivos escritos a mano:

1. `src/server/email/garage/templates.ts` (nuevo): define y exporta `GarageBrand = EmailBrand & { streetAddress: string; locality: string; receptionHours: WeekHours; certifications: readonly string[] }` y `garageBrand(profile: ShopProfile): GarageBrand`. Mueve ahí `receivedBikeEmail` y `readyForPickupEmail` con `brand: GarageBrand` como **primer** argumento (el segundo, el objeto de la orden de hoy). Nombre, dirección, calle y comuna, horario de recepción (el agrupado de días que hoy hace `receptionHours()` con `RECEPTION_HOURS`, ahora con `brand.receptionHours`), logo, certificaciones y pie salen de la marca. Mueve también los tipos `ReceivedBike` y `ReadyForPickup` (reexpórtalos desde `templates.ts` si algo más los importa).
2. `src/server/email/templates.ts`: queda con el render compartido y lo que aún usan otras plantillas de la orden (cotización, repuesto, mantención: siguen como están hasta BG-20/BG-21). Sale de aquí el uso de `RECEPTION_HOURS` si ya nadie lo necesita.
3. `src/server/taller/reception.ts`: `notifyReceived` resuelve `profileForBranch(db, actor.branchId)` (la orden es de la sucursal del actor), arma `garageBrand(profile)`, crea el transporte con remitente y `Reply-To` del taller (como BG-18) y manda la copia con `sendShopCopy` a `notifyEmail` del taller, después del commit, como hoy.
4. `src/server/taller/qc.ts`: lo mismo para el aviso de lista para retirar.
5. `tests/integration/order-emails-isolation.test.ts` (nuevo): los criterios 1 a 3 con `seedTwoShops` (recepción finalizada y orden lista del Taller Demo; plantillas con la marca de Vector Bikes).

Siembra y firma declaradas (no cuentan; **los únicos cambios permitidos en pruebas existentes**):

- `tests/helpers/shops.ts`: agrega `vectorBikesGarageBrand(): GarageBrand` = `vectorBikesBrand()` + `streetAddress`, `locality`, `receptionHours` y `certifications` de `VECTOR_BIKES_PROFILE`. Nada más cambia en ese archivo.
- `tests/unit/tracking-in-emails.test.ts`: pasa la marca (`vectorBikesGarageBrand()`) como primer argumento e importa las plantillas desde `email/garage/templates.ts`.
- `tests/unit/received-email.test.ts`, `tests/unit/ready-email.test.ts` y `tests/unit/pricing-emails.test.ts`: pasan la marca y **dejan de importar `src/lib/site.ts`**: su `import { SITE }` pasa al accesorio `SITE` de `../helpers/shops.ts`. Si `ready-email.test.ts` importa `RECEPTION_HOURS`, se queda tal cual (lo cambia BG-28).
- `tests/unit/email-brand.test.ts`: pasa a `receivedBikeEmail` y `readyForPickupEmail` una `GarageBrand` armada con los valores de su `vi.mock` de `src/lib/site.ts` (el `vi.mock` sigue hasta BG-20).

En esas pruebas solo cambian imports, el armado de la marca y el primer argumento; **ninguna cola de matcher**, salvo los tres cambios declarados de BG-18: la línea `Gestionado con Llave 15`, el remitente `Vector Bikes · Llave 15 <reservas@send.vectorbikes.cl>` y la URL `/vector-bikes/logo`.

## Riesgo conocido

Si otra prueba existente falla (por ejemplo `received-notification.test.ts`, `ready-notification.test.ts`, `recepcion-finalizada.test.ts`, `qc*.test.ts`), **no la modifiques**: repórtala (archivo, línea, error) y termina el resto. Nunca uses `getDb()` como respaldo: `reception.ts` y `qc.ts` ya reciben `db`.

## No cambiar

- Condiciones de envío, la auditoría `notify.*` (acción, entidad, `details`), el orden "cliente y después copia al taller", el envío después del commit (regla 6) y el `catch` que registra `email.failed` sin datos personales.
- Plantillas de cotización, repuesto y mantención (BG-20, BG-21); plantillas de reserva de BG-18.
- Firmas exportadas fuera de las dos plantillas movidas; `e2e/`, `drizzle/`, el esquema, `package.json` ni el lockfile. No migrar. No leer ni escribir archivos de entorno.
- Regla 14 (ningún dato de un taller en `src/`), No negociable 4 (nada de correos, teléfonos ni tokens en logs), No negociable 13 (recepción y control de calidad se prueban en tablet: los specs existentes deben seguir pasando; los corre Claude).
- Archivos bajo 400 líneas: `reception.ts`, `qc.ts`, `templates.ts` y `garage/templates.ts`, cada uno < 400.
- Diseño: el HTML conserva su estructura y estilos de hoy.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; `node scripts/bg-expect-parity.ts --allow 'Llave 15' --allow '/vector-bikes/logo'` → 0; `wc -l` de los cuatro archivos < 400.
2. Claude: el Verify completo del bloque BG-19 (incluido `pnpm test:tablet e2e/recepcion-completa.spec.ts e2e/control-calidad.spec.ts`) y `pnpm gate` → exit 0.

## Reporte

Los archivos con sus líneas, cada cambio en pruebas existentes línea por línea, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
