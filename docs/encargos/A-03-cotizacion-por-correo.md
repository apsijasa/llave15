Cotización por correo desde la orden

## Contexto y autorización (Andrés, 12-nov)

Cuando la bici se recibe sin líneas, "Recibimos tu bicicleta" (`receivedBikeEmail`, `src/server/email/templates.ts`) promete "Te enviaremos el presupuesto después del diagnóstico", y nada en el sistema cumple esa promesa: las líneas se agregan en `src/pages/taller/ordenes/[id]/lineas.astro` (`src/server/taller/items.ts`) y el cliente solo se entera por teléfono. La aprobación por enlace (`src/server/taller/approvals.ts`) sirve para **un** trabajo adicional con **un** precio y mueve la orden a `esperando_aprobacion`; no sirve para informar un presupuesto de varias líneas. Andrés quiere un botón "Enviar cotización por correo" en el detalle de la orden que mande las líneas vigentes con su total y el enlace de seguimiento.

Regístralo como **decisión 50** en `blueprints/vector-taller-f1/blueprint.md` §20.3, con este texto:

> **Cotización por correo desde la orden** (decisión del dueño, 2026-11-12, rama `feat/etapa-a`, encargo `docs/encargos/A-03-cotizacion-por-correo.md`): la cotización inicial es un correo (`quoteEmail`, `src/server/email/order-templates.ts`) con las líneas vigentes, cantidades, precios unitarios, total, fecha estimada de entrega y el enlace de seguimiento, enviado a mano por dueño, administrador o recepción (`approvals.create`) desde el detalle de la orden, en cualquier estado no terminal con al menos una línea vigente y cliente con correo. Se puede reenviar cuando las líneas cambian; cada envío queda en auditoría `notify.quote_sent` con `{ totalClp, items }` y el detalle muestra cuándo salió la última. No exige aprobación por enlace: el adicional sigue siendo la única aprobación formal. Copia al taller con `sendShopCopy`. Sin cambios de esquema. Las plantillas de correo nuevas de la orden viven en `order-templates.ts` porque `templates.ts` está cerca del límite de 400 líneas.

## Lee antes

`AGENTS.md`; `.claude/rules/server-api.md`; `.claude/rules/taller-domain.md`; `.claude/rules/taller-ui.md`.

## Rama y reparto

Rama `feat/etapa-a`, sobre el último commit. Pruebas primero, en rojo; `pnpm format && pnpm check && pnpm test && pnpm build` en verde; sin commits ni push (Claude corre `pnpm gate` y commitea). Commits que hará Claude: `feat: send the order quote by email from the order detail` y `docs: record the emailed quote as decision 50`.

## Reglas de negocio decididas

| Tema | Regla |
|---|---|
| Permiso | `can(actor.role, "approvals.create")` (dueño, administrador, recepción). El mecánico recibe `forbidden` en el servidor y no ve el botón. |
| Cuándo se puede | Orden de la sucursal, no anulada, estado fuera de `TERMINAL_STATUSES`, al menos una línea vigente (`listItems` no vacío) y `customers.email` no nulo. Si no: `invalid_status`, `no_items` o `no_email`, sin enviar nada. |
| Contenido | Asunto `Cotización · OT-00001 · Vector Bikes`. Encabezado "Tu cotización". Intro `Hola <primer nombre>,` y "Este es el presupuesto de tu bicicleta. Si estás de acuerdo, respóndenos por este correo o por WhatsApp y empezamos.". Filas: Orden, Bicicleta, una fila por línea (`descripción` → `n × $precio`), "Total" (`formatClp`), "Entrega estimada" si existe (mismo formato que `receivedBikeEmail`). Enlace "Ver el estado de tu bicicleta" con la URL de seguimiento si `ensureTrackingLink` la devuelve. Notas: la misma `EXTRA_WORK_NOTE` que usan los correos de reserva (si no está exportada, copiar el texto literal en `order-templates.ts`; no exportarla). |
| Envío | Fuera de toda transacción: `transport.send` al cliente, luego `sendShopCopy`, luego `recordAudit("notify.quote_sent", { totalClp, items: [{ description, quantity, unitPriceClp }] })`. Un fallo del correo devuelve `{ ok: false, code: "send_failed" }` y deja `log.error("email.failed", { kind: "quote", orderId })` sin correo del cliente. |
| Reenvío | Permitido siempre que se cumplan las condiciones; cada envío es una fila de auditoría nueva. |
| Última cotización | `lastQuote` lee la última fila `notify.quote_sent` de la orden en `audit_log` y devuelve `{ at, totalClp }` o `null`. |

## Qué hacer

**`src/server/email/templates.ts` (+2 líneas).** Exportar lo que hoy es privado: `export type EmailContent` y `export function render(subject, content)`. Nada más cambia.

**`src/server/taller/audit.ts` (+1 línea).** Agregar `"notify.quote_sent"` al tipo `AuditAction`, junto a `notify.received`.

**`src/server/email/order-templates.ts` (nuevo).**

```ts
export type QuoteEmail = {
  orderNumber: string; customerName: string; bike: string;
  items: { description: string; quantity: number; unitPriceClp: number }[];
  estimatedDeliveryDate: string | null; trackingUrl: string | null;
};
export function quoteTotalClp(items: QuoteEmail["items"]): number;
export function quoteEmail(input: QuoteEmail): RenderedEmail;
```

Usa `render`, `formatClp`, `escapeHtml` de `templates.ts` y `SITE` de `src/lib/site.ts`; fechas con luxon y `TIMEZONE` como en `receivedBikeEmail`.

**`src/server/taller/quotes.ts` (nuevo, < 150 líneas).**

