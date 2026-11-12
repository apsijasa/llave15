Enlace de seguimiento en los correos de la orden

## Contexto y autorización (Andrés, 12-nov)

Desde el encargo A-01 cada orden tiene un enlace público de seguimiento (`src/server/taller/tracking.ts`, decisión 49). Los dos correos que recibe el cliente por su orden siguen sin enlaces: "Recibimos tu bicicleta" (`receivedBikeEmail`, enviado por `notifyReceived` en `src/server/taller/reception.ts`, decisión 40) y "Tu bicicleta está lista para retirar" (`readyForPickupEmail`, enviado por `notifyReadyForPickup` en `src/server/taller/qc.ts`, decisión 38). Andrés quiere que ambos lleven el enlace "Ver el estado de tu bicicleta". La copia al taller (`sendShopCopy`) lo lleva sola, porque sale del mismo `RenderedEmail`.

Amplía la **decisión 49** en `blueprints/vector-taller-f1/blueprint.md` §20.3 agregando al final de su texto esta frase:

> Desde el encargo A-02, "Recibimos tu bicicleta" y "Lista para retirar" llevan el enlace de seguimiento como único enlace: esto reemplaza la cláusula "sin enlaces" de la decisión 40 solo para ese enlace; el checklist, las observaciones y los datos internos siguen sin salir en los correos.

## Lee antes

`AGENTS.md`; `.claude/rules/server-api.md`; `.claude/rules/taller-domain.md`.

## Rama y reparto

Rama `feat/etapa-a`, sobre el último commit. Pruebas primero, en rojo; `pnpm format && pnpm check && pnpm test && pnpm build` en verde; sin commits ni push (Claude corre `pnpm gate` y commitea). Commit que hará Claude: `feat: add the tracking link to the two order emails`.

## Reglas de negocio decididas

| Tema | Regla |
|---|---|
| Campo nuevo | `ReceivedBike` y `ReadyForPickup` ganan `trackingUrl?: string \| null` (opcional, para no cambiar ninguna llamada ni prueba existente). |
| Con enlace | `content.link = { label: "Ver el estado de tu bicicleta", href: trackingUrl }`; en el texto plano sale como hoy sale cualquier `link` (`renderText`). |
| Sin enlace (`undefined` o `null`) | El correo es byte a byte el de hoy: mismo `subject`, `html` y `text`. |
| Quién obtiene la URL | `notifyReceived` y `notifyReadyForPickup` llaman `ensureTrackingLink(db, actor, orderId, siteUrl, now)` antes de armar el correo, con `siteUrl = deps.siteUrl ?? getSiteEnv().PUBLIC_SITE_URL`. Si devuelve `ok: false`, `trackingUrl = null` y el correo sale igual (nunca se pierde un aviso por el enlace). |
| Orden | Primero la fila de `order_tracking_tokens` (idempotente), después el correo. Nada dentro de una transacción. |
| Auditoría | Sin cambios: `notify.received` y `notify.ready_for_pickup` siguen dependiendo solo del correo al cliente. |

## Qué hacer

**`src/server/email/templates.ts` (360 líneas; queda ≤ 372).**
- `export type ReadyForPickup = { …; trackingUrl?: string | null }` y lo mismo en `ReceivedBike`.
- En `receivedBikeEmail` y `readyForPickupEmail`, al armar el `EmailContent`: `...(order.trackingUrl ? { link: { label: "Ver el estado de tu bicicleta", href: order.trackingUrl } } : {})`. Nada más cambia: ni asuntos, ni filas, ni notas.

**`src/server/taller/reception.ts` (`notifyReceived`, +4 líneas).** Antes de `receivedBikeEmail({...})`: `const tracking = await ensureTrackingLink(db, actor, orderId, deps.siteUrl ?? getSiteEnv().PUBLIC_SITE_URL, now);` y pasar `trackingUrl: tracking.ok ? tracking.url : null`. Importar `ensureTrackingLink` de `./tracking.ts` y `getSiteEnv` de `../../lib/env.ts` (ya importa `getEmailEnv` de ahí). `NotifyDeps` ya tiene `siteUrl?` (ver `src/server/email/notifications.ts`).

