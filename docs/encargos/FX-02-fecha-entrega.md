Cambiar la fecha de entrega en cualquier estado y avisar al cliente

## Contexto y autorización (Andrés, 16-nov)

En OT-00003, Andrés cambió la fecha de entrega del 23-oct al 23-nov en la pestaña Recepción y tocó "Confirmar fecha": la fecha no se guardó. Causa (reproducida): `src/pages/taller/ordenes/[id]/recepcion.astro` es un solo formulario que siempre envía los 7 puntos del checklist ya marcados, y antes de cualquier acción llama `saveChecklist` (`src/server/taller/intake.ts`), que solo acepta órdenes `reservada`/`recibida`. En cualquier estado posterior responde `invalid_state` y la acción ("Confirmar fecha", "Agregar accesorio", "Quitar", "Agregar servicio") nunca corre. El aviso sale arriba de la página: "El checklist solo se puede guardar en una orden reservada o recibida."

Andrés quiere:
- Que **dueño, administrador, recepción y mecánico** puedan cambiar la fecha de entrega en cualquier estado no terminal (el mecánico solo en las órdenes a las que ya tiene acceso, `canAccessOrder`).
- Poder cambiarla **en el detalle de la orden** y que la pestaña Recepción también funcione.
- Que el **cliente reciba un correo** cuando la fecha cambia.

Regístralo como **decisión F2-D32** en `blueprints/vector-taller-f2/blueprint.md` §20.3 (nueva fila después de `F2-D31`), con este texto:

> **Cambio de fecha de entrega con aviso al cliente** (decisión del dueño, 2026-11-16, rama `fix/fecha-repuesto-adicional`, encargo `docs/encargos/FX-02-fecha-entrega.md`): la fecha de entrega se cambia en el detalle de la orden (tarjeta "Fecha de entrega", botón "Guardar y avisar al cliente") y en la pestaña Recepción, por cualquier rol con `reception.perform` (dueño, administrador, recepción y mecánico; el mecánico solo en las órdenes a las que tiene acceso), en cualquier estado no terminal. `changeDeliveryDate` (`src/server/taller/delivery-notice.ts`) reutiliza `confirmDeliveryDate` sin cambiarlo y, después del commit, manda al cliente "Cambiamos la fecha de entrega" con la fecha anterior, la nueva y el enlace de seguimiento, con copia al taller, solo si la fecha cambió, la orden ya no está `reservada` (ahí el aviso es "Recibimos tu bicicleta", que lleva la fecha) y el cliente tiene correo; se audita `notify.delivery_date_changed` y no se repite para la misma fecha. La pestaña Recepción solo guarda el checklist mientras la orden está `reservada` o `recibida`: en estados posteriores sus otros botones funcionan sin tocarlo.

## Lee antes

`AGENTS.md`; `.claude/rules/server-api.md`; `.claude/rules/taller-domain.md`; `.claude/rules/taller-ui.md`; `.claude/rules/e2e.md`.

## Rama y reparto

Rama `fix/fecha-repuesto-adicional`, sobre el último commit. Pruebas primero, en rojo; `pnpm format && pnpm check && pnpm test && pnpm build` en verde; sin commits ni push (Claude corre `pnpm gate` y commitea). Escribe primero y verifica una vez al final.

## Reglas de negocio decididas

| Tema | Regla |
|---|---|
| Quién | `can(actor.role, "reception.perform")` (todos los roles) + `canAccessOrder` (mecánico: asignado, o sin asignar en reservada/recibida/diagnóstico). Ya lo hace `confirmDeliveryDate`. |
| Cuándo | Orden no anulada y fuera de `TERMINAL_STATUSES` (`rules.ts`); si no, `not_found` o `invalid_status`. Fecha válida y ≥ hoy (lo valida `confirmDeliveryDate`: `invalid_date`). |
| Aviso | Solo si la fecha nueva ≠ la anterior, la orden ≠ `reservada`, el cliente tiene correo y no existe un `notify.delivery_date_changed` de esa orden con `details.date` igual a la fecha nueva. |
| Correo | Asunto `Cambiamos la fecha de entrega · OT-00001 · ${SITE.name}`. Encabezado "Cambiamos la fecha de entrega". Intro `Hola <primer nombre>,` y "Actualizamos la fecha estimada de entrega de tu bicicleta.". Filas: Orden, Bicicleta, Fecha anterior (si existía), Nueva fecha (formato `d 'de' LLLL 'de' yyyy` en `TIMEZONE`, como `quoteEmail`). Enlace "Ver el estado de tu bicicleta" (`ensureTrackingLink`). Nota: "Si la nueva fecha no te acomoda, responde este correo." |
| Envío | Post-commit, patrón de `notifyReceived` (`src/server/taller/reception.ts`): `try/catch` que solo registra `log.error("email.failed", { kind: "delivery_date", orderId })`; `transport.send` al cliente, `sendShopCopy` (`notifications.ts`), `recordAudit("notify.delivery_date_changed", { date, previousDate })`. Un fallo del correo nunca cambia el resultado: la fecha queda guardada. |
| Resultado | `{ ok: true, notified: boolean }` o `{ ok: false, code }`. |

