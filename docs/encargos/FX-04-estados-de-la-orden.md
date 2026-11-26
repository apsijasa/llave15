Estados nuevos de la orden de trabajo (expand)

## Contexto y autorización (Andrés, 26-11-2026)

Hoy la orden tiene 11 estados (`ORDER_STATUSES` en `src/server/taller/rules.ts`): `reservada`, `recibida`, `diagnostico`, `esperando_aprobacion`, `esperando_repuesto`, `en_reparacion`, `control_calidad`, `lista_para_retirar`, `entregada`, `cancelada`, `trabajo_rechazado`, validados en la base por `work_orders_status_check` (`src/server/db/schema-orders.ts`). Andrés quiere que el taller trabaje con estos estados: **Creado, Diagnóstico, Esperando aprobación, En progreso, Esperando repuestos, En pausa, Lista para retirar, Pagado, Retirada** y **Cancelada** como cierre aparte. El estado se sigue eligiendo en el desplegable de la ficha (`src/pages/taller/ordenes/[id]/index.astro`), que solo ofrece los pasos válidos desde el estado actual.

Andrés autoriza por escrito (26-11-2026, esta decisión) **modificar las pruebas existentes** (`tests/**` y `e2e/**`) que usan los estados que desaparecen o sus etiquetas, solo en lo necesario para reflejar la tabla de abajo: ningún otro valor esperado cambia.

Es un cambio destructivo de esquema, así que va en dos publicaciones (`.claude/rules/database.md`: expand → migrar datos → contract). **Este encargo es solo el expand**: la base acepta los estados viejos y los nuevos, el código escribe solo los nuevos y un script traspasa las órdenes existentes. El contract (CHECK solo con los nuevos y retiro de los alias heredados) es otro encargo, después de correr el script en producción.

Regístralo como **decisión BG-D54** en `blueprints/bike-garage/blueprint.md` §20.3 (nueva fila después de `BG-D53`), con este texto:

> **Estados de la orden de trabajo** (decisión del dueño, 2026-11-26, rama `feat/estados-orden`, encargo `docs/encargos/FX-04-estados-de-la-orden.md`): la orden pasa por Creado → Diagnóstico → Esperando aprobación → En progreso ⇄ Esperando repuestos / En pausa → Lista para retirar → Pagado → Retirada, más Cancelada como cierre. Se retiran como estados `reservada`, `recibida` (ambos pasan a `creado`; la recepción terminada se distingue por `received_at`), `en_reparacion` y `control_calidad` (pasan a `en_progreso`; el control de calidad sigue como checklist dentro de En progreso y la base sigue exigiendo `qc_approved_at` para Lista para retirar, Pagado y Retirada) y `trabajo_rechazado` (pasa a `cancelada`; el rechazo del presupuesto por el enlace cancela la orden). Se agregan `en_pausa` y `pagado`. Se paga antes de retirar: la base exige saldo cero en Pagado y Retirada (regla no negociable 10 intacta). Claves internas sin cambio para `diagnostico`, `esperando_aprobacion`, `esperando_repuesto` (etiqueta "Esperando repuestos"), `lista_para_retirar`, `entregada` (etiqueta "Retirada") y `cancelada`. El historial de estados no se reescribe: los valores viejos se muestran con su etiqueta heredada. Expand en este encargo; contract en uno posterior, después de `pnpm orders:remap-status` en producción.

## Lee antes

`AGENTS.md`; `.claude/rules/database.md`; `.claude/rules/server-api.md`; `.claude/rules/taller-domain.md`; `.claude/rules/taller-ui.md`; `.claude/rules/ui-design.md`; `.claude/rules/e2e.md`; `.claude/rules/shops.md` (para el patrón de script de `scripts/bg-backfill.ts`).

## Rama y reparto

Rama `feat/estados-orden` (ya creada, árbol limpio). Pruebas primero, en rojo; `pnpm format && pnpm check && pnpm test && pnpm build` en verde; sin commits ni push. Si cambias el esquema, corre `pnpm db:generate` y anota en el reporte el nombre del archivo generado; **no** corras `pnpm db:migrate`, `db:check`, `test:tablet`, `smoke` ni `gate` (sin red). Escribe primero y verifica una vez al final.

