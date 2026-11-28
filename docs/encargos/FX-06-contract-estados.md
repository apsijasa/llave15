Estados de la orden de trabajo: contract (retiro de los estados heredados)

## Contexto y autorización (Andrés, 27-11-2026)

FX-04 (`docs/encargos/FX-04-estados-de-la-orden.md`, decisión BG-D54) dejó la orden con diez estados nuevos, pero en modo expand. Hoy siguen cuatro piezas heredadas:

- `work_orders_status_check` (`src/server/db/schema-orders.ts`) acepta los 10 estados nuevos **y** los 5 heredados: `reservada`, `recibida`, `en_reparacion`, `control_calidad` y `trabajo_rechazado`.
- `src/server/taller/rules.ts` exporta `LEGACY_ORDER_STATUSES`, `LegacyOrderStatus`, `LEGACY_STATUS_MAP`, `LEGACY_STATUS_LABELS`, `normalizeOrderStatus` (traduce un heredado a su destino), `statusLabel` y `withLegacyStatuses` (suma los alias a los filtros SQL).
- `scripts/orders-remap-status.ts` y el script `orders:remap-status` de `package.json` traspasan las órdenes viejas.
- Las clases `.status--<heredado>` siguen en `src/styles/llave15.css` y `src/styles/taller-components.css`.

El 27-11-2026 `pnpm orders:remap-status` dejó `"pending":0` en la base dev de Replit y en producción, así que ninguna orden conserva un estado heredado. Este encargo es el **contract**:

- El CHECK queda solo con los 10 estados nuevos.
- El código deja de traducir y filtrar alias.
- El script de traspaso se retira.

El historial (`work_order_status_history`) **no se reescribe** y conserva sus valores viejos, que se siguen mostrando con su etiqueta heredada. Por eso `LEGACY_STATUS_LABELS` y `statusLabel` se quedan.

Andrés autoriza por escrito (27-11-2026, esta decisión) **modificar o borrar solo estas pruebas existentes**, y solo en los casos que dependen de una orden con estado heredado o del script de traspaso:

- `tests/unit/order-status-rules.test.ts`
- `tests/integration/order-status-flow.test.ts`
- `tests/integration/orders-remap-status.test.ts` (se borra entera junto con el script)

Ningún otro valor esperado cambia.

Regístralo en `blueprints/bike-garage/blueprint.md` §20.3 agregando al final del texto de **BG-D54** (misma fila) esta frase:

> Contract hecho el 2026-11-27 (encargo `docs/encargos/FX-06-contract-estados.md`, rama `feat/estados-contract`), después de `"pending":0` en producción: el CHECK solo admite los diez estados nuevos, se retiran `LEGACY_STATUS_MAP`, `withLegacyStatuses` y `pnpm orders:remap-status`; `LEGACY_STATUS_LABELS` queda solo para mostrar el historial.

En la última columna de esa fila, reemplaza "Contract después del traspaso en producción" por "Contract hecho (FX-06)".

## Lee antes

`AGENTS.md`; `.claude/rules/database.md`; `.claude/rules/taller-domain.md`; `.claude/rules/taller-ui.md`; `.claude/rules/ui-design.md`; `docs/encargos/FX-04-estados-de-la-orden.md` (contexto, no se repite).

## Rama y reparto