## Qué hacer

**`src/server/taller/delivery-notice.ts` (nuevo, < 200 líneas).**

```ts
export async function changeDeliveryDate(
  db: AppDb, actor: SessionUser, orderId: string, date: string, now: Date, deps: NotifyDeps = {},
): Promise<{ ok: true; notified: boolean } | { ok: false; code: "forbidden" | "not_found" | "invalid_status" | "invalid_date" }>;
```

Pasos: `getOrderHeader(db, actor, orderId)` (`orders.ts`) → sin fila o `order.voidedAt` → `not_found`; `canAccessOrder` falso → `forbidden`; estado terminal → `invalid_status`; guardar `previousDate = order.estimatedDeliveryDate`; `confirmDeliveryDate(db, actor, orderId, date, now)` (`delivery-date.ts`, **sin cambiarlo**); si no ok, devolver su código; si ok, `notified = await notifyDeliveryDateChanged(...)` con las reglas de la tabla. `NotifyDeps` y `sendShopCopy` de `src/server/email/notifications.ts`; transporte `deps.transport ?? createTransport(deps.env ?? getEmailEnv())`; `siteUrl = deps.siteUrl ?? getSiteEnv().PUBLIC_SITE_URL`.

**`src/server/taller/audit.ts`**: `"notify.delivery_date_changed"` en `AuditAction`.

**`src/server/email/order-templates.ts`**: `export function deliveryDateChangedEmail(input: { orderNumber: string; customerName: string; bike: string; previousDate: string | null; newDate: string; trackingUrl: string | null }): RenderedEmail` con `render` de `templates.ts`.

**`src/pages/taller/ordenes/[id]/recepcion.astro`**:
- Calcula `const checklistOpen = ["reservada", "recibida"].includes(order.status);`. Solo llama `saveChecklist` si `checklistOpen` (o si la acción es `"checklist"`, que en un estado posterior sigue devolviendo su error). En otros estados la validación del checklist (`checklistFormSchema`) tampoco debe bloquear las demás acciones.
- La acción `fecha` llama `changeDeliveryDate(db, user, order.id, input.date, now)`.
- 303 a `?hecho=fecha&avisado=1` cuando `notified`, o `?hecho=fecha` si no. Aviso con `role="status"` dentro de la tarjeta "Fecha de entrega": "Fecha de entrega guardada." y, con `avisado=1`, " Le avisamos al cliente por correo."
- `invalid_status` → "La orden ya está cerrada." El archivo queda < 400 líneas.

**`src/components/taller/DeliveryDateCard.astro` (nuevo).** Props: `action: string` (la URL del POST), `value: string` (fecha actual `yyyy-MM-dd` o vacío), `error?: string`, `saved?: boolean`, `notified?: boolean`. Renderiza una `Card` (`src/components/taller/Card.astro`) titulada "Fecha de entrega" con un `<form method="post">`, `<input type="hidden" name="action" value="fecha">`, `label for="delivery-date"` "Fecha de entrega", `input type="date" name="date"` (sin `min`, igual que Recepción), error con `aria-invalid`/`aria-describedby`, aviso `role="status"` cuando `saved`, y botón `class="btn"` "Guardar y avisar al cliente". No importa `src/server/**`.

**`src/pages/taller/ordenes/[id]/index.astro`** (369 líneas; debe quedar < 400):
- `actionSchema` suma `"fecha"`; su permiso en el mapa del POST es `reception.perform`.
- Rama `fecha`: `deliveryDateSchema` (de `delivery-date.ts`) sobre `form.get("date")`; si ok, `changeDeliveryDate`; 303 a `${PATH}?hecho=fecha` (con `&avisado=1` si `notified`); `invalid_date` y fecha mal formada → 422 "La fecha de entrega debe ser hoy o posterior."; `invalid_status` → 409 "La orden ya está cerrada." (agregar a `messages`).
- Mostrar `<DeliveryDateCard>` dentro de `order-cols`, después de "Bicicleta", si la orden no es terminal y `can(user.role, "reception.perform")`.
- De paso (regla 14 de `CLAUDE.md`): el `title` del `TallerLayout` y el texto de WhatsApp (`trackingText`) escriben "Vector Bikes" literal; pasan a `SITE.name` (`src/lib/site.ts`).

