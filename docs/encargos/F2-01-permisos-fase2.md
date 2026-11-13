# F2-01 · Add the seven phase-2 permissions

## Contexto (Andrés, fase 2 aprobada el 13-11-2026, decisión 55)

La fase 2 agrega siete acciones de permiso (FASE2.md §2.1): inventario visible para todos, ventas y caja para dueño, administración y recepción, y ajustes, compras, gastos y costos solo para dueño y administración. La decisión 55 autoriza editar `tests/unit/permissions.test.ts` en este paso, solo en lo que el bloque de la épica indica.

Es la tarea `E1-T2` de `blueprints/vector-taller-f2/tasks.json`. La especificación exacta es el bloque `E1-T2` de `blueprints/vector-taller-f2/epics/01-base-inventario.md`: léelo completo, junto con las **reglas transversales** del inicio de esa épica.

## Lee antes

`AGENTS.md`, las reglas de `.claude/rules/` que nombra el bloque de la épica, y cada archivo que vas a tocar (reléelo: los conteos de líneas del blueprint son orientativos).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, `pnpm test` y `pnpm build`; `db:generate`, `db:migrate`, `db:check`, `test:tablet` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/auth/permissions.ts`
- `tests/unit/permissions.test.ts`

## Criterios de aceptación

1. WHEN se lee `ACTIONS` THE SYSTEM SHALL exponer 36 acciones sin duplicados: las 29 de la fase 1 más `inventory.view`, `inventory.adjust`, `purchases.manage`, `sales.record`, `expenses.record`, `cash.open_close` y `costs.view`
2. WHEN se evalúa `can(role, "inventory.view")` THE SYSTEM SHALL devolver `true` para `owner`, `admin`, `reception` y `mechanic`
3. WHEN se evalúan `sales.record` y `cash.open_close` THE SYSTEM SHALL devolver `true` para `owner`, `admin` y `reception`, y `false` para `mechanic`
4. WHEN se evalúan `inventory.adjust`, `purchases.manage`, `expenses.record` y `costs.view` THE SYSTEM SHALL devolver `true` solo para `owner` y `admin`
5. WHEN se evalúa cualquiera de las 29 acciones de la fase 1 THE SYSTEM SHALL devolver lo mismo que antes del cambio

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env` ni secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada.
- Firmas exportadas existentes, rutas existentes, tokens de diseño. Ningún texto con el nombre del taller escrito a mano (`SITE.name`).
- Ninguna acción existente ni sus roles.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/unit/permissions.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo, líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
