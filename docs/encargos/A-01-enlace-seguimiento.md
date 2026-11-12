Enlace público de seguimiento de la orden

## Contexto y autorización (Andrés, 12-nov)

Hoy el cliente solo tiene dos enlaces públicos de su orden: la aprobación de un adicional (`/aprobacion/[token]`, `src/server/taller/approvals.ts`) y el informe final (`/informe/[token]`, `src/server/taller/reports.ts`). No hay forma de que vea en qué estado va su bici sin llamar al taller. Andrés quiere un enlace de seguimiento por orden, estable, que el taller pueda copiar o mandar por WhatsApp desde el detalle de la orden, y que después (encargo A-02) viaje en los correos "Recibimos tu bicicleta" y "Lista para retirar".

Regístralo como **decisión 49** en `blueprints/vector-taller-f1/blueprint.md` §20.3, con este texto:

> **Enlace público de seguimiento** (decisión del dueño, 2026-11-12, rama `feat/etapa-a`, encargo `docs/encargos/A-01-enlace-seguimiento.md`): cada orden tiene un enlace `/seguimiento/<token>` estable. El token se deriva con HMAC-SHA-256 de `CANCEL_TOKEN_SECRET` sobre `tracking:<orderId>` (32 bytes en base64url, 43 caracteres, pasa `shareTokenSchema`), para poder reemitirlo en correos distintos sin guardarlo en claro; en base queda solo el sha256 en `order_tracking_tokens` (una fila por orden, creada de forma perezosa e idempotente la primera vez que alguien la necesita). La página muestra solo primer nombre, bicicleta (marca y modelo), número de orden, estado actual, línea de tiempo de estados y fecha estimada de entrega; nunca montos, teléfono, correo, RUT, notas ni diagnóstico. Misma defensa que aprobación e informe: el token es la credencial, sin chequeo de `Origin`, rate limit por IP, `no-store`, `noindex`, `no-referrer`. Rotar `CANCEL_TOKEN_SECRET` invalida todos los enlaces, como ya pasa con la cancelación. Una orden anulada responde 404.

## Lee antes

`AGENTS.md`; `.claude/rules/database.md`; `.claude/rules/server-api.md`; `.claude/rules/taller-domain.md`; `.claude/rules/taller-ui.md`; `.claude/rules/e2e.md`.

## Rama y reparto

Rama `feat/etapa-a`, ya creada desde `origin/main` (`a8ddd3f`). Trabaja sobre ella, sin crear otra. Pruebas primero, en rojo; después el código; `pnpm format && pnpm gate` en verde; sin push. Escribe primero y verifica una vez al final. Dos commits: `feat: add the public order tracking link` (esquema, servidor, página pública, detalle, pruebas) y `docs: record the tracking link as decision 49` (blueprint, README, reglas).

## Reglas de negocio decididas

| Tema | Regla |
|---|---|
| Token | `trackingTokenFor(orderId, secret)` = `createHmac("sha256", secret).update(\`tracking:${orderId}\`).digest().toString("base64url")`; 43 caracteres; determinista. `secret` por defecto `getCancelEnv().CANCEL_TOKEN_SECRET`. |
| Fila | `order_tracking_tokens`: una por orden; `token_hash` = `hashShareToken(token)` (sha256 hex, `share-tokens.ts`). Se crea con `insert … onConflictDoNothing` en `ensureTrackingLink`. |
| Quién la crea | Cualquier rol con `orders.edit` y acceso a la orden (`canAccessOrder` de `status.ts`). El mecánico sin acceso recibe `forbidden`. |
| Qué muestra la página | Primer nombre del cliente (`name.trim().split(/\s+/)[0]`), `OT-00001`, marca y modelo de la bici, estado con `STATUS_LABELS`, línea de tiempo de `work_order_status_history` en orden cronológico (solo fecha, estado; nunca `note` ni autor), `estimated_delivery_date` si existe. Si `lista_para_retirar`: dirección y horario del taller desde `SITE` y `RECEPTION_HOURS`. |
| Qué no muestra | Montos, teléfono, correo, RUT, diagnóstico, observaciones, notas, nombre completo, nombre del mecánico. |
| Orden anulada o token desconocido | `viewTrackingByToken` devuelve `null`; la página responde 404 "Enlace no válido" (mismo cuerpo fijo que `/informe`). |
| Línea de tiempo vacía | Si la orden no tiene filas de historial (órdenes antiguas), se muestra una sola entrada "Orden creada" con `created_at`. |
| Rate limit | Igual que `/informe/[token]`: `checkRateLimit` antes de consultar, `recordAttempt` solo en 404. |

## Esquema

En `src/server/db/schema-reports.ts` (hoy 30 líneas; `schema-orders.ts` está en 399 y **no se toca**):

```ts
export const orderTrackingTokens = pgTable(
  "order_tracking_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "restrict" }),
    workOrderId: uuid("work_order_id").notNull().references(() => workOrders.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_order_tracking_tokens_order").on(t.workOrderId),
    uniqueIndex("uq_order_tracking_tokens_hash").on(t.tokenHash),
  ],
);
```

