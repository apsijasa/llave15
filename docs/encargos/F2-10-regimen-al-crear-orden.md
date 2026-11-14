# F2-10 · Copy branch pricing mode on order creation

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Al crear una orden de trabajo, su pricing_mode se copia de branches.new_order_pricing_mode y nunca vuelve a cambiar (No negociable 18). orders.ts ya está cerca de 400 líneas: extrae la creación (numeración con allocateOrderNumber y régimen) a order-creation.ts con una función allocateNewOrder, sin cambiar la firma de las funciones exportadas de orders.ts. Las dos inserciones de work_orders (recepción y garantía) usan esa función. Con el interruptor en 'final' (por defecto en todas las pruebas y fixtures) nada cambia.

Es la tarea `E2-T2` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E2-T2` de `blueprints/vector-taller-f2/epics/02-precios-netos.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/taller/order-creation.ts`
- `src/server/taller/orders.ts`
- `src/pages/taller/catalogo/index.astro`
- `tests/integration/pricing-switch.test.ts`

## Criterios de aceptación

1. WHEN la sucursal tiene `new_order_pricing_mode = 'neto'` y se inicia una recepción o se abre una garantía THE SYSTEM SHALL crear la orden con `pricing_mode = 'neto'`
2. WHEN la sucursal está en `final` THE SYSTEM SHALL crear las órdenes con `pricing_mode = 'final'` como hoy
3. WHEN `setNewOrderPricingMode` cambia el régimen THE SYSTEM SHALL dejar intactos `pricing_mode`, `total_clp`, `subtotal_clp` y `vat_clp` de las órdenes existentes y registrar `pricing.mode_changed` con el régimen anterior y el nuevo
4. WHEN `reception` o `mechanic` llaman `setNewOrderPricingMode` THE SYSTEM SHALL devolver `ok: false` con código `forbidden` sin cambiar la sucursal
5. WHEN el dueño hace POST del régimen en `/taller/catalogo` THE SYSTEM SHALL responder 303 a `/taller/catalogo?hecho=pricing`
6. WHEN se cuentan las líneas de `src/server/taller/orders.ts` THE SYSTEM SHALL tener menos de 400

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/pricing-switch.test.ts tests/integration/reception.test.ts tests/integration/warranty.test.ts tests/integration/catalog.test.ts   # expect: exit 0, 0 failed
grep -q 'export async function allocateOrderNumber' src/server/taller/order-creation.ts   # expect: exit 0
test "$(wc -l < src/server/taller/orders.ts | tr -d ' ')" -lt 400   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