## Reglas de negocio decididas

### Estados (en este orden en `ORDER_STATUSES`)

| Clave | Etiqueta (`STATUS_LABELS`) | Grupo de color | Viene de (órdenes existentes) |
|---|---|---|---|
| `creado` | Creado | neutro | `reservada`, `recibida` |
| `diagnostico` | Diagnóstico | en curso | igual |
| `esperando_aprobacion` | Esperando aprobación | espera | igual |
| `en_progreso` | En progreso | en curso | `en_reparacion`, `control_calidad` |
| `esperando_repuesto` | Esperando repuestos | espera | igual |
| `en_pausa` | En pausa | espera | — (nuevo) |
| `lista_para_retirar` | Lista para retirar | listo | igual |
| `pagado` | Pagado | listo | — (nuevo) |
| `entregada` | Retirada | neutro | igual |
| `cancelada` | Cancelada | neutro | `cancelada`, `trabajo_rechazado` |

`TERMINAL_STATUSES = ["entregada", "cancelada"]`. `MECHANIC_UNASSIGNED_ACCESS_STATUSES = ["creado", "diagnostico"]`. `LOAD_EXCLUDED_STATUSES = ["lista_para_retirar", "pagado", ...TERMINAL_STATUSES]`.

### Transiciones

`ORDER_TRANSITIONS` (todas las permitidas, incluidas las automáticas) y `MANUAL_TRANSITIONS` (las del desplegable y el botón de cancelar):

| Desde | Todas | Manuales (desplegable) | Condición extra en `changeOrderStatus` |
|---|---|---|---|
| `creado` | `diagnostico`, `en_progreso`, `cancelada` | `diagnostico`, `en_progreso`, `cancelada` | a `diagnostico`/`en_progreso` solo con `received_at` no nulo → si no, `{ ok: false, code: "reception_pending" }` |
| `diagnostico` | `esperando_aprobacion`, `esperando_repuesto`, `en_progreso`, `en_pausa`, `cancelada` | `esperando_repuesto`, `en_progreso`, `en_pausa`, `cancelada` | — |
| `esperando_aprobacion` | `en_progreso`, `cancelada` | `cancelada` | — |
| `en_progreso` | `esperando_aprobacion`, `esperando_repuesto`, `en_pausa`, `lista_para_retirar`, `cancelada` | `esperando_repuesto`, `en_pausa`, `cancelada` | `lista_para_retirar` llega solo por el control de calidad aprobado |
| `esperando_repuesto` | `esperando_aprobacion`, `en_progreso`, `en_pausa`, `cancelada` | `en_progreso`, `en_pausa`, `cancelada` | — |
| `en_pausa` | `diagnostico`, `en_progreso`, `esperando_repuesto`, `cancelada` | `diagnostico`, `en_progreso`, `esperando_repuesto`, `cancelada` | — |
| `lista_para_retirar` | `pagado`, `entregada` | `pagado` | a `pagado` solo con `paid_clp = total_clp` → si no, `{ ok: false, code: "balance_pending" }` |
| `pagado` | `lista_para_retirar`, `entregada` | — | `lista_para_retirar` solo por anulación de pago; `entregada` solo por Entrega |
| `entregada`, `cancelada` | — | — | — |

`cancelada` sigue con el permiso `orders.cancel`; todo lo demás con `orders.edit`.

### Flujos que cambian

