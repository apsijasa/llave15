BG-21 · Cambio de fecha, mantención y resumen diario por taller

## Contexto y autorización (Andrés, 18-nov)

Paso 21 de la fase Llave 15 (decisión 57; nombre en BG-D31). BG-18 a BG-20 llevaron a la marca del taller los correos de reserva, recepción, retiro, cotización y repuesto. Quedan los dos últimos correos de la orden de `src/server/email/order-templates.ts` (`deliveryDateChangedEmail` y `maintenanceReminderEmail`, que leen `SITE.name`) y el resumen diario `sendOverdueDigest` de `src/server/taller/maintenance.ts`, que hoy junta las órdenes atrasadas y el stock bajo de **todas** las sucursales y los manda en un solo correo a `SHOP_NOTIFY_EMAIL` con `SITE.name` en el asunto. El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-21 — Cambio de fecha, mantención y resumen diario (E2-T5)"**, y en `tasks.json` (tarea `E2-T5`). Ese texto manda.

Patrón ya construido (léelo y repítelo): `src/server/taller/quotes.ts` y `part-notice.ts` desde BG-20 — `profileForBranch(db, …)`, `emailBrand(profile)`, entorno con `EMAIL_FROM: senderFor(profile, baseEnv.EMAIL_FROM)`, `EMAIL_REPLY_TO` del taller y `SHOP_NOTIFY_EMAIL: brand.notifyEmail` para `sendShopCopy`.

## Lee antes

`AGENTS.md`; `.claude/rules/taller-domain.md`, `.claude/rules/shops.md`; el bloque de BG-21 del blueprint y el párrafo de apertura de la épica 02; `src/server/email/order-templates.ts`, `src/server/email/brand.ts`, `src/server/shops/profile.ts`, `src/server/taller/quotes.ts` (patrón), `src/server/taller/delivery-notice.ts`, `src/server/taller/maintenance-plan.ts`, `src/server/taller/maintenance.ts`, `src/server/taller/low-stock.ts` (`lowStockProducts` ya devuelve `branchId`), `tests/helpers/shops.ts`, `tests/helpers/two-shops.ts`, y como referencia de lo que no puede cambiar `tests/integration/tasks-maintenance.test.ts` y `tests/integration/low-stock.test.ts`.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-20`). Prueba nueva primero, en rojo; después el código. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo, `pnpm gate` y el Checkpoint con el tag `bg-21`.

## Qué hacer

Cinco archivos escritos a mano:

1. `src/server/email/order-templates.ts`: `deliveryDateChangedEmail` y `maintenanceReminderEmail` reciben `brand: EmailBrand` como **primer** argumento (el segundo, el objeto de hoy); el nombre del taller sale de `brand.shopName` y la marca va a `render`. Después de este paso, `order-templates.ts` ya no importa `src/lib/site.ts`.
2. `src/server/taller/delivery-notice.ts`: el aviso de cambio de fecha resuelve el perfil por la sucursal de la orden (`actor.branchId`) y envía con remitente, `Reply-To` y copia del taller, como `quotes.ts`.
3. `src/server/taller/maintenance-plan.ts`: el recordatorio de mantención (tarea sin actor) resuelve el perfil **por la sucursal de cada orden** (agrega `branchId` a la fila que ya lee, si hace falta) y envía con el remitente y el `Reply-To` de ese taller; cachea el perfil por sucursal dentro de la corrida. Su respuesta conserva su forma.
4. `src/server/taller/maintenance.ts`: `sendOverdueDigest` agrupa por sucursal las órdenes atrasadas y los productos con stock bajo, y manda **un correo por sucursal** que tenga algo que reportar, a `notifyEmail` de su taller, con el nombre del taller en el asunto (`Órdenes atrasadas: N · <Taller>` o `Stock bajo mínimo: N · <Taller>`, igual que hoy pero por taller), el remitente del taller y el mismo cuerpo de hoy limitado a sus filas, más la línea `Gestionado con Llave 15`. Para agrupar, usa una consulta interna que incluya `branchId`; **`overdueOrders(db, now)` exportada conserva exactamente su forma de fila** (lo afirma `tasks-maintenance.test.ts:269`). La respuesta conserva `{ overdue, sent, lowStock? }` con los **totales** de todos los talleres (`sent: true` si salió al menos un correo). Si un envío falla, intenta los demás talleres y después lanza `OverdueDigestError` con el total de atrasadas, como hoy. Sale de aquí `SITE` y `getEmailEnv().SHOP_NOTIFY_EMAIL`.
5. `tests/integration/notices-isolation.test.ts` (nuevo): los criterios 1 a 3 con `seedTwoShops` (cambio de fecha y mantención del Taller Demo; resumen con atrasos en los dos talleres → dos correos, cada uno a su correo de avisos y solo con sus órdenes).

Firma declarada (no cuenta; **los únicos cambios permitidos en pruebas existentes**):

- `tests/unit/maintenance-email.test.ts`: pasa `vectorBikesBrand()` como primer argumento.
- `tests/unit/delivery-date-email.test.ts`: pasa la marca y **deja de importar `src/lib/site.ts`**: su `import { SITE }` pasa al accesorio `SITE` de `../helpers/shops.ts`.

En esas pruebas solo cambian imports, el armado de la marca y el primer argumento; **ninguna cola de matcher**, salvo los tres cambios declarados de BG-18: la línea `Gestionado con Llave 15`, el remitente `Vector Bikes · Llave 15 <reservas@send.vectorbikes.cl>` y la URL `/vector-bikes/logo`.

## Riesgo conocido

Con un solo taller, el resumen tiene que salir igual que hoy: mismo destinatario (el `notifyEmail` de Vector Bikes es `info@vectorbikes.cl`, igual que `SHOP_NOTIFY_EMAIL` en las pruebas), mismo asunto y mismo cuerpo, más la línea `Gestionado con Llave 15`. Si `tasks-maintenance.test.ts`, `low-stock.test.ts`, `tasks-maintenance-reminders.test.ts`, `delivery-notice.test.ts` o `maintenance-plan.test.ts` fallan, **no los modifiques**: repórtalos (archivo, línea, error) y termina el resto. Si una prueba existente siembra órdenes en sucursales sin taller y el perfil no se puede resolver, repórtalo en vez de inventar un respaldo. Nunca uses `getDb()` como respaldo.

## No cambiar

- La forma de las respuestas (`sendOverdueDigest`, recordatorios de mantención), las condiciones de envío, la auditoría, el envío después del commit (regla 6) y el manejo de errores sin datos personales (No negociable 4).
- Las plantillas de BG-18 a BG-20; firmas exportadas fuera de las dos plantillas (lo nuevo, opcional y al final); `e2e/`, `drizzle/`, el esquema, `package.json` ni el lockfile. No migrar. No leer ni escribir archivos de entorno.
- Regla 14. Archivos bajo 400 líneas. Diseño: el HTML conserva su estructura y estilos.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; `node scripts/bg-expect-parity.ts --allow 'Llave 15' --allow '/vector-bikes/logo'` → 0.
2. Claude: el Verify completo del bloque BG-21 y `pnpm gate` → exit 0.

## Reporte

Los archivos con sus líneas, cada cambio en pruebas existentes línea por línea, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