**`src/server/taller/qc.ts` (`notifyReadyForPickup`, +4 líneas).** Igual que arriba, antes de `readyForPickupEmail({...})`.

## No cambiar

- `src/server/email/notifications.ts`, `sendShopCopy`, `transport.ts`.
- Los correos de reservas (`customerConfirmationEmail`, `bookingRescheduledEmail`, `reminderEmail`, `shop*`): constante del blueprint §1.
- `src/server/taller/tracking.ts` (A-01), `orders.ts`, `reports.ts`, el esquema y `drizzle/`.
- Las pruebas existentes `tests/unit/received-email.test.ts`, `tests/unit/ready-email.test.ts`, `tests/integration/received-notification.test.ts`, `tests/integration/ready-notification.test.ts` y cualquier otra: deben pasar sin tocarlas.
- Fotos por orden: sin tope.

## Pruebas (primero, verlas fallar)

**`tests/unit/tracking-in-emails.test.ts`:**
- `receivedBikeEmail({ …, trackingUrl: "https://vectorbikes.cl/seguimiento/abc" })`: `html` contiene `href="https://vectorbikes.cl/seguimiento/abc"` y "Ver el estado de tu bicicleta"; `text` contiene `Ver el estado de tu bicicleta: https://vectorbikes.cl/seguimiento/abc`.
- Lo mismo para `readyForPickupEmail`.
- Con `trackingUrl: null` y con el campo ausente, `receivedBikeEmail(input)` devuelve un objeto `toEqual` al de hoy (compara contra la llamada sin el campo) y no contiene "seguimiento". Ídem `readyForPickupEmail`.
- La URL se escapa: con `trackingUrl: "https://x.test/?a=1&b=2"` el `html` contiene `&amp;`.

**`tests/integration/tracking-notifications.test.ts`** (patrón de `tests/integration/received-notification.test.ts` y `ready-notification.test.ts`, con `consoleOutbox` y `deps: { transport, siteUrl: "https://vectorbikes.cl" }`):
- Al finalizar una recepción con correo del cliente, `consoleOutbox` tiene 2 mensajes (cliente y copia) y los dos contienen `/seguimiento/`; existe una fila en `order_tracking_tokens` para la orden y su `token_hash` corresponde al token de la URL (`hashShareToken(url.split("/").at(-1))`).
- Al aprobar el control de calidad (orden en `control_calidad`, los 7 puntos `ok`), lo mismo: 2 mensajes con `/seguimiento/` y una sola fila (la misma si ya existía por la recepción).
- Sin correo del cliente: 0 mensajes y 0 filas nuevas de tokens (el enlace solo se crea cuando hay a quién mandarlo).
- `afterEach`: ningún `log.*` con correo, teléfono ni el token.

Ninguna prueba existente se modifica. Si una falla, detente y reporta con el diff.

## Documentación

- Decisión 49 ampliada como se indica arriba.
- `README.md`, "Operación del taller" → donde se describen los correos "Recibimos tu bicicleta" y "Lista para retirar": agregar "Los dos llevan el enlace de seguimiento de la orden."

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0. Claude: `pnpm gate` → exit 0.
2. Con `pnpm dev` y `EMAIL_TRANSPORT=console`: finalizar una recepción y leer en el log el correo con `/seguimiento/`; abrir ese enlace en una ventana privada: 200.

## Reporte

La cola de `pnpm check`, `pnpm test` y `pnpm build`, el texto plano de un correo "Recibimos tu bicicleta" generado en las pruebas, líneas finales de `templates.ts`, `reception.ts` y `qc.ts`, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