| Flujo | Hoy | Desde este encargo |
|---|---|---|
| Recepción (`startReception` en `orders.ts`, `reception.ts`, `reception-continue.ts`, `intake.ts`, `photos.ts`) | crea `reservada`; al cerrar pasa a `recibida` y fija `received_at` | crea `creado`; al cerrar **no cambia el estado**, solo fija `received_at` (sin fila de historial de estado; la auditoría de recepción se mantiene). Todo lo que hoy pregunta `status === "reservada"` para "recepción sin terminar" pasa a `status === "creado" && received_at === null`; lo que pregunta `recibida` pasa a `creado && received_at !== null`. |
| Control de calidad (`qc.ts`, `control.astro`) | se entra en `control_calidad`; aprobado → `lista_para_retirar`, rechazado → `en_reparacion` | se entra en `en_progreso`; aprobado → `lista_para_retirar` (historial `en_progreso → lista_para_retirar`, mismo aviso "lista para retirar" por correo y WhatsApp); rechazado → queda en `en_progreso`, sin fila de historial de estado, con la auditoría `qc.rejected` de siempre. La regla de segunda persona y `qc_self_checked` no cambian. |
| Aprobación (`approvals.ts`) | aprobado → `en_reparacion`; rechazado → `trabajo_rechazado` | aprobado → `en_progreso`; rechazado → `cancelada`. Proponer un adicional sigue permitido desde `diagnostico`, `en_progreso` y `esperando_repuesto`. |
| Pagos (`payments.ts`) | — | si un pago deja `paid_clp = total_clp` y la orden está en `lista_para_retirar`, pasa a `pagado` en la misma transacción (historial con nota "Pago completo"). Si se anula un pago de una orden `pagado`, vuelve a `lista_para_retirar` en la misma transacción (historial con nota "Pago anulado"). En `entregada` no se anula, como hoy. |
| Entrega (`delivery.ts`, `entrega.astro`) | desde `lista_para_retirar` | desde `pagado`, o desde `lista_para_retirar` con saldo cero (en ese caso registra `lista_para_retirar → pagado` y luego `pagado → entregada`). Con saldo pendiente responde `invalid_status` como hoy. |
| Seguimiento público (`tracking.ts`, `/seguimiento/[token]`) | etiquetas actuales | etiquetas nuevas; `isReadyForPickup` es `lista_para_retirar` o `pagado`. La línea de tiempo muestra las filas viejas del historial con su etiqueta heredada. |

### Compatibilidad durante el expand

- `rules.ts` exporta `LEGACY_ORDER_STATUSES = ["reservada", "recibida", "en_reparacion", "control_calidad", "trabajo_rechazado"] as const`, `LEGACY_STATUS_MAP: Record<LegacyOrderStatus, OrderStatus>` (tabla de arriba) y `LEGACY_STATUS_LABELS` (las etiquetas de hoy).
- `normalizeOrderStatus(raw: string): OrderStatus` (nuevo/actual → igual; heredado → su destino; desconocido → lanza) y `statusLabel(raw: string): string` (nuevo → `STATUS_LABELS`; heredado → `LEGACY_STATUS_LABELS`; desconocido → el valor tal cual). Toda lectura de `work_orders.status` que decide algo (transiciones, accesos, `canAccessOrder`, ficha, listados, panel, seguimiento) pasa por `normalizeOrderStatus`; todo texto de estado que se muestra (incluido el historial y la línea de tiempo) pasa por `statusLabel`. Los filtros SQL por estado (`inArray`/`notInArray` en listados, panel, indicadores, informes, agenda) incluyen los alias heredados con un helper `withLegacyStatuses(statuses: readonly OrderStatus[]): string[]` para que una orden sin traspasar no desaparezca.
- `work_order_status_history` no se reescribe ni gana CHECK.

## Esquema

`src/server/db/schema-orders.ts`, solo `work_orders`:

- `work_orders_status_check`: los 10 estados nuevos **más** los 5 heredados (expand).
- `work_orders_delivered_paid_check`: `status not in ('pagado', 'entregada') or paid_clp = total_clp`.
- `work_orders_qc_check`: `status not in ('lista_para_retirar', 'pagado', 'entregada') or qc_approved_at is not null`.
- Valor por defecto de `status`, si existe: `creado`.

Luego `pnpm db:generate` (nunca editar `drizzle/` a mano ni `--custom`).

## Qué hacer

