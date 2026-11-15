# BT-04 · Paquete de contenido, importación idempotente y siembra inicial

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Cuarto paso de la fase Biblioteca (decisión BT-D8: el conocimiento global viaja como paquete JSON versionado, importado de forma idempotente por claves estables; BT-D9: artículos con versiones inmutables). BT-01 y BT-02 dejaron las 24 tablas; BT-03 dejó `rules.ts` y `access.ts`. Ahora se crea `src/server/library/content-pack.ts` (zod del paquete + `importLibraryPack`), el paquete inicial `src/data/library/pack.json` con identificadores públicos y enlaces oficiales **sin inventar ningún valor técnico**, y el script `pnpm library:import [--dry-run] [ruta]`.

Es la tarea `E1-T4` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta es el bloque `E1-T4` de `blueprints/vector-biblioteca/epics/01-fundacion.md`: léelo completo, incluido el contenido exacto que debe traer `pack.json`.

## Lee antes

`AGENTS.md`; `.claude/rules/database.md` (solo constructor de consultas Drizzle o `sql` parametrizado; nunca `db.query.*`); los cuatro archivos `src/server/db/schema-library-*.ts`; `src/server/library/rules.ts`; `src/server/taller/inventory-import.ts` y `scripts/inventory-import.ts` (patrón de importación con `--dry-run` y códigos de salida); `scripts/f2-check.ts` (patrón de salida 2 cuando no conecta); `tests/integration/inventory-import.test.ts`.

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero.** Sin commit, tag ni push. Sandbox sin red: corre `pnpm format`, `pnpm check`, `pnpm test tests/integration/library-pack.test.ts`, `pnpm test` y `pnpm build`. El script contra la base lo corre la coordinadora.

## Archivos (máximo estos)

- `src/server/library/content-pack.ts` (nuevo)
- `src/data/library/pack.json` (nuevo)
- `scripts/library-import.ts` (nuevo)
- `package.json` (solo el script `library:import`)
- `tests/integration/library-pack.test.ts` (nuevo)

## Criterios de aceptación

1. WHEN se valida `pack.json` con `libraryPackSchema` THE SYSTEM SHALL aceptarlo, y el paquete trae exactamente lo que lista el bloque E1-T4: 3 fabricantes, 8 familias (una por categoría), 6 modelos con una variante cada uno, 2 fuentes, 4 documentos `enlace`, especificaciones `sin_dato_verificado` sin dígitos en `valueText`, 3 herramientas/consumibles y 1 artículo con versión 1.
2. WHEN `importLibraryPack` corre dos veces con el mismo paquete THE SYSTEM SHALL dejar los mismos conteos y, la segunda vez, `created` en 0 para todo.
3. WHEN corre con `dryRun: true` THE SYSTEM SHALL no dejar filas y devolver el resumen de altas (error centinela que revierte la transacción, traducido afuera).
4. WHEN una referencia por clave no existe en el paquete THE SYSTEM SHALL devolver `{ ok: false, code: "validation_error", issues }` sin tocar la base.
5. WHEN el artículo se importa THE SYSTEM SHALL quedar `publicado` con `current_version_id` a la versión 1, `published_at = now`, `content_hash` sha256 del contenido y un `publication_events` `import` cuando hay `actorId`.
6. WHEN `node scripts/library-import.ts` corre con `DATABASE_URL` inalcanzable THE SYSTEM SHALL salir 2 con `No se pudo conectar`; con un paquete inválido, salir 1 listando los issues; `package.json` tiene `library:import`.

## No cambiar

- Esquema ni `drizzle/`. `rules.ts` y `access.ts`.
- Ninguna prueba existente. `.env*`, `.claude/settings.json`.
- Nada de red dentro de la transacción; `now` como argumento (el script pasa `new Date()`; `src/server/**` nunca).
- Importaciones relativas con `.ts`; `import type`; sin `enum`; archivos < 400 líneas (si `content-pack.ts` crece, parte la validación cruzada en `content-pack-schema.ts` y decláralo en el reporte); nombre del taller nunca literal.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/library-pack.test.ts   # expect: exit 0, 0 failed
out="$(DATABASE_URL=postgres://127.0.0.1:1/x node scripts/library-import.ts 2>&1)"; test $? -eq 2 && printf '%s' "$out" | grep -q 'No se pudo conectar'   # expect: exit 0
pnpm library:import --dry-run && pnpm library:import && pnpm library:import   # expect: exit 0 tres veces
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas, conteos del paquete, resultado de `format`, `check`, `test` y `build`, desviaciones con motivo.