- Rama `feat/estados-contract`, creada desde `main` (`80aa806` o posterior) con el árbol limpio.
- Pruebas primero, en rojo.
- `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push.
- Corre `pnpm db:generate` y anota en el reporte el archivo generado (debería ser `drizzle/0047_*.sql`). **No** corras `pnpm db:migrate`, `db:check`, `test:tablet`, `smoke` ni `gate`: el sandbox no tiene red.
- Escribe primero y verifica una vez al final.

## Reglas de negocio decididas

| Pieza | Hoy (expand) | Desde este encargo |
|---|---|---|
| `work_orders_status_check` | 10 nuevos + 5 heredados | solo los 10 de `ORDER_STATUSES` |
| `normalizeOrderStatus(raw)` | nuevo → igual; heredado → destino; desconocido → lanza | nuevo → igual; **cualquier otro valor lanza** `Error("Estado de orden desconocido.")`. Conserva el nombre y la firma para no tocar sus ~25 llamadas. |
| `statusLabel(raw)` | nuevo → `STATUS_LABELS`; heredado → `LEGACY_STATUS_LABELS`; otro → tal cual | sin cambio (lo usan el historial de la ficha y la línea de tiempo de `/seguimiento/[token]`) |
| `LEGACY_ORDER_STATUSES`, `LegacyOrderStatus`, `LEGACY_STATUS_LABELS` | exportados | se quedan, solo para `statusLabel` |
| `LEGACY_STATUS_MAP` | exportado | se borra |
| `withLegacyStatuses(statuses)` | envuelve 9 filtros SQL | se borra; cada llamada pasa el arreglo de estados directo (ver "Qué hacer") |
| `scripts/orders-remap-status.ts`, `"orders:remap-status"` | existen | se borran |
| Clases CSS de los heredados | existen | se borran, **salvo `.status--recibida`**, que la usa `PURCHASE_STATUSES` en Compras |

## Esquema

En `src/server/db/schema-orders.ts`, solo el CHECK `work_orders_status_check` de `work_orders` cambia: queda con los 10 valores de `ORDER_STATUSES`, en ese orden.

- `work_orders_delivered_paid_check`, `work_orders_qc_check` y el valor por defecto `creado` no cambian.
- `work_order_status_history` no gana CHECK.

Es un cambio destructivo: va solo en su generación, sin nada aditivo. Después, `pnpm db:generate` (nunca editar `drizzle/` a mano ni `--custom`).

## Qué hacer

- **`src/server/db/schema-orders.ts`**: el CHECK de arriba.
- **`src/server/taller/rules.ts`**:
  - Borra `LEGACY_STATUS_MAP` y `withLegacyStatuses`.
  - `normalizeOrderStatus` según la tabla.
  - Comentario de una línea sobre `LEGACY_ORDER_STATUSES` y `LEGACY_STATUS_LABELS`: "Solo para mostrar filas viejas del historial (BG-D54)."
- **Llamadas a `withLegacyStatuses`**: reemplaza cada una por el arreglo directo, convertido a `[...ARREGLO]` si el tipo `readonly` no calza con `inArray`/`notInArray`. Son:
  - `src/server/taller/status.ts:151` y `:172`
  - `src/server/taller/dashboard.ts:52` y `:58`
  - `src/server/taller/maintenance.ts:41`
  - `src/server/taller/delivery-date.ts:81`
  - `src/server/taller/indicators.ts:217`
  - `src/server/shops/platform-shops.ts:50`
  - `src/server/whatsapp/order-notices.ts:48`

  Quita los `import` que queden sin uso.
- **Resto de `src/`**: busca `LEGACY_STATUS_MAP` y `withLegacyStatuses` con `grep -rn`; al terminar no debe quedar ninguna coincidencia. Las llamadas a `normalizeOrderStatus` y `statusLabel` se quedan como están.
- **`scripts/orders-remap-status.ts`**: bórralo, y también la línea `"orders:remap-status"` de `package.json`.
- **`src/styles/llave15.css`**: quita de los selectores agrupados `.l15 .status--reservada`, `.l15 .status--en_reparacion`, `.l15 .status--control_calidad` y `.l15 .status--trabajo_rechazado`. **Deja `.l15 .status--recibida`.**
- **`src/styles/taller-components.css`**: quita `.taller .status--reservada` (borde y rayado), `.taller .status--reservada::before`, `.taller .status--en_reparacion::before`, `.taller .status--control_calidad::before` y `.taller .status--trabajo_rechazado::before`. Quita también esos tres nombres de los selectores agrupados de borde (`dotted`, `3px double`). **Deja `.taller .status--recibida::before`.** Ningún hex nuevo.

## No cambiar

- `statusLabel`, `LEGACY_STATUS_LABELS` y `LEGACY_ORDER_STATUSES` (el historial depende de ellos).
- `work_order_status_history` y sus filas.
- `ORDER_STATUSES`, `STATUS_LABELS`, `ORDER_TRANSITIONS`, `MANUAL_TRANSITIONS`, `TERMINAL_STATUSES`, `MECHANIC_UNASSIGNED_ACCESS_STATUSES` y `LOAD_EXCLUDED_STATUSES`.
- Los otros dos CHECK de `work_orders`.
- Los estados de otros dominios: compras (`recibida`), ventas, reservas y biblioteca.
- `e2e/`: el `?hecho=recibida` de `firma-rotacion.spec.ts` y `recepcion-completa.spec.ts` es un parámetro de la URL de recepción, no un estado.
- `drizzle/` a mano, `.env` y secretos.
- Regla 14: ningún dato de un taller en `src/`.
- Firmas exportadas fuera de lo descrito.

## Pruebas (primero, verlas fallar)

- **`tests/integration/order-status-contract.test.ts`** (nuevo, PGlite, sembrado como `order-status-flow.test.ts`):
  - La base rechaza un `update` de `work_orders.status` a cada uno de los 5 heredados (violación de `work_orders_status_check`).
  - Una fila de `work_order_status_history` con `to_status = 'en_reparacion'` se sigue insertando, y la línea de tiempo de seguimiento la muestra como "En reparación".
- **`tests/unit/order-status-rules.test.ts`** (modificación autorizada):
  - Los casos de `normalizeOrderStatus` con heredados pasan a esperar que lance.
  - `statusLabel` sigue devolviendo las etiquetas heredadas.
  - Agrega que `rules` ya no exporta `LEGACY_STATUS_MAP` ni `withLegacyStatuses` (`expect("withLegacyStatuses" in rules).toBe(false)`).
- **`tests/integration/order-status-flow.test.ts`** (modificación autorizada):
  - Borra los casos que ponen la orden en `en_reparacion` (hoy en las líneas 255 y 266).
  - En el caso de seguimiento (línea 283), deja la orden en `en_progreso` y mantén la fila de historial `en_reparacion`.
- **`tests/integration/orders-remap-status.test.ts`**: bórralo entero.
- Todas las demás pruebas, incluidas las `*-isolation.test.ts`, deben pasar **sin cambios**. Si alguna falla, detente y reporta con el diff.

## Documentación

- BG-D54 en `blueprints/bike-garage/blueprint.md`, como se indica arriba.
- **`.claude/rules/ui-design.md`**, línea de estados: reemplaza la frase "Los estados de orden heredados (…) conservan su clase hasta el contract de BG-D54, solo para el historial." por "Los estados de orden heredados ya no tienen clase (contract FX-06); el historial los muestra solo con su etiqueta."
- **`.claude/rules/database.md`**: agrega el contract FX-06 (`work_orders_status_check`, BG-D54) a la lista de excepciones declaradas de cambios destructivos. Agrega también a la línea de "Cambios destructivos" que, antes de publicar el contract de estados, `pnpm orders:remap-status --dry-run` debió imprimir `"pending":0` en producción, con la versión anterior al contract.
- **`docs/ventanas/fx-04-estados.md`**: al final, una línea: "Hecho el 27-11-2026 (`"pending":0`). Contract: `docs/ventanas/fx-06-contract-estados.md`."
- **`docs/ventanas/fx-06-contract-estados.md`** (nuevo), con estos pasos en orden:
  1. **En Replit, antes de traer el contract**, con el código todavía en `main` anterior, en la Shell: `read -r -s` de la conexión de producción, `DATABASE_URL="$PRODUCTION_DATABASE_URL" corepack pnpm@12.4.2 orders:remap-status --dry-run`. Debe imprimir `"pending":0`; si no, **no seguir**. Después, `unset PRODUCTION_DATABASE_URL`.
  2. `git pull --rebase origin main`, `corepack pnpm@12.4.2 install --frozen-lockfile`, `corepack pnpm@12.4.2 db:migrate`, `corepack pnpm@12.4.2 db:check`, `rm -rf node_modules`.
  3. Publicar. La publicación propaga el CHECK nuevo a producción y falla si quedara una orden con un estado heredado.
  4. Revisar `/taller/ordenes` y la ficha de una orden con historial viejo.

  En el Mac, la sesión coordinadora corre `pnpm db:migrate && pnpm db:check` contra la base dev (ya en `"pending":0` desde el 26-11-2026).

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0, y `grep -rn "withLegacyStatuses\|LEGACY_STATUS_MAP\|orders-remap-status\|orders:remap-status" src scripts tests package.json` sin coincidencias.
2. Claude, en el Mac:
   - `pnpm orders:remap-status --dry-run` sobre la base dev **antes** de cambiar de rama, que debe dar `"pending":0`.
   - Luego en la rama: `pnpm db:migrate && pnpm db:check` y `pnpm gate` → exit 0.
   - Captura 820×1180 de la ficha de una orden con una fila de historial heredada.

## Reporte

- Archivo por archivo: qué cambió y por qué.
- El archivo generado en `drizzle/`, y si contiene algo más que el `DROP`/`ADD` del CHECK.
- Cada prueba nueva, modificada o borrada, una línea cada una.
- Las clases CSS borradas y la que quedó (`status--recibida`).
- Lo que no pudiste resolver.