- **`src/server/taller/rules.ts`**: tablas de arriba, helpers de compatibilidad. Debe quedar < 400 líneas; si no cabe, mueve los estados a `src/server/taller/order-status-rules.ts` y reexpórtalos desde `rules.ts` sin cambiar los nombres exportados.
- **`src/server/taller/status.ts`**: `changeOrderStatus` con las condiciones extra (`reception_pending`, `balance_pending`) y `normalizeOrderStatus` sobre el estado bloqueado. Los nuevos códigos se traducen a texto en la ficha: "Termina la recepción antes de cambiar el estado." y "La orden tiene saldo pendiente.".
- **`src/server/taller/{orders,reception,reception-continue,intake,photos,qc,approvals,payments,delivery,delivery-notice,dashboard,reports,tracking,part-notice}.ts`, `src/server/taller/indicators-*.ts`, `src/server/admin/agenda.ts`, `src/server/whatsapp/order-notices.ts`, `src/server/library/{publish,rules}.ts` y `src/server/booking/create-booking.ts`**: reemplaza cada uso de estado de **orden** según las tablas. Revisa cada coincidencia antes de cambiarla (ver "No cambiar").
- **`scripts/orders-remap-status.ts`** (nuevo, patrón de `scripts/bg-backfill.ts`) y `"orders:remap-status"` en `package.json`: recorre `work_orders` con estado heredado y lo cambia a su destino (`LEGACY_STATUS_MAP`), por taller y en una transacción por taller, sin tocar `work_order_status_history`, `updated_at` sí. `--dry-run` no escribe. Imprime una línea JSON `{"pending":N,"remapped":{"<viejo>":n,…}}` sin datos personales. Sale 0 si quedó sin pendientes (o el dry-run no encontró), 1 si el dry-run encontró pendientes, 2 sin `DATABASE_URL` o sin conexión. Idempotente.
- **`src/pages/taller/ordenes/[id]/index.astro`** (398 líneas; debe quedar < 400): el desplegable sigue igual en forma, con las etiquetas nuevas, sin `cancelada` (va en el formulario "Cancelación", que ahora tiene un solo botón "Cancelar orden"). `statusHints` nuevos: `lista_para_retirar` "se completa en Control de calidad", `pagado` "se completa al pagar el saldo", `entregada` "se completa en Entrega". `nextStep`: `creado` sin `received_at` → "Ir a Recepción"; `esperando_aprobacion` → "Ir a Adicional"; `en_progreso` → "Ir a Control de calidad"; `lista_para_retirar` y `pagado` → "Ir a Entrega" (los pagos se registran en `entrega.astro`). "Tomar orden" con `creado` (recepción terminada) o `diagnostico`. Si no cabe, extrae la tarjeta "Estado de la orden" a `src/components/taller/OrderStatusCard.astro` (recibe props ya calculadas, no importa `src/server/**`).
- **Otras páginas de `src/pages/taller/ordenes/[id]/`** (`biblioteca`, `cierre`, `control`, `entrega`, `recepcion`, `lineas`) y `src/pages/admin/reservas/[id].astro`, `src/components/admin/BookingActions.astro`, `src/components/llave15/PlatformLanding.astro`: solo donde se refieren a estados de **orden**.
- **Estilos** (`src/styles/taller-components.css` y donde hoy viva `.status--<estado>`): clases `status--creado` (neutro, borde sólido), `status--en_progreso` (en curso, borde sólido), `status--en_pausa` (espera, borde punteado), `status--pagado` (listo, borde doble). Conserva las clases heredadas (las usa el historial). Solo variables existentes; ningún hex nuevo.

## No cambiar

- Estados de **otros dominios** que comparten palabras: reservas (`bookings.status`, incluida `cancelada`), compras (`recibida`, `PURCHASE_STATUSES`), ventas (`SALE_STATUSES`), biblioteca (sus propios estados y `diagnostico` como categoría si existe). Solo cambias `work_orders.status` y lo que lo lee.
- `work_order_status_history` y sus filas; `drizzle/` a mano; ningún otro CHECK ni tabla.
- Firmas exportadas fuera de lo descrito; reglas de precio, costos (regla 17), régimen `final`/`neto`, IVA, caja y stock.
- Diseño aprobado: la tarjeta de estado conserva su marcado y clases; ninguna isla nueva; ningún hex nuevo.
- Regla 14: ningún dato de un taller en `src/`.
- `.env` y secretos.

