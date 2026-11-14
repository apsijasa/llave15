# F2-08 · Add supplier and purchase pages

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Pantallas de proveedores y compras en /taller: /taller/proveedores (lista, alta y edición) y /taller/compras con su detalle /taller/compras/[id] (crear borrador, agregar líneas, enviar, recibir y anular con motivo). Solo purchases.manage; los costos solo con costs.view. Páginas Astro del servidor con formularios POST, sin islas nuevas, tokens existentes, objetivos táctiles de al menos 48px, estados con forma y texto. requireAdmin → can → zod → src/server/taller/**, con isAllowedOrigin en los POST. Agrega los enlaces al grupo de menú 'Inventario y caja' de TallerLayout.astro. Si el formulario de producto (F2-04) pedía el identificador del proveedor a mano, este paso puede cambiarlo por una lista desplegable solo si el bloque de la épica lo incluye; si no, no lo toques.

Es la tarea `E1-T9` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E1-T9` de `blueprints/vector-taller-f2/epics/01-base-inventario.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/pages/taller/proveedores/index.astro`
- `src/pages/taller/compras/index.astro`
- `src/pages/taller/compras/[id].astro`
- `src/layouts/TallerLayout.astro`
- `tests/integration/compras-page.test.ts`

## Criterios de aceptación

1. WHEN el dueño hace POST en `/taller/compras` con un proveedor THE SYSTEM SHALL crear la compra en `borrador` y responder 303 a `/taller/compras/<id>`
2. WHEN el dueño agrega una línea y luego recibe la compra con tipo y folio en `/taller/compras/<id>` THE SYSTEM SHALL responder 303 a `?hecho=receive` y la página SHALL mostrar `Recibida` y el stock nuevo del producto
3. WHEN `reception` o `mechanic` piden `/taller/compras`, `/taller/compras/<id>` o `/taller/proveedores` THE SYSTEM SHALL responder 403
4. WHEN un POST llega a esas páginas con un `Origin` ajeno THE SYSTEM SHALL responder 403 sin escribir filas
5. WHEN se lee `src/layouts/TallerLayout.astro` THE SYSTEM SHALL contener los enlaces `/taller/proveedores` y `/taller/compras` con la acción `purchases.manage`

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/compras-page.test.ts   # expect: exit 0, 0 failed
grep -q '"/taller/compras"' src/layouts/TallerLayout.astro && grep -q '"/taller/proveedores"' src/layouts/TallerLayout.astro && grep -q '"purchases.manage"' src/layouts/TallerLayout.astro   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