Agregar a `reportTables`. Luego `pnpm db:generate` (debe crear `drizzle/0025_*.sql` con solo esta tabla), `pnpm db:migrate` y `pnpm db:check`, los tres contra la base dev. `drizzle/` no se edita a mano.

## Qué hacer

**`src/server/taller/tracking.ts` (nuevo, < 200 líneas).** Exporta:

```ts
export function trackingTokenFor(orderId: string, secret?: string): string;
export function trackingLink(siteUrl: string, token: string): string;   // new URL(`/seguimiento/${token}`, siteUrl).toString()
export async function ensureTrackingLink(db: AppDb, actor: SessionUser, orderId: string, siteUrl: string, now: Date):
  Promise<{ ok: true; url: string; token: string } | { ok: false; code: "not_found" | "forbidden" }>;
export type TrackingView = {
  orderNumber: string; customerFirstName: string; bike: string; status: OrderStatus; statusLabel: string;
  estimatedDeliveryDate: string | null; isReadyForPickup: boolean; isTerminal: boolean;
  timeline: { at: Date; status: OrderStatus; label: string }[];
};
export async function viewTrackingByToken(db: AppDb, token: string): Promise<TrackingView | null>;
```

- `ensureTrackingLink`: `can(actor.role, "orders.edit")` → `getOrderHeader(db, actor, orderId)` (de `orders.ts`; solo se importa, no se modifica) → `canAccessOrder` → si `order.voidedAt` → `not_found` → insert `onConflictDoNothing` → devuelve la URL. No es transacción ni manda nada.
- `viewTrackingByToken`: `shareTokenSchema.safeParse(token)`; si falla, `null`. Join `order_tracking_tokens` → `work_orders` (mismo `branch_id`, `voided_at is null`) → `customers` → `bikes`; historial con `asc(createdAt)`. Sin `recordAudit`: ver la página no es un cambio.
- Nada de `new Date()` ni `process.env` en este módulo.

**`src/pages/seguimiento/[token].astro` (nuevo).** Copia la estructura de `src/pages/informe/[token].astro`: `prerender = false`, cabeceras `cache-control: no-store`, `referrer-policy: no-referrer`, `x-robots-tag: noindex`, `log.info("tracking.origin", { origin: originForLog(Astro.request) })`, 404 fijo para cualquier método distinto de GET, `checkRateLimit`/`recordAttempt`, `Base` con `title="Seguimiento de tu bicicleta — Vector Bikes"`, `path="/seguimiento"`, `chrome="none"`, `noindex`. Un solo `h1` ("Seguimiento de tu bicicleta" o el mensaje de error). Contenido con `<dl class="data">` para OT, bicicleta, estado y entrega estimada, y un `<ol>` para la línea de tiempo con la entrada actual marcada con el texto "(actual)". Las clases `.status--…` viven en `taller-components.css` y no cargan aquí: el estado va como texto dentro de un `<span>` con borde de 1px `var(--ink)` definido en el `<style>` de la página, solo con tokens de `global.css`, radio 2px, sin sombras. Fechas con `toLocaleDateString("es-CL", { timeZone: "America/Santiago" })`.

**`src/pages/taller/ordenes/[id]/index.astro` (333 líneas → ≤ 350).** Después de `orderDetail` ok, en GET y en POST fallido: `const tracking = await ensureTrackingLink(db, user, id.data, getSiteEnv().PUBLIC_SITE_URL, now)`. En la tarjeta "Cliente", bajo los datos: un bloque

```astro
{tracking.ok && <div class="tracking"><p class="label">Seguimiento</p><p><a href={tracking.url} target="_blank" rel="noopener">{tracking.url}</a></p>{can(user.role, "customers.manage") && <a class="btn ghost" href={whatsappShareLink(customer.phoneE164, `Hola ${firstName}, puedes ver el estado de tu bicicleta en Vector Bikes aquí: ${tracking.url}`)} target="_blank" rel="noopener">Enviar por WhatsApp</a>}</div>}
```

`whatsappShareLink` ya existe en `src/server/taller/approvals.ts`. `firstName` es el primer nombre del cliente. El enlace de texto y el botón son objetivos táctiles ≥ 48px (el `.btn` ya lo cumple; el `<a>` del enlace va en un `<p>` con `padding-block: 12px` en el `<style is:global>` existente de la página, bajo `.taller`).

**`.claude/rules/server-api.md`.** Agregar `"src/pages/seguimiento/**"` al front matter `paths` y, en la viñeta que empieza con "`/aprobacion/[token]` e `/informe/[token]` siguen la misma regla…", incluir `/seguimiento/[token]`.

**`.claude/rules/database.md`.** En la primera viñeta, `schema-reports.ts` pasa de "(informe final, `service_reports`)" a "(lo que el cliente recibe de la orden: `service_reports`, `order_tracking_tokens`)".

## No cambiar

