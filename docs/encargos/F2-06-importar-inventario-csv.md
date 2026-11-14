# F2-06 · Import the initial inventory from CSV

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

Importación inicial del inventario desde CSV (FASE2 §3.1, F2-D19): script `scripts/inventory-import.ts` y su entrada `pnpm inventory:import <archivo.csv> <correo> [--dry-run]` en package.json. Todo o nada: si una fila es inválida no se carga ninguna; acepta `,` o `;` como separador, sin comillas; cada producto con stock inicial entra por `applyStockMovement` (movimiento con referencia `import`), nunca con un update directo. Sale 0 si importó, 1 si el CSV es inválido y 2 si no hay conexión. El CSV real vive fuera del repo: no lo inventes ni lo commitees.

Es la tarea `E1-T7` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E1-T7` de `blueprints/vector-taller-f2/epics/01-base-inventario.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/taller/inventory-import.ts`
- `scripts/inventory-import.ts`
- `package.json`
- `tests/integration/inventory-import.test.ts`

## Criterios de aceptación

1. WHEN `importInventory` recibe un CSV válido de 3 filas con encabezado `sku,nombre,categoria,costo,precio,stock,minimo,codigo_barras,serie` THE SYSTEM SHALL crear 3 productos y, por cada `stock` mayor que 0, un `stock_movements` `ajuste` con nota `Inventario inicial`, en una sola transacción
2. WHEN alguna fila es inválida o repite un `sku` existente THE SYSTEM SHALL devolver cada número de línea con su error y no escribir ninguna fila
3. WHEN el encabezado usa `;` como separador THE SYSTEM SHALL leer el archivo igual que con `,`
4. WHEN el correo indicado no es de un usuario activo `owner` o `admin` THE SYSTEM SHALL devolver `ok: false` con código `forbidden` sin escribir
5. WHEN `node scripts/inventory-import.ts` corre sin argumentos THE SYSTEM SHALL salir con código 2 y un mensaje de uso, sin conectarse a la base
6. WHEN se lee `package.json` THE SYSTEM SHALL tener el script `inventory:import` igual a `node --env-file-if-exists=.env scripts/inventory-import.ts`

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).


## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/inventory-import.test.ts   # expect: exit 0, 0 failed
node scripts/inventory-import.ts; test $? -eq 2   # expect: código 2 (uso) → la línea sale 0
test "$(node -p "require('./package.json').scripts['inventory:import']")" = "node --env-file-if-exists=.env scripts/inventory-import.ts"   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