```ts
export async function sendQuote(db: AppDb, actor: SessionUser, orderId: string, now: Date, deps: NotifyDeps = {}):
  Promise<{ ok: true; totalClp: number } | { ok: false; code: "forbidden" | "not_found" | "invalid_status" | "no_items" | "no_email" | "send_failed" }>;
export async function lastQuote(db: AppDb, actor: SessionUser, orderId: string): Promise<{ at: Date; totalClp: number } | null>;
```

`sendQuote`: permiso → `getOrderHeader(db, actor, orderId)` (`orders.ts`, solo importar) → `canAccessOrder` (`status.ts`) → estado y correo → `listItems(db, actor, orderId)` → `ensureTrackingLink(db, actor, orderId, deps.siteUrl ?? getSiteEnv().PUBLIC_SITE_URL, now)` → `quoteEmail` → envío → copia → auditoría. `NotifyDeps` viene de `src/server/email/notifications.ts`; el transporte se crea como en `reception.ts` (`deps.transport ?? createTransport(deps.env ?? getEmailEnv())`).

**`src/pages/taller/ordenes/[id]/index.astro` (346 líneas tras A-01; queda ≤ 375).**
- `actionSchema` suma `"quote"`; su permiso en el mapa de permisos del POST es `approvals.create`.
- Rama `quote` en el POST: `result = await sendQuote(db, user, id.data, now)`; si ok → 303 a `${PATH}?hecho=cotizacion`; códigos nuevos → 409 con mensajes: `no_items` → "La orden no tiene líneas vigentes para cotizar.", `no_email` → "El cliente no tiene correo registrado.", `send_failed` → "No se pudo enviar el correo. Intenta de nuevo.", `invalid_status` → el mensaje genérico de hoy.
- `?hecho=cotizacion` → `<p role="status">Cotización enviada.</p>`.
- En la tarjeta "Cliente", debajo del bloque "Seguimiento" de A-01, si `can(user.role, "approvals.create")` y la orden no es terminal: `<form method="post" action={PATH}><input type="hidden" name="action" value="quote" /><button class="btn ghost" type="submit">Enviar cotización por correo</button></form>` y, si `lastQuote` devuelve algo, `<p class="small">Última cotización: <fecha es-CL> · <formatClp(totalClp)></p>`.

## No cambiar

- `src/server/taller/approvals.ts`, `items.ts`, `reports.ts`, `orders.ts`, `status.ts`, `tracking.ts`: solo se importan.
- `receivedBikeEmail`, `readyForPickupEmail` y los correos de reservas.
- Estados y transiciones (`rules.ts`), el esquema, `drizzle/`, CSS.
- Fotos por orden: sin tope.
- Ninguna prueba existente.

## Pruebas (primero, verlas fallar)

**`tests/unit/quote-email.test.ts`:** asunto `Cotización · OT-00001 · Vector Bikes`; una fila por línea con `2 × $12.000`; "Total" = suma correcta; con `trackingUrl` el `html` lleva el `href` y el `text` la línea `Ver el estado de tu bicicleta: …`; con `null` no aparece "seguimiento"; `escapeHtml` aplicado a descripciones con `<script>`.

**`tests/integration/quotes.test.ts`** (PGlite, `consoleOutbox`, patrón de `tests/integration/approvals.test.ts` para sembrar orden, cliente, bici y líneas con `addCatalogItem`/`addPartItem`):
- Dueña, orden en `diagnostico` con dos líneas y correo → `{ ok: true, totalClp }`; `consoleOutbox` tiene 2 mensajes (cliente y `Copia · Cotización · …`); la fila `notify.quote_sent` existe con `details.totalClp` y `details.items.length === 2`; `lastQuote` devuelve esa fecha y total.
- Sin líneas vigentes (línea anulada con `voidItem`) → `no_items`, 0 correos, 0 auditoría.
- Sin correo → `no_email`.
- Mecánico → `forbidden`, 0 filas.
- Orden `entregada` → `invalid_status`.
- Transporte que lanza → `send_failed`, 0 auditoría, `log.error` sin correo del cliente.
- Dos envíos seguidos con una línea nueva entre medio → dos filas de auditoría con totales distintos y `lastQuote` devuelve el segundo.
- `afterEach`: ningún `log.*` con correo, teléfono ni RUT.

**`tests/integration/orden-cotizacion-page.test.ts`** (patrón de `tests/integration/users-admin.test.ts`: mock de `getDb`, `loginAdmin` para obtener el token, cookie `vb_admin_session`, `Origin` del sitio en los POST y `vi.useFakeTimers({ toFake: ["Date"] })` al renderizar): POST `action=quote` con `Origin` del sitio como dueña → 303 a `?hecho=cotizacion`; como mecánico → 403; GET como dueña muestra el botón "Enviar cotización por correo"; como mecánico no lo muestra.

Ninguna prueba existente se modifica. Si una falla, detente y reporta con el diff.

## Documentación

- Decisión 50 en §20.3.
- `README.md`, "Operación del taller" → "Etiqueta y trabajo", al final: "Cuando las líneas estén listas, **Enviar cotización por correo** manda al cliente el presupuesto con el total y el enlace de seguimiento; se puede reenviar si cambia."

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0. Claude: `pnpm gate` → exit 0.
2. Con `pnpm dev` y `EMAIL_TRANSPORT=console`: orden con dos líneas → "Enviar cotización por correo" → aviso "Cotización enviada." y el correo en el log con las dos líneas y el total.

## Reporte

La cola de `pnpm check`, `pnpm test` y `pnpm build`, texto plano de una cotización generada en las pruebas, líneas finales de `index.astro`, `templates.ts`, `quotes.ts` y `order-templates.ts`, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