- `src/server/taller/orders.ts` (395 líneas), `reports.ts`, `status.ts`, `approvals.ts`, `share-tokens.ts`, `booking/tokens.ts`: solo se importan.
- `src/server/db/schema-orders.ts`, `schema.ts`, `schema-taller.ts`.
- Los correos (`src/server/email/**`): el enlace entra a los correos en el encargo A-02.
- `src/styles/global.css`, `taller-layout.css`, `taller-components.css`. Ningún hex nuevo.
- Fotos por orden: sin tope, como hoy.
- `e2e/global-setup.ts`, `e2e/fixtures.ts`, `playwright.config.ts`, `drizzle/` a mano, `.env.example`.
- Ninguna prueba existente.

## Pruebas (primero, verlas fallar)

**`tests/integration/tracking.test.ts`** (PGlite con `createTestDb`, sembrado como en `tests/integration/report-page.test.ts`):
- `trackingTokenFor(orderId, "secreto-de-prueba-…")` devuelve 43 caracteres base64url, es igual en dos llamadas y cambia si cambia el secreto o el `orderId`.
- `ensureTrackingLink` dos veces → una sola fila en `order_tracking_tokens`, misma URL, `token_hash` = `hashShareToken(token)`; la URL empieza con `https://vectorbikes.cl/seguimiento/`.
- Mecánico sin acceso a la orden (asignada a otro) → `{ ok: false, code: "forbidden" }` y cero filas.
- Orden de otra sucursal o anulada → `not_found`.
- `viewTrackingByToken` con el token válido → `orderNumber: "OT-00001"`, `customerFirstName: "Ana"`, `bike: "Trek Marlin"`, `statusLabel`, línea de tiempo en orden cronológico tras dos `recordStatusChange`; el objeto no contiene teléfono, correo, RUT ni apellido.
- Token inválido, token de otra orden anulada después de creada, y `null` → `null`.
- `afterEach`: ningún `log.*` con correo, teléfono, RUT ni el token.

**`tests/integration/tracking-page.test.ts`** (patrón de `report-page.test.ts` con `AstroContainer`, mocks de `getDb`):
- GET con token válido → 200, cabeceras `no-store`, `no-referrer`, `x-robots-tag: noindex`, `<meta name="robots" content="noindex">`, un solo `h1`, contiene "OT-00001", "Ana", "Trek Marlin", la etiqueta del estado; no contiene el token, `+569…`, correo, RUT, "María", "Pérez", `<form`, `<header`, `<footer`.
- Token inexistente, malformado y de orden anulada → 404 idénticos en estado, cabeceras y cuerpo con "Enlace no válido".
- Cinco 404 de la misma IP → 429 con `Retry-After: 600`, sin consultar `viewTrackingByToken`; otra IP sigue en 200.
- `POST`, `PUT`, `PATCH`, `DELETE` → el mismo 404 fijo sin consultar.
- Con `lista_para_retirar`, el cuerpo contiene "Av. Kennedy 7666".

**`e2e/seguimiento-enlace.spec.ts`** (solo `@playwright/test` y `e2e/fixtures.ts`; `.tap()`):
- El dueño abre `/taller/ordenes/${SEED.orderListaId}`, ve el `label` "Seguimiento" y un enlace cuyo `href` contiene `/seguimiento/`; abre ese `href` en la misma página con `page.goto`, ve el `h1` "Seguimiento de tu bicicleta", "OT-00003" y "Lista para retirar", y no ve el correo ni el teléfono del cliente sembrado.
- El mecánico abre `/taller/ordenes/${SEED.orderRecibidaId}` y ve el enlace de seguimiento pero **no** el botón "Enviar por WhatsApp".

Ninguna prueba existente se modifica. Si una falla (por ejemplo `foundation.test.ts` al recorrer `reportTables`, o `db-check`), detente y reporta con el diff antes de tocarla.

## Documentación

- Decisión 49 en `blueprints/vector-taller-f1/blueprint.md` §20.3, con el texto de arriba.
- `README.md`, "Operación del taller" → "Etiqueta y trabajo": una línea: "Cada orden tiene un enlace de seguimiento público (solo primer nombre, bici, estado y fecha estimada). Se copia o se manda por WhatsApp desde el detalle de la orden."

## Verificación

1. `pnpm format && pnpm gate` → exit 0.
2. `pnpm db:check` → exit 0 (la tabla nueva aparece).
3. Con `pnpm dev`: entrar como dueño, abrir una orden, copiar el enlace de seguimiento y abrirlo en una ventana privada: 200 con el estado; cambiar una letra del token: 404.

## Reporte

Al terminar, en el resumen final:
- Hash de cada commit y la salida completa del último `pnpm gate`.
- Nombre del archivo de migración generado.
- Lista archivo por archivo de lo creado y lo modificado, con el número de líneas final de `src/pages/taller/ordenes/[id]/index.astro` y de `tracking.ts`.
- Cualquier prueba existente que haya fallado y por qué, sin modificarla.
