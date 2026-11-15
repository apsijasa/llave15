# BT-16 · Chunk indexing and scoped retrieval

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Paso BT-16 de la fase Biblioteca (`blueprints/vector-biblioteca/BIBLIOTECA.md`, decisiones BT-D1 a BT-D15; arquitectura en `blueprints/vector-biblioteca/blueprint.md`). Los pasos anteriores ya están en `main` y commiteados (tags `bt-NN`).

Es la tarea `E5-T1` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta —firmas, reglas, textos de pantalla y pruebas— es el bloque `E5-T1` de `blueprints/vector-biblioteca/epics/05-ia.md`: **léelo completo**, junto con las secciones comunes del inicio de esa épica (stack, reglas transversales, interfaz del taller).

## Lee antes

`AGENTS.md`; `.claude/rules/taller-domain.md` (aplica por analogía a `src/server/library/**`: `db`, `actor`, `now`; permiso primero; auditoría en la transacción; error centinela) y `.claude/rules/server-api.md`; `.claude/rules/database.md` (scripts) y el patrón de `scripts/f2-check.ts`; y como patrón y contrato: `src/server/library/chunks.ts`, `src/server/library/search.ts`, `src/server/taller/status.ts#canAccessOrder`, `src/server/db/schema-payments.ts` (`bike_components`), `scripts/library-import.ts`. Relee cada archivo que vas a tocar (otros pasos pudieron cambiarlo).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, las pruebas del Verify, `pnpm test` y `pnpm build`. `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/library/chunks.ts`
- `src/server/library/retrieval.ts`
- `scripts/library-import.ts`
- `tests/unit/library-chunks.test.ts`
- `tests/integration/library-retrieval.test.ts`

## Criterios de aceptación

1. WHEN `chunkText` recibe Markdown largo THE SYSTEM SHALL devolver trozos ≤ 1200 caracteres cortados en encabezados o párrafos con `section` en metadatos
2. WHEN `retrieve` recibe una pregunta THE SYSTEM SHALL devolver solo trozos `global` de versiones publicadas, ordenados por exactitud de código, `ts_rank`, fuente oficial y vigencia
3. WHEN `retrieve` recibe `orderId` de otra sucursal o de una orden no accesible al mecánico THE SYSTEM SHALL devolver `private: null` y `code: 'forbidden'` sin exponer la existencia de la orden
4. WHEN la orden es accesible THE SYSTEM SHALL incluir bici, componentes, diagnósticos previos y notas del taller de esa orden

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env`, secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada (BT-D7).
- Firmas exportadas existentes, rutas existentes, tokens de diseño, `src/styles/global.css`. Ninguna isla nueva. Ningún hex nuevo.
- `src/server/library/**` nunca escribe en `work_orders`, líneas, pagos, aprobaciones, stock ni estados (BT-D10).
- Ningún texto con el nombre del taller escrito a mano (`SITE.name`). Importaciones relativas con `.ts`, `import type`, sin `enum`, archivos < 400 líneas, funciones < 50, nunca `new Date()` en `src/server/**`, nunca `db.query.*`.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/unit/library-chunks.test.ts tests/integration/library-retrieval.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
