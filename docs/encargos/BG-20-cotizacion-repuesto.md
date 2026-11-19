BG-20 · Cotización y aviso de repuesto con la marca del taller

## Contexto y autorización (Andrés, 18-nov)

Paso 20 de la fase Llave 15 (decisión 57; nombre en BG-D31). BG-18 y BG-19 llevaron los correos de reserva y los de recepción y retiro a la marca del taller. Ahora toca la cotización (`quoteEmail`) y el aviso de repuesto agregado (`partAddedEmail`) de `src/server/email/order-templates.ts`, que hoy leen `SITE.name` (líneas ~49 y ~145). El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-20 — Cotización y aviso de repuesto (E2-T4)"**, y en `tasks.json` (tarea `E2-T4`). Ese texto manda.

Patrón ya construido (léelo y repítelo): `src/server/taller/reception.ts` y `src/server/taller/qc.ts` desde BG-19 — `profileForBranch(db, actor.branchId)`, la marca del perfil, el entorno con `EMAIL_FROM: senderFor(profile, baseEnv.EMAIL_FROM)`, `EMAIL_REPLY_TO` del taller y `SHOP_NOTIFY_EMAIL: brand.notifyEmail` para `sendShopCopy`. `render` de `src/server/email/templates.ts` recibe la marca como argumento opcional.

## Lee antes

`AGENTS.md` ("Diseño por paso": los correos siguen el monocromo); `.claude/rules/taller-domain.md`, `.claude/rules/shops.md`; el bloque de BG-20 del blueprint y el párrafo de apertura de la épica 02; `src/server/email/order-templates.ts`, `src/server/email/templates.ts`, `src/server/email/brand.ts`, `src/server/email/garage/templates.ts` (patrón de marca primero), `src/server/taller/quotes.ts`, `src/server/taller/part-notice.ts`, `src/server/taller/reception.ts` (patrón de envío), `tests/helpers/shops.ts` (`vectorBikesBrand()`, el accesorio `SITE`), `tests/helpers/two-shops.ts`.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-19`). Prueba nueva primero, en rojo; después el código. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo, `pnpm gate` y el Checkpoint con el tag `bg-20`.

## Qué hacer

Cuatro archivos escritos a mano:

1. `src/server/email/order-templates.ts`: `quoteEmail` y `partAddedEmail` reciben `brand: EmailBrand` como **primer** argumento (el segundo, el objeto de hoy); el nombre del taller del asunto y del cuerpo sale de `brand.shopName` y se pasa la marca a `render` (pie `Gestionado con Llave 15`, logo, dirección). `maintenanceReminderEmail` y `deliveryDateChangedEmail` **no cambian** en este paso (BG-21).
2. `src/server/taller/quotes.ts`: el envío de la cotización resuelve el perfil por la sucursal de la orden (`profileForBranch(db, actor.branchId)`), arma la marca con `emailBrand(profile)` y envía con remitente, `Reply-To` y copia del taller, como `reception.ts`. Si el perfil no existe, el error queda dentro del manejo de error que ya existe.
3. `src/server/taller/part-notice.ts`: lo mismo para el aviso de repuesto agregado.
4. `tests/integration/quote-part-emails-isolation.test.ts` (nuevo): los criterios 1 a 3 con `seedTwoShops`.

Firma declarada (no cuenta; **los únicos cambios permitidos en pruebas existentes**):

- `tests/unit/quote-email.test.ts` y `tests/unit/pricing-emails.test.ts`: pasan `vectorBikesBrand()` como primer argumento a `quoteEmail` y `partAddedEmail`.
- `tests/unit/part-added-email.test.ts`: pasa la marca y **deja de importar `src/lib/site.ts`**: su `import { SITE }` pasa al accesorio `SITE` de `../helpers/shops.ts`.
- `tests/unit/email-brand.test.ts`: pasa a `quoteEmail` la marca armada con los valores de su `vi.mock` y **quita el `vi.mock` de `src/lib/site.ts`** (ya ninguna plantilla que prueba usa `SITE`); sus expectativas no cambian. Si al quitar el `vi.mock` alguna expectativa de esa prueba cambia, **detente y repórtalo** en vez de quitarlo.

En esas pruebas solo cambian imports, el armado de la marca y el primer argumento; **ninguna cola de matcher**, salvo los tres cambios declarados de BG-18: la línea `Gestionado con Llave 15`, el remitente `Vector Bikes · Llave 15 <reservas@send.vectorbikes.cl>` y la URL `/vector-bikes/logo`.

## Riesgo conocido

Si otra prueba existente falla (por ejemplo `quotes.test.ts`, `part-notice.test.ts`), **no la modifiques**: repórtala (archivo, línea, error) y termina el resto. Nunca uses `getDb()` como respaldo: `quotes.ts` y `part-notice.ts` ya reciben `db`.

## No cambiar

- No negociable 17: los correos nunca llevan costos ni márgenes (`cost_clp`, `unit_cost_clp`, `fee_clp`, `net_clp`). Los transportes que redactan (`redactedTransport`, `privateTransport`) siguen envolviendo el envío.
- Condiciones de envío, auditoría, el orden "cliente y después copia al taller", el envío después del commit (regla 6) y el manejo de errores sin datos personales.
- `maintenanceReminderEmail`, `deliveryDateChangedEmail`, las plantillas de BG-18 y BG-19; firmas exportadas fuera de las dos plantillas; `e2e/`, `drizzle/`, el esquema, `package.json` ni el lockfile. No migrar. No leer ni escribir archivos de entorno.
- Regla 14 (ningún dato de un taller en `src/`), No negociable 4. Archivos bajo 400 líneas. Diseño: el HTML conserva su estructura y estilos.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; `node scripts/bg-expect-parity.ts --allow 'Llave 15' --allow '/vector-bikes/logo'` → 0; `grep -q 'lib/site.ts' tests/unit/email-brand.test.ts tests/unit/part-added-email.test.ts` → 1.
2. Claude: el Verify completo del bloque BG-20 y `pnpm gate` → exit 0.

## Reporte

Los archivos con sus líneas, cada cambio en pruebas existentes línea por línea, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