## Pruebas (primero, verlas fallar)

- **`tests/unit/order-status-rules.test.ts`** (nuevo): `ORDER_STATUSES` y etiquetas exactas de la tabla; cada destino de `MANUAL_TRANSITIONS` está en `ORDER_TRANSITIONS`; `normalizeOrderStatus` para los 5 heredados y que lanza con un desconocido; `statusLabel("en_reparacion") === "En reparación"`, `statusLabel("entregada") === "Retirada"`; `withLegacyStatuses(["creado"])` incluye `reservada` y `recibida`.
- **`tests/integration/order-status-flow.test.ts`** (nuevo, PGlite, sembrado como las pruebas de `status`/`qc` existentes): recepción crea `creado`, cerrar recepción fija `received_at` sin cambiar estado; `creado` sin recepción → `diagnostico` da `reception_pending`; QC aprobado en `en_progreso` → `lista_para_retirar`; QC rechazado deja `en_progreso`; pago que completa el saldo en `lista_para_retirar` → `pagado` con fila de historial; anular ese pago → `lista_para_retirar`; `lista_para_retirar` → `pagado` manual con saldo → `balance_pending`; entrega desde `pagado` → `entregada`; entrega desde `lista_para_retirar` con saldo cero registra dos filas de historial; rechazo por el enlace → `cancelada`; la base rechaza `pagado` con saldo y `lista_para_retirar` sin `qc_approved_at`; una orden con estado heredado `en_reparacion` se lista en "abiertas", se muestra como "En progreso" en la ficha y acepta `en_progreso → en_pausa`.
- **`tests/integration/orders-remap-status.test.ts`** (nuevo): siembra órdenes con los 5 estados heredados en dos talleres; `--dry-run` sale 1 y no escribe; la corrida real deja los destinos de la tabla, no toca el historial, es idempotente (segunda corrida sale 0 con `pending: 0`) y no imprime correos ni teléfonos.
- **`tests/integration/*-isolation.test.ts`**: siguen en verde; agrega a `order-status-flow.test.ts` un caso donde el script de un taller no toca órdenes del otro.
- **Pruebas existentes**: actualiza solo los estados y etiquetas según la tabla (autorizado arriba). En el reporte lista cada archivo de prueba modificado con una línea de qué cambió. Si una prueba existente falla por otra razón, detente y reporta con el diff.
- **`e2e/`** (`global-setup.ts`, `orden-mecanico.spec.ts` y los specs que usen estados o etiquetas): mismos cambios. Codex no los corre; Claude corre `pnpm test:tablet`.

## Documentación

- Decisión BG-D54 en `blueprints/bike-garage/blueprint.md` §20.3.
- `README.md`, "Operación del taller": la lista de estados de la orden con la tabla de etiquetas y la frase "Se paga antes de retirar: la orden pasa a Pagado al completar el saldo y recién entonces se entrega."
- `docs/ventanas/fx-04-estados.md` (nuevo): pasos de Replit en orden — publicar; en el shell de producción `DATABASE_URL="$PRODUCTION_DATABASE_URL" pnpm orders:remap-status --dry-run` (ver pendientes), luego sin `--dry-run`, luego `--dry-run` otra vez debe imprimir `"pending":0`; solo entonces se pide el encargo de contract.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0.
2. Claude: `pnpm db:migrate && pnpm db:check` (base dev), `pnpm orders:remap-status --dry-run`, `pnpm gate` → exit 0, y capturas 820×1180 de la ficha con el desplegable.

## Reporte

Archivo por archivo: qué cambió y por qué; archivo generado en `drizzle/`; pruebas nuevas y pruebas modificadas (una línea cada una); cualquier coincidencia de estado que dejaste sin tocar por ser de otro dominio; lo que no pudiste resolver.