## No cambiar

- `confirmDeliveryDate` y `delivery-date.ts` completo; `saveChecklist` e `intake.ts`; `reception.ts`, `qc.ts`, `tracking.ts`, `notifications.ts`.
- Los correos existentes y `templates.ts` (salvo importar sus exportaciones).
- El esquema y `drizzle/`; `e2e/global-setup.ts`, `e2e/fixtures.ts`, `playwright.config.ts`.
- Ninguna prueba existente (en particular `items.test.ts`, `checklist-no-se-pierde.test.ts`, `recepcion-finalizada.test.ts`, `order-status.test.ts`). Si una falla, detente y reporta con el diff.
- Fotos por orden: sin tope.

## Pruebas (primero, verlas fallar)

- **`tests/unit/delivery-date-email.test.ts`**: asunto con `SITE.name`, filas con ambas fechas en formato largo, sin "Fecha anterior" cuando es `null`, enlace de seguimiento en HTML y texto, escape de HTML en el nombre.
- **`tests/integration/delivery-notice.test.ts`** (PGlite, `consoleOutbox`, patrón de `tests/integration/received-notification.test.ts`): en `diagnostico` con fecha anterior → `{ ok: true, notified: true }`, fecha guardada, 2 correos (cliente y `Copia · Cambiamos la fecha…`) con ambas fechas y auditoría; misma fecha otra vez → `notified: false`, 0 correos; `reservada` → guarda y `notified: false`; `entregada` → `invalid_status` sin cambiar la fecha; mecánico asignado → ok; mecánico no asignado en `en_reparacion` → `forbidden`; cliente sin correo → ok, 0 correos; fecha pasada → `invalid_date`; transporte que lanza → ok, fecha guardada, `log.error` sin el correo del cliente.
- **`tests/integration/recepcion-fecha-estados.test.ts`** (patrón de `tests/integration/recepcion-finalizada.test.ts`, que mockea `requireAdmin` y renderiza la página con `AstroContainer`): con los 7 puntos marcados, "Confirmar fecha" en `diagnostico` y en `en_reparacion` → 303 y fecha nueva guardada (hoy da 409); "Agregar accesorio" en `diagnostico` → 303; "Guardar checklist" en `diagnostico` → sigue en 409 con su mensaje.
- **`tests/integration/orden-fecha-page.test.ts`** (mismo patrón, renderizando `src/pages/taller/ordenes/[id]/index.astro`): dueño, recepción y mecánico asignado → POST `action=fecha` con fecha futura → 303 a `?hecho=fecha`; fecha pasada → 422 con "La fecha de entrega debe ser hoy o posterior."; orden `entregada` → la tarjeta no aparece en el GET; el GET muestra "Fecha de entrega" y "Guardar y avisar al cliente".
- **`e2e/fecha-entrega-orden.spec.ts`** (solo `@playwright/test` y `e2e/fixtures.ts`; `.tap()`): el dueño abre `/taller/ordenes/${SEED.orderControlId}` (estado posterior a recibida en la siembra, no terminal), escribe una fecha 10 días en el futuro (calculada en el spec en `America/Santiago`) en `getByLabel("Fecha de entrega")`, toca "Guardar y avisar al cliente" y ve "Fecha de entrega guardada." y el campo con la fecha nueva. No se puede correr en tu sandbox: déjalo escrito.

## Documentación

- Decisión F2-D32 en §20.3.
- `README.md`, "Operación del taller" → "Etiqueta y trabajo": "La **fecha de entrega** se cambia en el detalle de la orden con **Guardar y avisar al cliente** (también desde la pestaña Recepción). Si la bici ya está en el taller y el cliente tiene correo, recibe el aviso con la fecha anterior y la nueva."

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0.
2. Claude: `pnpm gate` → exit 0, incluido el spec de tablet nuevo.

## Reporte

Lista de archivos creados y modificados con las líneas finales de `index.astro` y `recepcion.astro`, el texto plano de un correo generado en las pruebas, la cola de `pnpm check`, `pnpm test` y `pnpm build`, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
